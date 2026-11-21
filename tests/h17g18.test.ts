import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler } from '../src/transpiler';

describe ('go order-book nil field writes', () => {
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
        + '    iso8601 (t: any): string | undefined { return undefined; }\n'
        + '    handleBidAsks (side: any, xs: any[]) { return xs; }\n'
        + '    handleBookDelta (orderbook: WsOrderBook, delta: any) { return delta; }\n';
    const print = (body: string): string => {
        const dir = fs.mkdtempSync (path.join (os.tmpdir (), 'h17g18-'));
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
    const watch = (body: string) => 'class x extends Exchange {\n    sub (symbol: string, other: any) {\n'
        + '        if (!(symbol in this.orderbooks)) {\n            this.orderbooks[symbol] = this.orderBook ({});\n        }\n'
        + '        const orderbook = this.orderbooks[symbol];\n' + body + '    }\n}\n';

    test ('an undefined write on a proven book clears the field through Fields()', () => {
        const out = print (watch ('        orderbook[\'nonce\'] = undefined;\n        orderbook[\'timestamp\'] = undefined;\n        orderbook[\'datetime\'] = undefined;\n'));
        expect (out).toContain ('orderbook.Fields().Nonce = nil');
        expect (out).toContain ('orderbook.Fields().Timestamp = nil');
        expect (out).toContain ('orderbook.Fields().Datetime = nil');
        expect (out).not.toContain ('AddElementToObject(orderbook');
    });

    test ('negatives keep the helper', () => {
        // a value that is not the undefined literal (may be nil at runtime, tested by consumers)
        expect (print (watch ('        orderbook[\'nonce\'] = other;\n'))).toContain ('AddElementToObject(orderbook, "nonce", other)');
        // a field outside the clear table
        expect (print (watch ('        orderbook[\'symbol\'] = undefined;\n'))).toContain ('AddElementToObject(orderbook, "symbol", nil)');
        // a book not proven non-nil (cache read without the presence guard)
        const unproven = 'class x extends Exchange {\n    sub (symbol: string) {\n        const orderbook = this.orderbooks[symbol];\n'
            + '        orderbook[\'nonce\'] = undefined;\n    }\n}\n';
        expect (print (unproven)).toContain ('AddElementToObject(orderbook, "nonce", nil)');
    });
});
