import fs from 'fs';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

describe ('go undeclared local seeded by a [] -defaulted safeList prints []any', () => {
    const root = path.join (__dirname, 'files', 'tmp-h38h01', 'ts', 'src');
    const BASE =
        'export type Dict = { [key: string]: any };\n' +
        'export class Exchange {\n' +
        '    safeList (o: any, k: any, d: any[]): any[];\n' +
        '    safeList (o: any, k: any, d?: any[]): any[] | undefined;\n' +
        '    safeList (o: any, k: any, d: any = undefined): any[] | undefined { return o; }\n' +
        '    safeDict (o: any, k: any, d: any = undefined): any { return o; }\n' +
        '    safeNumber (o: any, k: any): any { return o; }\n' +
        '    keep (t: any): any { return t; }\n' +
        '}\n';
    const API =
        'export interface ImplicitAPI {\n' +
        '    publicGetX (params?: {}): Promise<implicitReturnType>;\n' +
        '}\n' +
        'export type implicitReturnType = any;\n';
    const VENUE =
        "import { Exchange, Dict } from './base/Exchange.js';\n" +
        "import { ImplicitAPI } from './abstract/v.js';\n" +
        'interface v extends ImplicitAPI {}\n' +
        'class v extends Exchange {\n' +
        '    async defaulted () {\n' +
        '        const response = await this.publicGetX ();\n' +
        "        const data = this.safeDict (response, 'result', {});\n" +
        "        const rows = this.safeList (data, 'rows', []);\n" +
        '        let n = 0;\n' +
        '        if (rows !== undefined) {\n' +
        '            n = rows.length;\n' +
        '        }\n' +
        '        return n;\n' +
        '    }\n' +
        '    async noDefault () {\n' +
        '        const response = await this.publicGetX ();\n' +
        "        const rows = this.safeList (response, 'rows');\n" +
        '        return rows.length;\n' +
        '    }\n' +
        '    async nonLiteralDefault (d: any) {\n' +
        '        const response = await this.publicGetX ();\n' +
        "        const rows = this.safeList (response, 'rows', d);\n" +
        '        return rows.length;\n' +
        '    }\n' +
        '    async otherWrite (flag: boolean) {\n' +
        '        const response = await this.publicGetX ();\n' +
        "        let rows = this.safeList (response, 'rows', []);\n" +
        '        if (flag) {\n' +
        "            rows = this.keep ('x');\n" +
        '        }\n' +
        '        return rows.length;\n' +
        '    }\n' +
        '    async handedOn () {\n' +
        '        const response = await this.publicGetX ();\n' +
        "        const result = this.safeDict (response, 'result', {});\n" +
        "        let orders = this.safeList (result, 'data', []);\n" +
        '        if (orders === undefined) {\n' +
        '            orders = [];\n' +
        '        }\n' +
        '        return this.keep (orders);\n' +
        '    }\n' +
        '    paramReceiver (data) {\n' +
        "        const rows = this.safeList (data, 'rows', []);\n" +
        '        return rows.length;\n' +
        '    }\n' +
        '}\n';
    let out = '';
    beforeAll (() => {
        fs.mkdirSync (path.join (root, 'base'), { recursive: true });
        fs.writeFileSync (path.join (root, 'base', 'Exchange.ts'), BASE);
        fs.mkdirSync (path.join (root, 'abstract'), { recursive: true });
        fs.writeFileSync (path.join (root, 'abstract', 'v.ts'), API);
        fs.writeFileSync (path.join (root, 'v.ts'), VENUE);
        const t = new Transpiler ({ verbose: false, go: {} });
        installCcxtGoHooks (t.goTranspiler);
        out = t.transpileGoByPath (path.join (root, 'v.ts')).content;
    });
    afterAll (() => fs.rmSync (path.join (__dirname, 'files', 'tmp-h38h01'), { recursive: true, force: true }));
    const body = (name: string) => out.substring (out.indexOf (name + 'Body(ch chan')).split ('\n}\n')[0];
    test ('missing key, nil and wrong kind answer the empty default: []any read by comma-ok, length native', () => {
        const f = body ('defaulted');
        expect (f).toContain ('var rows []any\n');
        expect (f).toContain ('rows, _ = data["rows"].([]any)');
        expect (f).toContain ('rows = []any{}');
        expect (f).toContain ('len(rows)');
        expect (f).not.toContain ('GetArrayLength');
        expect (f).not.toContain ('this.SafeList(');
    });
    test ('a handed-on local with an empty-literal rewrite is []any too', () => {
        expect (body ('handedOn')).toContain ('var orders []any');
    });
    test ('no default (may be nil) is not this rule', () => {
        expect (body ('noDefault')).not.toContain ('rows = []any{}');
    });
    test ('a non-literal default is not this rule', () => {
        expect (body ('nonLiteralDefault')).not.toContain ('rows, _ = response');
    });
    test ('a local later written from something else keeps the box', () => {
        expect (body ('otherWrite')).toContain ('GetArrayLength(rows)');
    });
    test ('an untyped parameter receiver is not read by comma-ok', () => {
        const f = out.substring (out.indexOf ('func (this *v) ParamReceiver')).split ('\n}\n')[0];
        expect (f).not.toContain ('rows, _ =');
    });
});
