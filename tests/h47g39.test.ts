import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

// a `*string` slot of a venue [Str, Dict] pair returned from a never-rebound Go `string` parameter prints `&v`
// instead of SafeStringPtr(v); a boxed, rebound or nil-able operand keeps its old form.
describe ('h47g39: a Go string BaseExchange field into a *string pair slot by address', () => {
    const TYPES = 'export type Dict = { [key: string]: any };\nexport type Str = string | undefined;\n';
    const BASE = "import { Dict, Str } from './types.js';\nexport class Exchange {\n    walletAddress: Str = undefined;\n    extraAddress: Str = undefined;\n" +
        '    omit (o: Dict, k: string): Dict {\n        return o;\n    }\n}\n';
    const pair = (name: string, param: string, body: string[]) => '    ' + name + ' (' + param + ', params: Dict): [Str, Dict] {\n'
        + body.map ((l) => '        ' + l + '\n').join ('') + '    }\n';
    const VENUE = "import { Exchange } from './base/Exchange.js';\nimport { Dict, Str } from './base/types.js';\nexport default class ex extends Exchange {\n" +
        pair ('field', 'm: string', [ "if ((this.walletAddress !== undefined) && (this.walletAddress !== '')) {", '    return [ this.walletAddress, params ];', '}', 'return [ undefined, params ];' ]) +
        pair ('other', 'm: string', [ 'return [ this.extraAddress, params ];' ]) +
        '    caller (params: Dict = {}) {\n' +
        "        const [ a, p1 ] = this.field ('x', params);\n" +
        "        const [ b, p2 ] = this.other ('x', p1);\n" +
        '        return [ a, b, p2 ];\n    }\n' +
        '}\n';
    let out = '';
    const fn = (name: string) => {
        const start = out.search (new RegExp ('func \\(this \\*ex\\) ' + name + '\\('));
        const next = out.indexOf ('\nfunc ', start + 1);
        return out.slice (start, (next < 0) ? out.length : next);
    };
    beforeAll (() => {
        const tmp = fs.mkdtempSync (path.join (process.env.TMPDIR || os.tmpdir (), 'h47g39-'));
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
        } finally {
            fs.rmSync (tmp, { 'recursive': true, 'force': true });
        }
    });
    test ('positive: the Go string field walletAddress is returned by address (fails on the base printer)', () => {
        expect (fn ('Field')).toContain ('return &this.WalletAddress, ');
        expect (fn ('Field')).not.toContain ('SafeStringPtr(this.WalletAddress)');
    });
    test ('negative: a field Go does not declare string keeps SafeStringPtr', () => {
        expect (fn ('Other')).not.toContain ('&this.ExtraAddress');
    });
    test ('negative: the undefined slot keeps its base form', () => {
        expect (fn ('Field')).toContain ('return SafeStringPtr(nil), ');
    });
});
