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
    const dir = fs.mkdtempSync (path.join (process.env.TMPDIR ?? os.tmpdir (), 'h27g31-'));
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

describe ('h27g31 ternary stored into an any box prints if/else', () => {
    test ('a request map element with a literal and a *string arm', () => {
        const out = print ('    f (o: Dict) {\n        const request: Dict = {};\n        const marginMode = this.safeString (o, \'m\');\n        request[\'margin_mode\'] = (marginMode === undefined) ? \'cross\' : marginMode;\n        return request;\n    }');
        expect (out).not.toContain ('func() any {');
        expect (out).toMatch (/if marginMode == nil \{\n\s*request\["margin_mode"\] = "cross"\n\s*\} else \{\n\s*request\["margin_mode"\] = marginMode\n\s*\}/);
    });
    test ('an any local with a nil arm keeps the untyped nil', () => {
        const out = print ('    f (o: Dict, u: boolean) {\n        let maxQ = undefined;\n        maxQ = u ? undefined : this.parseNumber (o[\'x\']);\n        this.sink (maxQ);\n        if (maxQ === undefined) {\n            return 1;\n        }\n        return maxQ;\n    }');
        expect (out).not.toContain ('func() any {');
        expect (out).toMatch (/if EvalTruthy\(u\) \{\n\s*maxQ = nil\n\s*\} else \{\n\s*maxQ = this\.ParseNumber/);
    });
    test ('a false arm that is the target itself prints one branch', () => {
        const out = print ('    f (o: Dict, sub: Dict) {\n        let action = \'subscribe\';\n        if (sub !== undefined) {\n            const u = this.safeString (sub, \'u\');\n            action = (u === \'y\') ? \'unsubscribe\' : action;\n        }\n        return { \'a\': action };\n    }');
        expect (out).not.toContain ('func() any {');
        expect (out).not.toMatch (/action = action/);
    });
    test ('negative: a property write keeps the literal', () => {
        const out = print ('    v: any = undefined;\n    f (o: Dict, u: boolean) {\n        this.v = u ? undefined : this.safeString (o, \'a\');\n    }');
        expect (out).toContain ('func() any {');
    });
    test ('negative: a computed non-string key keeps the literal', () => {
        const out = print ('    f (o: Dict, k: any, u: boolean) {\n        const request: Dict = {};\n        request[k] = u ? 1 : this.safeString (o, \'a\');\n        return request;\n    }');
        expect (out).toContain ('func() any {');
    });
});
