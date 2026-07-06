import { Transpiler } from '../src/transpiler';
import { stripOverloadSignatures, reAsyncPromiseDelegators } from '../src/sourcePreprocess';

describe('source preprocessing', () => {

    describe('stripOverloadSignatures', () => {
        test('removes body-less overload signatures and keeps the implementation', () => {
            const ts =
            "class Test {\n" +
            "    safeDict (dictionary: any, key: string, defaultValue: Dict): Dict;\n" +
            "    safeDict (dictionary: any, key: string): Dict | undefined;\n" +
            "    safeDict (dictionary: any, key: string, defaultValue: Dict = undefined) {\n" +
            "        return this.safeValue (dictionary, key, defaultValue);\n" +
            "    }\n" +
            "}";
            const expected =
            "class Test {\n" +
            "    safeDict (dictionary: any, key: string, defaultValue: Dict = undefined) {\n" +
            "        return this.safeValue (dictionary, key, defaultValue);\n" +
            "    }\n" +
            "}";
            expect(stripOverloadSignatures(ts)).toBe(expected);
        });
        test('removes async overload signatures', () => {
            const line = "    async fetchTrades (symbol: string): Promise<Trade[]>;\n";
            expect(stripOverloadSignatures(line + "const x = 1;")).toBe("const x = 1;");
        });
        test('keeps regular statements ending with ;', () => {
            const ts =
            "const x: number = 1;\n" +
            "let y = this.parse8601 (value);\n" +
            "this.myMethod (a, b);";
            expect(stripOverloadSignatures(ts)).toBe(ts);
        });
        test('keeps abstract-style declarations with bodies', () => {
            const ts =
            "class Test {\n" +
            "    fetchTicker (symbol: string): Promise<Ticker> {\n" +
            "        return this.fetchTickerHelper (symbol);\n" +
            "    }\n" +
            "}";
            expect(stripOverloadSignatures(ts)).toBe(ts);
        });
    });

    describe('reAsyncPromiseDelegators', () => {
        test('re-asyncs a non-async Promise-returning delegator', () => {
            const ts =
            "class Test {\n" +
            "    watchTicker (symbol: string, params = {}): Promise<Ticker> {\n" +
            "        return this.watchTickers ([ symbol ], params);\n" +
            "    }\n" +
            "}";
            const expected =
            "class Test {\n" +
            "    async watchTicker (symbol: string, params = {}): Promise<Ticker> {\n" +
            "        return await this.watchTickers ([ symbol ], params);\n" +
            "    }\n" +
            "}";
            expect(reAsyncPromiseDelegators(ts)).toBe(expected);
        });
        test('leaves async methods untouched', () => {
            const ts =
            "class Test {\n" +
            "    async watchTicker (symbol: string, params = {}): Promise<Ticker> {\n" +
            "        return await this.watchTickers ([ symbol ], params);\n" +
            "    }\n" +
            "}";
            expect(reAsyncPromiseDelegators(ts)).toBe(ts);
        });
        test('leaves non-Promise methods untouched', () => {
            const ts =
            "class Test {\n" +
            "    market (symbol: string): Market {\n" +
            "        return this.markets[symbol];\n" +
            "    }\n" +
            "}";
            expect(reAsyncPromiseDelegators(ts)).toBe(ts);
        });
        test('only rewrites return statements inside the matched method', () => {
            const ts =
            "class Test {\n" +
            "    watchTicker (symbol: string, params = {}): Promise<Ticker> {\n" +
            "        return this.watchTickers ([ symbol ], params);\n" +
            "    }\n" +
            "    market (symbol: string): Market {\n" +
            "        return this.markets[symbol];\n" +
            "    }\n" +
            "}";
            const output = reAsyncPromiseDelegators(ts);
            expect(output).toContain("async watchTicker");
            expect(output).toContain("return await this.watchTickers");
            expect(output).toContain("        return this.markets[symbol];");
            expect(output).not.toContain("async market");
        });
    });

    describe('Transpiler integration (sourcePreprocessing config)', () => {
        const transpiler = new Transpiler({
            'verbose': false,
            'sourcePreprocessing': {
                'stripOverloadSignatures': true,
                'reAsyncPromiseDelegators': true,
            },
        });
        test('csharp output of a re-asynced delegator matches the classic async form', () => {
            const nonAsync =
            "class Test {\n" +
            "    watchTicker (symbol: string, params = {}): Promise<any> {\n" +
            "        return this.watchTickers ([ symbol ], params);\n" +
            "    }\n" +
            "}";
            const classicAsync =
            "class Test {\n" +
            "    async watchTicker (symbol: string, params = {}): Promise<any> {\n" +
            "        return await this.watchTickers ([ symbol ], params);\n" +
            "    }\n" +
            "}";
            const output = transpiler.transpileCSharp(nonAsync).content;
            const expected = transpiler.transpileCSharp(classicAsync).content;
            expect(output).toBe(expected);
            expect(output).toContain("async");
        });
        test('overload signatures do not break transpilation', () => {
            const ts =
            "class Test {\n" +
            "    safeDict (dictionary: any, key: string): any;\n" +
            "    safeDict (dictionary: any, key: string, defaultValue: any = undefined) {\n" +
            "        return this.safeValue (dictionary, key, defaultValue);\n" +
            "    }\n" +
            "}";
            const output = transpiler.transpilePython(ts).content;
            expect(output).toContain("def safe_dict");
            expect((output.match(/def safe_dict/g) || []).length).toBe(1);
        });
        test('preprocessing is off by default', () => {
            const vanilla = new Transpiler({ 'verbose': false });
            const ts =
            "class Test {\n" +
            "    watchTicker (symbol: string, params = {}): Promise<any> {\n" +
            "        return this.watchTickers ([ symbol ], params);\n" +
            "    }\n" +
            "}";
            const output = vanilla.transpilePython(ts).content;
            expect(output).not.toContain("async def watchTicker");
        });
    });
});
