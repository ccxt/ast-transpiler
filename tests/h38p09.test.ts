import fs from 'fs';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

describe ('go: a never-rewritten local seeded by a literal-defaulted safeInteger is int64', () => {
    const root = path.join (__dirname, 'files', 'tmp-h38p09', 'ts', 'src');
    const BASE =
        'export type Dict = { [key: string]: any };\n' +
        'export type Int = number | undefined;\n' +
        'export type int = number;\n' +
        'export class Exchange {\n' +
        '    options: Dict = {};\n' +
        '    safeInteger (o: any, k: any, d: any = undefined): Int { return o; }\n' +
        '    safeDict (o: any, k: any, d: any = undefined): any { return o; }\n' +
        '    sum (a: any, b: any): any { return a; }\n' +
        '    milliseconds (): int { return 0; }\n' +
        '    iso8601 (t: any): any { return t; }\n' +
        '}\n';
    const VENUE =
        "import { Exchange, Dict, Int, int } from './base/Exchange.js';\n" +
        'export default class v extends Exchange {\n' +
        '    period (duration: int, limit: int) {\n' +
        '        if (duration < 3600) {\n' +
        '            return limit * 2;\n' +
        '        }\n' +
        '        return limit;\n' +
        '    }\n' +
        '    chain (limit: Int = undefined) {\n' +
        "        const maxLimit = this.safeInteger (this.safeDict (this.options, 'f', {}), 'limit', 1000);\n" +
        '        let requestLimit: int = maxLimit;\n' +
        '        if (limit !== undefined) {\n' +
        '            requestLimit = Math.min (limit, maxLimit);\n' +
        '        }\n' +
        '        if (requestLimit > 5) {\n' +
        '            requestLimit = Math.min (requestLimit + 1, maxLimit);\n' +
        '        }\n' +
        '        return this.period (60, requestLimit);\n' +
        '    }\n' +
        '    arith () {\n' +
        "        const n = this.safeInteger (this.options, 'n', 7);\n" +
        '        const t = this.milliseconds () - n * 1000;\n' +
        '        if (n > 3) {\n' +
        '            return t;\n' +
        '        }\n' +
        '        return t + 1;\n' +
        '    }\n' +
        '    noDefault () {\n' +
        "        const n = this.safeInteger (this.options, 'n');\n" +
        '        return n > 3;\n' +
        '    }\n' +
        '    nonLiteral (d: int) {\n' +
        "        const n = this.safeInteger (this.options, 'n', d);\n" +
        '        return n > 3;\n' +
        '    }\n' +
        '    secondWrite (flag: boolean) {\n' +
        "        let n = this.safeInteger (this.options, 'n', 7);\n" +
        '        if (flag) {\n' +
        "            n = this.safeInteger (this.options, 'm');\n" +
        '        }\n' +
        '        return n > 3;\n' +
        '    }\n' +
        '    handedOn () {\n' +
        "        const n = this.safeInteger (this.options, 'n', 7);\n" +
        "        return { 'n': n };\n" +
        '    }\n' +
        '}\n';
    let out = '';
    beforeAll (() => {
        fs.mkdirSync (path.join (root, 'base'), { recursive: true });
        fs.writeFileSync (path.join (root, 'base', 'Exchange.ts'), BASE);
        fs.writeFileSync (path.join (root, 'v.ts'), VENUE);
        const t = new Transpiler ({ verbose: false, go: {} });
        installCcxtGoHooks (t.goTranspiler);
        out = t.transpileGoByPath (path.join (root, 'v.ts')).content;
    });
    afterAll (() => fs.rmSync (path.join (__dirname, 'files', 'tmp-h38p09'), { recursive: true, force: true }));
    const body = (name: string) => out.substring (out.indexOf ('func (this *v) ' + name)).split ('\n}\n')[0];
    test ('a seed read only by arithmetic and comparisons is int64', () => {
        const f = body ('Arith');
        expect (f).toContain ('var n int64 = *this.SafeInteger(this.Options, "n", 7)');
        expect (f).toContain ('if n > 3 {');
        expect (f).not.toContain ('n != nil');
    });
    test ('the int local it seeds and its Math.min steps follow', () => {
        const f = body ('Chain');
        expect (f).toContain ('var maxLimit int64 = *this.SafeInteger(');
        expect (f).toContain ('var requestLimit int64 = maxLimit');
        expect (f).toContain ('if requestLimit > 5 {');
        expect (f).not.toContain ('mathMin');
        expect (f).not.toContain ('IsGreaterThan');
    });
    test ('no default keeps the pointer', () => {
        expect (body ('NoDefault')).toContain ('var n *int64 = this.SafeInteger(this.Options, "n")');
    });
    test ('a non-literal default keeps the pointer', () => {
        expect (body ('NonLiteral')).toContain ('var n *int64');
    });
    test ('a second write keeps the pointer', () => {
        expect (body ('SecondWrite')).toContain ('var n *int64 = this.SafeInteger(this.Options, "n", 7)');
    });
    test ('a hand-off into a map keeps the pointer', () => {
        expect (body ('HandedOn')).toContain ('var n *int64');
    });
});
