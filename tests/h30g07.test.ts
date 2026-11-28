import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

describe('go nil test on a local whose other write is a scalar accessor the build stores dereferenced', () => {
    const print = (body: string): string => {
        const t: any = new Transpiler ({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 }, 'asyncMethodSuffix': 'Async' } });
        installCcxtGoHooks (t.goTranspiler);
        const tmp = fs.mkdtempSync (path.join (os.tmpdir (), 'h30g07-'));
        try {
            const base = path.join (tmp, 'ts', 'src', 'base');
            fs.mkdirSync (base, { 'recursive': true });
            fs.writeFileSync (path.join (base, 'Exchange.ts'), 'export type Dict = { [key: string]: any };\nexport class Exchange {\n'
                + '    safeValue (d: any, k: any, dv: any = undefined): any { return d; }\n'
                + '    safeInteger (d: any, k: any, dv: any = undefined): number | undefined { return d; }\n'
                + '    safeString (d: any, k: any, dv: any = undefined): string | undefined { return d; }\n'
                + '    handleOptionAndParams (params: object, methodName: string, optionName: string, defaultValue: any = undefined): [any, Dict] { return [ undefined, {} ]; }\n'
                + '}\n');
            const file = path.join (tmp, 'ts', 'src', 'venue.ts');
            fs.writeFileSync (file, 'import { Exchange, Dict } from \'./base/Exchange.js\';\nexport default class venue extends Exchange {\n'
                + '    run (p: Dict, q: any, params = {}) {\n' + body + '\n    }\n}\n');
            return t.transpileGoByPath (file).content;
        } finally {
            fs.rmSync (tmp, { 'recursive': true, 'force': true });
        }
    };
    test('a handleOptionAndParams copy re-written by safeInteger compares natively (fails on the base printer)', () => {
        const out = print ('        const [ opt, rest ] = this.handleOptionAndParams (params, \'m\', \'o\');\n        let lev = opt;\n'
            + '        if (lev === undefined) {\n            lev = this.safeInteger (p, \'x\');\n            if (lev === undefined) {\n                return rest;\n            }\n        }\n        return lev;');
        expect (out).toContain ('lev == nil');
        expect (out).not.toMatch (/IsEqual\(lev, nil\)/);
    });
    test('a write from a required any parameter keeps the helper', () => {
        const out = print ('        let lev = this.safeValue (p, \'y\');\n        if (lev === undefined) {\n            lev = this.safeInteger (p, \'x\');\n        }\n'
            + '        lev = q;\n        if (lev === undefined) {\n            return 1;\n        }\n        return lev;');
        expect (out).not.toContain ('lev == nil');
    });
    test('an accessor result inside a larger expression is no deref store and keeps the helper', () => {
        const out = print ('        let lev = this.safeValue (p, \'y\');\n        if (q) {\n            lev = this.safeString (p, \'x\') || this.safeString (p, \'z\');\n        }\n'
            + '        if (lev === undefined) {\n            return 1;\n        }\n        return lev;');
        expect (out).not.toContain ('lev == nil');
    });
    test('the same write in the base class (no deref pass) keeps the helper', () => {
        const t: any = new Transpiler ({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 }, 'asyncMethodSuffix': 'Async' } });
        installCcxtGoHooks (t.goTranspiler);
        const tmp = fs.mkdtempSync (path.join (os.tmpdir (), 'h30g07-'));
        try {
            const base = path.join (tmp, 'ts', 'src', 'base');
            fs.mkdirSync (base, { 'recursive': true });
            const file = path.join (base, 'Exchange.ts');
            fs.writeFileSync (file, 'class Exchange {\n    safeValue (d: any, k: any, dv: any = undefined): any { return d; }\n'
                + '    safeInteger (d: any, k: any, dv: any = undefined): number | undefined { return d; }\n'
                + '    run (p: any) {\n        let lev = this.safeValue (p, \'y\');\n        if (lev === undefined) {\n            lev = this.safeInteger (p, \'x\');\n        }\n'
                + '        if (lev === undefined) {\n            return 1;\n        }\n        return lev;\n    }\n}\n');
            expect (t.transpileGoByPath (file).content).not.toContain ('lev == nil');
        } finally {
            fs.rmSync (tmp, { 'recursive': true, 'force': true });
        }
    });
});
