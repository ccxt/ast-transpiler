import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

// `const response = await this.<Dict endpoint>(..)` declared once per if / else branch and read only as a dict
// prints the typed receive in each branch; an escaping use, a nil test or a nested shadow keeps the box.
describe ('h27a14: sibling-block endpoint receive locals', () => {
    const ABSTRACT =
        "import { Dict, List } from '../base/types.js';\n" +
        "import { Exchange as _Exchange } from '../base/Exchange.js';\n" +
        'abstract class Exchange extends _Exchange {\n' +
        '    privateGetA (params = {}): Promise<Dict> {\n        return this.request ("a", [ "private" ], "GET", params);\n    }\n\n' +
        '    privateGetB (params = {}): Promise<Dict> {\n        return this.request ("b", [ "private" ], "GET", params);\n    }\n}\n' +
        'export default Exchange;\n';
    const TYPES = 'export type Dict = { [key: string]: any };\nexport type List = any[];\n';
    const BASE =
        "import { Dict, List } from './types.js';\n" +
        'export class Exchange {\n    request (path: string, api: string[], method: string, params: Dict = {}): Promise<any> {\n        return undefined;\n    }\n' +
        '    safeString (o: any, k: any, d: string = undefined): string {\n        return d;\n    }\n' +
        '    safeDict (o: any, k: any, d: Dict = undefined): Dict {\n        return o;\n    }\n}\n';
    const branch = (use: string) =>
        "            const response = await this.privateGetA (params);\n" + use;
    const body = (name: string, first: string, second: string, head = '') =>
        '    async ' + name + ' (flag: boolean, params = {}) {\n' + head +
        '        let id = undefined;\n' +
        '        if (flag) {\n' + branch (first) +
        '        } else {\n' +
        "            const response = await this.privateGetB (params);\n" + second +
        '        }\n        return id;\n    }\n';
    const read = "            id = this.safeString (response, 'id');\n";
    const VENUE =
        "import Exchange from './abstract/ex.js';\n" +
        "import { Dict, List } from './base/types.js';\n" +
        'export default class ex extends Exchange {\n' +
        body ('pos', read, read) +
        body ('escapes', read, "            id = { 'info': response };\n") +
        body ('nilTest', read, '            if (response === undefined) {\n                return undefined;\n            }\n' + read) +
        body ('nested', read, read, '        const response = await this.privateGetB (params);\n        id = this.safeString (response, \'x\');\n') +
        '}\n';
    const API = 'package ccxt\n\n' +
        'func (this *Ex) PrivateGetA(args ...any) <-chan EndpointResult[map[string]any] {\n\treturn nil\n}\n' +
        'func (this *Ex) PrivateGetB(args ...any) <-chan EndpointResult[map[string]any] {\n\treturn nil\n}\n';
    let out = '';
    const fn = (name: string) => {
        const start = out.indexOf ('func (this *ex) ' + name + 'Body(');
        const next = out.indexOf ('\nfunc ', start + 1);
        return out.slice (start, (next < 0) ? out.length : next);
    };
    beforeAll (() => {
        const tmp = fs.mkdtempSync (path.join (os.tmpdir (), 'h27a14-'));
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
    test ('positive: each branch binds the typed map receive', () => {
        expect (fn ('pos')).toContain ('var response map[string]any = (<-this.PrivateGetA(params)).Checked()\n');
        expect (fn ('pos')).toContain ('var response map[string]any = (<-this.PrivateGetB(params)).Checked()\n');
        expect (fn ('pos')).not.toContain ('response := (<-');
    });
    test ('negative: a branch whose local escapes as a value keeps that box', () => {
        expect (fn ('escapes')).toContain ('response := (<-this.PrivateGetB(params)).Raw\n');
    });
    test ('negative: a nil-tested branch local keeps the box', () => {
        expect (fn ('nilTest')).toContain ('response := (<-this.PrivateGetB(params)).Raw\n');
    });
    test ('negative: a function-level binding of the same name keeps every box', () => {
        expect (fn ('nested')).not.toContain ('\t\tvar response map[string]any');
    });
});
