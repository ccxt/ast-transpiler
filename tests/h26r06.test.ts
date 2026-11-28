import { Transpiler } from '../src/transpiler';

jest.mock('module', () => ({ __esModule: true, default: jest.fn() }));

const transpiler = new Transpiler({ verbose: false, rust: { parser: { NUM_LINES_END_FILE: 0 } } } as any);
const LOOP = "class T {\n    f (xs: any[]) {\n        let n = 0;\n        for (let i = 0; i < xs.length; i++) {\n            n = n + 1;\n        }\n        return n;\n    }\n}";

describe('rust loop-flag names are per file', () => {
    test('a file prints the same whatever was printed before it in the same run', () => {
        const first = transpiler.transpileRust(LOOP).content;
        transpiler.transpileRust(LOOP);
        const again = transpiler.transpileRust(LOOP).content;
        expect(first).toContain('__for_first_0');
        expect(again).toBe(first);
    });

    test('negative: two loops in one file still get distinct flags', () => {
        const two = LOOP.replace('return n;', "for (let j = 0; j < xs.length; j++) {\n            n = n + 2;\n        }\n        return n;");
        const out = transpiler.transpileRust(two).content;
        expect(out).toContain('__for_first_0');
        expect(out).toContain('__for_first_1');
    });
});
