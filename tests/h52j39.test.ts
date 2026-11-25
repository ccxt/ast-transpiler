import { Transpiler } from '../src/transpiler';

jest.mock('module', () => ({ __esModule: true, default: jest.fn() }));

// `s.slice (i + 1)` where `const i = s.indexOf (..)`: the start is never negative, so the
// open-end substring needs no count-from-the-end branch and fits the line budget
const transpiler = new Transpiler({ verbose: false, java: { parser: { NUM_LINES_END_FILE: 0 } } });
const TYPES: { [name: string]: string } = { colonIndex: 'Integer', at: 'Integer', side: 'String', outcomeInput: 'String' };

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
    '    sideHint (outcomeInput: string): string {\n' +
    "        const colonIndex = outcomeInput.indexOf (':');\n" +
    '        const side = outcomeInput.slice (colonIndex + 1).toUpperCase ();\n' +
    '        return side;\n' +
    '    }\n' +
    '    letHint (outcomeInput: string, k: number): string {\n' +
    "        let at = outcomeInput.indexOf (':');\n" +
    '        at = k;\n' +
    '        return outcomeInput.slice (at + 1);\n' +
    '    }\n' +
    '    minusHint (outcomeInput: string): string {\n' +
    "        const at = outcomeInput.indexOf (':');\n" +
    '        return outcomeInput.slice (at - 1);\n' +
    '    }\n' +
    '}\n';

describe('java slice after an indexOf local', () => {
    const out = run(SOURCE);
    const member = (name: string) => out.slice(out.indexOf(name + '('), out.indexOf('\n    }\n', out.indexOf(name + '(')));

    test('a const indexOf local plus a positive literal clamps only to the length', () => {
        expect(member('sideHint')).not.toContain('Helpers.slice');
        expect(member('sideHint')).toContain('.substring((int) Math.min(');
        expect(member('sideHint')).not.toContain('Math.max(');
    });
    test('a reassigned local keeps the count-from-the-end branch or the helper', () => {
        const text = member('letHint');
        expect(text.includes('Helpers.slice') || text.includes('Math.max(')).toBe(true);
    });
    test('an indexOf local minus a literal keeps the count-from-the-end branch or the helper', () => {
        const text = member('minusHint');
        expect(text.includes('Helpers.slice') || text.includes('Math.max(')).toBe(true);
    });
});
