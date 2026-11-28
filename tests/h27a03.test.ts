import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

// a `{}`-defaulted safeDict read of a JSON-origin map receiver prints the comma-ok read plus a nil default
describe ('h27a03: defaulted safeDict of a decoded map prints the comma-ok read', () => {
    const HEAD = 'type Dict = { [key: string]: any };\nclass BaseExchange {\n    safeDict (o: any, k: any, d: Dict = undefined): Dict { return d; }\n'
        + '    safeString (o: any, k: any, d: string = undefined): string { return d; }\n    keep (o: any): any { return o; }\n}\nexport default BaseExchange;\n';
    const ABSTRACT = 'import _Exchange from \'../base/Exchange.js\';\ntype Dict = { [key: string]: any };\ninterface Exchange {\n'
        + '    privateGetA (params?: {}): Promise<Dict>;\n    privateGetB (params?: {}): Promise<any>;\n}\nabstract class Exchange extends _Exchange {}\nexport default Exchange;\n';
    const print = (body: string): string => {
        const dir = fs.mkdtempSync (path.join (process.env.TMPDIR || os.tmpdir (), 'h27a03-'));
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
    const fn = (call: string, use: string) => '    async f (params = {}) {\n        const response = await this.' + call + ' (params);\n'
        + '        const data = this.safeDict (response, \'data\', {});\n' + use + '        return data;\n    }\n';
    const native = '\tvar data map[string]any\n\tdata, _ = response["data"].(map[string]any)\n\tif data == nil {\n\t\tdata = map[string]any{}\n\t}\n';

    test ('typed map endpoint receiver: comma-ok read plus the {} default', () => {
        const out = print (fn ('privateGetA', '        data[\'t\'] = 1;\n'));
        expect (out).toContain (native);
        expect (out).not.toContain ('SafeDictMap(');
        expect (out).not.toContain ('data :=');
    });
    test ('untyped endpoint receiver keeps the wrap', () => {
        const out = print (fn ('privateGetB', '        data[\'t\'] = 1;\n'));
        expect (out).not.toContain ('response["data"].(map[string]any)');
    });
    test ('a receiver handed out to a call (not read-only JSON) keeps the wrap', () => {
        const out = print (fn ('privateGetA', '        this.keep (response);\n        data[\'t\'] = 1;\n'));
        expect (out).not.toContain ('response["data"].(map[string]any)');
    });
    test ('a non-empty default keeps the wrap', () => {
        const out = print ('    async f (params = {}) {\n        const response = await this.privateGetA (params);\n'
            + '        const data = this.safeDict (response, \'data\', { \'a\': 1 });\n        return data;\n    }\n');
        expect (out).not.toContain ('response["data"].(map[string]any)');
    });
    test ('a reassigned receiver keeps the wrap', () => {
        const out = print ('    async f (params = {}) {\n        let response = await this.privateGetA (params);\n        response = {};\n'
            + '        const data = this.safeDict (response, \'data\', {});\n        return data;\n    }\n');
        expect (out).not.toContain ('response["data"].(map[string]any)');
    });
});
