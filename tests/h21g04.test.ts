import fs from 'fs';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

describe ('go Add-chain assignment with *string call leaves plus nilable pointers binds the calls, one combined nil test', () => {
    const root = path.join (__dirname, 'files', 'tmp-h21g04', 'ts', 'src');
    const BASE =
        'export type Str = string | undefined;\n' +
        'export class Exchange {\n' +
        "    id: string = 'x';\n" +
        '    safeString (o: any, k: string): Str {\n' +
        '        return o[k];\n' +
        '    }\n' +
        '}\n';
    const VENUE =
        "import { Exchange } from './base/Exchange.js';\n" +
        "import type { Str } from './base/Exchange.js';\n" +
        'export default class v extends Exchange {\n' +
        '    positive (client: any, o: any, flag: boolean) {\n' +
        "        const settle = this.safeString (o, 'settle');\n" +
        "        let symbol = 'x';\n" +
        '        if (flag) {\n' +
        "            symbol = 'a:' + settle + '-' + this.safeString (o, 'expiry');\n" +
        '        }\n' +
        '        client.resolve (1, symbol);\n' +
        '    }\n' +
        '    twoCalls (client: any, o: any, flag: boolean) {\n' +
        "        let hashC = 'x';\n" +
        '        if (flag) {\n' +
        "            hashC = this.safeString (o, 'a') + '/' + this.safeString (o, 'b');\n" +
        '        }\n' +
        '        client.resolve (1, hashC);\n' +
        '    }\n' +
        '    anyLeaf (client: any, o: any, flag: boolean) {\n' +
        "        const p = this.safeString (o, 'p');\n" +
        "        let hashD = 'x';\n" +
        '        if (flag) {\n' +
        "            hashD = o + p + this.safeString (o, 'a');\n" +
        '        }\n' +
        '        client.resolve (1, hashD);\n' +
        '    }\n' +
        '    nilTested (o: any, flag: boolean) {\n' +
        "        const p = this.safeString (o, 'p');\n" +
        "        let hashE = 'x';\n" +
        '        if (flag) {\n' +
        "            hashE = p + this.safeString (o, 'a');\n" +
        '        }\n' +
        '        if (hashE === undefined) {\n' +
        '            return 1;\n' +
        '        }\n' +
        '        return 2;\n' +
        '    }\n' +
        '}\n';
    let out = '';
    beforeAll (() => {
        fs.mkdirSync (path.join (root, 'base'), { recursive: true });
        fs.writeFileSync (path.join (root, 'base', 'Exchange.ts'), BASE);
        fs.writeFileSync (path.join (root, 'v.ts'), VENUE);
        const t = new Transpiler ({ verbose: false, go: {} });
        installCcxtGoHooks (t.goTranspiler);
        out = t.transpileGoByPath (path.join (root, 'v.ts')).content;
    });
    afterAll (() => fs.rmSync (path.join (__dirname, 'files', 'tmp-h21g04'), { recursive: true, force: true }));

    test ('positive: call bound, combined nil test with the pointer, else arm stores nil', () => {
        expect (out).toMatch (/if symbolPiece := this\.SafeString\(o, "expiry"\); symbolPiece != nil && settle != nil \{\n\s*symbol = "a:" \+ \*settle \+ "-" \+ \*symbolPiece\n\s*\} else \{\n\s*symbol = nil\n\s*\}/);
    });

    test ('positive: two calls bound in source order', () => {
        expect (out).toMatch (/if hashCPiece, hashCPiece2 := this\.SafeString\(o, "a"\), this\.SafeString\(o, "b"\); hashCPiece != nil && hashCPiece2 != nil \{\n\s*hashC = \*hashCPiece \+ "\/" \+ \*hashCPiece2\n/);
    });

    test ('negative: an any leaf keeps Add', () => {
        expect (out).toMatch (/hashD = Add\(Add\(o, /);
    });

    test ('negative: a nil-tested target keeps Add', () => {
        expect (out).toMatch (/hashE = Add\(/);
    });
});
