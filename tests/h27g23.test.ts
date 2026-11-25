import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler } from '../src/transpiler';

describe('go order-book side row reads', () => {
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
        const dir = fs.mkdtempSync (path.join (os.tmpdir (), 'h27g23-'));
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
    const BODY = (pre: string, read: string) => "const orderbook = this.orderbooks[symbol];\nconst asks = orderbook['asks'];\n" + pre
        + "const out = [];\nfor (let i = 0; i < 10; i++) {\n    if (i < 3) {\n        const lvl = " + read + ";\n        out.push (lvl);\n    }\n}\nreturn out;";
    test('a side row indexed by the loop counter after a length statement reads the data (fails on the base printer)', () => {
        const out = print (BODY ('const n = asks.length;\n', 'asks[i]'));
        expect (out).toContain ('asks.GetData()[i]');
        expect (out).not.toContain ('GetValue(asks, i)');
    });
    test('negative: no earlier length statement keeps the helper (nil side answers nil)', () => {
        const out = print (BODY ('', 'asks[i]'));
        expect (out).not.toContain ('GetData()');
    });
    test('negative: a string key keeps the helper', () => {
        const out = print (BODY ('const n = asks.length;\nconst k = this.safeString (message, "k");\n', 'asks[k]'));
        expect (out).not.toContain ('GetData()');
    });
    test('negative: a box local is not a side', () => {
        const out = print (BODY ('const n = asks.length;\nconst other = this.safeValue (message, "x");\n', 'other[i]'));
        expect (out).not.toContain ('GetData()');
    });
    test('negative: a counter rewritten in the body keeps the helper', () => {
        const out = print ("const orderbook = this.orderbooks[symbol];\nconst asks = orderbook['asks'];\nconst n = asks.length;\nconst out = [];\nfor (let i = 0; i < 10; i++) {\n    i = i + 1;\n    out.push (asks[i]);\n}\nreturn out;");
        expect (out).not.toContain ('GetData()');
    });
});
