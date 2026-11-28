import fs from 'fs';
import path from 'path';
import { Transpiler } from '../src/transpiler';

describe ('rust ws book-side bid/ask lists are lent slices', () => {
    const root = path.join (__dirname, 'files', 'tmp-h45r29', 'ts', 'src');
    const base = 'export class Exchange {\n    safeList (d: any, k: any, def: any = undefined): any { return undefined; }\n'
        + '    safeNumber (d: any, k: any, def: any = undefined): any { return undefined; }\n'
        + '    parseOrderBookBidAsk (bidAsk: any, priceKey: any = 0, amountKey: any = 1): any { return bidAsk; }\n}\n';
    const print = (venue: string): string => {
        fs.mkdirSync (path.join (root, 'base'), { recursive: true });
        fs.mkdirSync (path.join (root, 'pro'), { recursive: true });
        fs.writeFileSync (path.join (root, 'base', 'Exchange.ts'), base);
        fs.writeFileSync (path.join (root, 'pro', 'venue.ts'), "import { Exchange } from '../base/Exchange';\nexport default class venue extends Exchange {\n" + venue + '}\n');
        const t = new Transpiler ({ verbose: false, rust: {} });
        return t.transpileRustByPath (path.join (root, 'pro', 'venue.ts')).content;
    };
    afterAll (() => fs.rmSync (path.join (__dirname, 'files', 'tmp-h45r29'), { recursive: true, force: true }));

    const handler = '    handleBidAsks (bookSide: any, bidAsks: any[]) {\n        for (let i = 0; i < bidAsks.length; i++) {\n'
        + '            const bidAsk = bidAsks[i];\n            if (Array.isArray (bidAsk)) {\n                bookSide.storeArray (this.parseOrderBookBidAsk (bidAsk));\n'
        + '            } else {\n                const price = this.safeNumber (bidAsk, \'p\');\n                bookSide.store (price, 1);\n            }\n        }\n    }\n';
    const caller = '    handleDelta (orderbook: any, delta: any) {\n        const bids = this.safeList (delta, \'b\', []);\n'
        + '        this.handleBidAsks (orderbook[\'bids\'], bids);\n    }\n';

    test ('a held list handed beside a side handle prints a lent slice', () => {
        const out = print (handler + caller);
        expect (out).toContain ('bidAsks: &[crate::Value]');
        expect (out).not.toContain ('bidAsks: impl Into<crate::Value>');
        expect (out).not.toContain ('__bidAsks_empty');
    });

    test ('negatives keep the box', () => {
        // the first slot is not a side handle: the list stays boxed
        const plain = print ('    keep (x: any, rows: any[]) {\n        for (let i = 0; i < rows.length; i++) {\n            x.push (rows[i]);\n        }\n    }\n'
            + '    run (d: any) {\n        const rows = this.safeList (d, \'b\', []);\n        this.keep ([], rows);\n    }\n');
        expect (plain).not.toContain ('rows: &[crate::Value]');
        // the list handed whole to a plain `any` slot (not a list read)
        const whole = print ('    keepAll (x: any) {\n        return x;\n    }\n'
            + '    handleBidAsks (bookSide: any, bidAsks: any[]) {\n        this.keepAll (bidAsks);\n        bookSide.store (1, 1);\n    }\n' + caller);
        expect (whole).not.toContain ('bidAsks: &[crate::Value]');
        // a caller that builds the list inline (nothing held to lend)
        const inline = print (handler + '    handleDelta (orderbook: any, delta: any) {\n        this.handleBidAsks (orderbook[\'bids\'], this.safeList (delta, \'b\', []));\n    }\n');
        expect (inline).not.toContain ('bidAsks: &[crate::Value]');
    });
});
