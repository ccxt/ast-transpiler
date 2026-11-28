import { Transpiler } from '../src/transpiler';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// a keyed `safeDict` of a typed `const x: Dict = {}` local (printed `indexmap::IndexMap`) reads the map natively
const base = 'export interface Dict { [key: string]: any }\nexport type Str = string | undefined;\n' +
    'export default class Exchange {\n    // METHODS BELOW THIS LINE ARE TRANSPILED FROM TYPESCRIPT\n' +
    '    safeDict (o: any, k: any, d: Dict = undefined): Dict | undefined { return o; }\n' +
    '    safeString (o: any, k: any, d: Str = undefined): Str { return o; }\n}\n';
const venue = "import Exchange from './base/Exchange.js';\nimport type { Dict, Str } from './base/Exchange.js';\n" +
    'export default class venue extends Exchange {\n' +
    "    methodA (rows: any[], message: any) {\n        const code = this.safeString (message, 'code');\n        const byCode: Dict = {};\n        for (let i = 0; i < rows.length; i++) {\n            const id = this.safeString (rows[i], 'id');\n            byCode[id] = rows[i];\n        }\n        const entry = this.safeDict (byCode, code);\n        if (entry === undefined) {\n            return undefined;\n        }\n        return this.safeString (entry, 'x');\n    }\n" +
    "    methodB (rows: any, code: Str) {\n        const byCode = rows;\n        const entry = this.safeDict (byCode, code);\n        return this.safeString (entry, 'x');\n    }\n" +
    "    methodC (code: number) {\n        const byCode: Dict = {};\n        byCode['a'] = {};\n        const entry = this.safeDict (byCode, code);\n        return this.safeString (entry, 'x');\n    }\n}\n";

describe ('rust typed Dict literal local: keyed safeDict reads the map natively', () => {
    let output = '';
    beforeAll (() => {
        const root = fs.mkdtempSync (path.join (os.tmpdir (), 'h50r39-'));
        fs.mkdirSync (path.join (root, 'ts', 'src', 'base'), { recursive: true });
        fs.writeFileSync (path.join (root, 'ts', 'src', 'base', 'Exchange.ts'), base);
        fs.writeFileSync (path.join (root, 'ts', 'src', 'venue.ts'), venue);
        const t = new Transpiler ({ 'verbose': false, 'rust': { 'parser': { 'NUM_LINES_END_FILE': 0 } } } as any);
        output = t.transpileRustByPath (path.join (root, 'ts', 'src', 'venue.ts')).content;
        fs.rmSync (root, { recursive: true, force: true });
    });
    test ('the typed map local row is a native map get (missing / non-map -> None)', () => {
        const a = output.slice (output.indexOf ('fn methodA'), output.indexOf ('fn methodB'));
        expect (a).toContain ('indexmap::IndexMap<String, Value>');
        expect (a).toMatch (/Option<crate::value::Dict> = \(if let Some\(Value::Dict\(__m\)\) = byCode\.get\(code\.as_deref\(\)\.unwrap_or\("null"\)\) \{ Some\(std::sync::Arc::clone\(__m\)\) \} else \{ None \}\);/);
        expect (a).not.toContain ('safe_dict_o');
    });
    test ('negatives: an untyped alias and a non-string key keep the helper', () => {
        const b = output.slice (output.indexOf ('fn methodB'), output.indexOf ('fn methodC'));
        const c = output.slice (output.indexOf ('fn methodC'));
        expect (b).not.toContain ('if let Some(Value::Dict(__m))');
        expect (c).not.toContain ('if let Some(Value::Dict(__m))');
    });
});
