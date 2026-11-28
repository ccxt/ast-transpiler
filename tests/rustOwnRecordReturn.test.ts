import { Transpiler } from '../src/transpiler';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';

jest.mock ('module', () => ({ __esModule: true, default: jest.fn () }));

// a venue-private method declared `Promise<MarginModification>` (a map at runtime) returns the native map
// when every return is a fresh map; any other return operand keeps the `Value` signature
const run = (body: string) => {
    const root = fs.mkdtempSync (path.join (os.tmpdir (), 'own-record-'));
    fs.mkdirSync (path.join (root, 'ts/src/base'), { recursive: true });
    fs.writeFileSync (path.join (root, 'ts/src/base/Exchange.ts'), "export interface Dict { [key: string]: any }\nexport interface MarginModification { info: any; symbol: string; type?: string; amount?: number; }\nexport default class Exchange {\n    extend (...args: any[]): any { return Object.assign ({}, ...args); }\n    keep (p: any): any { return p; }\n    parseMarginModification (data: Dict, market: any = undefined): MarginModification { return { 'info': data, 'symbol': '' }; }\n}\n");
    fs.writeFileSync (path.join (root, 'ts/src/venue.ts'), "import Exchange from './base/Exchange.js';\nimport type { Dict, MarginModification } from './base/Exchange.js';\nexport default class venue extends Exchange {\n" + body + "}\n");
    const t = new Transpiler ({ 'verbose': false, 'rust': { 'parser': { 'NUM_LINES_END_FILE': 0 } } });
    try { return t.transpileRustByPath (path.join (root, 'ts/src/venue.ts')).content; } finally { fs.rmSync (root, { recursive: true, force: true }); }
};

describe ('rust venue-private MarginModification return', () => {
    test ('every return the runtime extend: `-> crate::value::Dict` and `extend_t`', () => {
        const out = run ("    async modifyMarginHelper (symbol: string, amount: number, params: Dict = {}): Promise<MarginModification> {\n        return this.extend ({ 'info': symbol }, { 'amount': amount });\n    }\n");
        expect (out).toMatch (/fn modifyMarginHelper\([^\n]*\) -> crate::value::Dict \{/);
        expect (out).toContain ('return self.extend_t(');
    });
    test ('an object literal return is the native map', () => {
        const out = run ("    async modifyMarginHelper (symbol: string, amount: number, params: Dict = {}): Promise<MarginModification> {\n        return { 'info': params, 'symbol': symbol };\n    }\n");
        expect (out).toMatch (/fn modifyMarginHelper\([^\n]*\) -> crate::value::Dict \{/);
    });
    test ('negative: a return of an any value (nil may come back) keeps Value', () => {
        const out = run ("    async modifyMarginHelper (symbol: string, amount: number, params: Dict = {}): Promise<MarginModification> {\n        return this.keep (params) as MarginModification;\n    }\n");
        expect (out).toMatch (/fn modifyMarginHelper\([^\n]*\) -> Value \{/);
    });
    test ('negative: another record kind (not listed) keeps Value', () => {
        const out = run ("    async otherHelper (symbol: string, params: Dict = {}): Promise<MarginModification[]> {\n        return [ this.extend ({ 'info': symbol }, params) ];\n    }\n");
        expect (out).not.toMatch (/fn otherHelper\([^\n]*\) -> crate::value::Dict \{/);
    });
});
