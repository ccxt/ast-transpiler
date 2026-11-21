import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

// a Dict endpoint receive (or a joined endpoint local) used as its own safeDict default reads with the comma-ok form
describe ('h29a17: endpoint receive used as its own safeDict default', () => {
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
    const VENUE =
        "import Exchange from './abstract/ex.js';\n" +
        "import { Dict, List } from './base/types.js';\n" +
        'export default class ex extends Exchange {\n' +
        '    async recv (params = {}) {\n' +
        '        const response = await this.privateGetA (params);\n' +
        "        const data = this.safeDict (response, 'data', response);\n" +
        "        return this.safeString (data, 'id');\n    }\n" +
        '    async joined (params = {}) {\n' +
        '        let response = undefined;\n' +
        "        if (this.safeString (params, 'x') !== undefined) {\n            response = await this.privateGetA (params);\n        } else {\n            response = await this.privateGetB (params);\n        }\n" +
        "        const data = this.safeDict (response, 'data', response);\n" +
        "        return this.safeString (data, 'id');\n    }\n" +
        '    async written (params = {}) {\n' +
        '        const response = await this.privateGetA (params);\n' +
        "        const data = this.safeDict (response, 'data', response);\n" +
        "        data['k'] = 1;\n" +
        "        return this.safeString (data, 'id');\n    }\n" +
        '    async otherDefault (params = {}) {\n' +
        '        const response = await this.privateGetA (params);\n' +
        "        const data = this.safeDict (response, 'data', params);\n" +
        "        return this.safeString (data, 'id');\n    }\n" +
        '    async escapes (params = {}) {\n' +
        '        const response = await this.privateGetA (params);\n' +
        "        const data = this.safeDict (response, 'data', response);\n" +
        "        return [ response, this.safeString (data, 'id') ];\n    }\n" +
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
    test ('positive: a typed receive used as its own default reads through the holder Value', () => {
        expect (fn ('recv')).toContain ('responseReply := (<-this.PrivateGetA(params))\n');
        expect (fn ('recv')).toContain ('var response map[string]any = responseReply.Value\n');
        expect (fn ('recv')).toContain ('data, _ = response["data"].(map[string]any)\n');
        expect (fn ('recv')).toContain ('if data == nil {\n\t\tdata = response\n');
        expect (fn ('recv')).not.toContain ('SafeDictMap');
    });
    test ('positive: a joined endpoint local used as its own default', () => {
        expect (fn ('joined')).toContain ('data, _ = response["data"].(map[string]any)\n');
        expect (fn ('joined')).not.toContain ('SafeDictMap');
    });
    test ('negative: a result written through keeps the wrap form', () => {
        expect (fn ('written')).not.toContain ('response["data"].(map[string]any)');
    });
    test ('negative: a fallback other than the receiver', () => {
        expect (fn ('otherDefault')).not.toContain ('responseReply');
        expect (fn ('otherDefault')).not.toContain ('= response\n');
    });
    test ('negative: a receiver that escapes as a value is not typed', () => {
        expect (fn ('escapes')).not.toContain ('responseReply');
        expect (fn ('escapes')).not.toContain ('response["data"].(map[string]any)');
    });
});
