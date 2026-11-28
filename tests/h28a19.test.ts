import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

// `x = y` into a `[]`-seeded list local, y already printed []any: ArrayTyped is the identity, print y;
// an `any` operand keeps the conversion.
describe ('h28a19: list write of a []any operand into a []-seeded list local prints the operand', () => {
    const ABSTRACT =
        "import { Dict, List } from '../base/types.js';\n" +
        "import { Exchange as _Exchange } from '../base/Exchange.js';\n" +
        'abstract class Exchange extends _Exchange {\n' +
        '    publicGetD (params = {}): Promise<Dict> {\n        return this.request ("d", [ "public" ], "GET", params);\n    }\n\n' +
        '    publicGetL (params = {}): Promise<List> {\n        return this.request ("l", [ "public" ], "GET", params);\n    }\n}\n' +
        'export default Exchange;\n';
    const TYPES = 'export type Dict = { [key: string]: any };\nexport type List = any[];\nexport type Str = string | undefined;\n';
    const BASE =
        "import { Dict, List, Str } from './types.js';\n" +
        'export class Exchange {\n    request (path: string, api: string[], method: string, params: Dict = {}): Promise<any> {\n        return undefined;\n    }\n' +
        '    safeList (o: any, k: any, d: List = undefined): List {\n        return o;\n    }\n' +
        '    safeString (o: any, k: any, d: Str = undefined): Str {\n        return d;\n    }\n' +
        '    keep (o: any): any {\n        return o;\n    }\n}\n';
    const VENUE =
        "import Exchange from './abstract/ex.js';\n" +
        "import { Dict, List } from './base/types.js';\n" +
        'export default class ex extends Exchange {\n' +
        '    pos (response: Dict) {\n        const xs = this.safeList (response, "data");\n        let out: Dict[] = [];\n        if (xs !== undefined) {\n            out = xs;\n        }\n        return out.length;\n    }\n' +
        '    posGuard (xs: any[]) {\n        let out = [];\n        if (Array.isArray (xs)) {\n            out = xs;\n        }\n        return out.length;\n    }\n' +
        '    boxed (v: any) {\n        let out = [];\n        if (Array.isArray (v)) {\n            out = v;\n        }\n        return out.length;\n    }\n' +
        '    async endpoint (params = {}) {\n        const rows = await this.publicGetL (params);\n        let out: Dict[] = [];\n        if (Array.isArray (rows)) {\n            out = rows;\n        }\n        return out.length;\n    }\n' +
        '    async endpointDict (params = {}) {\n        const rows = await this.publicGetD (params);\n        let out: Dict[] = [];\n        if (Array.isArray (rows)) {\n            out = rows;\n        }\n        return out.length;\n    }\n' +
        '    async ternaryEmpty (params = {}) {\n        const rows = await this.publicGetL (params);\n        const out = Array.isArray (rows) ? rows : [];\n        return out.length;\n    }\n' +
        '    async ternaryRows (params = {}) {\n        const rows = await this.publicGetL (params);\n        const out: Dict[] = Array.isArray (rows) ? rows : this.safeList (rows, "data", []);\n        return out.length;\n    }\n' +
        '    async ternaryDict (params = {}) {\n        const rows = await this.publicGetD (params);\n        const out = Array.isArray (rows) ? rows : [];\n        return out.length;\n    }\n' +
        '    accessor (v: Dict) {\n        let out = [];\n        out = this.safeList (v, "a", []);\n        return out.length;\n    }\n' +
        '}\n';
    const API = 'package ccxt\n\n' +
        'func (this *Ex) PublicGetL(args ...any) <-chan EndpointResult[[]any] {\n\treturn nil\n}\n' +
        'func (this *Ex) PublicGetD(args ...any) <-chan EndpointResult[map[string]any] {\n\treturn nil\n}\n';
    let out = '';
    const fn = (name: string) => {
        const start = out.search (new RegExp ('func \\(this \\*ex\\) ' + name + '(Body)?\\('));
        const next = out.indexOf ('\nfunc ', start + 1);
        return out.slice (start, (next < 0) ? out.length : next);
    };
    const body = (name: string) => {
        const start = out.indexOf ('func (this *ex) ' + name + '(');
        const next = out.indexOf ('\nfunc ', start + 1);
        return (start < 0) ? '' : out.slice (start, (next < 0) ? out.length : next);
    };
    beforeAll (() => {
        const tmp = fs.mkdtempSync (path.join (process.env.TMPDIR || os.tmpdir (), 'h28a19-'));
        try {
            const src = path.join (tmp, 'ts', 'src');
            fs.mkdirSync (path.join (src, 'base'), { 'recursive': true });
            fs.mkdirSync (path.join (src, 'abstract'), { 'recursive': true });
            fs.mkdirSync (path.join (tmp, 'go', 'v4'), { 'recursive': true });
            fs.writeFileSync (path.join (src, 'base', 'types.ts'), TYPES);
            fs.writeFileSync (path.join (src, 'base', 'Exchange.ts'), BASE);
            fs.writeFileSync (path.join (src, 'abstract', 'ex.ts'), ABSTRACT);
            fs.writeFileSync (path.join (src, 'ex.ts'), VENUE);
            fs.writeFileSync (path.join (tmp, 'go', 'v4', 'ex_api.go'), API);
            const t: any = new Transpiler ({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 }, 'asyncMethodSuffix': 'Async', 'asyncSuffixExemptPaths': [ '(^|/)ts/src/abstract/' ] } });
            installCcxtGoHooks (t.goTranspiler);
            out = t.transpileGoByPath (path.join (src, 'ex.ts')).content;
        } finally {
            fs.rmSync (tmp, { 'recursive': true, 'force': true });
        }
    });
    test ('positive: a []any operand is written as is (fails on the base printer)', () => {
        expect (fn ('Pos')).toContain ('out = xs\n');
        expect (fn ('Pos')).not.toContain ('ArrayTyped(');
        expect (fn ('PosGuard')).toContain ('out = xs\n');
        expect (fn ('PosGuard')).not.toContain ('ArrayTyped(');
    });
    test ('negative: an any operand is not printed bare into the list local', () => {
        expect (fn ('Boxed')).not.toMatch (/out = v\n/);
    });
    test ('negative: an accessor call is not printed bare into the list local', () => {
        expect (fn ('Accessor')).not.toMatch (/out = this\.SafeList\(v, "a", \[\]any\{\}\)\n/);
    });
    test ('positive: an awaited list endpoint local is written as is (fails on the base printer)', () => {
        expect (body ('endpointBody')).toContain ('var rows []any = rowsRecv.Value');
        expect (body ('endpointBody')).toContain ('out = rows\n');
        expect (body ('endpointBody')).not.toContain ('ArrayTyped(');
    });
    test ('negative: an awaited dict endpoint local keeps the conversion', () => {
        expect (body ('endpointDictBody')).not.toMatch (/out = rows\n/);
    });
    test ('positive: a []any local in a list ternary arm is written as is (fails on the base printer)', () => {
        expect (body ('ternaryEmptyBody')).toContain ('out = rows\n');
        expect (body ('ternaryEmptyBody')).not.toContain ('ArrayTyped(rows)');
        expect (body ('ternaryRowsBody')).toContain ('out = rows\n');
        expect (body ('ternaryRowsBody')).not.toContain ('ArrayTyped(rows)');
    });
    test ('negative: a dict endpoint local in a ternary arm keeps the conversion', () => {
        expect (body ('ternaryDictBody')).not.toMatch (/out = rows\n/);
    });
});
