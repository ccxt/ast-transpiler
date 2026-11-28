import { Transpiler } from '../src/transpiler';

const transpiler = new Transpiler({ csharp: { parser: { 'ELEMENT_ACCESS_WRAPPER_OPEN': 'getValue(' } } } as any);
const emit = (body: string) => {
    const t: any = transpiler;
    t.csharpTranspiler.csharpExpressionTypeResolver = (node: any) => ({ r: 'Int64?', limit: 'Int64?' })[node?.text];
    return t.transpileCSharp('class Exchange {\n parseToInt (n: any): number { return n; }\n' + body + '\n}').content;
};

describe('csharp Math.min over a never-null parseToInt local', () => {
    test('a local bound by parseToInt of a ternary over typed numbers prints Math.Min', () => {
        const output = emit('f (limit: number = undefined) { const r = this.parseToInt ((limit === undefined) ? 100 : Math.min (limit, 2000)); const p: number = Math.min (r + 1, 2000); return p; }');
        expect(output).toContain('Math.Min(');
        expect(output).not.toContain('mathMin(');
    });
    test('a local bound by parseToInt of a literal prints Math.Min', () => {
        const output = emit('f (x: number) { const r = this.parseToInt (100); const p: number = Math.min (r, 2000); return p; }');
        expect(output).not.toContain('mathMin(');
    });
    test('an untyped argument keeps the helper: parseToInt can answer null', () => {
        const output = emit('f (x) { const r = this.parseToInt (x); const p: number = Math.min (r, 2000); return p; }');
        expect(output).toContain('mathMin(');
    });
    test('a string argument keeps the helper', () => {
        const output = emit('f (x: string) { const r = this.parseToInt (x); const p: number = Math.min (r, 2000); return p; }');
        expect(output).toContain('mathMin(');
    });
    test('a local rewritten with an untyped value keeps the helper', () => {
        const output = emit('f (x: number, y) { let r = this.parseToInt (x); r = this.parseToInt (y); const p: number = Math.min (r, 2000); return p; }');
        expect(output).toContain('mathMin(');
    });
});
