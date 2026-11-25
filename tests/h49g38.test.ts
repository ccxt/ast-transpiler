import fs from 'fs';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

// a nested `this.safeList (this.safeDict (R, 'k', {}), 'k2', [])` is a read-only use of the decoded map R:
// the earlier `x = this.safeList (R, 'k', [])` write reads R natively; any other use keeps the wrap
describe ('h49g38 nested safeDict read keeps R a JSON-origin map', () => {
    const root = path.join (__dirname, 'files', 'tmp-h49g38', 'ts', 'src');
    const BASE =
        'export type Dict = { [key: string]: any };\n' +
        'class Exchange {\n' +
        '    request (path: any, api: any, method: any, params: any, config: any = undefined): Promise<any> { return params; }\n' +
        "    publicGetRows (params = {}): Promise<Dict> { return this.request ('rows', [ 'public' ], 'GET', params, { 'cost': 1 }); }\n" +
        '    safeList (o: any, k: any, d: any = undefined): any[] | undefined { return o; }\n' +
        '    safeDict (o: any, k: any, d: any = undefined): Dict | undefined { return o; }\n' +
        '    keep (o: any): any { return o; }\n' +
        '}\n' +
        'export { Exchange };\n';
    const VENUE =
        "import { Exchange, Dict } from './base/Exchange.js';\n" +
        'export default class v extends Exchange {\n' +
        '    async pos (params = {}) {\n' +
        '        const response = await this.publicGetRows (params);\n' +
        '        let rows: Dict[] = [];\n' +
        "        rows = this.safeList (response, 'data', []);\n" +
        '        const n = rows.length;\n' +
        '        if (n === 0) {\n' +
        "            rows = this.safeList (this.safeDict (response, 'data', {}), 'items', []);\n" +
        '        }\n' +
        '        return rows.length;\n' +
        '    }\n' +
        '    async leaked (params = {}) {\n' +
        '        const response = await this.publicGetRows (params);\n' +
        '        let rows: Dict[] = [];\n' +
        "        rows = this.safeList (response, 'data', []);\n" +
        '        const n = rows.length;\n' +
        '        if (n === 0) {\n' +
        "            rows = this.safeList (this.keep (this.safeDict (response, 'data', {})), 'items', []);\n" +
        '        }\n' +
        '        return rows.length;\n' +
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
    afterAll (() => fs.rmSync (path.join (__dirname, 'files', 'tmp-h49g38'), { recursive: true, force: true }));

    test ('positive: the first write reads the map natively (fails on the base printer)', () => {
        expect (fn ('posBody')).toContain ('rows, _ = response["data"].([]any)\n');
        expect (fn ('posBody')).not.toContain ('ArrayTyped(this.SafeList(response, "data"');
    });
    test ('negative: the map handed to another method keeps the wrap', () => {
        expect (fn ('leakedBody')).not.toContain ('response["data"].([]any)');
    });
});
