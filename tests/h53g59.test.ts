import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

// a slot of a literal Promise.all of map endpoint tasks is a decoded JSON document: its defaulted list reads take the comma-ok read
describe ('h53g59: map slots of a typed Promise.all are JSON origin', () => {
    const HEAD = 'type Dict = { [key: string]: any };\nclass BaseExchange {\n    safeDict (o: any, k: any, d: Dict = undefined): Dict { return d; }\n'
        + '    safeList (o: any, k: any, d: any[] = undefined): any[] { return d; }\n    arrayConcat (a: any, b: any): any { return a; }\n}\nexport default BaseExchange;\n';
    const ABSTRACT = 'import _Exchange from \'../base/Exchange.js\';\ntype Dict = { [key: string]: any };\ninterface Exchange {\n'
        + '    publicGetA (params?: {}): Promise<Dict>;\n    publicGetB (params?: {}): Promise<Dict>;\n}\nabstract class Exchange extends _Exchange {}\nexport default Exchange;\n';
    const print = (body: string): string => {
        const dir = fs.mkdtempSync (path.join (process.env.TMPDIR || os.tmpdir (), 'h53g59-'));
        try {
            fs.mkdirSync (path.join (dir, 'ts', 'src', 'base'), { 'recursive': true });
            fs.mkdirSync (path.join (dir, 'ts', 'src', 'abstract'), { 'recursive': true });
            fs.mkdirSync (path.join (dir, 'go', 'v4'), { 'recursive': true });
            fs.writeFileSync (path.join (dir, 'ts', 'src', 'base', 'Exchange.ts'), HEAD);
            fs.writeFileSync (path.join (dir, 'ts', 'src', 'abstract', 'x.ts'), ABSTRACT);
            fs.writeFileSync (path.join (dir, 'go', 'v4', 'x_api.go'), 'func (this *x) PublicGetA(args ...any) <-chan EndpointResult[map[string]any] {\nfunc (this *x) PublicGetB(args ...any) <-chan EndpointResult[map[string]any] {\n');
            const file = path.join (dir, 'ts', 'src', 'x.ts');
            fs.writeFileSync (file, 'import Exchange from \'./abstract/x.js\';\nclass x extends Exchange {\n' + body + '}\n');
            const t: any = new Transpiler ({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 } } });
            installCcxtGoHooks (t.goTranspiler);
            return t.transpileGoByPath (file).content;
        } finally {
            fs.rmSync (dir, { 'recursive': true, 'force': true });
        }
    };
    const fn = (extra = '', fallback = ', {}', tasks = '[ this.publicGetA (params), this.publicGetB (params) ]') => '    async g (params = {}) {\n'
        + '        const ps = ' + tasks + ';\n        const res = await Promise.all (ps);\n'
        + '        const fiat = this.safeDict (res, 0' + fallback + ');\n        const crypto = this.safeDict (res, 1' + fallback + ');\n' + extra
        + '        const a = this.safeList (fiat, \'data\', []);\n        const b = this.safeList (crypto, \'data\', []);\n'
        + '        return this.arrayConcat (a, b);\n    }\n';
    test ('positive: each slot\'s defaulted list read prints the comma-ok read', () => {
        const out = print (fn ());
        expect (out).toContain ('a, _ = fiat["data"].([]any)');
        expect (out).toContain ('b, _ = crypto["data"].([]any)');
        expect (out).not.toContain ('SafeListSlice(fiat,');
    });
    test ('negative: a slot written into keeps the helper', () => {
        const out = print (fn ('        fiat[\'data\'] = [];\n'));
        expect (out).not.toContain ('a, _ = fiat["data"].([]any)');
        expect (out).toContain ('b, _ = crypto["data"].([]any)');
    });
    test ('negative: the result list written into keeps the helper', () => {
        const out = print (fn ('        res[0] = {};\n'));
        expect (out).not.toContain ('a, _ = fiat["data"].([]any)');
        expect (out).not.toContain ('b, _ = crypto["data"].([]any)');
    });
    test ('negative: a task that is not an endpoint keeps the helper', () => {
        const out = print (fn ('', ', {}', '[ this.publicGetA (params), this.arrayConcat (params, params) ]'));
        expect (out).not.toContain ('a, _ = fiat["data"].([]any)');
    });
});
