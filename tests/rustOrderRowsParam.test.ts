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
