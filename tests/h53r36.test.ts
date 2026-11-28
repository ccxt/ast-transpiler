import { Transpiler } from '../src/transpiler';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// a pro `const row = this.safeDict (xs, i[, {}])` on a typed list local with an i64 counter reads the element's map
const base = 'export interface Dict { [key: string]: any }\nexport type Str = string | undefined;\nexport type List = any[];\n' +
    'export default class Exchange {\n    options: Dict = {};\n    safeString (o: any, k: any, d: Str = undefined): Str { return o; }\n' +
    '    safeDict (o: any, k: any, d: Dict = undefined): Dict { return o; }\n' +
    '    safeList (o: any, k: any, d: List = undefined): List { return o; }\n' +
    '    hold (x: any): any { return x; }\n}\n';
const venue = "import Exchange from '../base/Exchange.js';\nimport type { Dict, List } from '../base/Exchange.js';\n" +
    'export default class venue extends Exchange {\n' +
    "    handleRows (client: any, message: Dict) {\n        const data = this.safeList (message, 'data', []);\n        const out = [];\n        for (let i = 0; i < data.length; i++) {\n            const row = this.safeDict (data, i, {});\n            out.push (this.safeString (row, 'id'));\n        }\n        this.hold (data);\n        return out;\n    }\n" +
    "    handleBare (client: any, message: Dict) {\n        const data = this.safeList (message, 'data', []);\n        const out = [];\n        for (let i = 0; i < data.length; i++) {\n            const entry = this.safeDict (data, i);\n            out.push (this.safeString (entry, 'id'));\n        }\n        this.hold (data);\n        return out;\n    }\n" +
    "    handleBoxed (client: any, message: any) {\n        const out = [];\n        for (let i = 0; i < message.length; i++) {\n            const boxed = this.safeDict (message, i, {});\n            out.push (this.safeString (boxed, 'id'));\n        }\n        return out;\n    }\n" +
    "    handleOther (client: any, message: Dict) {\n        const data = this.safeList (message, 'data', []);\n        const other = this.safeDict (data, 0, { 'a': 1 });\n        return this.safeString (other, 'id');\n    }\n}\n";

jest.mock ('module', () => ({ __esModule: true, default: jest.fn () }));

describe ('rust pro row of a typed list local', () => {
    let output = '';
    let root = '';
    beforeAll (() => {
        root = fs.mkdtempSync (path.join (os.tmpdir (), 'h53r36-'));
        fs.mkdirSync (path.join (root, 'ts', 'src', 'base'), { recursive: true });
        fs.mkdirSync (path.join (root, 'ts', 'src', 'pro'), { recursive: true });
        fs.writeFileSync (path.join (root, 'ts', 'src', 'base', 'Exchange.ts'), base);
        fs.writeFileSync (path.join (root, 'ts', 'src', 'pro', 'venue.ts'), venue);
        const t = new Transpiler ({ 'verbose': false, 'rust': { 'parser': { 'NUM_LINES_END_FILE': 0 } } } as any);
        output = t.transpileRustByPath (path.join (root, 'ts', 'src', 'pro', 'venue.ts')).content;
    });
    afterAll (() => fs.rmSync (root, { recursive: true, force: true }));

    test ('positive: a row with an empty-map default reads the element map off the list', () => {
        expect (output).toContain ('let mut row: crate::value::Dict = (if let Some(Value::Dict(__m)) = data.get(i as usize) { std::sync::Arc::clone(__m) } else { Default::default() })');
    });
    test ('positive: a row with no default reads the same map (the empty map for a non-map element)', () => {
        expect (output).toContain ('let mut entry: crate::value::Dict = (if let Some(Value::Dict(__m)) = data.get(i as usize) { std::sync::Arc::clone(__m) } else { Default::default() })');
    });
    test ('negative: a boxed receiver keeps the reader', () => {
        expect (output).not.toMatch (/let (mut )?boxed: crate::value::Dict = \(if let Some/);
    });
    test ('negative: a non-empty default keeps the reader', () => {
        expect (output).not.toMatch (/let (mut )?other: crate::value::Dict = \(if let Some/);
    });
});
