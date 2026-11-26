import { Transpiler } from '../src/transpiler';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';

jest.mock ('module', () => ({ __esModule: true, default: jest.fn () }));

// the rows slot of base `sortBy2` takes `impl Rows`: a built list moved into it is not re-boxed
const run = (body: string) => {
    const root = fs.mkdtempSync (path.join (os.tmpdir (), 'h54r01-'));
    fs.mkdirSync (path.join (root, 'ts/src/base'), { recursive: true });
    fs.writeFileSync (path.join (root, 'ts/src/base/Exchange.ts'), "export interface Dict { [key: string]: any }\nexport type Int = number | undefined;\nexport type Str = string | undefined;\nconst sortBy2 = (array: any[], key1: any, key2: any, descending = false): any[] => array;\nexport default class Exchange {\n    sortBy2 = sortBy2;\n    // METHODS BELOW THIS LINE ARE TRANSPILED FROM TYPESCRIPT\n    keep (p: any): any { return p; }\n    parseTrade (t: Dict): Dict { return t; }\n}\n");
    fs.writeFileSync (path.join (root, 'ts/src/venue.ts'), "import Exchange from './base/Exchange.js';\nimport type { Dict } from './base/Exchange.js';\nexport default class venue extends Exchange {\n" + body + "}\n");
    const t = new Transpiler ({ 'verbose': false, 'rust': { 'parser': { 'NUM_LINES_END_FILE': 0 } } });
    try { return t.transpileRustByPath (path.join (root, 'ts/src/venue.ts')).content; } finally { fs.rmSync (root, { recursive: true, force: true }); }
};

describe ('rust sortBy2 rows slot', () => {
    test ('a built list written back through sortBy2 is handed over unboxed (fails on the base printer)', () => {
        const out = run ("    parseTradesList (rows: Dict[]): any[] {\n        let result = [];\n        for (let i = 0; i < rows.length; i++) {\n            result.push (this.parseTrade (rows[i]));\n        }\n        result = this.sortBy2 (result, 'timestamp', 'id');\n        return result;\n    }\n");
        expect (out).toMatch (/result = self\.sortBy2\(result, /);
        expect (out).not.toContain ('sortBy2(Value::Arr(result)');
    });
    test ('negative: an untyped value keeps its plain Value argument', () => {
        const out = run ("    sortAny (rows: any): any[] {\n        const x = this.keep (rows);\n        return this.sortBy2 (x, 'timestamp', 'id');\n    }\n");
        expect (out).not.toContain ('Value::Arr(x');
        expect (out).toMatch (/self\.sortBy2\(x(\.clone\(\))?, /);
    });
});
