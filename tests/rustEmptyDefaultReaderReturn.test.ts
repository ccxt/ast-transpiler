import { Transpiler } from '../src/transpiler';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';

// a venue async method declared `Promise<Dict[]>` / `Promise<Dict>` whose every return is `safeList (x, 'k', [])` /
// `safeDict (x, 'k', {})` returns the typed container (the empty one for a missing key, Null or a wrong kind)
const base = "export interface Dict { [key: string]: any }\nexport type List = any[];\nexport default class Exchange {\n    options: Dict = {};\n    safeDict (o: any, k: any, d: Dict = undefined): Dict { return o; }\n    safeList (o: any, k: any, d: List = undefined): List { return o; }\n    hold (x: any): any { return x; }\n    safeBool (o: any, k: any, d: any = undefined): any { return o; }\n}\n";
const venue = "import venueApi from './abstract/venue.js';\nimport type { Dict } from './base/Exchange.js';\nexport default class venue extends venueApi {\n    async fetchRows (params: Dict = {}): Promise<Dict[]> {\n        const response = await this.publicGetRows (params);\n        return this.safeList (response, 'orders', []) as Dict[];\n    }\n    async fetchCached (params: Dict = {}): Promise<Dict> {\n        const response = await this.publicGetRows (params);\n        return this.safeDict (response, 'cached', {});\n    }\n    async fetchBorrowed (params: Dict = {}): Promise<Dict[]> {\n        let response = await this.publicGetRows (params);\n        if (!this.safeBool (response, 'snapshot', true)) {\n            response = await this.publicGetRows (params);\n        }\n        return this.safeList (response, 'orders', []);\n    }\n    async fetchMaybe (params: Dict = {}): Promise<Dict[]> {\n        const response = await this.publicGetRows (params);\n        return this.safeList (response, 'orders');\n    }\n    async fetchLoose (params: Dict = {}): Promise<Dict> {\n        const response = await this.publicGetRows (params);\n        return this.safeDict (response, 'x', { 'a': 1 });\n    }\n}\n";
const api = "import Exchange from '../base/Exchange.js';\nimport type { Dict } from '../base/Exchange.js';\nexport default abstract class venueApi extends Exchange {\n    publicGetRows (params = {}): Promise<Dict> { return this.hold (params); }\n}\n";
const root = fs.mkdtempSync (path.join (os.tmpdir (), 'astfx-rs-emptydefret-'));
for (const [rel, text] of Object.entries ({ 'ts/src/base/Exchange.ts': base, 'ts/src/abstract/venue.ts': api, 'ts/src/venue.ts': venue })) {
    fs.mkdirSync (path.dirname (path.join (root, rel)), { recursive: true });
    fs.writeFileSync (path.join (root, rel), text);
}
afterAll (() => fs.rmSync (root, { recursive: true, force: true }));

jest.mock ('module', () => ({ __esModule: true, default: jest.fn () }));

let out = '';
beforeAll (() => {
    const transpiler = new Transpiler ({ 'verbose': false, 'rust': { 'parser': { 'NUM_LINES_END_FILE': 0 } } });
    out = transpiler.transpileRustByPath (path.join (root, 'ts/src/venue.ts')).content;
});

describe ('rust venue container return through an empty-default reader', () => {
    test ('safeList with [] default: List return, typed reader', () => {
        expect (out).toMatch (/fn fetchRows\([^\n]*\) -> crate::value::List \{/);
        expect (out).toMatch (/return self\.safe_list_k_t\(&response, "orders"\);/);
    });
    test ('safeDict with {} default: Dict return, typed reader', () => {
        expect (out).toMatch (/fn fetchCached\([^\n]*\) -> crate::value::Dict \{/);
        expect (out).toMatch (/return self\.safe_dict_k_t\(&response, "cached"\);/);
    });
    test ('a reassigned receiver printed as a borrow still takes the typed reader', () => {
        expect (out).toMatch (/fn fetchBorrowed\([^\n]*\) -> crate::value::List \{/);
        expect (out).toMatch (/return self\.safe_list_k_t\(&response, "orders"\);/);
    });
    test ('negative: no default (missing key answers undefined) stays Value', () => {
        expect (out).toMatch (/fn fetchMaybe\([^\n]*\) -> Value \{/);
    });
    test ('negative: a non-empty default stays Value', () => {
        expect (out).toMatch (/fn fetchLoose\([^\n]*\) -> Value \{/);
    });
});
