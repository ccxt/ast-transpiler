import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

describe ('go: a [] -defaulted safeList of a Dict parameter every caller fills from decoded JSON reads by comma-ok', () => {
    const BASE =
        'export type Dict = { [key: string]: any };\n' +
        'export type List = any[];\n' +
        'export class Exchange {\n' +
        '    safeList (o: any, k: any, d: any[]): any[];\n' +
        '    safeList (o: any, k: any, d?: any[]): any[] | undefined;\n' +
        '    safeList (o: any, k: any, d: any = undefined): any[] | undefined { return o; }\n' +
        '    safeDict (o: any, k: any, d: any = undefined): any { return o; }\n' +
        '    safeString (o: any, k: any, d: any = undefined): any { return o; }\n' +
        '    extend (...a: any[]): any { return {}; }\n' +
        '}\n';
    const API =
        'export interface ImplicitAPI {\n' +
        '    publicGetX (params?: {}): Promise<implicitReturnType>;\n' +
        '}\n' +
        'export type implicitReturnType = any;\n';
    const cursor = (name: string) =>
        `    ${name} (result: Dict): List {\n` +
        "        const cursor = this.safeString (result, 'c');\n" +
        "        const data = this.safeList (result, 'w', []);\n" +
        '        const dataLength = data.length;\n' +
        '        if (cursor !== undefined && dataLength > 0) {\n' +
        '            const last: Dict = this.extend ({}, data[dataLength - 1]);\n' +
        "            last['c'] = cursor;\n" +
        '            data[dataLength - 1] = last;\n' +
        '        }\n' +
        '        return data;\n' +
        '    }\n';
    const VENUE =
        "import { Exchange, Dict, List } from './base/Exchange.js';\n" +
        "import { ImplicitAPI } from './abstract/v.js';\n" +
        'interface v extends ImplicitAPI {}\n' +
        'class v extends Exchange {\n' +
        '    async fetchA () {\n' +
        '        const response = await this.publicGetX ();\n' +
        "        return this.addA (this.safeDict (response, 'result', {}));\n" +
        '    }\n' +
        cursor ('addA') +
        '    async fetchB (params: Dict = {}) {\n' +
        "        return this.addB (this.safeDict (params, 'result', {}));\n" +
        '    }\n' +
        cursor ('addB') +
        '}\n';
    let out = '';
    beforeAll (() => {
        const tmp = fs.mkdtempSync (path.join (process.env.TMPDIR || os.tmpdir (), 'h55g30-'));
        try {
            const root = path.join (tmp, 'ts', 'src');
            fs.mkdirSync (path.join (root, 'base'), { recursive: true });
            fs.mkdirSync (path.join (root, 'abstract'), { recursive: true });
            fs.writeFileSync (path.join (root, 'base', 'Exchange.ts'), BASE);
            fs.writeFileSync (path.join (root, 'abstract', 'v.ts'), API);
            fs.writeFileSync (path.join (root, 'v.ts'), VENUE);
            const t = new Transpiler ({ verbose: false, go: {} });
            installCcxtGoHooks (t.goTranspiler);
            out = t.transpileGoByPath (path.join (root, 'v.ts')).content;
        } finally {
            fs.rmSync (tmp, { recursive: true, force: true });
        }
    });
    const fn = (name: string) => out.substring (out.indexOf (') ' + name + '(')).split ('\n}\n')[0];
    test ('JSON-filled parameter: comma-ok member read, empty default for missing / nil / wrong kind, native store (fails on the base printer)', () => {
        const f = fn ('AddA');
        expect (f).toContain ('var data []any\n');
        expect (f).toContain ('data, _ = result["w"].([]any)');
        expect (f).toContain ('data = []any{}');
        expect (f).toContain ('data[dataLength-1]');
        expect (f).not.toContain ('SafeListTyped');
        expect (f).not.toContain ('GetValue(data');
        expect (f).not.toContain ('AddElementToObject(data');
    });
    test ('negative: a caller that fills the parameter from user params keeps the wrap', () => {
        const f = fn ('AddB');
        expect (f).not.toContain ('data, _ = result["w"].([]any)');
    });
});
