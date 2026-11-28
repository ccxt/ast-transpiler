import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

// `.length` on a local the Go printer declares as a ws cache interface: a book side prints the interface's
// Len method, a cache local proven constructed by its create-if-absent guard prints len(x.ToArray()).
describe ('h25g12 cache and book-side lengths', () => {
    const BASE = [
        'export class ArrayCache { append (x: any) {} }',
        'export class ArrayCacheBySymbolById extends ArrayCache {}',
        'export class Exchange {',
        '    orders: ArrayCache | undefined = undefined;',
        '    options: Dict = {};',
        '    safeInteger (a, b, c?) { return 1; }',
        '    safeString (a, b, c?) { return \'\'; }',
        '    fetch (): Promise<any> { return undefined; }',
        '}',
        'type Dict = {[key: string]: any};',
        '',
    ].join ('\n');
    const HEADER = 'import { Exchange, ArrayCache, ArrayCacheBySymbolById } from \'../base/Exchange\';\ntype Dict = {[key: string]: any};\n';
    const print = (body: string): string => {
        const tmp = fs.mkdtempSync (path.join (os.tmpdir (), 'h25g12-'));
        try {
            const src = path.join (tmp, 'ts', 'src');
            fs.mkdirSync (path.join (src, 'base'), { 'recursive': true });
            fs.mkdirSync (path.join (src, 'pro'), { 'recursive': true });
            fs.writeFileSync (path.join (src, 'base', 'Exchange.ts'), BASE);
            fs.writeFileSync (path.join (src, 'pro', 'ex.ts'), HEADER + 'export class ex extends Exchange {\n' + body + '}\n');
            const t: any = new Transpiler ({ 'verbose': false, 'go': {} });
            installCcxtGoHooks (t.goTranspiler);
            return t.transpileGoByPath (path.join (src, 'pro', 'ex.ts')).content;
        } finally {
            fs.rmSync (tmp, { 'recursive': true, 'force': true });
        }
    };
    const GUARD = '        if (this.orders === undefined) {\n            const limit = this.safeInteger (this.options, \'ordersLimit\', 1000);\n'
        + '            this.orders = new ArrayCacheBySymbolById (limit);\n        }\n';
    test ('a guarded cache local prints len(x.ToArray()) (fails on the base printer)', () => {
        const out = print ('    handle (client, message) {\n' + GUARD + '        const stored = this.orders;\n'
            + '        const n = stored.length;\n        return n;\n    }\n');
        expect (out).toContain ('len(stored.ToArray())');
        expect (out).not.toContain ('GetArrayLength(stored)');
    });
    test ('negative: without the guard the field may be nil, the helper stays', () => {
        const out = print ('    handle (client, message) {\n        const stored = this.orders;\n        const n = stored.length;\n        return n;\n    }\n');
        expect (out).not.toContain ('stored.ToArray()');
    });
    test ('negative: an await between the guard and the read keeps the helper', () => {
        const out = print ('    async handle (client, message) {\n' + GUARD + '        await this.fetch ();\n        const stored = this.orders;\n'
            + '        const n = stored.length;\n        return n;\n    }\n');
        expect (out).not.toContain ('stored.ToArray()');
    });
    test ('negative: a field reset after the guard keeps the helper', () => {
        const out = print ('    handle (client, message) {\n' + GUARD + '        this.orders = undefined;\n        const stored = this.orders;\n'
            + '        const n = stored.length;\n        return n;\n    }\n');
        expect (out).not.toContain ('stored.ToArray()');
    });
});

describe ('h25g12 order book side length', () => {
    const BOOK = {
        'classes': [ 'OrderBook' ], 'constructors': [ 'orderBook' ], 'cacheReaders': [ 'safeValue' ],
        'type': 'OrderBookInterface', 'sideType': 'IOrderBookSide', 'unbox': 'OrderBookTyped',
        'sides': { 'asks': 'GetAsks', 'bids': 'GetBids' },
    };
    const HEAD = 'type Dict = { [key: string]: any };\n'
        + 'class Side { store (p: number, a: number) { return p + a; } }\n'
        + 'class OrderBook { asks: Side; bids: Side; reset (x: Dict) { return x; } }\n'
        + 'class Exchange {\n'
        + '    orderbooks: { [key: string]: OrderBook } = {};\n'
        + '    orderBook (snapshot = {}): OrderBook { return new OrderBook (); }\n'
        + '    handleDeltas (side: any, deltas: any) { return side; }\n';
    const print = (body: string, book: any = BOOK): string => {
        const dir = fs.mkdtempSync (path.join (os.tmpdir (), 'h25g12b-'));
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
    const BODY = '    handle () {\n        const orderbook = this.orderBook ();\n        const asks = orderbook[\'asks\'];\n'
        + '        const n = asks.length;\n        this.handleDeltas (asks, []);\n        return n;\n    }\n';
    test ('a side local prints the interface Len method and stays an int (fails on the base printer)', () => {
        const out = print (BODY);
        expect (out).toContain ('IOrderBookSide.Len(asks)');
        expect (out).not.toContain ('GetArrayLength(asks)');
        expect (out).not.toContain ('var n any');
    });
    test ('negative: without the book config the side stays boxed and the helper stays', () => {
        expect (print (BODY, null)).not.toContain ('.Len(');
    });
    test ('negative: a rebound side local keeps the helper', () => {
        const out = print ('    handle (other: any) {\n        const orderbook = this.orderBook ();\n        let asks = orderbook[\'asks\'];\n'
            + '        asks = other;\n        const n = asks.length;\n        return n;\n    }\n');
        expect (out).not.toContain ('.Len(');
    });
});
