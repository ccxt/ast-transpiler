import { Transpiler } from '../src/transpiler';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// a keyed `safeDict` of an `indexBy` local whose key is an unwritten typed string parameter reads the map natively;
// the key is spelled by the parameter's printed binding (here the body's `Value` rebinding)
const base = 'export interface Dict { [key: string]: any }\nexport type Str = string | undefined;\nexport type Int = number | undefined;\n' +
    'export default class Exchange {\n    accounts: any = undefined;\n    // METHODS BELOW THIS LINE ARE TRANSPILED FROM TYPESCRIPT\n' +
    '    safeDict (o: any, k: any, d: Dict = undefined): Dict | undefined { return o; }\n' +
    '    safeString (o: any, k: any, d: Str = undefined): Str { return o; }\n' +
    '    indexBy (o: any, k: any): Dict { return o; }\n}\n';
const venue = "import Exchange from './base/Exchange.js';\nimport type { Dict, Str, Int } from './base/Exchange.js';\n" +
    'export default class venue extends Exchange {\n' +
    "    async fetchLedger (code: Str = undefined, since: Int = undefined, limit: Int = undefined, params = {}) {\n        const byCode = this.indexBy (this.accounts, 'currency');\n        const account = this.safeDict (byCode, code);\n        return this.safeString (account, 'x');\n    }\n" +
    "    async fetchDepositAddress (code: string, params = {}) {\n        const byCode = this.indexBy (this.accounts, 'currency');\n        const account = this.safeDict (byCode, code);\n        return this.safeString (account, 'x');\n    }\n" +
    "    async fetchDeposits (code: Str = undefined, since: Int = undefined, limit: Int = undefined, params = {}) {\n        code = 'x';\n        const byCode = this.indexBy (this.accounts, 'currency');\n        const account = this.safeDict (byCode, code);\n        return this.safeString (account, 'x');\n    }\n" +
    "    methodN (rows: any, code: Str) {\n        const byCode = rows;\n        const account = this.safeDict (byCode, code);\n        return this.safeString (account, 'x');\n    }\n}\n";

describe ('rust keyed safeDict on a plain map local with a typed string parameter key', () => {
    let output = '';
    beforeAll (() => {
        const root = fs.mkdtempSync (path.join (os.tmpdir (), 'h52r08-'));
        fs.mkdirSync (path.join (root, 'ts', 'src', 'base'), { recursive: true });
        fs.writeFileSync (path.join (root, 'ts', 'src', 'base', 'Exchange.ts'), base);
        fs.writeFileSync (path.join (root, 'ts', 'src', 'venue.ts'), venue);
        const t = new Transpiler ({ 'verbose': false, 'rust': { 'parser': { 'NUM_LINES_END_FILE': 0 } } } as any);
        output = t.transpileRustByPath (path.join (root, 'ts', 'src', 'venue.ts')).content;
        fs.rmSync (root, { recursive: true, force: true });
    });
    const part = (a: string, b?: string) => output.slice (output.indexOf ('fn ' + a), b === undefined ? undefined : output.indexOf ('fn ' + b));
    test ('Option<&str> key: missing / None key / non-map -> empty map', () => {
        const a = part ('fetchLedger', 'fetchDepositAddress');
        expect (a).toContain ('if let Some(Value::Dict(__m)) = byCode.get(code.as_str().unwrap_or("null")) { std::sync::Arc::clone(__m) } else { Default::default() }');
        expect (a).not.toContain ('safeDict(');
    });
    test ('&str key', () => {
        const a = part ('fetchDepositAddress', 'fetchDeposits');
        expect (a).toContain ('if let Some(Value::Dict(__m)) = byCode.get(code.as_str().unwrap_or_default()) { std::sync::Arc::clone(__m) } else { Default::default() }');
    });
    test ('negatives: a written parameter and an untyped receiver keep the helper', () => {
        expect (part ('fetchDeposits', 'methodN')).not.toContain ('if let Some(Value::Dict(__m))');
        expect (part ('methodN')).not.toContain ('if let Some(Value::Dict(__m))');
    });
});

// a borrowed (never rebound) `&str` / `Option<&str>` parameter prints `Value::from(p)`: the key is the borrow itself
describe ('rust keyed safeDict of a config map with a lent string parameter key', () => {
    const run = (body: string): string => {
        const root = fs.mkdtempSync (path.join (os.tmpdir (), 'h52r08b-'));
        fs.mkdirSync (path.join (root, 'ts', 'src', 'base'), { recursive: true });
        fs.writeFileSync (path.join (root, 'ts', 'src', 'base', 'Exchange.ts'), "export interface Dict { [key: string]: any }\nexport type Str = string | undefined;\nexport default class Exchange {\n    options: Dict = {};\n    // METHODS BELOW THIS LINE ARE TRANSPILED FROM TYPESCRIPT\n    safeString (o: any, k: any, d: Str = undefined): Str { return o; }\n    safeDict (o: any, k: any, d: Dict = undefined): Dict | undefined { return o; }\n}\n");
        fs.writeFileSync (path.join (root, 'ts', 'src', 'venue.ts'), "import Exchange from './base/Exchange.js';\nimport type { Dict, Str } from './base/Exchange.js';\nexport default class venue extends Exchange {\n" + body + "}\n");
        const t = new Transpiler ({ 'verbose': false, 'rust': { 'parser': { 'NUM_LINES_END_FILE': 0 } } } as any);
        try { return t.transpileRustByPath (path.join (root, 'ts', 'src', 'venue.ts')).content; } finally { fs.rmSync (root, { recursive: true, force: true }); }
    };
    test ('the key text never applies a str method to a Value box', () => {
        const out = run ("    getKey (a: string, b: string) {\n        const auths = this.safeDict (this.options, 'auths', {});\n        const x = this.safeDict (auths, a, {});\n        const y = this.safeDict (x, b, {});\n        return this.safeString (y, 'k');\n    }\n    other (t: Str = undefined) {\n        const o = this.safeDict (this.options, t, {});\n        return this.safeString (o, 'k');\n    }\n");
        expect (out).not.toMatch (/\.get\(Value::from\(/);
        expect (out).not.toMatch (/Value::from\(\w+\)\.unwrap_or\(/);
    });
});
