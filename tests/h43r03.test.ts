import { Transpiler } from '../src/transpiler';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';

const base = "export interface Dict { [key: string]: any }\nexport type List = any[];\nexport type Int = number | undefined;\nexport default class Exchange {\n    options: Dict = {};\n    omit (o: any, k: any): any { return o; }\n    keysort (o: any): any { return o; }\n    extend (...a: any[]): any { return a; }\n    extractParams (s: string): string[] { return [ s ]; }\n    handleUntilOption (key: string, request: Dict, params: Dict, multiplier = 1): any[] { return [ request, this.omit (params, [ key, 'until' ]) ]; }\n    hold (x: any): any { return x; }\n}\n";
const venue = "import venueApi from './abstract/venue.js';\nimport type { Dict, Int } from './base/Exchange.js';\nexport default class venue extends venueApi {\n    signA (path: string, params: Dict = {}): Dict {\n        const paramsSorted: Dict = this.keysort (this.omit (params, this.extractParams (path)));\n        return this.hold (paramsSorted);\n    }\n    signB (params: Dict = {}): Dict {\n        const order: Dict = { 'a': 1, 'b': this.hold (params) };\n        const sortedOrder: Dict = this.keysort (order);\n        return this.hold (sortedOrder);\n    }\n    signC (params: Dict = {}): Dict {\n        const sorted = this.keysort (params);\n        return this.hold (sorted);\n    }\n}\n";
const api = "import Exchange from '../base/Exchange.js';\nimport type { Dict } from '../base/Exchange.js';\nexport default abstract class venueApi extends Exchange {\n    publicGetRows (params = {}): Promise<Dict> { return this.hold (params); }\n}\n";
const root = fs.mkdtempSync (path.join (os.tmpdir (), 'astfx-rs-h43r03-'));
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
    if (process.env.H43R03_DUMP) fs.writeFileSync (process.env.H43R03_DUMP, out);
});

describe ('rust keysort of a proven map answers a Dict; omit keeps its boxed form', () => {
    test ('a keysort of a proven map read into a Dict local takes the typed twin (fails on the base printer)', () => {
        expect (out).toMatch (/let mut sortedOrder: crate::value::Dict = self\.keysort_t\(Value::(Map|Dict)\(order\), &\[\]\);/);
        expect (out).not.toMatch (/self\.keysort\([^\n]*\)\.into_dict\(\)/);
    });
    test ('negative: an unannotated keysort local keeps the Value', () => {
        expect (out).toMatch (/let mut sorted: Value = self\.keysort\(/);
        expect (out).not.toMatch (/let mut sorted: crate::value::Dict/);
    });
    test ('negative: an omit nested in a keysort is not rewritten to omit_t', () => {
        expect (out).not.toContain ('self.omit_t(');
    });
});
