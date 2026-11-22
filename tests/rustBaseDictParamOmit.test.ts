import { Transpiler } from '../src/transpiler';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';

// a base-tier `omit` of a never-reassigned `params: Dict` parameter answers the map the declaration names (ccxt's
// build pass then calls the typed `omit_t` for the `.into_dict()`)
const files: Record<string, string> = {
 "ts/src/base/Exchange.ts": "export interface Dict { [key: string]: any }\nexport default class Exchange {\n    omit (x: any, ...args: any): any { return x; }\n    hold (x: any): any { return x; }\n    handleTypeParams (methodName: string, params: Dict = {}): [string, Dict] {\n        const paramsOmitted = this.omit (params, [ 'type', 'defaultType' ]);\n        return [ methodName, paramsOmitted ];\n    }\n    handleLooseParams (methodName: string, params: any = {}): [string, Dict] {\n        const looseOmitted = this.omit (params, [ 'type' ]);\n        return [ methodName, looseOmitted ];\n    }\n    handleRebound (methodName: string, params: Dict = {}): [string, Dict] {\n        params = this.hold (params);\n        const reboundOmitted = this.omit (params, [ 'type' ]);\n        return [ methodName, reboundOmitted ];\n    }\n}\n"
};
const root = fs.mkdtempSync (path.join (os.tmpdir (), 'astfx-rs-basedictomit-'));
for (const [rel, text] of Object.entries (files)) {
    fs.mkdirSync (path.dirname (path.join (root, rel)), { recursive: true });
    fs.writeFileSync (path.join (root, rel), text);
}
afterAll (() => fs.rmSync (root, { recursive: true, force: true }));

jest.mock ('module', () => ({ __esModule: true, default: jest.fn () }));

let out = '';
beforeAll (() => {
    const transpiler = new Transpiler ({ 'verbose': false, 'rust': { 'parser': { 'NUM_LINES_END_FILE': 0 } } });
    out = transpiler.transpileRustByPath (path.join (root, 'ts/src/base/Exchange.ts')).content;
});

describe ('rust omit of a base Dict parameter', () => {
    test ('omit of a params: Dict parameter is a typed Dict local', () => {
        expect (out).toMatch (/let (mut )?paramsOmitted: crate::value::Dict = self\.omit\(params, [^\n]*\)\.into_dict\(\);/);
        expect (out).not.toMatch (/paramsOmitted: Value/);
    });
    test ('negative: an any-typed parameter (nil / wrong kind possible) keeps the boxed omit', () => {
        expect (out).toMatch (/let (mut )?looseOmitted: Value = self\.omit\(/);
    });
    test ('negative: a reassigned Dict parameter keeps the boxed omit', () => {
        expect (out).toMatch (/let (mut )?reboundOmitted: Value = self\.omit\(/);
    });
});
