import { Transpiler } from '../src/transpiler';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// FOLD3 hx11w9: BaseExchange.orderbooks is the typed OrderBookCache. Its reads, stores, membership tests and deletes
// print the cache's own methods, book locals are typed OrderBookInterface, and the member assertion is only printed on a box.

const BOOK = {
    'classes': [ 'OrderBook', 'WsOrderBook' ],
    'constructors': [ 'orderBook', 'indexedOrderBook', 'countedOrderBook' ],
    'cacheReaders': [ 'safeValue' ],
    'type': 'OrderBookInterface',
    'sideType': 'IOrderBookSide',
    'unbox': 'OrderBookTyped',
    'sides': { 'asks': 'GetAsks', 'bids': 'GetBids' },
    'setters': {
        'timestamp': { 'method': 'SetTimestamp', 'value': '^this\\.(?:Parse8601|SafeInteger)\\(', 'type': '*int64' },
    },
};

const HEAD = 'type Dict = { [key: string]: any };\n'
    + 'class Side { store (p: number, a: number) { return p + a; } }\n'
    + 'class WsOrderBook { asks: Side; bids: Side; cache: any[]; timestamp: number; reset (x: Dict = {}) { return x; } limit () { return this; } }\n'
    + 'class Exchange {\n'
    + '    orderbooks: Dictionary<WsOrderBook> = {};\n'
    + '    orderBook (snapshot = {}): WsOrderBook { return new WsOrderBook (); }\n'
    + '    safeValue (o: any, k: string, d: any = undefined): any { return o[k]; }\n'
    + '    safeDict (o: any, k: string, d: any = undefined): any { return o[k]; }\n'
    + '    safeInteger (o: any, k: string): number | undefined { return o[k]; }\n';

const print = (body: string, book: any = BOOK): string => {
    const dir = fs.mkdtempSync (path.join (os.tmpdir (), 'fold3ob-'));
    try {
        fs.mkdirSync (path.join (dir, 'ts', 'src', 'base'), { 'recursive': true });
        fs.mkdirSync (path.join (dir, 'ts', 'src', 'pro'), { 'recursive': true });
        const file = path.join (dir, 'ts', 'src', 'pro', 'x.ts');
        const base = path.join (dir, 'ts', 'src', 'base', 'Exchange.ts');
        fs.writeFileSync (base, 'type Dictionary<T> = { [key: string]: T };\n' + HEAD + '}\nexport default Exchange;\n');
        fs.writeFileSync (file, 'import Exchange from \'../base/Exchange.js\';\n' + body);
        const config: any = { 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 } } };
        if (book !== null) {
            config.go.orderBook = book;
        }
        return new Transpiler (config).transpileGoByPath (file).content;
    } finally {
        fs.rmSync (dir, { 'recursive': true, 'force': true });
    }
};

const HANDLER = 'class x extends Exchange {\n'
    + '    handle (symbol: string, snapshot: Dict) {\n'
    + '        if (!(symbol in this.orderbooks)) {\n'
    + '            this.orderbooks[symbol] = this.orderBook ();\n'
    + '        }\n'
    + '        const orderbook = this.orderbooks[symbol];\n'
    + '        orderbook.reset (snapshot);\n'
    + '        orderbook.cache.push (snapshot);\n'
    + '        orderbook.cache = [];\n'
    + '        const stored = this.safeValue (this.orderbooks, symbol, this.orderBook ());\n'
    + '        stored.limit ();\n'
    + '        delete this.orderbooks[symbol];\n'
    + '    }\n'
    + '}\n';

describe('FOLD3 hx11w9 order book cache', () => {
    test('cache reads, stores, membership and deletes print the cache methods (fails on the base printer)', () => {
        const out = print (HANDLER);
        expect (out).toContain ('this.Orderbooks.Has(symbol)');
        expect (out).toContain ('this.Orderbooks.Store(symbol, this.OrderBook())');
        expect (out).toContain ('this.Orderbooks.Get(symbol)');
        expect (out).toContain ('this.Orderbooks.GetOr(symbol, this.OrderBook())');
        expect (out).toContain ('this.Orderbooks.Delete(symbol)');
        expect (out).not.toContain ('InOp(this.Orderbooks');
        expect (out).not.toContain ('AddElementToObject(this.Orderbooks');
        const base = print (HANDLER, null);
        expect (base).toContain ('InOp(this.Orderbooks');
        expect (base).not.toContain ('this.Orderbooks.Has(');
    });
    test('a local whose writes are cache reads is the interface and its members need no assertion', () => {
        const out = print (HANDLER);
        expect (out).toContain ('var orderbook OrderBookInterface = this.Orderbooks.Get(symbol)');
        expect (out).toContain ('orderbook.Reset(snapshot)');
        expect (out).toContain ('orderbook.SetCache([]any{})');
        expect (out).not.toContain ('.(OrderBookInterface)');
    });
    test('a box local keeps the assertion at the member access', () => {
        const out = print ('class x extends Exchange {\n    handle (symbol: string, box: any) {\n        box.reset ({});\n        box.limit ();\n    }\n}\n');
        expect (out).toContain ('box.(OrderBookInterface).Reset(');
        expect (out).toContain ('box.(OrderBookInterface).Limit()');
    });
    test('a nil-declared book local written by a constructor and a cache read is typed', () => {
        const out = print ('class x extends Exchange {\n    handle (symbol: string) {\n        let orderbook: WsOrderBook | undefined = undefined;\n'
            + '        if (symbol === \'a\') {\n            orderbook = this.orderBook ();\n        } else {\n            orderbook = this.orderbooks[symbol];\n        }\n        orderbook.limit ();\n    }\n}\n');
        expect (out).toContain ('var orderbook OrderBookInterface');
        expect (out).not.toContain ('var orderbook any');
    });
    test('the setter prints on a constructor-built book and keeps the helper on a box', () => {
        const out = print ('class x extends Exchange {\n    handle (symbol: string, data: Dict, box: any) {\n        const orderbook = this.orderBook ();\n'
            + '        orderbook.limit ();\n        orderbook[\'timestamp\'] = this.safeInteger (data, \'ts\');\n        box[\'timestamp\'] = this.safeInteger (data, \'ts\');\n    }\n}\n');
        expect (out).toContain ('orderbook.SetTimestamp(this.SafeInteger(data, "ts"))');
        expect (out).toContain ('AddElementToObject(box, "timestamp"');
    });
    test('negative: a local also written with a foreign value stays a box', () => {
        const out = print ('class x extends Exchange {\n    handle (symbol: string, other: any) {\n        let orderbook: any = this.orderbooks[symbol];\n        orderbook = other;\n        orderbook.limit ();\n    }\n}\n');
        expect (out).not.toContain ('var orderbook OrderBookInterface');
    });
    test('negative: without the config nothing changes', () => {
        expect (print (HANDLER, null)).not.toContain ('Orderbooks.Get(');
    });
});
