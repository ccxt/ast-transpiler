import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

describe('go nil test on an any local written only by base safeDict/safeList', () => {
    const HEAD = 'type Dict = { [key: string]: any };\ntype Str = string | undefined;\nclass Exchange {\n    options: Dict = {};\n'
        + '    safeDict (d: any, k: any, def: any = undefined): Dict { return d; }\n'
        + '    safeList (d: any, k: any, def: any = undefined): any[] { return d; }\n'
        + '    safeString (d: any, k: any, def: any = undefined): Str { return d; }\n'
        + '    parseIds (v: any): any { return v; }\n';
    const print = (body: string, extraMethods = ''): string => {
        const t: any = new Transpiler ({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 }, 'asyncMethodSuffix': 'Async' } });
        installCcxtGoHooks (t.goTranspiler);
        const tmp = fs.mkdtempSync (path.join (os.tmpdir (), 'h25g16-'));
        try {
            const base = path.join (tmp, 'ts', 'src', 'base');
            fs.mkdirSync (base, { 'recursive': true });
            const file = path.join (base, 'Exchange.ts');
            fs.writeFileSync (file, HEAD + extraMethods + '    run (p: any, s: string) {\n' + body + '\n    }\n}\n');
            return t.transpileGoByPath (file).content;
        } finally {
            fs.rmSync (tmp, { 'recursive': true, 'force': true });
        }
    };
    test('safeList then a list literal write compares natively (fails on the base printer)', () => {
        const out = print ("let types = this.safeList (p, 'types');\nif (types === undefined) {\n    types = [];\n}\nreturn types;");
        expect (out).toContain ('if types == nil {');
        expect (out).not.toContain ('IsEqual(types, nil)');
    });
    test('safeDict with a literal default compares natively', () => {
        const out = print ("let d = this.safeDict (p, 'x', {});\nif (d !== undefined) {\n    return d;\n}\nreturn undefined;");
        expect (out).not.toContain ('IsEqual(d, nil)');
    });
    test('a non-literal default keeps the helper', () => {
        const out = print ("const q = this.safeString (p, 'q');\nlet d = this.safeDict (p, 'x', q);\nif (d === undefined) {\n    return 1;\n}\nreturn d;");
        expect (out).toContain ('IsEqual(d, nil)');
    });
    test('a pointer-capable write keeps the helper', () => {
        const out = print ("let d: any = this.safeList (p, 'x');\nd = this.safeString (p, 'y');\nif (d === undefined) {\n    return 1;\n}\nreturn d;");
        expect (out).toContain ('IsEqual(d, nil)');
    });
    test('an unproven call write keeps the helper', () => {
        const out = print ("let d = this.safeList (p, 'x');\nd = this.parseIds (d);\nif (d === undefined) {\n    return 1;\n}\nreturn d;");
        expect (out).toContain ('IsEqual(d, nil)');
    });
    test('a venue override of safeList keeps the helper', () => {
        const t: any = new Transpiler ({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 }, 'asyncMethodSuffix': 'Async' } });
        installCcxtGoHooks (t.goTranspiler);
        const tmp = fs.mkdtempSync (path.join (os.tmpdir (), 'h25g16-'));
        try {
            const dir = path.join (tmp, 'ts', 'src');
            fs.mkdirSync (dir, { 'recursive': true });
            const file = path.join (dir, 'x.ts');
            fs.writeFileSync (file, 'class X {\n    safeList (d: any, k: any): any { return d; }\n    run (p: any, s: string) {\n'
                + "        let t = this.safeList (p, 'types');\n        if (t === undefined) {\n            t = s.split (',');\n        }\n        return t;\n    }\n}\n");
            expect (t.transpileGoByPath (file).content).toContain ('IsEqual(t, nil)');
        } finally {
            fs.rmSync (tmp, { 'recursive': true, 'force': true });
        }
    });
});
