import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler } from '../src/transpiler';

describe('h29-G15 go order-book field writes', () => {
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
            'nonce': { 'method': 'SetNonce', 'value': '^this\\.SafeInteger\\(', 'type': '*int64' },
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
        + '    safeString (o: any, k: string): string | undefined { return o[k]; }\n'
        + '    handleDeltas (side: any, deltas: any[]) { return side; }\n';
    const print = (body: string): string => {
        const dir = fs.mkdtempSync (path.join (os.tmpdir (), 'h29g15-'));
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
    test('rebound in the nil branch, reset in the else: the setter is called (fails on the base printer)', () => {
        const out = print ("let orderbook = this.safeValue (this.orderbooks, symbol);\nif (orderbook === undefined) {\n    orderbook = this.orderBook ();\n} else {\n    orderbook.reset ();\n}\nconst sym = this.safeString (message, 's');\norderbook['symbol'] = sym;\nreturn orderbook;");
        expect (out).toContain ('orderbook.SetSymbol(sym)');
        expect (out).not.toContain ('AddElementToObject(orderbook, \"symbol\"');
    });
    test('stored then re-read in the nil branch: the setter is called (fails on the base printer)', () => {
        const out = print ("let orderbook = this.safeValue (this.orderbooks, symbol);\nif (orderbook === undefined) {\n    this.orderbooks[symbol] = this.orderBook ({});\n    orderbook = this.orderbooks[symbol];\n}\nconst sym = this.safeString (message, 's');\norderbook['symbol'] = sym;\nreturn orderbook;");
        expect (out).toContain ('orderbook.SetSymbol(sym)');
    });
    test('negative: the nil branch rebinds to a value that is not a book', () => {
        const out = print ("let orderbook = this.safeValue (this.orderbooks, symbol);\nif (orderbook === undefined) {\n    orderbook = this.safeValue (message, 'b');\n}\nconst sym = this.safeString (message, 's');\norderbook['symbol'] = sym;\nreturn orderbook;");
        expect (out).not.toContain ('orderbook.SetSymbol(');
    });
    test('negative: a second write of the local elsewhere (may be nil at the use)', () => {
        const out = print ("let orderbook = this.safeValue (this.orderbooks, symbol);\nif (orderbook === undefined) {\n    orderbook = this.orderBook ();\n}\nif (type === 'z') {\n    orderbook = this.safeValue (this.orderbooks, 'k');\n}\nconst sym = this.safeString (message, 's');\norderbook['symbol'] = sym;\nreturn orderbook;");
        expect (out).not.toContain ('orderbook.SetSymbol(');
    });
    test('negative: the use sits before the guard', () => {
        const out = print ("let orderbook = this.safeValue (this.orderbooks, symbol);\nconst sym = this.safeString (message, 's');\norderbook['symbol'] = sym;\nif (orderbook === undefined) {\n    orderbook = this.orderBook ();\n}\nreturn orderbook;");
        expect (out).not.toContain ('orderbook.SetSymbol(');
    });
    test('negative: the store is under another key', () => {
        const out = print ("let orderbook = this.safeValue (this.orderbooks, symbol);\nif (orderbook === undefined) {\n    this.orderbooks['k'] = this.orderBook ({});\n    orderbook = this.orderbooks[symbol];\n}\nconst sym = this.safeString (message, 's');\norderbook['symbol'] = sym;\nreturn orderbook;");
        expect (out).not.toContain ('orderbook.SetSymbol(');
    });
});
