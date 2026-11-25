import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

// a `[]`-seeded list local written from safeList (R, k, []) where R is an awaited / nil-joined map endpoint local
describe ('h30a17: safeList write from an awaited or joined endpoint map local', () => {
    const HEAD = 'type Dict = { [key: string]: any };\nclass BaseExchange {\n    safeDict (o: any, k: any, d: Dict = undefined): Dict { return d; }\n'
        + '    safeString (o: any, k: any, d: string = undefined): string { return d; }\n    safeList (o: any, k: any, d: any[] = undefined): any[] { return d; }\n    keep (o: any): any { return o; }\n}\nexport default BaseExchange;\n';
    const ABSTRACT = 'import _Exchange from \'../base/Exchange.js\';\ntype Dict = { [key: string]: any };\ninterface Exchange {\n'
        + '    privateGetA (params?: {}): Promise<Dict>;\n    privateGetB (params?: {}): Promise<any>;\n}\nabstract class Exchange extends _Exchange {}\nexport default Exchange;\n';
    const print = (body: string): string => {
        const dir = fs.mkdtempSync (path.join (process.env.TMPDIR || os.tmpdir (), 'h30a17-'));
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
    const g = (decl: string, writes: string, use = '') => '    async f (params = {}) {\n        ' + decl + '\n        let data = [];\n' + writes + use
        + '        data = this.safeList (response, \'data\', []);\n        return data.length;\n    }\n';
    const branches = '        if (params[\'a\']) {\n            response = await this.privateGetA (params);\n        } else {\n            response = await this.privateGetA ({});\n        }\n';
    const native = '\tdata, _ = response["data"].([]any)\n\tif data == nil {\n\t\tdata = []any{}\n\t}\n';

    test ('nil-seeded join of map endpoints: comma-ok list read with the default (fails on the base printer)', () => {
        const out = print (g ('let response = undefined;', branches));
        expect (out).toContain (native);
        expect (out).not.toContain ('ArrayTyped(this.SafeList(response');
    });
    test ('branch-local awaited map endpoint const: comma-ok list read', () => {
        const out = print ('    async f (params = {}) {\n        let data = [];\n        if (params[\'a\']) {\n            const response = await this.privateGetA (params);\n'
            + '            data = this.safeList (response, \'data\', []);\n        }\n        return data.length;\n    }\n');
        expect (out).toContain ('\t\tdata, _ = response["data"].([]any)\n\t\tif data == nil {\n\t\t\tdata = []any{}\n\t\t}\n');
    });
    test ('a write that is not an endpoint keeps the wrap', () => {
        expect (print (g ('let response = undefined;', branches + '        response = this.keep (params);\n'))).not.toContain ('response["data"].([]any)');
    });
    test ('an untyped (any) endpoint write keeps the wrap', () => {
        expect (print (g ('let response = undefined;', '        response = await this.privateGetB (params);\n'))).not.toContain ('response["data"].([]any)');
    });
    test ('a local handed to a callee keeps the wrap', () => {
        expect (print (g ('let response = undefined;', branches, '        this.keep (response);\n'))).not.toContain ('response["data"].([]any)');
    });
    test ('a written-through local keeps the wrap', () => {
        expect (print (g ('let response = undefined;', branches, '        response[\'x\'] = 1;\n'))).not.toContain ('response["data"].([]any)');
    });
});
