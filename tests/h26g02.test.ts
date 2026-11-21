import fs from 'fs';
import path from 'path';
import * as os from 'os';
import { Transpiler, installCcxtGoLocalTypes } from '../src/transpiler';

const HEAD =
    'type Dict = { [key: string]: any };\n' +
    'type Int = number | undefined;\n' +
    'type Num = number | undefined;\n' +
    'export class ex {\n' +
    '    sum (...args: any[]): number { return 1; }\n' +
    '    parseToInt (x: any): number { return 1; }\n' +
    '    other (x: any): any { return x; }\n';
const print = (body: string): string => {
    const dir = fs.mkdtempSync (path.join (os.tmpdir (), 'h26g02-'));
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
const method = (decl: string, guard: string, extra = ''): string =>
    '    p (since: Int = undefined, limit: Int = undefined, params = {}) {\n' +
    '        const request: Dict = {};\n' +
    '        ' + decl + '\n' +
    '        if (' + guard + ') {\n' +
    '            cappedLimit = limit;\n' +
    '        }\n' + extra +
    '        const duration = this.parseToInt (60);\n' +
    '        const rangeEnd = this.parseToInt (this.sum (5, duration * cappedLimit));\n' +
    "        request['limit'] = cappedLimit;\n" +
    "        request['end'] = rangeEnd;\n" +
    '        return request;\n' +
    '    }\n';

describe ('h26-g02: literal-seeded numeric locals reassigned from a guard-narrowed Int', () => {
    test ('a write of a guard-narrowed Int parameter keeps the int64 local and prints native arithmetic', () => {
        const out = print (method ('let cappedLimit: number = 1440;', '(limit !== undefined) && (limit < 1440)'));
        expect (out).toContain ('var cappedLimit int64 = 1440');
        expect (out).toContain ('cappedLimit = *limit');
        expect (out).toContain ('duration*cappedLimit');
        expect (out).not.toContain ('Multiply(');
    });
    test ('negative: an unguarded write of the nil-able parameter keeps the box', () => {
        const out = print (method ('let cappedLimit: number = 1440;', 'since !== undefined'));
        expect (out).toContain ('var cappedLimit any = 1440');
        expect (out).not.toContain ('*limit\n');
    });
    test ('negative: a nil write after the guarded one keeps the box', () => {
        const out = print (method ('let cappedLimit: Int = 1440;', 'limit !== undefined', '        if (since === undefined) {\n            cappedLimit = undefined;\n        }\n'));
        expect (out).toContain ('var cappedLimit any = 1440');
    });
    test ('negative: a write of a non-integer value keeps the box', () => {
        const out = print (method ('let cappedLimit: number = 1440;', 'limit !== undefined', "        if (since === undefined) {\n            cappedLimit = this.other (params);\n        }\n"));
        expect (out).toContain ('var cappedLimit any = 1440');
    });
});
