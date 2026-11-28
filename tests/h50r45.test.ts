import { Transpiler } from '../src/transpiler';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';

// a local whose later reads all sit in the other arm of an enclosing `if` moves at its use (no clone)
const base = "export interface Dict { [key: string]: any }\nexport default class Exchange {\n    id: string = '';\n"
    + "    note (x: any, y: any = undefined): any { return x; }\n    keep (x: any): any { return x; }\n}\n";
const venue = (body: string) => "import Exchange from './base/Exchange.js';\nimport type { Dict } from './base/Exchange.js';\n"
    + "export default class venue extends Exchange {\n"
    + `    run (flag: boolean, a: any, b: any): any {\n${body}\n    }\n}\n`;

function build (src: string): string {
    const root = fs.mkdtempSync (path.join (os.tmpdir (), 'astfx-h50r45-'));
    fs.mkdirSync (path.join (root, 'ts/src/base'), { recursive: true });
    fs.writeFileSync (path.join (root, 'ts/src/base/Exchange.ts'), base);
    fs.writeFileSync (path.join (root, 'ts/src/venue.ts'), src);
    const t = new Transpiler ({ 'verbose': false, 'rust': { 'parser': { 'NUM_LINES_END_FILE': 0 } } });
    try {
        return t.transpileRustByPath (path.join (root, 'ts/src/venue.ts')).content;
    } finally {
        fs.rmSync (root, { recursive: true, force: true });
    }
}

describe ('h50r45: a use whose later reads are all in the other if arm', () => {
    test ('each arm hands the local over without a clone', () => {
        const out = build (venue ("        const x = this.keep (a);\n        let r = undefined;\n        if (flag) {\n            r = this.note (x);\n        } else {\n            r = this.note (b, x);\n        }\n        return r;"));
        expect (out).toMatch (/self\.note\(x[,)]/);
        expect (out).toMatch (/self\.note\(b, (?:&\[)?x\b/);
        expect (out).not.toMatch (/\bx\.clone\(\)/);
    });
    test ('negative: a read after the if keeps the clone', () => {
        const out = build (venue ("        const x = this.keep (a);\n        let r = undefined;\n        if (flag) {\n            r = this.note (x);\n        } else {\n            r = this.note (b);\n        }\n        return this.note (r, x);"));
        expect (out).toMatch (/self\.note\(x\.clone\(\)/);
    });
    test ('negative: a read later in the same arm keeps the clone', () => {
        const out = build (venue ("        const x = this.keep (a);\n        let r = undefined;\n        if (flag) {\n            r = this.note (x);\n            r = this.note (r, x);\n        } else {\n            r = this.note (b, x);\n        }\n        return r;"));
        expect (out).toMatch (/self\.note\(x\.clone\(\)/);
    });
    test ('negative: inside a loop below the declaration the clone stays', () => {
        const out = build (venue ("        const x = this.keep (a);\n        let r = undefined;\n        for (let i = 0; i < 2; i++) {\n            if (flag) {\n                r = this.note (x);\n            } else {\n                r = this.note (b, x);\n            }\n        }\n        return r;"));
        expect (out).toMatch (/self\.note\(x\.clone\(\)/);
    });
});
