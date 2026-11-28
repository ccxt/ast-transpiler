import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

// a venue-private `: Trade` method printed after its doc comment still prints map[string]any
describe ('h49g16: venue-private Trade return after a doc comment', () => {
    const HEAD = 'export type Dict = { [key: string]: any };\nexport type Str = string | undefined;\n'
        + 'export interface Trade { id: Str; }\nexport interface PredictionTrade { id: Str; }\nexport type Market = Dict | undefined;\n'
        + 'export class Exchange {\n'
        + '    safeString (o: any, k: any, d: Str = undefined): Str { return d; }\n'
        + '    safeTrade (t: Dict, m: Market = undefined): Trade { return t as any; }\n'
        + '}\nexport default Exchange;\n';
    const DOC = '    /**\n     * @method\n     * @name x#parseMyTrade\n     * @returns {object} a [trade structure]{@link https://docs.ccxt.com/?id=trade-structure}\n     */\n';
    const print = (body: string): string => {
        const dir = fs.mkdtempSync (path.join (process.env.TMPDIR || os.tmpdir (), 'h49g16-'));
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
    test ('map literal return after a doc comment (fails on the base printer)', () => {
        const out = print (DOC + '    parseMyTrade (trade: Dict, market: Market = undefined): Trade {\n'
            + '        return {\n            \'info\': trade,\n            \'id\': this.safeString (trade, \'i\'),\n        } as Trade;\n    }\n');
        expect (out).toMatch (/\) ParseMyTrade\(trade map\[string\]any, optionalArgs \.\.\.any\) map\[string\]any \{/);
    });
    test ('negative: a doc comment and a nil return keeps any', () => {
        const out = print (DOC + '    parseMyTrade (trade: Dict, market: Market = undefined): Trade {\n'
            + '        if (trade === undefined) {\n            return undefined;\n        }\n'
            + '        return { \'id\': this.safeString (trade, \'i\') } as Trade;\n    }\n');
        expect (out).toMatch (/\) ParseMyTrade\([^)]*\) any \{/);
    });
    test ('negative: a doc comment and a PredictionTrade declaration keeps any', () => {
        const out = print (DOC + '    parseMyTrade (trade: Dict, market: Market = undefined): PredictionTrade {\n'
            + '        return { \'id\': this.safeString (trade, \'i\') } as any;\n    }\n');
        expect (out).toMatch (/\) ParseMyTrade\([^)]*\) any \{/);
    });
});
