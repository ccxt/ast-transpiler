import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler } from '../src/transpiler';

// base `shortenSlug (slug: Str): string` returns a String in rust; callers bind it without a Value box
describe('rust base shortenSlug prints -> String', () => {
    const base = "export type Str = string | undefined;\n"
        + "export default class Exchange {\n"
        + "    safeString (o: any, k: any, d: any = undefined): Str { return o[k] ?? d; }\n"
        + "    shortenSlug (slug: Str): string {\n        const lower = (slug === undefined) ? '' : slug.toLowerCase ();\n        return lower.toUpperCase ();\n    }\n"
        + "    otherSlug (slug: Str): any {\n        return slug;\n    }\n"
        + "}\n";
    const venue = "import Exchange from './base/Exchange.js';\n"
        + "export default class venue extends Exchange {\n"
        + "    keyOf (raw: any): string {\n        const groupId = this.safeString (raw, 'g');\n        const k = this.shortenSlug (groupId);\n        return k + '_x';\n    }\n"
        + "    otherOf (raw: any): string {\n        const groupId = this.safeString (raw, 'g');\n        const k = this.otherSlug (groupId);\n        return k + '_x';\n    }\n"
        + "    pair (a: any, b: any): any {\n        return a;\n    }\n"
        + "    lent (raw: any): any {\n        const t = this.safeString (raw, 'a');\n        const ev = this.shortenSlug (t);\n        const x = this.pair (ev, 1);\n        const y = this.pair (ev, 2);\n        return [ x, y ];\n    }\n"
        + "}\n";
    const build = (b: string) => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'astfx-h26r02-'));
        fs.mkdirSync(path.join(root, 'ts/src/base'), { recursive: true });
        fs.writeFileSync(path.join(root, 'ts/src/base/Exchange.ts'), b);
        fs.writeFileSync(path.join(root, 'ts/src/venue.ts'), venue);
        const t = new Transpiler({ 'verbose': false, 'rust': { 'parser': { 'NUM_LINES_END_FILE': 0 } } });
        try {
            return { base: t.transpileRustByPath(path.join(root, 'ts/src/base/Exchange.ts')).content, venue: t.transpileRustByPath(path.join(root, 'ts/src/venue.ts')).content };
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    };
    test('the base method returns String and the caller local is a String', () => {
        const out = build(base);
        expect(out.base).toMatch(/fn shortenSlug\(&self, [^)]*\) -> String \{/);
        expect(out.venue).toMatch(/let mut k: String = self\.shortenSlug\(/);
    });
    test('a String copied at a by-value slot before its last use is lent, not cloned', () => {
        const out = build(base);
        expect(out.venue).toContain('self.pair(Value::from(ev.as_str()), Value::Int(1))');
        expect(out.venue).not.toContain('ev.clone()');
    });
    test('negative: a method of another name declared any keeps the Value box', () => {
        const out = build(base);
        expect(out.base).toMatch(/fn otherSlug\(&self, [^)]*\) -> Value \{/);
        expect(out.venue).not.toMatch(/let mut k: String = self\.otherSlug\(/);
    });
    test('negative: shortenSlug declared Str (nullable) is not taken by the table', () => {
        const out = build(base.replace('shortenSlug (slug: Str): string', 'shortenSlug (slug: Str): Str'));
        expect(out.base).not.toMatch(/fn shortenSlug\(&self, [^)]*\) -> String \{/);
    });
});
