import fs from 'fs';
import path from 'path';
import { Transpiler, installCcxtGoLocalTypes, installCcxtGoIndexableTypes, installCcxtGoParamTypes } from '../src/transpiler';

jest.mock('module', () => ({ __esModule: true, default: jest.fn() }));

describe ('go parseSearchQueries string[] result locals', () => {
    const root = path.join (__dirname, 'files', 'tmp-h17g04', 'ts', 'src');
    const BASE =
        'export type Dict = { [key: string]: any };\n' +
        'export class Exchange {\n' +
        '    safeString (o: any, k: any, d: any = undefined): string | undefined { return undefined; }\n' +
        '    safeList (o: any, k: any, d: any = undefined): any[] | undefined { return undefined; }\n' +
        '    parseSearchQueries (params: Dict = {}): string[] {\n' +
        "        const singleQuery = this.safeString (params, 'query');\n" +
        '        if (singleQuery !== undefined) {\n' +
        '            return [ singleQuery ];\n' +
        '        }\n' +
        "        return this.safeList (params, 'queries', []);\n" +
        '    }\n' +
        '}\n';
    const VENUE = (body: string) =>
        "import { Exchange, Dict } from './base/Exchange';\n" +
        'export default class ex extends Exchange {\n' +
        '    async fetchEvents (params: Dict = {}): Promise<any> {\n' + body + '    }\n' +
        '    async fetchRawTopicsByQueries (queries: string[], params: Dict = {}): Promise<any> {\n' +
        '        return queries.length;\n' +
        '    }\n' +
        '    async fetchByQuery (queries: string[], params: Dict = {}): Promise<any> {\n' +
        '        const out = [];\n' +
        '        const n = queries.length;\n' +
        '        for (let i = 0; i < n; i++) {\n' +
        "            out.push ({ 'query': queries[i] });\n" +
        '        }\n' +
        '        return out;\n' +
        '    }\n' +
        '}\n';
    const print = (body: string): string => {
        fs.mkdirSync (path.join (root, 'base'), { recursive: true });
        fs.writeFileSync (path.join (root, 'base', 'Exchange.ts'), BASE);
        fs.writeFileSync (path.join (root, 'ex.ts'), VENUE (body));
        const t = new Transpiler ({ verbose: false, go: {} });
        installCcxtGoLocalTypes (t.goTranspiler, {});
        installCcxtGoIndexableTypes (t.goTranspiler);
        installCcxtGoParamTypes (t.goTranspiler);
        return t.transpileGoByPath (path.join (root, 'ex.ts')).content;
    };
    afterAll (() => fs.rmSync (path.join (__dirname, 'files', 'tmp-h17g04'), { recursive: true, force: true }));

    test ('a read-only result local is []string and its param types native', () => {
        const out = print ('        const queries = this.parseSearchQueries (params);\n' +
            '        if (queries.length > 0) {\n            return await this.fetchByQuery (queries, params);\n        }\n        return undefined;\n');
        expect (out).toContain ('var queries []string = this.ParseSearchQueries(params)');
        expect (out).not.toContain ('ArrayTyped(this.ParseSearchQueries');
    });
    test ('a push of a non-string keeps a []any list, not an any box', () => {
        const out = print ('        const queries = this.parseSearchQueries (params);\n' +
            "        const tags = this.safeList (params, 'tags', []);\n" +
            '        for (let i = 0; i < tags.length; i++) {\n            queries.push (tags[i]);\n        }\n' +
            '        return queries.length;\n');
        expect (out).not.toContain ('var queries []string');
        expect (out).not.toContain ('var queries any');
        expect (out).not.toContain ('AppendToArray(&queries');
        expect (out).toContain ('var queries []any = ArrayTyped(this.ParseSearchQueries(params))');
    });
    test ('a nil test on the result keeps the nil answer of the typed slice', () => {
        const out = print ('        const queries = this.parseSearchQueries (params);\n' +
            '        if (queries === undefined) {\n            return 0;\n        }\n        return queries.length;\n');
        expect (out).toContain ('queries == nil');
        expect (out).not.toContain ('IsEqual(queries');
    });
    test ('a string[] callee takes the []string result itself', () => {
        const out = print ('        const queries = this.parseSearchQueries (params);\n' +
            '        return await this.fetchRawTopicsByQueries (queries, params);\n');
        expect (out).toContain ('var queries []string = this.ParseSearchQueries(params)');
        expect (out).not.toContain ('ArrayTyped(this.ParseSearchQueries');
        expect (out).toContain ('FetchRawTopicsByQueries(queries []string');
    });
});
