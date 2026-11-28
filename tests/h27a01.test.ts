import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

// a no-default safeDict with a literal key on a decoded endpoint response the printer declares map[string]any
// prints the comma-ok map read; a written, escaping, rebound or parameter receiver keeps the wrap.
describe ('h27a01: JSON-origin map receiver, literal key, comma-ok map read', () => {
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
        '    keep (o: any): any {\n        return o;\n    }\n}\n';
    const method = (name: string, lines: string[]) => '    async ' + name + ' (params = {}) {\n'
        + lines.map ((l) => '        ' + l + '\n').join ('') + '    }\n';
    const read = "const data = this.safeDict (response, 'data');";
    const VENUE =
        "import Exchange from './abstract/ex.js';\n" +
        "import { Dict } from './base/types.js';\n" +
        'export default class ex extends Exchange {\n' +
        method ('pos', [ 'const response = await this.publicGetD (params);', read, "return this.safeString (data, 'id');" ]) +
        method ('posDefault', [ 'const response = await this.publicGetD (params);', "const data = this.safeDict (response, 'data', {});", "return this.safeString (data, 'id');" ]) +
        method ('posAs', [ 'const response = await this.publicGetD (params);', "const data = this.safeDict (response, 'data') as Dict;", "return this.safeString (data, 'id');" ]) +
        method ('writtenAs', [ 'const response = await this.publicGetD (params);', "response['x'] = 1;", "const data = this.safeDict (response, 'data') as Dict;", "return this.safeString (data, 'id');" ]) +
        method ('posNil', [ 'const response = await this.publicGetD (params);', read, 'if (data === undefined) {', '    return undefined;', '}', "return this.safeString (data, 'id');" ]) +
        method ('written', [ 'const response = await this.publicGetD (params);', "response['x'] = 1;", read, "return this.safeString (data, 'id');" ]) +
        method ('escapes', [ 'const response = await this.publicGetD (params);', 'this.keep (response);', read, "return this.safeString (data, 'id');" ]) +
        method ('listResponse', [ 'const response = await this.publicGetL (params);', "const data = this.safeDict (response, 0);", "return this.safeString (data, 'id');" ]) +
        method ('paramKey', [ 'const response = await this.publicGetD (params);', "const k = this.safeString (params, 'k');", 'const data = this.safeDict (response, k);', "return this.safeString (data, 'id');" ]) +
        '    parse (response: Dict) {\n        ' + read + "\n        return this.safeString (data, 'id');\n    }\n" +
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
        const tmp = fs.mkdtempSync (path.join (process.env.TMPDIR || os.tmpdir (), 'h27a01-'));
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
    test ('positive: a member of a decoded response reads by comma-ok assertion (fails on the base printer)', () => {
        expect (fn ('pos')).toMatch (/var response map\[string\]any = /);
        expect (fn ('pos')).toContain ('var data, _ = response["data"].(map[string]any)\n');
        expect (fn ('pos')).not.toContain ('SafeMapTyped(');
    });
    test ('positive: the empty-object default reads the same way', () => {
        expect (fn ('posDefault')).toContain ('var data, _ = response["data"].(map[string]any)\n');
    });
    test ('positive: an `as Dict` no-default read prints the same comma-ok read (fails on the base printer)', () => {
        expect (fn ('posAs')).toContain ('var data, _ = response["data"].(map[string]any)\n');
        expect (fn ('posAs')).not.toContain ('SafeMapTyped(');
    });
    test ('negative: an `as Dict` read of a written response keeps the wrap', () => {
        expect (fn ('writtenAs')).not.toContain ('.(map[string]any)');
    });
    test ('nil-tested result: the typed map keeps the nil answer', () => {
        expect (fn ('posNil')).toContain ('var data, _ = response["data"].(map[string]any)\n');
        expect (fn ('posNil')).toContain ('data == nil');
    });
    test ('negative: a written response keeps the wrap', () => {
        expect (fn ('written')).not.toContain ('.(map[string]any)');
    });
    test ('negative: a response handed to another method keeps the wrap', () => {
        expect (fn ('escapes')).not.toContain ('.(map[string]any)');
    });
    test ('negative: a list response and a non-literal key keep their reads', () => {
        expect (fn ('listResponse')).toContain ('data, _ = response[0].(map[string]any)');
        // H30-A08 owns the *string-key read: nil-guarded comma-ok, never the wrap and never an unguarded dereference
        expect (fn ('paramKey')).toContain ('\tif k != nil {\n\t\tdata, _ = response[*k].(map[string]any)\n\t}');
        expect (fn ('paramKey')).not.toContain ('SafeMapTyped(');
    });
    test ('negative: a parameter receiver keeps the wrap', () => {
        expect (fn ('parse')).not.toContain ('.(map[string]any)');
    });
});
