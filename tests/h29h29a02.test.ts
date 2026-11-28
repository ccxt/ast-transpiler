import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

// with a literal key on a decoded endpoint response the printer declares map[string]any
// prints the comma-ok map read; a written, escaping, rebound or parameter receiver keeps the wrap.
// a safeList of an awaited map endpoint whose receive prints `var response map[string]any = ...Checked()` reads by
// comma-ok; elements of that list are bare in a guarded read; written, escaping or parameter receivers keep the wrap
describe ('h29a02: defaulted safeList / safeDict reads of a typed endpoint receive', () => {
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
        method ('listDef', [ 'const response = await this.publicGetD (params);', "const data = this.safeList (response, 'r', []);", 'return data;' ]) +
        method ('dictDef', [ 'const response = await this.publicGetD (params);', "const data = this.safeDict (response, 'd', {});", 'return data;' ]) +
        method ('asDict', [ 'const response = await this.publicGetD (params);', "const data = this.safeDict (response, 'a', {}) as Dict;", 'return data;' ]) +
        method ('nilTested', [ 'const response = await this.publicGetD (params);', "const data = this.safeList (response, 'n', []);", 'if (data === undefined) {', '    return 0;', '}', 'return data.length;' ]) +
        method ('written', [ 'const response = await this.publicGetD (params);', "response['x'] = 1;", "const data = this.safeList (response, 'w', []);", 'return data;' ]) +
        method ('escapes', [ 'const response = await this.publicGetD (params);', 'this.keep (response);', "const data = this.safeDict (response, 'e', {});", 'return data;' ]) +
        method ('nonEmpty', [ 'const response = await this.publicGetD (params);', "const data = this.safeList (response, 'f', [ 1 ]);", 'return data;' ]) +
        '    parse (response: Dict) {\n        const items = this.safeList (response, \'p\', []);\n        return items.length;\n    }\n' +
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
        const tmp = fs.mkdtempSync (path.join (process.env.TMPDIR || os.tmpdir (), 'h29a02-'));
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
    test ('positive: safeList (R, k, []) reads by comma-ok and keeps the empty default (fails on the base printer)', () => {
        expect (fn ('listDef')).toContain ('var data []any\n\tdata, _ = response["r"].([]any)\n\tif data == nil {\n\t\tdata = []any{}\n\t}\n');
        expect (fn ('listDef')).not.toContain ('SafeListSlice(');
    });
    test ('positive: safeDict (R, k, {}) reads by comma-ok and keeps the empty default (fails on the base printer)', () => {
        expect (fn ('dictDef')).toContain ('var data map[string]any\n\tdata, _ = response["d"].(map[string]any)\n\tif data == nil {\n\t\tdata = map[string]any{}\n\t}\n');
        expect (fn ('dictDef')).not.toContain ('SafeDictMap(');
    });
    test ('positive: an `as Dict` safeDict with the {} default reads the same way (fails on the base printer)', () => {
        expect (fn ('asDict')).toContain ('var data map[string]any\n\tdata, _ = response["a"].(map[string]any)\n\tif data == nil {\n\t\tdata = map[string]any{}\n\t}\n');
    });
    test ('nil-tested result still gets the non-nil empty default before the test', () => {
        expect (fn ('nilTested')).toContain ('if data == nil {\n\t\tdata = []any{}\n\t}\n');
    });
    test ('negative: a written receiver is not read by assertion', () => {
        expect (fn ('written')).not.toContain ('response["w"].(');
    });
    test ('negative: a receiver handed to a callee is not read by assertion', () => {
        expect (fn ('escapes')).not.toContain ('response["e"].(');
    });
    test ('negative: a non-empty default is not this rule', () => {
        expect (fn ('nonEmpty')).not.toContain ('response["f"].(');
    });
    test ('negative: a Dict parameter receiver is not read by assertion', () => {
        expect (fn ('Parse')).not.toContain ('response["p"].(');
    });
});
