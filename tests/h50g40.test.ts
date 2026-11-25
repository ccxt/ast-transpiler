import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler } from '../src/transpiler';

describe ('h50g40: a push/store-back safeList local beside a same-named sibling local', () => {
    const HEAD = 'type Dict = { [key: string]: any };\ntype Str = string | undefined;\nclass Exchange {\n'
        + '    safeList (o: any, k: any, d: any = undefined): any[] { return o; }\n'
        + '    safeString (o: any, k: any, d: Str = undefined): Str { return o; }\n'
        + '    note (h: any) { return h; }\n}\nexport default Exchange;\n';
    const print = (body: string): string => {
        const dir = fs.mkdtempSync (path.join (process.env.TMPDIR ?? os.tmpdir (), 'h50g40-'));
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
    const src = (extra: string): string => '    f (rows: Dict[]) {\n        const by: Dict = {};\n        for (let i = 0; i < rows.length; i++) {\n            const t = this.safeString (rows[i], \'t\');\n            if (t === undefined) {\n                continue;\n            }\n            if (!(t in by)) {\n                by[t] = [];\n            }\n            let grouped = this.safeList (by, t, []);\n            grouped.push (rows[i]);\n            by[t] = grouped;\n            EXTRA\n        }\n        for (let i = 0; i < rows.length; i++) {\n            const grouped = by[\'x\'];\n            for (let j = 0; j < grouped.length; j++) {\n                this.note (grouped[j]);\n            }\n        }\n        return by;\n    }\n'.replace ('EXTRA', extra);
    test ('a sibling block local of the same name does not keep the box', () => {
        const out = print (src (''));
        expect (out).toContain ('var grouped, _ = by[*t].([]any)\n\t\tif grouped == nil {\n\t\t\tgrouped = []any{}\n\t\t}');
        expect (out).not.toContain ('SafeListSlice');
        expect (out).toContain ('grouped = append(grouped, GetValue(rows, i))');
        expect (out).not.toContain ('AppendToArray');
        expect (out).toContain ('var grouped any = by["x"]');
    });
    test ('negative: the local handed to another call keeps the box', () => {
        expect (print (src ('this.note (grouped);'))).toContain ('AppendToArray(&grouped, GetValue(rows, i))');
    });
    test ('negative: a nil test on the local keeps the box', () => {
        expect (print (src ('if (grouped === undefined) {\n                continue;\n            }'))).toContain ('AppendToArray(&grouped, GetValue(rows, i))');
    });
    test ('negative: a rebind of the local keeps the box', () => {
        expect (print (src ('grouped = [];'))).toContain ('AppendToArray(&grouped, GetValue(rows, i))');
    });
    test ('negative: a seed on a map that is not proven list-valued keeps the box (no SafeListSlice move)', () => {
        const out = print (src ('').replace ('const by: Dict = {};', 'const by: Dict = {};\n        by[\'z\'] = 1;'));
        expect (out).toContain ('AppendToArray(&grouped, GetValue(rows, i))');
        expect (out).not.toContain ('SafeListSlice');
    });
    test ('negative: a map handed to a call before the loop keeps the box', () => {
        const out = print (src ('').replace ('const by: Dict = {};', 'const by: Dict = {};\n        this.note (by);'));
        expect (out).toContain ('AppendToArray(&grouped, GetValue(rows, i))');
    });
});
