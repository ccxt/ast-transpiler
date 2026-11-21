import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler } from '../src/transpiler';

jest.mock ('module', () => ({ __esModule: true, default: jest.fn () }));

describe ('per-venue numeric parameters read by a base precision formatter', () => {
    const root = fs.mkdtempSync (path.join (os.tmpdir (), 'astfx-h15f05-'));
    const base = "export type Str = string | undefined;\nexport type Num = number | undefined;\nexport default class Exchange {\n" +
        "    numberToString (n: any): Str { return undefined; }\n" +
        "    amountToPrecision (symbol: Str, amount: any): Str { return undefined; }\n" +
        "    priceToPrecision (symbol: Str, price: any): Str { return undefined; }\n" +
        "    hold (x: any): any { return x; }\n}\n";
    const print = (venue: string): string => {
        fs.mkdirSync (path.join (root, 'ts/src/base'), { recursive: true });
        fs.writeFileSync (path.join (root, 'ts/src/base/Exchange.ts'), base);
        fs.writeFileSync (path.join (root, 'ts/src/venue.ts'), "import Exchange from './base/Exchange.js';\nimport type { Num, Str } from './base/Exchange.js';\n" +
            'export default class venue extends Exchange {\n' + venue + '}\n');
        const t = new Transpiler ({ verbose: false, rust: {} } as any);
        return (t as any).transpileRustByPath (path.join (root, 'ts/src/venue.ts')).content;
    };
    afterAll (() => fs.rmSync (root, { recursive: true, force: true }));

    test ('an amount / price only formatted by amountToPrecision / priceToPrecision prints f64 slots', () => {
        const out = print ("    req (symbol: Str, amount: Num, price: Num = undefined) {\n" +
            "        const r: any = {};\n        r['a'] = this.amountToPrecision (symbol, amount);\n" +
            "        if (price !== undefined) {\n            r['p'] = this.priceToPrecision (symbol, price);\n        }\n        return this.hold (r);\n    }\n" +
            "    place (symbol: Str, amount: Num) {\n        return this.req (symbol, amount, 2.5);\n    }\n");
        expect (out).toContain ('amount: Option<f64>, price: Option<f64>');
        expect (out).toContain ('pub fn req(&self, symbol: Option<&str>, amount: Option<f64>, price: Option<f64>)');
        expect (out).toContain ('self.req(');
    });

    test ('negatives keep the box', () => {
        // a read the precision rule does not cover (stored as is) keeps `Value`
        const stored = print ("    req (symbol: Str, amount: Num) {\n        const r: any = {};\n        r['a'] = amount;\n        r['b'] = this.amountToPrecision (symbol, amount);\n        return this.hold (r);\n    }\n" +
            "    place (symbol: Str, amount: Num) {\n        return this.req (symbol, amount);\n    }\n");
        expect (stored).toMatch (/pub fn req\(&self, symbol: Option<&str>, (mut )?amount: Value\)/);
        // the formatter's first argument is the symbol slot, not the amount
        const swapped = print ("    req (symbol: Str, amount: Num) {\n        return this.hold (this.amountToPrecision (amount as any, symbol));\n    }\n" +
            "    place (symbol: Str, amount: Num) {\n        return this.req (symbol, amount);\n    }\n");
        expect (swapped).not.toContain ('amount: Option<f64>');
    });
});
