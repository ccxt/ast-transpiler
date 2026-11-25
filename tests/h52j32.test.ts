import { Transpiler } from '../src/transpiler';

jest.mock('module', () => ({ __esModule: true, default: jest.fn() }));

// `key.indexOf ((t as string))` where the embedding layer declares `t` a Java String prints String.indexOf
describe('java indexOf of an as-string target the build layer declares String', () => {
    const transpiler = new Transpiler({ verbose: false, java: { parser: { NUM_LINES_END_FILE: 0 } } });
    const print = (body: string, declared = 't') => {
        const printer: any = (transpiler as any).javaTranspiler;
        const previous = printer.javaDeclaredLocalTypeResolver;
        printer.javaDeclaredLocalTypeResolver = (d: any) => (d?.name?.text === declared ? 'String' : undefined);
        try {
            return transpiler.transpileJava(
                'class T {\n' +
                '    f (key: string, parts: any[]): number {\n' +
                '        const t = this.safeString (parts, 1);\n' +
                body +
                '    }\n' +
                '    safeString (x: any, k: any): any { return x; }\n' +
                '}\n').content;
        } finally {
            printer.javaDeclaredLocalTypeResolver = previous;
        }
    };

    test('a String key and an as-string String local print natively', () => {
        const out = print('        return key.indexOf ((t as string));\n');
        expect(out).toMatch(/key\)?\.indexOf\(t\)/);
        expect(out).not.toContain('Helpers.getIndexOf');
    });
    test('an as-string local the layer does not declare String keeps the helper', () => {
        const out = print('        return key.indexOf ((t as string));\n', 'other');
        expect(out).toContain('Helpers.getIndexOf(key');
    });
    test('an any target without as keeps the helper', () => {
        const out = print('        return key.indexOf (t);\n', 'other');
        expect(out).toContain('Helpers.getIndexOf(key');
    });
});
