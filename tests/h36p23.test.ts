import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler } from '../src/transpiler';

describe ('rust: a string local seeded "" and set from a string-returning method lends itself as a map key', () => {
    const BASE = 'export interface Dict { [key: string]: any }\nexport type Str = string | undefined;\n'
        + 'export default class Exchange {\n    safeString (d: any, k: any, def: Str = undefined): Str { return d[k] ?? def; }\n'
        + '    shortenSlug (slug: Str): string { return slug; }\n    hold (x: any): any { return x; }\n}\n';
    const dir = fs.mkdtempSync (path.join (os.tmpdir (), 'h36p23-'));
    const config: any = { 'verbose': false, 'rust': { 'parser': { 'NUM_LINES_END_FILE': 0 } } };
    let out = '';
    beforeAll (() => {
        fs.mkdirSync (path.join (dir, 'ts/src/base'), { 'recursive': true });
        fs.writeFileSync (path.join (dir, 'ts/src/base/Exchange.ts'), BASE);
        fs.writeFileSync (path.join (dir, 'ts/src/venue.ts'), 'import Exchange from \'./base/Exchange.js\';\nimport type { Dict } from \'./base/Exchange.js\';\nexport default class venue extends Exchange {\n'
            + '    group (rows: any[]) {\n        const groups: Dict = {};\n        for (let i = 0; i < rows.length; i++) {\n            const raw = rows[i];\n'
            + '            const groupId = this.safeString (raw, \'slug\');\n            const key = this.shortenSlug (groupId);\n'
            + '            if (key !== \'\') {\n                if (key in groups) {\n                    const g = groups[key];\n                    this.hold (g);\n                } else {\n                    groups[key] = { \'id\': groupId, \'markets\': [] };\n                }\n            }\n        }\n        const out: Dict = {};\n        const keys = Object.keys (groups);\n        for (let i = 0; i < keys.length; i++) {\n            const key = keys[i];\n            out[key] = groups[key];\n        }\n        return out;\n    }\n'
            + '    copyKey (rows: any[]) {\n        const groups: Dict = {};\n        for (let i = 0; i < rows.length; i++) {\n            const k = this.shortenSlug (this.safeString (rows[i], \'slug\'));\n            if (!(k in groups)) {\n                groups[k] = [];\n            }\n            this.hold (groups[k]);\n        }\n        return groups;\n    }\n'
            + '    nilKey (d: Dict, slug: any) {\n        let k: Str = undefined;\n        if (slug !== undefined) {\n            k = this.safeString (d, slug);\n        }\n        return d[k];\n    }\n'
            + '    anyKey (d: Dict, x: any) {\n        const k = this.hold (x);\n        return d[k];\n    }\n'
            + '}\n');
        out = new Transpiler (config).transpileRustByPath (path.join (dir, 'ts/src/venue.ts')).content;
    });
    afterAll (() => fs.rmSync (dir, { 'recursive': true, 'force': true }));
    const body = (name: string) => out.split ('fn ').find ((part) => part.startsWith (`${name}(`)) ?? '';
    test ('positive: the key local is a String, not a Value', () => {
        expect (body ('group')).toContain ('key: String = self.shortenSlug(');
        expect (body ('group')).not.toContain ('key: Value');
    });
    test ('positive: reads and the in test borrow the String key (no Value box, no stringify)', () => {
        expect (body ('group')).toContain ('groups.contains_key(key.as_str())');
        expect (body ('group')).toContain ('groups.insert(key');
        expect (body ('group')).toContain ('groups.get(key.as_str()).cloned().unwrap_or(Value::Null)');
        expect (body ('group')).not.toContain ('stringify_param(&key)');
    });
    test ('negative: an insert key before a later read would clone, so the key stays a Value', () => {
        expect (body ('copyKey')).not.toContain ('k: String');
        expect (body ('copyKey')).not.toContain ('k.clone()');
    });
    test ('negative nil: a nil-declared Str key keeps its Option form (a None key misses)', () => {
        expect (body ('nilKey')).not.toContain ('let mut k: String');
    });
    test ('negative wrong kind: an any-valued key is not typed a String', () => {
        expect (body ('anyKey')).not.toContain ('k: String');
    });
});
