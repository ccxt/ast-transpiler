import fs from 'fs';
import path from 'path';
import * as os from 'os';
import { Transpiler, installCcxtGoLocalTypes } from '../src/transpiler';

const HEAD =
    'type Int = number | undefined;\n' +
    'export class ex {\n' +
    '    parseToInt (x: any): number { return 0; }\n';
const print = (body: string): string => {
    const dir = fs.mkdtempSync (path.join (os.tmpdir (), 'h26g21-'));
    fs.mkdirSync (path.join (dir, 'ts', 'src'), { recursive: true });
    fs.writeFileSync (path.join (dir, 'ts', 'src', 'ex.ts'), HEAD + body + '}\n');
    const cwd = process.cwd ();
    try {
        process.chdir (dir);
        const x = new Transpiler ({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 } } });
        installCcxtGoLocalTypes (x.goTranspiler);
        return x.transpileGoByPath ('ts/src/ex.ts').content;
    } finally {
        process.chdir (cwd);
        fs.rmSync (dir, { recursive: true, force: true });
    }
};
const fn = (pre: string, decl: string): string =>
    '    f (limit: Int = undefined) {\n' + pre + '        ' + decl + '\n        const v = this.parseToInt (z);\n        return v;\n    }\n';

describe ('h26-g21: a const boolean alias of a nil test proves the pointer arm of a numeric ternary', () => {
    test ('hasLimit ? limit : 0 prints an int64 if/else with a deref on the proven branch', () => {
        const out = print (fn ('        const hasLimit = (limit !== undefined);\n', 'const z = hasLimit ? limit : 0;'));
        expect (out).toContain ('var z int64\n');
        expect (out).toContain ('\tif hasLimit {\n\t\tz = *limit\n\t} else {\n\t\tz = 0\n\t}');
        expect (out).not.toContain ('func() any {');
    });
    test ('negated alias proves the else arm', () => {
        const out = print (fn ('        const noLimit = (limit === undefined);\n', 'const z = noLimit ? 0 : limit;'));
        expect (out).toContain ('\t\tz = *limit\n');
    });
    test ('the alias on the wrong branch keeps the box (no deref of a possibly nil pointer)', () => {
        const out = print (fn ('        const hasLimit = (limit !== undefined);\n', 'const z = hasLimit ? 0 : limit;'));
        expect (out).not.toContain ('*limit');
        expect (out).toContain ('var z any = func() any {');
    });
    test ('a let alias keeps the box', () => {
        const out = print (fn ('        let hasLimit = (limit !== undefined);\n', 'const z = hasLimit ? limit : 0;'));
        expect (out).not.toContain ('*limit');
    });
    test ('a written pointer keeps the box', () => {
        const out = print (fn ('        const hasLimit = (limit !== undefined);\n        if (hasLimit) {\n            limit = undefined;\n        }\n', 'const z = hasLimit ? limit : 0;'));
        expect (out).not.toContain ('*limit');
    });
    test ('an alias over another name keeps the box', () => {
        const out = print ('    f (limit: Int = undefined, since: Int = undefined) {\n        const hasSince = (since !== undefined);\n        const z = hasSince ? limit : 0;\n        const v = this.parseToInt (z);\n        return v;\n    }\n');
        expect (out).not.toContain ('*limit');
    });
});
