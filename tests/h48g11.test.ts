import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

// `x = this.safeList (hop, 'k', [])` on a read-only safeDict hop of a local assigned only from awaited map endpoints in
// every branch prints the comma-ok read; another kind, a passed local, a written hop or a non-empty default keep the wrap
describe ('h48g11: list read on a safeDict hop of a joined endpoint local', () => {
    const ABSTRACT =
        "import { Dict, List } from '../base/types.js';\n" +
        "import { Exchange as _Exchange } from '../base/Exchange.js';\n" +
        'abstract class Exchange extends _Exchange {\n' +
        '    publicGetD (params = {}): Promise<Dict> {\n        return this.request ("d", [ "public" ], "GET", params);\n    }\n\n' +
        '    publicGetE (params = {}): Promise<Dict> {\n        return this.request ("e", [ "public" ], "GET", params);\n    }\n\n' +
        '    publicGetL (params = {}): Promise<List> {\n        return this.request ("l", [ "public" ], "GET", params);\n    }\n}\n' +
        'export default Exchange;\n';
    const TYPES = 'export type Dict = { [key: string]: any };\nexport type List = any[];\nexport type NullableList = any[] | undefined;\nexport type Str = string | undefined;\n';
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
    const joined = (a: string[], b: string[], c: string[], tail: string[]) => [ 'const flag = this.keep (params);', 'let response: Dict;', 'let trades: NullableList = undefined;',
        'if (flag) {', ...a.map ((l) => '    ' + l), '} else if (flag === 1) {', ...b.map ((l) => '    ' + l), '} else {', ...c.map ((l) => '    ' + l), '}', ...tail ];
    const HOP = [ 'response = await this.publicGetD (params);', "const data = this.safeDict (response, 'data', {});", "trades = this.safeList (data, 'list', []);" ];
    const FLAT = [ 'response = await this.publicGetE (params);', "trades = this.safeList (response, 'data', []);" ];
    const TAIL = [ 'let out: Dict[] = [];', 'if (trades !== undefined) {', '    out = trades;', '}', 'return out;' ];
    const VENUE =
        "import Exchange from './abstract/ex.js';\n" +
        "import { Dict, List, NullableList } from './base/types.js';\n" +
        'export default class ex extends Exchange {\n' +
        method ('joinedAll', joined (HOP, FLAT, FLAT, TAIL)) +
        method ('joinedOtherKind', joined (HOP, FLAT, [ 'response = this.keep (params);', "trades = this.safeList (response, 'data', []);" ], TAIL)) +
        method ('joinedPassed', joined (HOP, FLAT, FLAT, [ 'this.keep (response);', ...TAIL ])) +
        method ('joinedHopWritten', joined ([ 'response = await this.publicGetD (params);', "const data = this.safeDict (response, 'data', {});", "data['x'] = 1;", "trades = this.safeList (data, 'list', []);" ], FLAT, FLAT, TAIL)) +
        method ('joinedNonEmpty', joined ([ 'response = await this.publicGetD (params);', "const data = this.safeDict (response, 'data', {});", "trades = this.safeList (data, 'list', [ 1 ]);" ], FLAT, FLAT, TAIL)) +
        '}\n';
    const API = 'package ccxt\n\n' +
        'func (this *Ex) PublicGetD(args ...any) <-chan EndpointResult[map[string]any] {\n\treturn nil\n}\n' +
        'func (this *Ex) PublicGetE(args ...any) <-chan EndpointResult[map[string]any] {\n\treturn nil\n}\n' +
        'func (this *Ex) PublicGetL(args ...any) <-chan EndpointResult[[]any] {\n\treturn nil\n}\n';
    let out = '';
    const fn = (name: string) => {
        const start = out.search (new RegExp ('func \\(this \\*ex\\) ' + name + '(Body)?\\('));
        const next = out.indexOf ('\nfunc ', start + 1);
        return out.slice (start, (next < 0) ? out.length : next);
    };
    beforeAll (() => {
        const tmp = fs.mkdtempSync (path.join (process.env.TMPDIR || os.tmpdir (), 'h48g11-'));
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
    test ('positive: list read on a safeDict hop of a joined endpoint local (fails on the base printer)', () => {
        expect (fn ('joinedAll')).toContain ('trades, _ = data["list"].([]any)');
        expect (fn ('joinedAll')).not.toContain ('SafeList(');
    });
    test ('negative: one branch assigns another kind keeps the wrap', () => {
        expect (fn ('joinedOtherKind')).not.toContain ('data["list"].(');
    });
    test ('negative: the joined local passed to a method keeps the wrap', () => {
        expect (fn ('joinedPassed')).not.toContain ('data["list"].(');
    });
    test ('negative: a written hop keeps the wrap', () => {
        expect (fn ('joinedHopWritten')).not.toContain ('data["list"].(');
    });
    test ('negative: a non-empty default keeps the wrap', () => {
        expect (fn ('joinedNonEmpty')).not.toContain ('data["list"].(');
    });
});
