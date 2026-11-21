import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler } from '../src/transpiler';

describe ('h30g02: a *string nil-init local in a returned or argument literal prints a guarded value store', () => {
    const HEAD = 'type Dict = { [key: string]: any };\ntype Str = string | undefined;\nclass Exchange {\n'
        + '    safeString (o: any, k: any, d: Str = undefined): Str { return d; }\n'
        + '    note (h: any) { return h; }\n}\nexport default Exchange;\n';
    const print = (body: string): string => {
        const dir = fs.mkdtempSync (path.join (os.tmpdir (), 'h30g02-'));
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

    test ('positive: a literal handed to a call is hoisted, slot nil plus guarded store', () => {
        const out = print (seed + '        return this.note ({ \'k\': s, \'n\': 1 });\n');
        expect (out).toContain ('var s *string = nil');
        expect (out).toMatch (/var literal\d+ map\[string\]any = map\[string\]any\{[^}]*"k": +nil,/);
        expect (out).toMatch (/if s != nil \{\n\t+literal\d+\["k"\] = \*s\n\t+\}\n\t+return this.Note\(literal\d+\)/);
    });

    test ('positive: a returned literal is hoisted', () => {
        const out = print (seed + '        return { \'k\': s };\n');
        expect (out).toContain ('var s *string = nil');
        expect (out).toMatch (/if s != nil \{\n\t+literal\d+\["k"\] = \*s\n\t+\}\n\t+return literal\d+/);
    });

    test ('positive: a Go keyword local is stored under its printed name', () => {
        const out = print ('        let type: Str = undefined;\n        if (c) {\n            type = this.safeString (o, \'t\');\n        }\n'
            + '        return this.note ({ \'type\': type });\n');
        expect (out).not.toMatch (/if type != nil/);
        expect (out).toMatch (/literal\d+\["type"\] = \*\w+/);
    });

    test ('negative: a non-*string write keeps the box', () => {
        const out = print ('        let s: Str = undefined;\n        if (c) {\n            s = this.note (o);\n        }\n'
            + '        return this.note ({ \'k\': s });\n');
        expect (out).not.toContain ('var s *string');
        expect (out).not.toContain ('= *s');
    });

    test ('negative: a sibling argument that is a call keeps the box (order)', () => {
        const out = print (seed + '        return this.note ({ \'k\': s }, this.note (o));\n');
        expect (out).not.toContain ('= *s');
    });

    test ('negative: a nested literal slot prints no guarded store', () => {
        const out = print (seed + '        return this.note ({ \'a\': { \'k\': s } });\n');
        expect (out).not.toContain ('= *s');
    });
});
