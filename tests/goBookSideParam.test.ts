import { Transpiler } from '../src/transpiler';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

jest.mock('module', () => ({ __esModule: true, default: jest.fn () }));

// a slice-table slot naming the order-book side interface prints that interface on the parameter
describe ('go order-book side parameter slot', () => {
    const BOOK = {
        'classes': [ 'WsOrderBook' ], 'constructors': [ 'orderBook' ], 'cacheReaders': [ 'safeValue' ],
        'type': 'OrderBookInterface', 'sideType': 'IOrderBookSide', 'unbox': 'OrderBookTyped',
        'sides': { 'asks': 'GetAsks', 'bids': 'GetBids' }, 'setters': {},
    };
    const BASE = 'class Side { store (p: any, a: any) {} storeArray (x: any[]) {} }\n'
        + 'class WsOrderBook { asks: Side; bids: Side; }\n'
        + 'class Exchange {\n'
        + '    safeFloat (o: any, k: any): any { return o[k]; }\n'
        + '    handleDeltas (bookside: any, deltas: any[]) { for (let i = 0; i < deltas.length; i++) { this.handleDelta (bookside, deltas[i]); } }\n'
        + '    handleDelta (bookside: any, delta: any) { throw new Error (\'x\'); }\n'
        + '}\nexport default Exchange;\n';
    const print = (body: string, table: any): string => {
        const dir = fs.mkdtempSync (path.join (os.tmpdir (), 'gobookside-'));
        try {
            fs.mkdirSync (path.join (dir, 'ts', 'src', 'base'), { 'recursive': true });
            fs.mkdirSync (path.join (dir, 'ts', 'src', 'pro'), { 'recursive': true });
            fs.writeFileSync (path.join (dir, 'ts', 'src', 'base', 'Exchange.ts'), BASE);
            const file = path.join (dir, 'ts', 'src', 'pro', 'x.ts');
            fs.writeFileSync (file, 'import Exchange from \'../base/Exchange.js\';\n' + body);
            const config: any = { 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 }, 'orderBook': BOOK, 'unifiedSliceParams': table } };
            return new Transpiler (config).transpileGoByPath (file).content;
        } finally {
            fs.rmSync (dir, { 'recursive': true, 'force': true });
        }
    };
    const OVERRIDE = 'class x extends Exchange {\n'
        + '    override handleDelta (bookside: any, delta: any) {\n'
        + '        const price = this.safeFloat (delta, 0);\n'
        + '        const amount = this.safeFloat (delta, 1);\n'
        + '        bookside.store (price, amount);\n'
        + '    }\n'
        + '}\n';
    const TABLE = { 'handleDelta': { 0: 'IOrderBookSide' }, 'handleDeltas': { 0: 'IOrderBookSide', 1: '[]any' } };

    test ('the side parameter prints the interface and drops the store assertion', () => {
        const out = print (OVERRIDE, TABLE);
        expect (out).toContain ('HandleDelta(bookside IOrderBookSide, delta any)');
        expect (out).not.toContain ('bookside.(IOrderBookSide)');
        expect (out).toContain ('bookside.Store(');
    });

    test ('no table slot: the parameter stays any', () => {
        const out = print (OVERRIDE, {});
        expect (out).toContain ('HandleDelta(bookside any, delta any)');
        expect (out).toContain ('bookside.(IOrderBookSide).Store(');
    });

    test ('a write of another kind into the side parameter fails the build', () => {
        const body = 'class x extends Exchange {\n'
            + '    override handleDelta (bookside: any, delta: any) {\n'
            + '        bookside = delta;\n'
            + '        bookside.store (1, 2);\n'
            + '    }\n'
            + '}\n';
        expect (() => print (body, TABLE)).toThrow (/IOrderBookSide/);
    });
});
