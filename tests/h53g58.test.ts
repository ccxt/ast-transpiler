import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

// an assignment of a literal-key safeDict of a decoded endpoint map into a map local prints the comma-ok read
// (plus the `{}` default); a written receiver, a variable key or a non-empty default keeps the wrap.
describe ('h53g58: `m = this.safeDict (R, k)` assignment on a decoded map, comma-ok read', () => {
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
    const m = (name: string, read: string, extra: string[] = []) => method (name, [ 'let response: NullableDict = undefined;', 'let data: NullableDict = undefined;',
        'if (params[\'a\'] === 1) {', '    response = await this.publicGetD (params);', ...extra, '    data = ' + read + ';', '} else {',
        '    response = await this.publicGetD (params);', '    data = ' + read + ';', '}', "return this.safeString (data, 'id');" ]);
    const VENUE =
        "import Exchange from './abstract/ex.js';\n" +
        "import { Dict, NullableDict } from './base/types.js';\n" +
        'export default class ex extends Exchange {\n' +
        m ('posDefault', "this.safeDict (response, 'data', {})") +
        m ('posNoDefault', "this.safeDict (response, 'data')") +
        m ('written', "this.safeDict (response, 'data', {})", [ "    response['x'] = 1;" ]) +
        m ('varKey', "this.safeDict (response, this.safeString (params, 'k'), {})") +
        m ('nonEmpty', "this.safeDict (response, 'data', { 'x': 1 })") +
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
        const tmp = fs.mkdtempSync (path.join (process.env.TMPDIR || os.tmpdir (), 'h53g58-'));
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
    test ('positive: `{}` default prints the comma-ok read and the empty-map default (fails on the base printer)', () => {
        expect (fn ('posDefault')).toContain ('\t\tdata, _ = response["data"].(map[string]any)\n\t\tif data == nil {\n\t\t\tdata = map[string]any{}\n\t\t}');
        expect (fn ('posDefault')).not.toContain ('SafeDictMap(response');
    });
    test ('positive: no default prints the bare comma-ok read (nil for missing / wrong kind)', () => {
        expect (fn ('posNoDefault')).toContain ('\t\tdata, _ = response["data"].(map[string]any)\n');
        expect (fn ('posNoDefault')).not.toContain ('data = map[string]any{}');
    });
    test ('negative: a written response keeps the reader', () => {
        expect (fn ('written')).not.toContain ('response["data"].(');
    });
    test ('negative: a variable key keeps the reader', () => {
        expect (fn ('varKey')).not.toContain ('].(map[string]any)');
    });
    test ('negative: a non-empty default keeps the reader', () => {
        expect (fn ('nonEmpty')).not.toContain ('response["data"].(');
    });
});
