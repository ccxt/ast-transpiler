import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

// a []any parameter of an internal method that every caller feeds a decoded JSON list reads its loop rows with the
// comma-ok element assertion; a parameter one caller feeds a built list, or one written through, keeps the wrap
describe ('h29a08: JSON-origin list parameter, every-caller proof', () => {
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
        '    safeList (o: any, k: any, d: List = undefined): List {\n        return o;\n    }\n' +
        '    safeString (o: any, k: any, d: Str = undefined): Str {\n        return d;\n    }\n}\n';
    const LOOP = (fn: string) => `    ${fn} (rows: Dict[]): Dict {\n        const result: Dict = { 'info': rows };\n        for (let i = 0; i < rows.length; i++) {\n            const row = this.safeDict (rows, i);\n            result[this.safeString (row, 'id')] = this.safeString (row, 'v');\n        }\n        return result;\n    }\n`;
    const VENUE =
        "import Exchange from './abstract/ex.js';\n" +
        "import { Dict } from './base/types.js';\n" +
        'export default class ex extends Exchange {\n' +
        '    async direct (params = {}) {\n        const response = await this.publicGetL (params);\n        return this.parseRows (response);\n    }\n' +
        "    async cut (params = {}) {\n        const response = await this.publicGetD (params);\n        const data = this.safeList (response, 'data', []);\n        return this.parseRows (data);\n    }\n" +
        LOOP ('parseRows') +
        "    async mixed (params = {}) {\n        const response = await this.publicGetL (params);\n        return this.parseMixed (response);\n    }\n" +
        "    built (params = {}) {\n        return this.parseMixed ([ params ]);\n    }\n" +
        LOOP ('parseMixed') +
        "    async wr (params = {}) {\n        const response = await this.publicGetL (params);\n        return this.parseWr (response);\n    }\n" +
        "    parseWr (rows: Dict[]): Dict {\n        rows.push ({});\n        const result: Dict = {};\n        for (let i = 0; i < rows.length; i++) {\n            const row = this.safeDict (rows, i);\n            result[this.safeString (row, 'id')] = this.safeString (row, 'v');\n        }\n        return result;\n    }\n" +
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
        const tmp = fs.mkdtempSync (path.join (process.env.TMPDIR || os.tmpdir (), 'h29a08-'));
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
    test ('positive: every caller passes a decoded list, the loop row reads by comma-ok (fails on the base printer)', () => {
        expect (fn ('ParseRows')).toContain ('var row, _ = rows[i].(map[string]any)\n');
        expect (fn ('ParseRows')).not.toContain ('SafeMapTyped(rows, i)');
    });
    test ('one caller passes a built list: the []any receiver still reads natively', () => {
        expect (fn ('ParseMixed')).toContain ('rows[i].(map[string]any)');
    });
    test ('a list parameter written through still reads natively', () => {
        expect (fn ('ParseWr')).toContain ('rows[i].(map[string]any)');
    });
});
