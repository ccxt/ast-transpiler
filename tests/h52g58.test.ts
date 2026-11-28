import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

// an assignment of a `{}`-defaulted literal-index row of a declared list into a map local prints the bounds-tested
// comma-ok read; a non-empty default, a variable index or an untyped list keeps SafeDictMap
describe ('h52g58: `m = this.safeDict (xs, 0, {})` row read on a declared list', () => {
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
        method ('rowAssign', [ 'const response = await this.publicGetD (params);', 'let data = undefined;', 'if (params[\'a\'] === 1) {', "    const rows = this.safeList (response, 'r', []);", '    data = this.safeDict (rows, 0, {});', '} else {', "    data = this.safeDict (response, 'z', {});", '}', 'return data;' ]) +
        method ('rowAssignSecond', [ 'const response = await this.publicGetD (params);', 'let data = undefined;', 'if (params[\'a\'] === 1) {', "    const rows = this.safeList (response, 'r', []);", '    data = this.safeDict (rows, 1, {});', '} else {', "    data = this.safeDict (response, 'z', {});", '}', 'return data;' ]) +
        method ('rowNonEmpty', [ 'const response = await this.publicGetD (params);', 'let data = undefined;', 'if (params[\'a\'] === 1) {', "    const rows = this.safeList (response, 'r', []);", "    data = this.safeDict (rows, 0, { 'x': 1 });", '} else {', "    data = this.safeDict (response, 'z', {});", '}', 'return data;' ]) +
        method ('rowNoDefault', [ 'const response = await this.publicGetD (params);', 'let data = undefined;', 'if (params[\'a\'] === 1) {', "    const rows = this.safeList (response, 'r', []);", '    data = this.safeDict (rows, 0);', '} else {', "    data = this.safeDict (response, 'z', {});", '}', 'return data;' ]) +
        method ('rowVarIndex', [ 'const response = await this.publicGetD (params);', 'let data = undefined;', "const i = this.parseNumber (params['i']);", 'if (params[\'a\'] === 1) {', "    const rows = this.safeList (response, 'r', []);", '    data = this.safeDict (rows, i, {});', '} else {', "    data = this.safeDict (response, 'z', {});", '}', 'return data;' ]) +
        method ('rowUntyped', [ 'let data = undefined;', "const rows = this.keep (params['r']);", 'data = this.safeDict (rows, 0, {});', 'return data;' ]) +
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
        const tmp = fs.mkdtempSync (path.join (process.env.TMPDIR || os.tmpdir (), 'h30a03-'));
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
    test ('positive: index 0 (fails on the base printer)', () => {
        expect (fn ('rowAssign')).toContain ('\t\tdata = nil\n\t\tif 0 < len(rows) {\n\t\t\tdata, _ = rows[0].(map[string]any)\n\t\t}\n\t\tif data == nil {\n\t\t\tdata = map[string]any{}\n\t\t}');
        expect (fn ('rowAssign')).not.toContain ('SafeDictMap(rows');
    });
    test ('positive: index 1 (fails on the base printer)', () => {
        expect (fn ('rowAssignSecond')).toContain ('if 1 < len(rows) {\n\t\t\tdata, _ = rows[1].(map[string]any)');
        expect (fn ('rowAssignSecond')).not.toContain ('SafeDictMap(rows');
    });
    test ('negative: a non-empty default keeps the reader', () => {
        expect (fn ('rowNonEmpty')).not.toContain ('rows[0].(');
    });
    test ('negative: no default (nil answer) keeps the reader', () => {
        expect (fn ('rowNoDefault')).not.toContain ('rows[0].(');
    });
    test ('negative: a variable index keeps the reader', () => {
        expect (fn ('rowVarIndex')).not.toContain ('rows[i].(');
    });
    test ('negative: an untyped list keeps the reader', () => {
        expect (fn ('rowUntyped')).not.toContain ('rows[0].(');
    });
});
