import { Transpiler } from '../src/transpiler';

const config = (go: any) => ({ 'verbose': false, 'go': Object.assign({ 'parser': { 'NUM_LINES_END_FILE': 0 } }, go) });
const go = (ts: string, extra: any = {}) => new Transpiler(config(extra)).transpileGo(ts).content;
const TABLE = { 'unifiedSliceParams': { 'parseRows': { 0: '[]any' } } };
const SRC = 'class Exchange {\n    parseRows (response: object[], key: string = undefined): any {\n        const out = {};\n' +
    '        for (let i = 0; i < response.length; i++) {\n            const info = response[i];\n            out[key] = info;\n        }\n        return out;\n    }\n}\n';

describe('h28t05 object[] row-list table slot', () => {
    test('a []any slot types an object[] parameter and takes its native length', () => {
        const out = go(SRC, TABLE);
        expect(out).toContain('ParseRows(response []any');
        expect(out).toContain('i < len(response)');
        expect(out).not.toContain('GetArrayLength(response)');
    });
    test('without the table row the parameter stays boxed', () => {
        const out = go(SRC);
        expect(out).not.toContain('response []any');
        expect(out).toContain('GetArrayLength(response)');
    });
    test('an optional object[] parameter is not typed', () => {
        const ts = 'class Exchange {\n    parseRows (response: object[] = undefined): number {\n        return response.length;\n    }\n}\n';
        expect(go(ts, TABLE)).not.toContain('response []any');
    });
    test('an object (not a list) parameter at a []any slot is not typed', () => {
        const ts = 'class Exchange {\n    parseRows (response: object): any {\n        return response;\n    }\n}\n';
        expect(go(ts, TABLE)).not.toContain('response []any');
    });
    test('a parameter written with something other than a list fails loudly', () => {
        const ts = 'class Exchange {\n    parseRows (response: object[]): any {\n        response = undefined;\n        return response;\n    }\n}\n';
        expect(() => go(ts, TABLE)).toThrow(/written as something other than \[\]any/);
    });
});
