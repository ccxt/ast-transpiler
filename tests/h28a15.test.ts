import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

// a safeDict of 'info' / 'precision' on a const local bound to the PredictionExchange outcome cache accessor prints the
// comma-ok map read; a written, rebound or differently sourced receiver, or another key, does not.
describe ('h28a15: outcome cache member read', () => {
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
        'class PredictionExchange {\n    outcomes: Dict = undefined;\n    outcome (s: Str): Dict {\n        return this.outcomes[s];\n    }\n}\n' +
        'export class Exchange extends PredictionExchange {\n    other (s: Str): Dict {\n        return undefined;\n    }\n    request (path: string, api: string[], method: string, params: Dict = {}): Promise<any> {\n        return undefined;\n    }\n' +
        '    safeDict (o: any, k: any, d: Dict = undefined): Dict {\n        return o;\n    }\n' +
        '    safeString (o: any, k: any, d: Str = undefined): Str {\n        return d;\n    }\n' +
        '    keep (o: any): any {\n        return o;\n    }\n}\n';
    const method = (name: string, lines: string[]) => '    async ' + name + ' (params = {}) {\n'
        + lines.map ((l) => '        ' + l + '\n').join ('') + '    }\n';
    const VENUE =
        "import Exchange from './abstract/ex.js';\n" +
        "import { Dict } from './base/types.js';\n" +
        'export default class ex extends Exchange {\n' +
        method ('pos', [ "const o = this.outcome ('x');", "const info = this.safeDict (o, 'info', {});", "return this.safeString (info, 'id');" ]) +
        method ('posPrec', [ "const o = this.outcome ('x');", "const p = this.safeDict (o, 'precision');", "return this.safeString (p, 'id');" ]) +
        method ('posNil', [ "const o = this.outcome ('x');", "const info = this.safeDict (o, 'info');", 'if (info === undefined) {', '    return undefined;', '}', "return this.safeString (info, 'id');" ]) +
        method ('written', [ "const o = this.outcome ('x');", "o['info'] = 1;", "const info = this.safeDict (o, 'info');", "return this.safeString (info, 'id');" ]) +
        method ('rebound', [ "let o = this.outcome ('x');", "o = this.other ('y');", "const info = this.safeDict (o, 'info');", "return this.safeString (info, 'id');" ]) +
        method ('otherSource', [ "const o = this.other ('x');", "const info = this.safeDict (o, 'info');", "return this.safeString (info, 'id');" ]) +
        method ('otherKey', [ "const o = this.outcome ('x');", "const m = this.safeDict (o, 'meta');", "return this.safeString (m, 'id');" ]) +
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
        const tmp = fs.mkdtempSync (path.join (process.env.TMPDIR || os.tmpdir (), 'h28a15-'));
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
    test ('positive: info of a cached outcome reads by comma-ok assertion (fails on the base printer)', () => {
        expect (fn ('pos')).toContain ('var info, _ = o["info"].(map[string]any)\n');
        expect (fn ('pos')).not.toContain ('SafeMapTyped(');
    });
    test ('positive: precision reads the same way', () => {
        expect (fn ('posPrec')).toContain ('var p, _ = o["precision"].(map[string]any)\n');
    });
    test ('nil-tested result: the typed map keeps the nil answer', () => {
        expect (fn ('posNil')).toContain ('var info, _ = o["info"].(map[string]any)\n');
        expect (fn ('posNil')).toContain ('info == nil');
    });
    test ('negative: a written outcome local is not read by assertion', () => {
        // a typed map receiver reads by assertion whatever its origin (h32-R01)
        expect (fn ('written')).toContain ('o["info"].(map[string]any)');
    });
    test ('negative: a rebound local, another source and another key are not read by assertion', () => {
        expect (fn ('rebound')).not.toContain ('o["info"].(map[string]any)');
        expect (fn ('otherSource')).not.toContain ('o["info"].(map[string]any)');
        // a typed map receiver reads by assertion whatever its origin (h32-R01)
        expect (fn ('otherKey')).toContain ('o["meta"].(map[string]any)');
    });
});
