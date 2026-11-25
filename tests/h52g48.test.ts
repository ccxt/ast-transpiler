import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler, installCcxtGoLocalTypes } from '../src/transpiler';

// a `string[]` local whose pushes include `this.m (..)` declared `string`: the list stays []string,
// so its element reads need no SafeStringPtr box
describe ('h52g48: string[] local fed by a string-returning method', () => {
    const print = (body: string): string => {
        const dir = fs.mkdtempSync (path.join (process.env.TMPDIR || os.tmpdir (), 'h52g48-'));
        fs.mkdirSync (path.join (dir, 'ts', 'src'), { 'recursive': true });
        fs.writeFileSync (path.join (dir, 'ts', 'src', 'ex.ts'), 'type Dict = { [key: string]: any };\ntype Str = string | undefined;\nclass base {\n    id: string = \'\';\n}\nexport class ex extends base {\n' + body + '}\n');
        const cwd = process.cwd ();
        try {
            process.chdir (dir);
            const t: any = new Transpiler ({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 } } });
            installCcxtGoLocalTypes (t.goTranspiler);
            return t.transpileGoByPath ('ts/src/ex.ts').content;
        } finally {
            process.chdir (cwd);
            fs.rmSync (dir, { 'recursive': true, 'force': true });
        }
    };
    const fn = (ret: string, body = '        return \'#\' + n;\n') => '    parseCoin (n: string): ' + ret + ' {\n' + body + '    }\n'
        + '    pick (input: string, table: Dict): Dict {\n'
        + '        const candidates: string[] = [ \'a\' ];\n'
        + '        candidates.push (this.parseCoin (\'b\'));\n'
        + '        for (let i = 0; i < candidates.length; i++) {\n'
        + '            const key = candidates[i];\n'
        + '            if (key in table) {\n'
        + '                return table[key];\n'
        + '            }\n'
        + '        }\n'
        + '        return {};\n'
        + '    }\n';
    test ('positive: a push of a `string` method result keeps the list []string (fails on the base printer)', () => {
        const out = print (fn ('string'));
        expect (out).toContain ('var candidates []string = []string{\"a\"}');
        expect (out).not.toContain ('SafeStringPtr(candidates[i])');
    });
    test ('negative: a `Str` (nullable) method result keeps []any', () => {
        const out = print (fn ('Str', '        return (n === \'\') ? undefined : n;\n'));
        expect (out).not.toContain ('var candidates []string');
    });
    test ('negative: an `any` method result keeps []any', () => {
        const out = print (fn ('any', '        return n as any;\n'));
        expect (out).not.toContain ('var candidates []string');
    });
});
