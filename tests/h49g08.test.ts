import { Transpiler } from '../src/transpiler';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// a local the build layer declares String goes into a String slot bare (Java);
// ethGetAddressFromPrivateKey answers a String (Rust)
const base = 'export interface Dict { [key: string]: any }\nexport type Str = string | undefined;\n' +
    'export default class Exchange {\n    privateKey: string = \'\';\n' +
    '    safeString (o: any, k: any, d: Str = undefined): Str { return o; }\n' +
    '    hold (x: any): any { return x; }\n' +
    '    ethGetAddressFromPrivateKey (privateKey: string): string {\n        return privateKey;\n    }\n}\n';
const venue = "import Exchange from './base/Exchange.js';\n" +
    'export default class venue extends Exchange {\n' +
    '    check (address: string): string {\n        return address + \'x\';\n    }\n' +
    '    eoa () {\n        return this.check (this.ethGetAddressFromPrivateKey (this.privateKey));\n    }\n' +
    '    declared (params: any) {\n        const a: string = this.safeString (params, \'a\', \'\');\n        return this.check (a);\n    }\n' +
    '    undeclared (params: any) {\n        const b: any = this.hold (params);\n        return this.check (b);\n    }\n' +
    '    boxed () {\n        return this.hold (this.ethGetAddressFromPrivateKey (this.privateKey));\n    }\n}\n';

describe ('h49g08: String locals into String slots, a String eth address in Rust', () => {
    let root = '';
    let java = '';
    let rust = '';
    beforeAll (() => {
        root = fs.mkdtempSync (path.join (os.tmpdir (), 'h49g08-'));
        fs.mkdirSync (path.join (root, 'ts', 'src', 'base'), { recursive: true });
        fs.writeFileSync (path.join (root, 'ts', 'src', 'base', 'Exchange.ts'), base);
        fs.writeFileSync (path.join (root, 'ts', 'src', 'venue.ts'), venue);
        const file = path.join (root, 'ts', 'src', 'venue.ts');
        const jt = new Transpiler ({ 'verbose': false, 'java': { 'parser': { 'NUM_LINES_END_FILE': 0 } } } as any);
        // the build layer declares `a` String (as ccxt does for a `: string` local)
        (jt as any).javaTranspiler.javaDeclaredLocalTypeResolver = (d: any) => (d?.name?.text === 'a' ? 'String' : undefined);
        java = jt.transpileJavaByPath (file).content;
        const rt = new Transpiler ({ 'verbose': false, 'rust': { 'parser': { 'NUM_LINES_END_FILE': 0 } } } as any);
        rust = rt.transpileRustByPath (file).content;
    });
    afterAll (() => fs.rmSync (root, { recursive: true, force: true }));

    test ('java: a String-declared local passes a String slot with no checkcast', () => {
        expect (java).toContain ('this.check(a)');
        expect (java).not.toContain ('(String) (a)');
    });

    test ('java: an undeclared local keeps its checkcast', () => {
        expect (java).toMatch (/this\.check\(\(String\) \(b\)\)/);
    });

    test ('rust: the eth address answers a String, boxed once where a Value is taken', () => {
        expect (rust).toMatch (/self\.hold\(Value::from\(self\.ethGetAddressFromPrivateKey\(/);
        expect (rust).not.toMatch (/ethGetAddressFromPrivateKey\([^\n]*\)\.as_str\(\)/);
    });
});
