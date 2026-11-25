import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

// a nil-seeded local written in each branch by an awaited typed endpoint is decoded JSON: its list member prints the comma-ok read
describe ('h50g44: safeList of a branch-joined endpoint local prints the comma-ok read', () => {
    const HEAD = 'type Dict = { [key: string]: any };\nclass BaseExchange {\n    safeList (o: any, k: any, d: any[] = undefined): any[] { return d; }\n'
        + '    safeString (o: any, k: any, d: string = undefined): string { return d; }\n    keep (o: any): any { return o; }\n}\nexport default BaseExchange;\n';
    const ABSTRACT = 'import _Exchange from \'../base/Exchange.js\';\ntype Dict = { [key: string]: any };\ninterface Exchange {\n'
        + '    privateGetA (params?: {}): Promise<Dict>;\n    privateGetB (params?: {}): Promise<Dict>;\n}\nabstract class Exchange extends _Exchange {}\nexport default Exchange;\n';
    const print = (body: string): string => {
        const dir = fs.mkdtempSync (path.join (process.env.TMPDIR || os.tmpdir (), 'h50g44-'));
        try {
            fs.mkdirSync (path.join (dir, 'ts', 'src', 'base'), { 'recursive': true });
            fs.mkdirSync (path.join (dir, 'ts', 'src', 'abstract'), { 'recursive': true });
            fs.mkdirSync (path.join (dir, 'go', 'v4'), { 'recursive': true });
            fs.writeFileSync (path.join (dir, 'ts', 'src', 'base', 'Exchange.ts'), HEAD);
            fs.writeFileSync (path.join (dir, 'ts', 'src', 'abstract', 'x.ts'), ABSTRACT);
            fs.writeFileSync (path.join (dir, 'go', 'v4', 'x_api.go'), 'func (this *x) PrivateGetA(args ...any) <-chan EndpointResult[map[string]any] {\n'
                + 'func (this *x) PrivateGetB(args ...any) <-chan EndpointResult[map[string]any] {\n');
            const file = path.join (dir, 'ts', 'src', 'x.ts');
            fs.writeFileSync (file, 'import Exchange from \'./abstract/x.js\';\nclass x extends Exchange {\n' + body + '}\n');
            const t: any = new Transpiler ({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 } } });
            installCcxtGoHooks (t.goTranspiler);
            return t.transpileGoByPath (file).content;
        } finally {
            fs.rmSync (dir, { 'recursive': true, 'force': true });
        }
    };
    const fn = (other: string, use: string) => '    async f (flag: boolean, params = {}) {\n        let response = undefined;\n'
        + '        if (flag) {\n            response = await this.privateGetA (params);\n        } else {\n            response = ' + other + ';\n        }\n'
        + use + '        const rows = this.safeList (response, \'rows\');\n        return rows.length;\n    }\n';
    const native = '\tvar rows []any\n\trows, _ = response["rows"].([]any)\n';

    test ('every branch an awaited typed endpoint: comma-ok list read', () => {
        const out = print (fn ('await this.privateGetB (params)', '        this.safeString (response, \'code\');\n'));
        expect (out).toContain (native);
        expect (out).not.toContain ('SafeListTyped(response, "rows")');
    });
    test ('negative: one branch writes a caller-built value, the wrap stays', () => {
        const out = print (fn ('this.keep ({ \'rows\': [] })', ''));
        expect (out).not.toContain (native);
    });
    test ('negative: the joined local handed to a non-reader keeps the wrap', () => {
        const out = print (fn ('await this.privateGetB (params)', '        this.keep (response);\n'));
        expect (out).not.toContain (native);
    });
    test ('negative: a nil-seeded local never written keeps the wrap', () => {
        const out = print ('    async f () {\n        let response = undefined;\n        const rows = this.safeList (response, \'rows\');\n        return rows.length;\n    }\n');
        expect (out).not.toContain (native);
    });
    test ('a {}-defaulted safeDict hop of the joined local is decoded JSON too', () => {
        const out = print ('    async f (flag: boolean, params = {}) {\n        let response = undefined;\n'
            + '        if (flag) {\n            response = await this.privateGetA (params);\n        } else {\n            response = await this.privateGetB (params);\n        }\n'
            + '        const data = this.safeDict (response, \'data\', {});\n        const rows = this.safeList (data, \'rows\');\n        return rows.length;\n    }\n');
        expect (out).toContain ('\tvar rows []any\n\trows, _ = data["rows"].([]any)\n');
    });
    test ('annotated nil seeds and nested branches with a throwing arm', () => {
        for (const ann of [ ': any', ': Dict' ]) {
            const out = print ('    async f (flag: boolean, two: boolean, params = {}) {\n        let response' + ann + ' = undefined;\n'
                + '        if (flag) {\n            if (two) {\n                response = await this.privateGetA (params);\n            } else {\n'
                + '                response = await this.privateGetB (params);\n            }\n        } else {\n            throw new Error (\'x\');\n        }\n'
                + '        const rows = this.safeList (response, \'rows\');\n        return rows.length;\n    }\n');
            expect (out).toContain (native);
        }
    });
    test ('the joined local handed out only after the read: comma-ok list read', () => {
        const out = print (fn ('await this.privateGetB (params)', '') .replace ('        return rows.length;\n', '        this.keep (response);\n        return rows.length;\n'));
        expect (out).toContain (native);
    });
    test ('negative: a non-endpoint write before the read, even with the hand-out after it, keeps the wrap', () => {
        const out = print (fn ('this.keep ({ \'rows\': [] })', '') .replace ('        return rows.length;\n', '        this.keep (response);\n        return rows.length;\n'));
        expect (out).not.toContain (native);
    });
    test ('negative: the read inside a loop keeps the wrap', () => {
        const out = print ('    async f (params = {}) {\n        let response = undefined;\n        response = await this.privateGetA (params);\n        let n = 0;\n'
            + '        for (let i = 0; i < 2; i++) {\n            const rows = this.safeList (response, \'rows\');\n            n = n + rows.length;\n            this.keep (response);\n        }\n        return n;\n    }\n');
        expect (out).not.toContain ('rows, _ = response');
    });
});
