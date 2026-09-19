import { Transpiler } from '../src/transpiler';

jest.mock('module', () => ({
    __esModule: true,
    default: jest.fn(),
}));

let transpiler: Transpiler;

beforeAll(() => {
    const config = {
        'verbose': false,
        'java': {
            'parser': {
                'NUM_LINES_END_FILE': 0,
            },
        },
    };
    transpiler = new Transpiler(config);
});

// java-23: `.length` native emission. Every case below is a receiver the printer's own
// proof names as a java.util.List / String; anything else keeps Helpers.getArrayLength.
describe('java .length helper removal', () => {
    const transpile = (input: string) => transpiler.transpileJava(input).content;

    test('array param length prints List.size() (checker proof, regression)', () => {
        const input =
            'class T {\n' +
            '    f(xs: number[]): void {\n' +
            '        const n = xs.length;\n' +
            '        return;\n' +
            '    }\n' +
            '}';
        const output = transpile(input);
        expect(output).toContain('((java.util.List<?>)xs).size()');
        expect(output).not.toContain('Helpers.getArrayLength');
    });

    test('any receiver keeps the length helper', () => {
        const input =
            'class T {\n' +
            '    f(x: any): void {\n' +
            '        const n = x.length;\n' +
            '        return;\n' +
            '    }\n' +
            '}';
        const output = transpile(input);
        expect(output).toContain('Helpers.getArrayLength(x)');
    });

    test('rest parameter (varargs array, not a List) keeps the length helper', () => {
        const input =
            'class T {\n' +
            '    f(...args: any[]): void {\n' +
            '        const n = args.length;\n' +
            '        return;\n' +
            '    }\n' +
            '}';
        const output = transpile(input);
        expect(output).toContain('Helpers.getArrayLength(args)');
    });

    test('array-derived cache class (java counterpart extends ArrayList) prints List.size()', () => {
        const input =
            'class ArrayCache extends Array<any> {\n' +
            '}\n' +
            'class T {\n' +
            '    f(c: ArrayCache): void {\n' +
            '        const n = c.length;\n' +
            '        return;\n' +
            '    }\n' +
            '}';
        const output = transpile(input);
        expect(output).toContain('((java.util.List<?>)c).size()');
    });

    test('order-book side interface (Array-derived, ArrayList implementations) prints List.size()', () => {
        const input =
            'interface IOrderBookSide<T> extends Array<T> {\n' +
            '}\n' +
            'class T {\n' +
            '    f(side: IOrderBookSide<any>): void {\n' +
            '        const n = side.length;\n' +
            '        return;\n' +
            '    }\n' +
            '}';
        const output = transpile(input);
        expect(output).toContain('((java.util.List<?>)side).size()');
    });

    test('a class that is not list-backed keeps the length helper', () => {
        const input =
            'class Bag {\n' +
            '    size: number = 0;\n' +
            '}\n' +
            'class T {\n' +
            '    f(b: Bag): void {\n' +
            '        const n = (b as any).length;\n' +
            '        return;\n' +
            '    }\n' +
            '}';
        const output = transpile(input);
        expect(output).toContain('Helpers.getArrayLength');
    });

    test('union of lists prints List.size()', () => {
        const input =
            'class T {\n' +
            '    f(xs: string[] | number[]): void {\n' +
            '        const n = xs.length;\n' +
            '        return;\n' +
            '    }\n' +
            '}';
        const output = transpile(input);
        expect(output).toContain('((java.util.List<?>)xs).size()');
    });

    test('union with a non-list member keeps the length helper', () => {
        const input =
            'class T {\n' +
            '    f(xs: string[] | Map<string, any>): void {\n' +
            '        const n = xs.length;\n' +
            '        return;\n' +
            '    }\n' +
            '}';
        const output = transpile(input);
        expect(output).toContain('Helpers.getArrayLength(xs)');
    });

    test('union of string literals prints String.length()', () => {
        const input =
            'class T {\n' +
            '    f(s: "a" | "b"): void {\n' +
            '        const n = s.length;\n' +
            '        return;\n' +
            '    }\n' +
            '}';
        const output = transpile(input);
        expect(output).toContain('((String)s).length()');
    });

    test('nullable list union guards null instead of throwing (helper answers 0)', () => {
        const input =
            'type NullableList = any[] | undefined;\n' +
            'class T {\n' +
            '    f(xs: NullableList): void {\n' +
            '        const n = xs.length;\n' +
            '        return;\n' +
            '    }\n' +
            '}';
        const output = transpile(input);
        expect(output).toContain('(xs == null ? 0 : ((java.util.List<?>)xs).size())');
        expect(output).not.toContain('Helpers.getArrayLength');
    });

    test('nullable string union guards null instead of throwing (helper answers 0)', () => {
        const input =
            'type Str = string | undefined;\n' +
            'class T {\n' +
            '    f(s: Str): void {\n' +
            '        const n = s.length;\n' +
            '        return;\n' +
            '    }\n' +
            '}';
        const output = transpile(input);
        expect(output).toContain('(s == null ? 0 : ((String)s).length())');
        expect(output).not.toContain('Helpers.getArrayLength');
    });

    test('nullable list union on a call receiver keeps the helper (evaluate-once)', () => {
        const input =
            'class T {\n' +
            '    g(): any[] | undefined {\n' +
            '        return undefined;\n' +
            '    }\n' +
            '    f(): void {\n' +
            '        const n = this.g().length;\n' +
            '        return;\n' +
            '    }\n' +
            '}';
        const output = transpile(input);
        expect(output).toContain('Helpers.getArrayLength(this.g())');
    });
});