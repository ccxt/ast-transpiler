import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler } from '../src/transpiler';

describe ('h27g02: safeString with a Go-string identifier default is a non-nil string', () => {
    const HEAD = 'type Dict = { [key: string]: any };\ntype Str = string | undefined;\nclass Exchange {\n'
        + '    safeString (o: any, k: any, d: Str = undefined): Str { return d; }\n'
        + '    safeString2 (o: any, k: any, k2: any, d: Str = undefined): Str { return d; }\n'
        + '    note (h: any) { return h; }\n}\nexport default Exchange;\n';
    const print = (body: string): string => {
        const dir = fs.mkdtempSync (path.join (os.tmpdir (), 'h27g02-'));
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

    test ('positive: string local default, concat is native', () => {
        const out = print ('        let c = \'candle\';\n        const tf = \'1m\';\n        const interval = this.safeString (o, tf, tf);\n        c = c + interval;\n        return this.note (c);\n');
        expect (out).not.toContain ('Add(');
        expect (out).toMatch (/c = c \+ \*?interval/);
    });

    test ('positive: string parameter default, compare is native', () => {
        const out = print ('        const v = this.safeString (o, k, k);\n        if (v === \'x\') {\n            return 1;\n        }\n        return this.note (v);\n');
        expect (out).not.toContain ('IsEqual(');
    });

    test ('negative: nilable Str default keeps the helper', () => {
        const out = print ('        let d: Str = undefined;\n        if (k === \'a\') {\n            d = k;\n        }\n        const v = this.safeString (o, \'x\', d);\n        const c = \'p\' + v;\n        return this.note (c);\n');
        expect (out).toContain ('Add(');
    });

    test ('negative: no default keeps the helper and the nil test', () => {
        const out = print ('        const v = this.safeString (o, k);\n        if (v === undefined) {\n            return 1;\n        }\n        const c = \'p\' + v;\n        return this.note (c);\n');
        expect (out).not.toContain ('*this.SafeString(o, k)');
    });

    test ('negative: any-typed default keeps the helper', () => {
        const out = print ('        const d: any = this.note (k);\n        const v = this.safeString (o, \'x\', d);\n        const c = \'p\' + v;\n        return this.note (c);\n');
        expect (out).toContain ('Add(');
    });
});
