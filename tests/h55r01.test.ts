import { Transpiler } from '../src/transpiler';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';

jest.mock ('module', () => ({ __esModule: true, default: jest.fn () }));

// a venue method declared `Promise<Dict>` answers the map itself: a local filled and rewritten from it holds that map
const run = (body: string) => {
    const root = fs.mkdtempSync (path.join (os.tmpdir (), 'h55r01-'));
    fs.mkdirSync (path.join (root, 'ts/src/base'), { recursive: true });
    fs.writeFileSync (path.join (root, 'ts/src/base/Exchange.ts'), "export interface Dict { [key: string]: any }\nexport type Str = string | undefined;\nexport default class Exchange {\n    // METHODS BELOW THIS LINE ARE TRANSPILED FROM TYPESCRIPT\n    safeString (o: any, k: any, d: Str = undefined): Str { return o; }\n    safeBool (o: any, k: any, d: any = undefined): any { return o; }\n    keep (p: any): any { return p; }\n}\n");
    fs.writeFileSync (path.join (root, 'ts/src/venue.ts'), "import Exchange from './base/Exchange.js';\nimport type { Dict, Str } from './base/Exchange.js';\nexport default class venue extends Exchange {\n" + body + "}\n");
    const t = new Transpiler ({ 'verbose': false, 'rust': { 'parser': { 'NUM_LINES_END_FILE': 0 } } });
    try { return t.transpileRustByPath (path.join (root, 'ts/src/venue.ts')).content; } finally { fs.rmSync (root, { recursive: true, force: true }); }
};

const quote = "    async fetchQuote (side: string, params: Dict = {}): Promise<Dict> {\n        const request: Dict = { 'side': side };\n        return request;\n    }\n";

describe ('rust local rewritten from a venue Dict method', () => {
    test ('the local holds the map and the rewrite is not boxed (fails on the base printer)', () => {
        const out = run (quote + "    async convert (side: string): Promise<Str> {\n        let q = await this.fetchQuote (side, { 'stock': true });\n        if (side === 'buy') {\n            q = await this.fetchQuote (side, { 'stock': false });\n        }\n        return this.safeString (q, 'price');\n    }\n");
        expect (out).toMatch (/let mut q: crate::value::Dict = self\.fetchQuote\(/);
        expect (out).toMatch (/\n\s+q = self\.fetchQuote\(/);
        expect (out).not.toContain ('Value::Dict(self.fetchQuote(');
    });
    test ('negative: a rewrite from an untyped value keeps the boxed local', () => {
        const out = run (quote + "    async convert (side: string): Promise<Str> {\n        let q = await this.fetchQuote (side, { 'stock': true });\n        if (!this.safeBool (q, 'available', false)) {\n            q = this.keep (side);\n        }\n        return this.safeString (q, 'price');\n    }\n");
        expect (out).toMatch (/let mut q: Value = /);
    });
});
