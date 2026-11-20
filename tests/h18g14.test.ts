import fs from 'fs';
import path from 'path';
import { Transpiler } from '../src/transpiler';

describe ('go string[] async venue param fed by typed string slices', () => {
    const root = path.join (__dirname, 'files', 'tmp-h18g14', 'ts', 'src');
    const BASE =
        'export type Dict = { [key: string]: any };\n' +
        'export type Str = string | undefined;\n' +
        'export class Exchange {\n' +
        '    safeList (o: any, k: any, d: any = undefined): any[] { return d; }\n' +
        '    safeString (o: any, k: any, d: any = undefined): Str { return d; }\n' +
        '    async get (p: Dict): Promise<any> { return undefined; }\n' +
        '}\n';
    const searcher = (name: string, extra: string) =>
        '    async ' + name + ' (queries: string[], params: Dict = {}): Promise<Dict[]> {\n' +
        '        const out: Dict[] = [];\n' +
        '        for (let i = 0; i < queries.length; i++) {\n' +
        '            const q = queries[i];\n' +
        "            const r = await this.get ({ 'keyword': q });\n" + extra +
        '            out.push (r);\n' +
        '        }\n' +
        '        return out;\n' +
        '    }\n';
    const VENUE = (fill: string, extra = '') =>
        "import { Exchange, Dict, Str } from './base/Exchange';\n" +
        'export default class ex extends Exchange {\n' +
        searcher ('fetchA', '') + searcher ('fetchB', extra) +
        '    async fetchEvents (params: Dict = {}): Promise<any> {\n' +
        "        const tags = this.safeList (params, 'tags', []);\n" +
        '        const tagQueries: string[] = [];\n' +
        '        for (let i = 0; i < tags.length; i++) {\n' +
        '            const tag = tags[i];\n' +
        fill +
        '        }\n' +
        '        const responses = await Promise.all ([\n' +
        '            this.fetchA (tagQueries, params),\n' +
        '            this.fetchB (tagQueries, params),\n' +
        '        ]);\n' +
        '        return responses;\n' +
        '    }\n' +
        '}\n';
    const print = (src: string): string => {
        fs.mkdirSync (path.join (root, 'base'), { recursive: true });
        fs.writeFileSync (path.join (root, 'base', 'Exchange.ts'), BASE);
        fs.writeFileSync (path.join (root, 'ex.ts'), src);
        const t = new Transpiler ({ verbose: false });
        return t.transpileGoByPath (path.join (root, 'ex.ts')).content;
    };
    afterAll (() => fs.rmSync (path.join (__dirname, 'files', 'tmp-h18g14'), { recursive: true, force: true }));

    test ('a replaceAll push keeps the local []string and both callees take []string', () => {
        const out = print (VENUE ("            tagQueries.push (tag.replaceAll ('-', ' '));\n"));
        fs.writeFileSync ('/tmp/g14/pos.go', out);
        expect (out).toContain ('var tagQueries []string = []string{}');
        expect (out).toMatch (/FetchA\(queries \[\]string/);
        expect (out).toMatch (/FetchB\(queries \[\]string/);
        expect (out).toContain ('for i := 0; i < len(queries); i++ {');
        expect (out).not.toContain ('GetArrayLength(queries)');
        expect (out).not.toContain ('GetValue(queries');
    });

    test ('a non-string push keeps the local boxed and the callees keep `queries any`', () => {
        const out = print (VENUE ('            tagQueries.push (tag);\n'));
        expect (out).not.toContain ('var tagQueries []string');
        expect (out).toMatch (/FetchB\(queries any/);
        expect (out).toContain ('GetArrayLength(queries)');
    });

    test ('a nil-testing callee fed only the non-nil literal-initialised local prints the native nil test', () => {
        const nilTest = '            if (queries === undefined) {\n                return out;\n            }\n';
        const out = print (VENUE ("            tagQueries.push (tag.replaceAll ('-', ' '));\n", nilTest));
        expect (out).toContain ('var tagQueries []string = []string{}');
        expect (out).toMatch (/FetchB\(queries \[\]string/);
        expect (out).toContain ('if queries == nil {');
    });

    test ('a second caller that may pass undefined keeps that callee boxed', () => {
        const src = VENUE ("            tagQueries.push (tag.replaceAll ('-', ' '));\n")
            .replace ('        return responses;\n', '        await this.fetchB (undefined, params);\n        return responses;\n');
        const out = print (src);
        expect (out).toMatch (/FetchB\(queries any/);
        expect (out).toContain ('GetArrayLength(queries)');
    });

    test ('a call through an optional `string[]` parameter does not count as a typed read', () => {
        const src = VENUE ("            tagQueries.push (tag.replaceAll ('-', ' '));\n")
            .replace ('async fetchB (queries: string[],', 'async fetchB (queries: string[] = undefined,');
        const out = print (src);
        expect (out).not.toContain ('var tagQueries []string');
    });
});
