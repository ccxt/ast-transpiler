import { Transpiler } from '../src/transpiler';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';

// the optional `params` of a typed unified method binds as `Dict` (get_arg_dict) when every use takes a map
const base = "export interface Dict { [key: string]: any }\nexport type Str = string | undefined;\nexport type Int = number | undefined;\nexport interface Trade { id: string }\nexport default class Exchange {\n    safeString (o: any, k: any, d: Str = undefined): Str { return o; }\n    omit (x: any, ...args: any): any { return x; }\n    extend (...args: any): any { return {}; }\n    deepExtend (...args: any): any { return {}; }\n    hold (x: any): any { return x; }\n    // METHODS BELOW THIS LINE ARE TRANSPILED FROM TYPESCRIPT\n    async fetchTrades (symbol: string, since: Int = undefined, limit: Int = undefined, params: Dict = {}): Promise<Trade[]> {\n        return [];\n    }\n}\n";
const venue = (body: string) => "import Exchange from './base/Exchange.js';\nimport type { Dict, Int, Trade } from './base/Exchange.js';\nexport default class venue extends Exchange {\n    async fetchTrades (symbol: string, since: Int = undefined, limit: Int = undefined, params: Dict = {}): Promise<Trade[]> {\n" + body + "        return [];\n    }\n}\n";
const root = fs.mkdtempSync (path.join (os.tmpdir (), 'astfx-rs-paramsdict-'));
afterAll (() => fs.rmSync (root, { recursive: true, force: true }));
jest.mock ('module', () => ({ __esModule: true, default: jest.fn () }));

function run (dir: string, body: string): string {
    fs.mkdirSync (path.join (root, dir, 'ts/src/base'), { recursive: true });
    fs.writeFileSync (path.join (root, dir, 'ts/src/base/Exchange.ts'), base);
    fs.writeFileSync (path.join (root, dir, 'ts/src/venue.ts'), venue (body));
    return new Transpiler ({ 'verbose': false, 'rust': { 'typedUnified': [ 'fetchTrades' ], 'parser': { 'NUM_LINES_END_FILE': 0 } } }).transpileRustByPath (path.join (root, dir, 'ts/src/venue.ts')).content;
}

const ternary = "        const until = this.safeString (params, 'until');\n        const paramsOmitted: Dict = (until !== undefined) ? this.omit (params, [ 'until' ]) : params;\n        this.hold (paramsOmitted);\n";

describe ('the params slot of a typed unified method is a Dict', () => {
    test ('a read and an omit-or-params ternary bind params as Dict and drop the into_dict wrap', () => {
        const out = run ('tern', ternary);
        expect (out).toContain ('let params: crate::value::Dict = get_arg_dict(optional_args, ');
        expect (out).toMatch (/paramsOmitted: crate::value::Dict = \(if [^\n]*\{ self\.omit_t\([^\n]*\} else \{ params(\.clone\(\))? \}\);/);
        expect (out).not.toMatch (/else \{ params \}\)\.into_dict\(\)/);
    });
    test ('the Dict-bound params is lent to every reader twin (`&Dict` is a KeyRead container)', () => {
        const out = run ('lend', ternary.replace ("'until');", "'until');\n        const ts = this.safeString (params, 'timestamp', 'x');\n        this.hold (ts);"));
        expect (out).toContain ('get_arg_dict(optional_args, ');
        expect (out).toMatch (/self\.safe_string_k_opt\(&params, "until"/);
        expect (out).toMatch (/self\.\w+\(&params, [^\n]*"timestamp"/);
        expect (out).not.toMatch (/self\.safe\w*\(params(\.clone\(\))?, /);
    });
    test ('negative: params handed to an untyped slot keeps the boxed get_arg', () => {
        const out = run ('hold', ternary + "        this.hold (params);\n");
        expect (out).not.toContain ('get_arg_dict');
        expect (out).toMatch (/let (mut )?params = get_arg\(optional_args, /);
    });
    test ('negative: a reassigned params keeps the boxed get_arg', () => {
        const out = run ('rebound', "        params = this.extend (params, {});\n" + ternary);
        expect (out).not.toContain ('get_arg_dict');
    });
});

describe ('a Dict-bound params is lent to a base extend as its sole extra operand', () => {
    test ('extend (request, params) lends &[&params] and binds params as Dict', () => {
        const out = run ('ext', "        const request: Dict = { 'a': 1 };\n        this.hold (this.extend (request, params));\n");
        expect (out).toContain ('let params: crate::value::Dict = get_arg_dict(optional_args, ');
        expect (out).toMatch (/self\.extend\([^\n]*, &\[&params\]\)/);
        expect (out).not.toContain ('params.clone()');
    });
    test ('negative: deepExtend (request, params) keeps the boxed params', () => {
        const out = run ('deep', "        const request: Dict = { 'a': 1 };\n        this.hold (this.deepExtend (request, params));\n");
        expect (out).not.toContain ('get_arg_dict');
    });
    test ('negative: params as the extend head keeps the boxed params', () => {
        const out = run ('head', "        this.hold (this.extend (params, { 'a': 1 }));\n");
        expect (out).not.toContain ('get_arg_dict');
    });
});

describe ('an extend operand never turns a moved ternary arm into a clone', () => {
    test ('negative: params read after an omit-or-params ternary arm and lent to extend keeps the boxed params', () => {
        const out = run ('tern-ext', ternary + "        const request: Dict = { 'a': 1 };\n        this.hold (this.extend (request, params));\n");
        // the boxed form already clones the arm on the base printer; the rule must refuse the Dict binding here
        expect (out).not.toContain ('get_arg_dict');
        expect (out).not.toContain ('&[&params]');
    });
});

describe ('a Dict alias of the params slot and a venue helper params slot take the map', () => {
    const helper = "    getKind (method: string, params: Dict = {}): [Str, Dict] {\n        return [ this.safeString (params, 'type'), this.omit (params, 'type') ];\n    }\n";
    const runWith = (dir: string, body: string) => {
        fs.mkdirSync (path.join (root, dir, 'ts/src/base'), { recursive: true });
        fs.writeFileSync (path.join (root, dir, 'ts/src/base/Exchange.ts'), base);
        fs.writeFileSync (path.join (root, dir, 'ts/src/venue.ts'), venue (body).replace (/\}\n$/, helper + '}\n').replace ('import type { Dict, Int, Trade }', 'import type { Dict, Int, Str, Trade }'));
        return new Transpiler ({ 'verbose': false, 'rust': { 'typedUnified': [ 'fetchTrades' ], 'parser': { 'NUM_LINES_END_FILE': 0 } } }).transpileRustByPath (path.join (root, dir, 'ts/src/venue.ts')).content;
    };
    const alias = "        let query: Dict = params;\n        if (symbol === 'x') {\n            let kind: Str = undefined;\n            [ kind, query ] = this.getKind ('fetchTrades', params);\n            this.hold (kind);\n        }\n        const rest = this.omit (query, 'type');\n        this.hold (rest);\n";
    test ('`let query: Dict = params` is a plain map binding and params is handed to the helper slot', () => {
        const out = runWith ('alias', alias);
        expect (out).toContain ('let params: crate::value::Dict = get_arg_dict(optional_args, ');
        expect (out).toMatch (/let mut query: crate::value::Dict = params(\.clone\(\))?;/);
        expect (out).not.toContain ('params.clone().into_dict()');
        expect (out).not.toMatch (/match &?params \{ Value::/);
        expect (out).toMatch (/self\.(get_kind|getKind)\("fetchTrades", &\[&?(Value::Dict\(params\)|Value::from\(&params\))\]\)/);
    });
    test ('negative: an untyped alias of params keeps the boxed get_arg', () => {
        const out = runWith ('alias-any', "        const query = params;\n        this.hold (query);\n");
        expect (out).not.toContain ('get_arg_dict');
    });
    test ('negative: params handed to a helper slot that is not a Dict keeps the boxed get_arg', () => {
        const out = runWith ('alias-hold', alias + "        this.hold (params);\n");
        expect (out).not.toContain ('get_arg_dict');
    });
});

describe ('an unannotated alias of the params slot takes the map', () => {
    const body = "        const network = this.safeString (params, 'network');\n        let paramsOmitted = params;\n        if (network !== undefined) {\n            paramsOmitted = this.omit (paramsOmitted, 'network');\n        }\n        const request: Dict = { 'a': 1 };\n        this.hold (this.extend (request, paramsOmitted));\n";
    test ('`let q = params` binds params as Dict and drops the into_dict wrap', () => {
        const out = run ('alias-plain', body);
        expect (out).toContain ('let params: crate::value::Dict = get_arg_dict(optional_args, ');
        expect (out).not.toContain ('params.into_dict()');
        expect (out).not.toContain ('params.clone().into_dict()');
    });
    test ('negative: an unannotated alias handed to an untyped slot keeps the boxed get_arg', () => {
        const out = run ('alias-plain-hold', "        const q = params;\n        this.hold (q);\n");
        expect (out).not.toContain ('get_arg_dict');
    });
    test ('negative: an unannotated alias with params also handed to an untyped slot keeps the boxed get_arg', () => {
        const out = run ('alias-plain-both', body + "        this.hold (params);\n");
        expect (out).not.toContain ('get_arg_dict');
    });
});
