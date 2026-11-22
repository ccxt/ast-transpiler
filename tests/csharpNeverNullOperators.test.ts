import { Transpiler } from '../src/transpiler';

const transpiler = new Transpiler({ csharp: { parser: { 'ELEMENT_ACCESS_WRAPPER_OPEN': 'getValue(' } } } as any);
const kinds = { limit: 'Int64?', maxLimit: 'Int64?', other: 'Int64?', n: 'Int64', n2: 'Int64?', n3: 'Int64?' };
const emit = (body: string) => {
    transpiler.csharpTranspiler.csharpExpressionTypeResolver = (node) => kinds[node?.text];
    try {
        return transpiler.transpileCSharp('class Exchange {\n safeInteger (o, k, d = undefined): number { return d; }\n' + body + '\n}').content;
    } finally {
        transpiler.csharpTranspiler.csharpExpressionTypeResolver = undefined;
    }
};

describe('csharp operators on an Int64? local seeded by a safeInteger literal default', () => {
    test('add, subtract and divide with an integer other side print native arithmetic', () => {
        const output = emit('f (o) { const maxLimit = this.safeInteger (o, "limit", 1000); const a = maxLimit + 1; const b = maxLimit - 2; const c = maxLimit / 2; return [ a, b, c ]; }');
        expect(output).toContain('(maxLimit.GetValueOrDefault() + 1)');
        expect(output).toContain('(maxLimit.GetValueOrDefault() - 2)');
        expect(output).toContain('((double)maxLimit.GetValueOrDefault() / 2)');
        expect(output).not.toMatch(/\b(add|subtract|divide)\(/);
    });
    test('comparisons read the value on either side', () => {
        const output = emit('f (o, n: number) { const maxLimit = this.safeInteger (o, "limit", 1000); if (maxLimit < 5) { return 1; } if (n >= maxLimit) { return 2; } return 3; }');
        expect(output).toContain('maxLimit.GetValueOrDefault() < 5');
        expect(output).toContain('n >= maxLimit.GetValueOrDefault()');
    });
    test('no default keeps the helper: a missing key answers null', () => {
        const output = emit('f (o) { const maxLimit = this.safeInteger (o, "limit"); return maxLimit + 1; }');
        expect(output).toContain('add(maxLimit, 1)');
    });
    test('a rewritten binding keeps the helper: the write may put null back', () => {
        const output = emit('f (o, other = undefined) { let maxLimit = this.safeInteger (o, "limit", 1000); maxLimit = other; return maxLimit / 2; }');
        expect(output).toContain('divide(maxLimit, 2)');
    });
    test('a nullable other side keeps the helper', () => {
        const output = emit('f (o, limit: number = undefined) { const maxLimit = this.safeInteger (o, "limit", 1000); return maxLimit + limit; }');
        expect(output).toContain('add(maxLimit, limit)');
    });
    test('a non-literal default keeps the helper and the division by zero literal keeps divide', () => {
        const output = emit('f (o, other = undefined) { const maxLimit = this.safeInteger (o, "limit", other); const z = this.safeInteger (o, "z", 5); return [ maxLimit - 1, z / 0 ]; }');
        expect(output).toContain('subtract(maxLimit, 1)');
        expect(output).toContain('divide(z, 0)');
    });
    test('a native integral difference compared with a never-null bound prints the operator', () => {
        const output = emit('f (o, n2: number = undefined, n3: number = undefined) { const maxLimit = this.safeInteger (o, "w", 1000); if ((n2 - n3) > maxLimit) { return 1; } if (maxLimit < (n2 - n3)) { return 2; } return 3; }');
        expect(output).toContain('(n2 - n3) > maxLimit.GetValueOrDefault()');
        expect(output).toContain('maxLimit.GetValueOrDefault() < (n2 - n3)');
    });
    test('a nullable bound keeps isGreaterThan beside the difference', () => {
        const output = emit('f (o, limit: number = undefined, other: number = undefined) { const maxLimit = this.safeInteger (o, "w"); if ((limit - other) > maxLimit) { return 1; } return 3; }');
        expect(output).toContain('isGreaterThan(');
    });
});
