import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

// a fixed-width row accumulator `const xs: Row[] = []` prints `[][]any` with native guarded `xs[r][c] = v` writes
describe('go fixed-width row accumulator', () => {
    const HEAD = 'type Num = number | undefined;\ntype Row = [Num, Num, Num];\nclass Exchange {\n'
        + '    safeValue (d: any, k: any, def: any = undefined): any { return d; }\n'
        + '    safeList (d: any, k: any, def: any = undefined): any[] | undefined { return d; }\n'
        + '    sum (...args: any[]): any { return args[0]; }\n';
    const print = (body: string): string => {
        const t: any = new Transpiler ({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 } } });
        installCcxtGoHooks (t.goTranspiler);
        return t.transpileGo (HEAD + '    build (price: any, n: number): Row[] {\n' + body + '\n    }\n}\n').content;
    };
    const BODY = 'const rows: Row[] = [];\nconst iHigh = 1;\nconst iCount = 2;\n'
        + 'for (let i = 0; i < n; i++) {\n    const len = rows.length;\n    const r = len - 1;\n'
        + '    if (r < 0) {\n        rows.push ([ i, price, 1 ]);\n    } else {\n        const prev = this.safeList (rows, r);\n'
        + '        rows[r][iHigh] = Math.max (this.safeValue (prev, iHigh), price);\n        rows[r][iCount] = this.sum (this.safeValue (prev, iCount), 1);\n        rows[r][0] = price;\n    }\n}\nreturn rows;';

    test('the accumulator is [][]any and column writes are native (fails on the base printer)', () => {
        const out = print (BODY);
        expect (out).toContain ('var rows [][]any = [][]any{}');
        expect (out).toContain ('rows = append(rows, []any{i, price, 1})');
        expect (out).toMatch (/if r >= 0 && r < int64\(len\(rows\)\) \{\n\s+rows\[r\]\[iHigh\] = mathMax\(/);
        expect (out).toContain ('rows[r][iCount] = this.Sum(');
        expect (out).not.toContain ('AddElementToObject(GetValue(rows, r), iHigh');
        expect (out).not.toContain ('AddElementToObject(GetValue(rows, r), iCount');
    });
    test('an any-boxed value (it may hold a pointer the helper derefs) keeps the helper write', () => {
        expect (print (BODY)).toContain ('AddElementToObject(GetValue(rows, r), 0, price)');
    });
    test('a row replacement keeps the box and the helper', () => {
        const out = print (BODY.replace ('return rows;', 'rows[0] = [ 1, 2, 3 ];\nreturn rows;'));
        expect (out).not.toContain ('[][]any');
        expect (out).toContain ('AddElementToObject(GetValue(rows, r), iHigh,');
    });
    test('a column past the row width keeps the box', () => {
        const out = print (BODY.replace ('const iCount = 2;', 'const iCount = 3;'));
        expect (out).not.toContain ('[][]any');
        expect (out).toContain ('AddElementToObject(');
    });
    test('a pushed row of another width keeps the box', () => {
        const out = print (BODY.replace ('[ i, price, 1 ]', '[ i, price ]'));
        expect (out).not.toContain ('[][]any');
    });
    test('a row whose nil-ness a consumer tests (bare row read) keeps the box', () => {
        const out = print (BODY.replace ('return rows;', 'if (rows[0] === undefined) {\n    return [];\n}\nreturn rows;'));
        expect (out).not.toContain ('[][]any');
    });
});
