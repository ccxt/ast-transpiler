import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler } from '../src/transpiler';

// a clock string local fed into an extend literal that rewrites another local binds a native String
describe('rust clock string local as an object-literal value of a local write', () => {
    const base = "export type Str = string | undefined;\nexport type Int = number | undefined;\n"
        + "export default class Exchange {\n"
        + "    options: any = {};\n    privateKey: Str = undefined;\n"
        + "    seconds (): number { return 1; }\n"
        + "    milliseconds (): number { return 1; }\n"
        + "    safeInteger (o: any, k: any, d: Int = undefined): Int { return o[k] ?? d; }\n"
        + "    extend (...args: any[]): any { return args[0]; }\n"
        + "    numberToString (x: any): Str { return x; }\n"
        + "}\n";
    const venue = "import Exchange from './base/Exchange.js';\n"
        + "export default class venue extends Exchange {\n"
        + "    signAuth (address: string, timestamp: string, nonce: number): string { return address + timestamp; }\n"
        + "    getTimestamp (): number {\n        return this.milliseconds () - this.safeInteger (this.options, 'timeDifference', 0);\n    }\n"
        + "    sig (path: string, params: any = {}): any {\n        let headersValue: any = {};\n        if (path === 'a') {\n            const address = 'x';\n            const timestamp = this.seconds ().toString ();\n            const nonce = this.safeInteger (params, 'nonce', 0);\n            const l1 = this.signAuth (address, timestamp, nonce);\n            headersValue = this.extend (headersValue, {\n                'A': address,\n                'S': l1,\n                'T': timestamp,\n                'N': this.numberToString (nonce),\n            });\n        } else {\n            const timestamp = this.seconds ().toString ();\n            const auth = timestamp + path;\n            headersValue = this.extend (headersValue, { 'T': timestamp, 'U': auth });\n        }\n        return headersValue;\n    }\n"
        + "    sig2 (path: string): any {\n        const timestamp = this.getTimestamp ().toString ();\n        const payload = timestamp + path;\n        return { 'T': timestamp, 'P': payload };\n    }\n"
        + "    sig3 (path: string, params: any = {}): any {\n        let headersValue: any = {};\n        if (path === 'b') {\n            const ts3 = this.seconds ().toString ();\n            const auth = ts3 + path;\n            headersValue = this.extend (headersValue, { 'T': ts3, 'U': auth });\n        }\n        return headersValue;\n    }\n"
        + "    sig4 (path: string, params: any = {}): any {\n        let headersValue: any = {};\n        if (path === 'b') {\n            const ts4 = this.seconds ().toString ();\n            headersValue = this.extend (headersValue, { 'T': ts4 });\n        }\n        return headersValue;\n    }\n"
        + "    sig5 (o: any): any {\n        let r: any = {};\n        const ts6 = o.toString ();\n        r = this.extend (r, { 'T': ts6 });\n        return r;\n    }\n"
        + "}\n";
    const build = () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'astfx-h29r08-'));
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
    test('a seconds().toString() local in an extend literal is a String, moved into the literal', () => {
        const out = build();
        expect(out).toContain('let mut ts4: String = format!("{}", ');
        expect(out).toContain('m.insert("T".to_string(), Value::from(ts4));');
        expect(out).not.toContain('ts4.clone()');
    });
    test('twin branch locals of the same name each bind a String and lend to the typed argument', () => {
        const out = build();
        expect(out).not.toMatch(/let mut timestamp: Value = Value::Str\(format!\("\{\}", self\.seconds/);
        expect(out).toContain('timestamp.as_str(), (nonce as f64)');
    });
    test('negative: a venue method without an int proof keeps the Value box', () => {
        const out = build();
        expect(out).toContain('let mut timestamp: Value = Value::Str(format!("{}", self.getTimestamp()).into());');
    });
    test('negative: toString of an untyped value in the literal keeps its Value', () => {
        const out = build();
        expect(out).not.toMatch(/let mut ts6: String/);
    });
});
