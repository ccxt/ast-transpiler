import { Transpiler } from '../src/transpiler';

const transpiler = new Transpiler({ csharp: { parser: { 'ELEMENT_ACCESS_WRAPPER_OPEN': 'getValue(' } } } as any);
const kinds = { limit: 'Int64?', n: 'int' };
const emit = (body: string) => {
    transpiler.csharpTranspiler.csharpExpressionTypeResolver = (node) => kinds[node?.text];
    try {
        return transpiler.transpileCSharp('class Exchange {\n' + body + '\n}').content;
    } finally {
        transpiler.csharpTranspiler.csharpExpressionTypeResolver = undefined;
    }
};

describe('csharp Int64? parameter after a literal default prologue', () => {
    test('min with an int local reads the value', () => {
        const output = emit('f (xs: any[], limit: number = 2147483647) { const n = xs.length; const oldest = Math.min (n, limit); return oldest; }');
        expect(output).toContain('Math.Min(n, limit.GetValueOrDefault())');
        expect(output).not.toContain('mathMin(');
    });
    test('no default keeps the helper', () => {
        const output = emit('f (xs: any[], limit: number = undefined) { const n = xs.length; return Math.min (n, limit); }');
        expect(output).toContain('mathMin(');
    });
    test('a non-literal default keeps the helper', () => {
        const output = emit('f (xs: any[], other: number, limit: number = other) { const n = xs.length; return Math.min (n, limit); }');
        expect(output).toContain('mathMin(');
    });
    test('a later write of null keeps the helper', () => {
        const output = emit('f (xs: any[], limit: number = 5) { limit = undefined; const n = xs.length; return Math.min (n, limit); }');
        expect(output).toContain('mathMin(');
    });
});

describe('csharp narrowed limit shadow beside an int local', () => {
    const config: any = { 'verbose': false, 'csharp': { 'parser': { 'ELEMENT_ACCESS_WRAPPER_OPEN': 'getValue(' }, 'numericArgTypes': { 'build': { 1: 'Int64?' } } } };
    test('min of the int length and the defaulted limit reads the value', () => {
        const t: any = new Transpiler(config);
        t.csharpTranspiler.csharpExpressionTypeResolver = (node: any) => ((node?.text === 'n') ? 'int' : undefined);
        const output = t.transpileCSharp('class Exchange {\n build (trades: any[], limit: number = 2147483647) { const n = trades.length; const oldest = Math.min (n, limit); return oldest; }\n}').content;
        expect(output).toContain('Math.Min(n, limit.GetValueOrDefault())');
    });
    test('a later null write keeps the helper', () => {
        const t: any = new Transpiler(config);
        t.csharpTranspiler.csharpExpressionTypeResolver = (node: any) => ((node?.text === 'n') ? 'int' : undefined);
        const output = t.transpileCSharp('class Exchange {\n build (trades: any[], limit: number = 5) { limit = undefined; const n = trades.length; return Math.min (n, limit); }\n}').content;
        expect(output).toContain('mathMin(');
    });
});
