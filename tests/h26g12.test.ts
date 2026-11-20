import fs from 'fs';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

describe ('go call argument concat with one unguarded *string leaf', () => {
    const root = path.join (__dirname, 'files', 'tmp-h26g12', 'ts', 'src');
    const BASE =
        'export type Str = string | undefined;\n' +
        'export class Exchange {\n' +
        "    id: string = 'x';\n" +
        '    safeString (o: any, k: string, d: Str = undefined): Str {\n' +
        '        return o[k] ?? d;\n' +
        '    }\n' +
        '    resolve (x: any, h: Str): void {\n' +
        '    }\n' +
        '}\n';
    const VENUE =
        "import { Exchange } from './base/Exchange.js';\n" +
        'export default class v extends Exchange {\n' +
        '    one (m: any) {\n' +
        "        const symbol = this.safeString (m, 'symbol');\n" +
        "        this.resolve (m, 'bidask:' + symbol);\n" +
        '    }\n' +
        '    two (m: any) {\n' +
        "        const a = this.safeString (m, 'a');\n" +
        "        const b = this.safeString (m, 'b');\n" +
        "        this.resolve (m, a + ':' + b);\n" +
        '    }\n' +
        '    guarded (m: any) {\n' +
        "        const g = this.safeString (m, 'g');\n" +
        '        if (g !== undefined) {\n' +
        "            this.resolve (m, 'g:' + g);\n" +
        '        }\n' +
        '    }\n' +
        '    anyLeaf (m: any, raw: any) {\n' +
        "        this.resolve (m, 'k:' + raw);\n" +
        '    }\n' +
        '}\n';
    let out = '';
    const body = (name) => {
        const start = out.indexOf (') ' + name.charAt (0).toUpperCase () + name.slice (1) + '(');
        const end = out.indexOf ('\nfunc ', start + 1);
        return out.substring (start, (end < 0) ? out.length : end);
    };
    beforeAll (() => {
        fs.mkdirSync (path.join (root, 'base'), { recursive: true });
        fs.writeFileSync (path.join (root, 'base', 'Exchange.ts'), BASE);
        fs.writeFileSync (path.join (root, 'v.ts'), VENUE);
        const t = new Transpiler ({ verbose: false, go: {} });
        installCcxtGoHooks (t.goTranspiler);
        out = t.transpileGoByPath (path.join (root, 'v.ts')).content;
    });
    afterAll (() => fs.rmSync (path.join (__dirname, 'files', 'tmp-h26g12'), { recursive: true, force: true }));

    test ('positive: one pointer leaf prints a nil test, a native concat and the nil argument', () => {
        const b = body ('one');
        expect (b).toMatch (/if symbol != nil \{\n\s*this\.Resolve\(m, "bidask:" \+ \*symbol\)\n\s*\} else \{\n\s*this\.Resolve\(m, nil\)\n\s*\}/);
        expect (b).not.toMatch (/Add\(/);
    });
    test ('negative: two distinct pointer leaves keep the helper', () => {
        expect (body ('two')).toMatch (/Add\(/);
    });
    test ('negative: a nil-guarded pointer prints no second nil test', () => {
        expect (body ('guarded')).not.toMatch (/\} else \{/);
    });
    test ('negative: an any leaf keeps the helper', () => {
        expect (body ('anyLeaf')).toMatch (/Add\(/);
    });
});
