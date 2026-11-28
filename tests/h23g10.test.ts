import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler, installCcxtGoLocalTypes } from '../src/transpiler';

const HEAD = 'class Exchange {\n'
    + '    safeInteger (o: any, k: any, d: Int = undefined): Int { return d; }\n'
    + '    safeNumber (o: any, k: any, d: Num = undefined): Num { return d; }\n'
    + '    sum (a: any, b: any): any { return a; }\n'
    + '}\nexport default Exchange;\n';
const print = (body: string): string => {
    const dir = fs.mkdtempSync (path.join (os.tmpdir (), 'h23g10-'));
    try {
        fs.mkdirSync (path.join (dir, 'ts', 'src', 'base'), { 'recursive': true });
        const file = path.join (dir, 'ts', 'src', 'x.ts');
        const types = 'type Int = number | undefined;\ntype Num = number | undefined;\ntype Dict = { [key: string]: any };\n';
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

describe ('h23g10: IsEqual of an *int64 local against an int64 sum', () => {
    test ('a guarded `nonce !== previous + 1` prints the nil-guarded native compare', () => {
        const out = print ('    f (m: Dict, o: Dict) {\n'
            + '        const nonce = this.safeInteger (m, \'seq\');\n'
            + '        const previous = this.safeInteger (o, \'nonce\');\n'
            + '        if ((previous !== undefined) && (nonce !== previous + 1)) {\n'
            + '            return true;\n'
            + '        }\n'
            + '        return false;\n'
            + '    }');
        expect (out).not.toContain ('IsEqual(nonce');
        expect (out).toContain ('(nonce == nil || *nonce != *previous + 1)');
    });
    test ('the mirrored order `(u - 1) === nonce` is native and keeps the nil answer', () => {
        const out = print ('    f (m: Dict, o: Dict) {\n'
            + '        const nonce = this.safeInteger (o, \'nonce\');\n'
            + '        const u = this.safeInteger (m, \'U\');\n'
            + '        if (u === undefined) {\n'
            + '            return false;\n'
            + '        }\n'
            + '        const c = ((u - 1) === nonce);\n'
            + '        return c;\n'
            + '    }');
        expect (out).not.toContain ('IsEqual(');
        expect (out).toContain ('(nonce != nil && *nonce == (*u - 1))');
    });
    test ('a float sum against an *int64 keeps IsEqual (int vs float answer)', () => {
        const out = print ('    f (m: Dict, o: Dict) {\n'
            + '        const nonce = this.safeInteger (m, \'seq\');\n'
            + '        const p = this.safeNumber (o, \'nonce\');\n'
            + '        if ((p !== undefined) && (nonce !== p + 1)) {\n'
            + '            return true;\n'
            + '        }\n'
            + '        return false;\n'
            + '    }');
        expect (out).toContain ('IsEqual(nonce');
    });
    test ('a boxed `any` sum keeps IsEqual', () => {
        const out = print ('    f (m: Dict, o: Dict) {\n'
            + '        const nonce = this.safeInteger (m, \'seq\');\n'
            + '        const stored = o[\'nonce\'];\n'
            + '        if (nonce !== this.sum (stored, 1)) {\n'
            + '            return true;\n'
            + '        }\n'
            + '        return false;\n'
            + '    }');
        expect (out).toContain ('IsEqual(nonce');
    });
    test ('an unguarded pointer operand in the sum keeps IsEqual (nil answer)', () => {
        const out = print ('    f (m: Dict, o: Dict) {\n'
            + '        const nonce = this.safeInteger (m, \'seq\');\n'
            + '        const previous = this.safeInteger (o, \'nonce\');\n'
            + '        if (nonce !== previous + 1) {\n'
            + '            return true;\n'
            + '        }\n'
            + '        return false;\n'
            + '    }');
        expect (out).not.toContain ('*nonce != *previous+1');
    });
});
