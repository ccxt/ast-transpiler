import { Transpiler } from '../src/transpiler';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// handleBookDelta slot 0 (`orderbook: WsOrderBook` on the base and every pro override) lends the optional book.
describe('rust: the handleBookDelta orderbook slot is a lent optional book', () => {
    const mk = (override: string) => {
        const root = fs.mkdtempSync (path.join (os.tmpdir (), 'astfx-bookdelta-'));
        const files: Record<string, string> = {
            'ts/src/base/ws/OrderBook.ts': "export class WsOrderBook {\n    [key: string]: any;\n    cache: any[] = [];\n    constructor (snapshot: any = {}, depth: any = undefined) {}\n}\n",
            'ts/src/base/Exchange.ts': "import { WsOrderBook } from './ws/OrderBook.js';\nexport interface Dictionary<T> { [key: string]: T }\nexport default class Exchange {\n    orderbooks: Dictionary<WsOrderBook> = {};\n    safeInteger (o: any, k: any, d: any = undefined): any { return o[k]; }\n    handleBookDelta (orderbook: WsOrderBook, delta: any) {\n        throw new Error ('not supported');\n    }\n}\n",
            'ts/src/pro/venue.ts': "import Exchange from '../base/Exchange.js';\nimport { WsOrderBook } from '../base/ws/OrderBook.js';\nexport default class venue extends Exchange {\n    handleBook (symbol: string, delta: any) {\n        const book = this.orderbooks[symbol];\n        this.handleBookDelta (book, delta);\n        book['nonce'] = 1;\n    }\n" + override + "}\n",
        };
        for (const [rel, text] of Object.entries (files)) {
            fs.mkdirSync (path.dirname (path.join (root, rel)), { recursive: true });
            fs.writeFileSync (path.join (root, rel), text);
        }
        const t = new Transpiler ({ 'verbose': false, 'rust': { 'parser': { 'NUM_LINES_END_FILE': 0 } } });
        return { venue: t.transpileRustByPath (path.join (root, 'ts/src/pro/venue.ts')).content, base: t.transpileRustByPath (path.join (root, 'ts/src/base/Exchange.ts')).content };
    };
    test('base, override and caller agree on the lent book', () => {
        const out = mk ("    override handleBookDelta (orderbook: WsOrderBook, delta: any) {\n        orderbook['nonce'] = this.safeInteger (delta, 'u');\n        const n = this.safeInteger (orderbook, 'nonce');\n        const bids = orderbook['bids'];\n        bids.storeArray (delta);\n    }\n");
        expect (out.venue).toMatch (/fn handleBookDelta\(&self, orderbook: &mut Option<crate::pro::order_book::Book>, /);
        expect (out.base).toMatch (/fn handleBookDelta\(&self, orderbook: &mut Option<crate::pro::order_book::Book>, /);
        expect (out.venue).toContain ('self.handleBookDelta(&mut book, ');
        expect (out.venue).toContain ('orderbook.set_book_meta("nonce", ');
        expect (out.venue).toContain ('Value::from(&*orderbook)');
        expect (out.venue).toContain ('orderbook.book_field("bids")');
        expect (out.venue).not.toContain ('__orderbook_empty');
    });
    test('negative: an override writing a non-meta key of the book fails loudly', () => {
        expect (() => mk ("    override handleBookDelta (orderbook: WsOrderBook, delta: any) {\n        orderbook['x'] = delta;\n    }\n")).toThrow (/book group handleBookDelta/);
    });
    test('negative: an override reassigning the book fails loudly', () => {
        expect (() => mk ("    override handleBookDelta (orderbook: WsOrderBook, delta: any) {\n        orderbook = undefined;\n    }\n")).toThrow (/book group handleBookDelta/);
    });
});
