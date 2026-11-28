import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler } from '../src/transpiler';

describe ('rust: Object.keys of a Dict-declared extend copy reads the typed map in REST files', () => {
    const BASE = 'export interface Dict { [key: string]: any }\nexport type Str = string | undefined;\n'
        + 'export default class Exchange {\n    extend (...args: any[]): any { return {}; }\n    safeString (o: any, k: any, d: any = undefined): Str { return o; }\n}\n';
    const BODY = 'import Exchange from \'./base/Exchange.js\';\nimport type { Dict } from \'./base/Exchange.js\';\nexport default class venue extends Exchange {\n'
        + '    a (x: any) {\n        const v: Dict = this.extend ({}, x);\n        const keys = Object.keys (v);\n        return keys.length;\n    }\n'
        + '    b (x: any) {\n        const w: Dict = this.extend ({}, x);\n        return Object.values (w);\n    }\n'
        + '    c (x: any) {\n        const u = this.extend ({}, x);\n        return Object.keys (u);\n    }\n'
        + '    d (x: any) {\n        const t: Dict = this.extend ({}, x);\n        if (t !== undefined) { return Object.keys (t); }\n        return [];\n    }\n'
        + '    e (x: any, f: boolean) {\n        let s: Dict;\n        if (f) { s = this.extend ({}, x); } else { s = x; }\n        return Object.keys (s);\n    }\n}\n';
    const dir = fs.mkdtempSync (path.join (os.tmpdir (), 'h34p21-'));
    const config: any = { 'verbose': false, 'rust': { 'parser': { 'NUM_LINES_END_FILE': 0 } } };
    let rest = '';
    let pro = '';
    beforeAll (() => {
        fs.mkdirSync (path.join (dir, 'ts/src/base'), { 'recursive': true });
        fs.mkdirSync (path.join (dir, 'ts/src/pro'), { 'recursive': true });
        fs.writeFileSync (path.join (dir, 'ts/src/base/Exchange.ts'), BASE);
        fs.writeFileSync (path.join (dir, 'ts/src/venue.ts'), BODY);
        fs.writeFileSync (path.join (dir, 'ts/src/pro/venue.ts'), BODY.replace (/'\.\/base\//g, '\'../base/'));
        rest = new Transpiler (config).transpileRustByPath (path.join (dir, 'ts/src/venue.ts')).content;
        pro = new Transpiler (config).transpileRustByPath (path.join (dir, 'ts/src/pro/venue.ts')).content;
    });
    afterAll (() => fs.rmSync (dir, { 'recursive': true, 'force': true }));
    test ('the copy is typed and its keys / values are the map iterators', () => {
        expect (rest).toMatch (/let mut v: crate::value::Dict = self\.extend\(/);
        expect (rest).toContain ('Value::Array(v.keys().cloned().map(Value::from).collect())');
        expect (rest).toMatch (/let mut w: crate::value::Dict = self\.extend\(/);
        expect (rest).toContain ('Value::Array(w.values().cloned().collect())');
    });
    test ('negative: an undeclared copy keeps its Value box', () => {
        expect (rest).toMatch (/let mut u: Value = self\.extend\(/);
    });
    test ('negative: a copy tested against undefined keeps its Value box', () => {
        expect (rest).toMatch (/let mut t: Value = self\.extend\(/);
    });
    test ('negative: a Dict local with no initialiser prints and keeps the helper', () => {
        expect (rest).toContain ('fn e(');
        expect (rest).not.toContain ('Value::Array(s.keys()');
    });
    test ('negative: a ws file keeps the tag-filtering helper', () => {
        expect (pro).toMatch (/let mut v: Value = self\.extend\(/);
    });
});
