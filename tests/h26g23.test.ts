import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler, installCcxtGoLocalTypes } from '../src/transpiler';

const HEAD = 'class Exchange {\n'
    + '    safeString (o: any, k: any, d: Str = undefined): Str { return d; }\n'
    + '    extend (a: any, b: any = {}): any { return a; }\n'
    + '    bump (): string { return \'x\'; }\n'
    + '}\nexport default Exchange;\n';
const print = (body: string): string => {
    const dir = fs.mkdtempSync (path.join (process.env.TMPDIR ?? os.tmpdir (), 'h26g23-'));
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

describe ('h26g23 string-literal ternary inside a statement', () => {
    test ('a map entry over a *string compare hoists to a typed string local', () => {
        const out = print ('    f (o: Dict) {\n        const optionType = this.safeString (o, \'t\');\n        return { \'optionType\': (optionType === \'C\') ? \'call\' : \'put\', \'id\': 1 };\n    }');
        expect (out).not.toContain ('func() string {');
        expect (out).toMatch (/var ternaryStr\d+ string = "put"\n\s*if optionType != nil && \*optionType == "C" \{\n\s*ternaryStr\d+ = "call"\n\s*\}/);
        expect (out).toMatch (/"optionType": ternaryStr\d+,/);
    });
    test ('a call argument in an expression statement hoists too', () => {
        const out = print ('    f (o: Dict, isSpot: boolean) {\n        this.extend (o, { \'type\': isSpot ? \'spot\' : \'swap\' });\n    }');
        expect (out).not.toContain ('func() string {');
        expect (out).toMatch (/if EvalTruthy\(isSpot\) \{\n\s*ternaryStr\d+ = "spot"/);
    });
    test ('negative: an arm that is not a string literal keeps the literal', () => {
        const out = print ('    f (o: Dict, isSpot: boolean) {\n        return { \'type\': isSpot ? this.bump () : \'swap\' };\n    }');
        expect (out).not.toMatch (/ternaryStr/);
    });
    test ('negative: a condition with a side-effecting call is not moved', () => {
        const out = print ('    f (o: Dict) {\n        return { \'type\': (this.bump () === \'a\') ? \'x\' : \'y\' };\n    }');
        expect (out).not.toMatch (/ternaryStr/);
    });
    test ('negative: a ternary behind a short circuit keeps its lazy evaluation', () => {
        const out = print ('    f (o: Dict, a: boolean, b: boolean) {\n        const r = a && this.extend (o, { \'t\': b ? \'x\' : \'y\' });\n        return r;\n    }');
        expect (out).not.toMatch (/ternaryStr/);
    });
    test ('negative: a declaration whose initialiser is the ternary itself is left to the declaration rules', () => {
        const out = print ('    f (b: boolean) {\n        const s = b ? \'x\' : \'y\';\n        return s;\n    }');
        expect (out).not.toMatch (/ternaryStr/);
    });
});
describe ('h26g23 assignments', () => {
    test ('negative: a ternary assigned to a nullable string local is not hoisted', () => {
        const out = print ('    f (o: Dict, b: boolean) {\n        let side: Str = undefined;\n        side = b ? \'buy\' : \'sell\';\n        return side;\n    }');
        expect (out).not.toMatch (/ternaryStr/);
    });
});
