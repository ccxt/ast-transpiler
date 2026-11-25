import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

// with a literal key on a decoded endpoint response the printer declares map[string]any
// prints the comma-ok map read; a written, escaping, rebound or parameter receiver keeps the wrap.
// a safeList of an awaited map endpoint whose receive prints `var response map[string]any = ...Checked()` reads by
// comma-ok; elements of that list are bare in a guarded read; written, escaping or parameter receivers keep the wrap
// `x = this.safeList (R, 'k', [])` into a nil-seeded list local (`var x []any = nil`) on a joined endpoint receiver
// prints the comma-ok read plus the empty default; written, escaping receivers and non-empty defaults keep the wrap
describe ('h46g37: assignment form into a nil-seeded list local', () => {
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
        method ('joined', [ 'let response = undefined;', 'if (params[\'a\'] === 1) {', '    response = await this.publicGetD (params);', '} else {', '    response = await this.publicGetD ({});', '}', 'let result: List = undefined;', "if (params['b'] === 1) {", "    result = this.safeList (response, 'data', []);", '} else {', "    result = this.safeList (response, 'q', []);", '}', 'return result;' ]) +
        method ('written', [ 'let response = undefined;', 'if (params[\'a\'] === 1) {', '    response = await this.publicGetD (params);', '} else {', '    response = {};', '}', 'let result: List = undefined;', "if (params['b'] === 1) {", "    result = this.safeList (response, 'data', []);", '} else {', "    result = this.safeList (response, 'q', []);", '}', 'return result;' ]) +
        method ('escapes', [ 'let response = undefined;', 'if (params[\'a\'] === 1) {', '    response = await this.publicGetD (params);', '} else {', '    response = await this.publicGetD ({});', '}', 'this.keep (response);', 'let result: List = undefined;', "if (params['b'] === 1) {", "    result = this.safeList (response, 'data', []);", '} else {', "    result = this.safeList (response, 'q', []);", '}', 'return result;' ]) +
        method ('nonEmpty', [ 'let response = undefined;', 'if (params[\'a\'] === 1) {', '    response = await this.publicGetD (params);', '} else {', '    response = await this.publicGetD ({});', '}', 'let result: List = undefined;', "if (params['b'] === 1) {", "    result = this.safeList (response, 'data', [ 2 ]);", '} else {', "    result = this.safeList (response, 'q', [ 1 ]);", '}', 'return result;' ]) +
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
        const tmp = fs.mkdtempSync (path.join (process.env.TMPDIR || os.tmpdir (), 'h46g37-'));
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
    test ('positive: nil-seeded list target, both arms (fails on the base printer)', () => {
        expect (fn ('joined')).toContain ('var result []any = nil');
        expect (fn ('joined')).toContain ('result, _ = response["data"].([]any)\n\t\tif result == nil {\n\t\t\tresult = []any{}\n\t\t}');
        expect (fn ('joined')).toContain ('result, _ = response["q"].([]any)');
        expect (fn ('joined')).not.toContain ('SafeList');
    });
    test ('negative: a receiver with a non-endpoint write keeps the wrap', () => {
        expect (fn ('written')).not.toContain ('response["data"].(');
        expect (fn ('written')).toContain ('SafeList');
    });
    test ('negative: a receiver handed to a callee keeps the wrap', () => {
        expect (fn ('escapes')).not.toContain ('response["data"].(');
    });
    test ('negative: a non-empty default keeps the wrap', () => {
        expect (fn ('nonEmpty')).not.toContain ('response["data"].(');
        expect (fn ('nonEmpty')).not.toContain ('response["q"].(');
    });
});
