import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler } from '../src/transpiler';

describe ('h27a16: comma-ok list read of list-only map slots', () => {
    const HEAD = 'type Dict = { [key: string]: any };\ntype Str = string | undefined;\nclass Exchange {\n'
        + '    safeList (o: any, k: any, d: any = undefined): any[] { return o; }\n'
        + '    safeString (o: any, k: any, d: Str = undefined): Str { return o; }\n'
        + '    note (h: any) { return h; }\n}\nexport default Exchange;\n';
    const print = (body: string): string => {
        const dir = fs.mkdtempSync (path.join (process.env.TMPDIR ?? os.tmpdir (), 'h27a16-'));
        try {
            fs.mkdirSync (path.join (dir, 'ts', 'src', 'base'), { 'recursive': true });
            const file = path.join (dir, 'ts', 'src', 'x.ts');
            fs.writeFileSync (path.join (dir, 'ts', 'src', 'base', 'Exchange.ts'), HEAD);
            fs.writeFileSync (file, 'import Exchange from \'./base/Exchange.js\';\nclass x extends Exchange {\n' + body + '}\n');
            const config: any = { 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 } } };
            return new Transpiler (config).transpileGoByPath (file).content;
        } finally {
            fs.rmSync (dir, { 'recursive': true, 'force': true });
        }
    };
    const LOOP = '    f (rows: Dict[]) {\n        const byCode: Dict = {};\n        for (let i = 0; i < rows.length; i++) {\n'
        + '            const code = this.safeString (rows[i], \'c\');\n            if (code !== undefined) {\n'
        + '                if (!(code in byCode)) {\n                    byCode[code] = [];\n                }\n';
    test ('a slot alias pushed through is a comma-ok []any read with a native append and store-back', () => {
        const out = print (LOOP + '                const bucket = byCode[code];\n                bucket.push (rows[i]);\n            }\n        }\n        return byCode;\n    }\n');
        expect (out).toContain ('var bucket, _ = byCode[*code].([]any)');
        expect (out).toMatch (/bucket = append\(bucket, [^\n]*\)\n\s*byCode\[\*code\] = bucket/);
        expect (out).not.toContain ('AppendToArray');
    });
    test ('a bare slot push is a comma-ok read, append and store-back', () => {
        const out = print (LOOP + '                byCode[code].push (rows[i]);\n            }\n        }\n        return byCode;\n    }\n');
        expect (out).toMatch (/var (retRes\d+), _ = byCode\[\*code\]\.\(\[\]any\)\n\s*\1 = append\(\1, [^\n]*\)\n\s*byCode\[\*code\] = \1/);
        expect (out).not.toContain ('AppendToArray');
    });
    test ('negative: a slot written with a non-list value keeps the helper', () => {
        const out = print (LOOP + '                byCode[\'x\'] = 1;\n                const bucket = byCode[code];\n                bucket.push (rows[i]);\n            }\n        }\n        return byCode;\n    }\n');
        expect (out).toContain ('AppendToArray(&bucket');
        expect (out).not.toContain ('.([]any)');
    });
    test ('negative: an alias that is nil-tested keeps the box', () => {
        const out = print (LOOP + '                const bucket = byCode[code];\n                if (bucket === undefined) {\n                    continue;\n                }\n                bucket.push (rows[i]);\n            }\n        }\n        return byCode;\n    }\n');
        expect (out).not.toContain ('.([]any)');
    });
    test ('negative: a map parameter (not born empty here) keeps the helper', () => {
        const out = print ('    f (byCode: Dict, code: string, v: any) {\n        byCode[code] = [];\n        const bucket = byCode[code];\n        bucket.push (v);\n        return byCode;\n    }\n');
        expect (out).not.toContain ('.([]any)');
    });
});
