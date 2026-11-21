import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler } from '../src/transpiler';

describe ('go order-book parameter field writes', () => {
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
    };
    const HEAD = 'type Dict = { [key: string]: any };\n'
        + 'class Side { store (p: number, a: number) { return p + a; } }\n'
        + 'class WsOrderBook { asks: Side; bids: Side; cache: any[]; timestamp: number; datetime: string; reset (x: Dict = {}) { return x; } limit () { return this; } }\n'
        + 'class Exchange {\n'
        + '    orderbooks: Dictionary<WsOrderBook> = {};\n'
        + '    orderBook (snapshot = {}): WsOrderBook { return new WsOrderBook (); }\n'
        + '    safeValue (o: any, k: string, d: any = undefined): any { return o[k]; }\n'
        + '    safeInteger (o: any, k: string): number | undefined { return o[k]; }\n'
        + '    iso8601 (t: any): string | undefined { return undefined; }\n'
        + '    handleBidAsks (side: any, xs: any[]) { return xs; }\n'
        + '    handleBookDelta (orderbook: WsOrderBook, delta: any) { return delta; }\n';
    const print = (body: string): string => {
        const dir = fs.mkdtempSync (path.join (os.tmpdir (), 'h15m05-'));
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
    const handler = (between: string, read: string) => 'class x extends Exchange {\n    override handleBookDelta (orderbook: WsOrderBook, delta: any) {\n'
        + '        const timestamp = this.safeInteger (delta, \'t\');\n        orderbook[\'timestamp\'] = timestamp;\n'
        + '        orderbook[\'datetime\'] = this.iso8601 (timestamp);\n' + between + read + '    }\n}\n';

    test ('a book parameter whose side is read later in the body prints the setter', () => {
        const out = print (handler ('        const bids = [];\n', '        this.handleBidAsks (orderbook[\'bids\'], bids);\n'));
        expect (out).toContain ('orderbook.SetTimestamp(timestamp)');
        expect (out).toContain ('orderbook.SetDatetime(this.Iso8601(timestamp))');
        expect (out).not.toContain ('AddElementToObject(orderbook');
    });

    test ('a side read held in a local also proves the book non-nil', () => {
        const out = print (handler ('', '        const storedBids = orderbook[\'bids\'];\n        this.handleBidAsks (storedBids, []);\n'));
        expect (out).toContain ('orderbook.SetTimestamp(timestamp)');
    });

    test ('negatives keep the helper', () => {
        // no side read at all
        expect (print (handler ('', ''))).toContain ('AddElementToObject(orderbook, "timestamp"');
        // a return before the side read may skip it
        expect (print (handler ('        if (delta === undefined) {\n            return;\n        }\n', '        this.handleBidAsks (orderbook[\'bids\'], []);\n')))
            .toContain ('AddElementToObject(orderbook, "timestamp"');
        // the side read only in a branch
        expect (print (handler ('', '        if (delta) {\n            this.handleBidAsks (orderbook[\'bids\'], []);\n        }\n')))
            .toContain ('AddElementToObject(orderbook, "timestamp"');
    });
});
