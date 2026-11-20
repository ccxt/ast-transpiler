import fs from 'fs';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

describe ('go Add-chain assignment with one *string call leaf binds it first and keeps the nil answer', () => {
    const root = path.join (__dirname, 'files', 'tmp-h20g10', 'ts', 'src');
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
        "        let messageHash = 'orders';\n" +
        '        if (flag) {\n' +
        "            messageHash = 'orders::' + this.safeString (o, 's') + ':x';\n" +
        '        }\n' +
        '        client.resolve (1, messageHash);\n' +
        '    }\n' +
        '    twoCalls (client: any, o: any, flag: boolean) {\n' +
        "        let hashC = 'x';\n" +
        '        if (flag) {\n' +
        "            hashC = this.safeString (o, 'a') + this.safeString (o, 'b');\n" +
        '        }\n' +
        '        client.resolve (1, hashC);\n' +
        '    }\n' +
        '    anyLeaf (client: any, o: any, flag: boolean) {\n' +
        "        let hashD = 'x';\n" +
        '        if (flag) {\n' +
        "            hashD = o + this.safeString (o, 'a');\n" +
        '        }\n' +
        '        client.resolve (1, hashD);\n' +
        '    }\n' +
        '    nilTested (o: any, flag: boolean) {\n' +
        "        let hashE = 'x';\n" +
        '        if (flag) {\n' +
        "            hashE = 'trades::' + this.safeString (o, 'a');\n" +
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
    afterAll (() => fs.rmSync (path.join (__dirname, 'files', 'tmp-h20g10'), { recursive: true, force: true }));

    test ('positive: call bound in source order, one nil test, else arm stores nil', () => {
        expect (out).toMatch (/if messageHashPiece := this\.SafeString\(o, "s"\); messageHashPiece != nil \{\n\s*messageHash = "orders::" \+ \*messageHashPiece \+ ":x"\n\s*\} else \{\n\s*messageHash = nil\n\s*\}/);
    });

    test ('negative: two call leaves keep Add', () => {
        expect (out).toMatch (/hashC = Add\(/);
    });

    test ('negative: an any leaf keeps Add', () => {
        expect (out).toMatch (/hashD = Add\(o, /);
    });

    test ('negative: a nil-tested target keeps Add', () => {
        expect (out).toMatch (/hashE = Add\(/);
    });
});
