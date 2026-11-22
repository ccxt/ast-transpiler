import fs from 'fs';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

describe ('go safeList on a dict read natively out of a JSON-origin list prints the comma-ok list read', () => {
    const root = path.join (__dirname, 'files', 'tmp-h35p07', 'ts', 'src');
    const BASE =
        'export type Dict = { [key: string]: any };\n' +
        'export type List = any[];\n' +
        'export class Exchange {\n' +
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
        '}\n';
    const API =
        'export interface ImplicitAPI {\n' +
        '    publicGetRows (params?: {}): Promise<implicitReturnType>;\n' +
        '}\n' +
        'export type implicitReturnType = any;\n';
    const VENUE =
        "import { Exchange, Dict } from './base/Exchange.js';\n" +
        "import { ImplicitAPI } from './abstract/v.js';\n" +
        'interface v extends ImplicitAPI {}\n' +
        'class v extends Exchange {\n' +
        '    async loopRows () {\n' +
        '        const response = await this.publicGetRows ();\n' +
        "        const data = this.safeDict (response, 'data', {});\n" +
        "        const accounts = this.safeList (data, 'accounts', []);\n" +
        '        let n = 0;\n' +
        '        for (let i = 0; i < accounts.length; i++) {\n' +
        '            const entry = this.safeDict (accounts, i);\n' +
        "            const coins = this.safeList (entry, 'coins', []);\n" +
        '            n = n + coins.length;\n' +
        "            const raw = this.safeList (entry, 'raw');\n" +
        '            n = n + raw.length;\n' +
        "            this.safeString (entry, 'id');\n" +
        '        }\n' +
        '        return n;\n' +
        '    }\n' +
        '    async firstRow () {\n' +
        '        const response = await this.publicGetRows ();\n' +
        "        const accounts = this.safeList (response, 'accounts', []);\n" +
        '        const first = this.safeDict (accounts, 0, {});\n' +
        "        const items = this.safeList (first, 'items', []);\n" +
        "        this.safeString (first, 'id');\n" +
        '        return items.length;\n' +
        '    }\n' +
        '    async rowWritten () {\n' +
        '        const response = await this.publicGetRows ();\n' +
        "        const accounts = this.safeList (response, 'accounts', []);\n" +
        '        accounts[0] = this.keep ({});\n' +
        '        const firstW = this.safeDict (accounts, 0, {});\n' +
        "        const itemsW = this.safeList (firstW, 'itemsW', []);\n" +
        '        return itemsW.length;\n' +
        '    }\n' +
        '    fromParam (rows: any[]) {\n' +
        '        const firstP = this.safeDict (rows, 0, {});\n' +
        "        const itemsP = this.safeList (firstP, 'itemsP', []);\n" +
        '        return itemsP.length;\n' +
        '    }\n' +
        '}\n' +
        'export default v;\n';
    let out = '';
    beforeAll (() => {
        fs.mkdirSync (path.join (root, 'base'), { recursive: true });
        fs.mkdirSync (path.join (root, 'abstract'), { recursive: true });
        fs.writeFileSync (path.join (root, 'base', 'Exchange.ts'), BASE);
        fs.writeFileSync (path.join (root, 'abstract', 'v.ts'), API);
        fs.writeFileSync (path.join (root, 'v.ts'), VENUE);
        const t = new Transpiler ({ verbose: false, go: {} });
        installCcxtGoHooks (t.goTranspiler);
        out = t.transpileGoByPath (path.join (root, 'v.ts')).content;
    });
    afterAll (() => fs.rmSync (path.join (__dirname, 'files', 'tmp-h35p07'), { recursive: true, force: true }));

    test ('positive: a row read by index out of a JSON-origin list is JSON-origin, its list member reads comma-ok', () => {
        expect (out).toMatch (/items, _ = first\["items"\]\.\(\[\]any\)/);
        expect (out).not.toMatch (/SafeListTyped\(first, "items"\)/);
    });

    test ('negative: a list written through keeps the wrap', () => {
        expect (out).toMatch (/SafeListTyped\(firstW, "itemsW"\)/);
    });

    test ('negative: a row of a parameter list keeps the wrap', () => {
        expect (out).toMatch (/SafeListTyped\(firstP, "itemsP"\)/);
    });
});
