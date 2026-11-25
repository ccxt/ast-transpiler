import fs from 'fs';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

describe ('go two-argument safeList on a JSON-origin chain read before it is handed out prints the comma-ok read', () => {
    const root = path.join (__dirname, 'files', 'tmp-h28g30', 'ts', 'src');
    const BASE =
        'export type Dict = { [key: string]: any };\n' +
        'export type List = any[];\n' +
        'export class Exchange {\n' +
        '    options: Dict = {};\n' +
        '    request (path: any, api: any, method: any, params: any, config: any = undefined): Promise<any> { return params; }\n' +
        "    publicGetRows (params = {}): Promise<Dict> { return this.request ('rows', [ 'public' ], 'GET', params, { 'cost': 1 }); }\n" +
        '    safeList (o: any, k: any, d: any = undefined): any[] | undefined {\n' +
        '        return o;\n' +
        '    }\n' +
        '    safeDict (o: any, k: any, d: any = undefined): Dict | undefined {\n' +
        '        return o;\n' +
        '    }\n' +
        '    safeString (o: any, k: any): string {\n' +
        '        return o;\n' +
        '    }\n' +
        '    keep (t: any): any {\n' +
        '        return t;\n' +
        '    }\n' +
        '    use (t: any[]): any {\n' +
        '        return t;\n' +
        '    }\n' +
        '}\n';
    const VENUE =
        "import { Exchange, Dict } from './base/Exchange.js';\n" +
        'class v extends Exchange {\n' +
        '    async chained () {\n' +
        '        const response = await this.publicGetRows ();\n' +
        "        const result = this.safeDict (response, 'result', {});\n" +
        "        const orders = this.safeList (result, 'list');\n" +
        '        if (orders === undefined) {\n' +
        "            return this.keep (result);\n" +
        '        }\n' +
        '        return this.use (orders);\n' +
        '    }\n' +
        '    async direct (walletAddress: string) {\n' +
        '        let accountIndex = undefined;\n' +
        '        if (walletAddress !== undefined) {\n' +
        "            const res = await this.publicGetRows ({ 'l1_address': walletAddress });\n" +
        "            const subAccounts = this.safeList (res, 'sub_accounts');\n" +
        '            if (subAccounts !== undefined) {\n' +
        '                const account = this.safeDict (subAccounts, 0);\n' +
        "                accountIndex = account['index'];\n" +
        "                this.options['accountIndex'] = accountIndex;\n" +
        '            }\n' +
        '        }\n' +
        '        return accountIndex;\n' +
        '    }\n' +
        '    async handedBefore () {\n' +
        '        const response = await this.publicGetRows ();\n' +
        '        this.keep (response);\n' +
        "        const result = this.safeDict (response, 'result', {});\n" +
        "        const before = this.safeList (result, 'list');\n" +
        '        if (before === undefined) {\n' +
        '            return undefined;\n' +
        '        }\n' +
        '        return this.use (before);\n' +
        '    }\n' +
        '    fromParam (payload: Dict) {\n' +
        "        const entries = this.safeList (payload, 'entries');\n" +
        '        if (entries === undefined) {\n' +
        '            return undefined;\n' +
        '        }\n' +
        '        return this.use (entries);\n' +
        '    }\n' +
        '}\n' +
        'export default v;\n';
    let out = '';
    beforeAll (() => {
        fs.mkdirSync (path.join (root, 'base'), { recursive: true });
        fs.mkdirSync (path.join (root, 'abstract'), { recursive: true });
        fs.writeFileSync (path.join (root, 'base', 'Exchange.ts'), BASE);
        fs.writeFileSync (path.join (root, 'v.ts'), VENUE);
        const t = new Transpiler ({ verbose: false, go: {} });
        installCcxtGoHooks (t.goTranspiler);
        out = t.transpileGoByPath (path.join (root, 'v.ts')).content;
    });
    afterAll (() => fs.rmSync (path.join (__dirname, 'files', 'tmp-h28g30'), { recursive: true, force: true }));

    test ('positive: a list member of a response chain handed out only after the read', () => {
        expect (out).toMatch (/var orders \[\]any\n\s*orders, _ = result\["list"\]\.\(\[\]any\)/);
    });

    test ('positive: a list member of a branch-local endpoint response', () => {
        expect (out).toMatch (/var subAccounts \[\]any\n\s*subAccounts, _ = res\["sub_accounts"\]\.\(\[\]any\)/);
    });

    test ('negative: a response handed to a callee before the read gets no comma-ok read', () => {
        expect (out).not.toMatch (/before, _ = result/);
    });

    test ('negative: a parameter receiver gets no comma-ok read', () => {
        expect (out).not.toMatch (/entries, _ = payload/);
    });
});
