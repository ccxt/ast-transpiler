import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler } from '../src/transpiler';

describe ('h29g02: a *string nil-init local stored into a local map-literal slot prints a guarded value store', () => {
    const HEAD = 'type Dict = { [key: string]: any };\ntype Str = string | undefined;\nclass Exchange {\n'
        + '    safeString (o: any, k: any, d: Str = undefined): Str { return d; }\n'
        + '    note (h: any) { return h; }\n}\nexport default Exchange;\n';
    const print = (body: string): string => {
        const dir = fs.mkdtempSync (path.join (os.tmpdir (), 'h29g02-'));
        try {
            fs.mkdirSync (path.join (dir, 'ts', 'src', 'base'), { 'recursive': true });
            const file = path.join (dir, 'ts', 'src', 'x.ts');
            fs.writeFileSync (path.join (dir, 'ts', 'src', 'base', 'Exchange.ts'), HEAD);
            fs.writeFileSync (file, 'import Exchange from \'./base/Exchange.js\';\nclass x extends Exchange {\n'
                + '    m (o: Dict, c: boolean) {\n' + body + '    }\n}\n');
            const config: any = { 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 } } };
            return new Transpiler (config).transpileGoByPath (file).content;
        } finally {
            fs.rmSync (dir, { 'recursive': true, 'force': true });
        }
    };
    const seed = '        let s: Str = undefined;\n        if (c) {\n            s = this.safeString (o, \'s\');\n        }\n';

    test ('positive: the slot prints nil and `if s != nil { r["k"] = *s }` follows', () => {
        const out = print (seed + '        const r: Dict = { \'k\': s, \'n\': 1 };\n        return this.note (r);\n');
        expect (out).toContain ('var s *string = nil');
        expect (out).toMatch (/"k": +nil,/);
        expect (out).toMatch (/\n\t+if s != nil \{\n\t+r\["k"\] = \*s\n\t+\}/);
    });

    test ('negative: a non-*string write keeps the box', () => {
        const out = print ('        let s: Str = undefined;\n        if (c) {\n            s = this.note (o);\n        }\n'
            + '        const r: Dict = { \'k\': s };\n        return this.note (r);\n');
        expect (out).not.toContain ('var s *string');
        expect (out).not.toContain ('= *s');
    });

    test ('negative: a literal handed to a call (no local map) prints no guarded store', () => {
        const out = print (seed + '        return this.note ({ \'k\': s });\n');
        expect (out).not.toContain ('= *s');
        expect (out).not.toContain ('if s != nil');
    });

    test ('negative: a nested literal slot (not the local map itself) prints no guarded store', () => {
        const out = print (seed + '        const r: Dict = { \'a\': { \'k\': s } };\n        return this.note (r);\n');
        expect (out).not.toContain ('= *s');
        expect (out).not.toContain ('if s != nil');
    });
});
