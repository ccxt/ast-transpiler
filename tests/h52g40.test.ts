import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler } from '../src/transpiler';

describe ('h52g40: a push/store-back slot alias of a list-valued local map', () => {
    const HEAD = 'type Dict = { [key: string]: any };\ntype Str = string | undefined;\nclass Exchange {\n'
        + '    safeList (o: any, k: any, d: any = undefined): any[] { return o; }\n'
        + '    safeString (o: any, k: any, d: Str = undefined): Str { return o; }\n'
        + '    note (h: any) { return h; }\n}\nexport default Exchange;\n';
    const print = (body: string): string => {
        const dir = fs.mkdtempSync (path.join (process.env.TMPDIR ?? os.tmpdir (), 'h52g40-'));
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
    const src = (extra: string, mapExtra: string = ''): string => '    f (rows: Dict[]) {\n        const by: Dict = {};\n' + mapExtra + '        for (let i = 0; i < rows.length; i++) {\n            const t = this.safeString (rows[i], \'t\', \'\');\n            if (!(t in by)) {\n                by[t] = [];\n            }\n            const grouped = by[t];\n            grouped.push (rows[i]);\n            by[t] = grouped;\n' + extra + '        }\n        for (let i = 0; i < rows.length; i++) {\n            const grouped = by[\'x\'] as any[];\n            for (let j = 0; j < grouped.length; j++) {\n                this.note (grouped[j]);\n            }\n        }\n        return by;\n    }\n';
    test ('the slot alias appends natively on its comma-ok slot read', () => {
        const out = print (src (''));
        expect (out).toContain ('var grouped, _ = by[t].([]any)\n\t\tif grouped == nil {\n\t\t\tgrouped = []any{}\n\t\t}');
        expect (out).toContain ('grouped = append(grouped, ');
        expect (out).not.toContain ('AppendToArray');
        expect (out).not.toContain ('SafeListSlice');
    });
    test ('negative: the alias handed to another call keeps the box', () => {
        expect (print (src ('            this.note (grouped);\n'))).toContain ('AppendToArray(&grouped, ');
    });
    test ('negative: a nil test on the alias keeps the box', () => {
        expect (print (src ('            if (grouped === undefined) {\n                continue;\n            }\n'))).toContain ('AppendToArray(&grouped, ');
    });
    test ('negative: a map slot written with a non-list value keeps the box', () => {
        const out = print (src ('', '        by[\'z\'] = 1;\n'));
        expect (out).toContain ('AppendToArray(&grouped, ');
        expect (out).not.toContain ('SafeListSlice');
    });
    test ('negative: a map handed to a call keeps the box', () => {
        expect (print (src ('', '        this.note (by);\n'))).toContain ('AppendToArray(&grouped, ');
    });
});
