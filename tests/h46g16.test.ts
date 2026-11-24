import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

// h46g16 // a `{}`-defaulted safeDict row of a joined awaited-endpoint map local read by an Object.keys element
// prints the comma-ok key read at a parseTicker argument; an untyped join keeps the wrap.
describe ('h46g16: parseTicker row of a joined awaited-endpoint map local', () => {
    const ABSTRACT =
        "import { Dict } from '../base/types.js';\n" +
        "import { Exchange as _Exchange } from '../base/Exchange.js';\n" +
        'abstract class Exchange extends _Exchange {\n' +
        '    publicGetA (params = {}): Promise<Dict> {\n        return this.request ("a", [ "public" ], "GET", params);\n    }\n\n' +
        '    publicGetB (params = {}): Promise<Dict> {\n        return this.request ("b", [ "public" ], "GET", params);\n    }\n}\n' +
        'export default Exchange;\n';
    const TYPES = 'export type Dict = { [key: string]: any };\nexport type Str = string | undefined;\n';
    const BASE =
        "import { Dict, Str } from './types.js';\n" +
        'export class Exchange {\n    request (path: string, api: string[], method: string, params: Dict = {}): Promise<any> {\n        return undefined;\n    }\n' +
        '    safeDict (o: any, k: any, d: Dict = undefined): Dict {\n        return o;\n    }\n' +
        '    safeList (o: any, k: any, d: any[] = undefined): any[] {\n        return d;\n    }\n' +
        '    safeString (o: any, k: any, d: Str = undefined): Str {\n        return d;\n    }\n' +
        '    parseTicker (ticker: Dict, market: any = undefined): Dict {\n        return ticker;\n    }\n}\n';
    const loop = (name: string, decl: string, other: string, write = '') =>
        `    async ${name} (params: Dict = {}) {\n` +
        `        ${decl}\n` +
        "        if (this.safeString (params, 'm') === 'a') {\n" +
        '            response = await this.publicGetA (params);\n' +
        '        } else {\n' +
        `            response = ${other};\n` +
        '        }\n' +
        "        const resultList = this.safeList (response, 'result');\n" +
        '        if (resultList !== undefined) {\n            return resultList;\n        }\n' +
        write +
        '        const marketIds = Object.keys (response);\n' +
        '        const result: Dict = {};\n' +
        '        for (let i = 0; i < marketIds.length; i++) {\n' +
        '            const marketId = marketIds[i];\n' +
        '            const ticker = this.parseTicker (this.safeDict (response, marketId, {}), undefined);\n' +
        "            result[marketId] = ticker;\n" +
        '        }\n' +
        '        return result;\n' +
        '    }\n';
    const VENUE =
        "import Exchange from './abstract/ex.js';\n" +
        "import { Dict } from './base/types.js';\n" +
        'export default class ex extends Exchange {\n' +
        loop ('pos', 'let response: Dict;', 'await this.publicGetB (params)') +
        loop ('bare', 'let response = undefined;', 'await this.publicGetB (params)') +
        loop ('anyjoin', 'let response: Dict;', 'params') +
        loop ('written', 'let response: Dict;', 'await this.publicGetB (params)', "        response['x'] = 1;\n") +
        '}\n';
    const API = 'package ccxt\n\n' +
        'func (this *Ex) PublicGetA(args ...any) <-chan EndpointResult[map[string]any] {\n\treturn nil\n}\n' +
        'func (this *Ex) PublicGetB(args ...any) <-chan EndpointResult[map[string]any] {\n\treturn nil\n}\n';
    let out = '';
    const fn = (name: string) => {
        const start = out.indexOf ('func (this *ex) ' + name + 'Body(');
        const next = out.indexOf ('\nfunc ', start + 1);
        return out.slice (start, (next < 0) ? out.length : next);
    };
    beforeAll (() => {
        const tmp = fs.mkdtempSync (path.join (process.env.TMPDIR || os.tmpdir (), 'h46g16-'));
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
    test ('positive: a Dict-annotated endpoint join read by an Object.keys element prints the comma-ok key read', () => {
        expect (fn ('pos')).toMatch (/(responseDict\d+), _ := response\[marketId\]\.\(map\[string\]any\)\n\s*if \1 == nil \{\n\s*\1 = map\[string\]any\{\}/);
        expect (fn ('pos')).not.toContain ('SafeDictMap(response');
    });
    test ('positive: an undefined-seeded endpoint join prints the comma-ok key read', () => {
        expect (fn ('bare')).toMatch (/responseDict\d+, _ := response\[marketId\]\.\(map\[string\]any\)/);
    });
    test ('negative: a join with the params bag keeps the wrap', () => {
        expect (fn ('anyjoin')).not.toMatch (/responseDict\d+, _ := response\[/);
    });
    test ('negative: a join written through keeps the wrap', () => {
        expect (fn ('written')).not.toMatch (/responseDict\d+, _ := response\[/);
        expect (fn ('written')).toContain ('SafeDictMap(response, marketId');
    });
});
