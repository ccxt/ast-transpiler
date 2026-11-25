import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

// a nil-seeded local written in each branch by an awaited typed endpoint is decoded JSON: its list member prints the comma-ok read
describe ('h51g44: a JSON local stored as info in a later-used literal keeps the comma-ok list read', () => {
    const HEAD = 'type Dict = { [key: string]: any };\nclass BaseExchange {\n    safeList (o: any, k: any, d: any[] = undefined): any[] { return d; }\n'
        + '    safeString (o: any, k: any, d: string = undefined): string { return d; }\n    keep (o: any): any { return o; }\n}\nexport default BaseExchange;\n';
    const ABSTRACT = 'import _Exchange from \'../base/Exchange.js\';\ntype Dict = { [key: string]: any };\ninterface Exchange {\n'
        + '    privateGetA (params?: {}): Promise<Dict>;\n    privateGetB (params?: {}): Promise<Dict>;\n}\nabstract class Exchange extends _Exchange {}\nexport default Exchange;\n';
    const print = (body: string): string => {
        const dir = fs.mkdtempSync (path.join (process.env.TMPDIR || os.tmpdir (), 'h51g44-'));
        try {
            fs.mkdirSync (path.join (dir, 'ts', 'src', 'base'), { 'recursive': true });
            fs.mkdirSync (path.join (dir, 'ts', 'src', 'abstract'), { 'recursive': true });
            fs.mkdirSync (path.join (dir, 'go', 'v4'), { 'recursive': true });
            fs.writeFileSync (path.join (dir, 'ts', 'src', 'base', 'Exchange.ts'), HEAD);
            fs.writeFileSync (path.join (dir, 'ts', 'src', 'abstract', 'x.ts'), ABSTRACT);
            fs.writeFileSync (path.join (dir, 'go', 'v4', 'x_api.go'), 'func (this *x) PrivateGetA(args ...any) <-chan EndpointResult[map[string]any] {\n'
                + 'func (this *x) PrivateGetB(args ...any) <-chan EndpointResult[map[string]any] {\n');
            const file = path.join (dir, 'ts', 'src', 'x.ts');
            fs.writeFileSync (file, 'import Exchange from \'./abstract/x.js\';\nclass x extends Exchange {\n' + body + '}\n');
            const t: any = new Transpiler ({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 } } });
            installCcxtGoHooks (t.goTranspiler);
            return t.transpileGoByPath (file).content;
        } finally {
            fs.rmSync (dir, { 'recursive': true, 'force': true });
        }
    };

    const lit = (after: string) => '    async f (params = {}) {\n        let response = undefined;\n        response = await this.privateGetA (params);\n'
        + '        const result: Dict = {\n            \'info\': response,\n        };\n'
        + '        const data = this.safeDict (response, \'data\', {});\n        const rows = this.safeList (data, \'rows\');\n' + after + '        return rows.length;\n    }\n';
    const native = '\tvar rows []any\n\trows, _ = data["rows"].([]any)\n';
    test ('info store in a literal used only after the read: comma-ok list read', () => {
        const out = print (lit ('        this.keep (result);\n'));
        expect (out).toContain (native);
        expect (out).not.toContain ('SafeListTyped(data, "rows")');
    });
    test ('negative: the literal handed out before the read keeps the wrap', () => {
        const out = print (lit ('').replace ('        const data =', '        this.keep (result);\n        const data ='));
        expect (out).not.toContain (native);
    });
    test ('negative: info stored in a non-local literal keeps the wrap', () => {
        const out = print (lit ('').replace ('        const result: Dict = {\n            \'info\': response,\n        };\n', '        this.keep ({ \'info\': response });\n'));
        expect (out).not.toContain (native);
    });
    test ('negative: a non-endpoint write keeps the wrap', () => {
        const out = print (lit ('').replace ('response = await this.privateGetA (params);', 'response = this.keep ({});'));
        expect (out).not.toContain (native);
    });
});
