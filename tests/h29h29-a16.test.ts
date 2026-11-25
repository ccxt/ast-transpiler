import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

// a Dict endpoint receive read as a map and stored as `info` binds a holder: reads use the typed Value, info the raw box
// an endpoint receive whose name is redeclared in a sibling scope keeps its JSON-origin proof by resolved declaration
describe ('h29a16: JSON origin of same-named endpoint receives in sibling scopes', () => {
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
        '    safeDict (o: any, k: any, d: Dict = undefined): Dict {\n        return o;\n    }\n    safeList (o: any, k: any, d: List = undefined): List {\n        return o;\n    }\n}\n';
    const VENUE =
        "import Exchange from './abstract/ex.js';\n" +
        "import { Dict, List } from './base/types.js';\n" +
        'export default class ex extends Exchange {\n' +
        '    async pos (tags: any[], params = {}) {\n' +
        '        for (let ti = 0; ti < tags.length; ti++) {\n' +
        "            const seriesResponse = await this.privateGetA ({ 'tags': tags[ti] });\n" +
        "            const seriesList = this.safeList (seriesResponse, 'series');\n" +
        "            const x = this.safeString (seriesList, 0);\n" +
        '        }\n' +
        "        if (params['c'] !== undefined) {\n" +
        "            const seriesResponse = await this.privateGetA ({ 'c': 1 });\n" +
        "            const seriesList = this.safeList (seriesResponse, 'series');\n" +
        "            const y = this.safeString (seriesList, 0);\n" +
        '        }\n        return 1;\n    }\n' +
        '    async written (params = {}) {\n' +
        "        if (params['c'] !== undefined) {\n" +
        '            const response = await this.privateGetA (params);\n' +
        "            response['x'] = 1;\n" +
        "            const found = this.safeList (response, 'markets');\n" +
        '            return found;\n        }\n' +
        '        const response = await this.privateGetA (params);\n' +
        "        return this.safeList (response, 'markets');\n    }\n" +
        '    async escapes (params = {}) {\n' +
        "        if (params['c'] !== undefined) {\n" +
        '            const response = await this.privateGetA (params);\n' +
        '            this.mutate (response);\n' +
        "            const found = this.safeList (response, 'markets');\n" +
        '            return found;\n        }\n' +
        '        const response = await this.privateGetA (params);\n' +
        "        return this.safeList (response, 'markets');\n    }\n" +
        '    mutate (o: any) {\n        return o;\n    }\n' +
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
        const tmp = fs.mkdtempSync (path.join (os.tmpdir (), 'h29a16-'));
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
    test ('positive: both sibling receives read the list with the comma-ok assertion', () => {
        const body = fn ('pos');
        expect (body.split ('seriesList, _ = seriesResponse["series"].([]any)').length - 1).toBe (2);
        expect (body).not.toContain ('SafeListTyped(seriesResponse');
    });
    test ('negative: a receive written through keeps the wrap', () => {
        expect (fn ('written')).toContain ('SafeListTyped(response, "markets")');
        expect (fn ('written')).not.toContain ('response["markets"].([]any)');
    });
    test ('negative: a receive handed to a callee keeps the wrap', () => {
        expect (fn ('escapes')).toContain ('SafeListTyped(response, "markets")');
        expect (fn ('escapes')).not.toContain ('response["markets"].([]any)');
    });
});
