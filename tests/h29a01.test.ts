// h29a01 // a sync venue method's Dict slot that every same-file caller feeds an awaited map endpoint local takes
// map[string]any (the argument already prints that type), so the h28a01 comma-ok reads fire on it.
import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

describe ('h29a01: raw awaited endpoint response as an internal method argument', () => {
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
        '    safeDict (o: any, k: any, d: Dict = undefined): Dict {\n        return o;\n    }\n' +
        '    safeString (o: any, k: any, d: Str = undefined): Str {\n        return d;\n    }\n' +
        '    keep (o: any): any {\n        return o;\n    }\n}\n';
    const VENUE =
        "import Exchange from './abstract/ex.js';\n" +
        "import { Dict, List } from './base/types.js';\n" +
        'export default class ex extends Exchange {\n' +
        "    async pos (params = {}) {\n        const response = await this.publicGetD (params);\n        return this.parseFee (response);\n    }\n" +
        "    parseFee (response: Dict) {\n        const data = this.safeDict (response, 'data');\n        return this.safeString (data, 'id');\n    }\n" +
        "    async lt (params = {}) {\n        let response: Dict = undefined;\n        if (params['a'] === 1) {\n            response = await this.publicGetD (params);\n        } else {\n            response = await this.publicGetD (params);\n        }\n        return this.ltOf (response);\n    }\n" +
        "    ltOf (response: Dict) {\n        const data = this.safeDict (response, 'data');\n        return this.safeString (data, 'id');\n    }\n" +
        "    async two (params = {}) {\n        const response = await this.publicGetD (params);\n        return this.twoOf (response);\n    }\n" +
        "    other (params = {}) {\n        return this.twoOf (params);\n    }\n" +
        "    twoOf (response: Dict) {\n        const data = this.safeDict (response, 'data');\n        return this.safeString (data, 'id');\n    }\n" +
        "    async wr (params = {}) {\n        const response = await this.publicGetD (params);\n        return this.wrOf (response);\n    }\n" +
        "    wrOf (response: Dict) {\n        response['x'] = 1;\n        const data = this.safeDict (response, 'data');\n        return this.safeString (data, 'id');\n    }\n" +
        "    async nl (params = {}) {\n        const response = await this.publicGetD (params);\n        return this.nlOf (response);\n    }\n" +
        "    nlOf (response: Dict) {\n        const data = this.safeDict (response, 'data');\n        if (data === undefined) {\n            return undefined;\n        }\n        return this.safeString (data, 'id');\n    }\n" +
        "    async rl (params = {}) {\n        const response = await this.publicGetL (params);\n        return this.rlOf (response);\n    }\n" +
        "    rlOf (response: Dict[]) {\n        const result = [];\n        for (let i = 0; i < response.length; i++) {\n            const entry = this.safeDict (response, i);\n            result.push (this.safeString (entry, 'id'));\n        }\n        return result;\n    }\n" +
        '}\n';
    const API = 'package ccxt\n\n' +
        'func (this *Ex) PublicGetD(args ...any) <-chan EndpointResult[map[string]any] {\n\treturn nil\n}\n' +
        'func (this *Ex) PublicGetL(args ...any) <-chan EndpointResult[[]any] {\n\treturn nil\n}\n';
    let out = '';
    const fn = (name: string) => {
        const start = out.search (new RegExp ('func \\(this \\*ex\\) ' + name + '(Body)?\\('));
        const next = out.indexOf ('\nfunc ', start + 1);
        return out.slice (start, (next < 0) ? out.length : next);
    };
    beforeAll (() => {
        const tmp = fs.mkdtempSync (path.join (process.env.TMPDIR || os.tmpdir (), 'h29a01-'));
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
    test ('positive: a map slot fed an awaited map endpoint local prints map[string]any and reads by comma-ok (fails on the base printer)', () => {
        expect (fn ('ParseFee')).toContain ('ParseFee(response map[string]any)');
        expect (fn ('ParseFee')).toContain ('var data, _ = response["data"].(map[string]any)\n');
        expect (fn ('ParseFee')).not.toContain ('SafeMapTyped(');
    });
    test ('positive: a nil-seeded local every write of which is a map endpoint receive', () => {
        expect (fn ('LtOf')).toContain ('LtOf(response map[string]any)');
        expect (fn ('LtOf')).toContain ('var data, _ = response["data"].(map[string]any)\n');
    });
    test ('negative: one caller passes the user params bag, so the slot is not typed from the endpoint', () => {
        expect (fn ('TwoOf')).not.toContain ('response["data"].(');
    });
    test ('negative: a slot written through prints no assertion', () => {
        expect (fn ('WrOf')).not.toContain ('response["data"].(');
    });
    test ('nil-tested result keeps the nil test', () => {
        expect (fn ('NlOf')).toContain ('data == nil');
    });
    test ('negative: a list endpoint local does not type a Dict slot as a map', () => {
        expect (fn ('RlOf')).not.toContain ('RlOf(response map[string]any)');
    });
});
