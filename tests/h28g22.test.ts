import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler, installCcxtGoLocalTypes } from '../src/transpiler';

const HEAD = 'class Exchange {\n'
    + '    safeString (o: any, k: any, d: Str = undefined): Str { return d; }\n'
    + '    safeInteger (o: any, k: any, d: Int = undefined): Int { return d; }\n'
    + '    parseNumber (v: any): Num { return v; }\n'
    + '    sink (v: any): void { }\n'
    + '}\nexport default Exchange;\n';
const print = (body: string): string => {
    const dir = fs.mkdtempSync (path.join (process.env.TMPDIR ?? os.tmpdir (), 'h28g22-'));
    try {
        fs.mkdirSync (path.join (dir, 'ts', 'src', 'base'), { 'recursive': true });
        const file = path.join (dir, 'ts', 'src', 'x.ts');
        const types = 'type Str = string | undefined;\ntype Int = number | undefined;\ntype Num = number | undefined;\ntype Dict = { [key: string]: any };\n';
        fs.writeFileSync (path.join (dir, 'ts', 'src', 'base', 'Exchange.ts'), types + HEAD);
        fs.writeFileSync (file, 'import Exchange from \'./base/Exchange.js\';\n' + types + 'export default class X extends Exchange {\n' + body + '\n}\n');
        const config: any = { 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 } } };
        const cwd = process.cwd ();
        process.chdir (dir);
        try {
            const t = new Transpiler (config);
            installCcxtGoLocalTypes (t.goTranspiler);
            return t.transpileGoByPath (file).content;
        } finally {
            process.chdir (cwd);
        }
    } finally {
        fs.rmSync (dir, { 'recursive': true, 'force': true });
    }
};

describe ('h28g22 ternary declaration into an any box prints var + if/else', () => {
    test ('a mixed-arm const declares the box and fills it with if/else', () => {
        const out = print ('    f (o: Dict, u: boolean) {\n        const v = u ? o[\'x\'] : \'none\';\n        this.sink (v);\n        return v;\n    }');
        expect (out).not.toContain ('func() any {');
        expect (out).toMatch (/var v any\n\s*if EvalTruthy\(u\) \{\n\s*v = [^\n]*"x"[^\n]*\n\s*\} else \{\n\s*v = "none"\n/);
    });
    test ('a nil arm stores an untyped nil and the nil test is kept', () => {
        const out = print ('    f (o: Dict, u: boolean) {\n        const v = u ? undefined : o[\'x\'];\n        if (v === undefined) {\n            return 1;\n        }\n        return v;\n    }');
        expect (out).not.toContain ('func() any {');
        expect (out).toMatch (/var v any\n\s*if EvalTruthy\(u\) \{\n\s*v = nil\n/);
    });
    test ('negative: a ternary nested in a call argument keeps the literal', () => {
        const out = print ('    f (o: Dict, u: boolean) {\n        this.sink (u ? this.safeString (o, \'a\') : this.parseNumber (o[\'x\']));\n    }');
        expect (out).toContain ('func() any {');
    });
    test ('negative: a *string arm keeps the literal (no DerefScalar store)', () => {
        const out = print ('    f (o: Dict, u: boolean) {\n        const v = u ? o[\'x\'] : this.safeString (o, \'a\');\n        this.sink (v);\n    }');
        expect (out).not.toMatch (/v = (ccxt\.)?DerefScalar\(/);
        expect (out).not.toMatch (/var v any\n/);
    });
    test ('negative: a same-type string join keeps its typed declaration, no any box', () => {
        const out = print ('    f (u: boolean) {\n        const v = u ? \'a\' : \'b\';\n        return v;\n    }');
        expect (out).not.toMatch (/var v any/);
    });
});
