import fs from 'fs';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

describe ('go numberToString of a proven int64 / float64 is a non-nil string leaf', () => {
    const root = path.join (__dirname, 'files', 'tmp-h20g06', 'ts', 'src');
    const BASE =
        'export type Str = string | undefined;\n' +
        'export type Int = number | undefined;\n' +
        'export type Num = number | undefined;\n' +
        'function numberToString (x: number | string): string;\n' +
        'function numberToString (x: any): string | undefined;\n' +
        'function numberToString (x: any): string | undefined {\n' +
        '    return x;\n' +
        '}\n' +
        'export class Exchange {\n' +
        "    id: string = 'x';\n" +
        '    numberToString = numberToString;\n' +
        '    randNumber (n: number): number {\n' +
        '        return n;\n' +
        '    }\n' +
        '}\n';
    const VENUE =
        "import { Exchange, Int, Num } from './base/Exchange.js';\n" +
        'export default class v extends Exchange {\n' +
        '    keys (ids: string[], request: any) {\n' +
        '        for (let i = 0; i < ids.length; i++) {\n' +
        "            const key = 'cancelInfoList[' + this.numberToString (i) + '].orderId';\n" +
        '            request[key] = ids[i];\n' +
        '        }\n' +
        '        return request;\n' +
        '    }\n' +
        '    topic (limit: Int, marketId: string) {\n' +
        '        const limitValue = (limit === undefined) ? 25 : limit;\n' +
        "        const t = 'orderBook' + this.numberToString (limitValue) + '.H.' + marketId;\n" +
        '        return t;\n' +
        '    }\n' +
        '    nilable (limit: Int, marketId: string) {\n' +
        "        const t = 'book.' + this.numberToString (limit) + '.' + marketId;\n" +
        '        return t;\n' +
        '    }\n' +
        '    boxed (x: any) {\n' +
        "        const t = 'p.' + this.numberToString (x);\n" +
        '        return t;\n' +
        '    }\n' +
        '    tested (limit: Num) {\n' +
        '        const s = this.numberToString (limit);\n' +
        '        if (s === undefined) {\n' +
        "            return 'none';\n" +
        '        }\n' +
        '        return s;\n' +
        '    }\n' +
        '}\n';
    const print = (): string => {
        fs.mkdirSync (path.join (root, 'base'), { recursive: true });
        fs.writeFileSync (path.join (root, 'base', 'Exchange.ts'), BASE);
        fs.writeFileSync (path.join (root, 'v.ts'), VENUE);
        const t = new Transpiler ({ verbose: false, go: {} });
        installCcxtGoHooks (t.goTranspiler);
        return t.transpileGoByPath (path.join (root, 'v.ts')).content;
    };
    afterAll (() => fs.rmSync (path.join (__dirname, 'files', 'tmp-h20g06'), { recursive: true, force: true }));

    test ('an int loop counter operand prints a native concat', () => {
        const out = print ();
        expect (out).toContain ('var key string = "cancelInfoList[" + *this.NumberToString(i) + "].orderId"');
    });

    test ('negative: a nilable Int operand keeps the Add helper', () => {
        expect (print ()).toMatch (/Add\(Add\(Add\("book\.", this\.NumberToString\(limit\)\)/);
    });

    test ('negative: an any operand keeps the Add helper', () => {
        expect (print ()).toContain ('Add("p.", this.NumberToString(x))');
    });

    test ('negative: a nilable result a consumer nil-tests keeps the pointer', () => {
        expect (print ()).toContain ('var s *string = this.NumberToString(limit)');
    });
});
