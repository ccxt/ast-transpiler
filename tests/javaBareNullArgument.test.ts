import { Transpiler } from '../src/transpiler';
import fs from 'fs';
import path from 'path';

jest.mock('module', () => ({ __esModule: true, default: jest.fn() }));

// a null argument into the only Java declaration of that name and arity needs no cast
// (printer.javaDeclarationsOf is the build layer's list of every Java declaration of a name)
describe('java bare null argument', () => {
    const TMP = path.join(__dirname, 'files', 'tmp-bare-null-argument');
    const SRC = path.join(TMP, 'ts', 'src', 'probe.ts');
    const print = (decls: ((name: string) => string[][] | undefined) | undefined) => {
        const t = new Transpiler({ verbose: false, java: { parser: { NUM_LINES_END_FILE: 0 } } });
        const printer: any = (t as any).javaTranspiler;
        printer.javaDeclarationsOf = decls;
        return t.transpileJavaByPath(SRC).content as string;
    };
    beforeAll(() => {
        fs.mkdirSync(path.dirname(SRC), { recursive: true });
        fs.writeFileSync(SRC,
            'class Venue {\n' +
            '    pick (id: string, market: any = undefined, delimiter: string = undefined): string {\n' +
            '        return id;\n' +
            '    }\n' +
            '    fixed (id: string, tag: string): string {\n' +
            '        return id + tag;\n' +
            '    }\n' +
            '    run (x: string): string {\n' +
            '        const a = this.pick (x, undefined, undefined);\n' +
            '        const b = this.fixed (x, undefined);\n' +
            '        return a + b;\n' +
            '    }\n' +
            '}\n');
    });
    afterAll(() => fs.rmSync(TMP, { recursive: true, force: true }));

    test('one declaration of that arity: bare null', () => {
        const out = print((n) => (n === 'pick' ? [['String', 'Object', 'String']] : (n === 'fixed' ? [['String', 'String']] : undefined)));
        expect(out).toMatch(/this\.pick\(\(String\) \(x\), null, null\)/);
        expect(out).toMatch(/this\.fixed\(\(String\) \(x\), null\)/);
    });
    test('two declarations of that arity: the cast picks the overload', () => {
        const out = print((n) => (n === 'fixed' ? [['String', 'String'], ['String', 'Long']] : undefined));
        expect(out).toMatch(/this\.fixed\(\(String\) \(x\), \(String\) \(?null\)?\)/);
    });
    test('declarations unknown (varargs or no Java tree): the cast stays', () => {
        expect(print(undefined)).toMatch(/this\.fixed\(\(String\) \(x\), \(String\) \(?null\)?\)/);
        expect(print(() => undefined)).toMatch(/this\.fixed\(\(String\) \(x\), \(String\) \(?null\)?\)/);
    });
});
