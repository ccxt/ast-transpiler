import fs from 'fs';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

describe ('go string accumulator appended a nil-guarded *string stays a Go string', () => {
    const root = path.join (__dirname, 'files', 'tmp-h20g12', 'ts', 'src');
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
        '    guarded (o: any): string {\n' +
        '        const vault = this.pick (o);\n' +
        '        const hex = \'ff\';\n' +
        '        let data = hex;\n' +
        "        data += '00';\n" +
        '        if (vault === undefined) {\n' +
        "            data += '01';\n" +
        '        } else {\n' +
        '            data += vault;\n' +
        '        }\n' +
        '        return data;\n' +
        '    }\n' +
        '    unguarded (o: any) {\n' +
        '        const other = this.pick (o);\n' +
        '        let acc = \'ff\';\n' +
        '        acc += other;\n' +
        '        return acc;\n' +
        '    }\n' +
        '    anyLeaf (o: any, body: any) {\n' +
        '        let auth = \'ff\';\n' +
        '        auth += body;\n' +
        '        return auth;\n' +
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
    afterAll (() => fs.rmSync (path.join (__dirname, 'files', 'tmp-h20g12'), { recursive: true, force: true }));

    test ('positive: guarded pointer append types the local and appends the deref', () => {
        expect (out).toMatch (/var data string = /);
        expect (out).toMatch (/data \+= \*vault/);
        expect (out).not.toMatch (/data = Add\(/);
    });

    test ('negative: an unguarded *string append keeps the box and Add', () => {
        expect (out).toMatch (/var acc any = /);
        expect (out).toMatch (/acc = Add\(acc, other\)/);
    });

    test ('negative: an any leaf keeps the box and Add', () => {
        expect (out).toMatch (/var auth any = /);
        expect (out).toMatch (/auth = Add\(auth, body\)/);
    });
});
