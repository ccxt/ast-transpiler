import { Transpiler } from '../src/transpiler';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';

// a venue-private `privateKey: string` slot whose only caller hands it `privateKey.slice (-64)` of a typed string prints `&str`
const base = "export interface Dict { [key: string]: any }\nexport default class Exchange {\n    id: string = '';\n    privateKey: string = '';\n"
    + "    safeString (o: any, k: any, d: any = undefined): string | undefined { return o[k]; }\n    hashMessage (m: any): string { return m; }\n    note (h: any): any { return h; }\n}\n";
const venue = (sign: string, caller: string) => "import Exchange from './base/Exchange.js';\nimport type { Dict } from './base/Exchange.js';\n"
    + "export default class venue extends Exchange {\n"
    + `    signHash (hash: string, ${sign}): string {\n        const r = hash.slice (-64) + privateKey.slice (-64);\n        return r;\n    }\n`
    + `    signMessage (message: any, privateKey: string): string {\n        return this.signHash (this.hashMessage (message), ${caller});\n    }\n}\n`;

function build (src: string): string {
    const root = fs.mkdtempSync (path.join (os.tmpdir (), 'astfx-h48r16-'));
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

describe ('h48r16: a string slot filled with a literal tail slice of a typed string', () => {
    test ('the slot prints &str and the caller lends the sliced chars', () => {
        const out = build (venue ('privateKey: string', 'privateKey.slice (-64)'));
        expect (out).toMatch (/fn signHash\(&self, hash: &str, privateKey: &str\)/);
        expect (out).toContain ('&privateKey[privateKey.char_indices().rev().nth(63).unwrap_or_default().0..])');
    });
    test ('a slice of an untyped value keeps the box', () => {
        const out = build (venue ('privateKey: string', 'this.note (privateKey).slice (-64)'));
        expect (out).not.toMatch (/fn signHash\(&self, hash: &str, privateKey: &str\)/);
    });
    test ('a slice with a variable bound keeps the box', () => {
        const out = build (venue ('privateKey: string', 'privateKey.slice (message)'));
        expect (out).not.toMatch (/fn signHash\(&self, hash: &str, privateKey: &str\)/);
    });
    test ('an any declaration stays untyped', () => {
        const out = build (venue ('privateKey: any', 'privateKey.slice (-64)'));
        expect (out).not.toMatch (/privateKey: &str\) -> Option<String> \{\n\s*let hash/);
        expect (out).toMatch (/fn signHash\(&self, hash: &str, (mut )?privateKey: Value\)/);
    });
});
