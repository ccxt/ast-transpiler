import fs from 'fs';
import os from 'os';
import path from 'path';
import Transpiler from '../src/transpiler.js';

// `Object.keys (r)` on a typed keyed unified result (`HashMap<String, T>`) lists the map's own keys.
describe('h48r52: Object.keys of a typed keyed result', () => {
    let out = '';
    beforeAll(() => {
        const dir = fs.mkdtempSync (path.join (os.tmpdir (), 'h48r52-'));
        fs.mkdirSync (path.join (dir, 'ts/src/base'), { recursive: true });
        fs.writeFileSync (path.join (dir, 'ts/src/base/Exchange.ts'), "export interface Dictionary<T> { [key: string]: T }\nexport interface Dict { [key: string]: any }\nexport type Strings = string[] | undefined;\n" +
            "export interface Ticker { symbol: string; info: any }\nexport interface Tickers extends Dictionary<Ticker> {}\nexport default class Exchange {\n" +
            "    async watchTickers (symbols: Strings = undefined, params: Dict = {}): Promise<Tickers> { return {}; }\n    hold (x: any): any { return x; }\n}\n");
        fs.writeFileSync (path.join (dir, 'ts/src/venue.ts'), "import Exchange from './base/Exchange.js';\nimport type { Dict, Strings } from './base/Exchange.js';\nexport default class venue extends Exchange {\n" +
            "    async watchSome (symbols: Strings = undefined, params: Dict = {}): Promise<any> {\n" +
            "        const tickers = await this.watchTickers (symbols, params);\n        const ids = Object.keys (tickers);\n        const result: Dict = {};\n" +
            "        for (let i = 0; i < ids.length; i++) {\n            const symbol = ids[i];\n            result[symbol] = tickers[symbol];\n        }\n        return result;\n    }\n" +
            "    async watchWritten (symbols: Strings = undefined, params: Dict = {}): Promise<any> {\n" +
            "        const rows = await this.watchTickers (symbols, params);\n        rows['x'] = undefined;\n        return Object.keys (rows);\n    }\n}\n");
        const typed = new Transpiler ({ 'verbose': false, 'rust': { 'typedUnified': [ 'watchTickers' ], 'parser': { 'NUM_LINES_END_FILE': 0 } } });
        out = typed.transpileRustByPath (path.join (dir, 'ts/src/venue.ts')).content;
    });
    test('the key list reads the typed map, the local keeps its type', () => {
        expect (out).toContain ('let mut tickers: crate::types::Tickers = (match self.watch_tickers(');
        expect (out).toContain ('Value::Array(tickers.keys().cloned().map(Value::from).collect())');
        expect (out).not.toContain ('object_keys(&tickers)');
    });
    test('negative: a written result stays a Value', () => {
        expect (out).not.toContain ('let mut rows: crate::types::Tickers');
        expect (out).toContain ('let mut rows: Value = ');
        expect (out).not.toContain ('rows.keys().cloned()');
    });
});
