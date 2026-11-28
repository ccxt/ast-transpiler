import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

// ruling 6(c): a local whose every write is an awaited map endpoint feeds the comma-ok read
describe ('h37p04: an info store keeps a JSON local native', () => {
    const HEAD = 'type Dict = { [key: string]: any };\nclass BaseExchange {\n    safeDict (o: any, k: any, d: Dict = undefined): Dict { return d; }\n'
        + '    safeString (o: any, k: any, d: string = undefined): string { return d; }\n    keep (o: any): any { return o; }\n}\nexport default BaseExchange;\n';
    const ABSTRACT = 'import _Exchange from \'../base/Exchange.js\';\ntype Dict = { [key: string]: any };\ninterface Exchange {\n'
        + '    privateGetA (params?: {}): Promise<Dict>;\n    privateGetB (params?: {}): Promise<any>;\n}\nabstract class Exchange extends _Exchange {}\nexport default Exchange;\n';
    const print = (body: string): string => {
        const dir = fs.mkdtempSync (path.join (process.env.TMPDIR || os.tmpdir (), 'h37p04-'));
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
    const fn = (use: string) => '    async f (params = {}) {\n        const response = await this.privateGetA (params);\n'
        + '        const rows = this.safeList (response, \'rows\', []);\n' + use + '        return rows.length;\n    }\n';
    const native = 'response["rows"].([]any)';
    test ('info store: comma-ok read', () => {
        const out = print (fn ('        const r = { \'info\': response };\n        r[\'n\'] = rows.length;\n        return this.keep (r);\n'));
        expect (out).toContain (native);
        expect (out).not.toContain ('SafeListTyped(response');
    });
    test ('a store under another key keeps the wrap', () => {
        expect (print (fn ('        const r = { \'raw\': response };\n'))).not.toContain (native);
    });
    test ('an info store before the read, held for the return: comma-ok read', () => {
        const out = print ('    async f (params = {}) {\n        const response = await this.privateGetA (params);\n'
            + '        const r = { \'info\': response };\n        const rows = this.safeList (response, \'rows\', []);\n        r[\'n\'] = rows.length;\n        return this.keep (r);\n    }\n');
        expect (out).toContain (native);
    });
    test ('an info store before the read, held and handed to a callee, keeps the wrap', () => {
        const out = print ('    async f (params = {}) {\n        const response = await this.privateGetA (params);\n'
            + '        const r = { \'info\': response };\n        this.keep (r);\n        const rows = this.safeList (response, \'rows\', []);\n        return rows.length;\n    }\n');
        expect (out).not.toContain (native);
    });
    test ('a write through the local keeps the wrap', () => {
        expect (print (fn ('        response[\'rows\'] = [];\n'))).not.toContain (native);
    });
    test ('an untyped endpoint keeps the wrap', () => {
        const out = print (fn ('        const r = { \'info\': response };\n').replace ('privateGetA', 'privateGetB'));
        expect (out).not.toContain (native);
    });
});
