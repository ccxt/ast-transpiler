import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

// `const xs = this.safeList (R, 'k', []) as List` on a `let R: Dict;` local written only by awaited endpoint calls
describe ('h43g12: `as List` member list read of an endpoint-arm response local', () => {
    const HEAD = 'type Dict = { [key: string]: any };\nclass BaseExchange {\n    safeDict (o: any, k: any, d: Dict = undefined): Dict { return d; }\n'
        + '    safeList (o: any, k: any, d: any[] = undefined): any[] { return d; }\n    safeString (o: any, k: any, d: string = undefined): string { return d; }\n    keep (o: any): any { return o; }\n}\nexport default BaseExchange;\n';
    const ABSTRACT = 'import _Exchange from \'../base/Exchange.js\';\ntype Dict = { [key: string]: any };\ntype List = any[];\ninterface Exchange {\n'
        + '    privateGetA (params?: {}): Promise<Dict>;\n    privateGetB (params?: {}): Promise<Dict>;\n}\nabstract class Exchange extends _Exchange {}\nexport default Exchange;\n';
    const print = (body: string): string => {
        const dir = fs.mkdtempSync (path.join (process.env.TMPDIR || os.tmpdir (), 'h43g12-'));
        try {
            fs.mkdirSync (path.join (dir, 'ts', 'src', 'base'), { 'recursive': true });
            fs.mkdirSync (path.join (dir, 'ts', 'src', 'abstract'), { 'recursive': true });
            fs.mkdirSync (path.join (dir, 'go', 'v4'), { 'recursive': true });
            fs.writeFileSync (path.join (dir, 'ts', 'src', 'base', 'Exchange.ts'), HEAD);
            fs.writeFileSync (path.join (dir, 'ts', 'src', 'abstract', 'x.ts'), ABSTRACT);
            fs.writeFileSync (path.join (dir, 'go', 'v4', 'x_api.go'), 'func (this *x) PrivateGetA(args ...any) <-chan EndpointResult[map[string]any] {\nfunc (this *x) PrivateGetB(args ...any) <-chan EndpointResult[map[string]any] {\n');
            const file = path.join (dir, 'ts', 'src', 'x.ts');
            fs.writeFileSync (file, 'import Exchange from \'./abstract/x.js\';\ntype Dict = { [key: string]: any };\ntype List = any[];\nclass x extends Exchange {\n' + body + '}\n');
            const t: any = new Transpiler ({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 } } });
            installCcxtGoHooks (t.goTranspiler);
            return t.transpileGoByPath (file).content;
        } finally {
            fs.rmSync (dir, { 'recursive': true, 'force': true });
        }
    };
    const fn = (second: string, dflt = '[]', tail = '') => '    async g (spot: boolean, params = {}) {\n        let response: Dict;\n'
        + '        if (spot) {\n            response = await this.privateGetA (params);\n        } else {\n            ' + second + '\n        }\n' + tail
        + '        const rows = this.safeList (response, \'data\', ' + dflt + ') as List;\n        const out: List = [];\n'
        + '        for (let i = 0; i < rows.length; i++) {\n            out.push (this.safeString (rows[i], \'k\'));\n        }\n        return out;\n    }\n';
    test ('positive: every write an awaited endpoint, `as List` read: comma-ok member read (fails on the base printer)', () => {
        const out = print (fn ('response = await this.privateGetB (params);'));
        expect (out).toContain ('rows, _ = response["data"].([]any)');
        expect (out).not.toContain ('SafeListTyped(response, "data")');
    });
    test ('positive: a nil arm (no write) reads nil through the comma-ok read on a nil map', () => {
        expect (print (fn ('return [];'))).toContain ('rows, _ = response["data"].([]any)');
    });
    test ('negative: a write of another value keeps the helper', () => {
        expect (print (fn ('response = this.keep (params);'))).not.toContain ('response["data"].([]any)');
    });
    test ('negative: a write through the local keeps the helper', () => {
        expect (print (fn ('response = await this.privateGetB (params);', '[]', '        response[\'data\'] = [];\n'))).not.toContain ('response["data"].([]any)');
    });
    test ('negative: a non-empty default keeps the helper', () => {
        expect (print (fn ('response = await this.privateGetB (params);', '[ 1 ]'))).not.toContain ('response["data"].([]any)');
    });
});
