import { Transpiler } from '../src/transpiler';

const config = (go: any) => ({ 'verbose': false, 'go': Object.assign({ 'parser': { 'NUM_LINES_END_FILE': 0 } }, go) });
const go = (ts: string, extra: any = {}) => new Transpiler(config(extra)).transpileGo(ts).content;
const TABLE = { 'unifiedSliceParams': { 'convertRows': { 0: '[][]any' } } };
const SRC = 'class Exchange {\n    convertRows (rows: number[][], key = \'t\'): any[] {\n        const out = [];\n' +
    '        for (let i = 0; i < rows.length; i++) {\n            const row = rows[i] as any[];\n            out.push (row[1]);\n        }\n        return out;\n    }\n}\n';

describe('h27g22 number[][] row-list table slot', () => {
    test('a [][]any slot types a number[][] parameter and reads rows natively', () => {
        const out = go(SRC, TABLE);
        expect(out).toContain('ConvertRows(rows [][]any');
        expect(out).toContain('i < len(rows)');
        expect(out).toContain('GetValue(rows[i], 1)');
        expect(out).not.toContain('GetArrayLength(rows)');
    });
    test('without the table row the parameter stays boxed', () => {
        const out = go(SRC);
        expect(out).not.toContain('rows [][]any');
        expect(out).toContain('GetArrayLength(rows)');
    });
    test('a number[] parameter at a [][]any slot is not typed', () => {
        const ts = 'class Exchange {\n    convertRows (rows: number[]): number {\n        return rows.length;\n    }\n}\n';
        expect(go(ts, TABLE)).not.toContain('rows [][]any');
    });
    test('an optional number[][] parameter is not typed', () => {
        const ts = 'class Exchange {\n    convertRows (rows: number[][] = undefined): number {\n        return rows.length;\n    }\n}\n';
        expect(go(ts, TABLE)).not.toContain('rows [][]any');
    });
    test('a parameter written with something other than a row list fails loudly', () => {
        const ts = 'class Exchange {\n    convertRows (rows: number[][]): any {\n        rows = undefined;\n        return rows;\n    }\n}\n';
        expect(() => go(ts, TABLE)).toThrow(/written as something other than \[\]\[\]any/);
    });
});
