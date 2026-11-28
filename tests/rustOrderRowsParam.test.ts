import { Transpiler } from '../src/transpiler';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';

// a typed `orders: OrderRequest[]` parameter read only by length and `safeDict (orders, i)` rows binds once as `Vec<Dict>`
const base = "export interface Dict { [key: string]: any }\nexport type Str = string | undefined;\nexport interface Order { id: string }\nexport interface OrderRequest { symbol: string }\nexport default class Exchange {\n    safeDict (o: any, k: any, d: Dict = undefined): Dict | undefined { return o; }\n    safeString (o: any, k: any, d: Str = undefined): Str { return o; }\n    hold (x: any): any { return x; }\n    // METHODS BELOW THIS LINE ARE TRANSPILED FROM TYPESCRIPT\n    async createOrders (orders: OrderRequest[], params: Dict = {}): Promise<Order[]> {\n        return [];\n    }\n}\n";
const venue = (body: string, row = 'this.safeDict (orders, i)') => "import Exchange from './base/Exchange.js';\nimport type { Dict, Order, OrderRequest } from './base/Exchange.js';\nexport default class venue extends Exchange {\n    async createOrders (orders: OrderRequest[], params: Dict = {}): Promise<Order[]> {\n        const out = [];\n        for (let i = 0; i < orders.length; i++) {\n            const rawOrder = " + row + ";\n            const symbol = this.safeString (rawOrder, 'symbol');\n            out.push (symbol);\n        }\n" + body + "        return out as any;\n    }\n}\n";
const root = fs.mkdtempSync (path.join (os.tmpdir (), 'astfx-rs-orderrows-'));
afterAll (() => fs.rmSync (root, { recursive: true, force: true }));
jest.mock ('module', () => ({ __esModule: true, default: jest.fn () }));

function run (dir: string, body: string, row?: string): string {
    fs.mkdirSync (path.join (root, dir, 'ts/src/base'), { recursive: true });
    fs.writeFileSync (path.join (root, dir, 'ts/src/base/Exchange.ts'), base);
    fs.writeFileSync (path.join (root, dir, 'ts/src/venue.ts'), venue (body, row));
    return new Transpiler ({ 'verbose': false, 'rust': { 'typedUnified': [ 'createOrders' ], 'parser': { 'NUM_LINES_END_FILE': 0 } } }).transpileRustByPath (path.join (root, dir, 'ts/src/venue.ts')).content;
}

describe ('h38-P28: the orders parameter of a typed createOrders is a list of request maps', () => {
    test ('rows read by index bind the parameter once as Vec<Dict>', () => {
        const out = run ('rows', '');
        expect (out).toContain ('let orders: Vec<crate::value::Dict> = crate::value::dict_rows(std::sync::Arc::new(__it.next().unwrap_or_default().as_array().cloned().unwrap_or_default()));');
        expect (out).toContain ('orders.get(i as usize).cloned().unwrap_or_default()');
        expect (out).not.toContain ('safe_dict_t(&orders');
    });
    test ('an element read `orders[i]` prints no slice shadow over the Vec<Dict> binding', () => {
        const out = run ('elem', '', 'orders[i]');
        expect (out).toContain ('let orders: Vec<crate::value::Dict> = crate::value::dict_rows(');
        expect (out).not.toContain ('__orders_empty');
        expect (out).not.toContain ('orders.as_array().unwrap_or(');
    });
    test ('any other use of the parameter keeps the boxed binding', () => {
        const out = run ('other', '        this.hold (orders);\n');
        expect (out).toContain ('let mut orders = __it.next().unwrap_or_default();');
        expect (out).not.toContain ('dict_rows');
    });
});

// a venue override of a base method whose `any[]` row list is read only by length and `safeDict (p, k)` rows is a `Vec<Dict>`
const cacheBase = "export default class Exchange {\n    safeDict (x: any, k: any, d: any = undefined): any { return x; }\n    safeInteger (x: any, k: any, d: any = undefined): any { return x; }\n    getCacheIndex (orderbook: any, deltas: any[]): number {\n        return -1;\n    }\n    pickRows (rows: any[]): number {\n        return -1;\n    }\n}\n";
const cacheVenue = "import Exchange from '../base/Exchange.js';\nexport default class venue extends Exchange {\n    override getCacheIndex (orderbook: any, cache: any[]): number {\n        const first = this.safeDict (cache, 0);\n        const n = this.safeInteger (first, 'u');\n        for (let i = 0; i < cache.length; i++) {\n            const delta = this.safeDict (cache, i);\n            const u = this.safeInteger (delta, 'u');\n            if (u === n) {\n                return i;\n            }\n        }\n        return cache.length;\n    }\n    override pickRows (rows: any[]): number {\n        const first = this.safeDict (rows, 0);\n        this.hold (rows);\n        return rows.length;\n    }\n    hold (x: any): any { return x; }\n}\n";

describe ('h40-R09: the row list of a base-tier override is a list of maps', () => {
    let out = '';
    beforeAll (() => {
        fs.mkdirSync (path.join (root, 'cache/ts/src/base'), { recursive: true });
        fs.mkdirSync (path.join (root, 'cache/ts/src/pro'), { recursive: true });
        fs.writeFileSync (path.join (root, 'cache/ts/src/base/Exchange.ts'), cacheBase);
        fs.writeFileSync (path.join (root, 'cache/ts/src/pro/venue.ts'), cacheVenue);
        out = new Transpiler ({ 'verbose': false, 'rust': { 'parser': { 'NUM_LINES_END_FILE': 0 } } }).transpileRustByPath (path.join (root, 'cache/ts/src/pro/venue.ts')).content;
    });
    test ('the parameter prints Vec<Dict> and its rows read as typed elements', () => {
        expect (out).toMatch (/fn getCacheIndex\([^)]*cache: Vec<crate::value::Dict>\)/);
        expect (out).toContain ('cache.get(i as usize).cloned().unwrap_or_default()');
        expect (out).toContain ('cache.get(0).cloned().unwrap_or_default()');
        expect (out).not.toMatch (/safe_dict_t\(&cache/);
        expect (out).not.toContain ('if let Some(Value::Dict(__m)) = cache.get(');
    });
    test ('negative: a list also handed on whole keeps the Value parameter', () => {
        expect (out).not.toMatch (/fn pickRows\([^)]*rows: Vec<crate::value::Dict>/);
        expect (out).toMatch (/fn pickRows\(&self, rows: Value\)/);
    });
});

// a typed `orders: CancellationRequest[]` parameter lowers to a list of maps the same way
const cancelBase = "export interface Dict { [key: string]: any }\nexport type Str = string | undefined;\nexport interface Order { id: string }\nexport interface CancellationRequest { id: string }\nexport default class Exchange {\n    safeDict (o: any, k: any, d: Dict = undefined): Dict | undefined { return o; }\n    safeString (o: any, k: any, d: Str = undefined): Str { return o; }\n    hold (x: any): any { return x; }\n    // METHODS BELOW THIS LINE ARE TRANSPILED FROM TYPESCRIPT\n    async cancelOrdersForSymbols (orders: CancellationRequest[], params: Dict = {}): Promise<Order[]> {\n        return [];\n    }\n}\n";
const cancelVenue = (body: string) => "import Exchange from './base/Exchange.js';\nimport type { Dict, Order, CancellationRequest } from './base/Exchange.js';\nexport default class venue extends Exchange {\n    async cancelOrdersForSymbols (orders: CancellationRequest[], params: Dict = {}): Promise<Order[]> {\n        const out = [];\n        for (let i = 0; i < orders.length; i++) {\n            const order = this.safeDict (orders, i);\n            out.push (this.safeString (order, 'id'));\n        }\n" + body + "        return out as any;\n    }\n}\n";
function runCancel (dir: string, body: string): string {
    fs.mkdirSync (path.join (root, dir, 'ts/src/base'), { recursive: true });
    fs.writeFileSync (path.join (root, dir, 'ts/src/base/Exchange.ts'), cancelBase);
    fs.writeFileSync (path.join (root, dir, 'ts/src/venue.ts'), cancelVenue (body));
    return new Transpiler ({ 'verbose': false, 'rust': { 'typedUnified': [ 'cancelOrdersForSymbols' ], 'parser': { 'NUM_LINES_END_FILE': 0 } } }).transpileRustByPath (path.join (root, dir, 'ts/src/venue.ts')).content;
}

describe ('the orders parameter of a typed cancelOrdersForSymbols is a list of request maps', () => {
    test ('rows read by index bind the parameter once as Vec<Dict>', () => {
        const out = runCancel ('cancel-rows', '');
        expect (out).toContain ('let orders: Vec<crate::value::Dict> = crate::value::dict_rows(');
        expect (out).toContain ('orders.get(i as usize).cloned().unwrap_or_default()');
        expect (out).not.toContain ('safe_dict_t(&orders');
    });
    test ('negative: any other use keeps the boxed binding', () => {
        const out = runCancel ('cancel-other', '        this.hold (orders);\n');
        expect (out).not.toContain ('dict_rows');
    });
});
