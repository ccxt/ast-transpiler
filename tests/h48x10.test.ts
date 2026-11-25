import fs from 'fs';
import path from 'path';
import { Transpiler } from '../src/transpiler';

describe ('rust ws book-side parameter declared as the side class', () => {
    const root = path.join (__dirname, 'files', 'tmp-h48x10', 'ts', 'src');
    const base = 'export class Exchange {\n    safeList (d: any, k: any, def: any = undefined): any { return undefined; }\n'
        + '    parseOrderBookBidAsk (bidAsk: any, priceKey: any = 0, amountKey: any = 1): any { return bidAsk; }\n}\n';
    const side = 'export class OrderBookSide extends Array {\n    storeArray (d: any[]): void {}\n    store (p: any, a: any): void {}\n}\n'
        + 'export class Other extends Array {\n    storeArray (d: any[]): void {}\n}\n';
    const print = (venue: string): string => {
        fs.mkdirSync (path.join (root, 'base', 'ws'), { recursive: true });
        fs.mkdirSync (path.join (root, 'pro'), { recursive: true });
        fs.writeFileSync (path.join (root, 'base', 'Exchange.ts'), base);
        fs.writeFileSync (path.join (root, 'base', 'ws', 'OrderBookSide.ts'), side);
        fs.writeFileSync (path.join (root, 'pro', 'venue.ts'), "import { Exchange } from '../base/Exchange';\nimport type { OrderBookSide, Other } from '../base/ws/OrderBookSide';\n"
            + 'export default class venue extends Exchange {\n' + venue + '}\n');
        const t = new Transpiler ({ verbose: false, rust: {} });
        return t.transpileRustByPath (path.join (root, 'pro', 'venue.ts')).content;
    };
    afterAll (() => fs.rmSync (path.join (__dirname, 'files', 'tmp-h48x10'), { recursive: true, force: true }));
    const handler = (type: string): string => '    handleBidAsks (bookSide: ' + type + ', bidAsks: any[]) {\n        for (let i = 0; i < bidAsks.length; i++) {\n'
        + '            bookSide.storeArray (this.parseOrderBookBidAsk (bidAsks[i]));\n        }\n    }\n';
    const caller = '    handleDelta (orderbook: any, delta: any) {\n        const bids = this.safeList (delta, \'b\', []);\n'
        + '        this.handleBidAsks (orderbook[\'bids\'], bids);\n    }\n';

    test ('a side-class annotation prints the Side handle like `any` did', () => {
        const typed = print (handler ('OrderBookSide') + caller);
        expect (typed).toContain ('bookSide: crate::pro::order_book::Side');
        expect (typed).toContain ('bidAsks: &[crate::Value]');
        const untyped = print (handler ('any') + caller);
        expect (untyped).toContain ('bookSide: crate::pro::order_book::Side');
    });

    test ('another class annotation is not a side', () => {
        const other = print (handler ('Other') + caller);
        expect (other).not.toContain ('bookSide: crate::pro::order_book::Side');
    });
});
