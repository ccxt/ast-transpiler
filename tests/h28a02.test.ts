import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

// a no-default safeDict with a literal key on a decoded endpoint response the printer declares map[string]any
// prints the comma-ok map read; a written, escaping, rebound or parameter receiver keeps the wrap.
// a safeList of an awaited map endpoint whose receive prints `var response map[string]any = ...Checked()` reads by
// comma-ok; elements of that list are bare in a guarded read; written, escaping or parameter receivers keep the wrap
describe ('h28a02: endpoint-receive map local, comma-ok list read', () => {
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
    const read = "const data = this.safeDict (response, 'data');";
    const VENUE =
        "import Exchange from './abstract/ex.js';\n" +
        "import { Dict, List } from './base/types.js';\n" +
        'export default class ex extends Exchange {\n' +
        method ('asList', [ 'const response = await this.publicGetD (params);', "const data = this.safeList (response, 'r', []) as List;", 'return data.length;' ]) +
        method ('plain', [ 'const response = await this.publicGetD (params);', "const data = this.safeList (response, 'r');", 'return data.length;' ]) +
        method ('rowRead', [ 'const response = await this.publicGetD (params);', "const rows = this.safeList (response, 'r', []);", 'const n = this.parseNumber (params);', 'return this.safeString (rows[n], \'id\');' ]) +
        method ('asListInfo', [ 'const response = await this.publicGetD (params);', "const data = this.safeList (response, 'q', []) as List;", "return { 'info': response, 'n': data.length };" ]) +
        method ('written', [ 'const response = await this.publicGetD (params);', "response['x'] = 1;", "const data = this.safeList (response, 'w');", 'return data.length;' ]) +
        method ('escapes', [ 'const response = await this.publicGetD (params);', 'this.keep (response);', "const data = this.safeList (response, 'e');", 'return data.length;' ]) +
        method ('nilTested', [ 'const response = await this.publicGetD (params);', "const data = this.safeList (response, 'n');", 'if (data === undefined) {', '    return 0;', '}', 'return data.length;' ]) +
        '    parse (response: Dict) {\n        const items = this.safeList (response, \'p\');\n        return items.length;\n    }\n' +
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
        const tmp = fs.mkdtempSync (path.join (process.env.TMPDIR || os.tmpdir (), 'h28a02-'));
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
    test ('positive: an `as List` safeList of the typed receive reads by comma-ok (fails on the base printer)', () => {
        expect (fn ('asList')).toMatch (/var response map\[string\]any = /);
        expect (fn ('asList')).toContain ('var data []any\n\tdata, _ = response["r"].([]any)\n');
        expect (fn ('asList')).not.toContain ('SafeListTyped(');
    });
    test ('positive: the two-argument form reads the same way', () => {
        expect (fn ('plain')).toContain ('data, _ = response["r"].([]any)\n');
    });
    test ('positive: a guarded row read of that list takes the element without DerefScalar', () => {
        expect (fn ('rowRead')).toContain ('rows, _ = response["r"].([]any)\n');
        expect (fn ('rowRead')).not.toContain ('DerefScalar(');
    });
    test ('nil-tested result: the typed slice keeps the nil answer', () => {
        expect (fn ('nilTested')).toContain ('data, _ = response["n"].([]any)\n');
        expect (fn ('nilTested')).toContain ('data == nil');
    });
    test ('negative: a written or escaping response does not print the comma-ok read', () => {
        expect (fn ('written')).not.toContain ('response["w"].(');
        expect (fn ('escapes')).not.toContain ('response["e"].(');
    });
    test ('an `as List` read with a later info use prints without crashing the before-read proof', () => {
        expect (fn ('asListInfo')).toContain ('"info"');
    });
    test ('negative: a parameter receiver does not print the comma-ok read', () => {
        expect (fn ('parse')).not.toContain ('response["p"].(');
    });
});
