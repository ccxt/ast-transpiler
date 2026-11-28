import fs from 'fs';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

describe ('go marketId takes and returns *string', () => {
    const root = path.join (__dirname, 'files', 'tmp-h19g10', 'ts', 'src');
    const BASE =
        'export type Str = string | undefined;\n' +
        'export type Strings = string[] | undefined;\n' +
        'export class Exchange {\n' +
        '    markets: any = undefined;\n' +
        '    safeString (o: any, k: any, d: Str = undefined): Str { return d; }\n' +
        '    market (symbol: Str): any { return this.markets[symbol]; }\n' +
        '    marketSymbols (s: Strings): Strings { return s; }\n' +
        '    marketId (symbol: Str): Str {\n' +
        '        const market = this.market (symbol);\n' +
        '        if (market !== undefined) {\n' +
        "            return this.safeString (market, 'id');\n" +
        '        }\n' +
        '        return symbol;\n' +
        '    }\n' +
        '    otherId (symbol: Str): Str {\n' +
        '        const market = this.market (symbol);\n' +
        '        if (market !== undefined) {\n' +
        "            return this.safeString (market, 'id');\n" +
        '        }\n' +
        '        return symbol;\n' +
        '    }\n' +
        '    ids (symbols: Strings): string[] {\n' +
        '        const normalized: Strings = this.marketSymbols (symbols);\n' +
        '        const result = [];\n' +
        '        for (let i = 0; i < normalized.length; i++) {\n' +
        '            const id = this.marketId (normalized[i]);\n' +
        '            if (id !== undefined) {\n' +
        "                result.push (id + ',');\n" +
        '            }\n' +
        '        }\n' +
        '        return result;\n' +
        '    }\n' +
        '    fromRaw (raw: any): Str {\n' +
        "        const s = this.safeString (raw, 'symbol');\n" +
        '        return this.marketId (s);\n' +
        '    }\n' +
        '}\n';
    const print = (install = true): string => {
        fs.mkdirSync (path.join (root, 'base'), { recursive: true });
        fs.writeFileSync (path.join (root, 'base', 'Exchange.ts'), BASE);
        const t = new Transpiler ({ verbose: false, go: {} });
        if (install) { installCcxtGoHooks (t.goTranspiler); }
        return t.transpileGoByPath (path.join (root, 'base', 'Exchange.ts')).content;
    };
    afterAll (() => fs.rmSync (path.join (__dirname, 'files', 'tmp-h19g10'), { recursive: true, force: true }));

    test ('the base signature is *string in and out with bare returns', () => {
        const out = print ();
        expect (out).toMatch (/MarketId\(symbol \*string\) \*string \{/);
        expect (out).not.toMatch (/return SafeStringPtr\(/);
        expect (out).toMatch (/var id \*string = this\.MarketId\(/);
    });
    test ('a []string element is passed by address, not wrapped', () => {
        const out = print ();
        expect (out).toContain ('this.MarketId(&normalized[i])');
        expect (out).not.toContain ('MarketId(SafeStringPtr(');
    });
    test ('a nilable *string argument is passed through and keeps its nil answer', () => {
        const out = print ();
        expect (out).toContain ('this.MarketId(s)');
        expect (out).not.toContain ('MarketId(StringArg(');
    });
    test ('an untabled sibling keeps the box', () => {
        expect (print ()).toMatch (/OtherId\(symbol any\) any/);
    });
    test ('without the ccxt hooks the base printer keeps any', () => {
        expect (print (false)).not.toMatch (/MarketId\(symbol \*string\)/);
    });
});
