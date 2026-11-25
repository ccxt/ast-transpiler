import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

// a safeDict / safeList read of a JSON-origin map keyed by an unguarded *string prints the nil-guarded comma-ok read
describe ('h30a08: reads of a decoded map with an unguarded *string key', () => {
    const HEAD = 'type Dict = { [key: string]: any };\nclass BaseExchange {\n    safeDict (o: any, k: any, d: Dict = undefined): Dict { return d; }\n'
        + '    safeString (o: any, k: any, d: string = undefined): string { return d; }\n    safeList (o: any, k: any, d: any[] = undefined): any[] { return d; }\n    keep (o: any): any { return o; }\n}\nexport default BaseExchange;\n';
    const ABSTRACT = 'import _Exchange from \'../base/Exchange.js\';\ntype Dict = { [key: string]: any };\ninterface Exchange {\n'
        + '    privateGetA (params?: {}): Promise<Dict>;\n    privateGetB (params?: {}): Promise<any>;\n}\nabstract class Exchange extends _Exchange {}\nexport default Exchange;\n';
    const print = (body: string): string => {
        const dir = fs.mkdtempSync (path.join (process.env.TMPDIR || os.tmpdir (), 'h30a08-'));
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
    const fn = (read: string, pre = '', post = '') => '    async f (params = {}) {\n        const response = await this.privateGetA ({});\n' + pre
        + '        const code = this.safeString (params, \'code\');\n        ' + read + '\n' + post + '        return entry;\n    }\n';
    test ('defaulted dict read: nil-guarded comma-ok plus the {} default (fails on the base printer)', () => {
        const out = print (fn ('const entry = this.safeDict (response, code, {});'));
        expect (out).toContain ('\tvar entry map[string]any\n\tif code != nil {\n\t\tentry, _ = response[*code].(map[string]any)\n\t}\n\tif entry == nil {\n\t\tentry = map[string]any{}\n\t}\n');
        expect (out).not.toContain ('SafeDictMap(response, code');
    });
    test ('two-argument dict read keeps the nil answer (no default)', () => {
        const out = print (fn ('const entry = this.safeDict (response, code);'));
        expect (out).toContain ('\tvar entry map[string]any\n\tif code != nil {\n\t\tentry, _ = response[*code].(map[string]any)\n\t}\n\n\tch <- entry');
    });
    test ('defaulted list read: nil-guarded comma-ok plus the [] default', () => {
        const out = print (fn ('const entry = this.safeList (response, code, []);'));
        expect (out).toContain ('if code != nil {\n\t\tentry, _ = response[*code].([]any)\n\t}\n\tif entry == nil {\n\t\tentry = []any{}\n');
    });
    test ('a receiver written through does not print the assertion', () => {
        const out = print (fn ('const entry = this.safeDict (response, code, {});', "        response['y'] = 1;\n"));
        expect (out).not.toContain ('response[*code].(');
    });
    test ('a non-empty default does not print the assertion', () => {
        const out = print (fn ('const entry = this.safeDict (response, code, { \'a\': 1 });'));
        expect (out).not.toContain ('response[*code].(');
    });
    test ('a parameter receiver does not print the assertion', () => {
        const out = print ('    async f (response: Dict, code: string = undefined) {\n        const entry = this.safeDict (response, code, {});\n        return entry;\n    }\n');
        expect (out).not.toContain ('response[*code].(');
    });
});
