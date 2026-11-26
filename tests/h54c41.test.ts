import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

// `safeList (response, 'k', [])` on an endpoint let stored first as `'info'` in a literal used only after the read
describe ('h54c41: an endpoint let stored as info before its list read keeps the comma-ok list read', () => {
    const BASE =
        'export type Dict = { [key: string]: any };\n' +
        'class Exchange {\n' +
        '    request (path: any, api: any, method: any, params: any, config: any = undefined): Promise<any> { return params; }\n' +
        "    publicGetRows (params = {}): Promise<Dict> { return this.request ('rows', [ 'public' ], 'GET', params, { 'cost': 1 }); }\n" +
        '    safeList (o: any, k: any, d: any = undefined): any[] | undefined { return o; }\n' +
        '    safeValue (o: any, k: any, d: any = undefined): any { return o; }\n' +
        '    safeString (o: any, k: any): string { return o; }\n' +
        '    keep (t: any): any { return t; }\n' +
        '}\n' +
        'export { Exchange };\n';
    const method = (before: string, after: string, write = 'await this.publicGetRows ()') =>
        '    async f (flag: boolean) {\n' +
        '        let response = undefined;\n' +
        '        if (flag) {\n' +
        '            response = await this.publicGetRows ();\n' +
        '        } else {\n' +
        '            response = ' + write + ';\n' +
        '        }\n' +
        "        let result: Dict = { 'info': response };\n" + before +
        "        const rows: Dict[] = this.safeList (response, 'data', []);\n" +
        "        const data = this.safeValue (response, 'data');\n" +
        "        this.keep (this.safeString (data, 'x'));\n" + after +
        '        return rows.length;\n' +
        '    }\n';
    const print = (body: string): string => {
        const dir = fs.mkdtempSync (path.join (process.env.TMPDIR || os.tmpdir (), 'h54c41-'));
        try {
            const root = path.join (dir, 'ts', 'src');
            fs.mkdirSync (path.join (root, 'base'), { 'recursive': true });
            fs.writeFileSync (path.join (root, 'base', 'Exchange.ts'), BASE);
            const file = path.join (root, 'v.ts');
            fs.writeFileSync (file, "import { Exchange, Dict } from './base/Exchange.js';\nclass v extends Exchange {\n" + body + '}\n');
            const t: any = new Transpiler ({ 'verbose': false, 'go': {} });
            installCcxtGoHooks (t.goTranspiler);
            return t.transpileGoByPath (file).content;
        } finally {
            fs.rmSync (dir, { 'recursive': true, 'force': true });
        }
    };
    const native = /var rows \[\]any\n\s*rows, _ = response\["data"\]\.\(\[\]any\)/;
    test ('positive: the info literal used only after the read keeps the comma-ok read', () => {
        const out = print (method ('', "        result = this.keep (result);\n"));
        expect (out).toMatch (native);
        expect (out).not.toContain ('SafeListTyped(response, "data")');
    });
    test ('negative: the literal handed out before the read keeps the wrap', () => {
        const out = print (method ("        this.keep (result);\n", ''));
        expect (out).not.toMatch (native);
    });
    test ('negative: a non-endpoint write keeps the wrap', () => {
        const out = print (method ('', "        result = this.keep (result);\n", "this.keep ({ 'data': [] })"));
        expect (out).not.toMatch (native);
    });
});
