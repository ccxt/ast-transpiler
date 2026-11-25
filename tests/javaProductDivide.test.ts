import { Transpiler } from '../src/transpiler';

jest.mock('module', () => ({ __esModule: true, default: jest.fn() }));

const java = (body: string, params = ''): string => new Transpiler({ verbose: false, java: { parser: { NUM_LINES_END_FILE: 0 } } })
    .transpileJava(`class T {\n    f(${params}): any {\n${body}\n    }\n}`).content;

describe('java product read only by a divide', () => {
    test('an integral double product under `/` prints native double arithmetic', () => {
        const out = java('        const r = 2 * 1.5 / 4;\n        return r;');
        expect(out).toContain('(((double) (((double) 2) * ((double) 1.5))) / ((double) 4))');
        expect(out).not.toContain('Helpers.multiply(');
        expect(out).not.toContain('Helpers.divide(');
    });
    test('the same product outside a divide keeps the helper', () => {
        const out = java('        const r = 2 * 1.5;\n        return r;');
        expect(out).toContain('Helpers.multiply(2, 1.5)');
    });
    test('a nullable or untyped operand keeps both helpers', () => {
        expect(java('        return o * 1.5 / 4;', 'o: any')).toContain('Helpers.multiply(o, 1.5)');
        expect(java('        return n * 1.5 / 4;', 'n: number | undefined')).toContain('Helpers.multiply(n, 1.5)');
    });
    test('a long pair under `/` keeps the long product', () => {
        expect(java('        return 2 * 3 / 4;')).toContain('(2L * 3L)');
    });
});
