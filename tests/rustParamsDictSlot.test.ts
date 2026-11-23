import { Transpiler } from '../src/transpiler';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';

// the optional `params` of a typed unified method binds as `Dict` (get_arg_dict) when every use takes a map
const base = "export interface Dict { [key: string]: any }\nexport type Str = string | undefined;\nexport type Int = number | undefined;\nexport interface Trade { id: string }\nexport default class Exchange {\n    safeString (o: any, k: any, d: Str = undefined): Str { return o; }\n    omit (x: any, ...args: any): any { return x; }\n    extend (...args: any): any { return {}; }\n    hold (x: any): any { return x; }\n    // METHODS BELOW THIS LINE ARE TRANSPILED FROM TYPESCRIPT\n    async fetchTrades (symbol: string, since: Int = undefined, limit: Int = undefined, params: Dict = {}): Promise<Trade[]> {\n        return [];\n    }\n}\n";
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
