import { Transpiler } from '../src/transpiler';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';

// a `&str` parameter read only as `x.slice (<int literal>)` slices the borrow: no `Value` rebinding
const base = "export interface Dict { [key: string]: any }\nexport default class Exchange {\n    id: string = '';\n"
    + "    safeString (o: any, k: any, d: any = undefined): string | undefined { return o[k]; }\n    hashMessage (m: any): string { return m; }\n    note (h: any): any { return h; }\n}\n"
    + "export function ecdsa (a: any, b: any, c: any, d: any): any { return a; }\n";
const venue = (body: string, caller: string) => "import Exchange from './base/Exchange.js';\nimport { ecdsa } from './base/Exchange.js';\nimport type { Dict } from './base/Exchange.js';\n"
    + "export default class venue extends Exchange {\n"
    + `    signHash (hash: string, privateKey: string): Dict {\n        ${body}\n        return {\n            'r': '0x' + this.safeString (signature, 'r', ''),\n        };\n    }\n`
    + `    signMessage (message: any, privateKey: string): Dict {\n        return this.signHash (this.hashMessage (message), ${caller});\n    }\n}\n`;

function build (src: string): string {
    const root = fs.mkdtempSync (path.join (os.tmpdir (), 'astfx-h49r04-'));
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

const slices = "const signature = ecdsa (hash.slice (-64), privateKey.slice (-64), 'x', undefined);";

describe ('h49r04: a string parameter read only through literal tail slices', () => {
    test ('the body slices the borrow and the caller lends its own slice', () => {
        const out = build (venue (slices, 'privateKey.slice (-64)'));
        expect (out).toMatch (/fn signHash\(&self, hash: &str, privateKey: &str\)/);
        expect (out).not.toMatch (/let (mut )?(hash|privateKey): Value = \w+\.into\(\);/);
        expect (out).toContain ('Value::from(&privateKey[privateKey.char_indices().rev().nth(63).unwrap_or_default().0..])');
        expect (out).toContain ('Value::from(&hash[hash.char_indices().rev().nth(63).unwrap_or_default().0..])');
        expect (out).toContain ('&privateKey[privateKey.char_indices().rev().nth(63).unwrap_or_default().0..])');
    });
    test ('a positive start skips from the borrow', () => {
        const out = build (venue ("const signature = ecdsa (hash.slice (2), privateKey.slice (-64), 'x', undefined);", 'privateKey'));
        expect (out).toContain ('Value::from(hash.chars().skip(2).collect::<String>())');
    });
    test ('another read of the parameter keeps its rebinding', () => {
        const out = build (venue ("const signature = ecdsa (hash.slice (-64), privateKey.slice (-64), this.note (privateKey), undefined);", 'privateKey'));
        expect (out).toMatch (/let (mut )?privateKey: Value = privateKey\.into\(\);/);
    });
    test ('a variable bound keeps the rebinding', () => {
        const out = build (venue ("const n = 64;\n        const signature = ecdsa (hash.slice (n), privateKey.slice (-64), 'x', undefined);", 'privateKey'));
        expect (out).toMatch (/let (mut )?hash: Value = hash\.into\(\);/);
    });
    test ('a written parameter keeps the rebinding', () => {
        const out = build (venue ("hash = hash + 'x';\n        const signature = ecdsa (hash.slice (-64), privateKey.slice (-64), 'x', undefined);", 'privateKey'));
        expect (out).toMatch (/let (mut )?hash: Value = hash\.into\(\);/);
    });
});
