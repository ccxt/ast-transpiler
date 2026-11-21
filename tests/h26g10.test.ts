import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

// a parse* method annotated `NullableDict` whose every ts/src call binds a `NullableDict` local prints
// `map[string]any`; a caller binding an undeclared local or passing the value on keeps `any`.
describe ('go NullableDict parse* return', () => {
    const TYPES = 'export type Dict = { [key: string]: any };\nexport type NullableDict = Dict | undefined;\n';
    const BASE =
        "import { Dict } from './types.js';\n" +
        'export class Exchange {\n    safeString (o: any, k: any, d: any = undefined): string {\n        return o;\n    }\n}\n';
    const parser = (name: string) =>
        '    ' + name + ' (flag: boolean): NullableDict {\n' +
        '        if (flag) {\n            return undefined;\n        }\n' +
        "        return { 'market': 'x' };\n    }\n";
    const VENUE =
        "import { Exchange } from './base/Exchange.js';\n" +
        "import { Dict, NullableDict } from './base/types.js';\n" +
        'export default class ex extends Exchange {\n' +
        parser ('parseGood') + parser ('parseLoose') + parser ('parsePassed') +
        '    useGood (flag: boolean) {\n' +
        '        let data: NullableDict = undefined;\n' +
        '        data = this.parseGood (flag);\n' +
        '        if (data === undefined) {\n            return undefined;\n        }\n' +
        "        return this.safeString (data, 'market');\n    }\n" +
        '    useLoose (flag: boolean) {\n' +
        '        const data = this.parseLoose (flag);\n' +
        '        if (data === undefined) {\n            return undefined;\n        }\n' +
        "        return this.safeString (data, 'market');\n    }\n" +
        '    usePassed (flag: boolean) {\n' +
        "        return this.safeString (this.parsePassed (flag), 'market');\n    }\n" +
        '}\n';
    let out = '';
    const fn = (name: string) => {
        const start = out.indexOf (') ' + name + '(');
        const next = out.indexOf ('\nfunc ', start + 1);
        return out.slice (out.lastIndexOf ('func ', start), (next < 0) ? out.length : next);
    };
    beforeAll (() => {
        const tmp = fs.mkdtempSync (path.join (os.tmpdir (), 'h26g10-'));
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
    test ('positive: every caller binds a NullableDict local, the map type is printed', () => {
        expect (fn ('ParseGood')).toMatch (/ParseGood\(flag any\) map\[string\]any \{/);
        expect (fn ('UseGood')).toMatch (/var data map\[string\]any = nil/);
        expect (fn ('UseLoose')).toMatch (/var data any = this\.ParseLoose/);
    });
    test ('negative: an undeclared local keeps the box', () => {
        expect (fn ('ParseLoose')).toMatch (/ParseLoose\(flag any\) any \{/);
    });
    test ('negative: a value passed straight on keeps the box', () => {
        expect (fn ('ParsePassed')).toMatch (/ParsePassed\(flag any\) any \{/);
    });
});
