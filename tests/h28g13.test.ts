import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

describe('go nil test on an any local read by a base safe accessor with a proven local default', () => {
    const print = (body: string): string => {
        const t: any = new Transpiler ({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 }, 'asyncMethodSuffix': 'Async' } });
        installCcxtGoHooks (t.goTranspiler);
        const tmp = fs.mkdtempSync (path.join (os.tmpdir (), 'h28g13-'));
        try {
            const dir = path.join (tmp, 'ts', 'src', 'base');
            fs.mkdirSync (dir, { 'recursive': true });
            const file = path.join (dir, 'Exchange.ts');
            fs.writeFileSync (file, 'type Dict = { [key: string]: any };\nclass Exchange {\n'
                + '    safeValue (d: any, k: any, dv: any = undefined): any { return d; }\n'
                + '    safeValue2 (d: any, k: any, k2: any, dv: any = undefined): any { return d; }\n'
                + '    safeDict (d: any, k: any, dv: any = undefined): any { return d; }\n'
                + '    safeString (d: any, k: any): string | undefined { return d; }\n'
                + '    run (p: any, q: any, n: number) {\n' + body + '\n    }\n}\n');
            return t.transpileGoByPath (file).content;
        } finally {
            fs.rmSync (tmp, { 'recursive': true, 'force': true });
        }
    };
    test('a self default and a proven local default compare natively (fails on the base printer)', () => {
        const out = print ('        let ids = this.safeValue2 (q, \'a\', \'b\');\n        ids = this.safeValue2 (q, \'c\', \'d\', ids);\n'
            + '        if (ids === undefined) {\n            return 1;\n        }\n'
            + '        const errs = this.safeDict (p, \'errs\');\n        const error = this.safeDict (q, \'error\', errs);\n'
            + '        if (error !== undefined) {\n            return error;\n        }\n        return ids;');
        expect (out).toContain ('ids == nil');
        expect (out).toContain ('error != nil');
        expect (out).not.toMatch (/IsEqual\((ids|error), nil\)/);
    });
    test('a default local with a pointer-capable write keeps the helper', () => {
        const out = print ('        let d: any = this.safeDict (p, \'x\');\n        if (n > 1) {\n            d = this.safeString (p, \'y\');\n        }\n'
            + '        const error = this.safeDict (q, \'error\', d);\n        if (error === undefined) {\n            return 1;\n        }\n        return error;');
        expect (out).not.toContain ('error == nil');
    });
    test('a required any parameter as the default keeps the helper (a caller may pass a *T)', () => {
        const out = print ('        const v = this.safeValue (q, \'v\', p);\n        if (v === undefined) {\n            return 1;\n        }\n        return v;');
        expect (out).not.toContain ('v == nil');
    });
    test('a self default whose other write is pointer-capable keeps the helper', () => {
        const out = print ('        let ids: any = this.safeString (q, \'a\');\n        ids = this.safeValue2 (q, \'c\', \'d\', ids);\n'
            + '        if (ids === undefined) {\n            return 1;\n        }\n        return ids;');
        expect (out).not.toContain ('ids == nil');
    });
});
