import { Transpiler } from '../src/transpiler';

const transpiler = new Transpiler({ csharp: { parser: { 'ELEMENT_ACCESS_WRAPPER_OPEN': 'getValue(' } } } as any);
const emit = (body: string) => transpiler.transpileCSharp('class Exchange {\n parseToInt (n: any): number { return n; }\n' + body + '\n}').content;

describe('csharp parseToInt of a typed number binds the non-null Int64 twin', () => {
    test('Math.max over a literal and parseToInt of Math.ceil prints Math.Max', () => {
        const output = emit('f (x: number) { const d = Math.max (1, this.parseToInt (Math.ceil (x))); return d; }');
        expect(output).toContain('Math.Max(1, this.parseToInt(');
        expect(output).not.toContain('mathMax(');
    });
    test('an untyped argument keeps the helper: the object overload can answer null', () => {
        const output = emit('f (x) { const d = Math.max (1, this.parseToInt (x)); return d; }');
        expect(output).toContain('mathMax(1, this.parseToInt(x))');
    });
    test('a string argument keeps the helper: a non-numeric string answers null', () => {
        const output = emit('f (x: string) { const d = Math.max (1, this.parseToInt (x)); return d; }');
        expect(output).toContain('mathMax(1, this.parseToInt(x))');
    });
    test('an optional number argument keeps the helper: undefined answers null', () => {
        const output = emit('f (x: number = undefined) { const d = Math.max (1, this.parseToInt (x)); return d; }');
        expect(output).toContain('mathMax(1, this.parseToInt(x))');
    });
});
