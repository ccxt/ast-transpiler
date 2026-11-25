import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler, installCcxtGoLocalTypes } from '../src/transpiler';

const HEAD = 'class Exchange {\n'
    + '    safeString (o: any, k: any, d: Str = undefined): Str { return d; }\n'
    + '    safeNumber (o: any, k: any, d: Num = undefined): Num { return d; }\n'
    + '    parseNumber (v: any, d: Num = undefined): number { return d as number; }\n'
    + '    extend (a: any, b: any = {}): any { return a; }\n'
    + '    bump (): string { return \'x\'; }\n'
    + '    safeMarketStructure (m: any = undefined): any { return m; }\n'
    + '}\nexport default Exchange;\n';
const print = (body: string): string => {
    const dir = fs.mkdtempSync (path.join (process.env.TMPDIR ?? os.tmpdir (), 'h30g13-'));
    try {
        fs.mkdirSync (path.join (dir, 'ts', 'src', 'base'), { 'recursive': true });
        const file = path.join (dir, 'ts', 'src', 'x.ts');
        const types = 'type Str = string | undefined;\ntype Num = number | undefined;\ntype Dict = { [key: string]: any };\n';
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

describe ('h30g13 map-entry ternaries whose arms read a map element or call a pure reader', () => {
    test ('a local literal entry with a pure reader arm becomes an if / else store', () => {
        const out = print ('    f (o: Dict, isSpot: boolean) {\n        const a = this.safeString (o, \'a\');\n        const r = { \'id\': a, \'contractSize\': isSpot ? undefined : this.parseNumber (\'1\') };\n        return r;\n    }');
        expect (out).not.toContain ('func() any {');
        expect (out).toMatch (/var r map\[string\]any = map\[string\]any\{\n\s*"id": a,\n\s*\}\n\s*if EvalTruthy\(isSpot\) \{\n\s*r\["contractSize"\] = nil\n\s*\} else \{\n\s*r\["contractSize"\] = this\.ParseNumber\("1"\)\n\s*\}/);
    });
    test ('a returned call literal with a map element arm is bound first', () => {
        const out = print ('    f (o: Dict, m: Dict, funds: boolean) {\n        const a = this.safeString (o, \'a\');\n        return this.safeMarketStructure ({ \'id\': a, \'symbol\': funds ? m[\'symbol\'] : undefined });\n    }');
        expect (out).not.toContain ('func() any {');
        expect (out).toMatch (/var (literal\d+) map\[string\]any = map\[string\]any\{\n\s*"id": a,\n\s*\}\n\s*if EvalTruthy\(funds\) \{\n\s*\1\["symbol"\] = [^\n]+\n\s*\} else \{\n\s*\1\["symbol"\] = nil\n\s*\}\n\s*return this\.SafeMarketStructure\(\1\)/);
    });
    test ('an arm calling a method with side effects stays in the literal', () => {
        const out = print ('    f (o: Dict, flag: boolean) {\n        const a = this.safeString (o, \'a\');\n        const r = { \'x\': flag ? a : this.bump () };\n        return this.safeMarketStructure ({ \'y\': flag ? this.bump () : a });\n    }');
        expect (out).not.toMatch (/var literal\d+ /);
        expect (out).not.toMatch (/r\["x"\] = /);
    });
    test ('a reader whose argument is a call with side effects stays in the literal', () => {
        const out = print ('    f (o: Dict, flag: boolean) {\n        const r = { \'x\': flag ? this.safeString (o, this.bump ()) : undefined };\n        return r;\n    }');
        expect (out).not.toMatch (/r\["x"\] = /);
    });
    test ('a call with another argument that is not a pure read is not reordered', () => {
        const out = print ('    f (m: Dict, flag: boolean) {\n        return this.extend ({ \'x\': flag ? m[\'a\'] : undefined }, this.bump ());\n    }');
        expect (out).not.toMatch (/var literal\d+ /);
    });
    test ('a nil arm keeps the key with an untyped nil', () => {
        const out = print ('    f (o: Dict, amount: Str) {\n        const request = { \'Quantity\': (amount === undefined) ? undefined : this.parseNumber (amount) };\n        return request;\n    }');
        expect (out).toMatch (/request\["Quantity"\] = nil\n/);
        expect (out).toMatch (/request\["Quantity"\] = this\.ParseNumber\(amount\)/);
    });
});
