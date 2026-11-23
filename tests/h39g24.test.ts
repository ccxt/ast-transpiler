import fs from 'fs';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

describe ('go safeList (R, lit) on a `let R = undefined` local written only by awaited endpoints prints the comma-ok read', () => {
    const root = path.join (__dirname, 'files', 'tmp-h39g24', 'ts', 'src');
    const BASE =
        'export type Dict = { [key: string]: any };\n' +
        'class Exchange {\n' +
        '    request (path: any, api: any, method: any, params: any, config: any = undefined): Promise<any> { return params; }\n' +
        "    publicGetRows (params = {}): Promise<Dict> { return this.request ('rows', [ 'public' ], 'GET', params, { 'cost': 1 }); }\n" +
        '    safeList (o: any, k: any, d: any = undefined): any[] | undefined { return o; }\n' +
        '    safeDict (o: any, k: any, d: any = undefined): Dict | undefined { return o; }\n' +
        '    safeString (o: any, k: any): string { return o; }\n' +
        '    keep (t: any): any { return t; }\n' +
        '}\n' +
        'export { Exchange };\n';
    const VENUE =
        "import { Exchange, Dict } from './base/Exchange.js';\n" +
        'class v extends Exchange {\n' +
        '    async split (flag: boolean) {\n' +
        '        let response = undefined;\n' +
        '        if (flag) {\n' +
        '            response = await this.publicGetRows ();\n' +
        '        } else {\n' +
        '            response = await this.publicGetRows ();\n' +
        '        }\n' +
        "        const dataList = this.safeList (response, 'data');\n" +
        "        const dflt = this.safeList (response, 'rows', []);\n" +
        '        let tmp = undefined;\n' +
        "        tmp = this.safeList (response, 'other', []);\n" +
        '        this.keep (tmp);\n' +
        '        if (dataList !== undefined) {\n' +
        '            return dataList.length + dflt.length;\n' +
        '        }\n' +
        '        return dflt.length;\n' +
        '    }\n' +
        '    async otherWrite (flag: boolean) {\n' +
        '        let response = undefined;\n' +
        '        if (flag) {\n' +
        '            response = await this.publicGetRows ();\n' +
        '        } else {\n' +
        "            response = this.keep ({ 'data': [] });\n" +
        '        }\n' +
        "        const wList = this.safeList (response, 'data');\n" +
        '        return wList;\n' +
        '    }\n' +
        '    async nilCompared (flag: boolean) {\n' +
        '        let response = undefined;\n' +
        '        response = await this.publicGetRows ();\n' +
        '        if (response === undefined) {\n' +
        '            return undefined;\n' +
        '        }\n' +
        "        const cList = this.safeList (response, 'data');\n" +
        '        return cList;\n' +
        '    }\n' +
        '    async handedOut (flag: boolean) {\n' +
        '        let response = undefined;\n' +
        '        response = await this.publicGetRows ();\n' +
        '        this.keep (response);\n' +
        "        const hList = this.safeList (response, 'data');\n" +
        '        return hList;\n' +
        '    }\n' +
        '    async nilTested (flag: boolean) {\n' +
        '        let response = undefined;\n' +
        '        if (flag) {\n' +
        '            response = await this.publicGetRows ();\n' +
        '        }\n' +
        "        const nList = this.safeList (response, 'data');\n" +
        '        if (nList === undefined) {\n' +
        '            return 0;\n' +
        '        }\n' +
        '        return nList.length;\n' +
        '    }\n' +
        '}\n' +
        'export default v;\n';
    let out = '';
    beforeAll (() => {
        fs.mkdirSync (path.join (root, 'base'), { recursive: true });
        fs.writeFileSync (path.join (root, 'base', 'Exchange.ts'), BASE);
        fs.writeFileSync (path.join (root, 'v.ts'), VENUE);
        const t = new Transpiler ({ verbose: false, go: {} });
        installCcxtGoHooks (t.goTranspiler);
        out = t.transpileGoByPath (path.join (root, 'v.ts')).content;
    });
    afterAll (() => fs.rmSync (path.join (__dirname, 'files', 'tmp-h39g24'), { recursive: true, force: true }));

    test ('positive: the endpoint member is read with the comma-ok assertion, a dropped [] default stays dropped, beside a plain safe-reader use', () => {
        expect (out).toMatch (/var dataList \[\]any\n\s*dataList, _ = response\["data"\]\.\(\[\]any\)/);
        expect (out).toMatch (/var dflt \[\]any\n\s*dflt, _ = response\["rows"\]\.\(\[\]any\)/);
        expect (out).toMatch (/if dataList != nil \{/);
    });

    test ('negative: a let also written with a non-endpoint value does not print the comma-ok read', () => {
        expect (out).not.toMatch (/wList, _ = response/);
    });

    test ('negative: a let compared with nil does not print the comma-ok read', () => {
        expect (out).not.toMatch (/cList, _ = response/);
    });

    test ('negative: a let handed to a method that may write it does not print the comma-ok read', () => {
        expect (out).not.toMatch (/hList, _ = response/);
    });

    test ('nil: a let that may stay nil reads nil and the nil test is kept', () => {
        expect (out).toMatch (/nList, _ = response\["data"\]\.\(\[\]any\)/);
        expect (out).toMatch (/if nList == nil \{/);
    });
});
