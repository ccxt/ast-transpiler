import { Transpiler } from '../src/transpiler';
import * as fs from 'fs';
import * as path from 'path';

// an async venue method declared Promise<Dict> / Promise<List> whose every return is an awaited
// implicit-API endpoint call of that kind prints Task<T> (the endpoint's generated Task<T>)
describe('csharp async collection return of an implicit-API endpoint', () => {
    const TMP = path.join(__dirname, 'files', 'tmp-csharp-async-implicit-api-return');
    const BASE = path.join(TMP, 'ts', 'src', 'base', 'Exchange.ts');
    const ABSTRACT = path.join(TMP, 'ts', 'src', 'abstract', 'y.ts');
    const VENUE = path.join(TMP, 'ts', 'src', 'w.ts');
    const unique = [ 'quote', 'rows', 'mixed', 'viaAny', 'union', 'caller' ];
    let out: string;
    let outNoTable: string;

    beforeAll(() => {
        fs.mkdirSync(path.dirname(BASE), { recursive: true });
        fs.mkdirSync(path.dirname(ABSTRACT), { recursive: true });
        fs.writeFileSync(BASE,
            "export type Dict = { [key: string]: any };\n" +
            "export type List = any[];\n" +
            "export class T {\n" +
            "    options: any;\n" +
            "    request(path: any, api: any, method: any, params: any, config: any): Promise<any> { return undefined as any; }\n" +
            "    extend(...args: any[]): any { return {}; }\n" +
            "}\n");
        fs.writeFileSync(ABSTRACT,
            "import { T, Dict, List } from '../base/Exchange.js';\n" +
            "export abstract class Y extends T {\n" +
            "    publicGetA (params = {}): Promise<Dict> { return this.request ('a', 'public', 'GET', params, {}); }\n" +
            "    publicGetL (params = {}): Promise<List> { return this.request ('l', 'public', 'GET', params, {}); }\n" +
            "    publicGetU (params = {}): Promise<Dict | List> { return this.request ('u', 'public', 'GET', params, {}); }\n" +
            "}\n");
        fs.writeFileSync(VENUE,
            "import { Y } from './abstract/y.js';\n" +
            "import { Dict, List } from './base/Exchange.js';\n" +
            "export class W extends Y {\n" +
            "    async quote (params = {}): Promise<Dict> {\n" +
            "        return await this.publicGetA (this.extend (params, {}));\n" +
            "    }\n" +
            "    async rows (params = {}): Promise<List> {\n" +
            "        let response: List = [];\n" +
            "        response = await this.publicGetL (params);\n" +
            "        return await this.publicGetL (params);\n" +
            "    }\n" +
            "    async mixed (params = {}): Promise<Dict> {\n" +
            "        if (params === undefined) {\n" +
            "            return await this.publicGetA (params);\n" +
            "        }\n" +
            "        return this.options['x'];\n" +
            "    }\n" +
            "    async viaAny (params = {}): Promise<Dict> {\n" +
            "        return await this.publicGetL (params) as any;\n" +
            "    }\n" +
            "    async union (params = {}): Promise<Dict> {\n" +
            "        return await this.publicGetU (params) as Dict;\n" +
            "    }\n" +
            "    async caller () {\n" +
            "        const q = await this.quote ({});\n" +
            "        return q;\n" +
            "    }\n" +
            "}\n");
        const print = (table: boolean) => (new Transpiler({ 'verbose': false, 'csharp': table ? { 'uniqueMethodNames': unique } : {} }) as any).transpileCSharpByPath(VENUE).content;
        out = print(true);
        outNoTable = print(false);
    });

    afterAll(() => {
        fs.rmSync(TMP, { recursive: true, force: true });
    });

    test('an awaited dict endpoint return prints Task<Dictionary<string, object>> and a typed awaited local', () => {
        expect(out).toContain('Task<Dictionary<string, object>> quote(');
        expect(out).toContain('Dictionary<string, object> q = await this.quote(');
    });

    test('an awaited list endpoint return prints Task<List<object>>', () => {
        expect(out).toContain('Task<List<object>> rows(');
    });

    test('an untyped read, a wrong-kind endpoint, a union endpoint and a missing table keep Task<object>', () => {
        expect(out).toContain('Task<object> mixed(');
        expect(out).toContain('Task<object> viaAny(');
        expect(out).toContain('Task<object> union(');
        expect(outNoTable).toContain('Task<object> quote(');
    });
});
