import { Transpiler } from '../src/transpiler';

jest.mock('module', () => ({ __esModule: true, default: jest.fn() }));

// `h.slice (i, i + 1)` where `i` is a `for (let i = 0; ..; i++)` counter: the bounds are Java ints,
// never negative, so the native substring needs no box and no count-from-the-end branch
const transpiler = new Transpiler({ verbose: false, java: { parser: { NUM_LINES_END_FILE: 0 } } });
const TYPES: { [name: string]: string } = { h: 'String', total: 'Integer' };

const run = (source: string): string => {
    const printer: any = (transpiler as any).javaTranspiler;
    const previous = printer.javaDeclaredLocalTypeResolver;
    printer.javaDeclaredLocalTypeResolver = (declaration: any) => TYPES[declaration?.name?.text];
    try {
        return transpiler.transpileJava(source).content;
    } finally {
        printer.javaDeclaredLocalTypeResolver = previous;
    }
};

const SOURCE =
    'class T {\n' +
    '    counterHint (h: string): string {\n' +
    '        const total = h.length;\n' +
    '        for (let i = 0; i < total; i++) {\n' +
    "            if (h.slice (i, i + 1) === '0') {\n" +
    '                continue;\n' +
    '            }\n' +
    '        }\n' +
    "        return '';\n" +
    '    }\n' +
    '    writtenHint (h: string, k: number): string {\n' +
    '        for (let i = 0; i < 3; i++) {\n' +
    '            i = k;\n' +
    "            if (h.slice (i, i + 1) === '0') {\n" +
    '                continue;\n' +
    '            }\n' +
    '        }\n' +
    "        return '';\n" +
    '    }\n' +
    '    plainHint (h: string, k: number): string {\n' +
    '        return h.slice (k, k + 1);\n' +
    '    }\n' +
    '}\n';

describe('java slice on a for counter', () => {
    const out = run(SOURCE);
    const member = (name: string) => out.slice(out.indexOf(name + '('), out.indexOf('\n    }\n', out.indexOf(name + '(')));

    test('an int counter and counter plus a literal print a clamped substring', () => {
        expect(member('counterHint')).not.toContain('Helpers.slice');
        expect(member('counterHint')).toContain('h.substring((int) Math.min(');
        expect(member('counterHint')).not.toContain('Math.max(');
    });
    test('a counter written in the body keeps the helper or the count-from-the-end branch', () => {
        const text = member('writtenHint');
        expect(text.includes('Helpers.slice') || text.includes('Math.max(')).toBe(true);
    });
    test('a plain number parameter keeps the helper or the count-from-the-end branch', () => {
        const text = member('plainHint');
        expect(text.includes('Helpers.slice') || text.includes('Math.max(')).toBe(true);
    });
});
