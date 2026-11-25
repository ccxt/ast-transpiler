import { Transpiler } from '../src/transpiler';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

jest.setTimeout (120000);

describe ('literal map read: `safeDict (d, k)` on a literal `Dict` local keyed by a string parameter reads the native map', () => {
    const run = (body: string, file = 'ts/src/venue.ts') => {
        const root = fs.mkdtempSync (path.join (os.tmpdir (), 'r35-'));
        fs.mkdirSync (path.join (root, 'ts/src/base'), { recursive: true });
        fs.mkdirSync (path.join (root, path.dirname (file)), { recursive: true });
        fs.writeFileSync (path.join (root, 'ts/src/base/Exchange.ts'), "export interface Dict { [key: string]: any }\nexport type Str = string | undefined;\nexport default class Exchange {\n    safeString (o: any, k: any, d: Str = undefined): Str { return o[k]; }\n    safeDict (o: any, k: any, d: Dict = undefined): Dict | undefined { return o[k]; }\n    hold (x: any): any { return x; }\n}\n");
        const up = file.split ('/').length - 3;
        fs.writeFileSync (path.join (root, file), "import Exchange from '" + '../'.repeat (up) + "./base/Exchange.js';\nimport type { Dict, Str } from '" + '../'.repeat (up) + "./base/Exchange.js';\nexport default class venue extends Exchange {\n" + body + "}\n");
        const t = new Transpiler ({ 'verbose': false, 'rust': { 'parser': { 'NUM_LINES_END_FILE': 0 } } });
        try { return t.transpileRustByPath (path.join (root, file)).content; } finally { fs.rmSync (root, { recursive: true, force: true }); }
    };
    const method = (read: string, extra = '') => "    parseStatusByType (status: Str, type: Str = undefined): Str {\n        const statusesByType: Dict = {\n            'deposit': {\n                '0': 'pending',\n                '1': 'ok',\n            },\n            'withdrawal': {\n                '0': 'pending',\n            },\n        };\n" + read + extra + "        return this.safeString (statuses, status, status);\n    }\n    caller (s: Str) {\n        return this.parseStatusByType (s, 'deposit');\n    }\n";
    test ('a `Str` parameter key: the entry map, the empty map for a missing / non-map entry, `None` reads "null"', () => {
        const out = run (method ("        const statuses = this.safeDict (statusesByType, type, {});\n"));
        expect (out).toContain ('(if let Some(Value::Dict(__m)) = statusesByType.get(type_var.as_str().unwrap_or("null")) { std::sync::Arc::clone(__m) } else { Default::default() })');
        expect (out).not.toContain ('safe_dict_t(&statusesByType');
    });
    test ('negative: a non-empty default keeps the helper', () => {
        const out = run (method ("        const statuses = this.safeDict (statusesByType, type, { 'x': 'y' });\n"));
        expect (out).not.toContain ('statusesByType.get(');
    });
    test ('negative: a ws file keeps the helper', () => {
        const out = run (method ("        const statuses = this.safeDict (statusesByType, type, {});\n"), 'ts/src/pro/venue.ts');
        expect (out).not.toContain ('statusesByType.get(');
    });
    test ('a literal also handed on whole is still the native map at the read (it boxes only at the hand-on)', () => {
        const out = run (method ("        const statuses = this.safeDict (statusesByType, type, {});\n", "        this.hold (statusesByType);\n"));
        expect (out).toContain ('statusesByType.get(type_var.as_str().unwrap_or("null"))');
        expect (out).toContain ('self.hold(Value::Map(statusesByType))');
    });
    test ('a plain `string` parameter key reads its boxed copy as a string', () => {
        const out = run ("    m (k: string) {\n        const byId: Dict = {\n            'a': { 'b': 'c' },\n        };\n        const d = this.safeDict (byId, k, {});\n        return this.safeString (d, 'b');\n    }\n    c () {\n        return this.m ('a');\n    }\n");
        expect (out).not.toContain ('k.as_deref()');
        expect (out).not.toMatch (/byId\.get\(k\)/);
    });
    test ('negative: a number parameter key keeps the helper', () => {
        const out = run ("    m (n: number) {\n        const byId: Dict = {\n            '1': { 'a': 'b' },\n        };\n        const d = this.safeDict (byId, n, {});\n        return this.safeString (d, 'a');\n    }\n    c () {\n        return this.m (1);\n    }\n");
        expect (out).not.toContain ('byId.get(');
    });
});
