import { Transpiler } from '../src/transpiler';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';

// `describe (): Dict` (base literal, venue `deepExtend (super.describe (), {..})`) returns the typed map; a `Value` slot boxes it once
const base = "export interface Dict { [key: string]: any }\nexport default class Exchange {\n    id: string = undefined;\n    deepExtend (...args: any[]): any { return args[0]; }\n    describe (): Dict {\n        return { 'id': undefined, 'has': {} };\n    }\n}\n";
const venue = "import Exchange from './base/Exchange.js';\nimport type { Dict } from './base/Exchange.js';\nexport default class venue extends Exchange {\n    describe (): Dict {\n        return this.deepExtend (super.describe (), { 'id': 'venue' });\n    }\n    describeOther (): any {\n        return { 'id': 'x' };\n    }\n    readId () {\n        const d = this.describe ();\n        return d['id'];\n    }\n}\n";
const root = fs.mkdtempSync (path.join (os.tmpdir (), 'astfx-rs-describe-'));
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

describe ('rust describe returns Dict', () => {
    test ('venue override: Dict return through deep_extend_t', () => {
        expect (out).toMatch (/fn describe\(&self\) -> crate::value::Dict \{/);
        expect (out).toMatch (/return self\.deep_extend_t\(/);
    });
    test ('base literal: Dict return of the map', () => {
        expect (baseOut).toMatch (/fn describe\(&self\) -> crate::value::Dict \{/);
        expect (baseOut).toMatch (/return std::sync::Arc::new\(/);
    });
    test ('a Value slot boxes the call once', () => {
        expect (out).toMatch (/Value::Dict\(self\.describe\(\)\)/);
    });
    test ('negative: another method with a map literal stays Value', () => {
        expect (out).toMatch (/fn describeOther\(&self\) -> Value \{/);
    });
});
