import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

describe('go nil test on a copy of a proven any local, a handleOptionAndParams slot or an extend result', () => {
    const print = (body: string): string => {
        const t: any = new Transpiler ({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 }, 'asyncMethodSuffix': 'Async' } });
        installCcxtGoHooks (t.goTranspiler);
        const tmp = fs.mkdtempSync (path.join (os.tmpdir (), 'h29g11-'));
        try {
            const dir = path.join (tmp, 'ts', 'src', 'base');
            fs.mkdirSync (dir, { 'recursive': true });
            const file = path.join (dir, 'Exchange.ts');
            fs.writeFileSync (file, 'type Dict = { [key: string]: any };\nclass Exchange {\n'
                + '    safeValue (d: any, k: any, dv: any = undefined): any { return d; }\n'
                + '    safeString (d: any, k: any, dv: any = undefined): string | undefined { return d; }\n'
                + '    handleOptionAndParams (params: object, methodName: string, optionName: string, defaultValue: any = undefined): [any, Dict] { return [ undefined, {} ]; }\n'
                + '    run (p: Dict, q: any, params = {}) {\n' + body + '\n    }\n}\n');
            return t.transpileGoByPath (file).content;
        } finally {
            fs.rmSync (tmp, { 'recursive': true, 'force': true });
        }
    };
    test('a copy of a handleOptionAndParams slot and of a proven local compare natively (fails on the base printer)', () => {
        const out = print ('        const [ opt, rest ] = this.handleOptionAndParams (params, \'m\', \'o\');\n        const lev = opt;\n'
            + '        if (lev === undefined) {\n            return rest;\n        }\n'
            + '        const resp = this.safeValue (p, \'r\');\n        const content = resp;\n        if (content !== undefined) {\n            return content;\n        }\n        return lev;');
        expect (out).toContain ('lev == nil');
        expect (out).toContain ('content != nil');
        expect (out).not.toMatch (/IsEqual\((lev|content), nil\)/);
    });
    test('a copy of a required any parameter keeps the helper (a caller may pass a *T)', () => {
        const out = print ('        const bad = q;\n        if (bad === undefined) {\n            return 1;\n        }\n        return bad;');
        expect (out).not.toContain ('bad == nil');
    });
    test('a copy whose other write is pointer-capable keeps the helper', () => {
        const out = print ('        const [ opt, rest ] = this.handleOptionAndParams (params, \'m\', \'o\');\n        let lev: any = opt;\n'
            + '        if (q) {\n            lev = this.safeString (p, \'x\');\n        }\n'
            + '        if (lev === undefined) {\n            return rest;\n        }\n        return lev;');
        expect (out).not.toContain ('lev == nil');
    });
    test('a rebound handleOptionAndParams slot keeps the helper', () => {
        const out = print ('        let [ opt, rest ] = this.handleOptionAndParams (params, \'m\', \'o\');\n'
            + '        [ opt, rest ] = [ this.safeString (p, \'x\'), rest ];\n        const lev = opt;\n'
            + '        if (lev === undefined) {\n            return rest;\n        }\n        return lev;');
        expect (out).not.toContain ('lev == nil');
    });
});
