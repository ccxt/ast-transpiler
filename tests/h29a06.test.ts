import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

// h29a06 // a no-default safeDict with a literal key on a decoded endpoint response the printer declares map[string]any
// prints the comma-ok map read; a written, escaping, rebound or parameter receiver keeps the wrap.
describe ('h29a06: row parameter of a venue parse method is JSON-origin by the every-caller proof', () => {
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
        '    keep (o: any): any {\n        return o;\n    }\n' +
        '    parseBar (o: Dict): any {\n        return o;\n    }\n    parseBars (xs: any[]): any {\n        return this.parseBar (xs[0]);\n    }\n' +
        '    parseBalance (o: Dict): any {\n        return o;\n    }\n}\n';
    const VENUE =
        "import Exchange from './abstract/ex.js';\n" +
        "import { Dict } from './base/types.js';\n" +
        'export default class ex extends Exchange {\n' +
        "    async pos (params = {}) {\n        const response = await this.publicGetD (params);\n        return this.parseBalance (response);\n    }\n" +
        "    parseBalance (fee: Dict) {\n        const data = this.safeDict (fee, 'data');\n        if (data === undefined) {\n            return undefined;\n        }\n        return { 'info': fee, 'id': this.safeString (data, 'id') };\n    }\n" +
        "    async two (params = {}) {\n        const response = await this.publicGetD (params);\n        return this.parseTwo (response);\n    }\n" +
        "    other (params = {}) {\n        return this.parseTwo (params);\n    }\n" +
        "    parseTwo (fee: Dict) {\n        const data = this.safeDict (fee, 'data');\n        return this.safeString (data, 'id');\n    }\n" +
        "    async wr (params = {}) {\n        const response = await this.publicGetD (params);\n        return this.parseWr (response);\n    }\n" +
        "    parseWr (fee: Dict) {\n        fee['x'] = 1;\n        const data = this.safeDict (fee, 'data');\n        return this.safeString (data, 'id');\n    }\n" +
        "    async nl (params = {}) {\n        const response = await this.publicGetD (params);\n        return this.parseNl (response);\n    }\n" +
        "    parseNl (fee: Dict) {\n        const data = this.safeDict (fee, 'data');\n        if (data === undefined) {\n            return undefined;\n        }\n        return this.safeString (data, 'id');\n    }\n" +
        "    async bar (params = {}) {\n        const response = await this.publicGetD (params);\n        return this.parseBar (response);\n    }\n" +
        "    parseBar (fee: Dict) {\n        const data = this.safeDict (fee, 'data');\n        return this.safeString (data, 'id');\n    }\n" +
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
        const tmp = fs.mkdtempSync (path.join (process.env.TMPDIR || os.tmpdir (), 'h29a06-'));
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
    test ('positive: a parse row parameter every caller feeds a decoded response reads by comma-ok (fails on the base printer)', () => {
        expect (fn ('ParseBalance')).toContain ('var data, _ = fee["data"].(map[string]any)\n');
        expect (fn ('ParseBalance')).not.toContain ('SafeMapTyped(');
    });
    test ('nil-tested result keeps the nil test on the typed map', () => {
        expect (fn ('ParseBalance')).toContain ('var data, _ = fee["data"].(map[string]any)\n');
        expect (fn ('ParseBalance')).toContain ('data == nil');
    });
    test ('negative: one caller passes the user params bag, so no assertion is printed', () => {
        expect (fn ('ParseTwo')).not.toContain ('fee["data"].(');
    });
    test ('negative: a parameter written through prints no assertion', () => {
        // a typed map receiver reads by assertion whatever its origin (h32-R01)
        expect (fn ('ParseWr')).toContain ('fee["data"].(');
    });
    test ('negative: a base file calls the method with a loop element, so no assertion is printed', () => {
        expect (fn ('ParseBar')).not.toContain ('fee["data"].(');
    });
});
