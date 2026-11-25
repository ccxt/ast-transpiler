import { Transpiler } from '../src/transpiler.js';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

describe('h51-R36: `safeDict (this.urls[..][..], k)` on a literal config path reads the map natively', () => {
    const run = (body: string, file = 'ts/src/pro/venue.ts') => {
        const root = fs.mkdtempSync (path.join (os.tmpdir (), 'r36b-'));
        fs.mkdirSync (path.join (root, 'ts/src/base'), { recursive: true });
        fs.mkdirSync (path.join (root, path.dirname (file)), { recursive: true });
        fs.writeFileSync (path.join (root, 'ts/src/base/Exchange.ts'), "export interface Dict { [key: string]: any }\nexport type Str = string | undefined;\nexport default class Exchange {\n    options: Dict = {};\n    urls: Dict = {};\n    fees: Dict = {};\n    safeString (o: any, k: any, d: Str = undefined): Str { return o[k]; }\n    safeDict (o: any, k: any, d: Dict = undefined): Dict | undefined { return o[k]; }\n}\n");
        const up = file.split ('/').length - 3;
        fs.writeFileSync (path.join (root, file), "import Exchange from '" + '../'.repeat (up) + "./base/Exchange.js';\nimport type { Dict, Str } from '" + '../'.repeat (up) + "./base/Exchange.js';\nexport default class venue extends Exchange {\n" + body + "}\n");
        const t = new Transpiler ({ 'verbose': false, 'rust': { 'parser': { 'NUM_LINES_END_FILE': 0 } } });
        try { return t.transpileRustByPath (path.join (root, file)).content; } finally { fs.rmSync (root, { recursive: true, force: true }); }
    };
    test('a tuple string slot key reads the options map natively', () => {
        const out = run ("    m (params: Dict) {\n        const [ kind, rest ] = this.handleParamString (params, 'k', 'spot');\n        const options = this.safeDict (this.options, kind, {});\n        return this.safeString (options, 'x');\n    }\n    handleParamString (p: Dict, k: string, d: Str = undefined): [Str, Dict] { return [ d, p ]; }\n");
        expect (out).not.toContain ('safe_dict_t(&self.options');
        expect (out).toContain ('(if let Some(Value::Dict(__m)) = self.options.get(kind.as_deref().unwrap_or("null")) { std::sync::Arc::clone(__m) } else { Default::default() })');
    });
    test('negative: an untyped parameter key keeps the helper', () => {
        const out = run ("    m (marketType, params: Dict = {}) {\n        const options = this.safeDict (this.options, marketType, {});\n        return this.safeString (options, 'x');\n    }\n");
        expect (out).not.toContain ('self.options.get(marketType');
    });
});
