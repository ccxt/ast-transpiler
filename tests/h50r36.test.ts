import { Transpiler } from '../src/transpiler.js';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

describe('h50-R36: `safeDict (this.urls[..][..], k)` on a literal config path reads the map natively', () => {
    const run = (body: string, file = 'ts/src/pro/venue.ts') => {
        const root = fs.mkdtempSync (path.join (os.tmpdir (), 'r36-'));
        fs.mkdirSync (path.join (root, 'ts/src/base'), { recursive: true });
        fs.mkdirSync (path.join (root, path.dirname (file)), { recursive: true });
        fs.writeFileSync (path.join (root, 'ts/src/base/Exchange.ts'), "export interface Dict { [key: string]: any }\nexport type Str = string | undefined;\nexport default class Exchange {\n    options: Dict = {};\n    urls: Dict = {};\n    fees: Dict = {};\n    safeString (o: any, k: any, d: Str = undefined): Str { return o[k]; }\n    safeDict (o: any, k: any, d: Dict = undefined): Dict | undefined { return o[k]; }\n}\n");
        const up = file.split ('/').length - 3;
        fs.writeFileSync (path.join (root, file), "import Exchange from '" + '../'.repeat (up) + "./base/Exchange.js';\nimport type { Dict, Str } from '" + '../'.repeat (up) + "./base/Exchange.js';\nexport default class venue extends Exchange {\n" + body + "}\n");
        const t = new Transpiler ({ 'verbose': false, 'rust': { 'parser': { 'NUM_LINES_END_FILE': 0 } } });
        try { return t.transpileRustByPath (path.join (root, file)).content; } finally { fs.rmSync (root, { recursive: true, force: true }); }
    };
    const body = (read: string) => "    m (params: Dict) {\n        const marketType = this.safeString (params, 'type', 'spot');\n" + read + "    }\n";
    test('one step with a literal key: missing / Null / non-map at either level answers the empty map', () => {
        const out = run (body ("        const wsUrls = this.safeDict (this.urls['api'], 'ws', {});\n        return this.safeString (wsUrls, 'public');\n"));
        expect (out).toContain ('(if let Some(Value::Dict(__p1)) = self.urls.get("api") { if let Some(Value::Dict(__m)) = __p1.get("ws") { std::sync::Arc::clone(__m) } else { Default::default() } } else { Default::default() })');
        expect (out).not.toContain ('safe_dict_t(self.urls.get("api")');
    });
    test('two steps with a `string` key', () => {
        const out = run (body ("        const typeUrls: Dict = this.safeDict (this.urls['api']['ws'], marketType, {});\n        return this.safeString (typeUrls, 'public');\n"));
        expect (out).toContain ('if let Some(Value::Dict(__p1)) = self.urls.get("api") { if let Some(Value::Dict(__p2)) = __p1.get("ws") { if let Some(Value::Dict(__m)) = __p2.get(marketType');
    });
    test('negative: a non-empty default keeps the helper', () => {
        const out = run (body ("        const wsUrls = this.safeDict (this.urls['api'], 'ws', { 'a': 1 });\n        return this.safeString (wsUrls, 'public');\n"));
        expect (out).not.toContain ('Value::Dict(__p1)');
    });
    test('negative: a REST file keeps the helper (outside this rule)', () => {
        const out = run (body ("        const wsUrls = this.safeDict (this.urls['api'], 'ws', {});\n        return this.safeString (wsUrls, 'public');\n"), 'ts/src/venue.ts');
        expect (out).not.toContain ('Value::Dict(__p1)');
    });
    test('negative: a non-config receiver keeps the helper', () => {
        const out = run (body ("        const wsUrls = this.safeDict (params['api'], 'ws', {});\n        return this.safeString (wsUrls, 'public');\n"));
        expect (out).not.toContain ('Value::Dict(__p1)');
    });
    test('negative: a variable path step keeps the helper', () => {
        const out = run (body ("        const wsUrls = this.safeDict (this.urls[marketType], 'ws', {});\n        return this.safeString (wsUrls, 'public');\n"));
        expect (out).not.toContain ('Value::Dict(__p1)');
    });
});
