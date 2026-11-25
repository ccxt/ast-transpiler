import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

// a list cut from an `object[] | undefined` parameter holds objects only: its bounded element read needs no DerefScalar
describe ('h51g56: object[] parameters are pointer-free lists', () => {
    const HEAD = 'type Dict = { [key: string]: any };\nclass BaseExchange {\n'
        + '    toArray (o: any): any[] { return o; }\n'
        + '    safeInteger (o: any, k: any, d: number = undefined): number { return d; }\n    keep (o: any): any { return o; }\n}\nexport default BaseExchange;\n';
    const print = (body: string): string => {
        const dir = fs.mkdtempSync (path.join (process.env.TMPDIR || os.tmpdir (), 'h51g56-'));
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
    const loop = (decl: string): string => '    f (' + decl + ') {\n        const parsed: any[] = this.toArray (array);\n        const result = [];\n'
        + '        for (let i = 0; i < parsed.length; i++) {\n            const entry = parsed[i];\n            this.keep (this.safeInteger (entry, \'t\'));\n            result.push (entry);\n        }\n        return result;\n    }\n';
    test ('an object[] | undefined parameter reads its element bare', () => {
        const out = print (loop ('array: object[] | undefined'));
        expect (out).not.toContain ('DerefScalar(parsed[i])');
        expect (out).toContain ('parsed[i]');
    });
    test ('an object[] parameter reads its element bare', () => {
        const out = print (loop ('array: object[]'));
        expect (out).not.toContain ('DerefScalar(parsed[i])');
    });
    test ('negative: an any[] parameter keeps DerefScalar', () => {
        const out = print (loop ('array: any[]'));
        expect (out).toContain ('DerefScalar(parsed[i])');
    });
    test ('negative: a string[] | undefined parameter keeps DerefScalar', () => {
        const out = print (loop ('array: string[] | undefined'));
        expect (out).toContain ('DerefScalar(parsed[i])');
    });
    test ('negative: an any parameter keeps DerefScalar', () => {
        const out = print (loop ('array: any'));
        expect (out).toContain ('DerefScalar(parsed[i])');
    });
});
