import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

// a `[]`-defaulted list read at a literal index of a read-only awaited list endpoint result prints the comma-ok
// element assertion plus the empty default, not SafeListSlice
describe ('go defaulted list read on an awaited list endpoint result', () => {
    const TYPES = 'export type Dict = { [key: string]: any };\nexport type List = any[];\n';
    const BASE =
        "import { Dict } from './types.js';\n" +
        'export class Exchange {\n    request (path: string, api: string[], method: string, params: Dict = {}): Promise<any> {\n        return undefined;\n    }\n' +
        '    safeString (o: any, k: any, d: any = undefined): string {\n        return k;\n    }\n' +
        '    safeDict (o: any, k: any, d: any = undefined): Dict {\n        return o[k];\n    }\n' +
        '    safeList (o: any, k: any, d: any = undefined): any[] {\n        return o[k];\n    }\n' +
        '    parseL (o: any[]): any[] {\n        return o;\n    }\n' +
        '    parseX (o: Dict): Dict {\n        return o;\n    }\n}\n';
    const ABSTRACT =
        "import { Dict, List } from '../base/types.js';\n" +
        "import { Exchange as _Exchange } from '../base/Exchange.js';\n" +
        'abstract class Exchange extends _Exchange {\n' +
        '    publicGetRows (params = {}): Promise<List> {\n        return this.request ("rows", [ "public" ], "GET", params);\n    }\n}\n' +
        'export default Exchange;\n';
    const STUBS = 'package ccxt\n\n// PublicGetRows returns a channel that yields a JSON array.\n' +
        'func (this *Ex) PublicGetRows(args ...any) <-chan EndpointResult[[]any] {\n\treturn nil\n}\n';
    const VENUE =
        "import Exchange from './abstract/ex.js';\n" +
        'export default class ex extends Exchange {\n' +
        '    async fetchLit (params = {}) {\n' +
        '        const response = await this.publicGetRows (params);\n' +
        '        const spot = this.safeList (response, 0, []);\n' +
        '        const fut = this.safeList (response, 1, []);\n' +
        '        return this.parseL (spot).concat (fut);\n' +
        '    }\n' +
        '    async fetchHanded (params = {}) {\n' +
        '        const response = await this.publicGetRows (params);\n' +
        '        const hd = this.safeList (response, 0, []);\n' +
        '        this.parseL (response);\n' +
        '        return this.parseL (hd);\n' +
        '    }\n' +
        '    async fetchWritten (params = {}) {\n' +
        '        const response = await this.publicGetRows (params);\n' +
        '        response.push ([]);\n' +
        '        const wr = this.safeList (response, 0, []);\n' +
        '        return this.parseL (wr);\n' +
        '    }\n' +
        '    async fetchNoDefault (params = {}) {\n' +
        '        const response = await this.publicGetRows (params);\n' +
        '        const nd = this.safeList (response, 0);\n' +
        '        return this.parseL (nd);\n' +
        '    }\n' +
        '}\n';
    let out = '';
    beforeAll (() => {
        const tmp = fs.mkdtempSync (path.join (os.tmpdir (), 'h30a12-'));
        try {
            const src = path.join (tmp, 'ts', 'src');
            fs.mkdirSync (path.join (src, 'base'), { 'recursive': true });
            fs.mkdirSync (path.join (src, 'abstract'), { 'recursive': true });
            fs.mkdirSync (path.join (tmp, 'go', 'v4'), { 'recursive': true });
            fs.writeFileSync (path.join (src, 'base', 'types.ts'), TYPES);
            fs.writeFileSync (path.join (src, 'base', 'Exchange.ts'), BASE);
            fs.writeFileSync (path.join (src, 'abstract', 'ex.ts'), ABSTRACT);
            fs.writeFileSync (path.join (src, 'ex.ts'), VENUE);
            fs.writeFileSync (path.join (tmp, 'go', 'v4', 'ex_api.go'), STUBS);
            const t: any = new Transpiler ({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 }, 'asyncMethodSuffix': 'Async', 'asyncSuffixExemptPaths': [ '(^|/)ts/src/abstract/' ] } });
            installCcxtGoHooks (t.goTranspiler);
            out = t.transpileGoByPath (path.join (src, 'ex.ts')).content;
        } finally {
            fs.rmSync (tmp, { 'recursive': true, 'force': true });
        }
    });
    test ('positive: the defaulted list read becomes a bounds-guarded comma-ok read with the empty default', () => {
        expect (out).toMatch (/var spot \[\]any\n\tif 0 < len\(response\) \{\n\t\tspot, _ = response\[0\]\.\(\[\]any\)\n\t\}\n\tif spot == nil \{\n\t\tspot = \[\]any\{\}\n\t\}/);
        expect (out).not.toContain ('this.SafeListSlice(response, 1, []any{})');
    });
    test ('negative: the list handed to a callee that may write it keeps the wrap', () => {
        expect (out).toContain ('var hd []any = this.SafeListSlice(response, 0, []any{})');
    });
    test ('negative: the list written before the read keeps the wrap', () => {
        expect (out).toContain ('var wr []any = this.SafeListSlice(response, 0, []any{})');
    });
    test ('negative: a read without a default is not this rule', () => {
        expect (out).not.toMatch (/nd = \[\]any\{\}/);
    });
});
