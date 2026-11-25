import { Transpiler } from '../src/transpiler';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// a no-default `safeDict` row of a typed record-map result local reads the record's own map (`RecordRows::row_dict`)
const base = 'export interface Dict { [key: string]: any }\nexport type Strings = string[] | undefined;\nexport type Str = string | undefined;\n' +
    'export interface Ticker { symbol: string }\nexport interface Tickers { [key: string]: Ticker }\n' +
    'export default class Exchange {\n    // METHODS BELOW THIS LINE ARE TRANSPILED FROM TYPESCRIPT\n' +
    '    safeDict (o: any, k: any, d: Dict = undefined): Dict | undefined { return o; }\n' +
    '    async fetchTickers (symbols: Strings = undefined, params: Dict = {}): Promise<Tickers> {\n        return {};\n    }\n}\n';
const venue = "import Exchange from './base/Exchange.js';\nimport type { Dict, Str, Ticker } from './base/Exchange.js';\n" +
    'export default class venue extends Exchange {\n' +
    '    async fetchTicker (symbol: string, params: Dict = {}): Promise<Ticker> {\n        const tickers = await this.fetchTickers ([ symbol ], params);\n        const ticker = this.safeDict (tickers, symbol);\n        return ticker as Ticker;\n    }\n' +
    '    async fetchLoose (symbol: string, params: Dict = {}) {\n        const tickers = await this.fetchTickers ([ symbol ], params);\n        const ticker = this.safeDict (tickers, symbol, {});\n        return ticker;\n    }\n' +
    '    async fetchAny (symbol: string, rows: any, params: Dict = {}) {\n        const ticker = this.safeDict (rows, symbol);\n        return ticker;\n    }\n}\n';

describe ('rust record-map row read: RecordRows::row_dict', () => {
    let output = '';
    beforeAll (() => {
        const root = fs.mkdtempSync (path.join (os.tmpdir (), 'h47r56-'));
        fs.mkdirSync (path.join (root, 'ts', 'src', 'base'), { recursive: true });
        fs.writeFileSync (path.join (root, 'ts', 'src', 'base', 'Exchange.ts'), base);
        fs.writeFileSync (path.join (root, 'ts', 'src', 'venue.ts'), venue);
        const t = new Transpiler ({ 'verbose': false, 'rust': { 'typedUnified': [ 'fetchTicker', 'fetchTickers' ], 'parser': { 'NUM_LINES_END_FILE': 0 } } } as any);
        output = t.transpileRustByPath (path.join (root, 'ts', 'src', 'venue.ts')).content;
        fs.rmSync (root, { recursive: true, force: true });
    });
    test ('the typed Tickers row reads the record map natively', () => {
        expect (output).toMatch (/let mut ticker: Option<crate::value::Dict> = crate::types::RecordRows::row_dict\(&tickers, &symbol\);/);
        expect (output).not.toMatch (/row_dict\(&tickers, symbol\)/);
        expect (output).not.toContain ('into_raw(tickers)');
    });
    test ('negatives: a `{}` default and an untyped receiver keep the boxed read', () => {
        expect (output).toMatch (/fn fetchLoose[\s\S]*IntoRaw::into_raw\(tickers/);
        expect ((output.match (/row_dict\(/g) ?? []).length).toBe (1);
    });
});
