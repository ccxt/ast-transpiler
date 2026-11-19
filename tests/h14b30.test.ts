import fs from 'fs';
import path from 'path';
import { Transpiler } from '../src/transpiler';

describe ('rust symbol / marketId / safeCurrency lend their leading Str', () => {
    const dir = path.join (__dirname, 'files', 'tmp-h14b30');
    afterAll (() => fs.rmSync (dir, { recursive: true, force: true }));
    const base = "export type Str = string | undefined;\nexport default class Exchange {\n    currencies_by_id: any = undefined;\n    market (symbol: string): any { return undefined; }\n    safeString (o: any, k: any, d: Str = undefined): Str { return d; }\n    // METHODS BELOW THIS LINE ARE TRANSPILED FROM TYPESCRIPT\n    marketId (symbol: Str): Str {\n        const market = this.market (symbol);\n        if (market !== undefined) {\n            return market['id'];\n        }\n        return symbol;\n    }\n    symbol (symbol: Str): string {\n        const market = this.market (symbol);\n        return this.safeString (market, 'symbol', symbol);\n    }\n    safeCurrency (currencyId: Str, currency: any = undefined): any {\n        return { 'id': currencyId };\n    }\n    other (symbol: Str): Str {\n        return symbol;\n    }\n}\n";
    const venue = "import Exchange from './base/Exchange.js';\nimport type { Str } from './base/Exchange.js';\nexport default class venue extends Exchange {\n    run (symbol: string, code: string): any {\n        const a = this.symbol (symbol);\n        const b = this.marketId (symbol);\n        const c = this.safeCurrency (code);\n        return [ a, b, c, symbol, code ];\n    }\n}\n";
    const t = new Transpiler ({ verbose: false, rust: { parser: { NUM_LINES_END_FILE: 0 } } });
    fs.mkdirSync (path.join (dir, 'ts/src/base'), { recursive: true });
    fs.writeFileSync (path.join (dir, 'ts/src/base/Exchange.ts'), base);
    fs.writeFileSync (path.join (dir, 'ts/src/venue.ts'), venue);
    test ('signatures take Option<&str>', () => {
        const out = t.transpileRustByPath (path.join (dir, 'ts/src/base/Exchange.ts')).content;
        expect (out).toMatch (/fn (?:market_id|marketId)\(&self, symbol: Option<&str>\)/);
        expect (out).toMatch (/fn symbol\(&self, symbol: Option<&str>\)/);
        expect (out).toMatch (/fn (?:safe_currency|safeCurrency)\(&self, currencyId: Option<&str>/);
    });
    test ('other methods keep their parameter', () => {
        const out = t.transpileRustByPath (path.join (dir, 'ts/src/base/Exchange.ts')).content;
        expect (out).not.toMatch (/fn other\(&self, symbol: Option<&str>\)/);
    });
    test ('callers lend instead of cloning', () => {
        const out = t.transpileRustByPath (path.join (dir, 'ts/src/venue.ts')).content;
        expect (out).not.toMatch (/\.symbol\(symbol\.clone\(\)/);
        expect (out).not.toMatch (/(?:market_id|marketId)\(symbol\.clone\(\)/);
        expect (out).not.toMatch (/(?:safe_currency|safeCurrency)\(code\.clone\(\)/);
    });
});
