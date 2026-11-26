import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

// `let r: Dict = {}` whose every write is an awaited Dict endpoint joins like a nil seed: `var r map[string]any = map[string]any{}`,
// the writes read the typed Value and a literal-key safeDict of r prints the comma-ok read. Other seeds or writes keep the box.
describe ('h54g58: a `{}`-seeded local written only by awaited map endpoints is a typed map', () => {
    const ABSTRACT =
        "import { Dict, List } from '../base/types.js';\n" +
        "import { Exchange as _Exchange } from '../base/Exchange.js';\n" +
        'abstract class Exchange extends _Exchange {\n' +
        '    publicGetD (params = {}): Promise<Dict> {\n        return this.request ("d", [ "public" ], "GET", params);\n    }\n\n' +
        '    publicGetL (params = {}): Promise<List> {\n        return this.request ("l", [ "public" ], "GET", params);\n    }\n}\n' +
        'export default Exchange;\n';
    const TYPES = 'export type Dict = { [key: string]: any };\nexport type List = any[];\nexport type Str = string | undefined;\nexport type NullableDict = Dict | undefined;\n';
    const BASE =
        "import { Dict, List, Str } from './types.js';\n" +
        'export class Exchange {\n    request (path: string, api: string[], method: string, params: Dict = {}): Promise<any> {\n        return undefined;\n    }\n' +
        '    safeDict (o: any, k: any, d: Dict = undefined): Dict {\n        return o;\n    }\n' +
        '    safeString (o: any, k: any, d: Str = undefined): Str {\n        return d;\n    }\n' +
        '    keep (o: any): any {\n        return o;\n    }\n}\n';
    const method = (name: string, lines: string[]) => '    async ' + name + ' (params = {}) {\n'
        + lines.map ((l) => '        ' + l + '\n').join ('') + '    }\n';
    const read = "const data = this.safeDict (response, 'data');";
    const body = (seed: string, tail: string[]) => [ 'let response: Dict = ' + seed + ';', 'if (params[\'a\'] === 1) {', '    response = await this.publicGetD (params);', '} else {', '    response = await this.publicGetD (params);', '}', ...tail ];
    const VENUE =
        "import Exchange from './abstract/ex.js';\n" +
        "import { Dict, NullableDict } from './base/types.js';\n" +
        'export default class ex extends Exchange {\n' +
        method ('seedEmpty', body ('{}', [ "const result = this.safeDict (response, 'result', {});", "return this.safeString (result, 'id');" ])) +
        method ('seedEmptyInfo', body ('{}', [ "const result = this.safeDict (response, 'result', {});", "return { 'info': response, 'id': this.safeString (result, 'id') };" ])) +
        method ('seedFull', body ("{ 'a': 1 }", [ "const result = this.safeDict (response, 'result', {});", "return this.safeString (result, 'id');" ])) +
        method ('foreignWrite', [ 'let response: Dict = {};', 'if (params[\'a\'] === 1) {', '    response = await this.publicGetD (params);', '} else {', "    response = this.safeDict (params, 'x', {});", '}', "const result = this.safeDict (response, 'result', {});", "return this.safeString (result, 'id');" ]) +
        method ('listWrite', body ('{}', []).map ((l, i) => (i === 4) ? '    response = await this.publicGetL (params);' : l).concat ([ "return this.safeString (response, 'id');" ])) +
        method ('boxedUse', body ('{}', [ "const data = this.safeDict (response, 'data', {});", "const kept = this.keep (response);", "return this.safeString (data, 'id');" ])) +
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
        const tmp = fs.mkdtempSync (path.join (process.env.TMPDIR || os.tmpdir (), 'h54g58-'));
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
    test ('positive: the `{}` seed is a typed map, the writes read the typed Value (fails on the base printer)', () => {
        expect (fn ('seedEmpty')).toContain ('\tvar response map[string]any = map[string]any{}\n');
        expect (fn ('seedEmpty')).toContain ('\t\tresponse = (<-this.PublicGetD(params)).Checked()\n');
        expect (fn ('seedEmpty')).toContain ('\tvar result, _ = response["result"].(map[string]any)\n');
        expect (fn ('seedEmpty')).not.toContain ('var response any');
    });
    test ('positive: an info slot keeps the typed map', () => {
        expect (fn ('seedEmptyInfo')).toContain ('\tvar response map[string]any = map[string]any{}\n');
        expect (fn ('seedEmptyInfo')).toContain ('"info": response,');
    });
    test ('negative: a non-empty seed keeps the box', () => {
        expect (fn ('seedFull')).not.toContain ('var response map[string]any');
    });
    test ('negative: a non-endpoint write keeps the box', () => {
        expect (fn ('foreignWrite')).not.toContain ('var response map[string]any = map[string]any{}');
    });
    test ('negative: a list endpoint write keeps the box', () => {
        expect (fn ('listWrite')).not.toContain ('var response map[string]any');
    });
    test ('negative: when the walk keeps the declaration boxed, no read indexes it as a map', () => {
        const f = fn ('boxedUse');
        if (f.includes ('var response any')) { expect (f).not.toContain ('response["data"]'); } else { expect (f).toContain ('var response map[string]any'); }
    });
});
