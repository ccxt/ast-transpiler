import { Transpiler } from '../src/transpiler';

const transpiler = new Transpiler({ csharp: { parser: { 'ELEMENT_ACCESS_WRAPPER_OPEN': 'getValue(' } } } as any);
const emit = (body: string) => {
    const t: any = transpiler;
    t.csharpTranspiler.csharpExpressionTypeResolver = undefined;
    const source = 'class Exchange {\n safeInteger (o: any, k: any, d: any = undefined): number | undefined { return o[k]; }\n'
        + ' parseToInt (x: any): number { return x; }\n' + body + '\n}';
    return t.transpileCSharp(source).content;
};

describe('csharp Math.min over a nested native Math.max', () => {
    test('a literal beside a native Math.max of a typed parseToInt prints Math.Min', () => {
        const output = emit('f (o: any, x: number) { let days = this.safeInteger (o, "d", 7); days = Math.min (7, Math.max (1, this.parseToInt (Math.ceil (x)))); return days; }');
        expect(output).toContain('Math.Min(7, Math.Max(1, this.parseToInt(');
        expect(output).not.toContain('mathMin(');
    });
    test('a nested max that keeps its helper keeps the outer helper', () => {
        const output = emit('f (o: any, x) { let days = this.safeInteger (o, "d", 7); days = Math.min (7, Math.max (1, this.parseToInt (x))); return days; }');
        expect(output).toContain('mathMin(7, mathMax(');
    });
    test('a nested max beside an untyped operand keeps the helper', () => {
        const output = emit('f (o: any, x: number, y) { const d = Math.min (y, Math.max (1, this.parseToInt (Math.ceil (x)))); return d; }');
        expect(output).toContain('mathMin(');
    });
    test('a nested max beside an untested nullable keeps the helper', () => {
        const output = emit('f (o: any, x: number) { const n = this.safeInteger (o, "n"); const d = Math.min (n, Math.max (1, this.parseToInt (Math.ceil (x)))); return d; }');
        expect(output).toContain('mathMin(');
    });
});
