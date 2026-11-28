import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

const HEAD = 'type Dict = { [key: string]: any };\nclass BaseExchange {\n    safeDict (o: any, k: any, d: Dict = undefined): Dict { return d; }\n'
    + '    safeString (o: any, k: any, d: string = undefined): string { return d; }\n    parseOrders (o: any): any { return o; }\n    keep (o: any): any { return o; }\n}\nexport default BaseExchange;\n';
const ABSTRACT = 'import _Exchange from \'../base/Exchange.js\';\ntype Dict = { [key: string]: any };\ntype List = any[];\ninterface Exchange {\n'
    + '    privateGetA (params?: {}): Promise<Dict>;\n    privateGetB (params?: {}): Promise<Dict>;\n    privateGetC (params?: {}): Promise<any>;\n}\nabstract class Exchange extends _Exchange {}\nexport default Exchange;\n';
export const print = (body: string): string => {
    const dir = fs.mkdtempSync (path.join (process.env.TMPDIR || os.tmpdir (), 'h42g23-'));
    try {
        fs.mkdirSync (path.join (dir, 'ts', 'src', 'base'), { 'recursive': true });
        fs.mkdirSync (path.join (dir, 'ts', 'src', 'abstract'), { 'recursive': true });
        fs.mkdirSync (path.join (dir, 'go', 'v4'), { 'recursive': true });
        fs.writeFileSync (path.join (dir, 'ts', 'src', 'base', 'Exchange.ts'), HEAD);
        fs.writeFileSync (path.join (dir, 'ts', 'src', 'abstract', 'x.ts'), ABSTRACT);
        fs.writeFileSync (path.join (dir, 'go', 'v4', 'x_api.go'), 'func (this *x) PrivateGetA(args ...any) <-chan EndpointResult[map[string]any] {\nfunc (this *x) PrivateGetB(args ...any) <-chan EndpointResult[map[string]any] {\n');
        const file = path.join (dir, 'ts', 'src', 'x.ts');
        fs.writeFileSync (file, 'import Exchange from \'./abstract/x.js\';\nclass x extends Exchange {\n' + body + '}\n');
        const t: any = new Transpiler ({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 } } });
        installCcxtGoHooks (t.goTranspiler);
        return t.transpileGoByPath (file).content;
    } finally {
        fs.rmSync (dir, { 'recursive': true, 'force': true });
    }
};
const fn = (use: string) => '    async f (params = {}, a = false) {\n        let response = undefined;\n        if (a) {\n            response = await this.privateGetA (params);\n        } else {\n            response = await this.privateGetB (params);\n        }\n'
    + use + '        const data = this.safeDict (response, \'data\');\n        return this.safeString (data, \'id\');\n    }\n';
const fnC = '    async f (params = {}, a = false) {\n        let response = undefined;\n        if (a) {\n            response = await this.privateGetA (params);\n        } else {\n            response = await this.privateGetC (params);\n        }\n'
    + '        const data = this.safeDict (response, \'data\');\n        return this.safeString (data, \'id\');\n    }\n';
// `const d = this.safeDict (R, 'k')` with R a nil-seeded let whose writes are Promise<Dict> endpoints (Go: `var R map[string]any = nil`)
describe ('h42g23: dict read on a nil-seeded endpoint-joined map let', () => {
    test ('receiver also handed to a parser: comma-ok read', () => {
        const out = print (fn ('        if (a) {\n            return this.parseOrders (response);\n        }\n'));
        expect (out).toContain ('\tvar response map[string]any = nil\n');
        expect (out).toContain ('\tvar data, _ = response["data"].(map[string]any)\n');
        expect (out).not.toContain ('SafeMapTyped(');
    });
    test ('receiver tested with `in`: comma-ok read', () => {
        const out = print (fn ('        if (\'tick\' in response) {\n            return 1;\n        }\n'));
        expect (out).toContain ('\tvar data, _ = response["data"].(map[string]any)\n');
        expect (out).not.toContain ('SafeMapTyped(');
    });
    test ('a write from an untyped endpoint keeps the helper', () => {
        const out = print (fnC);
        expect (out).not.toContain ('response["data"].(map[string]any)');
    });
    test ('a receiver handed to a callee that is not returned keeps the helper', () => {
        const out = print (fn ('        this.keep (response);\n'));
        expect (out).not.toContain ('var data, _ = response["data"].(map[string]any)\n');
    });
    test ('a non-{} default keeps the reader', () => {
        const out = print (fn ('        if (a) {\n            return this.parseOrders (response);\n        }\n').replace ('this.safeDict (response, \'data\')', 'this.safeDict (response, \'data\', response)'));
        expect (out).not.toContain ('var data, _ = response["data"].(map[string]any)\n');
    });
});
