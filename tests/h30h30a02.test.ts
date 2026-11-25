import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

// a defaulted safeList / safeDict read whose receiver is a safeDict read of a decoded endpoint prints the comma-ok
// read plus the empty default; written, escaping or parameter-cut receivers and non-empty defaults keep the wrap
describe ('h30a02: defaulted safeList / safeDict reads whose receiver is a typed safeDict read', () => {
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
        method ('listOfDict', [ 'const response = await this.publicGetD (params);', "const data = this.safeDict (response, 'd', {});", "const rows = this.safeList (data, 'r', []);", 'return rows;' ]) +
        method ('dictOfDict', [ 'const response = await this.publicGetD (params);', "const data = this.safeDict (response, 'd');", "const inner = this.safeDict (data, 'i', {});", 'return inner;' ]) +
        method ('nilTested', [ 'const response = await this.publicGetD (params);', "const data = this.safeDict (response, 'd', {});", "const rows = this.safeList (data, 'n', []);", 'if (rows === undefined) {', '    return 0;', '}', 'return rows.length;' ]) +
        method ('written', [ 'const response = await this.publicGetD (params);', "const data = this.safeDict (response, 'd', {});", "data['x'] = 1;", "const rows = this.safeList (data, 'w', []);", 'return rows;' ]) +
        method ('escapes', [ 'const response = await this.publicGetD (params);', "const data = this.safeDict (response, 'd', {});", 'this.keep (data);', "const inner = this.safeDict (data, 'e', {});", 'return inner;' ]) +
        method ('elementWrite', [ 'const response = await this.publicGetD (params);', "const data = this.safeDict (response, 'd', {});", "const rows = this.safeList (data, 'm', []);", 'for (let i = 0; i < rows.length; i++) {', "    rows[i]['t'] = 1;", '}', 'return rows;' ]) +
        method ('nonEmpty', [ 'const response = await this.publicGetD (params);', "const data = this.safeDict (response, 'd', {});", "const rows = this.safeList (data, 'f', [ 1 ]);", 'return rows;' ]) +
        '    parse (response: Dict) {\n        const data = this.safeDict (response, \'d\', {});\n        const items = this.safeList (data, \'p\', []);\n        return items.length;\n    }\n' +
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
        const tmp = fs.mkdtempSync (path.join (process.env.TMPDIR || os.tmpdir (), 'h30a02-'));
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
    test ('positive: safeList (D, k, []) on a safeDict-read receiver reads by comma-ok with the empty default (fails on the base printer)', () => {
        expect (fn ('listOfDict')).toContain ('var rows []any\n\trows, _ = data["r"].([]any)\n\tif rows == nil {\n\t\trows = []any{}\n\t}\n');
        expect (fn ('listOfDict')).not.toContain ('SafeListSlice(');
    });
    test ('positive: safeDict (D, k, {}) on a comma-ok receiver reads the same way (fails on the base printer)', () => {
        expect (fn ('dictOfDict')).toContain ('var inner map[string]any\n\tinner, _ = data["i"].(map[string]any)\n\tif inner == nil {\n\t\tinner = map[string]any{}\n\t}\n');
        expect (fn ('dictOfDict')).not.toContain ('SafeDictMap(');
    });
    test ('nil-tested: the local still gets the non-nil empty default before the nil test', () => {
        expect (fn ('nilTested')).toContain ('if rows == nil {\n\t\trows = []any{}\n\t}\n');
    });
    test ('negative: a receiver written through keeps the wrap', () => {
        expect (fn ('written')).not.toContain ('rows, _ = data["w"]');
    });
    test ('negative: a receiver handed to a callee keeps the wrap', () => {
        expect (fn ('escapes')).not.toContain ('inner, _ = data["e"]');
    });
    test ('negative: a list local written through an element keeps the shipped form', () => {
        expect (fn ('elementWrite')).not.toContain ('rows, _ = data["m"]');
    });
    test ('negative: a non-empty default keeps the accessor', () => {
        expect (fn ('nonEmpty')).not.toContain ('rows, _ = data["f"]');
    });
    test ('negative: a receiver cut from a Dict parameter keeps the wrap', () => {
        expect (fn ('parse')).not.toContain ('items, _ = data["p"]');
    });
});
