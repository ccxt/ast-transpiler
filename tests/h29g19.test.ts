import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler, installCcxtGoLocalTypes } from '../src/transpiler';

const HEAD = 'class Exchange {\n'
    + '    safeString (o: any, k: any, d: Str = undefined): Str { return d; }\n'
    + '    extend (a: any, b: any = {}): any { return a; }\n'
    + '    bump (): string { return \'x\'; }\n'
    + '    use (a: any): any { return a; }\n'
    + '    safeMarketStructure (m: any = undefined): any { return m; }\n'
    + '}\nexport default Exchange;\n';
const print = (body: string): string => {
    const dir = fs.mkdtempSync (path.join (process.env.TMPDIR ?? os.tmpdir (), 'h29g19-'));
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

describe ('h29g19 ternary entry of a returned / argument map literal', () => {
    test ('a returned call literal is bound to a typed local with an if/else store', () => {
        const out = print ('    f (o: Dict, isSpot: boolean) {\n        const a = this.safeString (o, \'a\');\n        return this.safeMarketStructure ({ \'id\': a, \'linear\': isSpot ? undefined : true });\n    }');
        expect (out).not.toContain ('func() any {');
        expect (out).toMatch (/var (literal\d+) map\[string\]any = map\[string\]any\{\n\s*"id": a,\n\s*\}\n\s*if EvalTruthy\(isSpot\) \{\n\s*\1\["linear"\] = nil\n\s*\} else \{\n\s*\1\["linear"\] = true\n\s*\}\n\s*return this\.SafeMarketStructure\(\1\)/);
    });
    test ('a pushed literal is bound before the append', () => {
        const out = print ('    f (o: Dict, flag: boolean) {\n        const a = this.safeString (o, \'a\');\n        const result = [];\n        result.push ({ \'x\': flag ? a : undefined });\n        return result;\n    }');
        expect (out).not.toContain ('func() any {');
        expect (out).toMatch (/(literal\d+)\["x"\] = nil\n\s*\}\n\s*result = append\(result, \1\)/);
    });
    test ('an arm with a call stays in the literal', () => {
        const out = print ('    f (o: Dict, flag: boolean) {\n        const a = this.safeString (o, \'a\');\n        return this.safeMarketStructure ({ \'x\': flag ? a : this.bump () });\n    }');
        expect (out).not.toMatch (/var literal\d+ /);
    });
    test ('a call with another non-local argument is not reordered', () => {
        const out = print ('    f (o: Dict, flag: boolean) {\n        const a = this.safeString (o, \'a\');\n        return this.extend ({ \'x\': flag ? a : undefined }, this.bump ());\n    }');
        expect (out).not.toMatch (/var literal\d+ /);
    });
    test ('a this field arm stays in the literal', () => {
        const out = print ('    f (flag: boolean) {\n        return this.safeMarketStructure ({ \'x\': flag ? this.id : undefined });\n    }');
        expect (out).not.toMatch (/var literal\d+ /);
    });
});
