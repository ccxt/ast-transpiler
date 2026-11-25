import fs from 'fs';
import os from 'os';
import path from 'path';
import Transpiler from '../src/transpiler.js';

// A side level whose part is read through `this.safeString (parts, K, '')` keeps the list / borrowed part form.
describe('a side level part read by safeString at a literal index borrows', () => {
    const build = (name: string, tail: string) => {
        const files: Record<string, string> = {
            'ts/src/base/ws/OrderBookSide.ts': "export class OrderBookSide extends Array {\n    store (price: any, size: any) {}\n    storeArray (delta: any) {}\n}\n",
            'ts/src/base/ws/OrderBook.ts': "import { OrderBookSide } from './OrderBookSide.js';\nexport class OrderBook {\n    bids: OrderBookSide;\n    asks: OrderBookSide;\n    constructor (snapshot: any = {}, depth: any = undefined) {}\n}\n",
            'ts/src/base/Exchange.ts': "import { OrderBook } from './ws/OrderBook.js';\nexport default class Exchange {\n    orderbooks: { [key: string]: OrderBook } = {};\n    hold (x: any): any { return x; }\n    safeString (o: any, k: any, d: string = undefined): string { return o; }\n    safeInteger (o: any, k: any, d: number = undefined): number { return o; }\n}\n",
            'ts/src/pro/venue.ts': "import Exchange from '../base/Exchange.js';\nexport default class venue extends Exchange {\n    checksumOf (symbol: string): string {\n        const orderbook = this.orderbooks[symbol];\n        const storedBids = orderbook['bids'];\n        const bidsLength = storedBids.length;\n        const payload: string[] = [];\n        for (let i = 0; i < 25; i++) {\n            if (i < bidsLength) {\n                const bidLevel = storedBids[i];\n                const bidParts = bidLevel[2];\n" + tail + "            }\n        }\n        return payload.join (':');\n    }\n}\n",
        };
        const root = fs.mkdtempSync (path.join (os.tmpdir (), 'astfx-rs-h50r03-' + name + '-'));
        for (const [ rel, text ] of Object.entries (files)) {
            fs.mkdirSync (path.dirname (path.join (root, rel)), { recursive: true });
            fs.writeFileSync (path.join (root, rel), text);
        }
        const out = new Transpiler ({ 'verbose': false }).transpileRustByPath (path.join (root, 'ts/src/pro/venue.ts')).content;
        fs.rmSync (root, { recursive: true, force: true });
        return out;
    };
    test('safeString (parts, 0, \'\') keeps bidLevel a List and bidParts a borrow', () => {
        const out = build ('a', "                payload.push (this.safeString (bidParts, 0, ''));\n                payload.push (this.safeString (bidParts, 1, ''));\n");
        expect (out).toContain ('let bidLevel: crate::value::List = storedBids.level(&Value::Int(i)).into_list();');
        expect (out).toContain ('let bidParts: &Value = bidLevel.get(2).unwrap_or(&Value::Null);');
        expect (out).not.toContain ('get_value(&bidLevel');
        // the borrowed part is `Copy`: each read lends it, none clones it
        expect (out).toContain ('self.safeString(bidParts, Value::Int(0), ');
        expect (out).toContain ('self.safeString(bidParts, Value::Int(1), ');
        expect (out).not.toContain ('bidParts.clone()');
    });
    test('a non-literal safeString key keeps both Value', () => {
        const out = build ('b', "                payload.push (this.safeString (bidParts, i, ''));\n");
        expect (out).toContain ('let mut bidLevel: Value = ');
        expect (out).toContain ('let mut bidParts: Value = ');
    });
    test('a safeInteger read keeps both Value', () => {
        const out = build ('c', "                payload.push (this.safeInteger (bidParts, 0, 0).toString ());\n");
        expect (out).toContain ('let mut bidLevel: Value = ');
    });
});
