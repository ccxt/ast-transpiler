import { Transpiler } from '../src/transpiler';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';

// the optional `params: Dict = {}` of a base helper returning `[.., Dict]` binds as `Dict` when every use takes a map
const files: Record<string, string> = {
    "ts/src/base/Exchange.ts": "export interface Dict { [key: string]: any }\nexport type Str = string | undefined;\nexport default class Exchange {\n    options: Dict = {};\n    safeString2 (o: any, k1: any, k2: any, d: Str = undefined): Str { return o; }\n    omit (x: any, ...args: any): any { return x; }\n    hold (x: any): any { return x; }\n    handleKindAndParams (methodName: string, params: Dict = {}, defaultValue: Str = undefined): [string, Dict] {\n        const kind = this.safeString2 (params, 'defaultKind', 'kind');\n        if (kind !== undefined) {\n            const paramsOmitted = this.omit (params, [ 'defaultKind', 'kind' ]);\n            return [ kind, paramsOmitted ];\n        }\n        if (defaultValue !== undefined) {\n            return [ defaultValue, params ];\n        }\n        return [ methodName, params ];\n    }\n    handleHeldAndParams (methodName: string, params: Dict = {}): [string, Dict] {\n        this.hold (params);\n        return [ methodName, params ];\n    }\n    handleReboundAndParams (methodName: string, params: Dict = {}): [string, Dict] {\n        params = this.omit (params, 'x');\n        return [ methodName, params ];\n    }\n    handleLooseAndParams (methodName: string, params: any = {}): [string, Dict] {\n        const kind = this.safeString2 (params, 'a', 'b');\n        return [ kind, params ];\n    }\n}\n",
};
const root = fs.mkdtempSync (path.join (os.tmpdir (), 'astfx-rs-h49r53-'));
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

const body = (name: string): string => {
    const at = out.indexOf ('fn ' + name + '(');
    if (at < 0) throw new Error ('missing ' + name);
    const next = out.indexOf ('\n    fn ', at + 1);
    return out.slice (at, next < 0 ? out.length : next);
};

describe ('the params slot of a base [.., Dict] helper is a Dict', () => {
    test ('read, omitted and returned params binds as Dict', () => {
        const b = body ('handleKindAndParams');
        expect (b).toContain ('let params: crate::value::Dict = get_arg_dict(optional_args, 0);');
        expect (b).not.toContain ('params.into_dict()');
        expect (b).toContain ('return Value::from(vec![methodName, Value::Dict(params)]);');
    });
    test ('negative: params handed to an untyped slot keeps the boxed get_arg', () => {
        expect (body ('handleHeldAndParams')).not.toContain ('get_arg_dict');
    });
    test ('negative: a reassigned params keeps the boxed get_arg', () => {
        expect (body ('handleReboundAndParams')).not.toContain ('get_arg_dict');
    });
    test ('negative: an any params keeps the boxed get_arg', () => {
        expect (body ('handleLooseAndParams')).not.toContain ('get_arg_dict');
    });
});
