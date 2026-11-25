import fs from 'fs';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

describe ('go safeDict on a typed map with a kept {} default or a *string key prints the comma-ok read', () => {
    const root = path.join (__dirname, 'files', 'tmp-h41g17', 'ts', 'src');
    const BASE =
        'export type Dict = { [key: string]: any };\n' +
        'export type Str = string | undefined;\n' +
        'class Exchange {\n' +
        '    request (path: any, api: any, method: any, params: any, config: any = undefined): Promise<any> { return params; }\n' +
        "    publicGetRows (params = {}): Promise<Dict> { return this.request ('rows', [ 'public' ], 'GET', params, { 'cost': 1 }); }\n" +
        "    publicGetCols (params = {}): Promise<Dict> { return this.request ('cols', [ 'public' ], 'GET', params, { 'cost': 1 }); }\n" +
        '    safeDict (o: any, k: any, d: any = undefined): Dict | undefined { return o; }\n' +
        '    safeString (o: any, k: any, d: any = undefined): Str { return o; }\n' +
        '    indexBy (o: any, k: any): Dict { return {}; }\n' +
        '    keep (t: any): any { return t; }\n' +
        '}\n' +
        'export { Exchange };\n';
    const VENUE =
        "import { Exchange, Dict, Str } from './base/Exchange.js';\n" +
        'class v extends Exchange {\n' +
        '    keptDefault (rows: any) {\n' +
        "        const byId = this.indexBy (rows, 'id');\n" +
        '        const keys = Object.keys (byId);\n' +
        '        const out = [];\n' +
        '        for (let j = 0; j < keys.length; j++) {\n' +
        '            const networkId = keys[j];\n' +
        '            const keptD = this.safeDict (byId, networkId, {});\n' +
        '            out.push (this.keep (keptD));\n' +
        '        }\n' +
        '        return out;\n' +
        '    }\n' +
        '    ptrKey (rows: any, raw: any) {\n' +
        "        const byId: Dict = this.indexBy (rows, 'id');\n" +
        "        const baseId = this.safeString (raw, 'base');\n" +
        '        const ptrD = this.safeDict (byId, baseId);\n' +
        "        return this.safeString (ptrD, 'x');\n" +
        '    }\n' +
        '    ptrKeyKept (rows: any, raw: any) {\n' +
        "        const byId: Dict = this.indexBy (rows, 'id');\n" +
        "        const code = this.safeString (raw, 'code');\n" +
        '        const bothD = this.safeDict (byId, code, {});\n' +
        '        return this.keep (bothD);\n' +
        '    }\n' +
        '    untypedReceiver (response: any) {\n' +
        "        const anyD = this.safeDict (response, 'data', {});\n" +
        '        return this.keep (anyD);\n' +
        '    }\n' +
        '    async letReceiver (flag: boolean) {\n' +
        '        let response = undefined;\n' +
        '        if (flag) {\n' +
        '            response = await this.publicGetRows ();\n' +
        '        } else {\n' +
        '            response = await this.publicGetCols ();\n' +
        '        }\n' +
        "        const letD = this.safeDict (response, 'data', {});\n" +
        '        return this.keep (letD);\n' +
        '    }\n' +
        '    writtenLocal (rows: any) {\n' +
        "        const byId: Dict = this.indexBy (rows, 'id');\n" +
        "        const writtenD = this.safeDict (byId, 'data', {});\n" +
        "        writtenD['x'] = 1;\n" +
        '        return writtenD;\n' +
        '    }\n' +
        '    otherDefault (rows: any, fallback: any) {\n' +
        "        const byId: Dict = this.indexBy (rows, 'id');\n" +
        "        const otherD = this.safeDict (byId, 'data', fallback);\n" +
        "        return this.safeString (otherD, 'x');\n" +
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
        if (process.env.H41G17_PROBE) { fs.writeFileSync (process.env.H41G17_PROBE, out); }
    });
    afterAll (() => fs.rmSync (path.join (__dirname, 'files', 'tmp-h41g17'), { recursive: true, force: true }));

    test ('positive: a kept {} default reads natively and puts the default back on nil', () => {
        expect (out).toContain ('var keptD, _ = byId[networkId].(map[string]any)\n\t\tif keptD == nil {\n\t\t\tkeptD = map[string]any{}\n\t\t}');
        expect (out).not.toContain ('keptD map[string]any = ');
    });
    test ('positive: a *string key is dereferenced after its nil test', () => {
        expect (out).toContain ('var ptrD map[string]any\n\tif baseId != nil {\n\t\tptrD, _ = byId[*baseId].(map[string]any)\n\t}');
    });
    test ('nil: a nil *string key with a kept default ends with the default', () => {
        expect (out).toContain ('if code != nil {\n\t\tbothD, _ = byId[*code].(map[string]any)\n\t}\n\tif bothD == nil {\n\t\tbothD = map[string]any{}\n\t}');
    });
    test ('negative: an untyped receiver keeps the reader', () => {
        expect (out).not.toContain ('anyD, _ =');
    });
    test ('negative: a let declared nil first and written by endpoints keeps the reader (Go may declare it any)', () => {
        expect (out).not.toContain ('letD, _ =');
    });
    test ('negative: a local whose keys are written keeps the reader', () => {
        expect (out).not.toContain ('writtenD, _ =');
    });
    test ('negative: a default that is not {} keeps the reader', () => {
        expect (out).not.toContain ('otherD, _ =');
    });
});
