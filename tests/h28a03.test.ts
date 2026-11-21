import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

// ruling 6(c): a local whose every write is an awaited map endpoint feeds the comma-ok read
describe ('h28a03: a let / branch local joining awaited map endpoints is JSON origin', () => {
    const HEAD = 'type Dict = { [key: string]: any };\nclass BaseExchange {\n    safeDict (o: any, k: any, d: Dict = undefined): Dict { return d; }\n'
        + '    safeString (o: any, k: any, d: string = undefined): string { return d; }\n    keep (o: any): any { return o; }\n}\nexport default BaseExchange;\n';
    const ABSTRACT = 'import _Exchange from \'../base/Exchange.js\';\ntype Dict = { [key: string]: any };\ninterface Exchange {\n'
        + '    privateGetA (params?: {}): Promise<Dict>;\n    privateGetB (params?: {}): Promise<any>;\n}\nabstract class Exchange extends _Exchange {}\nexport default Exchange;\n';
    const print = (body: string): string => {
        const dir = fs.mkdtempSync (path.join (process.env.TMPDIR || os.tmpdir (), 'h28a03-'));
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

    test ('branch-assigned let of map endpoints: comma-ok read', () => {
        const out = print (fn ('let response = undefined;', branches));
        expect (out).toContain (native);
        expect (out).not.toContain ('SafeMapTyped(response');
    });
    test ('typed let with a nil test still reads natively and keeps the nil test', () => {
        const out = print (fn ('let response: Dict = undefined;', branches, '        if (response === undefined) {\n            return undefined;\n        }\n'));
        expect (out).toContain (native);
        expect (out).toContain ('response == nil');
    });
    test ('a write that is not an endpoint keeps the wrap', () => {
        const out = print (fn ('let response = undefined;', branches + '        response = this.keep (params);\n'));
        expect (out).not.toContain (native);
    });
    test ('an untyped (any) endpoint write keeps the wrap', () => {
        const out = print (fn ('let response = undefined;', '        response = await this.privateGetB (params);\n'));
        expect (out).not.toContain ('response["data"].(map[string]any)');
    });
    test ('a local handed to a callee keeps the wrap', () => {
        const out = print (fn ('let response = undefined;', branches, '        this.keep (response);\n'));
        expect (out).not.toContain (native);
    });
});
