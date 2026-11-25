import fs from 'fs';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

describe ('go safeDict / safeList on a map local declared nil first and written later prints the comma-ok read', () => {
    const root = path.join (__dirname, 'files', 'tmp-h40g23', 'ts', 'src');
    const BASE =
        'export type Dict = { [key: string]: any };\n' +
        'class Exchange {\n' +
        '    request (path: any, api: any, method: any, params: any, config: any = undefined): Promise<any> { return params; }\n' +
        "    publicGetRows (params = {}): Promise<Dict> { return this.request ('rows', [ 'public' ], 'GET', params, { 'cost': 1 }); }\n" +
        "    publicGetCols (params = {}): Promise<Dict> { return this.request ('cols', [ 'public' ], 'GET', params, { 'cost': 1 }); }\n" +
        '    safeList (o: any, k: any, d: any = undefined): any[] | undefined { return o; }\n' +
        '    safeDict (o: any, k: any, d: any = undefined): Dict | undefined { return o; }\n' +
        '    safeString (o: any, k: any): string { return o; }\n' +
        '    market (s: string): Dict { return {}; }\n' +
        '    keep (t: any): any { return t; }\n' +
        '}\n' +
        'export { Exchange };\n';
    const body = (name: string, write2: string, extra: string, read: string) =>
        `    async ${name} (flag: boolean, symbol: string) {\n` +
        '        let r = undefined;\n' +
        '        if (flag) {\n' +
        '            r = await this.publicGetRows ();\n' +
        '        } else {\n' +
        `            r = ${write2};\n` +
        '        }\n' +
        extra +
        `        ${read}\n` +
        '    }\n';
    const VENUE =
        "import { Exchange, Dict } from './base/Exchange.js';\n" +
        'class v extends Exchange {\n' +
        body ('nilTested', 'await this.publicGetCols ()', "        if (r === undefined) {\n            return undefined;\n        }\n        if ('tick' in r) {\n            const tick = this.safeDict (r, 'tick');\n            return this.safeString (tick, 'x');\n        }\n", 'return undefined;') +
        body ('mixed', 'this.market (symbol)', '', "const mixedD = this.safeDict (r, 'tick');\n        return this.safeString (mixedD, 'x');") +
        body ('handed', 'await this.publicGetCols ()', '        this.keep (r);\n', "const handedD = this.safeDict (r, 'tick');\n        return this.safeString (handedD, 'x');") +
        '    async reassignedMarket (symbol: string, code: string) {\n' +
        '        let market = undefined;\n' +
        '        if (symbol !== undefined) {\n' +
        '            market = this.market (symbol);\n' +
        '        }\n' +
        '        market = this.market (code);\n' +
        "        const info = this.safeDict (market, 'info');\n" +
        "        return this.safeString (info, 'x');\n" +
        '    }\n' +
        '    async marketList (symbol: string) {\n' +
        '        let market = undefined;\n' +
        '        market = this.market (symbol);\n' +
        "        const ml = this.safeList (market, 'tiers');\n" +
        '        return ml;\n' +
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
    afterAll (() => fs.rmSync (path.join (__dirname, 'files', 'tmp-h40g23'), { recursive: true, force: true }));

    test ('positive: an endpoint-only let with a nil test and an `in` test reads the dict member natively', () => {
        expect (out).toContain ('var tick, _ = r["tick"].(map[string]any)');
        expect (out).not.toContain ('var tick map[string]any = SafeMapTyped(r, "tick")');
    });
    test ('positive: a reassigned `market` local written only by this.market reads the dict member natively', () => {
        expect (out).toContain ('var info, _ = market["info"].(map[string]any)');
    });
    test ('nil: the nil test of the read is kept beside the comma-ok read', () => {
        expect (out).toMatch (/if r == nil|IsEqual\(r, nil\)/);
    });
    test ('negative: a let written by an endpoint and by this.market keeps the reader', () => {
        expect (out).not.toContain ('mixedD, _ = r[');
    });
    test ('negative: a let handed to another method keeps the reader', () => {
        expect (out).not.toContain ('handedD, _ = r[');
    });
    test ('negative: a list read off a market local keeps the reader (the list rule takes endpoint lets only)', () => {
        expect (out).not.toContain ('ml, _ = market[');
    });
});
