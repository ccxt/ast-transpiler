import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

// a slot of `const [ a, b ] = await Promise.all ([ endpoint tasks ])` holds decoded JSON: its list cut prints the comma-ok read
describe ('h53g44: list read on a cut of a Promise.all endpoint slot', () => {
    const HEAD = 'type Dict = { [key: string]: any };\nclass BaseExchange {\n    safeList (o: any, k: any, d: any[] = undefined): any[] { return d; }\n'
        + '    safeDict (o: any, k: any, d: Dict = undefined): Dict { return d; }\n    keep (o: any): any { return o; }\n}\nexport default BaseExchange;\n';
    const ABSTRACT = 'import _Exchange from \'../base/Exchange.js\';\ntype Dict = { [key: string]: any };\ntype List = any[];\ninterface Exchange {\n'
        + '    publicGetA (params?: {}): Promise<Dict>;\n    publicGetB (params?: {}): Promise<Dict>;\n    publicGetL (params?: {}): Promise<List>;\n}\nabstract class Exchange extends _Exchange {}\nexport default Exchange;\n';
    const print = (body: string): string => {
        const dir = fs.mkdtempSync (path.join (process.env.TMPDIR || os.tmpdir (), 'h53g44-'));
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
        + '        const data = this.safeDict (ra, \'data\', {});\n        const rows = this.safeList (data, \'rows\', []);\n'
        + '        const more = this.safeList (rb, \'rows\', []);\n' + tail
        + '        return [ rows.length, more.length ];\n    }\n';
    test ('positive: a safeDict cut of a map endpoint slot (fails on the base printer)', () => {
        const out = print (fn ('pa, pb'));
        expect (out).toContain ('rows, _ = data["rows"].([]any)');
        expect (out).not.toContain ('SafeListTyped(data, "rows")');
    });
    test ('negative: a list read straight on the slot keeps the wrap (the slot stays typed)', () => {
        expect (print (fn ('pa, pb'))).toContain ('SafeListTyped(rb, "rows")');
    });
    test ('negative: a task whose endpoint returns a list keeps the wrap', () => {
        const out = print (fn ('pl, pb'));
        expect (out).not.toContain ('rows, _ = data["rows"].([]any)');
    });
    test ('negative: a slot that escapes to another call keeps the wrap', () => {
        const out = print (fn ('pa, pb', '        this.keep (ra);\n'));
        expect (out).not.toContain ('rows, _ = data["rows"].([]any)');
    });
});
