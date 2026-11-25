import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

// a Dict endpoint receive read as a map and stored as `info` binds a holder: reads use the typed Value, info the raw box
describe ('h28a17: endpoint receive also stored as info', () => {
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
        '    async pos (params = {}) {\n' +
        '        const response = await this.privateGetA (params);\n' +
        "        const data = this.safeDict (response, 'data');\n" +
        "        return { 'info': response, 'id': this.safeString (data, 'id') };\n    }\n" +
        '    async infoOnly (params = {}) {\n' +
        '        const response = await this.privateGetA (params);\n' +
        "        return { 'info': response };\n    }\n" +
        '    async otherKey (params = {}) {\n' +
        '        const response = await this.privateGetA (params);\n' +
        "        return { 'raw': response, 'id': this.safeString (response, 'id') };\n    }\n" +
        '    async nilTest (params = {}) {\n' +
        '        const response = await this.privateGetA (params);\n' +
        '        if (response === undefined) {\n            return undefined;\n        }\n' +
        "        return { 'info': response, 'id': this.safeString (response, 'id') };\n    }\n" +
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
    test ('positive: reads use the typed Value, info stores the raw box', () => {
        expect (fn ('pos')).toContain ('responseReply := (<-this.PrivateGetA(params))\n');
        expect (fn ('pos')).toContain ('PanicOnError(responseReply.Raw)\n');
        expect (fn ('pos')).toContain ('var response map[string]any = responseReply.Value\n');
        expect (fn ('pos')).toContain ('"info": responseReply.Raw');
        expect (fn ('pos')).not.toContain ('response := (<-');
    });
    test ('negative: info as the only use prints no holder', () => {
        expect (fn ('infoOnly')).not.toContain ('responseReply');
    });
    test ('negative: a non-info value slot never stores the typed map', () => {
        expect (fn ('otherKey')).not.toContain ('responseReply');
        expect (fn ('otherKey')).not.toContain ('var response map[string]any');
    });
    test ('negative: a nil test never sees the typed map', () => {
        expect (fn ('nilTest')).not.toContain ('var response map[string]any');
    });
});
