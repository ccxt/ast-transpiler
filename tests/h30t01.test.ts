import { Transpiler } from '../src/transpiler';

jest.mock('module', () => ({ __esModule: true, default: jest.fn() }));

describe('csharp: the Array.isArray test binds the list handed to a split list parser', () => {
    const transpiler = new Transpiler({ verbose: false, csharp: { parser: { NUM_LINES_END_FILE: 0 } } });
    const D = "interface Dictionary<T> { [key: string]: T; }\ntype Dict = Dictionary<any>;\ntype Strings = string[] | undefined;\nclass Exchange {\n"
        + "    parseTickersList (tickers: Dict[], symbols: Strings = undefined, params: Dict = {}): any { return tickers.length; }\n"
        + "    parseTickersDict (tickers: Dict, symbols: Strings = undefined, params: Dict = {}): any { return tickers; }\n";
    const runPlain = (body: string) => transpiler.transpileCSharp(D + "    parseTickers (tickers: any, symbols: Strings = undefined, params: Dict = {}): any {\n" + body + "\n    }\n}").content;
    const go = (body: string) => runPlain(body);
    test('positive: the test binds tickersAsList (fails on the base printer)', () => {
        const out = go("        if (Array.isArray (tickers)) {\n            return this.parseTickersList (tickers, symbols, params);\n        }\n        return this.parseTickersDict (tickers, symbols, params);");
        expect(out).toContain('(tickers is IList<object> tickersAsList)');
    });
    test('negative: a write to the value inside the branch keeps the plain test', () => {
        const out = go("        if (Array.isArray (tickers)) {\n            tickers = [ tickers ];\n            return this.parseTickersList (tickers, symbols, params);\n        }\n        return this.parseTickersDict (tickers, symbols, params);");
        expect(out).not.toContain('tickersAsList');
    });
    test('negative: a callee outside the split list keeps the plain test', () => {
        const out = go("        if (Array.isArray (tickers)) {\n            return this.parseTickersDict (tickers, symbols, params);\n        }\n        return undefined;");
        expect(out).not.toContain('tickersAsList');
        expect(out).toContain('tickers is IList<object>) ||');
    });
    test('negative: an undefined value is still routed to the dict half (the pattern is false for null)', () => {
        const out = go("        if (Array.isArray (tickers)) {\n            return this.parseTickersList (tickers, symbols, params);\n        }\n        return this.parseTickersDict (tickers, symbols, params);");
        expect(out).toContain('return this.parseTickersDict(tickers, symbols, parameters);');
    });
});
