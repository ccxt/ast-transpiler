import { Transpiler } from '../src/transpiler';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

jest.mock('module', () => {
    return { createRequire: jest.fn() };
});

// a parameter the build layer retyped to IDictionary<string, object> passes to an
// IDictionary<string, object> call-site slot without the identity cast. Call-site conversions
// apply only to exchange sources (a path under ts/src/), so the fixture is printed by path.
describe('h42c13: retyped dictionary parameter at a dictionary argument slot', () => {
    const source =
        "class Exchange {\n" +
        "    safeMarket(marketId: any, market: any = undefined): any { return market; }\n" +
        "    parseTicker(ticker: any, market: any = undefined) {\n" +
        "        return this.safeMarket('x', market);\n" +
        "    }\n" +
        "}\n";
    let file: string;
    beforeAll(() => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'h42c13-'));
        file = path.join(dir, 'ts', 'src', 'thing.ts');
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, source);
    });
    const run = (resolver: ((d: any) => string | undefined) | undefined) => {
        const config = { 'verbose': false, 'csharp': { 'callSiteArgTypes': { 'safeMarket': { 1: 'IDictionary<string, object>' } }, 'parser': { 'NUM_LINES_END_FILE': 0 } } };
        const transpiler: any = new Transpiler(config as any);
        if (resolver !== undefined) {
            transpiler.csharpTranspiler.csharpDeclaredLocalTypeResolver = resolver;
        }
        return transpiler.transpileCSharpByPath(file).content as string;
    };
    const marketOf = (type: string) => (d: any) => (d?.name?.text === 'market' && d?.parent?.name?.text === 'parseTicker') ? type : undefined;
    test('positive: the retyped parameter prints bare', () => {
        const output = run(marketOf('IDictionary<string, object>'));
        expect(output).toContain('this.safeMarket("x", market)');
        expect(output).not.toContain('((IDictionary<string, object>)market)');
    });
    test('negative: an untyped parameter keeps the cast', () => {
        expect(run(undefined)).toContain('this.safeMarket("x",((IDictionary<string, object>)market))');
        expect(run(() => undefined)).toContain('this.safeMarket("x",((IDictionary<string, object>)market))');
    });
    test('negative: a parameter the resolver types as a list keeps the cast', () => {
        expect(run(marketOf('List<object>'))).toContain('this.safeMarket("x",((IDictionary<string, object>)market))');
    });
    test('negative: a concrete Dictionary record is not the interface slot rule', () => {
        expect(run(marketOf('Dictionary<string, object>'))).toContain('this.safeMarket("x",((IDictionary<string, object>)market))');
    });
});
