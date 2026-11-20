import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

describe('go nil test on an any local written only by a method returning nil or a fresh literal', () => {
    const print = (methods: string, body: string): string => {
        const t: any = new Transpiler ({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 }, 'asyncMethodSuffix': 'Async' } });
        installCcxtGoHooks (t.goTranspiler);
        const tmp = fs.mkdtempSync (path.join (os.tmpdir (), 'h26g31-'));
        try {
            const dir = path.join (tmp, 'ts', 'src');
            fs.mkdirSync (dir, { 'recursive': true });
            const file = path.join (dir, 'x.ts');
            fs.writeFileSync (file, 'type Dict = { [key: string]: any };\ntype NullableDict = Dict | undefined;\nclass X {\n'
                + '    safeString (d: any, k: any): string | undefined { return d; }\n' + methods
                + '    run (p: any, n: number) {\n' + body + '\n    }\n}\n');
            return t.transpileGoByPath (file).content;
        } finally {
            fs.rmSync (tmp, { 'recursive': true, 'force': true });
        }
    };
    const PARSE = '    parseA (n: number): NullableDict {\n        if (n < 1) {\n            return undefined;\n        }\n'
        + '        const r: Dict = { \'a\': n };\n        r[\'b\'] = 1;\n        return r;\n    }\n'
        + '    parseB (n: number): NullableDict {\n        if (n < 2) {\n            return undefined;\n        }\n        return { \'b\': n };\n    }\n';
    test('locals written only by nil / literal-returning methods compare natively (fails on the base printer)', () => {
        const out = print (PARSE, '        let data: NullableDict = undefined;\n        if (n > 3) {\n            data = this.parseA (n);\n        } else {\n'
            + '            data = this.parseB (n);\n        }\n        if (data !== undefined) {\n            return data;\n        }\n        return undefined;');
        expect (out).toContain ('data != nil');
        expect (out).not.toContain ('IsEqual(data, nil)');
    });
    test('a method that can return a pointer keeps the helper', () => {
        const out = print (PARSE + '    parseC (p: any): any {\n        if (p === undefined) {\n            return undefined;\n        }\n        return this.safeString (p, \'x\');\n    }\n',
            '        let data: any = this.parseA (n);\n        if (n > 3) {\n            data = this.parseC (p);\n        }\n        if (data === undefined) {\n            return 1;\n        }\n        return data;');
        expect (out).toContain ('IsEqual(data, nil)');
    });
    test('a method returning a parameter keeps the helper', () => {
        const out = print ('    parseD (p: any): any {\n        return p;\n    }\n',
            '        const data = this.parseD (p);\n        if (data === undefined) {\n            return 1;\n        }\n        return data;');
        expect (out).toContain ('IsEqual(data, nil)');
    });
    test('a returned let local (reassignable) keeps the helper', () => {
        const out = print ('    parseE (p: any): any {\n        let r: any = {};\n        r = p;\n        return r;\n    }\n',
            '        const data = this.parseE (p);\n        if (data === undefined) {\n            return 1;\n        }\n        return data;');
        expect (out).toContain ('IsEqual(data, nil)');
    });
});
