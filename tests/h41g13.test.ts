import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

// `x = this.safeDict (R, k, {})` into a `let x: Dict = {}` local, R decoded JSON: comma-ok read plus the `{}` fallback
describe ('h41g13: a Dict local written from a defaulted safeDict of decoded JSON prints the comma-ok read', () => {
    const HEAD = 'type Dict = { [key: string]: any };\nclass BaseExchange {\n    safeDict (o: any, k: any, d: Dict = undefined): Dict { return d; }\n'
        + '    safeString (o: any, k: any, d: string = undefined): string { return d; }\n    keep (o: any): any { return o; }\n}\nexport default BaseExchange;\n';
    const ABSTRACT = 'import _Exchange from \'../base/Exchange.js\';\ntype Dict = { [key: string]: any };\ntype List = any[];\ninterface Exchange {\n'
        + '    privateGetA (params?: {}): Promise<Dict>;\n    privateGetB (params?: {}): Promise<any>;\n    privateGetC (params?: {}): Promise<List>;\n}\nabstract class Exchange extends _Exchange {}\nexport default Exchange;\n';
    const print = (body: string): string => {
        const dir = fs.mkdtempSync (path.join (process.env.TMPDIR || os.tmpdir (), 'h41g13-'));
        try {
            fs.mkdirSync (path.join (dir, 'ts', 'src', 'base'), { 'recursive': true });
            fs.mkdirSync (path.join (dir, 'ts', 'src', 'abstract'), { 'recursive': true });
            fs.mkdirSync (path.join (dir, 'go', 'v4'), { 'recursive': true });
            fs.writeFileSync (path.join (dir, 'ts', 'src', 'base', 'Exchange.ts'), HEAD);
            fs.writeFileSync (path.join (dir, 'ts', 'src', 'abstract', 'x.ts'), ABSTRACT);
            fs.writeFileSync (path.join (dir, 'go', 'v4', 'x_api.go'), 'func (this *x) PrivateGetA(args ...any) <-chan EndpointResult[map[string]any] {\nfunc (this *x) PrivateGetC(args ...any) <-chan EndpointResult[[]any] {\n');
            const file = path.join (dir, 'ts', 'src', 'x.ts');
            fs.writeFileSync (file, 'import Exchange from \'./abstract/x.js\';\nclass x extends Exchange {\n' + body + '}\n');
            const t: any = new Transpiler ({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 } } });
            installCcxtGoHooks (t.goTranspiler);
            return t.transpileGoByPath (file).content;
        } finally {
            fs.rmSync (dir, { 'recursive': true, 'force': true });
        }
    };
    const fn = (call: string, write: string, use = '') => '    async f (params = {}, a = false) {\n        const response = await this.' + call + ' (params);\n'
        + use + '        let data: Dict = {};\n        if (a) {\n            ' + write + '\n        }\n        return this.safeString (data, \'id\');\n    }\n';
    test ('map receiver, literal key: comma-ok read plus the {} fallback', () => {
        const out = print (fn ('privateGetA', 'data = this.safeDict (response, \'data\', {});'));
        expect (out).toContain ('\t\tdata, _ = response["data"].(map[string]any)\n\t\tif data == nil {\n\t\t\tdata = map[string]any{}\n\t\t}\n');
        expect (out).not.toContain ('SafeDictMap(');
    });
    test ('list receiver, literal index: bounds-tested comma-ok read plus the {} fallback', () => {
        const out = print (fn ('privateGetC', 'data = this.safeDict (response, 0, {});'));
        expect (out).toContain ('\t\tdata = nil\n\t\tif len(response) > 0 {\n\t\t\tdata, _ = response[0].(map[string]any)\n\t\t}\n\t\tif data == nil {\n\t\t\tdata = map[string]any{}\n\t\t}\n');
        expect (out).not.toContain ('SafeDictMap(');
    });
    test ('untyped endpoint receiver keeps the read', () => {
        const out = print (fn ('privateGetB', 'data = this.safeDict (response, \'data\', {});'));
        expect (out).not.toContain ('response["data"].(map[string]any)');
    });
    test ('a receiver handed out to a call (not read-only JSON) keeps the read', () => {
        const out = print (fn ('privateGetA', 'data = this.safeDict (response, \'data\', {});', '        this.keep (response);\n'));
        expect (out).not.toContain ('response["data"].(map[string]any)');
    });
    test ('a write with no default (absent is nil) keeps the read', () => {
        const out = print (fn ('privateGetA', 'data = this.safeDict (response, \'data\');'));
        expect (out).not.toContain ('response["data"].(map[string]any)');
    });
    test ('a variable key keeps the read', () => {
        const out = print (fn ('privateGetA', 'const k = this.safeString (params, \'k\', \'x\');\n            data = this.safeDict (response, k, {});'));
        expect (out).not.toContain ('].(map[string]any)');
    });
});
