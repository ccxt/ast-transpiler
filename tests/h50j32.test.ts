import { Transpiler } from '../src/transpiler';

jest.mock('module', () => ({ __esModule: true, default: jest.fn() }));

// `digits.indexOf (hex.slice (a, b))` on a String local with a plain-string slice target prints String.indexOf
describe('java indexOf of a native String slice', () => {
    const transpiler = new Transpiler({ verbose: false, java: { parser: { NUM_LINES_END_FILE: 0 } } });
    // the embedding build layer declares the literal-seeded local `String`
    const print = (body: string, params = 'hex: string') => {
        const printer: any = (transpiler as any).javaTranspiler;
        const previous = printer.javaDeclaredLocalTypeResolver;
        printer.javaDeclaredLocalTypeResolver = (d: any) => (d?.name?.text === 'digits' ? 'String' : undefined);
        try {
            return transpiler.transpileJava(
                'class T {\n' +
                `    f (${params}): number {\n` +
                "        const digits = '0123456789abcdef';\n" +
                body +
                '    }\n' +
                '}\n').content;
        } finally {
            printer.javaDeclaredLocalTypeResolver = previous;
        }
    };

    test('a String local receiver and a literal-bound slice of a string parameter print natively', () => {
        const out = print('        return digits.indexOf (hex.slice (0, 1));\n');
        expect(out).toMatch(/digits\.indexOf\(\(hex == null \? null : /);
        expect(out).not.toContain('Helpers.getIndexOf');
    });
    test('an any slice receiver keeps the helper', () => {
        const out = print('        return digits.indexOf (hex.slice (0, 1));\n', 'hex: any');
        expect(out).toContain('Helpers.getIndexOf(digits');
    });
    test('a non-slice target of unknown kind keeps the helper', () => {
        const out = print('        return digits.indexOf (hex[0]);\n', 'hex: any');
        expect(out).toContain('Helpers.getIndexOf(digits');
    });
    test('an any receiver keeps the helper', () => {
        const out = print('        const d: any = digits;\n        return d.indexOf (hex.slice (0, 1));\n');
        expect(out).toContain('Helpers.getIndexOf(d');
    });
});
