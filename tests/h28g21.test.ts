import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

describe ('h28g21: a string[] local fed to inArray / json keeps []string and joins natively', () => {
    const ABSTRACT =
        "import { Dict, List } from '../base/types.js';\n" +
        "import { Exchange as _Exchange } from '../base/Exchange.js';\n" +
        'abstract class Exchange extends _Exchange {\n' +
        '    publicGetD (params = {}): Promise<Dict> {\n        return this.request ("d", [ "public" ], "GET", params);\n    }\n}\n' +
        'export default Exchange;\n';
    const TYPES = 'export type Dict = { [key: string]: any };\nexport type List = any[];\nexport type Str = string | undefined;\n';
    const BASE =
        "import { Dict, List, Str } from './types.js';\n" +
        'export class Exchange {\n    id: string = "";\n    request (path: string, api: string[], method: string, params: Dict = {}): Promise<any> {\n        return undefined;\n    }\n' +
        '    safeString (o: any, k: any, d: Str = undefined): Str {\n        return d;\n    }\n' +
        '    json (o: any): string {\n        return "";\n    }\n' +
        '    inArray (o: any, l: any[]): boolean {\n        return false;\n    }\n}\n';
    const VENUE = "import Exchange from './abstract/ex.js';\nimport { Dict } from './base/types.js';\nexport default class ex extends Exchange {\n    a (ids: string[], params = {}) {\n        const parsedIds: string[] = [];\n        for (let i = 0; i < ids.length; i++) {\n            const id = this.safeString (ids, i, '');\n            parsedIds.push (id);\n        }\n        const request: Dict = {};\n        request['x'] = parsedIds.join (',');\n        request['y'] = this.json (parsedIds);\n        request['z'] = parsedIds;\n        return request;\n    }\n    b (ids: string[]) {\n        const topic = 'k.' + this.id;\n        const topics: string[] = [];\n        if (!this.inArray (topic, topics)) {\n            topics.push (topic);\n        }\n        return 'u:' + topics.join (',');\n    }\n    c (ids: string[]) {\n        const parsedIds: string[] = [];\n        for (let i = 0; i < ids.length; i++) {\n            const id = this.safeString (ids, i, '');\n            parsedIds.push (id);\n        }\n        return parsedIds.join (',');\n    }\n    d (ids: string[]) {\n        const ids2: string[] = [];\n        ids2.push ('a');\n        const j = this.json (ids2);\n        return j + ids2.join (',');\n    }\n    e (o: Dict) {\n        const xs: string[] = [];\n        xs.push (o['k']);\n        if (this.inArray ('a', xs)) {\n            return xs.join (',');\n        }\n        return '';\n    }\n    f (o: Dict) {\n        const ys: string[] = [];\n        ys.push ('a');\n        if (this.inArray (ys, [ 'a' ])) {\n            return ys.join (',');\n        }\n        return '';\n    }\n}\n";
    let out = '';
    beforeAll (() => {
        const tmp = fs.mkdtempSync (path.join (process.env.TMPDIR || os.tmpdir (), 'h28g21-'));
        try {
            const src = path.join (tmp, 'ts', 'src');
            fs.mkdirSync (path.join (src, 'base'), { 'recursive': true });
            fs.mkdirSync (path.join (src, 'abstract'), { 'recursive': true });
            fs.mkdirSync (path.join (tmp, 'go', 'v4'), { 'recursive': true });
            fs.writeFileSync (path.join (src, 'base', 'types.ts'), TYPES);
            fs.writeFileSync (path.join (src, 'base', 'Exchange.ts'), BASE);
            fs.writeFileSync (path.join (src, 'abstract', 'ex.ts'), ABSTRACT);
            fs.writeFileSync (path.join (src, 'ex.ts'), VENUE);
            fs.writeFileSync (path.join (tmp, 'go', 'v4', 'ex_api.go'), 'package ccxt\n\nfunc (this *Ex) PublicGetD(args ...any) <-chan EndpointResult[map[string]any] {\n\treturn nil\n}\n');
            const t: any = new Transpiler ({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 }, 'asyncMethodSuffix': 'Async', 'asyncSuffixExemptPaths': [ '(^|/)ts/src/abstract/' ] } });
            installCcxtGoHooks (t.goTranspiler);
            out = t.transpileGoByPath (path.join (src, 'ex.ts')).content;
        } finally {
            fs.rmSync (tmp, { 'recursive': true, 'force': true });
        }
    });
    const fn = (name: string) => {
        const start = out.search (new RegExp ('func \\(this \\*ex\\) ' + name + '\\('));
        const next = out.indexOf ('\nfunc ', start + 1);
        return out.slice (start, (next < 0) ? out.length : next);
    };
    test ('positive: inArray list argument keeps the []string local and the join is native (fails on the base printer)', () => {
        expect (fn ('B')).toContain ('var topics []string = []string{}');
        expect (fn ('B')).toContain ('strings.Join(topics, ",")');
        expect (fn ('B')).not.toContain ('+ Join(topics');
    });
    test ('positive: json argument keeps the []string local', () => {
        expect (fn ('D')).toContain ('var ids2 []string = []string{}');
        expect (fn ('D')).toContain ('strings.Join(ids2, ",")');
    });
    test ('negative: a list also stored whole into a map keeps the box', () => {
        expect (fn ('A')).toContain ('var parsedIds []any = []any{}');
        expect (fn ('A')).not.toContain ('strings.Join(parsedIds');
    });
    test ('negative: a non-string push keeps the box', () => {
        expect (fn ('E')).not.toContain ('var xs []string');
    });
    test ('negative: the list as the searched element (slot 0) keeps the box', () => {
        expect (fn ('F')).not.toContain ('var ys []string');
    });
});
