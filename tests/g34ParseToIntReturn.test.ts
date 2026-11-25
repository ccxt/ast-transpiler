import fs from 'fs';
import path from 'path';
import * as os from 'os';
import { Transpiler, installCcxtGoLocalTypes } from '../src/transpiler';

const HEAD =
    'type Dict = { [key: string]: any };\n' +
    'type Int = number | undefined;\n' +
    'type Str = string | undefined;\n' +
    'class base {\n' +
    '    parseToInt (v: any): number { return 0; }\n' +
    '    safeString (o: any, k: any, d: Str = undefined): Str { return d; }\n' +
    '    safeInteger (o: any, k: any, d: Int = undefined): Int { return d; }\n    iso8601 (t: any): Str { return undefined; }\n' +
    '}\n' +
    'export class ex extends base {\n';
const print = (body: string): string => {
    const dir = fs.mkdtempSync (path.join (os.tmpdir (), 'g34-'));
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

describe ('g34: a parse* Int method returning undefined or parseToInt prints *int64', () => {
    test ('nil path and parseToInt path', () => {
        const out = print (
            '    parseStamp (raw: Str): Int {\n' +
            '        if (raw === undefined) {\n' +
            '            return undefined;\n' +
            '        }\n' +
            '        return this.parseToInt (raw);\n' +
            '    }\n');
        expect (out).toMatch (/ParseStamp\(raw \*string\) \*int64 \{/);
        expect (out).toContain ('retIntVal := this.ParseToInt(raw)');
        expect (out).toContain ('return &retIntVal');
        expect (out).toMatch (/return nil/);
    });
    test ('a safeInteger path keeps its pointer', () => {
        const out = print (
            '    parseWsStamp (message: Dict, key: string): Int {\n' +
            '        const value = this.safeString (message, key);\n' +
            '        if (value === undefined) {\n' +
            '            return undefined;\n' +
            '        }\n' +
            '        if (value.length > 13) {\n' +
            '            return this.parseToInt (value.slice (0, value.length - 6));\n' +
            '        }\n' +
            '        return this.safeInteger (message, key);\n' +
            '    }\n');
        expect (out).toMatch (/ParseWsStamp\(message [^)]*\) \*int64 \{/);
        expect (out).toContain ('return this.SafeInteger(message, key)');
    });
    test ('negative: a path of another kind keeps the box', () => {
        const out = print (
            '    parseOther (raw: Str, d: any): Int {\n' +
            '        if (raw === undefined) {\n' +
            '            return d;\n' +
            '        }\n' +
            '        return this.parseToInt (raw);\n' +
            '    }\n');
        expect (out).not.toMatch (/ParseOther\([^)]*\) \*int64 \{/);
        expect (out).not.toContain ('retIntVal');
    });
    test ('negative: a non-parse method is not touched by this rule', () => {
        const out = print (
            '    stampOf (raw: Str, d: any): Int {\n' +
            '        if (raw === undefined) {\n' +
            '            return d;\n' +
            '        }\n' +
            '        return this.parseToInt (raw);\n' +
            '    }\n');
        expect (out).not.toContain ('retIntVal');
    });
    test ('a const local of the typed method takes *int64', () => {
        const out = print ('    parseStamp (raw: Str): Int {\n        if (raw === undefined) {\n            return undefined;\n        }\n        return this.parseToInt (raw);\n    }\n    handleX (event: Dict, book: any) {\n        const timestamp = this.parseStamp (this.safeString (event, \'t\'));\n        return this.iso8601 (timestamp);\n    }\n    handleY (event: Dict, book: any) {\n        const timestamp: Int = this.parseStamp (this.safeString (event, \'t\'));\n        book[\'timestamp\'] = timestamp;\n    }\n    handleZ (event: Dict) {\n        const timestamp = this.parseStamp (this.safeString (event, \'t\'));\n        return { \'timestamp\': timestamp };\n    }\n');
        expect (out).toContain ('var timestamp *int64 = this.ParseStamp(');
        expect (out).not.toContain ('var timestamp any = this.ParseStamp(');
    });
});
