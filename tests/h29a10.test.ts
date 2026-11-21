import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

// a Promise.all of typed endpoint tasks gathers decoded JSON documents: its rows take the comma-ok read
describe ('h29a10: Promise.all result slots of endpoint tasks are JSON origin', () => {
    const HEAD = 'type Dict = { [key: string]: any };\nclass BaseExchange {\n    safeDict (o: any, k: any, d: Dict = undefined): Dict { return d; }\n'
        + '    safeList (o: any, k: any, d: any[] = undefined): any[] { return d; }\n    safeString (o: any, k: any, d: string = undefined): string { return d; }\n    keep (o: any): any { return o; }\n}\nexport default BaseExchange;\n';
    const ABSTRACT = 'import _Exchange from \'../base/Exchange.js\';\ntype Dict = { [key: string]: any };\ntype List = any[];\ninterface Exchange {\n'
        + '    privateGetA (params?: {}): Promise<Dict>;\n    privateGetB (params?: {}): Promise<List>;\n}\nabstract class Exchange extends _Exchange {}\nexport default Exchange;\n';
    const print = (body: string): string => {
        const dir = fs.mkdtempSync (path.join (process.env.TMPDIR || os.tmpdir (), 'h29a10-'));
        try {
            fs.mkdirSync (path.join (dir, 'ts', 'src', 'base'), { 'recursive': true });
            fs.mkdirSync (path.join (dir, 'ts', 'src', 'abstract'), { 'recursive': true });
            fs.mkdirSync (path.join (dir, 'go', 'v4'), { 'recursive': true });
            fs.writeFileSync (path.join (dir, 'ts', 'src', 'base', 'Exchange.ts'), HEAD);
            fs.writeFileSync (path.join (dir, 'ts', 'src', 'abstract', 'x.ts'), ABSTRACT);
            fs.writeFileSync (path.join (dir, 'go', 'v4', 'x_api.go'), 'func (this *x) PrivateGetA(args ...any) <-chan EndpointResult[map[string]any] {\nfunc (this *x) PrivateGetB(args ...any) <-chan EndpointResult[[]any] {\n');
            const file = path.join (dir, 'ts', 'src', 'x.ts');
            fs.writeFileSync (file, 'import Exchange from \'./abstract/x.js\';\nclass x extends Exchange {\n' + body + '}\n');
            const t: any = new Transpiler ({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 } } });
            installCcxtGoHooks (t.goTranspiler);
            return t.transpileGoByPath (file).content;
        } finally {
            fs.rmSync (dir, { 'recursive': true, 'force': true });
        }
    };
    const fn = (tasks: string, rest = '') => '    async g (params = {}) {\n        const ps = ' + tasks + ';\n' + rest
        + '        const res = await Promise.all (ps);\n        const r0 = this.safeDict (res, 0);\n        const d = this.safeDict (r0, \'data\');\n        return d;\n    }\n';
    const native = 'r0, _ = res[0].(map[string]any)';
    test ('literal task list of endpoints: bounds-guarded comma-ok slot read', () => {
        const out = print (fn ('[ this.privateGetA (params), this.privateGetB (params) ]'));
        expect (out).toContain (native);
        expect (out).toContain ('if 0 < len(res) {');
        expect (out).not.toContain ('SafeMapTyped(res, 0)');
    });
    test ('pushed endpoint tasks: comma-ok slot read', () => {
        const out = print (fn ('[ this.privateGetA (params) ]', '        ps.push (this.privateGetB (params));\n'));
        expect (out).toContain (native);
    });
    test ('a one-T literal task list is left to the PromiseAllTyped pass', () => {
        const out = print (fn ('[ this.privateGetA (params), this.privateGetA ({}) ]'));
        expect (out).not.toContain (native);
    });
    test ('a task that is not an endpoint keeps the box', () => {
        const out = print (fn ('[ this.privateGetA (params), this.keep (params) ]'));
        expect (out).not.toContain (native);
    });
    test ('a pushed non-endpoint task keeps the box', () => {
        const out = print (fn ('[ this.privateGetA (params) ]', '        ps.push (this.keep (params));\n'));
        expect (out).not.toContain (native);
    });
    test ('a result handed to a callee that may write it keeps the box', () => {
        const out = print ('    async g (params = {}) {\n        const res = await Promise.all ([ this.privateGetA (params), this.privateGetB (params) ]);\n'
            + '        this.keep (res);\n        const r0 = this.safeDict (res, 0);\n        return r0;\n    }\n');
        expect (out).not.toContain ('res[0].(map[string]any)');
    });
});
