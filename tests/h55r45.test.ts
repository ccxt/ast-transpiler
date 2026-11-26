import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler } from '../src/transpiler';

const root = fs.mkdtempSync (path.join (os.tmpdir (), 'h55r45-'));
const base = "export interface Dict { [key: string]: any }\nexport type Str = string | undefined;\nexport interface Market { id: Str; symbol: string; spot: boolean; info: any }\nexport default class Exchange {\n    markets: Dict = {};\n    market (symbol: Str): Market {\n        return this.markets[symbol];\n    }\n    hold (m: any, n: any = undefined): any {\n        return m;\n    }\n}\n";
const rs = (name: string, body: string) => {
    const dir = path.join (root, name);
    fs.mkdirSync (path.join (dir, 'ts/src/base'), { recursive: true });
    fs.writeFileSync (path.join (dir, 'ts/src/base/Exchange.ts'), base);
    fs.writeFileSync (path.join (dir, 'ts/src/venue.ts'), "import Exchange from './base/Exchange.js';\nimport type { Dict, Str } from './base/Exchange.js';\nexport default class venue extends Exchange {\n" + body + "}\n");
    const typed = new Transpiler ({ 'verbose': false, 'rust': { 'typedUnified': [ 'market' ], 'parser': { 'NUM_LINES_END_FILE': 0 } } });
    return typed.transpileRustByPath (path.join (dir, 'ts/src/venue.ts')).content;
};

// the last use of an owned market struct, as a call argument, moves its field out (no copy)
describe ('h55r45: a market struct field moves at the local last use', () => {
    test ('the symbol field moves into the last call', () => {
        const out = rs ('a', "    one (symbol: string) {\n        const market = this.market (symbol);\n        const x = this.hold (market['id']);\n        return this.hold (x, market['symbol']);\n    }\n");
        expect (out).toContain ('let mut market: crate::types::Market = ');
        expect (out).toContain ('Value::from((market).symbol)');
        expect (out).not.toContain ('(market).symbol.clone()');
    });
    test ('the whole record moves its raw at the last use', () => {
        const out = rs ('b', "    one (symbol: string) {\n        const market = this.market (symbol);\n        const x = this.hold (market['symbol']);\n        return this.hold (x, market);\n    }\n");
        expect (out).toContain ('(market).raw)');
        expect (out).not.toContain ('(market).raw.clone()');
        expect (out).toContain ('(market).symbol.clone()');
    });
    test ('negative: a later read keeps the clone', () => {
        const out = rs ('c', "    one (symbol: string) {\n        const market = this.market (symbol);\n        const x = this.hold (market['symbol']);\n        return this.hold (x, market['id']);\n    }\n");
        expect (out).toContain ('(market).symbol.clone()');
    });
    test ('negative: a use inside a loop keeps the clone', () => {
        const out = rs ('d', "    one (symbol: string) {\n        const market = this.market (symbol);\n        let x = undefined;\n        for (let i = 0; i < 3; i++) {\n            x = this.hold (market['symbol']);\n        }\n        return x;\n    }\n");
        expect (out).toContain ('(market).symbol.clone()');
    });
    test ('negative: a use inside a try keeps the clone', () => {
        const out = rs ('e', "    one (symbol: string) {\n        const market = this.market (symbol);\n        try {\n            return this.hold (market['symbol']);\n        } catch (e) {\n            return undefined;\n        }\n    }\n");
        expect (out).toContain ('(market).symbol.clone()');
    });
});
