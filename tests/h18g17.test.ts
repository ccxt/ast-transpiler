import fs from 'fs';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

describe ('go Add-chain declaration with one unguarded *string leaf keeps the nil answer natively', () => {
    const root = path.join (__dirname, 'files', 'tmp-h18g17', 'ts', 'src');
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
        '    positive (client: any, o: any) {\n' +
        '        const sym = this.pick (o);\n' +
        "        const messageHash = 'orderbook::' + sym;\n" +
        '        client.resolve (1, messageHash);\n' +
        '    }\n' +
        '    rewritten (client: any, o: any) {\n' +
        '        const sym = this.pick (o);\n' +
        "        let hashA = 'ticker::' + sym;\n" +
        '        hashA = 5;\n' +
        '        client.resolve (1, hashA);\n' +
        '    }\n' +
        '    nilTested (o: any) {\n' +
        '        const sym = this.pick (o);\n' +
        "        const hashB = 'trades::' + sym;\n" +
        '        return hashB;\n' +
        '    }\n' +
        '    twoPointers (client: any, o: any) {\n' +
        '        const a = this.pick (o);\n' +
        '        const b = this.pick (o);\n' +
        "        const hashC = a + ':' + b;\n" +
        '        client.resolve (1, hashC);\n' +
        '    }\n' +
        '}\n';
    const print = (): string => {
        fs.mkdirSync (path.join (root, 'base'), { recursive: true });
        fs.writeFileSync (path.join (root, 'base', 'Exchange.ts'), BASE);
        fs.writeFileSync (path.join (root, 'v.ts'), VENUE);
        const t = new Transpiler ({ verbose: false, go: {} });
        installCcxtGoHooks (t.goTranspiler);
        return t.transpileGoByPath (path.join (root, 'v.ts')).content;
    };
    afterAll (() => fs.rmSync (path.join (__dirname, 'files', 'tmp-h18g17'), { recursive: true, force: true }));

    test ('positive: nil seed plus one nil test on the typed pointer', () => {
        const out = print ();
        expect (out).toContain ('var messageHash *string = nil\n');
        expect (out).toMatch (/if sym != nil \{\n\s*messageHashValue := "orderbook::" \+ \*sym\n\s*messageHash = &messageHashValue\n\s*\}/);
        expect (out).not.toContain ('Add("orderbook::", sym)');
    });

    test ('negative: a later non-string write keeps the helper', () => {
        const out = print ();
        expect (out).toMatch (/var hashA any = nil\n\s*if sym != nil \{\n\s*hashA = "ticker::" \+ \*sym\n\s*\}\n\s*hashA = 5/);
        expect (out).not.toContain ('hashAValue');
    });

    test ('negative: a returned (nil-observable) value keeps the helper', () => {
        const out = print ();
        expect (out).toMatch (/var hashB any = nil\n\s*if sym != nil \{\n\s*hashB = "trades::" \+ \*sym\n\s*\}\n\s*return hashB/);
        expect (out).not.toContain ('hashBValue');
    });

    test ('negative: two nilable leaves keep the helper', () => {
        expect (print ()).toMatch (/if a != nil && b != nil \{\n\s*hashCValue := \*a \+ ":" \+ \*b/);
    });
});
