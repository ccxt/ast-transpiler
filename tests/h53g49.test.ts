import fs from 'fs';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

describe ('go Dict[] local rebound to a [] -defaulted safeList of a decoded map reads natively', () => {
    const root = path.join (__dirname, 'files', 'tmp-h53g49', 'ts', 'src');
    const BASE =
        'export type Dict = { [key: string]: any };\n' +
        'export class Exchange {\n' +
        '    safeList (o: any, k: any, d: any[]): any[];\n' +
        '    safeList (o: any, k: any, d?: any[]): any[] | undefined;\n' +
        '    safeList (o: any, k: any, d: any = undefined): any[] | undefined { return o; }\n' +
        '    safeDict (o: any, k: any, d: any = undefined): any { return o; }\n' +
        '    extend (...a: any[]): any { return a; }\n' +
        '    keep (t: any): any { return t; }\n' +
        '}\n';
    const API =
        'export interface ImplicitAPI {\n' +
        '    privateGetFutures (params?: {}): Promise<implicitReturnType>;\n' +
        '}\n' +
        'export type implicitReturnType = any;\n';
    const VENUE =
        "import { Exchange, Dict } from './base/Exchange.js';\n" +
        "import { ImplicitAPI } from './abstract/v.js';\n" +
        'interface v extends ImplicitAPI {}\n' +
        'class v extends Exchange {\n' +
        '    async pages (params: Dict = {}) {\n' +
        '        const response = await this.privateGetFutures (params);\n' +
        "        const dataDict = this.safeDict (response, 'data');\n" +
        '        let items: Dict[] = [];\n' +
        '        if (dataDict !== undefined) {\n' +
        "            items = this.safeList (dataDict, 'items', []);\n" +
        '            let itemsLength = items.length;\n' +
        '            if (itemsLength === 0) {\n' +
        "                items = this.safeList (dataDict, 'results', []);\n" +
        '                itemsLength = items.length;\n' +
        '            }\n' +
        '            if ((itemsLength === 0) && (\'symbol\' in dataDict)) {\n' +
        '                items = [ dataDict ];\n' +
        '            }\n' +
        '        } else {\n' +
        "            items = this.safeList (response, 'data', []);\n" +
        '        }\n' +
        '        return items.length;\n' +
        '    }\n' +
        '    async loop (params: Dict = {}) {\n' +
        '        const aggregated: Dict[] = [];\n' +
        '        let offset = 0;\n' +
        '        let paging = true;\n' +
        '        while (paging) {\n' +
        "            const q = this.extend ({ 'limit': 100, 'offset': offset }, params);\n" +
        '            const response = await this.privateGetFutures (q);\n' +
        "            const dataDict = this.safeDict (response, 'data');\n" +
        '            let items: Dict[] = [];\n' +
        '            if (dataDict !== undefined) {\n' +
        "                items = this.safeList (dataDict, 'items', []);\n" +
        '                // hoisted\n' +
        '                let itemsLength = items.length;\n' +
        '                if (itemsLength === 0) {\n' +
        "                    items = this.safeList (dataDict, 'results', []);\n" +
        '                    itemsLength = items.length;\n' +
        '                }\n' +
        "                if ((itemsLength === 0) && ('symbol' in dataDict)) {\n" +
        '                    items = [ dataDict ];\n' +
        '                }\n' +
        '            } else {\n' +
        "                items = this.safeList (response, 'data', []);\n" +
        '            }\n' +
        '            const numItems = items.length;\n' +
        '            if (numItems === 0) {\n' +
        '                paging = false;\n' +
        '                break;\n' +
        '            }\n' +
        '            for (let i = 0; i < numItems; i++) {\n' +
        '                aggregated.push (items[i]);\n' +
        '            }\n' +
        '            offset = offset + 100;\n' +
        '        }\n' +
        '        return aggregated;\n' +
        '    }\n' +
        '    notJson (data: any, flag: boolean) {\n' +
        '        let rows: Dict[] = [];\n' +
        '        if (flag) {\n' +
        "            rows = this.safeList (data, 'rows', []);\n" +
        '        }\n' +
        '        return rows.length;\n' +
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
    afterAll (() => fs.rmSync (path.join (__dirname, 'files', 'tmp-h53g49'), { recursive: true, force: true }));
    const body = (name: string) => out.substring (out.indexOf (name)).split ('\n}\n')[0];
    test ('a rebind from a decoded JSON map member reads natively', () => {
        const f = body ('pagesBody(ch chan');
        expect (f).toContain ('items, _ = dataDict["items"].([]any)');
        expect (f).toContain ('items, _ = dataDict["results"].([]any)');
        expect (f).not.toContain ('ArrayTyped(this.SafeList(dataDict');
        expect (f).toContain ('if items == nil {');
    });
    test ('the same rebind inside a loop that declares the map reads natively', () => {
        const f = body ('loopBody(ch chan');
        expect (f).toContain ('items, _ = dataDict["items"].([]any)');
        expect (f).not.toContain ('ArrayTyped(this.SafeList(dataDict');
    });
    test ('a receiver that is not a decoded map keeps the wrap', () => {
        expect (body ('func (this *v) NotJson')).toContain ('rows = ArrayTyped(this.SafeList(data, "rows", []any{}))');
    });
});
