import { Transpiler } from '../src/transpiler';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';

// a venue override of a base method whose `any[]` row list is read only by `.length` and `safeDict (p, k)` takes a lent slice
const files: Record<string, string> = {
 "ts/src/base/Exchange.ts": "export default class Exchange {\n    safeDict (x: any, k: any, d: any = undefined): any { return x; }\n    getCacheIndex (orderbook: any, deltas: any[]): number {\n        return -1;\n    }\n    pickRows (rows: any[]): number {\n        return -1;\n    }\n}\n",
 "ts/src/pro/venue.ts": "import Exchange from '../base/Exchange.js';\nexport default class venue extends Exchange {\n    override getCacheIndex (orderbook: any, cache: any[]): number {\n        const first = this.safeDict (cache, 0);\n        for (let i = 0; i < cache.length; i++) {\n            const delta = this.safeDict (cache, i);\n            if (delta !== undefined) {\n                return i;\n            }\n        }\n        return cache.length;\n    }\n    override pickRows (rows: any[]): number {\n        const first = rows[0];\n        return rows.length;\n    }\n}\n",
};
const root = fs.mkdtempSync (path.join (os.tmpdir (), 'astfx-rs-r14-'));
for (const [rel, text] of Object.entries (files)) {
    fs.mkdirSync (path.dirname (path.join (root, rel)), { recursive: true });
    fs.writeFileSync (path.join (root, rel), text);
}
afterAll (() => fs.rmSync (root, { recursive: true, force: true }));

jest.mock ('module', () => ({ __esModule: true, default: jest.fn () }));

let out = '';
beforeAll (() => {
    const transpiler = new Transpiler ({ 'verbose': false, 'rust': { 'parser': { 'NUM_LINES_END_FILE': 0 } } });
    out = transpiler.transpileRustByPath (path.join (root, 'ts/src/pro/venue.ts')).content;
});

describe ('rust lent row slice of a base override', () => {
    test ('the row list prints a slice and its rows read natively (non-map / missing -> empty map)', () => {
        expect (out).toMatch (/fn getCacheIndex\([^)]*cache: &\[crate::Value\]\)/);
        expect (out).toContain ('if let Some(Value::Dict(__m)) = cache.get(i as usize) { std::sync::Arc::clone(__m) } else { Default::default() }');
        expect (out).toContain ('cache.get(0)');
        expect (out).not.toMatch (/safe_dict_t\(&cache/);
    });
    test ('negative: an index read (not safeDict) keeps the Value parameter', () => {
        expect (out).not.toMatch (/fn pickRows\([^)]*rows: &\[crate::Value\]/);
    });
});
