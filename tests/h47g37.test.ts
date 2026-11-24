import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

// a literal-key safeList with a `[]` default on a read-only literal-key safeDict hop of an awaited map endpoint
// prints the comma-ok read plus the empty default; written, escaping hops and non-empty defaults keep the wrap
describe ('h47g37: list read on a safeDict hop of an endpoint map', () => {
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
        '    safeString (o: any, k: any, d: Str = undefined): Str {\n        return d;\n    }\n' +
        '    parseNumber (o: any): number {\n        return 0;\n    }\n' +
        '    keep (o: any): any {\n        return o;\n    }\n}\n';
    const method = (name: string, lines: string[]) => '    async ' + name + ' (params = {}) {\n'
        + lines.map ((l) => '        ' + l + '\n').join ('') + '    }\n';
    const VENUE =
        "import Exchange from './abstract/ex.js';\n" +
        "import { Dict, List } from './base/types.js';\n" +
        'export default class ex extends Exchange {\n' +
        method ('hop', [ 'const response = await this.publicGetD (params);', "const data = this.safeDict (response, 'result', {});", "const cur = this.safeDict (data, 'cur', {});", "const fee = this.safeString (cur, 'f');", "const rows = this.safeList (data, 'rows', []);", 'return [ rows, fee ];' ]) +
        method ('hopLater', [ 'const response = await this.publicGetD (params);', "const data = this.safeDict (response, 'result', {});", "const rows = this.safeList (data, 'rows', []);", "const out: Dict = { 'info': response };", 'this.keep (out);', 'return rows;' ]) +
        method ('hopEarly', [ 'const response = await this.publicGetD (params);', "const data = this.safeDict (response, 'result', {});", 'this.keep (response);', "const rows = this.safeList (data, 'rows', []);", 'return rows;' ]) +
        method ('hopWritten', [ 'const response = await this.publicGetD (params);', "const data = this.safeDict (response, 'result', {});", "data['x'] = 1;", "const rows = this.safeList (data, 'rows', []);", 'return rows;' ]) +
        method ('hopEscapes', [ 'const response = await this.publicGetD (params);', "const data = this.safeDict (response, 'result', {});", 'this.keep (data);', "const rows = this.safeList (data, 'rows', []);", 'return rows;' ]) +
        method ('hopNonEmpty', [ 'const response = await this.publicGetD (params);', "const data = this.safeDict (response, 'result', {});", "const rows = this.safeList (data, 'rows', [ 1 ]);", 'return rows;' ]) +
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
        const tmp = fs.mkdtempSync (path.join (process.env.TMPDIR || os.tmpdir (), 'h47g37-'));
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
    test ('positive: literal-key list read on a read-only safeDict hop (already native on the base printer)', () => {
        expect (fn ('hop')).toContain ('rows, _ = data["rows"].([]any)');
        expect (fn ('hop')).toContain ('if rows == nil {');
        expect (fn ('hop')).not.toContain ('SafeListSlice');
    });
    test ('positive: the root escapes only after the read (fails on the base printer)', () => {
        expect (fn ('hopLater')).toContain ('rows, _ = data["rows"].([]any)');
    });
    test ('negative: the root escapes before the read keeps the wrap', () => {
        expect (fn ('hopEarly')).not.toContain ('data["rows"].(');
    });
    test ('negative: a written hop keeps the wrap', () => {
        expect (fn ('hopWritten')).not.toContain ('data["rows"].(');
    });
    test ('negative: a hop handed to a callee keeps the wrap', () => {
        expect (fn ('hopEscapes')).not.toContain ('data["rows"].(');
    });
    test ('negative: a non-empty default keeps the wrap', () => {
        expect (fn ('hopNonEmpty')).not.toContain ('data["rows"].(');
    });
});
