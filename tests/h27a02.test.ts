import fs from 'fs';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

describe ('go safeList (R, lit) on a JSON-origin map local prints the comma-ok list read', () => {
    const root = path.join (__dirname, 'files', 'tmp-h27a02', 'ts', 'src');
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
        '    async fromEndpoint () {\n' +
        '        const response = await this.publicGetRows ();\n' +
        "        const data = this.safeDict (response, 'result', {});\n" +
        "        const rows = this.safeList (data, 'rows');\n" +
        "        const code = this.safeString (response, 'code');\n" +
        '        for (let i = 0; i < rows.length; i++) {\n' +
        "            this.safeString (rows[i], 'id');\n" +
        '        }\n' +
        '        return [ code, rows.length ];\n' +
        '    }\n' +
        '    async writtenContainer () {\n' +
        '        let response = await this.publicGetRows ();\n' +
        "        response = this.keep ({ 'items': [] });\n" +
        "        this.safeString (response, 'code');\n" +
        "        const items = this.safeList (response, 'items');\n" +
        '        return items.length;\n' +
        '    }\n' +
        '    async handedOut () {\n' +
        '        const response = await this.publicGetRows ();\n' +
        '        this.keep (response);\n' +
        '        const others = this.safeList (response, \'others\');\n' +
        '        return others.length;\n' +
        '    }\n' +
        '    async infoAfter () {\n' +
        '        const response = await this.publicGetRows ();\n' +
        '        const res = this.safeDict (response, \'result\', {});\n' +
        '        const lines = this.safeList (res, \'lines\');\n' +
        '        return { \'info\': res, \'n\': lines.length };\n' +
        '    }\n' +
        '    async infoBefore () {\n' +
        '        const response = await this.publicGetRows ();\n' +
        '        const result = { \'info\': response };\n' +
        '        this.keep (result);\n' +
        '        const before = this.safeList (response, \'before\');\n' +
        '        return before.length;\n' +
        '    }\n' +
        '    async inLoop () {\n' +
        '        const response = await this.publicGetRows ();\n' +
        '        let n = 0;\n' +
        '        for (let i = 0; i < 2; i++) {\n' +
        '            const looped = this.safeList (response, \'looped\');\n' +
        '            n = n + looped.length;\n' +
        '            this.keep (response);\n' +
        '        }\n' +
        '        return n;\n' +
        '    }\n' +
        '    fromParam (payload: Dict) {\n' +
        "        const entries = this.safeList (payload, 'entries');\n" +
        '        return entries.length;\n' +
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
    afterAll (() => fs.rmSync (path.join (__dirname, 'files', 'tmp-h27a02'), { recursive: true, force: true }));

    test ('positive: the list member of a decoded response chain is read with the comma-ok assertion', () => {
        expect (out).toMatch (/var rows \[\]any\n\s*rows, _ = data\["rows"\]\.\(\[\]any\)/);
        expect (out).not.toMatch (/SafeListTyped\(data, "rows"\)/);
    });

    test ('negative: a container written with a non-JSON value keeps the wrap', () => {
        expect (out).not.toMatch (/items, _ = response\["items"\]/);
    });

    test ('negative: a response handed to a non-reader method keeps the wrap', () => {
        expect (out).not.toMatch (/others, _ = response\["others"\]/);
    });

    test ('positive: a response stored as info only after the read is still read natively', () => {
        expect (out).toMatch (/lines, _ = res\["lines"\]\.\(\[\]any\)/);
    });

    test ('negative: a response handed out before the read, or inside a loop, keeps the wrap', () => {
        expect (out).not.toMatch (/before, _ = response/);
        expect (out).not.toMatch (/looped, _ = response/);
    });

    test ('negative: a parameter receiver is not JSON-origin and keeps the wrap', () => {
        expect (out).not.toMatch (/entries, _ = payload/);
    });
});
