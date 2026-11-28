import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler, installCcxtGoLocalTypes } from '../src/transpiler';

const HEAD = 'class Exchange {\n'
    + '    safeString (o: any, k: any, d: Str = undefined): Str { return d; }\n'
    + '    safeInteger (o: any, k: any, d: Int = undefined): Int { return d; }\n'
    + '    parseNumber (v: any): Num { return v; }\n'
    + '    sink (v: any): void { }\n'
    + '    tag (v: string): Str { return v; }\n'
    + '}\nexport default Exchange;\n';
const print = (body: string): string => {
    const dir = fs.mkdtempSync (path.join (process.env.TMPDIR ?? os.tmpdir (), 'h28g10-'));
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

describe ('h28g10 *string ternary declaration prints var + if/else', () => {
    test ('a literal arm and a *string call arm', () => {
        const out = print ('    f (o: Dict, p: boolean) {\n        const raw = this.safeString (o, \'t\');\n        const v = p ? \'PO\' : this.safeString (o, \'u\');\n        return v;\n    }');
        expect (out).not.toContain ('func() *string {');
        expect (out).toMatch (/var v \*string\n\s*if EvalTruthy\(p\) \{\n\s*retStr := "PO"\n\s*v = &retStr\n\s*\} else \{\n\s*v = this\.SafeString\(o, "u"\)\n\s*\}/);
    });
    test ('a nil arm stays a typed nil written in the branch, and the nil test is kept', () => {
        const out = print ('    f (o: Dict, p: boolean) {\n        const raw = this.safeString (o, \'t\');\n        const v = p ? raw : undefined;\n        if (v === undefined) {\n            return 1;\n        }\n        return 2;\n    }');
        expect (out).not.toContain ('func() *string {');
        expect (out).toMatch (/var v \*string\n\s*if EvalTruthy\(p\) \{\n\s*v = raw\n\s*\} else \{\n\s*v = nil\n\s*\}/);
        expect (out).toContain ('v == nil');
    });
    test ('negative: an any arm keeps the any literal, no *string split', () => {
        const out = print ('    f (o: Dict, p: boolean) {\n        const v = p ? o[\'x\'] : \'y\';\n        this.sink (v);\n    }');
        expect (out).not.toContain ('var v *string\n');
    });
    test ('negative: a nested ternary arm is not split', () => {
        const out = print ('    f (o: Dict, p: boolean, q: boolean) {\n        const raw = this.safeString (o, \'t\');\n        const v = p ? (q ? \'a\' : raw) : raw;\n        return v;\n    }');
        expect (out).not.toMatch (/var v \*string\n\s*if /);
    });
});
describe ('h28g10 member-read local keeps its literal', () => {
    test ('negative: a local read as a method receiver is not split', () => {
        const out = print ('    f (o: Dict, p: boolean) {\n        const v = p ? this.safeString (o, \'u\', \'a\') : \'b\';\n        return v.toLowerCase ();\n    }');
        expect (out).not.toMatch (/var v \*string\n/);
    });
});
