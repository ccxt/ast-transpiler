import { Transpiler } from '../src/transpiler';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// handleBookDelta / handleBookDeltas declare `orderbook: WsOrderBook`: the base and every override print the book
// interface, and the side reads on that parameter print its accessors. A forwarding pro handler follows its callee.

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
    + 'type WsOrderBook = OrderBook;\n';

const BASE = HEAD
    + 'class Exchange {\n'
    + '    orderBook (snapshot = {}): OrderBook { return new OrderBook (); }\n'
    + '    safeValue (o: any, k: string): any { return o[k]; }\n'
    + '    handleBookDeltas (orderbook: WsOrderBook, deltas: any[]) {\n'
    + '        for (let i = 0; i < deltas.length; i++) {\n'
    + '            this.handleBookDelta (orderbook, this.safeValue (deltas, String (i)));\n'
    + '        }\n'
    + '    }\n'
    + '    handleBookDelta (orderbook: WsOrderBook, delta: any) {\n'
    + '        throw new Error (\'not supported\');\n'
    + '    }\n'
    + '}\n';

const print = (relative: string, source: string, book: any = BOOK): string => {
    const dir = fs.mkdtempSync (path.join (os.tmpdir (), 'bookdelta-'));
    try {
        const file = path.join (dir, 'ts', 'src', relative);
        fs.mkdirSync (path.dirname (file), { 'recursive': true });
        fs.writeFileSync (file, source);
        const config: any = { 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 } } };
        if (book !== null) {
            config.go.orderBook = book;
        }
        return new Transpiler (config).transpileGoByPath (file).content;
    } finally {
        fs.rmSync (dir, { 'recursive': true, 'force': true });
    }
};

const PRO = HEAD
    + 'class Exchange {\n'
    + '    orderbooks: { [key: string]: OrderBook } = {};\n'
    + '    orderBook (snapshot = {}): OrderBook { return new OrderBook (); }\n'
    + '    safeValue (o: any, k: string): any { return o[k]; }\n'
    + '    handleBookDelta (orderbook: WsOrderBook, delta: any) {}\n'
    + '}\n'
    + 'class ex extends Exchange {\n'
    + '    override handleBookDelta (orderbook: WsOrderBook, delta: any) {\n'
    + '        const bids = orderbook[\'bids\'];\n'
    + '        const asks = orderbook[\'asks\'];\n'
    + '        bids.store (1, 2);\n'
    + '        asks.store (1, 2);\n'
    + '    }\n'
    + '    handleOrderBookMessage (client: any, message: Dict, orderbook: WsOrderBook) {\n'
    + '        this.handleBookDelta (orderbook, message);\n'
    + '    }\n'
    + '    fromCache (symbol: string) {\n'
    + '        const book: WsOrderBook = this.safeValue (this.orderbooks, symbol);\n'
    + '        this.handleBookDelta (book, 1);\n'
    + '    }\n'
    + '    handleTyped (client: any, message: Dict) {\n'
    + '        const book = this.orderBook ();\n'
    + '        this.handleOrderBookMessage (client, message, book);\n'
    + '    }\n'
    + '}\n';

describe('handleBookDelta book parameter', () => {
    test('the base methods print the book interface (fails on the base printer)', () => {
        const out = print ('base/Exchange.ts', BASE);
        expect (out).toContain ('HandleBookDeltas(orderbook OrderBookInterface, deltas any)');
        expect (out).toContain ('HandleBookDelta(orderbook OrderBookInterface, delta any)');
    });

    test('an override prints the book interface and its side reads the accessors (fails on the base printer)', () => {
        const out = print ('pro/ex.ts', PRO);
        expect (out).toContain ('HandleBookDelta(orderbook OrderBookInterface, delta any)');
        expect (out).toContain ('orderbook.GetBids()');
        expect (out).toContain ('orderbook.GetAsks()');
        expect (out).not.toContain ('GetValue(orderbook, "bids")');
    });

    test('a handler that forwards its book follows the callee when every caller passes a book', () => {
        const out = print ('pro/ex.ts', PRO);
        expect (out).toContain ('HandleOrderBookMessage(client any, message map[string]any, orderbook OrderBookInterface)');
    });

    test('a handler with a caller that does not pass a book keeps the box', () => {
        const out = print ('pro/ex.ts', PRO.replace ('this.handleOrderBookMessage (client, message, book);', 'this.handleOrderBookMessage (client, message, message);'));
        expect (out).toContain ('HandleOrderBookMessage(client any, message map[string]any, orderbook any)');
        expect (out).toContain ('HandleBookDelta(orderbook OrderBookInterface, delta any)');
    });

    test('a book parameter written with a foreign value keeps the box', () => {
        const out = print ('pro/ex.ts', PRO.replace ('const bids = orderbook[\'bids\'];', 'orderbook = undefined;\n        const bids = orderbook[\'bids\'];'));
        expect (out).toContain ('func (this *ex) HandleBookDelta(orderbook any, delta any)');
        expect (out).toContain ('GetValue(orderbook, "bids")');
    });

    test('without the book config nothing changes', () => {
        const out = print ('base/Exchange.ts', BASE, null);
        expect (out).toContain ('HandleBookDelta(orderbook any, delta any)');
        expect (out).not.toContain ('OrderBookInterface');
    });
});
