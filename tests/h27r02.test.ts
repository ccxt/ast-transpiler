import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler } from '../src/transpiler';

// `n.toString()` of an `i64` local whose checker type is `any` (an all-int `sum`) binds a native String local
describe('rust toString of an i64 local binds a String local', () => {
    const base = "export type Str = string | undefined;\nexport type Int = number | undefined;\n"
        + "export default class Exchange {\n"
        + "    options: any = {};\n"
        + "    seconds (): number { return 1; }\n"
        + "    sum (...args: any[]): any { return args[0] + args[1]; }\n"
        + "    safeInteger (o: any, k: any, d: Int = undefined): Int { return o[k] ?? d; }\n"
        + "    pair (a: any, b: any): any { return a; }\n"
        + "}\n";
    const venue = "import Exchange from './base/Exchange.js';\n"
        + "export default class venue extends Exchange {\n"
        + "    sig (q: string): any {\n        const headers: any = {};\n        const timestamp = this.seconds ();\n        const x = this.safeInteger (this.options, 'x', 60);\n        const expiry = this.sum (timestamp, x);\n        const expiryString = expiry.toString ();\n        headers['e'] = expiryString;\n        const auth = q + expiryString;\n        return [ headers, auth ];\n    }\n"
        + "    raw (o: any): any {\n        const v = this.safeInteger (o, 'v');\n        const vs = v.toString ();\n        return this.pair (vs, 1);\n    }\n"
        + "    mixed (o: any, w: any): any {\n        const headers: any = {};\n        const t = this.seconds ();\n        const e = this.sum (t, w);\n        const es = e.toString ();\n        headers['e'] = es;\n        return headers;\n    }\n"
        + "}\n";
    const build = () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'astfx-h27r02-'));
        fs.mkdirSync(path.join(root, 'ts/src/base'), { recursive: true });
        fs.writeFileSync(path.join(root, 'ts/src/base/Exchange.ts'), base);
        fs.writeFileSync(path.join(root, 'ts/src/venue.ts'), venue);
        const t = new Transpiler({ 'verbose': false, 'rust': { 'parser': { 'NUM_LINES_END_FILE': 0 } } });
        try {
            return t.transpileRustByPath(path.join(root, 'ts/src/venue.ts')).content;
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    };
    test('an all-int sum local formats into a String local, lent at the dict write', () => {
        const out = build();
        expect(out).toContain('let mut expiryString: String = format!("{}", expiry);');
        expect(out).toContain('headers.insert("e".into(), Value::from(expiryString.as_str()));');
        expect(out).not.toContain('expiryString.clone()');
    });
    test('negative: a sum with an untyped operand keeps the Value box', () => {
        const out = build();
        expect(out).toMatch(/let mut e: Value = /);
        expect(out).not.toMatch(/let mut es: String/);
    });
    test('negative: an Option<i64> receiver that can be nil keeps the displayed box of the nil', () => {
        const out = build();
        expect(out).toContain('let mut v: Option<i64> = ');
        expect(out).toContain('format!("{}", Value::from(v))');
    });
});
