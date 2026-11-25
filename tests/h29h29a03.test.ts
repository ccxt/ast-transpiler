import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

// a hand-written scalar reader only copies a scalar out of its first argument: the endpoint local stays JSON origin
describe ('h29a03: a JSON-origin local handed to a scalar reader before the read stays JSON origin', () => {
    const HEAD = 'type Dict = { [key: string]: any };\nclass BaseExchange {\n    safeDict (o: any, k: any, d: Dict = undefined): Dict { return d; }\n'
        + '    safeString (o: any, k: any, d: string = undefined): string { return d; }\n    safeInteger (o: any, k: any, d: number = undefined): number { return d; }\n    safeValue (o: any, k: any, d: any = undefined): any { return d; }\n    keep (o: any): any { return o; }\n}\nexport default BaseExchange;\n';
    const ABSTRACT = 'import _Exchange from \'../base/Exchange.js\';\ntype Dict = { [key: string]: any };\ninterface Exchange {\n'
        + '    privateGetA (params?: {}): Promise<Dict>;\n    privateGetB (params?: {}): Promise<any>;\n}\nabstract class Exchange extends _Exchange {}\nexport default Exchange;\n';
    const print = (body: string): string => {
        const dir = fs.mkdtempSync (path.join (process.env.TMPDIR || os.tmpdir (), 'h29a03-'));
        try {
            fs.mkdirSync (path.join (dir, 'ts', 'src', 'base'), { 'recursive': true });
            fs.mkdirSync (path.join (dir, 'ts', 'src', 'abstract'), { 'recursive': true });
            fs.mkdirSync (path.join (dir, 'go', 'v4'), { 'recursive': true });
            fs.writeFileSync (path.join (dir, 'ts', 'src', 'base', 'Exchange.ts'), HEAD);
            fs.writeFileSync (path.join (dir, 'ts', 'src', 'abstract', 'x.ts'), ABSTRACT);
            fs.writeFileSync (path.join (dir, 'go', 'v4', 'x_api.go'), 'func (this *x) PrivateGetA(args ...any) <-chan EndpointResult[map[string]any] {\n');
            const file = path.join (dir, 'ts', 'src', 'x.ts');
            fs.writeFileSync (file, 'import Exchange from \'./abstract/x.js\';\nclass x extends Exchange {\n' + body + '}\n');
            const t: any = new Transpiler ({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 } } });
            installCcxtGoHooks (t.goTranspiler);
            return t.transpileGoByPath (file).content;
        } finally {
            fs.rmSync (dir, { 'recursive': true, 'force': true });
        }
    };
    const fn = (decl: string, writes: string, use = '') => '    async f (params = {}) {\n        ' + decl + '\n' + writes + use
        + '        const data = this.safeDict (response, \'data\');\n        return data;\n    }\n';
    const branches = '        if (params[\'a\']) {\n            response = await this.privateGetA (params);\n        } else {\n            response = await this.privateGetA ({});\n        }\n';
    const native = 'var data, _ = response["data"].(map[string]any)';

    const scalar = '        const ts = this.safeInteger (response, \'time\');\n        const code = this.safeString (response, \'code\');\n';

    test ('endpoint local read by safeInteger / safeString first: comma-ok read', () => {
        const out = print (fn ('let response = undefined;', branches, scalar));
        expect (out).toContain (native);
        expect (out).not.toContain ('SafeMapTyped(response');
    });
    test ('awaited const read by a scalar reader first: comma-ok read', () => {
        const out = print (fn ('const response = await this.privateGetA (params);', '', scalar));
        expect (out).toContain (native);
    });
    test ('a scalar read plus a hand-off to a writer keeps the wrap', () => {
        const out = print (fn ('let response = undefined;', branches, scalar + '        this.keep (response);\n'));
        expect (out).not.toContain (native);
    });
    test ('a non-scalar reader (safeValue may hand the member out) keeps the wrap', () => {
        const out = print (fn ('let response = undefined;', branches, '        const v = this.safeValue (response, \'x\');\n'));
        expect (out).not.toContain (native);
    });
    test ('a scalar read on an untyped (any) endpoint local keeps the wrap', () => {
        const out = print (fn ('let response = undefined;', '        response = await this.privateGetB (params);\n', scalar));
        expect (out).not.toContain ('response["data"].(map[string]any)');
    });
    test ('a non-endpoint write next to the scalar read keeps the wrap', () => {
        const out = print (fn ('let response = undefined;', branches + '        response = this.keep (params);\n', scalar));
        expect (out).not.toContain (native);
    });
});
