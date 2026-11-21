import fs from 'fs';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

describe ('go string slice by a loop counter bounded by the string length', () => {
    const root = path.join (__dirname, 'files', 'tmp-h17g17', 'ts', 'src');
    const BASE =
        'export type Str = string | undefined;\n' +
        'export class Exchange {\n' +
        "    id: string = 'x';\n" +
        "    strip (s: Str): string {\n        return s;\n    }\n" +
        '}\n';
    const VENUE = (body: string) =>
        "import Exchange from './base/Exchange.js';\n" +
        "import type { Str } from './base/Exchange.js';\n" +
        'export default class venue extends Exchange {\n' +
        '    m (v: Str, n = 3): string {\n' + body + '\n    }\n' +
        '}\n';
    const print = (body: string): string => {
        fs.mkdirSync (path.join (root, 'base'), { recursive: true });
        fs.writeFileSync (path.join (root, 'base', 'Exchange.ts'), BASE + 'export default Exchange;\n');
        fs.writeFileSync (path.join (root, 'venue.ts'), VENUE (body));
        const t = new Transpiler ({ verbose: false, go: {} });
        installCcxtGoHooks (t.goTranspiler);
        return t.transpileGoByPath (path.join (root, 'venue.ts')).content;
    };
    afterAll (() => fs.rmSync (path.join (__dirname, 'files', 'tmp-h17g17'), { recursive: true, force: true }));

    const LOOP = (extra = '') =>
        '        const h = this.strip (v);\n' +
        '        const total = h.length;\n' +
        '        for (let i = 0; i < total; i++) {\n' + extra +
        "            if (h.slice (i, i + 1) === '0') {\n                continue;\n            }\n" +
        '            return h.slice (i);\n' +
        '        }\n' +
        "        return '';";

    test ('positive: length-bounded counter slices natively', () => {
        const out = print (LOOP ());
        expect (out).toContain ('h[i:i+1] == "0"');
        expect (out).toContain ('return h[i:]');
        expect (out).not.toContain ('Slice(h');
    });

    test ('positive: direct `.length` bound', () => {
        const out = print ("        const h = this.strip (v);\n        for (let i = 0; i < h.length; i++) {\n            return h.slice (i);\n        }\n        return '';");
        expect (out).toContain ('return h[i:]');
    });

    test ('negative: counter written in the body keeps the helper', () => {
        const out = print (LOOP ('            i = i + 2;\n'));
        expect (out).toContain ('Slice(h, i');
    });

    test ('negative: receiver that can be nil (Str) keeps the helper', () => {
        const out = print ("        for (let i = 0; i < v.length; i++) {\n            return v.slice (i);\n        }\n        return '';");
        expect (out).not.toMatch (/return \*?v\[i:\]/);
    });

    test ('negative: end bound past i + 1 keeps the helper', () => {
        const out = print ("        const h = this.strip (v);\n        for (let i = 0; i < h.length; i++) {\n            return h.slice (i, i + n);\n        }\n        return '';");
        expect (out).toContain ('Slice(h, i');
    });

    test ('negative: receiver reassigned in the loop keeps the helper', () => {
        const out = print ("        let h = this.strip (v);\n        for (let i = 0; i < h.length; i++) {\n            h = h + 'x';\n            return h.slice (i);\n        }\n        return '';");
        expect (out).toContain ('Slice(h, i');
    });
});
