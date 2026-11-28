import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler, installCcxtGoDictParams, installCcxtGoLocalTypes } from '../src/transpiler';

// h49g14 // a `{}`-defaulted safeDict row of a typed list read by an int64 local index (not the loop counter)
// prints the bounds-tested comma-ok read with the `{}` fallback at a map parameter; other keys keep the wrap.
describe ('h49g14: safeDict row by an int64 local index', () => {
    const print = (body: string): string => {
        const root = fs.mkdtempSync (path.join (os.tmpdir (), 'h49g14-'));
        const dir = path.join (root, 'ts', 'src');
        fs.mkdirSync (path.join (dir, 'base'), { recursive: true });
        fs.writeFileSync (path.join (dir, 'base', 'Exchange.ts'),
            'type Dict = { [key: string]: any };\n' +
            'export class Exchange {\n' +
            '    safeDict (d: any, k: any, v: any = undefined): any {\n' +
            '        return v;\n' +
            '    }\n' +
            '    parseToInt (n: any): number {\n' +
            '        return n;\n' +
            '    }\n' +
            '    parseTicker (ticker: Dict, market: any = undefined) {\n' +
            "        return ticker['a'];\n" +
            '    }\n' +
            '    run (data: any, xs: any[], market: any) {\n' + body + '    }\n' +
            '}\n');
        try {
            const t = new Transpiler ({ verbose: false });
            installCcxtGoLocalTypes (t.goTranspiler);
            installCcxtGoDictParams (t.goTranspiler);
            return t.transpileGoByPath (path.join (dir, 'base', 'Exchange.ts')).content;
        } finally {
            fs.rmSync (root, { recursive: true, force: true });
        }
    };
    const loop = (key: string, decl: string) =>
        '        const rows: Dict[] = [];\n' +
        '        const n = rows.length;\n' +
        '        const r = [];\n' +
        '        for (let i = 0; i < n; i++) {\n' +
        `            ${decl}\n` +
        `            const p = this.parseTicker (this.safeDict (rows, ${key}, {}), market);\n` +
        '            r.push (p);\n' +
        '        }\n' +
        '        return r;\n';
    test ('an int64 local index prints the bounds-tested comma-ok read and no SafeDictMap', () => {
        const out = print (loop ('j', 'const j = this.parseToInt (n - 1 - i);'));
        expect (out).toMatch (/var (rowsDict\d+) map\[string\]any\n\s*if j >= 0 && j < int64\(len\(rows\)\) \{\n\s*\1, _ = rows\[j\]\.\(map\[string\]any\)\n\s*\}\n\s*if \1 == nil \{\n\s*\1 = map\[string\]any\{\}\n\s*\}/);
        expect (out).not.toContain ('SafeDictMap(rows');
    });
    test ('negative: an untyped (any) index keeps the wrap', () => {
        const out = print (loop ('j', 'const j = xs[i];'));
        expect (out).not.toMatch (/rowsDict\d+, _ = rows\[j\]/);
    });
    test ('negative: no default (may be nil) keeps the boxed parameter', () => {
        const out = print ('        const rows: Dict[] = [];\n        const j = this.parseToInt (rows.length - 1);\n        return this.parseTicker (this.safeDict (rows, j), market);\n');
        expect (out).not.toMatch (/rowsDict\d+, _ = rows\[j\]/);
    });
});
