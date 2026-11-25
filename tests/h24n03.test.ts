import fs from 'fs';
import path from 'path';
import * as os from 'os';
import { Transpiler, installCcxtGoLocalTypes } from '../src/transpiler';

const HEAD =
    'type Dict = { [key: string]: any };\n' +
    'type Int = number | undefined;\n' +
    'type Str = string | undefined;\n' +
    'export class ex {\n' +
    '    safeInteger (o: Dict, k: string, d: Int = undefined): Int { return o[k]; }\n' +
    '    safeString (o: Dict, k: string, d: Str = undefined): Str { return o[k]; }\n' +
    '    parse8601 (x: Str): Int { return 1; }\n' +
    '    parseToInt (x: any): number { return 1; }\n' +
    "    yymmdd (x: Int): string { return ''; }\n" +
    "    iso8601 (x: Int): Str { return ''; }\n" +
    '    other (x: any): any { return x; }\n';
const print = (body: string): string => {
    const dir = fs.mkdtempSync (path.join (os.tmpdir (), 'h24n03-'));
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
const method = (writes: string, reads: string): string =>
    '    p (m: Dict) {\n' +
    '        let t: Int = undefined;\n' +
    "        let s = 'a';\n" +
    "        if (m['x']) {\n" + writes +
    '        }\n' + reads +
    "        return { 't': t, 'dt': this.iso8601 (t), 's': s };\n" +
    '    }\n';

describe ('h24-n03: nil-seeded Int locals without a nil test', () => {
    test ('a reader write read by a date formatter and an object literal joins as *int64', () => {
        const out = print (method ("            t = this.safeInteger (m, 'd');\n            s = s + this.yymmdd (t);\n", ''));
        expect (out).toContain ('var t *int64 = nil');
        expect (out).toContain ('t = this.SafeInteger(m, "d")');
        expect (out).not.toContain ('var t any = nil');
    });
    test ('a parse8601 write and an int64 value write join as *int64', () => {
        const out = print (method ("            t = this.parse8601 (this.safeString (m, 'd'));\n        } else {\n            t = this.parseToInt (m['y']) * 1000;\n", ''));
        expect (out).toContain ('var t *int64 = nil');
        expect (out).toContain ('t = this.Parse8601(');
        expect (out).toContain ('t = &tValue');
        expect (out).not.toContain ('derefPtr');
    });
    test ('negative: a string write keeps the box', () => {
        const out = print (method ("            t = this.safeInteger (m, 'd');\n        } else {\n            t = this.safeString (m, 'e') as any;\n", ''));
        expect (out).toContain ('var t any = nil');
    });
    test ('negative: a nil-able value handed to an untyped consumer keeps the box', () => {
        const out = print (method ("            t = this.safeInteger (m, 'd');\n", "        const z = this.other (t);\n        const arr = [ t ];\n"));
        expect (out).toContain ('var t any = nil');
    });
    test ('negative: a nil test plus an untyped consumer keeps the box', () => {
        const out = print (method ("            t = this.safeInteger (m, 'd');\n", "        if (t === undefined) {\n            this.other (t);\n        }\n"));
        expect (out).toContain ('var t any = nil');
    });
    test ('negative: literal-only writes stay with the value join, not a pointer', () => {
        const out = print ('    q (m: Dict) {\n        let mode: Int = undefined;\n        if (m[\'x\']) {\n            mode = 3;\n        } else {\n            mode = 0;\n        }\n        return { \'mode\': mode };\n    }\n');
        expect (out).not.toContain ('var mode *int64');
    });
});
