import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

// element reads of a Promise.all over a venue wrapper that hands back only decoded endpoint data or a literal default
describe ('h41g25: Promise.all of a JSON-returning venue wrapper', () => {
    const HEAD = 'type Dict = { [key: string]: any };\nclass BaseExchange {\n    safeDict (o: any, k: any, d: Dict = undefined): Dict { return d; }\n'
        + '    safeList (o: any, k: any, d: any[] = undefined): any[] { return d; }\n    safeString (o: any, k: any, d: string = undefined): string { return d; }\n    keep (o: any): any { return o; }\n    async sleep (n: number) { return n; }\n}\nexport default BaseExchange;\n';
    const ABSTRACT = 'import _Exchange from \'../base/Exchange.js\';\ntype Dict = { [key: string]: any };\ntype List = any[];\ninterface Exchange {\n'
        + '    privateGetA (params?: {}): Promise<Dict>;\n    privateGetB (params?: {}): Promise<List>;\n}\nabstract class Exchange extends _Exchange {}\nexport default Exchange;\n';
    const print = (body: string): string => {
        const dir = fs.mkdtempSync (path.join (process.env.TMPDIR || os.tmpdir (), 'h41g25-'));
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
    const use = (task: string, wrap = WRAP) => wrap + '    async g (params = {}) {\n        const promises = [];\n        for (let k = 0; k < 2; k++) {\n'
        + '            promises.push (' + task + ');\n        }\n        const responses: List = await Promise.all (promises);\n        let n = 0;\n'
        + '        for (let i = 0; i < responses.length; i++) {\n            const rows = this.safeList (responses, i, []);\n'
        + '            for (let j = 0; j < rows.length; j++) {\n                n = n + this.safeString (rows[j], \'conid\').length;\n            }\n        }\n        return n;\n    }\n';
    test ('wrapper with a literal default: comma-ok row, native length and element', () => {
        const out = print (use ('this.call (params, \'b\', [])'));
        expect (out).toContain ('rows, _ = responses[i].([]any)');
        expect (out).not.toContain ('SafeListTyped(responses, i)');
        expect (out).not.toContain ('DerefScalar(rows[j])');
        expect (out).toContain ('this.SafeString(rows[j], "conid")');
    });
    test ('an element local of the row prints the plain index', () => {
        const body = use ('this.call (params, \'b\', [])').replace ('n = n + this.safeString (rows[j], \'conid\').length;', 'const row = rows[j];\n                n = n + this.safeString (row, \'conid\').length;');
        const out = print (body);
        expect (out).not.toContain ('SafeListTyped(responses, i)');
        expect (out).not.toContain ('DerefScalar(rows[j])');
    });
    test ('a direct typed endpoint task keeps its own path', () => {
        expect (print (use ('this.privateGetB (params)'))).not.toContain ('responses[i].([]any)');
    });
    test ('a wrapper called with no default keeps the wrap', () => {
        expect (print (use ('this.call (params, \'b\')'))).not.toContain ('responses[i].([]any)');
    });
    test ('a non-literal default keeps the wrap', () => {
        expect (print (use ('this.call (params, \'b\', this.keep (params))'))).not.toContain ('responses[i].([]any)');
    });
    test ('a wrapper that can return a non-JSON value keeps the wrap', () => {
        const bad = WRAP.replace ('return undefined;', 'return this.keep (request);');
        expect (print (use ('this.call (params, \'b\', [])', bad))).not.toContain ('responses[i].([]any)');
    });
    test ('a wrapper whose data is written from a non-endpoint keeps the wrap', () => {
        const bad = WRAP.replace ('data = await this.privateGetB (request);', 'data = this.keep (request);');
        expect (print (use ('this.call (params, \'b\', [])', bad))).not.toContain ('responses[i].([]any)');
    });
});
