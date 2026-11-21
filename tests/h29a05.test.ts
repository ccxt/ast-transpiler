import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

// a defaulted safeDict / safeList read of a JSON-origin map with a Go string key prints the comma-ok read plus the default
describe ('h29a05: defaulted reads of a decoded map with a Go string key', () => {
    const HEAD = 'type Dict = { [key: string]: any };\nclass BaseExchange {\n    safeDict (o: any, k: any, d: Dict = undefined): Dict { return d; }\n'
        + '    safeString (o: any, k: any, d: string = undefined): string { return d; }\n    safeList (o: any, k: any, d: any[] = undefined): any[] { return d; }\n    keep (o: any): any { return o; }\n}\nexport default BaseExchange;\n';
    const ABSTRACT = 'import _Exchange from \'../base/Exchange.js\';\ntype Dict = { [key: string]: any };\ninterface Exchange {\n'
        + '    privateGetA (params?: {}): Promise<Dict>;\n    privateGetB (params?: {}): Promise<any>;\n}\nabstract class Exchange extends _Exchange {}\nexport default Exchange;\n';
    const print = (body: string): string => {
        const dir = fs.mkdtempSync (path.join (process.env.TMPDIR || os.tmpdir (), 'h29a05-'));
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
    const fn = (sig: string, call: string, read: string, pre = '') => '    async f (' + sig + ') {\n' + (call ? '        const response = await this.' + call + ' ({});\n' : '') + pre
        + '        const ids = Object.keys (response);\n        const out = [];\n        for (let i = 0; i < ids.length; i++) {\n            const code: string = ids[i];\n'
        + '            ' + read + '\n            out.push (entry);\n        }\n        return out;\n    }\n';
    const D = 'const entry = this.safeDict (response, code, {});';
    test ('string key on a typed map endpoint: comma-ok read plus the {} default (fails on the base printer)', () => {
        const out = print (fn ('', 'privateGetA', D));
        expect (out).toContain ('\t\tvar entry map[string]any\n\t\tentry, _ = response[code].(map[string]any)\n\t\tif entry == nil {\n\t\t\tentry = map[string]any{}\n\t\t}\n');
        expect (out).not.toContain ('SafeDictMap(response, code');
    });
    test ('string key list read: comma-ok list read plus the [] default', () => {
        const out = print (fn ('', 'privateGetA', 'const entry = this.safeList (response, code, []);'));
        expect (out).toContain ('entry, _ = response[code].([]any)\n\t\tif entry == nil {\n\t\t\tentry = []any{}\n');
    });
    test ('an unannotated key local cut from Object.keys reads with the assertion', () => {
        const out = print (fn ('', 'privateGetA', D).replace ('const code: string = ids[i];', 'const code = ids[i];'));
        expect (out).toContain ('entry, _ = response[code].(map[string]any)');
    });
    test ('an any key does not print the assertion', () => {
        const out = print (fn ('k: any', 'privateGetA', 'const entry = this.safeDict (response, k, {});'));
        expect (out).not.toContain ('response[k].(map[string]any)');
    });
    test ('an untyped endpoint receiver does not print the assertion', () => {
        const out = print (fn ('', 'privateGetB', D));
        expect (out).not.toContain ('response[code].(');
    });
    test ('a receiver written through does not print the assertion', () => {
        const out = print (fn ('', 'privateGetA', D, "        response['y'] = 1;\n"));
        expect (out).not.toContain ('response[code].(');
    });
    test ('a parameter receiver does not print the assertion', () => {
        const out = print (fn ('response: Dict', '', D));
        expect (out).not.toContain ('response[code].(');
    });
    test ('a non-empty default does not print the assertion', () => {
        const out = print (fn ('', 'privateGetA', "const entry = this.safeDict (response, code, { 'a': 1 });"));
        expect (out).not.toContain ('response[code].(');
    });
});
