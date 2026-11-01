import { Transpiler } from '../src/transpiler';
import { SyntaxKind } from 'typescript/unstable/ast';

jest.mock('module', () => ({
    __esModule: true,
    default: jest.fn()
}));

const config: any = {
    'verbose': false,
    'csharp': {
        'parser': { 'NUM_LINES_END_FILE': 0, 'ELEMENT_ACCESS_WRAPPER_OPEN': 'getValue(', 'ELEMENT_ACCESS_WRAPPER_CLOSE': ')' },
        'numericArgTypes': { 'fetchOHLCV': { 2: 'Int64?', 3: 'Int64?' } },
        'coreArgShadowCallees': [ 'fetchPaginatedCallDeterministic', 'parseOHLCVs' ]
    }
};

const printer = (source: string, resolver: boolean): string => {
    const transpiler: any = new Transpiler(config);
    if (resolver) {
        // the build layer's declared-kind answers: `maxLimit` is an int local
        const kinds: any = { 'maxLimit': 'int' };
        transpiler.csharpTranspiler.csharpExpressionTypeResolver = (node: any) => (node.kind === SyntaxKind.Identifier) ? kinds[node.text] : undefined;
    }
    return transpiler.transpileCSharp(source).content;
};

const counters =
    'class Exchange {\n' +
    '    strip (text: string, xs: any, d: any) {\n' +
    '        const chars = this.stringToCharsArray (text);\n' +
    '        for (let i = 0; i < chars.length; i++) {\n' +
    '            const ch = chars[i];\n' +
    '            const prev = (i > 0) && chars[i - 1];\n' +
    '        }\n' +
    '        for (let j = 1; j < 3; j++) {\n' +
    '            const key = String (j);\n' +
    '        }\n' +
    '        for (let k = 0; k < 3; k++) {\n' +
    '            const v = this.safeString (d, k);\n' +
    '        }\n' +
    '        for (let z = 0; z < 3; z++) {\n' +
    '            const w = this.safeString (d, \'a\', z);\n' +
    '        }\n' +
    '        for (let m = 0; m < 3; m++) {\n' +
    '            xs[m] = 1;\n' +
    '        }\n' +
    '        for (let n = 0; n < 3; n += 2) {\n' +
    '            const a = chars[n];\n' +
    '        }\n' +
    '        for (let q = 0; q < 3; q++) {\n' +
    '            q = q + 1;\n' +
    '        }\n' +
    '    }\n' +
    '}';

describe('FOLD2 C05: Int64 for-counter in the printer', () => {
    test('a literal counter whose reads normalise the box is declared Int64 with a native increment', () => {
        const out = printer(counters, false);
        expect(out).toContain('for (Int64 i = 0; ');
        expect(out).toContain('; i++)');
        expect(out).not.toContain('postFixIncrement(ref i)');
        expect(out).toContain('for (Int64 k = 0;');
    });

    test('a counter read as a string key, a compound step, an element write or a rewrite keeps the object helper form', () => {
        const out = printer(counters, false);
        expect(out).toContain('for (object j = 1; ');
        expect(out).toContain('postFixIncrement(ref j)');
        expect(out).toContain('postFixIncrement(ref m)');
        expect(out).toContain('for (object q = 0;');
        expect(out).not.toContain('for (Int64 n');
        expect(out).toContain('postFixIncrement(ref z)');
    });
});

const shadow =
    'class Exchange {\n' +
    '    fetchOHLCV (symbol: string, timeframe: string = \'1m\', since: number = undefined, limit: number = 100, params = {}) {\n' +
    '        const maxLimit = 1000;\n' +
    '        const r = (limit === undefined) ? 10000 : Math.min (limit, 10000);\n' +
    '        const p = this.parseOHLCVs ([], symbol, timeframe, since, limit);\n' +
    '        return r;\n' +
    '    }\n' +
    '    fetchOHLCV2 (symbol: string, since: number = undefined, limit: number = 100, params = {}) {\n' +
    '        const r = (limit === undefined) ? 10000 : Math.min (limit, 10000);\n' +
    '        return r;\n' +
    '    }\n' +
    '    fetchTicker (symbol: string, since: number = undefined, limit: number = 100, params = {}) {\n' +
    '        const r = (limit === undefined) ? 10000 : Math.min (limit, 10000);\n' +
    '        return r;\n' +
    '    }\n' +
    '    fetchOrders (symbol: string, since: number = undefined, limit: number = 100, params = {}) {\n' +
    '        const r = (limit === undefined) ? 10000 : Math.min (limit, 10000) + this.foo (limit);\n' +
    '        return r;\n' +
    '    }\n' +
    '}';

describe('FOLD2 C05: literal-default limit shadow proven on the AST', () => {
    test('without the build layer tables the helper stays', () => {
        const transpiler: any = new Transpiler({ 'verbose': false, 'csharp': { 'parser': { 'NUM_LINES_END_FILE': 0 } } });
        const out = transpiler.transpileCSharp(shadow).content;
        expect(out).toContain('mathMin(limit, 10000)');
    });

    test('a narrowed Int64? limit position whose every use is an identity read unboxes under its null test', () => {
        const out = printer(shadow, true);
        expect(out).toContain('Math.Min(limit.Value, 10000)');
    });

    test('a position the table does not narrow, or a use outside the allowlist, keeps the helper', () => {
        const out = printer(shadow, true);
        const lines = out.split('\n').filter((l) => l.includes('mathMin') || l.includes('Math.Min'));
        expect(lines.length).toBe(4);
        expect(lines.filter((l) => l.includes('mathMin(limit, 10000)')).length).toBe(3);
        expect(lines.filter((l) => l.includes('Math.Min(limit.Value, 10000)')).length).toBe(1);
    });
});
