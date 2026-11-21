import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

// a closed venue `: Dict` method whose only path returns another venue method proven to return a never-nil map
// prints `map[string]any`; a callee that may hand back a (possibly nil) map parameter keeps `any`.
describe ('go Dict return through a never-nil venue method call', () => {
    const TYPES = 'export type Dict = { [key: string]: any };\nexport type NullableDict = Dict | undefined;\n';
    const BASE =
        "import { Dict } from './types.js';\n" +
        'export class Exchange {\n    extend (a: any, b: any = undefined): Dict {\n        return a;\n    }\n' +
        '    safeString (o: any, k: any, d: any = undefined): string {\n        return o;\n    }\n}\n';
    const VENUE =
        "import { Exchange } from './base/Exchange.js';\n" +
        "import { Dict } from './base/types.js';\n" +
        'export default class ex extends Exchange {\n' +
        '    buildRequest (a: Dict, b: Dict): Dict {\n' +
        '        const request = this.extend (a, b);\n        return request;\n    }\n' +
        '    outerGood (a: Dict, b: Dict): Dict {\n' +
        '        const request = this.buildRequest (a, b);\n        return request;\n    }\n' +
        '    passThrough (a: Dict): Dict {\n        return a;\n    }\n' +
        '    outerBad (a: Dict): Dict {\n' +
        '        const request = this.passThrough (a);\n        return request;\n    }\n' +
        '    useGood (a: Dict, b: Dict) {\n' +
        "        const r = this.outerGood (a, b);\n        return this.safeString (r, 'x');\n    }\n" +
        '    useBad (a: Dict) {\n' +
        "        const r = this.outerBad (a);\n        return this.safeString (r, 'x');\n    }\n" +
        '}\n';
    let out = '';
    const fn = (name: string) => {
        const start = out.indexOf (') ' + name + '(');
        const next = out.indexOf ('\nfunc ', start + 1);
        return out.slice (out.lastIndexOf ('func ', start), (next < 0) ? out.length : next);
    };
    beforeAll (() => {
        const tmp = fs.mkdtempSync (path.join (os.tmpdir (), 'h27g14-'));
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
    test ('positive: a return through a never-nil venue method call prints the map type', () => {
        expect (fn ('OuterGood')).toMatch (/OuterGood\([^)]*\) map\[string\]any \{/);
        expect (fn ('UseGood')).toMatch (/var r map\[string\]any = this\.OuterGood/);
    });
    test ('negative: a callee returning its (nilable) map parameter keeps the box', () => {
        expect (fn ('OuterBad')).toMatch (/OuterBad\([^)]*\) any \{/);
        expect (fn ('UseBad')).toMatch (/var r any = this\.OuterBad/);
    });
});
