import { Transpiler } from '../src/transpiler';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// a venue isFiat declared `boolean` prints `-> bool` and its callers test the bool as is
const base = 'export type Str = string | undefined;\n' +
    'export default class Exchange {\n    hold (x: any): any { return x; }\n}\n';
const venue = (ret: string) => "import Exchange from './base/Exchange.js';\nimport type { Str } from './base/Exchange.js';\n" +
    'export default class venue extends Exchange {\n' +
    "    isFiat (code: Str): " + ret + " {\n        return code === 'NIS';\n    }\n" +
    "    depositIt (code: string) {\n        if (this.isFiat (code)) {\n            return this.hold (1);\n        }\n        return this.hold (2);\n    }\n}\n";

const run = (ret: string): string => {
    const root = fs.mkdtempSync (path.join (os.tmpdir (), 'h47r19-'));
    fs.mkdirSync (path.join (root, 'ts', 'src', 'base'), { recursive: true });
    fs.writeFileSync (path.join (root, 'ts', 'src', 'base', 'Exchange.ts'), base);
    fs.writeFileSync (path.join (root, 'ts', 'src', 'venue.ts'), venue (ret));
    const t = new Transpiler ({ 'verbose': false, 'rust': { 'parser': { 'NUM_LINES_END_FILE': 0 } } } as any);
    try {
        return t.transpileRustByPath (path.join (root, 'ts', 'src', 'venue.ts')).content;
    } finally {
        fs.rmSync (root, { recursive: true, force: true });
    }
};

describe ('rust venue isFiat prints -> bool', () => {
    test ('declared boolean: native bool return, caller reads it with no decode', () => {
        const out = run ('boolean');
        expect (out).toMatch (/pub fn isFiat\(&self, [^)]*\) -> bool \{/);
        expect (out).not.toContain ('self.isFiat(code.as_str()).as_bool()');
        expect (out).not.toMatch (/isFiat\([^)]*\)\)?\.as_bool\(\)/);
    });
    test ('negative: declared any stays a boxed Value return', () => {
        const out = run ('any');
        expect (out).toMatch (/pub fn isFiat\(&self, [^)]*\) -> Value \{/);
    });
});
