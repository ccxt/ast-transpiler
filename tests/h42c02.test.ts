import { Transpiler } from '../src/transpiler';

const transpiler = new Transpiler({ csharp: { parser: { 'ELEMENT_ACCESS_WRAPPER_OPEN': 'getValue(' } } } as any);
const kinds = { limit: 'Int64?', maxLimit: 'Int64?', configuredLimit: 'Int64?', other: 'Int64?' };
const emit = (body: string) => {
    transpiler.csharpTranspiler.csharpExpressionTypeResolver = (node) => kinds[node?.text];
    try {
        return transpiler.transpileCSharp('class Exchange {\n safeInteger (o, k, d = undefined): number { return d; }\n' + body + '\n}').content;
    } finally {
        transpiler.csharpTranspiler.csharpExpressionTypeResolver = undefined;
    }
};
const seeded = (write: string) => 'f (o, limit: number = undefined) { let maxLimit: number = 1000; const configuredLimit = this.safeInteger (o, "limit"); '
    + write + ' let r = maxLimit; if (limit !== undefined) { r = Math.min (limit, maxLimit); } return r; }';

describe('csharp Math.min / Math.max on an Int64? local seeded by an integer literal', () => {
    test('rewritten only under a null test of the source: native Math.Min', () => {
        const output = emit(seeded('if (configuredLimit !== undefined) { maxLimit = configuredLimit; }'));
        expect(output).toContain('Math.Min(limit.Value, maxLimit.GetValueOrDefault())');
        expect(output).not.toContain('mathMin(');
    });
    test('a literal rewrite stays native', () => {
        expect(emit(seeded('if (o) { maxLimit = 500; }'))).toContain('Math.Min(limit.Value, maxLimit.GetValueOrDefault())');
    });
    test('an unguarded nullable write keeps the helper', () => {
        expect(emit(seeded('maxLimit = configuredLimit;'))).toContain('mathMin(limit, maxLimit)');
    });
    test('a null write keeps the helper', () => {
        expect(emit(seeded('if (o) { maxLimit = undefined; }'))).toContain('mathMin(limit, maxLimit)');
    });
    test('a compound write keeps the helper', () => {
        expect(emit(seeded('maxLimit += configuredLimit;'))).toContain('mathMin(limit, maxLimit)');
    });
});
