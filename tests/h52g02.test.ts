import { Transpiler } from '../src/transpiler';

jest.mock('module', () => ({ __esModule: true, default: jest.fn() }));

// `x.length - 0` (the idiom that keeps PHP on strlen) prints as the bare length in Go and Java
describe('length minus zero is the length', () => {
    const transpiler = new Transpiler({ verbose: false, java: { parser: { NUM_LINES_END_FILE: 0 } } });
    const cls = (body: string, params = 's: string') =>
        'class T {\n' +
        `    f (${params}) {\n` +
        body +
        '    }\n' +
        '}\n';

    test('go: a string length minus zero is a native int local', () => {
        const out = transpiler.transpileGo(cls('        const n = s.length - 0;\n        return s.slice (0, n);\n')).content;
        expect(out).toContain('var n int = GetLength(s)');
        expect(out).not.toContain('Slice(s, 0, int64(');
        expect(out).not.toContain(' - 0');
    });

    test('go: the same form as the plain length', () => {
        const plain = transpiler.transpileGo(cls('        const n = s.length;\n        return n;\n')).content;
        const zero = transpiler.transpileGo(cls('        const n = s.length - 0;\n        return n;\n')).content;
        expect(zero).toBe(plain);
    });

    test('go negative: minus one keeps the arithmetic', () => {
        const out = transpiler.transpileGo(cls('        const n = s.length - 1;\n        return n;\n')).content;
        expect(out).toContain(' - 1');
    });

    test('go negative: minus zero on a non-length operand is untouched', () => {
        const out = transpiler.transpileGo(cls('        const n = a - 0;\n        return n;\n', 'a: number')).content;
        expect(out).toContain('Subtract(a, 0)');
    });

    test('java: a string length minus zero prints the length', () => {
        const out = transpiler.transpileJava(cls('        const n = s.length - 0;\n        return n;\n')).content;
        expect(out).not.toContain('- 0');
        expect(out).toMatch(/length\(\)/);
    });

    test('java negative: minus one keeps the arithmetic', () => {
        const out = transpiler.transpileJava(cls('        const n = s.length - 1;\n        return n;\n')).content;
        expect(out).toMatch(/- 1/);
    });

    test('java negative: minus zero on a non-length operand is untouched', () => {
        const out = transpiler.transpileJava(cls('        const n = a - 0;\n        return n;\n', 'a: number')).content;
        expect(out).toContain('Helpers.subtract(a, 0)');
    });

    test('java: the same form as the plain length', () => {
        const plain = transpiler.transpileJava(cls('        const n = s.length;\n        return n;\n')).content;
        const zero = transpiler.transpileJava(cls('        const n = s.length - 0;\n        return n;\n')).content;
        expect(zero).toBe(plain);
    });
});
