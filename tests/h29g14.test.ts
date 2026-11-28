import { Transpiler } from '../src/transpiler';

// `rows[i][k]` on a `[][]any` row-list parameter inside `for (i < rows.length)`: the row read is the plain index
const config = (go: any) => ({ 'verbose': false, 'go': Object.assign({ 'parser': { 'NUM_LINES_END_FILE': 0 } }, go) });
const go = (ts: string, extra: any = {}) => new Transpiler(config(extra)).transpileGo(ts).content;
const TABLE = { 'unifiedSliceParams': { 'conv': { 0: '[][]any' } } };
const HEAD = 'class Exchange {\n    parseToInt (x: any): number { return x; }\n';
const conv = (loop: string, read: string) => HEAD + '    conv (rows: number[][], ms = false): any[] {\n        const out = [];\n'
    + '        ' + loop + ' {\n            const t = ms ? 1 : this.parseToInt (' + read + ' / 1000);\n            out.push (t);\n        }\n        return out;\n    }\n}\n';
const LOOP = 'for (let i = 0; i < rows.length; i++)';

describe('h29g14 bounded row-list cell read', () => {
    test('rows[i][0] in a loop over rows.length reads the row natively (fails on the base printer)', () => {
        const out = go(conv(LOOP, 'rows[i][0]'), TABLE);
        expect(out).toContain('GetValue(rows[i], 0)');
        expect(out).not.toContain('GetValue(GetValue(rows, i), 0)');
    });
    test('without the table row the parameter stays boxed and the read keeps both helpers', () => {
        const out = go(conv(LOOP, 'rows[i][0]'));
        expect(out).toContain('GetValue(GetValue(rows, i), 0)');
    });
    test('a loop bounded by something other than rows.length keeps the helper row read', () => {
        const out = go(conv('for (let i = 0; i < 5; i++)', 'rows[i][0]'), TABLE);
        expect(out).not.toContain('rows[i], 0)');
        expect(out).toContain('GetValue(GetValue(rows, i), 0)');
    });
    test('an index that is not the loop counter keeps the helper row read', () => {
        const out = go(conv(LOOP, 'rows[i + 1][0]'), TABLE);
        expect(out).not.toMatch(/rows\[i \+ 1\], 0\)/);
    });
    test('a cell write keeps its own printer path', () => {
        const ts = HEAD + '    conv (rows: number[][], ms = false): any[] {\n        for (let i = 0; i < rows.length; i++) {\n            rows[i][0] = 1;\n        }\n        return rows;\n    }\n}\n';
        expect(go(ts, TABLE)).not.toContain('GetValue(rows[i], 0)');
    });
});
