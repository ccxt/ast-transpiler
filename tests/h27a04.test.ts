import fs from 'fs';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

// `const xs = this.safeList (R, 'k', [])` on a decoded endpoint response R typed map[string]any reads the
// member with the comma-ok list assertion plus the never-nil empty default instead of SafeListSlice.
describe ('h27a04 JSON-origin safeList with an empty-list default', () => {
    const root = path.join (__dirname, 'files', 'tmp-h27a04', 'ts', 'src');
    const BASE =
        'export type Dict = { [key: string]: any };\n' +
        'class Exchange {\n' +
        '    request (path: any, api: any, method: any, params: any, config: any = undefined): Promise<any> { return params; }\n' +
        "    publicGetRows (params = {}): Promise<Dict> { return this.request ('rows', [ 'public' ], 'GET', params, { 'cost': 1 }); }\n" +
        '    options: Dict = {};\n' +
        '    safeList (o: any, k: any, d: any = undefined): any[] | undefined { return o; }\n' +
        '    safeDict (o: any, k: any, d: any = undefined): Dict | undefined { return o; }\n' +
        '    parseTrades (t: any): any[] { return t; }\n' +
        '    keep (t: any): any { return t; }\n' +
        '}\n' +
        'export { Exchange };\n';
    const VENUE =
        "import { Exchange, Dict } from './base/Exchange.js';\n" +
        'export default class v extends Exchange {\n' +
        '    async fromResponse (params = {}) {\n' +
        '        const response = await this.publicGetRows (params);\n' +
        "        const rows = this.safeList (response, 'data', []);\n" +
        '        return this.parseTrades (rows);\n' +
        '    }\n' +
        '    async fromNested (params = {}) {\n' +
        '        const response = await this.publicGetRows (params);\n' +
        "        const data = this.safeDict (response, 'data', {});\n" +
        "        const items = this.safeList (data, 'items', []);\n" +
        '        return this.parseTrades (items);\n' +
        '    }\n' +
        '    async writtenThrough (params = {}) {\n' +
        '        const response = await this.publicGetRows (params);\n' +
        "        const buys = this.safeList (response, 'buys', []);\n" +
        '        for (let i = 0; i < buys.length; i++) {\n' +
        "            buys[i]['side'] = 'buy';\n" +
        '        }\n' +
        '        return this.parseTrades (buys);\n' +
        '    }\n' +
        '    fromParam (r: Dict) {\n' +
        "        const loose = this.safeList (r, 'data', []);\n" +
        '        return this.parseTrades (loose);\n' +
        '    }\n' +
        '    async writtenResponse (params = {}) {\n' +
        '        let response = await this.publicGetRows (params);\n' +
        "        response = this.keep ('x');\n" +
        "        const other = this.safeList (response, 'data', []);\n" +
        '        return this.parseTrades (other);\n' +
        '    }\n' +
        '    async noDefault (params = {}) {\n' +
        '        const response = await this.publicGetRows (params);\n' +
        "        const maybe = this.safeList (response, 'data');\n" +
        '        if (maybe === undefined) {\n' +
        '            return [];\n' +
        '        }\n' +
        '        return this.parseTrades (maybe);\n' +
        '    }\n' +
        '}\n';
    let out = '';
    beforeAll (() => {
        fs.mkdirSync (path.join (root, 'base'), { recursive: true });
        fs.writeFileSync (path.join (root, 'base', 'Exchange.ts'), BASE);
        fs.writeFileSync (path.join (root, 'v.ts'), VENUE);
        const t = new Transpiler ({ verbose: false, go: {} });
        installCcxtGoHooks (t.goTranspiler);
        out = t.transpileGoByPath (path.join (root, 'v.ts')).content;
    });
    afterAll (() => fs.rmSync (path.join (__dirname, 'files', 'tmp-h27a04'), { recursive: true, force: true }));

    test ('positive: a response list reads with the comma-ok assertion and the empty default (fails on the base printer)', () => {
        expect (out).toContain ('\tvar rows []any\n\trows, _ = response["data"].([]any)\n\tif rows == nil {\n\t\trows = []any{}\n\t}\n');
    });
    test ('positive: a safeDict-of-response container reads the same way', () => {
        expect (out).toContain ('\titems, _ = data["items"].([]any)\n');
    });
    test ('negative: a list written through its elements keeps the wrap', () => {
        expect (out).not.toMatch (/buys, _ = /);
    });
    test ('negative: a parameter container keeps the wrap', () => {
        expect (out).not.toMatch (/loose, _ = /);
    });
    test ('negative: a rewritten response keeps the wrap', () => {
        expect (out).not.toMatch (/other, _ = /);
    });
    test ('no default (nil answer tested) reads the comma-ok list without the empty default', () => {
        expect (out).toMatch (/var maybe \[\]any\n\s*maybe, _ = response\["data"\]\.\(\[\]any\)\n\s*if maybe == nil/);
    });
});
