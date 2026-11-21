import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler } from '../src/transpiler';

describe ('go order-book writes behind an early-return guard', () => {
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
        'clears': { 'accessor': 'Fields', 'fields': { 'nonce': 'Nonce', 'timestamp': 'Timestamp', 'datetime': 'Datetime' } },
    };
    const HEAD = 'type Dict = { [key: string]: any };\n'
        + 'class Side { store (p: number, a: number) { return p + a; } }\n'
        + 'class WsOrderBook { asks: Side; bids: Side; cache: any[]; timestamp: number; datetime: string; nonce: number; reset (x: Dict = {}) { return x; } limit () { return this; } }\n'
        + 'class Exchange {\n'
        + '    orderbooks: Dictionary<WsOrderBook> = {};\n'
        + '    orderBook (snapshot = {}): WsOrderBook { return new WsOrderBook (); }\n'
        + '    safeValue (o: any, k: string, d: any = undefined): any { return o[k]; }\n'
        + '    safeInteger (o: any, k: string): number | undefined { return o[k]; }\n'
        + '    safeString (o: any, k: string): string | undefined { return o[k]; }\n';
    const print = (body: string): string => {
        const dir = fs.mkdtempSync (path.join (os.tmpdir (), 'h18g11-'));
        try {
            fs.mkdirSync (path.join (dir, 'ts', 'src', 'base'), { 'recursive': true });
            fs.mkdirSync (path.join (dir, 'ts', 'src', 'pro'), { 'recursive': true });
            const file = path.join (dir, 'ts', 'src', 'pro', 'x.ts');
            fs.writeFileSync (path.join (dir, 'ts', 'src', 'base', 'Exchange.ts'), 'type Dictionary<T> = { [key: string]: T };\n' + HEAD + '}\nexport { WsOrderBook };\nexport default Exchange;\n');
            fs.writeFileSync (file, 'import Exchange, { WsOrderBook } from \'../base/Exchange.js\';\n' + body);
            const config: any = { 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 }, 'orderBook': BOOK } };
            return new Transpiler (config).transpileGoByPath (file).content;
        } finally {
            fs.rmSync (dir, { 'recursive': true, 'force': true });
        }
    };
    const cls = (body: string) => 'class x extends Exchange {\n    sub (symbol: string, other: any, flag: boolean) {\n' + body + '    }\n}\n';

    test ('an early-return nil guard proves the book', () => {
        const out = print (cls ('        const stored = this.safeValue (this.orderbooks, symbol);\n'
            + '        if ((stored === undefined) || flag) {\n            return;\n        }\n'
            + '        stored[\'nonce\'] = undefined;\n'));
        expect (out).toContain ('stored.Fields().Nonce = nil');
        expect (out).not.toContain ('AddElementToObject(stored');
    });

    test ('an `x as string` key and a `!(k in c) || other` guard name the same entry', () => {
        const sym = 'const s = this.safeString (other, \'s\');\n';
        const out = print (cls ('        ' + sym
            + '        if (!((s as string) in this.orderbooks) || flag) {\n            this.orderbooks[s as string] = this.orderBook ({});\n        }\n'
            + '        const orderbook = this.orderbooks[s as string];\n        orderbook[\'nonce\'] = undefined;\n'));
        expect (out).toContain ('orderbook.Fields().Nonce = nil');
        const elseArm = print (cls ('        if (!(symbol in this.orderbooks) || flag) {\n            this.orderbooks[symbol] = this.orderBook ({});\n'
            + '        } else {\n            const orderbook = this.orderbooks[symbol];\n            orderbook[\'nonce\'] = undefined;\n        }\n'));
        expect (elseArm).toContain ('orderbook.Fields().Nonce = nil');
    });

    test ('a nil test of a field on a proven book reads the exposed field', () => {
        const guard = '        if (!(symbol in this.orderbooks)) {\n            this.orderbooks[symbol] = this.orderBook ({});\n        }\n        const orderbook = this.orderbooks[symbol];\n';
        const out = print (cls (guard + '        if (orderbook[\'timestamp\'] === undefined) {\n            return;\n        }\n'));
        expect (out).toContain ('IsEqual(orderbook.Fields().Timestamp, nil)');
        expect (out).not.toContain ('GetValue(orderbook, "timestamp")');
        // not a nil test: the value reaches an any box, keep the helper
        expect (print (cls (guard + '        other = orderbook[\'timestamp\'];\n'))).toContain ('GetValue(orderbook, "timestamp")');
        // unproven book
        expect (print (cls ('        const orderbook = this.orderbooks[symbol];\n        if (orderbook[\'timestamp\'] === undefined) {\n            return;\n        }\n'))).toContain ('GetValue(orderbook, "timestamp")');
    });

    test ('a cache read defaulting to a fresh book proves the book', () => {
        const out = print (cls ('        const stored = this.safeValue (this.orderbooks, symbol, this.orderBook ({}));\n        stored[\'nonce\'] = undefined;\n'));
        expect (out).toContain ('stored.Fields().Nonce = nil');
        // a default that may be nil
        expect (print (cls ('        const stored = this.safeValue (this.orderbooks, symbol, other);\n        stored[\'nonce\'] = undefined;\n'))).toContain ('AddElementToObject(stored, "nonce", nil)');
    });

    test ('negatives keep the helper', () => {
        // the guard does not exit
        expect (print (cls ('        const stored = this.safeValue (this.orderbooks, symbol);\n'
            + '        if (stored === undefined) {\n            other = 1;\n        }\n        stored[\'nonce\'] = undefined;\n'))).toContain ('AddElementToObject(stored, "nonce", nil)');
        // the guard tests a different value
        expect (print (cls ('        const stored = this.safeValue (this.orderbooks, symbol);\n'
            + '        if (other === undefined) {\n            return;\n        }\n        stored[\'nonce\'] = undefined;\n'))).toContain ('AddElementToObject(stored, "nonce", nil)');
        // `&&` does not exit on every nil book
        expect (print (cls ('        const stored = this.safeValue (this.orderbooks, symbol);\n'
            + '        if ((stored === undefined) && flag) {\n            return;\n        }\n        stored[\'nonce\'] = undefined;\n'))).toContain ('AddElementToObject(stored, "nonce", nil)');
        // the value may be nil: not the literal undefined
        expect (print (cls ('        const stored = this.safeValue (this.orderbooks, symbol);\n'
            + '        if (stored === undefined) {\n            return;\n        }\n        stored[\'nonce\'] = other;\n'))).toContain ('AddElementToObject(stored, "nonce", other)');
        // a rebind to a possibly nil value after the guard
        expect (print (cls ('        let stored = this.safeValue (this.orderbooks, symbol);\n'
            + '        if (stored === undefined) {\n            return;\n        }\n        stored = other;\n        stored[\'nonce\'] = undefined;\n'))).toContain ('AddElementToObject(stored, "nonce", nil)');
        // `!(k in c) && other` does not prove the else arm
        expect (print (cls ('        if (!(symbol in this.orderbooks) && flag) {\n            this.orderbooks[symbol] = this.orderBook ({});\n'
            + '        } else {\n            const orderbook = this.orderbooks[symbol];\n            orderbook[\'nonce\'] = undefined;\n        }\n'))).toContain ('AddElementToObject(orderbook, "nonce", nil)');
    });
});
