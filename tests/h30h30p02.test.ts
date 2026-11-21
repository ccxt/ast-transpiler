import { Transpiler, installCcxtGoHooks } from '../src/transpiler';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// gemini / polymarket withdraw: an endpoint `response` that also reaches `this.json` under a literal guard, or is
// `this.omit`-ed straight into a parser, still receives the typed map view
const ABSTRACT =
    "import { Dict } from '../base/types.js';\n" +
    "import { Exchange as _Exchange } from '../base/Exchange.js';\n" +
    'abstract class Exchange extends _Exchange {\n' +
    '    privatePostW (params = {}): Promise<Dict> {\n        return this.request ("w", [ "private" ], "POST", params);\n    }\n}\n' +
    'export default Exchange;\n';
const TYPES = 'export type Dict = { [key: string]: any };\n';
const BASE =
    "import { Dict } from './types.js';\n" +
    'export class Exchange {\n    request (path: string, api: string[], method: string, params: Dict = {}): Promise<any> {\n        return undefined;\n    }\n' +
    '    safeString (o: any, k: string): string {\n        return k;\n    }\n' +
    '    json (o: any): string {\n        return "";\n    }\n' +
    '    omit (o: any, ...k: any[]): any {\n        return o;\n    }\n' +
    '    parseTransaction (t: Dict): Dict {\n        return t;\n    }\n' +
    '    keep (o: any): any {\n        return o;\n    }\n}\n';
const API = 'package ccxt\n\n// PrivatePostW returns a channel that yields a JSON object.\n' +
    'func (this *Ex) PrivatePostW(args ...any) <-chan EndpointResult[map[string]any] {\n\treturn nil\n}\n';

function print (body: string): string {
    const tmp = fs.mkdtempSync (path.join (os.tmpdir (), 'h30p02-'));
    try {
        const src = path.join (tmp, 'ts', 'src');
        fs.mkdirSync (path.join (src, 'base'), { 'recursive': true });
        fs.mkdirSync (path.join (src, 'abstract'), { 'recursive': true });
        fs.mkdirSync (path.join (tmp, 'go', 'v4'), { 'recursive': true });
        fs.writeFileSync (path.join (src, 'base', 'types.ts'), TYPES);
        fs.writeFileSync (path.join (src, 'base', 'Exchange.ts'), BASE);
        fs.writeFileSync (path.join (src, 'abstract', 'ex.ts'), ABSTRACT);
        fs.writeFileSync (path.join (tmp, 'go', 'v4', 'ex_api.go'), API);
        fs.writeFileSync (path.join (src, 'ex.ts'), "import Exchange from './abstract/ex.js';\nexport default class ex extends Exchange {\n" + body + '}\n');
        const t = new Transpiler ({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 }, 'asyncMethodSuffix': 'Async', 'asyncSuffixExemptPaths': [ '(^|/)ts/src/abstract/' ] } });
        installCcxtGoHooks (t.goTranspiler);
        return t.transpileGoByPath (path.join (src, 'ex.ts')).content;
    } finally {
        fs.rmSync (tmp, { 'recursive': true, 'force': true });
    }
}

const guarded = (cond: string, extra = '') =>
    '    async withdraw (params = {}) {\n' +
    '        const response = await this.privatePostW (params);\n' +
    "        const result = this.safeString (response, 'result');\n" +
    extra +
    '        if (' + cond + ') {\n' +
    "            throw new Error ('failed: ' + this.json (response));\n" +
    '        }\n' +
    '        return this.parseTransaction (response);\n' +
    '    }\n';

const omitted = (use: string) =>
    '    async withdraw (params = {}) {\n' +
    '        const response = await this.privatePostW (params);\n' +
    "        const stripped = this.omit (response, 'status');\n" +
    use +
    '    }\n';

describe ('h30-P02 endpoint receive readers', () => {
    test ('json(x) under a safeString literal guard keeps the typed receive', () => {
        const out = print (guarded ("result === 'error'"));
        expect (out).toMatch (/var response map\[string\]any = /);
    });
    test ('json(x) without the literal guard keeps the box', () => {
        const out = print (guarded ('result !== undefined'));
        expect (out).not.toMatch (/var response map\[string\]any = /);
    });
    test ('a guard on a local that is not a safeString of x keeps the box', () => {
        const out = print (guarded ("other === 'error'", "        const other = this.keep (params);\n"));
        expect (out).not.toMatch (/var response map\[string\]any = /);
    });
    test ('omit of the receive handed only to a parser keeps the typed receive', () => {
        const out = print (omitted ('        return this.parseTransaction (stripped);\n'));
        expect (out).toMatch (/var response map\[string\]any = /);
    });
    test ('omit whose result escapes elsewhere keeps the box', () => {
        const out = print (omitted ('        return this.keep (stripped);\n'));
        expect (out).not.toMatch (/var response map\[string\]any = /);
    });
});
