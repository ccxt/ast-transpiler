import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler } from '../src/transpiler';

describe ('h26g51: AppendToArray on safeList push/store-back locals and map-slot aliases', () => {
    const HEAD = 'type Dict = { [key: string]: any };\ntype Str = string | undefined;\nclass Exchange {\n'
        + '    safeList (o: any, k: any, d: any = undefined): any[] { return o; }\n'
        + '    safeString (o: any, k: any, d: Str = undefined): Str { return o; }\n'
        + '    note (h: any) { return h; }\n}\nexport default Exchange;\n';
    const print = (body: string): string => {
        const dir = fs.mkdtempSync (path.join (process.env.TMPDIR ?? os.tmpdir (), 'h26g51-'));
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
    test ('a safeList([]) local pushed and stored back is a []any with a native append', () => {
        const out = print ('    f (order: Dict, trade: Dict) {\n        const ts = this.safeList (order, \'trades\', []);\n'
            + '        ts.push (trade);\n        order[\'trades\'] = ts;\n        return order;\n    }\n');
        expect (out).toContain ('var ts []any = this.SafeListSlice(order, "trades", []any{})');
        expect (out).toContain ('ts = append(ts, trade)');
        expect (out).not.toContain ('AppendToArray');
    });
    test ('negative: a nil test on the local keeps the box', () => {
        const out = print ('    f (order: Dict, trade: Dict) {\n        const ts = this.safeList (order, \'trades\', []);\n'
            + '        ts.push (trade);\n        order[\'trades\'] = ts;\n        if (ts === undefined) {\n            return 1;\n        }\n        return order;\n    }\n');
        expect (out).toContain ('AppendToArray(&ts, trade)');
    });
    test ('negative: the local handed to another call keeps the box', () => {
        const out = print ('    f (order: Dict, trade: Dict) {\n        const ts = this.safeList (order, \'trades\', []);\n'
            + '        ts.push (trade);\n        order[\'trades\'] = ts;\n        return this.note (ts);\n    }\n');
        expect (out).toContain ('AppendToArray(&ts, trade)');
    });
    test ('a push through a local alias of a seeded map slot writes the grown slice back', () => {
        const out = print ('    f (rows: Dict[]) {\n        const byCode: Dict = {};\n        for (let i = 0; i < rows.length; i++) {\n'
            + '            const code = this.safeString (rows[i], \'c\');\n            if (code !== undefined) {\n'
            + '                if (!(code in byCode)) {\n                    byCode[code] = [];\n                }\n'
            + '                const bucket = byCode[code];\n                bucket.push (rows[i]);\n            }\n        }\n        return byCode;\n    }\n');
        expect (out).toMatch (/bucket = append\(bucket, [^\n]*\)\n\s*byCode\[\*code\] = bucket/);
    });
    test ('negative: an alias the source already stores back gets no second store', () => {
        const out = print ('    f (rows: string[]) {\n        const byKey: Dict = {};\n        for (let i = 0; i < rows.length; i++) {\n'
            + '            const key = rows[i];\n            if (!(key in byKey)) {\n                byKey[key] = [];\n            }\n'
            + '            const grouped = byKey[key];\n            grouped.push (i);\n            byKey[key] = grouped;\n        }\n        return byKey;\n    }\n');
        expect (out.split ('= grouped').length).toBe (2);
    });
    test ('negative: an alias of a slot the function never seeds with [] gets no write-back', () => {
        const out = print ('    f (byCode: Dict, code: string, v: any) {\n        const bucket = byCode[code];\n        bucket.push (v);\n        return byCode;\n    }\n');
        expect (out).not.toContain ('byCode[code] = bucket');
    });
});
