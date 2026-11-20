import fs from 'fs';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

describe ('go *string declaration from a concat of derefable and unguarded *string leaves', () => {
    const root = path.join (__dirname, 'files', 'tmp-h25g22', 'ts', 'src');
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
        "        const k = symbol + ':' + raw;\n" +
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
    afterAll (() => fs.rmSync (path.join (__dirname, 'files', 'tmp-h25g22'), { recursive: true, force: true }));

    test ('positive: derefable leaf plus unguarded leaf prints one nil test and a native concat', () => {
        const b = body ('both');
        expect (b).toMatch (/var messageHash \*string = nil\n\s*if timeframe != nil \{\n\s*messageHashValue := "ohlcv::" \+ \*symbol \+ "::" \+ \*timeframe/);
        expect (b).not.toMatch (/Add\(/);
    });
    test ('negative: two distinct unguarded leaves keep the helper', () => {
        expect (body ('two')).toMatch (/Add\(/);
    });
    test ('negative: an any leaf keeps the helper', () => {
        expect (body ('anyLeaf')).toMatch (/Add\(/);
    });
    test ('negative: nil-tested target still answers nil when the leaf is nil', () => {
        const b = body ('tested');
        expect (b).toMatch (/Add\(|h \*string = nil/);
        expect (b).not.toMatch (/h = &hValue\n[^]*h = &/);
    });
});
