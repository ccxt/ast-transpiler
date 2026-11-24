import { Transpiler } from '../src/transpiler';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// the length of a typed owner: a typed cache field reads its size, a typed book local's delta buffer reads len()
const base = 'export interface Dict { [key: string]: any }\nexport type Int = number | undefined;\n' +
    'export class ArrayCache extends Array<any> { hashmap: Dict = {}; }\n' +
    'export class OrderBook { bids: any; asks: any; cache: any[] = []; nonce: Int = undefined; }\n' +
    'export default class Exchange {\n    orders: ArrayCache = undefined;\n    orderbooks: Dict = {};\n' +
    '    orderBook (s: any = {}, d: any = undefined): OrderBook { return new OrderBook (); }\n' +
    '    safeValue (o: any, k: any, d: any = undefined): any { return o; }\n' +
    '    safeInteger (o: any, k: any, d: any = undefined): Int { return o; }\n' +
    '    parseToInt (x: any): Int { return x; }\n    hold (x: any): any { return x; }\n}\n';
const venue = "import Exchange from '../base/Exchange.js';\nimport type { Dict, Int } from '../base/Exchange.js';\n" +
    'export default class venue extends Exchange {\n' +
    '    resolveOrders () {\n        const length = this.orders.length;\n        if (length > 0) {\n            this.hold (length);\n        }\n    }\n' +
    "    buffer (symbol: string, delta: Dict) {\n        const storedOrderBook = this.orderBook ({}, 10);\n        const nonce = this.safeInteger (storedOrderBook, 'nonce');\n        if (nonce === undefined) {\n            const cacheLength = this.parseToInt (storedOrderBook.cache.length);\n            this.hold (cacheLength);\n            storedOrderBook.cache.push (delta);\n            return;\n        }\n        this.hold (storedOrderBook);\n    }\n" +
    '    other (x: any) {\n        const n = x.cache.length;\n        this.hold (n);\n    }\n}\n';

describe ('rust length of a typed cache field and of a typed book buffer', () => {
    let out = '';
    let root = '';
    beforeAll (() => {
        root = fs.mkdtempSync (path.join (os.tmpdir (), 'h48r57-'));
        fs.mkdirSync (path.join (root, 'ts', 'src', 'base'), { recursive: true });
        fs.mkdirSync (path.join (root, 'ts', 'src', 'pro'), { recursive: true });
        fs.writeFileSync (path.join (root, 'ts', 'src', 'base', 'Exchange.ts'), base);
        fs.writeFileSync (path.join (root, 'ts', 'src', 'pro', 'venue.ts'), venue);
        const transpiler = new Transpiler ({ 'verbose': false, 'rust': { 'parser': { 'NUM_LINES_END_FILE': 0 } } } as any);
        out = transpiler.transpileRustByPath (path.join (root, 'ts', 'src', 'pro', 'venue.ts')).content;
    });
    afterAll (() => fs.rmSync (root, { recursive: true, force: true }));
    test ('this.orders.length reads the typed cache size', () => {
        expect (out).toContain ('CacheSlot::size(&self.orders)');
        expect (out).not.toContain ('get_array_length(&Value::from(&self.orders))');
    });
    test ('a typed book local buffer length is a native len()', () => {
        expect (out).toContain ('storedOrderBook.book_field("cache").len() as i64');
        expect (out).not.toContain ('get_array_length(&storedOrderBook');
    });
    test ('negative: an untyped receiver keeps the helper', () => {
        expect (out).toMatch (/get_array_length\(/);
    });
});
