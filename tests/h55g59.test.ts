import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

// a venue Dict parameter whose callers all hand decoded JSON prints `x = this.safeList (p, 'k', [])` as the comma-ok read
describe ('h55g59: defaulted list reads on a Dict parameter fed by joined endpoint locals', () => {
    const ABSTRACT =
        "import { Dict, List } from '../base/types.js';\n" +
        "import { Exchange as _Exchange } from '../base/Exchange.js';\n" +
        'abstract class Exchange extends _Exchange {\n' +
        '    publicGetD (params = {}): Promise<Dict> {\n        return this.request ("d", [ "public" ], "GET", params);\n    }\n\n' +
        '    publicGetE (params = {}): Promise<Dict> {\n        return this.request (\"e\", [ \"public\" ], \"GET\", params);\n    }\n\n' +
        '    publicGetL (params = {}): Promise<List> {\n        return this.request ("l", [ "public" ], "GET", params);\n    }\n}\n' +
        'export default Exchange;\n';
    const TYPES = 'export type Dict = { [key: string]: any };\nexport type List = any[];\nexport type Str = string | undefined;\n';
    const BASE =
        "import { Dict, List, Str } from './types.js';\n" +
        'export class Exchange {\n    request (path: string, api: string[], method: string, params: Dict = {}): Promise<any> {\n        return undefined;\n    }\n' +
        '    safeDict (o: any, k: any, d: Dict = undefined): Dict {\n        return o;\n    }\n' +
        '    safeList (o: any, k: any, d: List = undefined): List {\n        return d;\n    }\n' +
        '    safeString (o: any, k: any, d: Str = undefined): Str {\n        return d;\n    }\n' +
        '    keep (o: any): any {\n        return o;\n    }\n}\n';
    const HELPER = (name: string, extra: string) => '    ' + name + ' (response: Dict, t: string) {\n' + extra + '        let rows: any[];\n'
        + "        if (t === 'a') {\n            rows = this.safeList (response, 'a', []);\n        } else {\n            rows = this.safeList (response, 'b', []);\n        }\n"
        + "        const result: Dict = { 'info': response };\n        for (let i = 0; i < rows.length; i++) {\n            result[this.safeString (rows[i], 'k')] = 1;\n        }\n        return result;\n    }\n";
    const VENUE =
        "import Exchange from './abstract/ex.js';\n" +
        "import { Dict } from './base/types.js';\n" +
        'export default class ex extends Exchange {\n' +
        "    async bal (params = {}) {\n        let response: Dict;\n        const t = this.safeString (params, 't');\n" +
        "        if (t === 'a') {\n            response = await this.publicGetD (params);\n        } else {\n            response = await this.publicGetE (params);\n        }\n" +
        "        return this.parseX (response, t);\n    }\n" +
        HELPER ('parseX', '') +
        "    async usr (params = {}) {\n        const response = await this.publicGetD (params);\n        this.keep (response);\n        return this.parseU (params, 'a');\n    }\n" +
        HELPER ('parseU', '') +
        "    async wrt (params = {}) {\n        const response = await this.publicGetD (params);\n        return this.parseW (response, 'a');\n    }\n" +
        HELPER ('parseW', "        response['x'] = 1;\n") +
        '}\n';
    const API = 'package ccxt\n\n' +
        'func (this *Ex) PublicGetD(args ...any) <-chan EndpointResult[map[string]any] {\n\treturn nil\n}\n' +
        'func (this *Ex) PublicGetE(args ...any) <-chan EndpointResult[map[string]any] {\n\treturn nil\n}\n' +
        'func (this *Ex) PublicGetL(args ...any) <-chan EndpointResult[[]any] {\n\treturn nil\n}\n';
    let out = '';
    const fn = (name: string) => {
        const start = out.search (new RegExp ('func \\(this \\*ex\\) ' + name + '(Body)?\\('));
        const next = out.indexOf ('\nfunc ', start + 1);
        return out.slice (start, (next < 0) ? out.length : next);
    };
    beforeAll (() => {
        const tmp = fs.mkdtempSync (path.join (process.env.TMPDIR || os.tmpdir (), 'h55g59-'));
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
    test ('positive: a Dict parameter every caller feeds a joined endpoint local reads its defaulted lists by comma-ok (fails on the base printer)', () => {
        expect (fn ('ParseX')).toContain ('rows, _ = response["a"].([]any)\n');
        expect (fn ('ParseX')).toContain ('rows, _ = response["b"].([]any)\n');
        expect (fn ('ParseX')).toContain ('rows = []any{}');
        expect (fn ('ParseX')).not.toContain ('SafeList');
    });
    test ('negative: a caller that hands the user params bag keeps the helper', () => {
        expect (fn ('ParseU')).not.toContain ('response["a"].(');
    });
    test ('negative: a parameter written through keeps the helper', () => {
        expect (fn ('ParseW')).not.toContain ('response["a"].(');
    });
});
