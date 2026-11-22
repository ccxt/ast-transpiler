import fs from 'fs';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

describe ('go list local rebound to a [] -defaulted safeList prints []any', () => {
    const root = path.join (__dirname, 'files', 'tmp-h37p14', 'ts', 'src');
    const BASE =
        'export type Dict = { [key: string]: any };\n' +
        'export class Exchange {\n' +
        '    safeList (o: any, k: any, d: any[]): any[];\n' +
        '    safeList (o: any, k: any, d?: any[]): any[] | undefined;\n' +
        '    safeList (o: any, k: any, d: any = undefined): any[] | undefined { return o; }\n' +
        '    safeDict (o: any, k: any, d: any = undefined): any { return o; }\n' +
        '    keep (t: any): any { return t; }\n' +
        '    async publicGetX (p: any): Promise<any> { return p; }\n' +
        '}\n';
    const VENUE =
        "import { Exchange, Dict } from './base/Exchange.js';\n" +
        'export default class v extends Exchange {\n' +
        '    async rebound (flag: boolean) {\n' +
        '        const response = await this.publicGetX ({});\n' +
        "        const a = this.safeDict (response, 'a', {});\n" +
        "        const b = this.safeDict (response, 'b', {});\n" +
        "        let rows: Dict[] = this.safeList (a, 'rows', []);\n" +
        '        if (flag) {\n' +
        "            rows = this.safeList (b, 'rows', []);\n" +
        '        }\n' +
        '        return rows.length;\n' +
        '    }\n' +
        '    otherWrite (data: Dict, flag: boolean) {\n' +
        "        let rows: Dict[] = this.safeList (data, 'rows', []);\n" +
        '        if (flag) {\n' +
        "            rows = this.keep ('x');\n" +
        '        }\n' +
        '        return rows.length;\n' +
        '    }\n' +
        '    noDefault (data: Dict, flag: boolean) {\n' +
        "        let rows: Dict[] = this.safeList (data, 'rows', []);\n" +
        '        if (flag) {\n' +
        "            rows = this.safeList (data, 'other');\n" +
        '        }\n' +
        '        return rows.length;\n' +
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
    afterAll (() => fs.rmSync (path.join (__dirname, 'files', 'tmp-h37p14'), { recursive: true, force: true }));
    const body = (name: string) => out.substring (out.indexOf ('func (this *v) ' + name)).split ('\n}\n')[0];
    test ('the rebound local is []any, read natively', () => {
        const f = out.substring (out.indexOf ('reboundBody(ch chan')).split ('\n}\n')[0];
        expect (f).toContain ('var rows []any');
        expect (f).toContain ('rows = this.SafeListSlice(b, "rows", []any{})');
        expect (f).toContain ('len(rows)');
        expect (f).not.toContain ('GetArrayLength');
    });
    test ('a rebind from another producer keeps the box', () => {
        expect (body ('OtherWrite')).toContain ('GetArrayLength(rows)');
    });
    test ('a rebind to a safeList with no default (may be nil) keeps the box', () => {
        expect (body ('NoDefault')).toContain ('GetArrayLength(rows)');
    });
});
