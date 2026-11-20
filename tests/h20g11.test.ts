import fs from 'fs';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

describe ('go Add-chain assignment with two unguarded *string leaves prints one combined nil test', () => {
    const root = path.join (__dirname, 'files', 'tmp-h20g11', 'ts', 'src');
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
        '    pick (o: any): Str {\n' +
        "        return this.safeString (o, 's');\n" +
        '    }\n' +
        '    positive (client: any, o: any, flag: boolean) {\n' +
        '        const sym = this.pick (o);\n' +
        "        let messageHash = 'orders';\n" +
        '        if (flag) {\n' +
        "            messageHash = 'orders::' + sym;\n" +
        '        }\n' +
        '        client.resolve (1, messageHash);\n' +
        '    }\n' +
        '    twoPointers (client: any, o: any, flag: boolean) {\n' +
        '        const a = this.pick (o);\n' +
        '        const b = this.pick (o);\n' +
        "        let hashC = 'x';\n" +
        '        if (flag) {\n' +
        "            hashC = a + ':' + b;\n" +
        '        }\n' +
        '        client.resolve (1, hashC);\n' +
        '    }\n' +
        '    anyLeaf (client: any, o: any, flag: boolean) {\n' +
        '        const sym = this.pick (o);\n' +
        "        let hashD = 'x';\n" +
        '        if (flag) {\n' +
        '            hashD = o + sym;\n' +
        '        }\n' +
        '        client.resolve (1, hashD);\n' +
        '    }\n' +
        '    nilTested (o: any, flag: boolean) {\n' +
        '        const sym = this.pick (o);\n' +
        "        let hashE = 'x';\n" +
        '        if (flag) {\n' +
        "            hashE = 'trades::' + sym;\n" +
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
    afterAll (() => fs.rmSync (path.join (__dirname, 'files', 'tmp-h20g11'), { recursive: true, force: true }));

    test ('positive: two pointers, one combined nil test, the else arm stores nil', () => {
        expect (out).toMatch (/if a != nil && b != nil \{\n\s*hashC = \*a \+ ":" \+ \*b\n\s*\} else \{\n\s*hashC = nil\n\s*\}/);
        expect (out).not.toMatch (/hashC = Add\(/);
    });

    test ('single pointer stays with the one-pointer rule', () => {
        expect (out).toMatch (/if sym != nil \{\n\s*messageHash = "orders::" \+ \*sym\n/);
    });

    test ('negative: an any leaf keeps Add', () => {
        expect (out).toMatch (/hashD = Add\(o, sym\)/);
    });
});
