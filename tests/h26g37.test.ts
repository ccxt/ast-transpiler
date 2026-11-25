import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler } from '../src/transpiler';

describe ('h26g37: a string local rewritten by a self/literal-defaulted safeString stays a Go string', () => {
    const HEAD = 'type Dict = { [key: string]: any };\ntype Str = string | undefined;\nclass Exchange {\n'
        + '    safeString (o: any, k: any, d: Str = undefined): Str { return d; }\n'
        + '    safeString2 (o: any, k: any, k2: any, d: Str = undefined): Str { return d; }\n'
        + '    note (h: any) { return h; }\n}\nexport default Exchange;\n';
    const print = (body: string): string => {
        const dir = fs.mkdtempSync (path.join (os.tmpdir (), 'h26g37-'));
        try {
            fs.mkdirSync (path.join (dir, 'ts', 'src', 'base'), { 'recursive': true });
            const file = path.join (dir, 'ts', 'src', 'x.ts');
            fs.writeFileSync (path.join (dir, 'ts', 'src', 'base', 'Exchange.ts'), HEAD);
            fs.writeFileSync (file, 'import Exchange from \'./base/Exchange.js\';\nclass x extends Exchange {\n'
                + '    m (o: Dict, k: string) {\n' + body + '    }\n}\n');
            const config: any = { 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 } } };
            return new Transpiler (config).transpileGoByPath (file).content;
        } finally {
            fs.rmSync (dir, { 'recursive': true, 'force': true });
        }
    };

    test ('positive: self default keeps `string` and the write derefs', () => {
        const out = print ('        let t = \'spot\';\n        t = this.safeString (o, \'type\', t);\n        return this.note (t);\n');
        expect (out).toContain ('var t string = "spot"');
        expect (out).toContain ('t = *this.SafeString(o, "type", t)');
        expect (out).not.toContain ('DerefScalar');
    });

    test ('positive: safeString2 with the local as default', () => {
        const out = print ('        let t = \'a\';\n        t = this.safeString2 (o, \'x\', \'y\', t);\n        return this.note (t);\n');
        expect (out).toContain ('var t string = "a"');
        expect (out).toContain ('t = *this.SafeString2(o, "x", "y", t)');
    });

    test ('negative: no default (may be nil) keeps the box', () => {
        const out = print ('        let t = \'spot\';\n        t = this.safeString (o, \'type\');\n        if (t === undefined) {\n            return 1;\n        }\n        return this.note (t);\n');
        expect (out).not.toContain ('var t string');
        expect (out).not.toContain ('*this.SafeString(o, "type")');
    });

    test ('negative: default is another nilable local keeps the box', () => {
        const out = print ('        let d: Str = undefined;\n        let t = \'spot\';\n        t = this.safeString (o, \'type\', d);\n        return this.note (t);\n');
        expect (out).not.toContain ('var t string');
    });

    test ('negative: a write of another type keeps the box', () => {
        const out = print ('        let t: any = \'spot\';\n        t = this.safeString (o, \'type\', t);\n        t = 3;\n        return this.note (t);\n');
        expect (out).not.toContain ('var t string');
    });

    test ('negative: a non-base safeString (any return) keeps the box', () => {
        const out = new Transpiler ({ 'verbose': false }).transpileGo ('class T {\n    safeString (o, k, d) { return d; }\n'
            + '    f (o) {\n        let t = \'a\';\n        t = this.safeString (o, \'k\', t);\n        return t;\n    }\n}\n').content;
        expect (out).not.toContain ('var t string');
        expect (out).not.toContain ('*this.SafeString');
    });

    test ('negative: a nil-seeded Str local keeps the pointer', () => {
        const out = print ('        let t: Str = undefined;\n        if (k === \'a\') {\n            t = this.safeString (o, \'type\', \'FOK\');\n        }\n        t = \'GTX\';\n        return this.note (t);\n');
        expect (out).not.toContain ('var t string');
    });
});
