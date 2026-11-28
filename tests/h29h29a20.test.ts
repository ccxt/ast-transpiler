import fs from 'fs';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

// `x = this.safeList (R, 'k', [])` into a `[]`-seeded list local, R a decoded endpoint map: the comma-ok
// list read plus the literal default; a boxed or written-through receiver is never asserted.
describe ('h29a20 safeList write of a decoded map into a list local', () => {
    const root = path.join (__dirname, 'files', 'tmp-h29a20', 'ts', 'src');
    const BASE =
        'export type Dict = { [key: string]: any };\n' +
        'class Exchange {\n' +
        '    request (path: any, api: any, method: any, params: any, config: any = undefined): Promise<any> { return params; }\n' +
        "    publicGetRows (params = {}): Promise<Dict> { return this.request ('rows', [ 'public' ], 'GET', params, { 'cost': 1 }); }\n" +
        '    safeList (o: any, k: any, d: any = undefined): any[] | undefined { return o; }\n' +
        '    safeDict (o: any, k: any, d: any = undefined): Dict | undefined { return o; }\n' +
        '}\n' +
        'export { Exchange };\n';
    const VENUE =
        "import { Exchange, Dict } from './base/Exchange.js';\n" +
        'export default class v extends Exchange {\n' +
        '    async pos (flag: boolean, params = {}) {\n' +
        '        let out = [];\n' +
        '        if (flag) {\n' +
        '            const response = await this.publicGetRows (params);\n' +
        "            const data = this.safeDict (response, 'data', {});\n" +
        "            out = this.safeList (data, 'items', []);\n" +
        '        }\n' +
        '        return out.length;\n' +
        '    }\n' +
        '    boxed (v: any) {\n' +
        '        let out = [];\n' +
        "        out = this.safeList (v, 'a', []);\n" +
        '        return out.length;\n' +
        '    }\n' +
        '    async written (params = {}) {\n' +
        '        let out = [];\n' +
        '        const response = await this.publicGetRows (params);\n' +
        "        response['x'] = 1;\n" +
        "        out = this.safeList (response, 'data', []);\n" +
        '        return out.length;\n' +
        '    }\n' +
        '    async nodefault (params = {}) {\n' +
        '        let out = [];\n' +
        '        const response = await this.publicGetRows (params);\n' +
        "        out = this.safeList (response, 'data');\n" +
        '        return out;\n' +
        '    }\n' +
        '}\n';
    let out = '';
    const fn = (name: string) => {
        const start = out.indexOf ('func (this *v) ' + name);
        const next = out.indexOf ('\nfunc ', start + 1);
        return out.slice (start, (next < 0) ? out.length : next);
    };
    beforeAll (() => {
        fs.mkdirSync (path.join (root, 'base'), { recursive: true });
        fs.writeFileSync (path.join (root, 'base', 'Exchange.ts'), BASE);
        fs.writeFileSync (path.join (root, 'v.ts'), VENUE);
        const t = new Transpiler ({ verbose: false, go: {} });
        installCcxtGoHooks (t.goTranspiler);
        out = t.transpileGoByPath (path.join (root, 'v.ts')).content;
    });
    afterAll (() => fs.rmSync (path.join (__dirname, 'files', 'tmp-h29a20'), { recursive: true, force: true }));

    test ('positive: comma-ok read with the literal default (fails on the base printer)', () => {
        expect (fn ('posBody')).toContain ('\t\tout, _ = data["items"].([]any)\n\t\tif out == nil {\n\t\t\tout = []any{}\n\t\t}\n');
        expect (fn ('posBody')).not.toContain ('ArrayTyped(');
    });
    test ('negative: an any receiver is not asserted', () => {
        expect (fn ('Boxed')).not.toContain ('v["a"].([]any)');
    });
    test ('negative: a written-through receiver is not asserted', () => {
        expect (fn ('writtenBody')).not.toContain ('response["data"].([]any)');
    });
    test ('negative: without a default the nil answer is kept, no literal seeded', () => {
        expect (fn ('nodefaultBody')).not.toContain ('out = []any{}');
    });
});
