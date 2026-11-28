import { Transpiler } from '../src/transpiler';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';

jest.mock ('module', () => ({ __esModule: true, default: jest.fn () }));

// a venue-private method declared `Promise<Order[]>` whose every return is a list it builds returns the native list
const run = (body: string) => {
    const root = fs.mkdtempSync (path.join (os.tmpdir (), 'own-order-list-'));
    fs.mkdirSync (path.join (root, 'ts/src/base'), { recursive: true });
    fs.writeFileSync (path.join (root, 'ts/src/base/Exchange.ts'), "export interface Dict { [key: string]: any }\nexport interface Order { info: any; id: string; }\nexport default class Exchange {\n    keep (p: any): any { return p; }\n    parseOrders (orders: any, market: any = undefined, since: any = undefined, limit: any = undefined): Order[] { return []; }\n}\n");
    fs.writeFileSync (path.join (root, 'ts/src/venue.ts'), "import Exchange from './base/Exchange.js';\nimport type { Dict, Order } from './base/Exchange.js';\nexport default class venue extends Exchange {\n" + body + "}\n");
    const t = new Transpiler ({ 'verbose': false, 'rust': { 'parser': { 'NUM_LINES_END_FILE': 0 } } });
    try {
        return t.transpileRustByPath (path.join (root, 'ts/src/venue.ts')).content;
    } finally {
        fs.rmSync (root, { recursive: true, force: true });
    }
};

describe ('rust venue-private Order[] return', () => {
    test ('a literal list return is the native list', () => {
        const out = run ("    async fetchOrdersByState (state: string, params: Dict = {}): Promise<Order[]> {\n        return [ { 'info': params, 'id': state } ];\n    }\n");
        expect (out).toMatch (/fn fetchOrdersByState\([^\n]*\) -> crate::value::List \{/);
    });
    test ('negative: a return of an any value (nil may come back) keeps Value', () => {
        const out = run ("    async fetchOrdersByState (state: string, params: Dict = {}): Promise<Order[]> {\n        return this.keep (params) as Order[];\n    }\n");
        expect (out).toMatch (/fn fetchOrdersByState\([^\n]*\) -> Value \{/);
    });
    test ('negative: an undefined return keeps Value', () => {
        const out = run ("    async fetchOrdersByState (state: string, params: Dict = {}): Promise<Order[]> {\n        if (state === 'x') {\n            return undefined;\n        }\n        return [ { 'info': params, 'id': state } ];\n    }\n");
        expect (out).toMatch (/fn fetchOrdersByState\([^\n]*\) -> Value \{/);
    });
});
