import { Transpiler } from '../src/transpiler';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';

// `parseLeverageTiers (..): LeverageTiers` builds its map on every path: base and overrides return `Dict`, a `Value` slot boxes once
const base = "export interface Dict { [key: string]: any }\nexport interface LeverageTiers { [key: string]: any }\nexport default class Exchange {\n    id: string = undefined;\n    parseLeverageTiers (response: any, symbols: string[] = undefined, marketIdKey: string = undefined): LeverageTiers {\n        const tiers: Dict = {};\n        tiers['a'] = response;\n        return tiers;\n    }\n    parseOtherTiers (response: any): Dict {\n        return response;\n    }\n}\n";
const venue = "import Exchange from './base/Exchange.js';\nimport type { Dict, LeverageTiers } from './base/Exchange.js';\nexport default class venue extends Exchange {\n    parseLeverageTiers (response: any, symbols: string[] = undefined, marketIdKey: string = undefined): LeverageTiers {\n        const tiers: Dict = {};\n        tiers['b'] = response;\n        return tiers as LeverageTiers;\n    }\n    fetchTiers (response: any): any {\n        return this.parseLeverageTiers (response, undefined, 'symbol');\n    }\n}\n";
const root = fs.mkdtempSync (path.join (os.tmpdir (), 'astfx-rs-h47r31-'));
for (const [rel, text] of Object.entries ({ 'ts/src/base/Exchange.ts': base, 'ts/src/venue.ts': venue })) {
    fs.mkdirSync (path.dirname (path.join (root, rel)), { recursive: true });
    fs.writeFileSync (path.join (root, rel), text);
}
afterAll (() => fs.rmSync (root, { recursive: true, force: true }));

jest.mock ('module', () => ({ __esModule: true, default: jest.fn () }));

let out = '';
let baseOut = '';
beforeAll (() => {
    const transpiler = new Transpiler ({ 'verbose': false, 'rust': { 'parser': { 'NUM_LINES_END_FILE': 0 } } });
    out = transpiler.transpileRustByPath (path.join (root, 'ts/src/venue.ts')).content;
    baseOut = transpiler.transpileRustByPath (path.join (root, 'ts/src/base/Exchange.ts')).content;
});

describe ('rust parseLeverageTiers returns Dict', () => {
    test ('base: Dict return of the built map', () => {
        expect (baseOut).toMatch (/fn parseLeverageTiers\(&self[^\n]*\) -> crate::value::Dict \{/);
        expect (baseOut).toMatch (/return std::sync::Arc::new\(tiers\)/);
    });
    test ('override: Dict return', () => {
        expect (out).toMatch (/fn parseLeverageTiers\(&self[^\n]*\) -> crate::value::Dict \{/);
        expect (out).not.toMatch (/if let Value::Dict\(__m\)/);
    });
    test ('a Value slot boxes the call once', () => {
        expect (out).toMatch (/Value::Dict\(self\.parseLeverageTiers\(/);
    });
    test ('negative: another Dict-declared parser stays Value', () => {
        expect (baseOut).toMatch (/fn parseOtherTiers\(&self[^\n]*\) -> Value \{/);
    });
});
