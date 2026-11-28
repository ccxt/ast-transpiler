import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler } from '../src/transpiler';

describe('go order-book field write after an if/else presence guard', () => {
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
        + '    iso8601 (o: any): string | undefined { return o; }\n'
        + '    safeString (o: any, k: string): string | undefined { return o[k]; }\n';
    const print = (body: string): string => {
        const dir = fs.mkdtempSync (path.join (os.tmpdir (), 'h28g17-'));
        try {
            fs.mkdirSync (path.join (dir, 'ts', 'src', 'base'), { 'recursive': true });
            fs.mkdirSync (path.join (dir, 'ts', 'src', 'pro'), { 'recursive': true });
            const file = path.join (dir, 'ts', 'src', 'pro', 'x.ts');
            fs.writeFileSync (path.join (dir, 'ts', 'src', 'base', 'Exchange.ts'), 'type Dictionary<T> = { [key: string]: T };\n' + HEAD + '}\nexport { WsOrderBook };\nexport default Exchange;\n');
            fs.writeFileSync (file, 'type Dict = { [key: string]: any };\nimport Exchange, { WsOrderBook } from \'../base/Exchange.js\';\nclass x extends Exchange {\n    handleOrderBook (message: Dict, symbol: string, type: string) {\n' + body + '\n    }\n}\n');
            const config: any = { 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 }, 'orderBook': BOOK } };
            return new Transpiler (config).transpileGoByPath (file).content;
        } finally {
            fs.rmSync (dir, { 'recursive': true, 'force': true });
        }
    };
    const TAIL = "const orderbook = this.orderbooks[symbol];\nconst ts = this.safeInteger (message, 't');\norderbook['timestamp'] = ts;\nreturn orderbook;";
    test('both arms end with a presence guard: the setter is called (fails on the base printer)', () => {
        const out = print ("if (type === 'snapshot') {\n    if (!(symbol in this.orderbooks)) {\n        this.orderbooks[symbol] = this.orderBook ({});\n    }\n} else if (!(symbol in this.orderbooks)) {\n    return undefined;\n}\n" + TAIL);
        expect (out).toContain ('orderbook.SetTimestamp(ts)');
        expect (out).not.toContain ('AddElementToObject(orderbook, "timestamp"');
    });
    test('negative: the else arm does not ensure the entry (nil book stays a helper no-op)', () => {
        const out = print ("if (type === 'snapshot') {\n    if (!(symbol in this.orderbooks)) {\n        this.orderbooks[symbol] = this.orderBook ({});\n    }\n} else {\n    const x = 1;\n}\n" + TAIL);
        expect (out).not.toContain ('orderbook.SetTimestamp(');
    });
    test('negative: the guard in one arm is not its last statement', () => {
        const out = print ("if (type === 'snapshot') {\n    if (!(symbol in this.orderbooks)) {\n        this.orderbooks[symbol] = this.orderBook ({});\n    }\n    delete this.orderbooks[symbol];\n} else if (!(symbol in this.orderbooks)) {\n    return undefined;\n}\n" + TAIL);
        expect (out).not.toContain ('orderbook.SetTimestamp(');
    });
    test('negative: a guard on another key proves nothing', () => {
        const out = print ("const other = 'x';\nif (type === 'snapshot') {\n    if (!(other in this.orderbooks)) {\n        this.orderbooks[other] = this.orderBook ({});\n    }\n} else if (!(other in this.orderbooks)) {\n    return undefined;\n}\n" + TAIL);
        expect (out).not.toContain ('orderbook.SetTimestamp(');
    });
});
