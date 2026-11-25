import { Transpiler } from '../src/transpiler';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// the case of a hand-written `-> String` runtime call converts the String (no closure over a re-boxed Value)
const base = 'export interface Dict { [key: string]: any }\nexport type Str = string | undefined;\n' +
    'export default class Exchange {\n    privateKey: string = \'\';\n' +
    '    hold (x: any): any { return x; }\n' +
    '    ethGetAddressFromPrivateKey (privateKey: string): string {\n        return privateKey;\n    }\n}\n';
const venue = "import Exchange from './base/Exchange.js';\n" +
    'export default class venue extends Exchange {\n' +
    '    lower () {\n        return this.ethGetAddressFromPrivateKey (this.privateKey).toLowerCase ();\n    }\n' +
    '    upper () {\n        const u = this.ethGetAddressFromPrivateKey (this.privateKey).toUpperCase ();\n        return u;\n    }\n' +
    '    boxed (params: any) {\n        return this.hold (params).toLowerCase ();\n    }\n}\n';

describe ('h51r09: case of a String runtime call (Rust)', () => {
    let root = '';
    let rust = '';
    beforeAll (() => {
        root = fs.mkdtempSync (path.join (os.tmpdir (), 'h51r09-'));
        fs.mkdirSync (path.join (root, 'ts', 'src', 'base'), { recursive: true });
        fs.writeFileSync (path.join (root, 'ts', 'src', 'base', 'Exchange.ts'), base);
        fs.writeFileSync (path.join (root, 'ts', 'src', 'venue.ts'), venue);
        const rt = new Transpiler ({ 'verbose': false, 'rust': { 'parser': { 'NUM_LINES_END_FILE': 0 } } } as any);
        rust = rt.transpileRustByPath (path.join (root, 'ts', 'src', 'venue.ts')).content;
    });
    afterAll (() => fs.rmSync (root, { recursive: true, force: true }));

    test ('the String is converted in place', () => {
        expect (rust).toMatch (/ethGetAddressFromPrivateKey\(self\.privateKey[^\n]*\)\.to_lowercase\(\)/);
        expect (rust).toMatch (/ethGetAddressFromPrivateKey\(self\.privateKey[^\n]*\)\.to_uppercase\(\)/);
        expect (rust).not.toMatch (/ethGetAddressFromPrivateKey\([^\n]*\)\)\.as_str\(\)\.map\(\|__s\|/);
    });

    test ('an unproven Value keeps the Str arm', () => {
        expect (rust).toMatch (/self\.hold\(params[^\n]*as_str\(\)/);
        expect (rust).not.toMatch (/self\.hold\(params[^\n]*\)\.to_lowercase\(\)\)/);
    });
});
