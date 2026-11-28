import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

// a list whose every push is a loop counter or a joined string holds plain Go values: its element read needs no DerefScalar
describe ('h50g05: pushed loop counters and joined strings are plain list elements', () => {
    const HEAD = 'type Dict = { [key: string]: any };\nclass BaseExchange {\n'
        + '    safeString (o: any, k: any, d: string = undefined): string { return d; }\n'
        + '    keep (o: any): any { return o; }\n    ptr (o: any): string { return o; }\n}\nexport default BaseExchange;\n';
    const print = (body: string): string => {
        const dir = fs.mkdtempSync (path.join (process.env.TMPDIR || os.tmpdir (), 'h50g05-'));
        try {
            fs.mkdirSync (path.join (dir, 'ts', 'src', 'base'), { 'recursive': true });
            fs.writeFileSync (path.join (dir, 'ts', 'src', 'base', 'Exchange.ts'), HEAD);
            const file = path.join (dir, 'ts', 'src', 'x.ts');
            fs.writeFileSync (file, 'import Exchange from \'./base/Exchange.js\';\ntype Dict = { [key: string]: any };\nclass x extends Exchange {\n' + body + '}\n');
            const t: any = new Transpiler ({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 } } });
            installCcxtGoHooks (t.goTranspiler);
            return t.transpileGoByPath (file).content;
        } finally {
            fs.rmSync (dir, { 'recursive': true, 'force': true });
        }
    };
    test ('a list of loop counters reads its element bare', () => {
        const out = print ('    f (total: number) {\n        const pages: number[] = [];\n        for (let p = 2; p <= total; p++) {\n            pages.push (p);\n        }\n'
            + '        for (let i = 0; i < pages.length; i++) {\n            const req: Dict = { \'page\': pages[i] };\n            this.keep (req);\n        }\n    }\n');
        expect (out).not.toContain ('DerefScalar(pages[i])');
        expect (out).toContain ('"page": pages[i]');
    });
    test ('a list of joined strings reads its element bare', () => {
        const out = print ('    f (ids: string[]) {\n        const batches: string[] = [];\n        batches.push (ids.join (\',\'));\n'
            + '        for (let j = 0; j < batches.length; j++) {\n            const req: Dict = { \'txid\': batches[j] };\n            this.keep (req);\n        }\n    }\n');
        expect (out).not.toContain ('DerefScalar(batches[j])');
    });
    test ('negative: a pushed pointer-returning call keeps DerefScalar', () => {
        const out = print ('    f (rows: any) {\n        const names: string[] = [];\n        names.push (this.safeString (rows, \'a\'));\n'
            + '        for (let j = 0; j < names.length; j++) {\n            const req: Dict = { \'n\': names[j] };\n            this.keep (req);\n        }\n    }\n');
        expect (out).toContain ('DerefScalar(names[j])');
    });
    test ('negative: a pushed any local keeps DerefScalar', () => {
        const out = print ('    f (rows: any) {\n        const names = [];\n        const v: any = this.keep (rows);\n        names.push (v);\n'
            + '        for (let j = 0; j < names.length; j++) {\n            const req: Dict = { \'n\': names[j] };\n            this.keep (req);\n        }\n    }\n');
        expect (out).toContain ('DerefScalar(names[j])');
    });
});
