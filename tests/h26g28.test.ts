import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler } from '../src/transpiler';

describe('go order-book field writes through the typed setters', () => {
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
            'datetime': { 'method': 'SetDatetime', 'value': '^this\\.Iso8601\\(', 'type': '*string' },
            'symbol': { 'method': 'SetSymbol', 'value': '^this\\.SafeSymbol\\(', 'type': '*string' },
        },
        'clears': { 'accessor': 'Fields', 'fields': { 'nonce': 'Nonce', 'timestamp': 'Timestamp', 'datetime': 'Datetime' } },
    };
    const HEAD = 'type Dict = { [key: string]: any };\n'
        + 'class Side { store (p: number, a: number) { return p + a; } }\n'
        + 'class WsOrderBook { asks: Side; bids: Side; cache: any[]; timestamp: number; datetime: string; nonce: number; symbol: string; reset (x: Dict = {}) { return x; } limit () { return this; } }\n'
        + 'class Exchange {\n'
        + '    orderbooks: Dictionary<WsOrderBook> = {};\n'
        + '    orderBook (snapshot = {}, limit: number = undefined): WsOrderBook { return new WsOrderBook (); }\n'
        + '    safeValue (o: any, k: string, d: any = undefined): any { return o[k]; }\n'
        + '    safeInteger (o: any, k: string): number | undefined { return o[k]; }\n'
        + '    parseToInt (o: any): number { return o; }\n'
        + '    iso8601 (o: any): string | undefined { return o; }\n'
        + '    safeString (o: any, k: string): string | undefined { return o[k]; }\n';
    const print = (body: string, params = 'message: Dict, symbol: string'): string => {
        const dir = fs.mkdtempSync (path.join (os.tmpdir (), 'h26g28-'));
        try {
            fs.mkdirSync (path.join (dir, 'ts', 'src', 'base'), { 'recursive': true });
            fs.mkdirSync (path.join (dir, 'ts', 'src', 'pro'), { 'recursive': true });
            const file = path.join (dir, 'ts', 'src', 'pro', 'x.ts');
            fs.writeFileSync (path.join (dir, 'ts', 'src', 'base', 'Exchange.ts'), 'type Dictionary<T> = { [key: string]: T };\n' + HEAD + '}\nexport { WsOrderBook };\nexport default Exchange;\n');
            fs.writeFileSync (file, 'type Dict = { [key: string]: any };\nimport Exchange, { WsOrderBook } from \'../base/Exchange.js\';\nclass x extends Exchange {\n    handleOrderBook (' + params + ') {\n' + body + '\n    }\n}\n');
            const config: any = { 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 }, 'orderBook': BOOK } };
            return new Transpiler (config).transpileGoByPath (file).content;
        } finally {
            fs.rmSync (dir, { 'recursive': true, 'force': true });
        }
    };
    const SIDES = "const orderbook = this.orderbooks[symbol];\nconst side = this.safeString (message, 'side');\nconst ts = this.safeInteger (message, 'ts');\n"
        + "if (side === 'sell') {\n    const asks = orderbook['asks'];\n    asks.store (1, 2);\n} else {\n    const bids = orderbook['bids'];\n    bids.store (1, 2);\n}\n";
    test('a cache book read in both branches of an earlier if/else takes the setters (fails on the base printer)', () => {
        const out = print (SIDES + "orderbook['timestamp'] = ts;\norderbook['datetime'] = this.iso8601 (ts);\nreturn orderbook;");
        expect (out).toContain ('orderbook.SetTimestamp(ts)');
        expect (out).toContain ('orderbook.SetDatetime(this.Iso8601(ts))');
        expect (out).not.toContain ('AddElementToObject(orderbook');
    });
    test('a book read right after a both-branch store takes the setter', () => {
        const out = print ("if (!(symbol in this.orderbooks)) {\n    if (message['a']) {\n        this.orderbooks[symbol] = this.orderBook ({});\n    } else {\n        this.orderbooks[symbol] = this.orderBook ({}, 5);\n    }\n    const orderbook = this.orderbooks[symbol];\n    const s = this.safeString (message, 's');\n    orderbook['symbol'] = s;\n}");
        expect (out).toContain ('orderbook.SetSymbol(s)');
    });
    test('negative: no earlier side read in every branch keeps the helper', () => {
        const out = print ("const orderbook = this.orderbooks[symbol];\nconst ts = this.safeInteger (message, 'ts');\nif (ts !== undefined) {\n    const asks = orderbook['asks'];\n    asks.store (1, 2);\n}\norderbook['timestamp'] = ts;\nreturn orderbook;");
        expect (out).not.toContain ('orderbook.SetTimestamp(');
        expect (out).toContain ('AddElementToObject(orderbook, "timestamp", ts)');
    });
    test('negative: a value not of the setter type keeps the helper', () => {
        const out = print (SIDES + "const raw = message['ts'];\norderbook['timestamp'] = raw;\nreturn orderbook;");
        expect (out).not.toContain ('orderbook.SetTimestamp(');
    });
    test('negative: a rebound book keeps the helper (the earlier read proves another value)', () => {
        const out = print ("let orderbook = this.orderbooks[symbol];\nconst ts = this.safeInteger (message, 'ts');\nif (ts === undefined) {\n    const asks = orderbook['asks'];\n    asks.store (1, 2);\n} else {\n    const bids = orderbook['bids'];\n    bids.store (1, 2);\n}\norderbook = this.orderbooks['x'];\norderbook['timestamp'] = ts;\nreturn orderbook;");
        expect (out).not.toContain ('orderbook.SetTimestamp(');
    });
    test('negative: a nil-capable parameter book with no earlier deref keeps the helper', () => {
        const out = print ("const ts = this.safeInteger (message, 'ts');\norderbook['timestamp'] = ts;", 'message: Dict, orderbook: WsOrderBook');
        expect (out).not.toContain ('orderbook.SetTimestamp(');
    });
});
