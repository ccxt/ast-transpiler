import { Transpiler } from '../src/transpiler';

const transpiler = new Transpiler({ csharp: { parser: { 'ELEMENT_ACCESS_WRAPPER_OPEN': 'getValue(' } } } as any);
const emit = (body: string) => {
    const t: any = transpiler;
    t.csharpTranspiler.csharpExpressionTypeResolver = undefined;
    const source = 'class Precise {\n    decimals: number;\n    constructor (s: string) { this.decimals = 0; }\n}\n'
        + 'class Other {\n    decimals: any;\n}\n'
        + 'class Exchange {\n safeInteger (o: any, k: any): number | undefined { return o[k]; }\n' + body + '\n}';
    return t.transpileCSharp(source).content;
};

describe('csharp Math.max over the Int64 Precise.decimals field', () => {
    test('a Precise decimals read beside a null-tested integer prints Math.Max', () => {
        const output = emit('f (m: any) { const places = this.safeInteger (m, "p"); const precise = new Precise ("1"); if (places !== undefined) { precise.decimals = Math.max (precise.decimals, places); } return precise; }');
        expect(output).toContain('Math.Max(precise.decimals, places.Value)');
        expect(output).not.toContain('mathMax(');
    });
    test('an untested nullable operand keeps the helper', () => {
        const output = emit('f (m: any) { const places = this.safeInteger (m, "p"); const precise = new Precise ("1"); precise.decimals = Math.max (precise.decimals, places); return precise; }');
        expect(output).toContain('mathMax(');
    });
    test('a decimals field of another class keeps the helper', () => {
        const output = emit('f (o: Other, n: number) { const x = Math.max (o.decimals, 2); return x; }');
        expect(output).toContain('mathMax(');
    });
    test('a decimals read on an untyped value keeps the helper', () => {
        const output = emit('f (o: any) { const x = Math.max (o.decimals, 2); return x; }');
        expect(output).toContain('mathMax(');
    });
});
