import { Transpiler } from '../src/transpiler';

jest.mock('module', () => ({ __esModule: true, default: jest.fn() }));

const java = (body: string, params = '', ret = 'any'): string => new Transpiler({ verbose: false, java: { parser: { NUM_LINES_END_FILE: 0 } } })
    .transpileJava(`type Num = number | undefined;\nclass T {\n    f(${params}): ${ret} {\n${body}\n    }\n}`).content;

describe('java double product written to a Num', () => {
    test('a guarded double product into a `: Num` local prints native double arithmetic', () => {
        const out = java('        let c: Num = undefined;\n        c = (3 / 1.5) * 2;\n        return c;');
        expect(out).toContain('* ((double) 2))');
        expect(out).not.toContain('Helpers.multiply(');
    });
    test('a double product returned from a `: Num` method prints native', () => {
        const out = java('        return (3 / 1.5) * 2;', '', 'Num');
        expect(out).not.toContain('Helpers.multiply(');
    });
    test('an unguarded nullable operand keeps the helper', () => {
        expect(java('        let c: Num = undefined;\n        c = a * 1.5;\n        return c;', 'a: Num')).toContain('Helpers.multiply(');
    });
    test('an untyped operand keeps the helper', () => {
        expect(java('        let c: Num = undefined;\n        c = a * 1.5;\n        return c;', 'a: any')).toContain('Helpers.multiply(');
    });
    test('a double product into an untyped local keeps the helper', () => {
        expect(java('        let c = undefined;\n        c = 2 * 1.5;\n        return c;')).toContain('Helpers.multiply(2, 1.5)');
    });
    test('a long pair into a Num local keeps the long product', () => {
        expect(java('        let c: Num = undefined;\n        c = 2 * 3;\n        return c;')).toContain('(2L * 3L)');
    });
});
