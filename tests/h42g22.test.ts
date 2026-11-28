import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

// a member list read of a `let R: Dict;` local written only by awaited endpoint calls in if / else arms
describe ('h42g22: endpoint-arm response local', () => {
    const HEAD = 'type Dict = { [key: string]: any };\nclass BaseExchange {\n    safeDict (o: any, k: any, d: Dict = undefined): Dict { return d; }\n'
        + '    safeList (o: any, k: any, d: any[] = undefined): any[] { return d; }\n    safeString (o: any, k: any, d: string = undefined): string { return d; }\n    keep (o: any): any { return o; }\n}\nexport default BaseExchange;\n';
    const ABSTRACT = 'import _Exchange from \'../base/Exchange.js\';\ntype Dict = { [key: string]: any };\ntype List = any[];\ninterface Exchange {\n'
        + '    privateGetA (params?: {}): Promise<Dict>;\n    privateGetB (params?: {}): Promise<Dict>;\n}\nabstract class Exchange extends _Exchange {}\nexport default Exchange;\n';
    const print = (body: string): string => {
        const dir = fs.mkdtempSync (path.join (process.env.TMPDIR || os.tmpdir (), 'h42g22-'));
        try {
            fs.mkdirSync (path.join (dir, 'ts', 'src', 'base'), { 'recursive': true });
            fs.mkdirSync (path.join (dir, 'ts', 'src', 'abstract'), { 'recursive': true });
            fs.mkdirSync (path.join (dir, 'go', 'v4'), { 'recursive': true });
            fs.writeFileSync (path.join (dir, 'ts', 'src', 'base', 'Exchange.ts'), HEAD);
            fs.writeFileSync (path.join (dir, 'ts', 'src', 'abstract', 'x.ts'), ABSTRACT);
            fs.writeFileSync (path.join (dir, 'go', 'v4', 'x_api.go'), 'func (this *x) PrivateGetA(args ...any) <-chan EndpointResult[map[string]any] {\nfunc (this *x) PrivateGetB(args ...any) <-chan EndpointResult[map[string]any] {\n');
            const file = path.join (dir, 'ts', 'src', 'x.ts');
            fs.writeFileSync (file, 'import Exchange from \'./abstract/x.js\';\ntype Dict = { [key: string]: any };\nclass x extends Exchange {\n' + body + '}\n');
            const t: any = new Transpiler ({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 } } });
            installCcxtGoHooks (t.goTranspiler);
            return t.transpileGoByPath (file).content;
        } finally {
            fs.rmSync (dir, { 'recursive': true, 'force': true });
        }
    };
    const fn = (second: string, tail = '') => '    async g (spot: boolean, params = {}) {\n        let response: Dict;\n'
        + '        if (spot) {\n            response = await this.privateGetA (params);\n        } else {\n            ' + second + '\n        }\n' + tail
        + '        let data: Dict = undefined;\n        if (spot) {\n            const rows = this.safeList (response, \'data\');\n            data = this.safeDict (rows, 0, {});\n'
        + '        } else {\n            data = this.safeDict (response, \'data\', {});\n        }\n        return this.safeString (data, \'k\');\n    }\n';
    test ('every write an awaited endpoint: comma-ok member read', () => {
        const out = print (fn ('response = await this.privateGetB (params);'));
        expect (out).toContain ('rows, _ = response["data"].([]any)');
        expect (out).not.toContain ('SafeListTyped(response, "data")');
    });
    test ('a write of another value keeps the wrap', () => {
        expect (print (fn ('response = this.keep (params);'))).toContain ('SafeListTyped(response, "data")');
    });
    test ('a write through the local keeps the wrap', () => {
        expect (print (fn ('response = await this.privateGetB (params);', '        response[\'data\'] = [];\n'))).toContain ('SafeListTyped(response, "data")');
    });
    test ('a nil default (no write in one arm) still reads nil: comma-ok on a nil map', () => {
        const out = print (fn ('return 0;'));
        expect (out).toContain ('rows, _ = response["data"].([]any)');
    });
});
