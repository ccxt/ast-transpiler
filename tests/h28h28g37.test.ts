import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

// a local initialised by a venue method whose Go return is a non-nil scalar or a never-nil container
// takes that type; a nilable return, a later boxed write and an absent return keep `any`.
describe ('go local typed from a resolved method return', () => {
    const TYPES = 'export type Dict = { [key: string]: any };\nexport type Str = string | undefined;\n';
    const BASE =
        "import { Dict } from './types.js';\n" +
        'export class Exchange {\n    extend (a: any, b: any = undefined): Dict {\n        return a;\n    }\n' +
        '    safeString (o: any, k: any, d: any = undefined): string {\n        return o;\n    }\n}\n';
    const VENUE =
        "import { Exchange } from './base/Exchange.js';\n" +
        "import { Dict, Str } from './base/types.js';\n" +
        'export default class ex extends Exchange {\n' +
        "    makeName (a: string): string {\n        if (a === undefined) {\n            return 'u';\n        }\n        return 'x';\n    }\n" +
        "    maybeName (a: string): Str {\n        return this.safeString ({}, a);\n    }\n" +
        '    buildRequest (a: Dict, b: Dict): Dict {\n        return this.extend (a, b);\n    }\n' +
        "    useName (a: string) {\n        const n = this.makeName (a);\n        return n + 'y';\n    }\n" +
        "    useMaybe (a: string) {\n        const m = this.maybeName (a);\n        return m + 'y';\n    }\n" +
        "    useRequest (a: Dict, b: Dict) {\n        const r = this.buildRequest (a, b);\n        return r['k'];\n    }\n" +
        "    useRebound (a: string, o: any) {\n        let n = this.makeName (a);\n        n = o;\n        return n;\n    }\n" +
        '}\n';
    let out = '';
    const fn = (name: string) => {
        const start = out.indexOf (') ' + name + '(');
        const next = out.indexOf ('\nfunc ', start + 1);
        return out.slice (out.lastIndexOf ('func ', start), (next < 0) ? out.length : next);
    };
    beforeAll (() => {
        const tmp = fs.mkdtempSync (path.join (os.tmpdir (), 'h28g37-'));
        try {
            const src = path.join (tmp, 'ts', 'src');
            fs.mkdirSync (path.join (src, 'base'), { 'recursive': true });
            fs.mkdirSync (path.join (tmp, 'go', 'v4'), { 'recursive': true });
            fs.writeFileSync (path.join (src, 'base', 'types.ts'), TYPES);
            fs.writeFileSync (path.join (src, 'base', 'Exchange.ts'), BASE);
            fs.writeFileSync (path.join (src, 'ex.ts'), VENUE);
            const t: any = new Transpiler ({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 } } });
            installCcxtGoHooks (t.goTranspiler);
            out = t.transpileGoByPath (path.join (src, 'ex.ts')).content;
        } finally {
            fs.rmSync (tmp, { 'recursive': true, 'force': true });
        }
    });
    test ('positive: string return', () => {
        expect (fn ('UseName')).toMatch (/var n string = this\.MakeName/);
    });
    test ('positive: never-nil map return', () => {
        expect (fn ('UseRequest')).toMatch (/var r map\[string\]any = this\.BuildRequest/);
    });
    test ('negative: nilable return keeps the box', () => {
        expect (fn ('UseMaybe')).not.toMatch (/var m string =/);
    });
    test ('negative: a later boxed write keeps the box', () => {
        expect (fn ('UseRebound')).toMatch (/var n any = this\.MakeName/);
    });
});
