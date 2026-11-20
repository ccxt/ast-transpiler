import fs from 'fs';
import path from 'path';
import { Transpiler, installCcxtGoLocalTypes } from '../src/transpiler';
import * as os from 'os';

describe ('go declared int / number local keeps its type across reassignment', () => {
    const HEAD =
        'export type Int = number | undefined;\n' +
        'export type int = number;\n' +
        'export type Num = number | undefined;\n' +
        'class BaseExchange {\n' +
        '    parseToInt (x: number): number { return x; }\n' +
        '    options: any = {};\n' +
        '    sum (a: number, b: number): number { return a + b; }\n' +
        '    safeInteger (o: any, k: string, d: Int = undefined): Int { return d; }\n' +
        '}\n' +
        'export class ex extends BaseExchange {\n';
    const print = (body: string): string => {
        const dir = fs.mkdtempSync (path.join (os.tmpdir (), 'h16g02-'));
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

    const BODY =
        '    chunks (xs: string[]) {\n' +
        '        const n = xs.length;\n' +
        "        const chunkSize = this.safeInteger (this.options, 'b', 50);\n" +
        '        let startIndex: int = 0;\n' +
        '        while (startIndex < n) {\n' +
        '            let endIndex: int = this.sum (startIndex, chunkSize);\n' +
        '            if (endIndex > n) {\n' +
        '                endIndex = n;\n' +
        '            }\n' +
        '            startIndex = this.sum (startIndex, chunkSize);\n' +
        '        }\n' +
        '        return startIndex;\n' +
        '    }\n' +
        '    open (b: number) {\n' +
        "        let o = this.safeInteger (this.options, 'openType', 2);\n" +
        '        if (b > 1) { o = 1; } else { o = 2; }\n' +
        '        if (o === 1) { return 5; }\n' +
        '        return o;\n' +
        '    }\n';

    test ('a sum-of-int64 reassigned local and its defaulted-pointer partner print native int64', () => {
        const out = print (BODY);
        expect (out).toContain ('var startIndex int64 = 0');
        expect (out).toContain ('for startIndex < int64(n) {');
        expect (out).toContain ('var endIndex int64 = startIndex + *chunkSize');
        expect (out).toContain ('endIndex = int64(n)');
        expect (out).toContain ('startIndex = startIndex + *chunkSize');
        expect (out).not.toContain ('this.Sum(');
        expect (out).not.toContain ('IsLessThan(');
    });

    test ('a defaulted safeInteger seed rewritten with int literals is a dereferenced int64', () => {
        const out = print (BODY);
        expect (out).toContain ('var o int64 = *this.SafeInteger(this.Options, "openType", 2)');
        expect (out).toContain ('if o == 1 {');
    });

    test ('a write that is not an int64 keeps the box', () => {
        const out = print (
            '    f (a: any) {\n' +
            "        const chunkSize = this.safeInteger (this.options, 'b', 50);\n" +
            '        let s: int = 0;\n' +
            '        s = this.sum (s, chunkSize);\n' +
            '        s = a;\n' +
            '        return s < 3;\n' +
            '    }\n' +
            '    g (b: number) {\n' +
            "        let o = this.safeInteger (this.options, 'openType', 2);\n" +
            '        if (b > 1) { o = b; }\n' +
            '        return o === 1;\n' +
            '    }\n');
        expect (out).toContain ('var s any = 0');
        expect (out).toContain ('s = this.Sum(s, chunkSize)');
        expect (out).toMatch (/var o any = /);
    });

    test ('a nilable seed or partner keeps the pointer and its nil answer', () => {
        const out = print (
            '    f () {\n' +
            "        let t: Int = this.safeInteger (this.options, 'x');\n" +
            "        const h = this.safeInteger (this.options, 'h');\n" +
            '        let k: int = 0;\n' +
            '        k = this.sum (k, h);\n' +
            '        if (t === undefined) { t = 20; }\n' +
            '        return [ t, k ];\n' +
            '    }\n' +
            '    g () {\n' +
            "        let o = this.safeInteger (this.options, 'openType', 2);\n" +
            '        if (o === undefined) { o = 1; }\n' +
            '        return o;\n' +
            '    }\n');
        expect (out).not.toMatch (/var t int64/);
        expect (out).toContain ('var k any = 0');
        expect (out).toContain ('k = this.Sum(k, h)');
        expect (out).not.toMatch (/var o int64/);
    });

    test ('a sum whose operand is a nested product keeps the box', () => {
        const out = print (
            '    f (b: number, c: number) {\n' +
            "        const s = this.safeInteger (this.options, 's');\n" +
            "        const w = this.safeInteger (this.options, 'w', 50);\n" +
            '        const d = this.parseToInt (c);\n' +
            '        let until = this.parseToInt (b);\n' +
            '        if (s !== undefined) {\n' +
            '            until = this.sum (s, w * d);\n' +
            '        }\n' +
            '        return until > 3;\n' +
            '    }\n');
        expect (out).not.toMatch (/var until int64/);
    });
});
