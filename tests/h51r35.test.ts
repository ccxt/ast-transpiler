import { Transpiler } from '../src/transpiler.js';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

describe('h51-R35: REST `safeDict (this.options[<lit>], k)` reads the config map natively', () => {
    const run = (body: string, file = 'ts/src/pro/venue.ts') => {
        const root = fs.mkdtempSync (path.join (os.tmpdir (), 'r35-'));
        fs.mkdirSync (path.join (root, 'ts/src/base'), { recursive: true });
        fs.mkdirSync (path.join (root, path.dirname (file)), { recursive: true });
        fs.writeFileSync (path.join (root, 'ts/src/base/Exchange.ts'), "export interface Dict { [key: string]: any }\nexport type Str = string | undefined;\nexport default class Exchange {\n    options: Dict = {};\n    urls: Dict = {};\n    fees: Dict = {};\n    safeString (o: any, k: any, d: Str = undefined): Str { return o[k]; }\n    safeDict (o: any, k: any, d: Dict = undefined): Dict | undefined { return o[k]; }\n}\n");
        const up = file.split ('/').length - 3;
        fs.writeFileSync (path.join (root, file), "import Exchange from '" + '../'.repeat (up) + "./base/Exchange.js';\nimport type { Dict, Str } from '" + '../'.repeat (up) + "./base/Exchange.js';\nexport default class venue extends Exchange {\n" + body + "}\n");
        const t = new Transpiler ({ 'verbose': false, 'rust': { 'parser': { 'NUM_LINES_END_FILE': 0 } } });
        try { return t.transpileRustByPath (path.join (root, file)).content; } finally { fs.rmSync (root, { recursive: true, force: true }); }
    };
    const body = (read: string) => "    m (params: Dict) {\n        const marketType = this.safeString (params, 'type', 'spot');\n" + read + "    }\n";
    test('REST options path with a string local key', () => {
        const out = run (body ("        const o = this.safeDict (this.options['fetchOHLCV'], marketType, {});\n        return this.safeString (o, 'x');\n"), 'ts/src/venue.ts');
        expect (out).toContain ('(if let Some(Value::Dict(__p1)) = self.options.get("fetchOHLCV") { if let Some(Value::Dict(__m)) = __p1.get(');
        expect (out).not.toContain ('safe_dict_t(self.options.get("fetchOHLCV")');
    });
    test('REST options path with a literal key', () => {
        const out = run (body ("        const o = this.safeDict (this.options['fetchOHLCV'], 'maxRecent', {});\n        return this.safeString (o, 'x');\n"), 'ts/src/venue.ts');
        expect (out).toContain ('__p1.get("maxRecent")');
    });
    test('negative: REST urls path keeps the helper', () => {
        const out = run (body ("        const o = this.safeDict (this.urls['api'], 'ws', {});\n        return this.safeString (o, 'x');\n"), 'ts/src/venue.ts');
        expect (out).not.toContain ('Value::Dict(__p1)');
    });
    test('negative: REST non-empty default keeps the helper', () => {
        const out = run (body ("        const o = this.safeDict (this.options['fetchOHLCV'], 'k', { 'a': 1 });\n        return this.safeString (o, 'x');\n"), 'ts/src/venue.ts');
        expect (out).not.toContain ('Value::Dict(__p1)');
    });
    test('negative: REST variable path step keeps the helper', () => {
        const out = run (body ("        const o = this.safeDict (this.options[marketType], 'k', {});\n        return this.safeString (o, 'x');\n"), 'ts/src/venue.ts');
        expect (out).not.toContain ('Value::Dict(__p1)');
    });
});
