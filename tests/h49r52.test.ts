import { Transpiler } from '../src/transpiler';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// `Object.keys (this.safeDict (m, k, {}))` on a map local the printer holds natively lists the member's own keys
const base = 'export interface Dict { [key: string]: any }\nexport type Str = string | undefined;\n' +
    'export default class Exchange {\n    safeString (o: any, k: any, d: Str = undefined): Str { return o; }\n' +
    '    safeDict (o: any, k: any, d: Dict = undefined): Dict | undefined { return o; }\n' +
    '    hold (x: any): any { return x; }\n    // METHODS BELOW THIS LINE ARE TRANSPILED FROM TYPESCRIPT\n}\n';
const venue = "import Exchange from './base/Exchange.js';\nimport type { Dict, Str } from './base/Exchange.js';\n" +
    'export default class venue extends Exchange {\n' +
    "    keysOfMember (): number {\n        const updates: Dict = {};\n        updates['a'] = { 'x': 1 };\n        const keys = Object.keys (this.safeDict (updates, 'a', {}));\n        return keys.length;\n    }\n" +
    "    keysOfBox (o: any): number {\n        const keys = Object.keys (this.safeDict (o, 'a', {}));\n        return keys.length;\n    }\n" +
    "    keysNoDefault (): number {\n        const updates: Dict = {};\n        updates['a'] = { 'x': 1 };\n        const keys = Object.keys (this.safeDict (updates, 'a'));\n        return keys.length;\n    }\n" +
    '}\n';

describe ('rust Object.keys of a defaulted safeDict member of a native map', () => {
    let output = '';
    let root = '';
    beforeAll (() => {
        root = fs.mkdtempSync (path.join (os.tmpdir (), 'h49r52-'));
        fs.mkdirSync (path.join (root, 'ts', 'src', 'base'), { recursive: true });
        fs.writeFileSync (path.join (root, 'ts', 'src', 'base', 'Exchange.ts'), base);
        fs.writeFileSync (path.join (root, 'ts', 'src', 'venue.ts'), venue);
        const t = new Transpiler ({ 'verbose': false, 'rust': { 'parser': { 'NUM_LINES_END_FILE': 0 } } } as any);
        output = t.transpileRustByPath (path.join (root, 'ts', 'src', 'venue.ts')).content;
    });
    afterAll (() => fs.rmSync (root, { recursive: true, force: true }));

    const body = (name: string) => output.slice (output.indexOf ('fn ' + name), output.indexOf ('\n    }', output.indexOf ('fn ' + name)));

    test ('a native map local lists the member keys without the helper', () => {
        expect (body ('keysOfMember')).toMatch (/match updates\.get\("a"\) \{ Some\(Value::Dict\(__m\)\) => __m\.keys\(\)/);
        expect (body ('keysOfMember')).not.toMatch (/object_keys\(/);
    });

    test ('a boxed receiver does not take the native member form', () => {
        expect (body ('keysOfBox')).not.toMatch (/Some\(Value::Dict\(__m\)\) => __m\.keys\(\)/);
    });

    test ('a read with no default keeps the helper', () => {
        expect (body ('keysNoDefault')).not.toMatch (/match updates\.get\("a"\) \{ Some\(Value::Dict/);
    });
});
