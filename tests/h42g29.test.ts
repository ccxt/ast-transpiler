import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

// element reads of a list cut from one awaited call of a venue wrapper that hands back only decoded endpoint data or a literal default
describe ('h42g29: awaited JSON-returning venue wrapper', () => {
    const HEAD = 'type Dict = { [key: string]: any };\nclass BaseExchange {\n    safeDict (o: any, k: any, d: Dict = undefined): Dict { return d; }\n'
        + '    safeList (o: any, k: any, d: any[] = undefined): any[] { return d; }\n    safeString (o: any, k: any, d: string = undefined): string { return d; }\n    keep (o: any): any { return o; }\n    async sleep (n: number) { return n; }\n}\nexport default BaseExchange;\n';
    const ABSTRACT = 'import _Exchange from \'../base/Exchange.js\';\ntype Dict = { [key: string]: any };\ntype List = any[];\ninterface Exchange {\n'
        + '    privateGetA (params?: {}): Promise<Dict>;\n    privateGetB (params?: {}): Promise<List>;\n}\nabstract class Exchange extends _Exchange {}\nexport default Exchange;\n';
    const print = (body: string): string => {
        const dir = fs.mkdtempSync (path.join (process.env.TMPDIR || os.tmpdir (), 'h42g29-'));
        try {
            fs.mkdirSync (path.join (dir, 'ts', 'src', 'base'), { 'recursive': true });
            fs.mkdirSync (path.join (dir, 'ts', 'src', 'abstract'), { 'recursive': true });
            fs.mkdirSync (path.join (dir, 'go', 'v4'), { 'recursive': true });
            fs.writeFileSync (path.join (dir, 'ts', 'src', 'base', 'Exchange.ts'), HEAD);
            fs.writeFileSync (path.join (dir, 'ts', 'src', 'abstract', 'x.ts'), ABSTRACT);
            fs.writeFileSync (path.join (dir, 'go', 'v4', 'x_api.go'), 'func (this *x) PrivateGetA(args ...any) <-chan EndpointResult[map[string]any] {\nfunc (this *x) PrivateGetB(args ...any) <-chan EndpointResult[[]any] {\n');
            const file = path.join (dir, 'ts', 'src', 'x.ts');
            fs.writeFileSync (file, 'import Exchange from \'./abstract/x.js\';\ntype List = any[];\nclass x extends Exchange {\n' + body + '}\n');
            const t: any = new Transpiler ({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 } } });
            installCcxtGoHooks (t.goTranspiler);
            return t.transpileGoByPath (file).content;
        } finally {
            fs.rmSync (dir, { 'recursive': true, 'force': true });
        }
    };
    const WRAP = '    async call (request: any, ep: string, defaultValue: any = undefined) {\n'
        + '        for (let i = 0; i < 3; i++) {\n            let data: any = undefined;\n            try {\n'
        + '                if (ep === \'a\') {\n                    data = await this.privateGetA (request);\n                } else if (ep === \'b\') {\n                    data = await this.privateGetB (request);\n                }\n'
        + '            } catch (e) {\n                data = defaultValue;\n                if (data === undefined) {\n                    await this.sleep (1);\n                }\n            }\n'
        + '            if (data !== undefined) {\n                return data;\n            }\n        }\n        return undefined;\n    }\n';
    const use = (task: string, wrap = WRAP, extra = '') => wrap + '    async g (params = {}) {\n'
        + '        const response = await ' + task + ';\n' + extra + '        const entries: Dict = {};\n'
        + '        const rows = this.safeList (response, \'contracts\', []);\n'
        + '        for (let j = 0; j < rows.length; j++) {\n            const row = rows[j];\n            const conid = this.safeString (row, \'conid\');\n'
        + '            if (conid !== undefined) {\n                entries[conid] = row;\n            }\n        }\n        return entries;\n    }\n';
    test ('wrapper with a literal default: the element read drops DerefScalar', () => {
        const out = print (use ('this.call (params, \'a\', {})'));
        expect (out).toContain ('rows[j]');
        expect (out).not.toContain ('DerefScalar(rows[j])');
    });
    test ('a wrapper called with no default keeps DerefScalar', () => {
        expect (print (use ('this.call (params, \'a\')'))).toContain ('DerefScalar(rows[j])');
    });
    test ('a non-literal default keeps DerefScalar', () => {
        expect (print (use ('this.call (params, \'a\', this.keep (params))'))).toContain ('DerefScalar(rows[j])');
    });
    test ('a wrapper that can return a non-JSON value keeps DerefScalar', () => {
        const bad = WRAP.replace ('return undefined;', 'return this.keep (request);');
        expect (print (use ('this.call (params, \'a\', {})', bad))).toContain ('DerefScalar(rows[j])');
    });
    test ('a response written through keeps DerefScalar', () => {
        expect (print (use ('this.call (params, \'a\', {})', WRAP, '        response[\'contracts\'] = [ 1 ];\n'))).toContain ('DerefScalar(rows[j])');
    });
});
