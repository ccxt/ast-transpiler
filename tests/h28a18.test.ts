import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

// a `*string` slot of a venue [Str, Dict] pair returned from a never-rebound Go `string` parameter prints `&v`
// instead of SafeStringPtr(v); a boxed, rebound or nil-able operand keeps its old form.
describe ('h28a18: string operand of a *string pair slot by address', () => {
    const TYPES = 'export type Dict = { [key: string]: any };\nexport type Str = string | undefined;\n';
    const BASE = "import { Dict, Str } from './types.js';\nexport class Exchange {\n" +
        '    omit (o: Dict, k: string): Dict {\n        return o;\n    }\n}\n';
    const pair = (name: string, param: string, body: string[]) => '    ' + name + ' (' + param + ', params: Dict): [Str, Dict] {\n'
        + body.map ((l) => '        ' + l + '\n').join ('') + '    }\n';
    const VENUE = "import { Exchange } from './base/Exchange.js';\nimport { Dict, Str } from './base/types.js';\nexport default class ex extends Exchange {\n" +
        pair ('pos', 'type: string', [ "const rest: Dict = this.omit (params, 'x');", "if (type === 'market') {", "    return [ 'ioc', rest ];", '}', 'return [ type, rest ];' ]) +
        pair ('rebound', 'type: string', [ "if (type === 'market') {", "    type = 'limit';", '}', 'return [ type, params ];' ]) +
        pair ('boxed', 'type: string', [ "const t = this.omit (params, type)['k'];", 'return [ t, params ];' ]) +
        pair ('nilable', 'type: Str', [ 'if (type === undefined) {', '    return [ undefined, params ];', '}', 'return [ type, params ];' ]) +
        '    caller (params: Dict = {}) {\n' +
        "        const [ a, p1 ] = this.pos ('limit', params);\n" +
        "        const [ b, p2 ] = this.rebound ('limit', p1);\n" +
        "        const [ c, p3 ] = this.boxed ('limit', p2);\n" +
        "        const [ d, p4 ] = this.nilable (undefined, p3);\n" +
        '        return [ a, b, c, d, p4 ];\n    }\n' +
        '}\n';
    let out = '';
    const fn = (name: string) => {
        const start = out.search (new RegExp ('func \\(this \\*ex\\) ' + name + '\\('));
        const next = out.indexOf ('\nfunc ', start + 1);
        return out.slice (start, (next < 0) ? out.length : next);
    };
    beforeAll (() => {
        const tmp = fs.mkdtempSync (path.join (process.env.TMPDIR || os.tmpdir (), 'h28a18-'));
        try {
            const src = path.join (tmp, 'ts', 'src');
            fs.mkdirSync (path.join (src, 'base'), { 'recursive': true });
            fs.mkdirSync (path.join (tmp, 'go', 'v4'), { 'recursive': true });
            fs.writeFileSync (path.join (src, 'base', 'types.ts'), TYPES);
            fs.writeFileSync (path.join (src, 'base', 'Exchange.ts'), BASE);
            fs.writeFileSync (path.join (src, 'ex.ts'), VENUE);
            const cwd = process.cwd ();
            process.chdir (tmp);
            const t: any = new Transpiler ({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 }, 'asyncMethodSuffix': 'Async' } });
            installCcxtGoHooks (t.goTranspiler);
            try {
                out = t.transpileGoByPath (path.join (src, 'ex.ts')).content;
            } finally {
                process.chdir (cwd);
            }
            fs.writeFileSync (path.join (process.env.TMPDIR || os.tmpdir (), 'h28a18.out'), out);
        } finally {
            fs.rmSync (tmp, { 'recursive': true, 'force': true });
        }
    });
    test ('positive: a never-rebound Go string parameter is returned by address (fails on the base printer)', () => {
        expect (fn ('Pos')).toMatch (/\(typeVar string, /);
        expect (fn ('Pos')).toContain ('return &typeVar, ');
        expect (fn ('Pos')).not.toContain ('SafeStringPtr(typeVar)');
    });
    test ('negative: a rebound parameter is not returned by address', () => {
        expect (fn ('Rebound')).not.toContain ('return &typeVar');
    });
    test ('negative: a boxed local is not returned by address', () => {
        expect (fn ('Boxed')).not.toContain ('return &t');
    });
    test ('negative: a nil-able parameter keeps its nil answer (no address taken)', () => {
        expect (fn ('Nilable')).not.toContain ('return &typeVar');
        expect (fn ('Nilable')).toContain ('return typeVar, params');
    });
});
