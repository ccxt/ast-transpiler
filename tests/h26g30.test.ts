import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

describe('go nil test on an any local copied from a GetArg-bound optional parameter', () => {
    const HEAD = 'type Dict = { [key: string]: any };\ntype Str = string | undefined;\ntype Strings = string[] | undefined;\nclass Exchange {\n    symbols: string[] = [];\n'
        + '    safeString (d: any, k: any, def: any = undefined): Str { return d; }\n'
        + '    parseIds (v: any): any { return v; }\n';
    const print = (method: string): string => {
        const t: any = new Transpiler ({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 }, 'asyncMethodSuffix': 'Async' } });
        installCcxtGoHooks (t.goTranspiler);
        const dir = process.env.TMPDIR ?? os.tmpdir ();
        const tmp = fs.mkdtempSync (path.join (dir, 'h26g30-'));
        try {
            const base = path.join (tmp, 'ts', 'src', 'base');
            fs.mkdirSync (base, { 'recursive': true });
            const file = path.join (base, 'Exchange.ts');
            fs.writeFileSync (file, HEAD + method + '\n}\n');
            return t.transpileGoByPath (file).content;
        } finally {
            fs.rmSync (tmp, { 'recursive': true, 'force': true });
        }
    };
    test('a copy of a GetArg-bound parameter, re-written with a literal, compares natively (fails on the base printer)', () => {
        const out = print ("    run (symbols: Strings = undefined, params: Dict = {}) {\n        let symbolsList: Strings = symbols;\n        if (params['x'] !== undefined) {\n            symbolsList = [ 'a' ];\n        }\n        if (symbolsList !== undefined) {\n            return 1;\n        }\n        return 0;\n    }");
        expect (out).toContain ('if symbolsList != nil {');
        expect (out).not.toContain ('IsEqual(symbolsList, nil)');
    });
    test('a required parameter (no GetArg) copied keeps the helper', () => {
        const out = print ("    run (symbols: Strings, params: Dict = {}) {\n        let symbolsList: Strings = symbols;\n        if (params['x'] !== undefined) {\n            symbolsList = [ 'a' ];\n        }\n        if (symbolsList !== undefined) {\n            return 1;\n        }\n        return 0;\n    }");
        expect (out).toContain ('IsEqual(symbolsList, nil)');
    });
    test('a parameter later written from a pointer accessor keeps the helper on its copy', () => {
        const out = print ("    run (code: any = undefined, params: Dict = {}) {\n        if (params['x'] !== undefined) {\n            code = this.safeString (params, 'x');\n        }\n        let c: any = code;\n        if (params['y'] !== undefined) {\n            c = [ 'a' ];\n        }\n        if (c === undefined) {\n            return 1;\n        }\n        return 0;\n    }");
        expect (out).toContain ('IsEqual(c, nil)');
    });
    test('a parameter later written from an unproven call keeps the helper on its copy', () => {
        const out = print ("    run (code: any = undefined, params: Dict = {}) {\n        code = this.parseIds (params);\n        let c: any = code;\n        if (params['y'] !== undefined) {\n            c = [ 'a' ];\n        }\n        if (c === undefined) {\n            return 1;\n        }\n        return 0;\n    }");
        expect (out).toContain ('IsEqual(c, nil)');
    });
});
