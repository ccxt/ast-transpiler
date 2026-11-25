import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

// guarded statement reads of a fixed-width row accumulator: `const v = xs[r][c]` and `const row = this.safeList (xs, r)`
describe('h28g16 row accumulator reads', () => {
    const HEAD = 'type Num = number | undefined;\ntype Row = [Num, Num, Num];\nclass Exchange {\n'
        + '    safeValue (d: any, k: any, def: any = undefined): any { return d; }\n'
        + '    safeList (d: any, k: any, def: any = undefined): any[] | undefined { return d; }\n'
        + '    sum (...args: any[]): any { return args[0]; }\n';
    const print = (body: string): string => {
        const t: any = new Transpiler ({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 } } });
        installCcxtGoHooks (t.goTranspiler);
        return t.transpileGo (HEAD + '    build (price: any, n: number, ms: number): Row[] {\n' + body + '\n    }\n}\n').content;
    };
    const BODY = 'const rows: Row[] = [];\nconst iTs = 0;\nconst iHigh = 1;\nconst iCount = 2;\n'
        + 'for (let i = 0; i < n; i++) {\n    const t = Math.floor (i / ms) * ms;\n    const len = rows.length;\n    const r = len - 1;\n'
        + '    if (r < 0) {\n        rows.push ([ t, price, 1 ]);\n    } else {\n        const cts = rows[r][iTs];\n'
        + '        if (cts === undefined) {\n            continue;\n        }\n        const prev = this.safeList (rows, r);\n'
        + '        rows[r][iHigh] = Math.max (this.safeValue (prev, iHigh), price);\n        rows[r][iCount] = this.sum (this.safeValue (prev, iCount), 1);\n    }\n}\nreturn rows;';

    test('the timestamp cell and the row read print a guarded plain index (fails on the base printer)', () => {
        const out = print (BODY);
        expect (out).toMatch (/var cts any\n\s+if r >= 0 && r < int64\(len\(rows\)\) \{\n\s+cts = rows\[r\]\[iTs\]\n\s+\}/);
        expect (out).toMatch (/var prev \[\]any\n\s+if r >= 0 && r < int64\(len\(rows\)\) \{\n\s+prev = rows\[r\]\n\s+\}/);
        expect (out).not.toContain ('GetValue(GetValue(rows, r), iTs)');
        expect (out).toContain ('if cts == nil {');
        expect (out).not.toContain ('SafeListTyped(rows, r)');
    });
    test('a column whose pushed value is an any box (it may hold a pointer GetValue derefs) keeps the helper', () => {
        const out = print (BODY.replace ('const cts = rows[r][iTs];', 'const cts = rows[r][iHigh];'));
        expect (out).not.toMatch (/cts = rows\[r\]\[iHigh\]/);
    });
    test('a column past the row width is not read natively', () => {
        const out = print (BODY.replace ('const iTs = 0;', 'const iTs = 3;'));
        expect (out).not.toMatch (/cts = rows\[r\]\[iTs\]/);
    });
    test('an any-typed index keeps the helper read', () => {
        const out = print (BODY.replace ('const r = len - 1;', 'const r: any = this.safeValue (rows, len);'));
        expect (out).not.toMatch (/cts = rows\[r\]/);
        expect (out).not.toMatch (/prev = rows\[r\]\n/);
    });
    test('a row replacement (not an accumulator) keeps the helper reads', () => {
        const out = print (BODY.replace ('return rows;', 'rows[0] = [ 1, 2, 3 ];\nreturn rows;'));
        expect (out).not.toMatch (/cts = rows\[r\]/);
        expect (out).not.toMatch (/prev = rows\[r\]\n/);
    });
});
