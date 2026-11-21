import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

// a local ts declares a list, seeded `[]`, written only from awaited []any endpoint stubs, binds `[]any`;
// an undeclared local, a write of another type, or a stub of the other shape keeps the box.
describe ('go list-declared []-seeded local written from awaited list endpoints', () => {
    const ABSTRACT =
        "import { Dict, List } from '../base/types.js';\n" +
        "import { Exchange as _Exchange } from '../base/Exchange.js';\n" +
        'abstract class Exchange extends _Exchange {\n' +
        '    privateGetA (params = {}): Promise<List> {\n        return this.request ("a", [ "private" ], "GET", params);\n    }\n\n' +
        '    privateGetB (params = {}): Promise<List> {\n        return this.request ("b", [ "private" ], "GET", params);\n    }\n\n' +
        '    privateGetD (params = {}): Promise<Dict> {\n        return this.request ("d", [ "private" ], "GET", params);\n    }\n}\n' +
        'export default Exchange;\n';
    const TYPES = 'export type Dict = { [key: string]: any };\nexport type List = any[];\nexport type NullableList = any[] | undefined;\n';
    const BASE =
        "import { Dict, List } from './types.js';\n" +
        'export class Exchange {\n    request (path: string, api: string[], method: string, params: Dict = {}): Promise<any> {\n        return undefined;\n    }\n' +
        '    extend (a: Dict, b: Dict): Dict {\n        return a;\n    }\n' +
        '    safeDict (o: any, k: any, d: Dict = undefined): Dict {\n        return o;\n    }\n' +
        '    parseOrders (o: List, m: any = undefined): List {\n        return o;\n    }\n}\n';
    const body = (name: string, decl: string, second: string, tail: string) =>
        '    async ' + name + ' (flag: boolean, params = {}) {\n' +
        '        ' + decl + '\n' +
        '        if (flag) {\n' +
        '            response = await this.privateGetA (this.extend ({}, params));\n' +
        '        } else {\n' +
        '            response = ' + second + ';\n' +
        '        }\n' + tail + '    }\n';
    const parse = '        return this.parseOrders (response);\n';
    const loop = '        const out = [];\n        for (let i = 0; i < response.length; i++) {\n            out.push (this.safeDict (response, i, {}));\n        }\n        return out;\n';
    const VENUE =
        "import Exchange from './abstract/ex.js';\n" +
        "import { Dict, List } from './base/types.js';\n" +
        'export default class ex extends Exchange {\n' +
        body ('pos', 'let response: List = [];', 'await this.privateGetB (params)', parse) +
        body ('posLoop', 'let response: List = [];', 'await this.privateGetB (params)', loop) +
        body ('undeclared', 'let response = [];', 'await this.privateGetB (params)', parse) +
        body ('otherShape', 'let response: List = [];', 'await this.privateGetD (params) as any', parse) +
        body ('nilTest', 'let response: List = [];', 'await this.privateGetB (params)', '        if (response === undefined) {\n            return [];\n        }\n' + parse) +
        '}\n';
    const API = 'package ccxt\n\n' +
        'func (this *Ex) PrivateGetA(args ...any) <-chan EndpointResult[[]any] {\n\treturn nil\n}\n' +
        'func (this *Ex) PrivateGetB(args ...any) <-chan EndpointResult[[]any] {\n\treturn nil\n}\n' +
        'func (this *Ex) PrivateGetD(args ...any) <-chan EndpointResult[map[string]any] {\n\treturn nil\n}\n';
    let out = '';
    const fn = (name: string) => {
        const start = out.indexOf ('func (this *ex) ' + name + 'Body(');
        const next = out.indexOf ('\nfunc ', start + 1);
        return out.slice (start, (next < 0) ? out.length : next);
    };
    beforeAll (() => {
        const tmp = fs.mkdtempSync (path.join (os.tmpdir (), 'h25g02-'));
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
    test ('positive: two list endpoint writes bind a slice', () => {
        expect (fn ('pos')).toMatch (/var response \[\]any = \[\]any\{\}\n/);
        expect (fn ('pos')).not.toMatch (/var response any/);
    });
    test ('positive: loop reads become native', () => {
        expect (fn ('posLoop')).toMatch (/var response \[\]any = \[\]any\{\}\n/);
        expect (fn ('posLoop')).toContain ('i < len(response)');
    });
    test ('negative: an undeclared local keeps the box', () => {
        expect (fn ('undeclared')).toMatch (/var response any = \[\]any\{\}\n/);
    });
    test ('negative: a write of another shape keeps the box', () => {
        expect (fn ('otherShape')).toMatch (/var response any = \[\]any\{\}\n/);
    });
    test ('negative: a nil-testing read keeps the box', () => {
        expect (fn ('nilTest')).toMatch (/var response any = \[\]any\{\}\n/);
    });
});
