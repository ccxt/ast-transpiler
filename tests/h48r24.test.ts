import { Transpiler } from '../src/transpiler';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';

// a venue-private `orders: OrderRequest[]` builder fed only by a typed createOrders' row-bound list prints `Vec<Dict>`
const base = "export interface Dict { [key: string]: any }\nexport type Str = string | undefined;\nexport interface Order { id: string }\nexport interface OrderRequest { symbol: string }\nexport default class Exchange {\n    safeDict (o: any, k: any, d: Dict = undefined): Dict | undefined { return o; }\n    safeString (o: any, k: any, d: Str = undefined): Str { return o; }\n    extend (a: any, b: any): any { return a; }\n    hold (x: any): any { return x; }\n    // METHODS BELOW THIS LINE ARE TRANSPILED FROM TYPESCRIPT\n    async createOrders (orders: OrderRequest[], params: Dict = {}): Promise<Order[]> {\n        return [];\n    }\n}\n";
const builder = (extra: string) => "    buildOrders (orders: OrderRequest[], params: Dict = {}): Dict {\n        const out: Dict = {};\n        for (let i = 0; i < orders.length; i++) {\n            const order = this.safeDict (orders, i);\n            const symbol = this.safeString (order, 'symbol');\n            out[symbol] = 1;\n        }\n" + extra + "        return out;\n    }\n";
const venue = (caller: string, extra = '') => "import Exchange from './base/Exchange.js';\nimport type { Dict, Order, OrderRequest } from './base/Exchange.js';\nexport default class venue extends Exchange {\n" + builder (extra) + "    async createOrders (orders: OrderRequest[], params: Dict = {}): Promise<Order[]> {\n" + caller + "        return [] as any;\n    }\n}\n";
const root = fs.mkdtempSync (path.join (os.tmpdir (), 'astfx-rs-r24-'));
afterAll (() => fs.rmSync (root, { recursive: true, force: true }));
jest.mock ('module', () => ({ __esModule: true, default: jest.fn () }));

function run (dir: string, caller: string, extra = ''): string {
    fs.mkdirSync (path.join (root, dir, 'ts/src/base'), { recursive: true });
    fs.writeFileSync (path.join (root, dir, 'ts/src/base/Exchange.ts'), base);
    fs.writeFileSync (path.join (root, dir, 'ts/src/venue.ts'), venue (caller, extra));
    return new Transpiler ({ 'verbose': false, 'rust': { 'typedUnified': [ 'createOrders' ], 'parser': { 'NUM_LINES_END_FILE': 0 } } }).transpileRustByPath (path.join (root, dir, 'ts/src/venue.ts')).content;
}

describe ('h48-R24: a venue-private OrderRequest[] builder takes the row-bound list', () => {
    test ('positive: the only caller hands on the typed orders whole', () => {
        const out = run ('pos', '        const request = this.buildOrders (orders);\n        this.hold (this.extend (request, params));\n');
        expect (out).toMatch (/fn buildOrders\(&self, orders: Vec<crate::value::Dict>/);
        expect (out).toContain ('let orders: Vec<crate::value::Dict> = crate::value::dict_rows(');
        expect (out).toContain ('orders.get(i as usize).cloned().unwrap_or_default()');
        expect (out).not.toContain ('safe_dict_t(&orders');
    });
    test ('negative: a caller that also reads an element inline keeps the boxed list', () => {
        const out = run ('inline', '        const request = this.buildOrders (orders);\n        const s = this.safeString (orders[0], \'symbol\');\n        this.hold (s);\n        this.hold (request);\n');
        expect (out).not.toMatch (/fn buildOrders\([^)]*Vec<crate::value::Dict>/);
        expect (out).not.toContain ('dict_rows');
    });
    test ('negative: a builder that hands the list on whole keeps the Value parameter', () => {
        const out = run ('handon', '        const request = this.buildOrders (orders);\n        this.hold (request);\n', '        this.hold (orders);\n');
        expect (out).not.toMatch (/fn buildOrders\([^)]*Vec<crate::value::Dict>/);
    });
    test ('negative: a builder called with a boxed list keeps the Value parameter', () => {
        const out = run ('boxed', '        const list = this.hold (orders);\n        this.hold (this.buildOrders (list));\n');
        expect (out).not.toMatch (/fn buildOrders\([^)]*Vec<crate::value::Dict>/);
    });
});
