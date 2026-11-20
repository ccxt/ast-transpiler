import fs from 'fs';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

describe ('go *string declaration from a concat with two unguarded *string leaves', () => {
    const root = path.join (__dirname, 'files', 'tmp-h26h26g13', 'ts', 'src');
    const BASE =
        'export type Str = string | undefined;\n' +
        'export class Exchange {\n' +
        "    id: string = 'x';\n" +
        '    safeString (o: any, k: string, d: Str = undefined): Str {\n' +
        '        return o[k] ?? d;\n' +
        '    }\n' +
        '    check (s: Str): boolean {\n' +
        '        return s === undefined;\n' +
        '    }\n' +
        '    resolve (x: any): void {\n' +
        '    }\n' +
        '    findTimeframe (t: Str): Str {\n' +
        '        return t;\n' +
        '    }\n' +
        '}\n';
    const VENUE =
        "import { Exchange } from './base/Exchange.js';\n" +
        'export default class v extends Exchange {\n' +
        '    both (m: any) {\n' +
        "        const symbol = this.safeString (m, 'symbol', '');\n" +
        "        if (this.check (symbol)) {\n" +
        '            return;\n' +
        '        }\n' +
        "        const timeframe = this.findTimeframe (this.safeString (m, 'i'));\n" +
        "        const messageHash = 'ohlcv::' + symbol + '::' + timeframe;\n" +
        '        this.resolve (messageHash);\n' +
        '    }\n' +
        '    two (m: any) {\n' +
        "        const a = this.safeString (m, 'a');\n" +
        "        const b = this.safeString (m, 'b');\n" +
        "        const h = 'x:' + a + ':' + b;\n" +
        '        this.resolve (h);\n' +
        '    }\n' +
        '    anyLeaf (m: any, raw: any) {\n' +
        "        const symbol = this.safeString (m, 'symbol', '');\n" +
        "        const a = this.safeString (m, 'a');\n" +
        "        const b = this.safeString (m, 'b');\n" +
        "        const k = a + ':' + b + raw;\n" +
        '        this.resolve (k);\n' +
        '    }\n' +
        '    tested (m: any) {\n' +
        "        const symbol = this.safeString (m, 'symbol', '');\n" +
        "        const tf = this.findTimeframe (this.safeString (m, 'i'));\n" +
        "        const h = symbol + ':' + tf;\n" +
        '        if (h === undefined) {\n' +
        "            return 'none';\n" +
        '        }\n' +
        '        this.resolve (h);\n' +
        '    }\n' +
        '}\n';
    let out = '';
    const body = (name) => {
        const start = out.indexOf (') ' + name.charAt (0).toUpperCase () + name.slice (1) + '(');
        const end = out.indexOf ('\nfunc ', start + 1);
        return out.substring (start, (end < 0) ? out.length : end);
    };
    beforeAll (() => {
        fs.mkdirSync (path.join (root, 'base'), { recursive: true });
        fs.writeFileSync (path.join (root, 'base', 'Exchange.ts'), BASE);
        fs.writeFileSync (path.join (root, 'v.ts'), VENUE);
        const t = new Transpiler ({ verbose: false, go: {} });
        installCcxtGoHooks (t.goTranspiler);
        out = t.transpileGoByPath (path.join (root, 'v.ts')).content;
    });
    afterAll (() => fs.rmSync (path.join (__dirname, 'files', 'tmp-h26h26g13'), { recursive: true, force: true }));

    test ('positive: two distinct unguarded leaves print one combined nil test', () => {
        const b = body ('two');
        expect (b).toMatch (/var h \*string = nil\n\s*if a != nil && b != nil \{\n\s*hValue := "x:" \+ \*a \+ ":" \+ \*b\n\s*h = &hValue\n\s*\}/);
        expect (b).not.toMatch (/Add\(|&&\s*\{\s*b/);
    });
    test ('negative: an any leaf next to two pointers keeps the helper', () => {
        expect (body ('anyLeaf')).toMatch (/Add\(/);
    });
    test ('negative: nil-tested target keeps the nil answer', () => {
        const b = body ('tested');
        expect (b).toMatch (/Add\(|h \*string = nil/);
    });
});
