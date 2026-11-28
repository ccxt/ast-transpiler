import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler, installCcxtGoLocalTypes } from '../src/transpiler';

const HEAD = 'class Exchange {\n'
    + '    safeString (o: any, k: any, d: Str = undefined): Str { return d; }\n'
    + '    extend (a: any, b: any = {}): any { return a; }\n'
    + '    bump (): string { return \'x\'; }\n'
    + '    use (a: any): any { return a; }\n'
    + '}\nexport default Exchange;\n';
const print = (body: string): string => {
    const dir = fs.mkdtempSync (path.join (process.env.TMPDIR ?? os.tmpdir (), 'h28g23-'));
    try {
        fs.mkdirSync (path.join (dir, 'ts', 'src', 'base'), { 'recursive': true });
        const file = path.join (dir, 'ts', 'src', 'x.ts');
        const types = 'type Str = string | undefined;\ntype Dict = { [key: string]: any };\n';
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

describe ('h28g23 ternary entry of a map literal local', () => {
    test ('a nil-arm entry becomes an if/else store after the literal', () => {
        const out = print ('    f (o: Dict, flag: boolean) {\n        const a = this.safeString (o, \'a\');\n        const r = { \'id\': 1, \'x\': flag ? a : undefined };\n        return r;\n    }');
        expect (out).not.toContain ('func() any {');
        expect (out).toMatch (/var r map\[string\]any = map\[string\]any\{\n\s*"id": 1,\n\s*\}\n\s*if EvalTruthy\(flag\) \{\n\s*r\["x"\] = a\n\s*\} else \{\n\s*r\["x"\] = nil\n\s*\}/);
    });
    test ('an arm with a call is left in the literal', () => {
        const out = print ('    f (o: Dict, flag: boolean) {\n        const a = this.safeString (o, \'a\');\n        const r = { \'x\': flag ? a : this.bump () };\n        return r;\n    }');
        expect (out).not.toMatch (/r\["x"\] = /);
    });
    test ('a this field arm is left in the literal', () => {
        const out = print ('    f (flag: boolean) {\n        const r = { \'x\': flag ? this.id : undefined };\n        return r;\n    }');
        expect (out).not.toMatch (/r\["x"\] = /);
    });
    test ('an entry of a returned literal is not moved', () => {
        const out = print ('    f (o: Dict, flag: boolean) {\n        const a = this.safeString (o, \'a\');\n        return { \'x\': flag ? a : undefined };\n    }');
        expect (out).toMatch (/var (literal\d+) map\[string\]any = map\[string\]any\{\}\n\s*if EvalTruthy\(flag\) \{\n\s*\1\["x"\] = a\n\s*\} else \{\n\s*\1\["x"\] = nil\n\s*\}\n\s*return \1\n/);
    });
});
