import { Transpiler } from '../src/transpiler';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// `Object.keys (p)` on a `Dict` parameter whose other use is `this.safeDict (p, k, d)` with `k` one of those keys
const base = 'export interface Dict { [key: string]: any }\nexport type Str = string | undefined;\n' +
    'export default class Exchange {\n' +
    '    safeValue (o: any, k: any, d: any = undefined): any { return o; }\n' +
    '    safeDict (o: any, k: any, d: Dict = undefined): Dict | undefined {\n        const v = this.safeValue (o, k, d);\n        return v;\n    }\n' +
    '    keep (o: Dict): Dict { return o; }\n' +
    '    ownKeys (greeks: Dict): Dict[] {\n        const results: Dict[] = [];\n        const ids = Object.keys (greeks);\n' +
    '        for (let i = 0; i < ids.length; i++) {\n            const id = ids[i];\n            results.push (this.safeDict (greeks, id, {}));\n        }\n        return results;\n    }\n' +
    '    otherKey (greeks: Dict, other: string): Dict[] {\n        const results: Dict[] = [];\n        const ids = Object.keys (greeks);\n' +
    '        for (let i = 0; i < ids.length; i++) {\n            results.push (this.safeDict (greeks, other, {}));\n        }\n        return results;\n    }\n' +
    '    written (greeks: Dict): Dict[] {\n        const results: Dict[] = [];\n        const ids = Object.keys (greeks);\n' +
    '        for (let i = 0; i < ids.length; i++) {\n            const id = ids[i];\n            greeks[id] = 1;\n            results.push (this.safeDict (greeks, id, {}));\n        }\n        return results;\n    }\n' +
    '}\n';

describe ('rust Object.keys on a Dict parameter read by safeDict at its own keys', () => {
    let output = '';
    let root = '';
    beforeAll (() => {
        root = fs.mkdtempSync (path.join (os.tmpdir (), 'h51r31-'));
        fs.mkdirSync (path.join (root, 'ts', 'src', 'base'), { recursive: true });
        fs.writeFileSync (path.join (root, 'ts', 'src', 'base', 'Exchange.ts'), base);
        const t = new Transpiler ({ 'verbose': false, 'rust': { 'parser': { 'NUM_LINES_END_FILE': 0 } } } as any);
        output = t.transpileRustByPath (path.join (root, 'ts', 'src', 'base', 'Exchange.ts')).content;
    });
    afterAll (() => fs.rmSync (root, { recursive: true, force: true }));

    const body = (name: string) => {
        const at = output.indexOf ('fn ' + name);
        const next = output.indexOf ('\n    pub fn ', at + 1);
        return output.slice (at, next < 0 ? undefined : next);
    };

    test ('the shadowed map lists its own keys', () => {
        const fn = body ('ownKeys');
        expect (fn).toMatch (/greeks\.as_map\(\)\.unwrap_or\(&__greeks_empty\)/);
        expect (fn).toMatch (/greeks\.keys\(\)\.cloned\(\)\.map\(Value::from\)\.collect\(\)/);
        expect (fn).not.toMatch (/object_keys\(/);
        expect (fn).toMatch (/safeDict\(&greeks, /);
    });

    test ('a key that is not one of its own keys keeps the helper', () => {
        expect (body ('otherKey')).toMatch (/object_keys\(&greeks\)/);
    });

    test ('a written map keeps the helper', () => {
        expect (body ('written')).toMatch (/object_keys\(&greeks\)/);
    });
});
