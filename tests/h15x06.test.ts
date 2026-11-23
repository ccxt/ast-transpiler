import { Transpiler } from '../src/transpiler';


let transpiler: Transpiler;
beforeAll(() => { transpiler = new Transpiler({ csharp: { parser: { NUM_LINES_END_FILE: 0 } } }); });

const cs = (ts: string) => transpiler.transpileCSharp(ts).content;

describe('csharp Array.isArray binds a non-name argument once', () => {
    test('element read is evaluated once', () => {
        const out = cs('function f (xs) {\n    if (!Array.isArray (xs[0])) { return 1; }\n    return 2;\n}');
        expect(out).toMatch(/is var hxArr\d+ && \(\(hxArr\d+ is IList<object>\) \|\| \(hxArr\d+ is not null && hxArr\d+\.GetType\(\)\.IsGenericType/);
        expect(out.split('xs[0]').length - 1).toBeLessThanOrEqual(1);
    });
    test('a plain name keeps the direct form', () => {
        const out = cs('function f (xs) {\n    if (Array.isArray (xs)) { return 1; }\n    return 2;\n}');
        expect(out).not.toContain('is var hxArr');
        expect(out).toContain('((xs is IList<object>) || (xs is not null && xs.GetType().IsGenericType');
    });
    test('a property path keeps the direct form', () => {
        const out = cs('function f (o) {\n    if (Array.isArray (o.a)) { return 1; }\n    return 2;\n}');
        expect(out).not.toContain('is var hxArr');
    });
    test('a null value is tested before GetType', () => {
        const out = cs('function f (t) {\n    if (Array.isArray (t[\'bid\'])) { return 1; }\n    return 2;\n}');
        expect(out).toMatch(/\(hxArr\d+ is not null && hxArr\d+\.GetType\(\)\.IsGenericType/);
        expect(out).not.toMatch(/\|\| \(hxArr\d+\.GetType\(\)/);
    });
});
