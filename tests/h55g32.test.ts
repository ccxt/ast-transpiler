import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

// a `*string` local compared with a Go string BaseExchange field prints the nil-guarded native test;
// a field Go does not declare string, or an untyped operand, keeps IsEqual.
describe ('h55g32: a *string local against a Go string BaseExchange field', () => {
    const TYPES = 'export type Dict = { [key: string]: any };\nexport type Str = string | undefined;\n';
    const BASE = "import { Dict, Str } from './types.js';\nexport class Exchange {\n    walletAddress: string = undefined;\n    extraAddress: Str = undefined;\n" +
        '    safeString (o: Dict, k: string): Str {\n        return o[k];\n    }\n}\n';
    const VENUE = "import { Exchange } from './base/Exchange.js';\nimport { Dict, Str } from './base/types.js';\nexport default class ex extends Exchange {\n" +
        '    pick (m: string, params: Dict): [Str, Dict] {\n        return [ this.safeString (params, m), params ];\n    }\n' +
        "    same (params: Dict = {}) {\n        const [ a, p1 ] = this.pick ('x', params);\n        if (a === this.walletAddress) {\n            return p1;\n        }\n        return undefined;\n    }\n" +
        "    other (params: Dict = {}) {\n        const [ a, p1 ] = this.pick ('x', params);\n        if (a === this.extraAddress) {\n            return p1;\n        }\n        return undefined;\n    }\n" +
        "    boxed (v, params: Dict = {}) {\n        if (v === this.walletAddress) {\n            return params;\n        }\n        return undefined;\n    }\n" +
        '}\n';
    let out = '';
    const fn = (name: string) => {
        const start = out.search (new RegExp ('func \\(this \\*ex\\) ' + name + '\\('));
        const next = out.indexOf ('\nfunc ', start + 1);
        return out.slice (start, (next < 0) ? out.length : next);
    };
    beforeAll (() => {
        const tmp = fs.mkdtempSync (path.join (process.env.TMPDIR || os.tmpdir (), 'h55g32-'));
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
                out = t.transpileGoByPath (path.join ('ts', 'src', 'ex.ts')).content;
            } finally {
                process.chdir (cwd);
            }
        } finally {
            fs.rmSync (tmp, { 'recursive': true, 'force': true });
        }
    });
    test ('positive: the *string local tests nil, then compares with the string field (fails on the base printer)', () => {
        expect (fn ('Same')).toContain ('a != nil && *a == this.WalletAddress');
        expect (fn ('Same')).not.toContain ('IsEqual(');
    });
    test ('negative: a field Go does not declare string keeps IsEqual', () => {
        expect (fn ('Other')).toContain ('IsEqual(a, this.ExtraAddress)');
    });
    test ('negative: an untyped operand keeps IsEqual', () => {
        expect (fn ('Boxed')).toContain ('IsEqual(v, this.WalletAddress)');
    });
});
