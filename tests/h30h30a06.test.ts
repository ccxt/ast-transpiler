import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

// an info slot of a literal that leaves through return runs after every read: the endpoint local stays JSON origin
describe ('h30a06: a JSON-origin local stored as info in a returned literal stays JSON origin', () => {
    const HEAD = 'type Dict = { [key: string]: any };\nclass BaseExchange {\n    safeDict (o: any, k: any, d: Dict = undefined): Dict { return d; }\n'
        + '    safeString (o: any, k: any, d: string = undefined): string { return d; }\n    safeInteger (o: any, k: any, d: number = undefined): number { return d; }\n    safeValue (o: any, k: any, d: any = undefined): any { return d; }\n    keep (o: any): any { return o; }\n}\nexport default BaseExchange;\n';
    const ABSTRACT = 'import _Exchange from \'../base/Exchange.js\';\ntype Dict = { [key: string]: any };\ninterface Exchange {\n'
        + '    privateGetA (params?: {}): Promise<Dict>;\n    privateGetB (params?: {}): Promise<any>;\n}\nabstract class Exchange extends _Exchange {}\nexport default Exchange;\n';
    const print = (body: string): string => {
        const dir = fs.mkdtempSync (path.join (process.env.TMPDIR || os.tmpdir (), 'h30a06-'));
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

    const fnr = (decl: string, writes: string, tail: string) => '    async f (params = {}) {\n        ' + decl + '\n' + writes
        + '        const data = this.safeDict (response, \'data\');\n        const code = this.safeString (data, \'code\');\n' + tail + '    }\n';
    const ret = '        return { \'info\': response, \'code\': code };\n';

    test ('endpoint local stored as info in the returned literal: comma-ok read', () => {
        const out = print (fnr ('let response = undefined;', branches, ret));
        expect (out).toContain (native);
        expect (out).not.toContain ('SafeMapTyped(response');
    });
    test ('info literal handed to a returned call: comma-ok read', () => {
        const out = print (fnr ('let response = undefined;', branches, '        return this.keep ({ \'info\': response, \'code\': code });\n'));
        expect (out).toContain (native);
    });
    test ('info literal held in a local (not returned directly) keeps the wrap', () => {
        const out = print (fnr ('let response = undefined;', branches, '        const result = { \'info\': response };\n        this.keep (result);\n        return result;\n'));
        expect (out).not.toContain (native);
    });
    test ('info literal handed to a callee that is not returned keeps the wrap', () => {
        const out = print (fnr ('let response = undefined;', branches, '        this.keep ({ \'info\': response });\n        return code;\n'));
        expect (out).not.toContain (native);
    });
    test ('info in a returned literal of an untyped (any) endpoint local keeps the wrap', () => {
        const out = print (fnr ('let response = undefined;', '        response = await this.privateGetB (params);\n', ret));
        expect (out).not.toContain ('response["data"].(map[string]any)');
    });
    test ('a non-info key in the returned literal keeps the wrap', () => {
        const out = print (fnr ('let response = undefined;', branches, '        return { \'raw\': response, \'code\': code };\n'));
        expect (out).not.toContain (native);
    });
});
