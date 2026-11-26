import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

// a literal-key safeDict hop of a read-only Promise.all map-endpoint slot is JSON origin: its defaulted list reads go native
describe ('h54g59: defaulted list read on a hop of a Promise.all endpoint slot', () => {
    const HEAD = 'type Dict = { [key: string]: any };\nclass BaseExchange {\n    safeList (o: any, k: any, d: any[] = undefined): any[] { return d; }\n'
        + '    safeDict (o: any, k: any, d: Dict = undefined): Dict { return d; }\n    keep (o: any): any { return o; }\n    arrayConcat (a: any, b: any): any { return a; }\n}\nexport default BaseExchange;\n';
    const ABSTRACT = 'import _Exchange from \'../base/Exchange.js\';\ntype Dict = { [key: string]: any };\ntype List = any[];\ninterface Exchange {\n'
        + '    publicGetA (params?: {}): Promise<Dict>;\n    publicGetB (params?: {}): Promise<Dict>;\n    publicGetL (params?: {}): Promise<List>;\n}\nabstract class Exchange extends _Exchange {}\nexport default Exchange;\n';
    const print = (body: string): string => {
        const dir = fs.mkdtempSync (path.join (process.env.TMPDIR || os.tmpdir (), 'h54g59-'));
        const cwd = process.cwd ();
        try {
            fs.mkdirSync (path.join (dir, 'ts', 'src', 'base'), { 'recursive': true });
            fs.mkdirSync (path.join (dir, 'ts', 'src', 'abstract'), { 'recursive': true });
            fs.mkdirSync (path.join (dir, 'go', 'v4'), { 'recursive': true });
            fs.writeFileSync (path.join (dir, 'ts', 'src', 'base', 'Exchange.ts'), HEAD);
            fs.writeFileSync (path.join (dir, 'ts', 'src', 'abstract', 'x.ts'), ABSTRACT);
            fs.writeFileSync (path.join (dir, 'go', 'v4', 'x_api.go'), 'func (this *x) PublicGetA(args ...any) <-chan EndpointResult[map[string]any] {\n'
                + 'func (this *x) PublicGetB(args ...any) <-chan EndpointResult[map[string]any] {\n'
                + 'func (this *x) PublicGetL(args ...any) <-chan EndpointResult[[]any] {\n');
            fs.writeFileSync (path.join (dir, 'ts', 'src', 'x.ts'), 'import Exchange from \'./abstract/x.js\';\nclass x extends Exchange {\n' + body + '}\n');
            process.chdir (dir);
            const t: any = new Transpiler ({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 } } });
            installCcxtGoHooks (t.goTranspiler);
            return t.transpileGoByPath ('ts/src/x.ts').content;
        } finally {
            process.chdir (cwd);
            fs.rmSync (dir, { 'recursive': true, 'force': true });
        }
    };
    const fn = (tasks: string, tail = '') => '    async f (params = {}) {\n        const pa = this.publicGetA (params);\n        const pb = this.publicGetB (params);\n'
        + '        const pl = this.publicGetL (params);\n'
        + '        const [ ra, rb ] = await Promise.all ([ ' + tasks + ' ]);\n'
        + '        const more = this.safeList (rb, \'rows\', []);\n'
        + '        const data = this.safeDict (ra, \'data\', {});\n' + tail + '        const xs = this.safeList (data, \'xs\', []);\n'
        + '        const ys = this.safeList (data, \'ys\', []);\n'
        + '        return this.arrayConcat (this.arrayConcat (xs, ys), more);\n    }\n';
    test ('positive: the defaulted list reads print the comma-ok read (fails on the base printer)', () => {
        const out = print (fn ('pa, pb'));
        expect (out).toContain ('xs, _ = data["xs"].([]any)');
        expect (out).toContain ('ys, _ = data["ys"].([]any)');
        expect (out).not.toContain ('SafeListSlice(data,');
    });
    test ('negative: a task whose endpoint returns a list keeps the helper', () => {
        expect (print (fn ('pl, pb'))).not.toContain ('xs, _ = data["xs"].([]any)');
    });
    test ('negative: a slot that escapes to another call keeps the helper', () => {
        expect (print (fn ('pa, pb', '        this.keep (ra);\n'))).not.toContain ('xs, _ = data["xs"].([]any)');
    });
    test ('negative: a hop written into before the read keeps the helper', () => {
        expect (print (fn ('pa, pb', '        data[\'k\'] = 1;\n'))).not.toContain ('xs, _ = data["xs"].([]any)');
    });
});
