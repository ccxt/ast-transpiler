import { Transpiler } from '../src/transpiler';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// RF-go-6-D: an order-book side read `book['asks']` prints as the port's accessor when the checker type of the
// receiver is the book class and the Go local is retyped at its declaration (no nil can reach the read).

const BOOK = {
    'classes': [ 'OrderBook' ],
    'constructors': [ 'orderBook' ],
    'cacheReaders': [ 'safeValue' ],
    'type': 'OrderBookInterface',
    'sideType': 'IOrderBookSide',
    'unbox': 'OrderBookTyped',
    'sides': { 'asks': 'GetAsks', 'bids': 'GetBids' },
};

const HEAD = 'type Dict = { [key: string]: any };\n'
    + 'class Side { store (p: number, a: number) { return p + a; } }\n'
    + 'class OrderBook { asks: Side; bids: Side; reset (x: Dict) { return x; } }\n'
    + 'class Exchange {\n'
    + '    orderbooks: { [key: string]: OrderBook } = {};\n'
    + '    orderBook (snapshot = {}): OrderBook { return new OrderBook (); }\n'
    + '    safeValue (o: any, k: string): any { return o[k]; }\n'
    + '    handleDeltas (side: any, deltas: any) { return side; }\n';

const print = (body: string, book: any = BOOK): string => {
    const dir = fs.mkdtempSync (path.join (os.tmpdir (), 'rfgo6d-'));
    try {
        fs.mkdirSync (path.join (dir, 'ts', 'src', 'pro'), { 'recursive': true });
        const file = path.join (dir, 'ts', 'src', 'pro', 'x.ts');
        fs.writeFileSync (file, HEAD + body + '}\n');
        const config: any = { 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 } } };
        if (book !== null) {
            config.go.orderBook = book;
        }
        return new Transpiler (config).transpileGoByPath (file).content;
    } finally {
        fs.rmSync (dir, { 'recursive': true, 'force': true });
    }
};

const GUARDED = '    handle (symbol: string) {\n'
    + '        if (!(symbol in this.orderbooks)) {\n'
    + '            this.orderbooks[symbol] = this.orderBook ();\n'
    + '        }\n'
    + '        const orderbook = this.orderbooks[symbol];\n'
    + '        this.handleDeltas (orderbook[\'asks\'], []);\n'
    + '        this.handleDeltas (orderbook[\'bids\'], []);\n'
    + '    }\n';

describe('RF-go-6-D order book side reads', () => {
    test('a cache read behind its create-if-absent guard is typed and its sides print the accessors (fails on the base printer)', () => {
        const out = print (GUARDED);
        expect (out).toContain ('var orderbook OrderBookInterface = ');
        expect (out).toContain ('orderbook.GetAsks()');
        expect (out).toContain ('orderbook.GetBids()');
        expect (out).not.toContain ('GetValue(orderbook, "asks")');
        const base = print (GUARDED, null);
        expect (base).toContain ('GetValue(orderbook, "asks")');
        expect (base).not.toContain ('GetAsks()');
    });
    test('the proven entry unboxes with Go\'s own assertion, the nil-tolerant unboxer is kept when a repair guard follows', () => {
        expect (print (GUARDED)).toContain ('.(OrderBookInterface)');
        const repaired = print ('    handle (symbol: string) {\n'
            + '        let orderbook = this.safeValue (this.orderbooks, symbol);\n'
            + '        if (orderbook === undefined) {\n'
            + '            orderbook = this.orderBook ();\n'
            + '        }\n'
            + '        this.handleDeltas (orderbook[\'asks\'], []);\n'
            + '        this.orderbooks[symbol] = orderbook;\n'
            + '    }\n');
        expect (repaired).toContain ('OrderBookTyped(');
        expect (repaired).toContain ('orderbook.GetAsks()');
    });
    test('an early exit on `safeValue (cache, key) === undefined` proves the entry (fails on the base printer)', () => {
        const body = '    handle (keys: string[]) {\n'
            + '        for (let i = 0; i < keys.length; i++) {\n'
            + '            const symbol = keys[i];\n'
            + '            if (this.safeValue (this.orderbooks, symbol) === undefined) {\n                continue;\n            }\n'
            + '            const orderbook = this.orderbooks[symbol];\n'
            + '            this.handleDeltas (orderbook[\'asks\'], []);\n'
            + '        }\n    }\n';
        expect (print (body)).toContain ('orderbook.GetAsks()');
        expect (print (body, null)).not.toContain ('GetAsks()');
    });
    test('a constructor local needs no guard', () => {
        const out = print ('    handle () {\n        const orderbook = this.orderBook ();\n        this.handleDeltas (orderbook[\'asks\'], []);\n    }\n');
        expect (out).toContain ('orderbook.GetAsks()');
    });
    test('negative: an unguarded cache read can be nil, so the box and the helper stay', () => {
        const out = print ('    handle (symbol: string) {\n        const orderbook = this.orderbooks[symbol];\n        this.handleDeltas (orderbook[\'asks\'], []);\n    }\n');
        expect (out).not.toContain ('GetAsks()');
        expect (out).toContain ('GetValue(orderbook, "asks")');
    });
    test('negative: a local also written with a foreign value keeps the box', () => {
        const out = print ('    handle (symbol: string, other: any) {\n'
            + '        if (!(symbol in this.orderbooks)) {\n            this.orderbooks[symbol] = this.orderBook ();\n        }\n'
            + '        let orderbook = this.orderbooks[symbol];\n'
            + '        orderbook = other;\n'
            + '        this.handleDeltas (orderbook[\'asks\'], []);\n    }\n');
        expect (out).not.toContain ('GetAsks()');
    });
    test('negative: a key that is not a side stays a helper read', () => {
        const out = print ('    handle () {\n        const orderbook = this.orderBook ();\n        this.handleDeltas (orderbook[\'nonce\'], []);\n    }\n');
        expect (out).toContain ('GetValue(orderbook, "nonce")');
        expect (out).not.toContain ('GetAsks()');
        expect (out).not.toContain ('GetBids()');
    });
    test('a book handed to a handler parameter retypes it when every call site passes a typed book', () => {
        const out = print ('    handleBook (client: any, message: Dict, orderbook: OrderBook) {\n        this.handleDeltas (orderbook[\'asks\'], []);\n    }\n'
            + '    handleOther (client: any, symbol: string) {\n'
            + '        const book = this.orderBook ();\n'
            + '        this.handleBook (client, {}, book);\n'
            + '    }\n');
        expect (out).toContain ('orderbook OrderBookInterface');
        expect (out).toContain ('orderbook.GetAsks()');
    });
    test('negative: a book parameter with an unproven call site keeps the box', () => {
        const out = print ('    handleBook (client: any, message: Dict, orderbook: OrderBook) {\n        this.handleDeltas (orderbook[\'asks\'], []);\n    }\n'
            + '    handleOther (client: any, other: any) {\n'
            + '        this.handleBook (client, {}, other);\n'
            + '    }\n');
        expect (out).not.toContain ('GetAsks()');
    });
    test('a side read bound to a local types the local as the side interface', () => {
        const out = print ('    handle () {\n        const orderbook = this.orderBook ();\n        const asks = orderbook[\'asks\'];\n        this.handleDeltas (asks, []);\n    }\n');
        expect (out).toContain ('var asks IOrderBookSide = orderbook.GetAsks()');
    });
    test('without the config nothing changes', () => {
        expect (print (GUARDED, null)).not.toContain ('OrderBookInterface');
    });
});
