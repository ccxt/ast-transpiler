import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

// a nil-seeded local bound in every branch to an awaited endpoint list, read in a loop over its own length
describe ('h53g30: bounded loop read of a branch-joined endpoint list', () => {
    const HEAD = 'type Dict = { [key: string]: any };\nclass BaseExchange {\n    safeString (o: any, k: any, d: string = undefined): string { return d; }\n    keep (o: any): any { return o; }\n}\nexport default BaseExchange;\n';
    const ABSTRACT = 'import _Exchange from \'../base/Exchange.js\';\ntype Dict = { [key: string]: any };\ntype List = any[];\ninterface Exchange {\n'
        + '    publicGetA (params?: {}): Promise<List>;\n    publicGetB (params?: {}): Promise<List>;\n}\nabstract class Exchange extends _Exchange {}\nexport default Exchange;\n';
    const print = (body: string): string => {
        const dir = fs.mkdtempSync (path.join (process.env.TMPDIR || os.tmpdir (), 'h53g30-'));
        try {
            fs.mkdirSync (path.join (dir, 'ts', 'src', 'base'), { 'recursive': true });
            fs.mkdirSync (path.join (dir, 'ts', 'src', 'abstract'), { 'recursive': true });
            fs.mkdirSync (path.join (dir, 'go', 'v4'), { 'recursive': true });
            fs.writeFileSync (path.join (dir, 'ts', 'src', 'base', 'Exchange.ts'), HEAD);
            fs.writeFileSync (path.join (dir, 'ts', 'src', 'abstract', 'x.ts'), ABSTRACT);
            fs.writeFileSync (path.join (dir, 'go', 'v4', 'x_api.go'), 'func (this *x) PublicGetA(args ...any) <-chan EndpointResult[[]any] {\n'
                + 'func (this *x) PublicGetB(args ...any) <-chan EndpointResult[[]any] {\n');
            const file = path.join (dir, 'ts', 'src', 'x.ts');
            fs.writeFileSync (file, 'import Exchange from \'./abstract/x.js\';\nclass x extends Exchange {\n' + body + '}\n');
            const t: any = new Transpiler ({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 } } });
            installCcxtGoHooks (t.goTranspiler);
            return t.transpileGoByPath (file).content;
        } finally {
            fs.rmSync (dir, { 'recursive': true, 'force': true });
        }
    };
    const fn = (other: string) => '    async f (flag: boolean, params = {}) {\n        let response = undefined;\n'
        + '        if (flag) {\n            response = await this.publicGetA (params);\n        } else {\n            response = ' + other + ';\n        }\n'
        + '        const rows = [];\n        for (let i = 0; i < response.length; i++) {\n            const ticker = response[i];\n'
        + '            rows.push (this.safeString (ticker, \'s\'));\n        }\n        return rows;\n    }\n';

    test ('positive: the loop-bounded read of the joined endpoint list is the slice index', () => {
        const out = print (fn ('await this.publicGetB (params)'));
        expect (out).toContain ('var response []any = nil');
        expect (out).toContain ('var ticker map[string]any = MapTyped(response[i])');
        expect (out).not.toContain ('GetValue(response, i)');
    });
    test ('negative: one branch writes a caller-built list, the helper stays', () => {
        const out = print (fn ('this.keep ([])'));
        expect (out).not.toContain ('MapTyped(response[i])');
    });
    test ('negative: a read outside a bounded loop prints no closure', () => {
        const out = print ('    async f (flag: boolean, params = {}) {\n        let response = undefined;\n'
            + '        if (flag) {\n            response = await this.publicGetA (params);\n        } else {\n            response = await this.publicGetB (params);\n        }\n'
            + '        return this.safeString (response[0], \'s\');\n    }\n');
        expect (out).not.toContain ('func() any');
    });
});
