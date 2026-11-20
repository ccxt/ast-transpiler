import fs from 'fs';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

describe ('go Add-chain assignment with one unguarded *string leaf keeps the nil answer natively', () => {
    const root = path.join (__dirname, 'files', 'tmp-h19g11', 'ts', 'src');
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
    afterAll (() => fs.rmSync (path.join (__dirname, 'files', 'tmp-h19g11'), { recursive: true, force: true }));

    test ('positive: one nil test, the else arm stores nil', () => {
        expect (out).toMatch (/if sym != nil \{\n\s*messageHash = "orders::" \+ \*sym\n\s*\} else \{\n\s*messageHash = nil\n\s*\}/);
        expect (out).not.toContain ('Add("orders::", sym)');
    });

    test ('negative: two nilable leaves keep Add', () => {
        expect (out).toMatch (/hashC = Add\(/);
    });

    test ('negative: an any leaf keeps Add', () => {
        expect (out).toMatch (/hashD = Add\(o, sym\)/);
    });

    test ('nil consumer: the nil arm keeps an untyped nil the later test sees', () => {
        expect (out).toMatch (/\} else \{\n\s*hashE = nil\n/);
        expect (out).toMatch (/IsEqual\(hashE, nil\)|hashE == nil/);
    });
});
