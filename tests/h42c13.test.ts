import { Transpiler } from '../src/transpiler';

jest.mock('module', () => {
    return { createRequire: jest.fn() };
});

let transpiler: Transpiler;

beforeAll(() => {
    transpiler = new Transpiler({ csharp: { parser: { "NUM_LINES_END_FILE": 0 } } });
});

// a parameter the build layer retyped to IDictionary<string, object> passes to an
// IDictionary<string, object> call-site slot without the identity cast
describe('h42c13: retyped dictionary parameter at a dictionary argument slot', () => {
    const source =
        "class Exchange {\n" +
        "    safeMarket(marketId: any, market: any = undefined): any { return market; }\n" +
        "    parseTicker(ticker: any, market: any = undefined) {\n" +
        "        return this.safeMarket('x', market);\n" +
        "    }\n" +
        "}";
    const run = (resolver: (d: any) => string | undefined) => {
        const printer: any = (transpiler as any).csharpTranspiler;
        const previousResolver = printer.csharpDeclaredLocalTypeResolver;
        const previousArgs = printer.csharpCallSiteArgTypes;
        printer.csharpDeclaredLocalTypeResolver = resolver;
        printer.csharpCallSiteArgTypes = Object.assign({}, previousArgs, { safeMarket: { 1: 'IDictionary<string, object>' } });
        try {
            return transpiler.transpileCSharp(source).content;
        } finally {
            printer.csharpDeclaredLocalTypeResolver = previousResolver;
            printer.csharpCallSiteArgTypes = previousArgs;
        }
    };
    test('positive: the retyped parameter prints bare', () => {
        const isMarket = (d: any) => (d?.name?.text === 'market' && d?.parent?.name?.text === 'parseTicker') ? 'IDictionary<string, object>' : undefined;
        const output = run(isMarket);
        expect(output).toContain('this.safeMarket("x", market)');
        expect(output).not.toContain('((IDictionary<string, object>)market)');
    });
    test('negative: an untyped parameter keeps the cast', () => {
        expect(run(() => undefined)).toContain('((IDictionary<string, object>)market)');
    });
    test('negative: a concrete Dictionary record is not the interface slot rule', () => {
        const output = run((d: any) => (d?.name?.text === 'market' && d?.parent?.name?.text === 'parseTicker') ? 'List<object>' : undefined);
        expect(output).toContain('((IDictionary<string, object>)market)');
    });
});
