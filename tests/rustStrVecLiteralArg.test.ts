import { Transpiler } from '../src/transpiler';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';

// a list literal handed to a typed `Vec<String>` unified slot builds the vector from its elements' text (no boxed list)
const base = "export interface Dict { [key: string]: any }\nexport type Str = string | undefined;\nexport type Int = number | undefined;\nexport interface Order { id: string }\nexport default class Exchange {\n    symbol (s: string): string { return s; }\n    // METHODS BELOW THIS LINE ARE TRANSPILED FROM TYPESCRIPT\n    async watchOrdersForSymbols (symbols: string[], since: Int = undefined, limit: Int = undefined, params: Dict = {}): Promise<Order[]> {\n        return [];\n    }\n}\n";
const venue = (arg: string) => "import Exchange from './base/Exchange.js';\nimport type { Dict, Order, Str, Int } from './base/Exchange.js';\nexport default class venue extends Exchange {\n    async watchOrders (symbol: Str = undefined, since: Int = undefined, limit: Int = undefined, params: Dict = {}): Promise<Order[]> {\n        const box: any = this.hold (symbol);\n        if (symbol !== undefined) {\n            return await this.watchOrdersForSymbols (" + arg + ", since, limit, params);\n        }\n        return [];\n    }\n    hold (x: any): any { return x; }\n}\n";
const root = fs.mkdtempSync (path.join (os.tmpdir (), 'astfx-rs-strveclit-'));
afterAll (() => fs.rmSync (root, { recursive: true, force: true }));
jest.mock ('module', () => ({ __esModule: true, default: jest.fn () }));

function run (dir: string, arg: string): string {
    fs.mkdirSync (path.join (root, dir, 'ts/src/base'), { recursive: true });
    fs.writeFileSync (path.join (root, dir, 'ts/src/base/Exchange.ts'), base);
    fs.writeFileSync (path.join (root, dir, 'ts/src/venue.ts'), venue (arg));
    return new Transpiler ({ 'verbose': false, 'rust': { 'typedUnified': [ 'watchOrdersForSymbols' ], 'parser': { 'NUM_LINES_END_FILE': 0 } } }).transpileRustByPath (path.join (root, dir, 'ts/src/venue.ts')).content;
}

describe ('a list literal in a typed Vec<String> slot', () => {
    test ('one call element prints vec![x.to_string()] with no to_str_vec', () => {
        const out = run ('lit', '[ this.symbol (symbol) ]');
        expect (out).toMatch (/watch_orders_for_symbols\(vec!\[[^\]]*\.to_string\(\)\]/);
        expect (out).not.toContain ('to_str_vec()');
    });
    test ('an empty literal prints an empty vector', () => {
        const out = run ('empty', '[]');
        expect (out).toContain ('watch_orders_for_symbols(vec![]');
        expect (out).not.toContain ('to_str_vec()');
    });
    test ('negative: a boxed local keeps to_str_vec', () => {
        const out = run ('boxed', 'box');
        expect (out).toContain ('.to_str_vec()');
    });
});
