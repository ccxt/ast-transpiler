import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

// a venue-private method declared `: Trade` whose every return is a map literal or SafeTrade prints map[string]any
describe ('h48g15: venue-private Trade return', () => {
    const HEAD = 'export type Dict = { [key: string]: any };\nexport type Str = string | undefined;\n'
        + 'export interface Trade { id: Str; }\nexport interface PredictionTrade { id: Str; }\nexport type Market = Dict | undefined;\n'
        + 'export class Exchange {\n'
        + '    safeString (o: any, k: any, d: Str = undefined): Str { return d; }\n'
        + '    safeTrade (t: Dict, m: Market = undefined): Trade { return t as any; }\n'
        + '    parseTrade (t: Dict, m: Market = undefined): Trade { return this.safeTrade (t, m); }\n'
        + '}\nexport default Exchange;\n';
    const print = (body: string): string => {
        const dir = fs.mkdtempSync (path.join (process.env.TMPDIR || os.tmpdir (), 'h48g15-'));
        try {
            fs.mkdirSync (path.join (dir, 'ts', 'src', 'base'), { 'recursive': true });
            fs.writeFileSync (path.join (dir, 'ts', 'src', 'base', 'Exchange.ts'), HEAD);
            const file = path.join (dir, 'ts', 'src', 'x.ts');
            fs.writeFileSync (file, 'import { Exchange, Dict, Market, Trade, PredictionTrade } from \'./base/Exchange.js\';\nclass x extends Exchange {\n' + body + '}\n');
            const t: any = new Transpiler ({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 } } });
            installCcxtGoHooks (t.goTranspiler);
            return t.transpileGoByPath (file).content;
        } finally {
            fs.rmSync (dir, { 'recursive': true, 'force': true });
        }
    };
    test ('map literal return (fails on the base printer)', () => {
        const out = print ('    parseMyTrade (trade: Dict, market: Market = undefined): Trade {\n'
            + '        return {\n            \'info\': trade,\n            \'id\': this.safeString (trade, \'i\'),\n        } as any;\n    }\n');
        expect (out).toMatch (/\) ParseMyTrade\(trade map\[string\]any, optionalArgs \.\.\.any\) map\[string\]any \{/);
    });
    test ('safeTrade return (fails on the base printer)', () => {
        const out = print ('    parseMyTrade (trade: Dict, market: Market = undefined): Trade {\n'
            + '        return this.safeTrade ({ \'id\': this.safeString (trade, \'i\') }, market);\n    }\n');
        expect (out).toMatch (/\) ParseMyTrade\([^)]*\) map\[string\]any \{/);
    });
    test ('negative: no declaration keeps any', () => {
        const out = print ('    parseMyTrade (trade: Dict, market: Market = undefined) {\n'
            + '        return this.safeTrade ({ \'id\': this.safeString (trade, \'i\') }, market);\n    }\n');
        expect (out).toMatch (/\) ParseMyTrade\([^)]*\) any \{/);
    });
    test ('negative: a nil return keeps any', () => {
        const out = print ('    parseMyTrade (trade: Dict, market: Market = undefined): Trade {\n'
            + '        if (trade === undefined) {\n            return undefined;\n        }\n'
            + '        return this.safeTrade ({ \'id\': this.safeString (trade, \'i\') }, market);\n    }\n');
        expect (out).toMatch (/\) ParseMyTrade\([^)]*\) any \{/);
    });
    test ('negative: a PredictionTrade declaration keeps any', () => {
        const out = print ('    parseMyTrade (trade: Dict, market: Market = undefined): PredictionTrade {\n'
            + '        return { \'id\': this.safeString (trade, \'i\') } as any;\n    }\n');
        expect (out).toMatch (/\) ParseMyTrade\([^)]*\) any \{/);
    });
    test ('negative: a returned untyped value keeps any', () => {
        const out = print ('    parseMyTrade (trade: Dict, market: Market = undefined): Trade {\n'
            + '        const x = trade[\'k\'];\n        return x;\n    }\n');
        expect (out).toMatch (/\) ParseMyTrade\([^)]*\) any \{/);
    });
});
