import { Transpiler } from '../src/transpiler';

jest.mock('module',()=>({
    __esModule: true,
    default: jest.fn()
}));

let transpiler: Transpiler;

beforeAll(() => {
    const config = {
        'verbose': false,
        'java': {
            'parser': {
                'NUM_LINES_END_FILE': 0,
            }
        }
    }
    transpiler = new Transpiler(config);
})

describe('java transpiling tests', () => {
    test('basic variable declaration', () => {
        const input = "const x = 1;"
        const expected = "Object x = 1;"
        const output = transpiler.transpileJava(input).content;
        expect(output).toBe(expected);
    });

    test('basic method declaration', () => {
        const input =
        "class T {\n" +
        "    test(): string {\n" +
        "        return \"hello\";\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("Object test(");
        expect(output).toContain('return "hello"');
    });

    test('async void method returns CompletableFuture<Object> not <Void>', () => {
        const input =
        "class T {\n" +
        "    async doSomething(): Promise<void> {\n" +
        "        const x = 1;\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("java.util.concurrent.CompletableFuture<Object> doSomething(");
        expect(output).not.toContain("CompletableFuture<Void>");
    });

    test('async method with typed return also uses CompletableFuture<Object> (no per-type generics)', () => {
        const input =
        "class T {\n" +
        "    async fetchData(): Promise<string> {\n" +
        "        return \"data\";\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        // The Java transpiler does not map TS return types to Java generics —
        // all async methods use CompletableFuture<Object> regardless of the
        // declared Promise<T> type. This is intentional: the runtime casts
        // happen on the consumer side.
        expect(output).toContain("CompletableFuture<Object> fetchData(");
        expect(output).not.toContain("CompletableFuture<Void>");
    });

    test('async method body gets return null at end when no explicit return', () => {
        const input =
        "class T {\n" +
        "    async doSomething(): Promise<void> {\n" +
        "        const x = 1;\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        // supplyAsync lambda should end with return null before closing
        expect(output).toContain("return null;");
        expect(output).toContain("supplyAsync");
    });

    test('async method body does not add return null when last stmt is return', () => {
        const input =
        "class T {\n" +
        "    async fetchData(): Promise<string> {\n" +
        "        return \"data\";\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        const lines = output.split('\n');
        // Should not have a stray "return null;" — only the actual return "data"
        const returnNullCount = lines.filter(l => l.trim() === 'return null;').length;
        expect(returnNullCount).toBe(0);
    });

    test('bare return in async method becomes return null', () => {
        const input =
        "class T {\n" +
        "    async handleMessage(msg: any): Promise<void> {\n" +
        "        if (msg === undefined) {\n" +
        "            return;\n" +
        "        }\n" +
        "        const x = msg;\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        // The bare return; inside the if should become return null;
        // since it's inside an async method (supplyAsync lambda)
        expect(output).not.toMatch(/\breturn;\s*$/m);
        expect(output).toContain("return null;");
    });

    test('bare return in sync void method stays as return', () => {
        const input =
        "class T {\n" +
        "    handleMessage(msg: any): void {\n" +
        "        if (msg === undefined) {\n" +
        "            return;\n" +
        "        }\n" +
        "        const x = msg;\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        // Sync void method should keep bare return;
        expect(output).toMatch(/\breturn;\s*$/m);
        expect(output).not.toContain("supplyAsync");
    });

    test('bare return in sync method is not affected by async methods in the same class', () => {
        // Test sync method in isolation to verify bare return; is preserved
        const syncInput =
        "class T {\n" +
        "    handleMessage(msg: any): void {\n" +
        "        if (msg === undefined) {\n" +
        "            return;\n" +
        "        }\n" +
        "        const x = msg;\n" +
        "    }\n" +
        "}"
        const syncOutput = transpiler.transpileJava(syncInput).content;
        expect(syncOutput).toMatch(/\breturn;\s*$/m);

        // Test async method in isolation to verify bare return; becomes return null;
        const asyncInput =
        "class T {\n" +
        "    async handleMessage(msg: any): Promise<void> {\n" +
        "        if (msg === undefined) {\n" +
        "            return;\n" +
        "        }\n" +
        "        const x = msg;\n" +
        "    }\n" +
        "}"
        const asyncOutput = transpiler.transpileJava(asyncInput).content;
        expect(asyncOutput).not.toMatch(/\breturn;\s*$/m);
        expect(asyncOutput).toContain("return null;");
    });

    test('async method with multiple returns does not add extra return null', () => {
        const input =
        "class T {\n" +
        "    async fetchData(x: any): Promise<string> {\n" +
        "        if (x) {\n" +
        "            return \"a\";\n" +
        "        }\n" +
        "        return \"b\";\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        // Last statement is a return, so no return null should be added
        const returnNullCount = output.split('\n').filter(l => l.trim() === 'return null;').length;
        expect(returnNullCount).toBe(0);
    });

    test('return null has correct spacing (no double space)', () => {
        const input =
        "class T {\n" +
        "    async handleMessage(msg: any): Promise<void> {\n" +
        "        if (msg === undefined) {\n" +
        "            return;\n" +
        "        }\n" +
        "        const x = msg;\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        // Should be "return null;" with single space, not "return  null;"
        expect(output).not.toContain("return  null;");
        expect(output).toContain("return null;");
    });

    test('async method with if/else both returning does not add return null', () => {
        const input =
        "class T {\n" +
        "    async fetchData(condition: boolean): Promise<string> {\n" +
        "        if (condition) {\n" +
        "            return await this.methodA();\n" +
        "        } else {\n" +
        "            return await this.methodB();\n" +
        "        }\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        const returnNullCount = output.split('\n').filter(l => l.trim() === 'return null;').length;
        expect(returnNullCount).toBe(0);
    });

    test('async method with if/else-if (no final else) still adds return null', () => {
        const input =
        "class T {\n" +
        "    async fetchData(x: number): Promise<string> {\n" +
        "        if (x === 1) {\n" +
        "            return \"a\";\n" +
        "        } else if (x === 2) {\n" +
        "            return \"b\";\n" +
        "        }\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        // else-if without final else: fallthrough possible, return null needed
        expect(output).toContain("return null;");
    });

    test('async method with if/else-if/else all returning does not add return null', () => {
        const input =
        "class T {\n" +
        "    async fetchOHLCV(uta: boolean, market: any): Promise<any> {\n" +
        "        if (uta) {\n" +
        "            return await this.fetchUTAOHLCV();\n" +
        "        } else if (market['contract']) {\n" +
        "            return await this.fetchContractOHLCV();\n" +
        "        } else {\n" +
        "            return await this.fetchSpotOHLCV();\n" +
        "        }\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        const returnNullCount = output.split('\n').filter(l => l.trim() === 'return null;').length;
        expect(returnNullCount).toBe(0);
    });

    test('async method with deeply nested if/else-if/else-if/else all returning does not add return null', () => {
        const input =
        "class T {\n" +
        "    async fetch(x: number): Promise<string> {\n" +
        "        if (x === 1) {\n" +
        "            return \"a\";\n" +
        "        } else if (x === 2) {\n" +
        "            return \"b\";\n" +
        "        } else if (x === 3) {\n" +
        "            return \"c\";\n" +
        "        } else {\n" +
        "            return \"d\";\n" +
        "        }\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        const returnNullCount = output.split('\n').filter(l => l.trim() === 'return null;').length;
        expect(returnNullCount).toBe(0);
    });

    test('async method with if/else-if/else where middle branch missing return still works', () => {
        const input =
        "class T {\n" +
        "    async fetch(x: number): Promise<any> {\n" +
        "        if (x === 1) {\n" +
        "            return \"a\";\n" +
        "        } else if (x === 2) {\n" +
        "            const y = x;\n" +
        "        } else {\n" +
        "            return \"c\";\n" +
        "        }\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        // middle branch doesn't return, so return null is needed
        expect(output).toContain("return null;");
    });

    test('async method with if/else where both throw does not add return null', () => {
        const input =
        "class T {\n" +
        "    async fetchData(condition: boolean): Promise<string> {\n" +
        "        if (condition) {\n" +
        "            throw new Error(\"a\");\n" +
        "        } else {\n" +
        "            throw new Error(\"b\");\n" +
        "        }\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        const returnNullCount = output.split('\n').filter(l => l.trim() === 'return null;').length;
        expect(returnNullCount).toBe(0);
    });

    test('async method with if (no else) still adds return null', () => {
        const input =
        "class T {\n" +
        "    async fetchData(condition: boolean): Promise<string> {\n" +
        "        if (condition) {\n" +
        "            return \"a\";\n" +
        "        }\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("return null;");
    });

    test('async method with multi-statement if/else both ending in return does not add return null', () => {
        const input =
        "class T {\n" +
        "    async fetchData(condition: boolean): Promise<any> {\n" +
        "        if (condition) {\n" +
        "            const response = await this.publicGetFoo();\n" +
        "            const data = this.safeDict(response, 'data', {});\n" +
        "            return this.parseTicker(data);\n" +
        "        } else {\n" +
        "            const response = await this.publicGetBar();\n" +
        "            const data = this.safeDict(response, 'data', {});\n" +
        "            return this.parseSpotTicker(data);\n" +
        "        }\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        const returnNullCount = output.split('\n').filter(l => l.trim() === 'return null;').length;
        expect(returnNullCount).toBe(0);
    });

    test('async method ending with assignment still adds return null', () => {
        const input =
        "class T {\n" +
        "    async process(x: any): Promise<void> {\n" +
        "        const result = await this.fetch(x);\n" +
        "        this.data = result;\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("return null;");
    });

    test('async method ending with function call still adds return null', () => {
        const input =
        "class T {\n" +
        "    async process(x: any): Promise<void> {\n" +
        "        await this.doSomething(x);\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("return null;");
    });

    test('async method ending with for loop still adds return null', () => {
        const input =
        "class T {\n" +
        "    async process(items: any[]): Promise<void> {\n" +
        "        for (let i = 0; i < items.length; i++) {\n" +
        "            await this.handle(items[i]);\n" +
        "        }\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("return null;");
    });

    test('basic while loop', () => {
        const input =
        "while (true) {\n" +
        "    const x = 1;\n" +
        "    break;\n" +
        "}"
        const expected =
        "while (true)\n{\n" +
        "    Object x = 1;\n" +
        "    break;\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toBe(expected);
    });

    // --- Bug 2: duplicate final variable declarations ---

    test('same reassigned variable in two variable-declaration object literals does not produce duplicate final', () => {
        const input =
        "class T {\n" +
        "    test() {\n" +
        "        let x = 'a';\n" +
        "        x = 'b';\n" +
        "        const obj1 = { 'key': x };\n" +
        "        const obj2 = { 'key': x };\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        // final Object finalX = x; should appear exactly once
        const finalCount = (output.match(/final Object finalX = x;/g) || []).length;
        expect(finalCount).toBe(1);
        // both put() calls should use finalX
        const putMatches = output.match(/put\(\s*"key",\s*(\w+)\s*\)/g) || [];
        expect(putMatches.length).toBe(2);
        putMatches.forEach(m => expect(m).toContain('finalX'));
    });

    test('same reassigned variable in two expression-statement object literals does not produce duplicate final', () => {
        const input =
        "class T {\n" +
        "    test() {\n" +
        "        let x = 'a';\n" +
        "        x = 'b';\n" +
        "        this.method1({ 'key': x });\n" +
        "        this.method2({ 'key': x });\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        const finalCount = (output.match(/final Object finalX = x;/g) || []).length;
        expect(finalCount).toBe(1);
        // both put() calls should use finalX, not bare x
        const putMatches = output.match(/put\(\s*"key",\s*(\w+)\s*\)/g) || [];
        expect(putMatches.length).toBe(2);
        putMatches.forEach(m => expect(m).toContain('finalX'));
    });

    test('same reassigned variable in two element-access assignments does not produce duplicate final', () => {
        const input =
        "class T {\n" +
        "    test() {\n" +
        "        let x = 'a';\n" +
        "        x = 'b';\n" +
        "        let result = {};\n" +
        "        result['a'] = this.method({ 'key': x });\n" +
        "        result['b'] = this.method({ 'key': x });\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        const finalCount = (output.match(/final Object finalX = x;/g) || []).length;
        expect(finalCount).toBe(1);
    });

    test('same reassigned variable in variable-decl then return does not produce duplicate final', () => {
        const input =
        "class T {\n" +
        "    test() {\n" +
        "        let x = 'a';\n" +
        "        x = 'b';\n" +
        "        const obj1 = { 'key': x };\n" +
        "        return this.method({ 'key': x });\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        const finalCount = (output.match(/final Object finalX = x;/g) || []).length;
        expect(finalCount).toBe(1);
    });

    // --- Bug 1: final var detection in nested call arguments ---

    test('reassigned variable in object literal inside method call gets final wrapper', () => {
        const input =
        "class T {\n" +
        "    test() {\n" +
        "        let x = 'a';\n" +
        "        x = 'b';\n" +
        "        this.method({ 'key': x });\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain('final Object finalX = x;');
        expect(output).toContain('finalX');
        // the put() inside HashMap should use finalX, not x
        expect(output).toMatch(/put\(\s*"key",\s*finalX\s*\)/);
    });

    test('reassigned variable used as value in object literal inside nested call args', () => {
        const input =
        "class T {\n" +
        "    test() {\n" +
        "        let x = 'a';\n" +
        "        x = 'b';\n" +
        "        this.method1(this.method2({ 'key': x }));\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain('final Object finalX = x;');
        expect(output).toMatch(/put\(\s*"key",\s*finalX\s*\)/);
    });

    test('reassigned variable in object literal in element access assignment with nested call', () => {
        const input =
        "class T {\n" +
        "    test() {\n" +
        "        let code = 'a';\n" +
        "        code = this.getCode();\n" +
        "        let isUSDC = false;\n" +
        "        isUSDC = true;\n" +
        "        let result = {};\n" +
        "        result[code] = this.safeCurrencyStructure({ 'deposit': isUSDC });\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain('final Object finalIsUSDC = isUSDC;');
        expect(output).toMatch(/put\(\s*"deposit",\s*finalIsUSDC\s*\)/);
    });

    test('reassigned variable in return with call expression wrapping object literal', () => {
        const input =
        "class T {\n" +
        "    test() {\n" +
        "        let x = 'a';\n" +
        "        x = 'b';\n" +
        "        return this.method({ 'key': x });\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain('final Object finalX = x;');
        expect(output).toMatch(/put\(\s*"key",\s*finalX\s*\)/);
    });

    test('multiple different reassigned variables in same object literal all get final wrappers', () => {
        const input =
        "class T {\n" +
        "    test() {\n" +
        "        let a = 1;\n" +
        "        a = 2;\n" +
        "        let b = 3;\n" +
        "        b = 4;\n" +
        "        const obj = { 'x': a, 'y': b };\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain('final Object finalA = a;');
        expect(output).toContain('final Object finalB = b;');
        expect(output).toMatch(/put\(\s*"x",\s*finalA\s*\)/);
        expect(output).toMatch(/put\(\s*"y",\s*finalB\s*\)/);
    });

    // --- Regression: sequential transpileJava calls must not leak state ---

    test('sequential transpileJava calls do not leak final var state between files', () => {
        // First call — populates ReassignedVars and varListFromObjectLiterals caches
        const input1 =
        "class E1 {\n" +
        "    fetch() {\n" +
        "        let m = 'a';\n" +
        "        m = 'b';\n" +
        "        const r = { 'k': m };\n" +
        "    }\n" +
        "}"
        const out1 = transpiler.transpileJava(input1).content;
        expect(out1).toContain('final Object finalM = m;');
        expect(out1).toMatch(/put\(\s*"k",\s*finalM\s*\)/);

        // Second call — same structure, different class. Must still work.
        const input2 =
        "class E2 {\n" +
        "    fetch() {\n" +
        "        let m = 'a';\n" +
        "        m = 'b';\n" +
        "        const r = { 'k': m };\n" +
        "    }\n" +
        "}"
        const out2 = transpiler.transpileJava(input2).content;
        expect(out2).toContain('final Object finalM = m;');
        expect(out2).toMatch(/put\(\s*"k",\s*finalM\s*\)/);
    });

    test('duplicate final var across methods in same class — each method gets its own declaration', () => {
        const input =
        "class Exchange {\n" +
        "    method1() {\n" +
        "        let x = 'a';\n" +
        "        x = 'b';\n" +
        "        return { 'key': x };\n" +
        "    }\n" +
        "    method2() {\n" +
        "        let x = 'c';\n" +
        "        x = 'd';\n" +
        "        return { 'key': x };\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        // Each method should have its own final declaration
        const declCount = (output.match(/final Object finalX = x;/g) || []).length;
        expect(declCount).toBe(2);
    });

    test('reassigned var in element-access with duplicate calls emits declaration once and both puts use finalXxx', () => {
        const input =
        "class Exchange {\n" +
        "    fetchBalance() {\n" +
        "        let code = 'BTC';\n" +
        "        code = this.safeCurrencyCode('BTC');\n" +
        "        let result = {};\n" +
        "        result['BTC'] = this.safeBalance({ 'currency': code });\n" +
        "        result['ETH'] = this.safeBalance({ 'currency': code });\n" +
        "        return result;\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        const declCount = (output.match(/final Object finalCode = code;/g) || []).length;
        expect(declCount).toBe(1);
        const putMatches = output.match(/put\(\s*"currency",\s*(\w+)\s*\)/g) || [];
        expect(putMatches.length).toBe(2);
        putMatches.forEach(m => expect(m).toContain('finalCode'));
    });

    // --- Bug: finalXxx declared inside if-block but referenced outside it ---

    test('finalXxx anchored at each usage site when used in multiple scopes', () => {
        // Each usage gets its own anchored declaration. Declarations live in the
        // narrowest scope that contains the usage so that nested-block
        // reassignments cannot be hoisted past (correctness over minimization).
        const input =
        "class T {\n" +
        "    safeMarket(marketId) {\n" +
        "        marketId = this.normalize(marketId);\n" +
        "        const market = this.findMarket(marketId);\n" +
        "        if (market !== undefined) {\n" +
        "            const result = {\n" +
        "                'symbol': marketId,\n" +
        "            };\n" +
        "            return result;\n" +
        "        }\n" +
        "        return {\n" +
        "            'symbol': marketId,\n" +
        "        };\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        // Two usage sites in distinct scopes → two anchored declarations. The
        // analyzer's per-block version bump gives each region a distinct name
        // (finalMarketId inside the if, finalMarketId_2 after the if) so the
        // ancestor-scope dedup can never suppress the outer declaration.
        expect((output.match(/final Object finalMarketId\w* = marketId;/g) || []).length).toBe(2);
        // each put() must reference a declared finalMarketId variant
        const putMatches = output.match(/put\(\s*"symbol",\s*(\w+)\s*\)/g) || [];
        expect(putMatches.length).toBe(2);
        putMatches.forEach(m => expect(m).toMatch(/finalMarketId\w*/));
        // every finalXxx reference has a matching declaration (no cannot-find-symbol)
        const allRefs = [...output.matchAll(/\b(final[A-Z]\w+)\b/g)].map(m => m[1]);
        const allDecls = new Set([...output.matchAll(/final Object (final\w+)\s*=/g)].map(m => m[1]));
        const undeclared = [...new Set(allRefs)].filter(r => !allDecls.has(r));
        expect(undeclared).toEqual([]);
    });

    test('finalXxx in if/else branches — each branch gets its own anchored declaration', () => {
        const input =
        "class T {\n" +
        "    fetch(code) {\n" +
        "        code = this.normalize(code);\n" +
        "        if (code === 'BTC') {\n" +
        "            return { 'currency': code };\n" +
        "        } else {\n" +
        "            return { 'currency': code };\n" +
        "        }\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        // Each sibling branch declares its own snapshot with a distinct version-suffixed
        // name (finalCode in then, finalCode_2 in else). This avoids any conflict with
        // ancestor-scope dedup if scope tracking ever leaks. Each literal references its
        // branch's own snapshot.
        expect(output).toMatch(/final Object finalCode = code;/);
        expect(output).toMatch(/final Object finalCode_2 = code;/);
        const allRefs = [...output.matchAll(/\b(final[A-Z]\w+)\b/g)].map(m => m[1]);
        const allDecls = new Set([...output.matchAll(/final Object (final\w+)\s*=/g)].map(m => m[1]));
        const undeclared = [...new Set(allRefs)].filter(r => !allDecls.has(r));
        expect(undeclared).toEqual([]);
    });

    test('finalXxx in for-loop body and after loop — anchored at each usage', () => {
        const input =
        "class T {\n" +
        "    process(data) {\n" +
        "        let code = 'BTC';\n" +
        "        code = this.normalize(code);\n" +
        "        for (let i = 0; i < data.length; i++) {\n" +
        "            const entry = { 'currency': code };\n" +
        "        }\n" +
        "        return { 'currency': code };\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        // One declaration inside the loop body, one before the return statement
        const declCount = (output.match(/final Object finalCode = code;/g) || []).length;
        expect(declCount).toBe(2);
        const decls = [...output.matchAll(/final Object finalCode = code;/g)].map(m => m.index!);
        const forPos = output.indexOf('for (');
        const returnPos = output.lastIndexOf('return');
        // first decl inside the loop, second before the return
        expect(decls[0]).toBeGreaterThan(forPos);
        expect(decls[1]).toBeLessThan(returnPos);
        expect(decls[1]).toBeGreaterThan(forPos);
    });

    // --- Bug: over-aggressive hoisting of loop-local variables ---

    test('loop-local variable final declaration stays inside the loop, not hoisted to method body', () => {
        const input =
        "class T {\n" +
        "    parseFees(fees) {\n" +
        "        const result = [];\n" +
        "        for (let i = 0; i < fees.length; i++) {\n" +
        "            let code = this.safeString(fees[i], 'currency');\n" +
        "            code = this.safeCurrencyCode(code);\n" +
        "            result.push({ 'code': code });\n" +
        "        }\n" +
        "        return result;\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        // finalCode declaration must exist
        expect(output).toContain('final Object finalCode = code;');
        // finalCode must be AFTER the for loop starts (inside the loop body)
        const declPos = output.indexOf('final Object finalCode = code;');
        const forPos = output.indexOf('for (');
        expect(declPos).toBeGreaterThan(forPos);
    });

    test('method-param variable gets an anchored declaration at each usage site', () => {
        const input =
        "class T {\n" +
        "    process(marketId, fees) {\n" +
        "        marketId = this.normalize(marketId);\n" +
        "        const result = [];\n" +
        "        for (let i = 0; i < fees.length; i++) {\n" +
        "            let code = this.safeString(fees[i], 'currency');\n" +
        "            code = this.safeCurrencyCode(code);\n" +
        "            result.push({ 'market': marketId, 'code': code });\n" +
        "        }\n" +
        "        return { 'market': marketId };\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        const forPos = output.indexOf('for (');
        // marketId used inside the loop and before the return — both anchored
        const marketDecls = (output.match(/final Object finalMarketId = marketId;/g) || []).length;
        expect(marketDecls).toBe(2);
        // code is loop-local → stays inside loop
        const codeDeclPos = output.indexOf('final Object finalCode = code;');
        expect(codeDeclPos).toBeGreaterThan(forPos);
    });

    test('variable declared inside if-block final decl stays inside if-block', () => {
        const input =
        "class T {\n" +
        "    fetch(condition) {\n" +
        "        if (condition) {\n" +
        "            let code = 'BTC';\n" +
        "            code = this.normalize(code);\n" +
        "            return { 'currency': code };\n" +
        "        }\n" +
        "        return {};\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        // finalCode must be inside the if block
        const declPos = output.indexOf('final Object finalCode = code;');
        const ifPos = output.indexOf('if (');
        expect(declPos).toBeGreaterThan(ifPos);
    });

    // --- Loop variable final declarations must stay inside the loop ---

    test('for-loop counter i gets finalI inside loop body, not at method level', () => {
        const input =
        "class T {\n" +
        "    test(arr) {\n" +
        "        for (let i = 0; i < arr.length; i++) {\n" +
        "            const obj = { 'index': i };\n" +
        "        }\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain('finalI');
        const declPos = output.indexOf('final Object finalI');
        const forPos = output.indexOf('for (');
        // finalI must be inside the loop body, not before the loop
        expect(declPos).toBeGreaterThan(forPos);
    });

    test('loop-local reassigned var and loop counter both stay inside loop', () => {
        const input =
        "class T {\n" +
        "    parseOrders(orders) {\n" +
        "        const result = [];\n" +
        "        for (let i = 0; i < orders.length; i++) {\n" +
        "            let deposit = this.safeValue(orders[i], 'deposit');\n" +
        "            deposit = this.parseDeposit(deposit);\n" +
        "            result.push({\n" +
        "                'index': i,\n" +
        "                'deposit': deposit,\n" +
        "            });\n" +
        "        }\n" +
        "        return result;\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        const forPos = output.indexOf('for (');
        // Both finalI and finalDeposit must be inside the loop
        const finalIPos = output.indexOf('final Object finalI');
        const finalDepositPos = output.indexOf('final Object finalDeposit');
        expect(finalIPos).toBeGreaterThan(forPos);
        expect(finalDepositPos).toBeGreaterThan(forPos);
    });

    test('method-param, loop counter and loop-local all anchor at their own usage site', () => {
        const input =
        "class T {\n" +
        "    parseOrders(orders, marketId) {\n" +
        "        marketId = this.normalize(marketId);\n" +
        "        const result = [];\n" +
        "        for (let i = 0; i < orders.length; i++) {\n" +
        "            let deposit = this.safeValue(orders[i], 'deposit');\n" +
        "            deposit = this.parseDeposit(deposit);\n" +
        "            result.push({\n" +
        "                'index': i,\n" +
        "                'deposit': deposit,\n" +
        "                'market': marketId,\n" +
        "            });\n" +
        "        }\n" +
        "        return result;\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        const forPos = output.indexOf('for (');
        // marketId is only used inside the loop → one decl, inside the loop
        const finalMarketPos = output.indexOf('final Object finalMarketId');
        expect(finalMarketPos).toBeGreaterThan(forPos);
        // i and deposit are loop-scoped → inside loop
        const finalIPos = output.indexOf('final Object finalI');
        const finalDepositPos = output.indexOf('final Object finalDeposit');
        expect(finalIPos).toBeGreaterThan(forPos);
        expect(finalDepositPos).toBeGreaterThan(forPos);
    });

    test('method-level var reused as loop counter — finalXxx stays inside loop (per-iteration capture)', () => {
        // When `let i` is declared at method level but reassigned in a for loop,
        // the final copy must be inside the loop to capture the per-iteration value
        const input =
        "class T {\n" +
        "    test(data) {\n" +
        "        let i = 0;\n" +
        "        const result = [];\n" +
        "        for (i = 0; i < data.length; i++) {\n" +
        "            result.push({ 'index': i });\n" +
        "        }\n" +
        "        return result;\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        const forPos = output.indexOf('for (');
        const finalIPos = output.indexOf('final Object finalI');
        // Even though i is declared at method level, its final copy must be inside
        // the loop so it captures the current iteration value, not the initial value
        expect(finalIPos).toBeGreaterThan(forPos);
    });

    test('for-let loop counter with same-name method-level var (shadowing) — finalI stays inside loop', () => {
        // If method body has `let i = 0;` AND a for-loop has `for (let i = 0; ...)`,
        // the loop's i shadows the method's i. The final copy must be inside the loop.
        const input =
        "class T {\n" +
        "    test(data) {\n" +
        "        let i = 0;\n" +
        "        i = 5;\n" +
        "        const result = [];\n" +
        "        for (let i = 0; i < data.length; i++) {\n" +
        "            result.push({ 'index': i });\n" +
        "        }\n" +
        "        return result;\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        const forPos = output.indexOf('for (');
        // Use word boundary to avoid matching finalIds when looking for finalI
        const finalIMatch = output.match(/final Object finalI\b/);
        expect(finalIMatch).not.toBeNull();
        const finalIPos = output.indexOf(finalIMatch[0]);
        expect(finalIPos).toBeGreaterThan(forPos);
    });

    test('for-let loop counter used in element access ids[i] — finalIds and finalI both inside loop', () => {
        const input =
        "class T {\n" +
        "    fetchMarkets(ids) {\n" +
        "        ids = this.filterIds(ids);\n" +
        "        const result = [];\n" +
        "        for (let i = 0; i < ids.length; i++) {\n" +
        "            result.push({ 'id': ids[i], 'index': i });\n" +
        "        }\n" +
        "        return result;\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        const forPos = output.indexOf('for (');
        // Both ids and i are only used inside the loop → both anchored inside
        const finalIdsPos = output.indexOf('final Object finalIds');
        expect(finalIdsPos).toBeGreaterThan(forPos);
        const afterFor = output.substring(forPos);
        expect(afterFor).toMatch(/final Object finalI\b/);
    });

    test('two for-loops with same variable name each get their own finalI declaration', () => {
        const input =
        "class T {\n" +
        "    cancelOrders(algoIds, ids) {\n" +
        "        const request = [];\n" +
        "        for (let i = 0; i < algoIds.length; i++) {\n" +
        "            request.push({ 'algoId': algoIds[i] });\n" +
        "        }\n" +
        "        for (let i = 0; i < ids.length; i++) {\n" +
        "            request.push({ 'ordId': ids[i] });\n" +
        "        }\n" +
        "        return request;\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        // Each loop needs its own final Object finalI = i; declaration
        const declMatches = output.match(/final Object finalI\s*=\s*i;/g) || [];
        expect(declMatches.length).toBe(2);
    });

    test('two for-loops with different loop-local vars each get their own final declarations', () => {
        const input =
        "class T {\n" +
        "    parse(fees, trades) {\n" +
        "        const result = [];\n" +
        "        for (let i = 0; i < fees.length; i++) {\n" +
        "            let code = this.safeString(fees[i], 'currency');\n" +
        "            code = this.normalize(code);\n" +
        "            result.push({ 'code': code, 'id': fees[i] });\n" +
        "        }\n" +
        "        for (let i = 0; i < trades.length; i++) {\n" +
        "            let code = this.safeString(trades[i], 'currency');\n" +
        "            code = this.normalize(code);\n" +
        "            result.push({ 'code': code, 'id': trades[i] });\n" +
        "        }\n" +
        "        return result;\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        // Each loop has its own code and i — both need per-loop declarations
        const codeDecls = output.match(/final Object finalCode\s*=\s*code;/g) || [];
        expect(codeDecls.length).toBe(2);
        const iDecls = output.match(/final Object finalI\s*=\s*i;/g) || [];
        expect(iDecls.length).toBe(2);
    });

    test('three for-loops in async method with optional params — each gets its own finalI', () => {
        const input =
        "class TestExchange {\n" +
        "    async cancelOrders(ids, symbol = undefined, params = {}) {\n" +
        "        const market = { 'id': 'BTCUSDT' };\n" +
        "        const algoIds = ['algo1'];\n" +
        "        const request = [];\n" +
        "        if (algoIds !== undefined) {\n" +
        "            for (let i = 0; i < algoIds.length; i++) {\n" +
        "                request.push({\n" +
        "                    'algoId': algoIds[i],\n" +
        "                    'instId': market['id'],\n" +
        "                });\n" +
        "            }\n" +
        "        }\n" +
        "        for (let i = 0; i < ids.length; i++) {\n" +
        "            request.push({\n" +
        "                'ordId': ids[i],\n" +
        "                'instId': market['id'],\n" +
        "            });\n" +
        "        }\n" +
        "        for (let i = 0; i < ids.length; i++) {\n" +
        "            request.push({\n" +
        "                'clOrdId': ids[i],\n" +
        "                'instId': market['id'],\n" +
        "            });\n" +
        "        }\n" +
        "        return request;\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        // Each of the 3 loops needs its own finalI declaration
        const finalIDecls = output.match(/final Object finalI\s*=\s*i;/g) || [];
        expect(finalIDecls.length).toBe(3);
        // Each loop's GetValue should use finalI
        const getValueCalls = output.match(/Helpers\.GetValue\(\w+, finalI\)/g) || [];
        expect(getValueCalls.length).toBe(3);
    });

    // --- Bug: ternary/ConditionalExpression not handled for final var replacement ---

    test('reassigned variable inside ternary expression in object literal gets finalXxx', () => {
        const input =
        "class T {\n" +
        "    test(data) {\n" +
        "        const result = [];\n" +
        "        for (let i = 0; i < data.length; i++) {\n" +
        "            let type = this.safeString(data[i], 'type');\n" +
        "            type = this.normalize(type);\n" +
        "            result.push({\n" +
        "                'type': type,\n" +
        "                'spot': type === 'spot',\n" +
        "                'linear': (type === 'swap') ? true : undefined,\n" +
        "                'inverse': (type === 'swap') ? false : undefined,\n" +
        "            });\n" +
        "        }\n" +
        "        return result;\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        // All values referencing type must use finalType (check each put's value part)
        expect(output).toContain('put( "type", finalType )');
        expect(output).toContain('Helpers.isEqual(finalType, "spot")');
        // finalType must appear in ternary expressions too (not raw 'type')
        expect(output).toMatch(/Helpers\.isEqual\(finalType, "swap"\).*\? true/);
        expect(output).toMatch(/Helpers\.isEqual\(finalType, "swap"\).*\? false/);
    });

    // --- Bug: PrefixUnaryExpression not handled for final var replacement ---

    test('reassigned variable inside prefix unary expression in object literal gets finalXxx', () => {
        const input =
        "class T {\n" +
        "    demo(x) {\n" +
        "        let isSpot = true;\n" +
        "        if (x !== undefined) {\n" +
        "            isSpot = false;\n" +
        "        }\n" +
        "        return {\n" +
        "            'spot': isSpot,\n" +
        "            'type': isSpot ? 'spot' : 'swap',\n" +
        "            'swap': !isSpot,\n" +
        "            'contract': !isSpot,\n" +
        "        };\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain('final Object finalIsSpot = isSpot;');
        // The !isSpot values must reference finalIsSpot, not raw isSpot
        expect(output).toMatch(/put\(\s*"swap",\s*!Helpers\.isTrue\(finalIsSpot\)\s*\)/);
        expect(output).toMatch(/put\(\s*"contract",\s*!Helpers\.isTrue\(finalIsSpot\)\s*\)/);
        // No put value should reference raw isSpot
        expect(output).not.toMatch(/put\(\s*"[^"]+",[^)]*\bisSpot\b/);
    });

    test('nested ternary with reassigned variable', () => {
        const input =
        "class T {\n" +
        "    test() {\n" +
        "        let x = 'a';\n" +
        "        x = 'b';\n" +
        "        const obj = { 'v': x ? (x === 'a' ? 1 : 2) : 0 };\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain('final Object finalX = x;');
        // no raw x should appear inside the HashMap put values
        expect(output).not.toMatch(/put\(\s*"v",.*\bx\b/);
    });

    // --- Bug: hoisted final var captured pre-reassignment value (bybit.setMarginMode) ---

    test('final var declaration lands AFTER nested-block reassignment, not before it', () => {
        const input =
        "class T {\n" +
        "    fn(marginMode) {\n" +
        "        const isUnifiedAccount = true;\n" +
        "        if (isUnifiedAccount) {\n" +
        "            if (marginMode === 'isolated') {\n" +
        "                marginMode = 'ISOLATED_MARGIN';\n" +
        "            } else if (marginMode === 'cross') {\n" +
        "                marginMode = 'REGULAR_MARGIN';\n" +
        "            }\n" +
        "            const request = { 'setMarginMode': marginMode };\n" +
        "            return request;\n" +
        "        }\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        const finalDeclIdx = output.indexOf('final Object finalMarginMode = marginMode;');
        const firstReassignIdx = output.indexOf('marginMode = "ISOLATED_MARGIN"');
        const secondReassignIdx = output.indexOf('marginMode = "REGULAR_MARGIN"');
        expect(finalDeclIdx).toBeGreaterThan(-1);
        expect(firstReassignIdx).toBeGreaterThan(-1);
        expect(secondReassignIdx).toBeGreaterThan(-1);
        expect(finalDeclIdx).toBeGreaterThan(firstReassignIdx);
        expect(finalDeclIdx).toBeGreaterThan(secondReassignIdx);
        expect(output).toMatch(/put\(\s*"setMarginMode",\s*finalMarginMode\s*\)/);
    });

    test('pathological: reassignment between two usages in same block uses distinct finals', () => {
        const input =
        "class T {\n" +
        "    fn() {\n" +
        "        let x = 'a';\n" +
        "        x = 'b';\n" +
        "        const a = { 'v': x };\n" +
        "        x = 'c';\n" +
        "        const b = { 'v': x };\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        // Two distinct final snapshots (different suffixes) — one per version
        const finalDecls = output.match(/final Object final\w+ = x;/g) || [];
        expect(finalDecls.length).toBe(2);
        const uniqueNames = new Set(finalDecls);
        expect(uniqueNames.size).toBe(2);
        // Each put must reference a final name, not raw x
        const putMatches = output.match(/put\(\s*"v",\s*(\w+)\s*\)/g) || [];
        expect(putMatches.length).toBe(2);
        putMatches.forEach(m => expect(m).not.toMatch(/\bx\s*\)/));
        // First decl must be between first reassignment and first usage; second decl between second reassignment and second usage
        const firstReassignIdx = output.indexOf('x = "b"');
        const secondReassignIdx = output.indexOf('x = "c"');
        const firstPutIdx = output.indexOf('put( "v",');
        const secondPutIdx = output.indexOf('put( "v",', firstPutIdx + 1);
        const firstDeclIdx = output.indexOf('final Object final');
        const secondDeclIdx = output.indexOf('final Object final', firstDeclIdx + 1);
        expect(firstDeclIdx).toBeGreaterThan(firstReassignIdx);
        expect(firstDeclIdx).toBeLessThan(firstPutIdx);
        expect(secondDeclIdx).toBeGreaterThan(secondReassignIdx);
        expect(secondDeclIdx).toBeLessThan(secondPutIdx);
    });

    test('reserved-keyword name (params/internal) — RHS uses the remapped Java identifier', () => {
        // `params` is a reserved keyword in Java and is remapped to `parameters`.
        // The final-var RHS must reference the remapped name, not the raw TS name.
        const input =
        "class T {\n" +
        "    fetch(params) {\n" +
        "        params = this.normalize(params);\n" +
        "        return { 'p': params };\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        // LHS is finalParameters, RHS must be parameters (not raw `params`)
        expect(output).toContain('final Object finalParameters = parameters;');
        // must NOT emit the raw TS name on the RHS
        expect(output).not.toMatch(/final Object finalParameters\s*=\s*params\s*;/);
    });

    // Bug shape: forward-reference reassignment. The object literal uses a
    // parameter/variable BEFORE it is reassigned later in the same function
    // body. analyzeFinalVars pre-walks and correctly flags the var, but
    // getVarListFromObjectLiteralAndUpdateInPlace used to consult only
    // ReassignedVars (which is populated as BinaryExpressions are printed),
    // so at print time the flag was still false → finalXxx shadow skipped
    // → Java compile failed: "local variables referenced from an inner
    // class must be final or effectively final".
    //
    // Mirrors the ccxt blofin createTpslOrderRequest regression: a request
    // object literal captures `params`, then several lines later the
    // function does `params = this.omit(params, [...])`.
    test('object literal: identifier is reassigned AFTER the literal (forward reference) — still emits final shadow', () => {
        const fresh = new Transpiler();
        const input =
        "class T {\n" +
        "    createTpslOrderRequest(params: any) {\n" +
        "        const request = {\n" +
        "            'reduceOnly': this.safeBool(params, 'reduceOnly', true),\n" +
        "        };\n" +
        "        params = this.omit(params, ['stopLossPrice']);\n" +
        "        return this.extend(request, params);\n" +
        "    }\n" +
        "    safeBool(p: any, k: string, d: boolean) { return d; }\n" +
        "    omit(p: any, k: any) { return p; }\n" +
        "    extend(a: any, b: any) { return a; }\n" +
        "}";
        const output = fresh.transpileJava(input).content;
        // The final shadow must be emitted for the forward-referenced parameter.
        // `params` is a Java reserved keyword → remapped to `parameters`.
        expect(output).toContain('final Object finalParameters = parameters;');
        // The inner-class put() must reference finalParameters, not raw parameters.
        expect(output).toMatch(/put\(\s*"reduceOnly",[^)]*\bfinalParameters\b/);
        // And must NOT reference raw `parameters` inside the inner-class put()
        // (which would fail effectively-final since parameters is reassigned later).
        expect(output).not.toMatch(/put\(\s*"reduceOnly",[^)]*safeBool\(\s*parameters\b/);
    });

    test('object literal: non-reserved identifier reassigned AFTER the literal still emits final shadow', () => {
        // Same bug shape but with a plain identifier (no reserved-keyword remap)
        // so the assertion is unambiguous about which name is finalised.
        const fresh = new Transpiler();
        const input =
        "class T {\n" +
        "    demo(config: any) {\n" +
        "        const request = { 'cfg': this.wrap(config) };\n" +
        "        config = this.normalize(config);\n" +
        "        return this.extend(request, config);\n" +
        "    }\n" +
        "    wrap(p: any) { return p; }\n" +
        "    normalize(p: any) { return p; }\n" +
        "    extend(a: any, b: any) { return a; }\n" +
        "}";
        const output = fresh.transpileJava(input).content;
        expect(output).toContain('final Object finalConfig = config;');
        expect(output).toMatch(/put\(\s*"cfg",[^)]*\bfinalConfig\b/);
        expect(output).not.toMatch(/put\(\s*"cfg",[^)]*wrap\(\s*config\s*\)/);
    });

    // Ordering and scope of the rewrite for the forward-reference case.
    // The final snapshot must sit BEFORE the object literal (so the literal
    // can close over it as an effectively-final variable), and uses outside
    // the literal — both the later reassignment LHS and the post-literal
    // return — must still reference the raw (mutable) name.
    test('object literal: forward-reference final-snapshot precedes the literal; uses outside the literal stay raw', () => {
        const fresh = new Transpiler();
        const input =
        "class T {\n" +
        "    createTpslOrderRequest(params: any) {\n" +
        "        const request = {\n" +
        "            'reduceOnly': this.safeBool(params, 'reduceOnly', true),\n" +
        "        };\n" +
        "        params = this.omit(params, ['stopLossPrice']);\n" +
        "        return this.extend(request, params);\n" +
        "    }\n" +
        "    safeBool(p: any, k: string, d: boolean) { return d; }\n" +
        "    omit(p: any, k: any) { return p; }\n" +
        "    extend(a: any, b: any) { return a; }\n" +
        "}";
        const output = fresh.transpileJava(input).content;

        const declIdx = output.indexOf('final Object finalParameters = parameters;');
        const literalIdx = output.indexOf('new java.util.HashMap');
        const reassignIdx = output.indexOf('parameters = this.omit(');
        const returnIdx = output.indexOf('return this.extend(');

        expect(declIdx).toBeGreaterThanOrEqual(0);
        expect(literalIdx).toBeGreaterThanOrEqual(0);
        expect(reassignIdx).toBeGreaterThanOrEqual(0);
        expect(returnIdx).toBeGreaterThanOrEqual(0);

        // Snapshot comes BEFORE the literal so the inner class can capture it.
        expect(declIdx).toBeLessThan(literalIdx);
        // And BEFORE the reassignment so the snapshot captures the pre-reassign value.
        expect(declIdx).toBeLessThan(reassignIdx);
        // Literal appears before the later reassignment (this is the forward-ref shape).
        expect(literalIdx).toBeLessThan(reassignIdx);

        // Statements OUTSIDE the literal must keep the raw name, not finalParameters.
        expect(output).toMatch(/parameters\s*=\s*this\.omit\(\s*parameters\s*,/);
        expect(output).not.toMatch(/finalParameters\s*=\s*this\.omit/);
        expect(output).toMatch(/return this\.extend\(\s*request\s*,\s*parameters\s*\)/);
        expect(output).not.toMatch(/return this\.extend\(\s*request\s*,\s*finalParameters\s*\)/);
    });

    // Symmetric counterpart to the existing "postfix unary on reassigned
    // counter" test (which reassigns BEFORE the literal via `i = 1`). Here
    // the inc happens AFTER the literal — exercises the forward-reference
    // path for PostfixUnaryExpression specifically.
    test('object literal: postfix increment AFTER the literal (forward reference) gets finalized', () => {
        const fresh = new Transpiler();
        const input =
        "class T {\n" +
        "    demo() {\n" +
        "        let i = 0;\n" +
        "        const a = { 'q': i };\n" +
        "        i++;\n" +
        "        return a;\n" +
        "    }\n" +
        "}";
        const output = fresh.transpileJava(input).content;
        expect(output).toContain('final Object finalI = i;');
        expect(output).toMatch(/put\(\s*"q",\s*finalI\s*\)/);
        expect(output).not.toMatch(/put\(\s*"q",\s*i\s*\)/);
    });

    // --- Object-literal substitution coverage gaps ---
    // The anonymous inner-class HashMap requires every captured variable to be
    // effectively final. Each of these expression shapes used to leave the
    // reassigned identifier raw inside the inner class, producing invalid Java.

    test('object literal: postfix unary on reassigned counter gets finalized', () => {
        const input =
        "class T {\n" +
        "    demo() {\n" +
        "        let i = 0;\n" +
        "        i = 1;\n" +
        "        const a = { 'q': i++ };\n" +
        "        return a;\n" +
        "    }\n" +
        "}";
        const output = transpiler.transpileJava(input).content;
        // The inner-class put must reference finalI, not raw i++ (which mutates a captured var).
        expect(output).toContain('final Object finalI = i;');
        // The inner class must not reference bare i in any capacity (would fail effectively-final).
        expect(output).not.toMatch(/put\(\s*"q",\s*i\+\+\s*\)/);
        expect(output).not.toMatch(/put\(\s*"q",[^)]*\bi\b(?!nal)/);
    });

    test('object literal: ElementAccessExpression inside a call argument substitutes the index', () => {
        const input =
        "class T {\n" +
        "    demo(arr: any[]) {\n" +
        "        let i = 0;\n" +
        "        i = 1;\n" +
        "        const a = { 'p': this.unwrap(arr[i]) };\n" +
        "        return a;\n" +
        "    }\n" +
        "    unwrap(x: any) { return x; }\n" +
        "}";
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain('final Object finalI = i;');
        // The index inside the inner-class put must read finalI, not raw i.
        expect(output).toMatch(/put\(\s*"p",[^)]*\bfinalI\b/);
        expect(output).not.toMatch(/put\(\s*"p",[^)]*GetValue\(\s*arr,\s*i\s*\)/);
    });

    test('object literal: nested object literal inside a ternary branch substitutes inner identifiers', () => {
        const input =
        "class T {\n" +
        "    demo() {\n" +
        "        let a = 1;\n" +
        "        a = 2;\n" +
        "        const o = { 'p': (a > 0) ? { 'q': a } : undefined };\n" +
        "        return o;\n" +
        "    }\n" +
        "}";
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain('final Object finalA = a;');
        // The inner literal's `q` value must use finalA, not raw a.
        expect(output).toMatch(/put\(\s*"q",\s*finalA\s*\)/);
        expect(output).not.toMatch(/put\(\s*"q",\s*a\s*\)/);
    });

    test('object literal: PropertyAccessExpression on reassigned receiver substitutes the receiver', () => {
        const input =
        "class T {\n" +
        "    demo() {\n" +
        "        let x: any = {};\n" +
        "        x = { a: 1 };\n" +
        "        const o = { 'p': x.a };\n" +
        "        return o;\n" +
        "    }\n" +
        "}";
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain('final Object finalX = x;');
        // The .a access inside the inner-class put must read finalX, not raw x.
        expect(output).toMatch(/put\(\s*"p",[^)]*\bfinalX\b/);
        expect(output).not.toMatch(/put\(\s*"p",\s*x\.a\s*\)/);
    });

    // Bug shape A (developer report): variable declared inside a nested block
    // and conditionally reassigned must still get a final snapshot before its
    // capture inside an object literal. Earlier versions only hoisted vars
    // declared at the top of the function body.
    test('object literal: var declared in nested block and reassigned conditionally gets final snapshot (await-wrapped call initializer)', () => {
        // The reported shape uses `const res = await this.x({...})` — the
        // initializer's top kind is AwaitExpression, not CallExpression, so
        // the old narrow branches in printVariableDeclarationList missed it.
        const fresh = new Transpiler();
        const input =
        "class T {\n" +
        "    async handleAccountIndex(params: any, methodName1: string): Promise<any> {\n" +
        "        let accountIndex = undefined;\n" +
        "        if (accountIndex === undefined) {\n" +
        "            let walletAddress = this.walletAddress;\n" +
        "            if (this.privateKey !== undefined) {\n" +
        "                walletAddress = this.deriveAddress(this.privateKey);\n" +
        "            }\n" +
        "            const res = await this.getByAddress({ 'l1_address': walletAddress });\n" +
        "            return res;\n" +
        "        }\n" +
        "        return undefined;\n" +
        "    }\n" +
        "    walletAddress: any; privateKey: any;\n" +
        "    deriveAddress(k: any) { return k; }\n" +
        "    async getByAddress(p: any) { return p; }\n" +
        "}";
        const output = fresh.transpileJava(input).content;
        expect(output).toContain('final Object finalWalletAddress = walletAddress;');
        expect(output).toMatch(/put\(\s*"l1_address",\s*finalWalletAddress\s*\)/);
        expect(output).not.toMatch(/put\(\s*"l1_address",\s*walletAddress\s*\)/);
    });

    // Extra initializer wrapping shapes where an ObjectLiteralExpression that
    // captures a reassigned var is nested under a non-CallExpression wrapper.
    // All of these previously skipped the hoist because the old branches only
    // matched ObjectLiteralExpression or CallExpression directly.
    test('object literal: initializer wrapped in ParenthesizedExpression still hoists final', () => {
        const fresh = new Transpiler();
        const input =
        "class T {\n" +
        "    demo() {\n" +
        "        let x: any = 1;\n" +
        "        x = 2;\n" +
        "        const res = (this.f({ 'k': x }));\n" +
        "        return res;\n" +
        "    }\n" +
        "    f(p: any) { return p; }\n" +
        "}";
        const output = fresh.transpileJava(input).content;
        expect(output).toContain('final Object finalX = x;');
        expect(output).toMatch(/put\(\s*"k",\s*finalX\s*\)/);
    });

    test('object literal: initializer wrapped in AwaitExpression+ObjectLiteral hoists final', () => {
        const fresh = new Transpiler();
        const input =
        "class T {\n" +
        "    async demo() {\n" +
        "        let x: any = 1;\n" +
        "        x = 2;\n" +
        "        const res = await this.f({ 'k': x });\n" +
        "        return res;\n" +
        "    }\n" +
        "    async f(p: any) { return p; }\n" +
        "}";
        const output = fresh.transpileJava(input).content;
        expect(output).toContain('final Object finalX = x;');
        expect(output).toMatch(/put\(\s*"k",\s*finalX\s*\)/);
    });

    test('object literal: initializer is ternary containing an ObjectLiteral branch', () => {
        const fresh = new Transpiler();
        const input =
        "class T {\n" +
        "    demo() {\n" +
        "        let x: any = 1;\n" +
        "        x = 2;\n" +
        "        const res = (x > 0) ? { 'k': x } : undefined;\n" +
        "        return res;\n" +
        "    }\n" +
        "}";
        const output = fresh.transpileJava(input).content;
        expect(output).toContain('final Object finalX = x;');
        expect(output).toMatch(/put\(\s*"k",\s*finalX\s*\)/);
    });

    // Bug shape B (developer report): identifiers inside sub-expressions
    // (BinaryExpression, ParenthesizedExpression, etc.) used as property values
    // must also be remapped to the finalXxx name. Earlier versions only
    // remapped top-level Identifier property values, leaving the binary
    // expression's left side referencing the raw (non-final) name.
    test('object literal: identifier nested in BinaryExpression property value is remapped to finalXxx', () => {
        const fresh = new Transpiler();
        const input =
        "class T {\n" +
        "    async parsePosition(marginModeId: number): Promise<any> {\n" +
        "        let marginMode = undefined;\n" +
        "        if (marginModeId !== undefined) {\n" +
        "            marginMode = (marginModeId === 0) ? 'cross' : 'isolated';\n" +
        "        }\n" +
        "        return this.safePosition({\n" +
        "            'isolated': (marginMode === 'isolated'),\n" +
        "            'marginMode': marginMode,\n" +
        "        });\n" +
        "    }\n" +
        "    safePosition(p: any) { return p; }\n" +
        "}";
        const output = fresh.transpileJava(input).content;
        expect(output).toContain('final Object finalMarginMode = marginMode;');
        // Plain-identifier property value: remapped.
        expect(output).toMatch(/put\(\s*"marginMode",\s*finalMarginMode\s*\)/);
        // Identifier nested inside a BinaryExpression must also be remapped.
        expect(output).toMatch(/put\(\s*"isolated",[^)]*\bfinalMarginMode\b[^)]*\)/);
        expect(output).not.toMatch(/Helpers\.isEqual\(\s*marginMode\b/);
    });

    // --- Async method param wrapper: keyword-remapped names must round-trip ---
    // The async-method wrapper hoists each reassigned param into a final snapshot
    // outside the supplyAsync lambda and re-binds the original name inside it.
    // For keyword-remapped params (e.g. `params` -> `parameters`) the wrapper
    // names must be derived from the remapped Java identifier; otherwise the
    // outside snapshot RHS references an undeclared variable.

    test('async-wrapper: reassigned keyword-remapped param (params) — sig/snap/local round-trip on `parameters`', () => {
        // Use a fresh transpiler to avoid cross-call ReassignedVars leakage
        const fresh = new Transpiler();
        const input =
        "class T {\n" +
        "  async handleAccountIndex(params: object, methodName1: string): Promise<any> {\n" +
        "    let accountIndex = undefined;\n" +
        "    [accountIndex, params] = this.handleOptionAndParams2(params, methodName1);\n" +
        "    return accountIndex;\n" +
        "  }\n" +
        "  handleOptionAndParams2(p: object, m: string) { return [1, p]; }\n" +
        "}";
        const output = fresh.transpileJava(input).content;
        // Signature: param is remapped + suffixed (Object parameters2)
        expect(output).toMatch(/handleAccountIndex\s*\(\s*Object parameters2\b/);
        // Outside snapshot: RHS = sig name (parameters2), LHS = parameters3
        expect(output).toContain('final Object parameters3 = parameters2;');
        // Inside lambda: local rebinds the post-keyword-remap name
        expect(output).toContain('Object parameters = parameters3;');
        // Must NOT emit the broken pre-fix output (`params2`/`params3` referenced anywhere)
        expect(output).not.toMatch(/\bparams2\b/);
        expect(output).not.toMatch(/\bparams3\b/);
    });

    test('async-wrapper: reassigned non-remapped param (body) — preserves existing body2/body3 shape', () => {
        const fresh = new Transpiler();
        const input =
        "class T {\n" +
        "  async f(body: string): Promise<any> {\n" +
        "    body = 'x';\n" +
        "    return body;\n" +
        "  }\n" +
        "}";
        const output = fresh.transpileJava(input).content;
        expect(output).toMatch(/f\s*\(\s*Object body2\b/);
        expect(output).toContain('final Object body3 = body2;');
        expect(output).toContain('Object body = body3;');
    });

    test('async-wrapper: other keyword-remapped params (internal, event) get correct wrappers', () => {
        const fresh = new Transpiler();
        // `internal` -> `intern`, `event` -> `eventVar`
        const input =
        "class T {\n" +
        "  async f(internal: string, event: string): Promise<any> {\n" +
        "    internal = 'x';\n" +
        "    event = 'y';\n" +
        "    return internal;\n" +
        "  }\n" +
        "}";
        const output = fresh.transpileJava(input).content;
        expect(output).toMatch(/f\s*\(\s*Object intern2,\s*Object eventVar2\b/);
        expect(output).toContain('final Object intern3 = intern2;');
        expect(output).toContain('final Object eventVar3 = eventVar2;');
        expect(output).toContain('Object intern = intern3;');
        expect(output).toContain('Object eventVar = eventVar3;');
        // Pre-fix bug would emit `internal2`/`event2` on RHS — must not appear.
        expect(output).not.toMatch(/\binternal2\b/);
        expect(output).not.toMatch(/\bevent2\b/);
    });

    test('async-wrapper: mixed remapped + non-remapped reassigned params coexist', () => {
        const fresh = new Transpiler();
        const input =
        "class T {\n" +
        "  async f(params: object, body: string): Promise<any> {\n" +
        "    params = {};\n" +
        "    body = 'x';\n" +
        "    return body;\n" +
        "  }\n" +
        "}";
        const output = fresh.transpileJava(input).content;
        expect(output).toMatch(/f\s*\(\s*Object parameters2,\s*Object body2\b/);
        expect(output).toContain('final Object parameters3 = parameters2;');
        expect(output).toContain('final Object body3 = body2;');
        expect(output).toContain('Object parameters = parameters3;');
        expect(output).toContain('Object body = body3;');
    });

    // --- Integration: realistic exchange pattern combining all features ---

    // Regression: CCXT-style WS subscribe — `return await this.watch(..., { ...rawHash... }, rawHash)`.
    // The HashMap argument capture needs an effectively-final snapshot of `rawHash`,
    // even though the return expression is wrapped in `AwaitExpression`. Pre-fix,
    // printReturnStatement only matched ObjectLiteralExpression/CallExpression/
    // ArrayLiteralExpression at the top level, so AwaitExpression-wrapped returns
    // produced raw `rawHash` inside the anon-inner-class — javac rejected it.
    test('return await call(...{literal-capturing-reassigned}, ...): per-branch final snapshot is emitted', () => {
        const fresh = new Transpiler();
        const input =
        "class T {\n" +
        "    async subscribe(symbol: string, type: string): Promise<any> {\n" +
        "        let rawHash = undefined;\n" +
        "        const messageHash = 'ticker:' + symbol;\n" +
        "        if (type === 'spot') {\n" +
        "            rawHash = 'spot/ticker:' + symbol;\n" +
        "            return await this.watch('url', messageHash, { 'op': 'subscribe', 'args': [ rawHash ] }, rawHash);\n" +
        "        } else {\n" +
        "            rawHash = 'futures/ticker:' + symbol;\n" +
        "            return await this.watch('url', messageHash, { 'op': 'subscribe', 'args': [ rawHash ] }, rawHash);\n" +
        "        }\n" +
        "    }\n" +
        "    async watch(url: string, hash: string, request: any, sub: string): Promise<any> { return [url, hash, request, sub]; }\n" +
        "}";
        const output = fresh.transpileJava(input).content;
        // The HashMap argument must read a finalRawHash variant (per-branch unique name),
        // never raw rawHash.
        expect(output).toMatch(/Arrays\.asList\(\s*finalRawHash(_\d+)?\s*\)/);
        expect(output).not.toMatch(/Arrays\.asList\(\s*rawHash\s*\)/);
        // Each branch declares its own snapshot, after the reassignment. The
        // analyzer assigns per-branch version names (finalRawHash + finalRawHash_2)
        // so sibling branches can't suppress each other via ancestor-scope dedup.
        expect((output.match(/final Object finalRawHash\w* = rawHash;/g) || []).length).toBe(2);
        // Snapshot must be in the same branch as the reassignment.
        const branchPattern =
            /rawHash = Helpers\.add\([^;]*\);\s*final Object finalRawHash\w* = rawHash;\s*return\b/g;
        expect((output.match(branchPattern) || []).length).toBe(2);
        // No method-scope snapshot before the if/else (which would capture null).
        expect(output).not.toMatch(/final Object finalRawHash\w* = rawHash;\s*if\s*\(/);
        // every finalXxx reference must have a matching declaration
        const allRefs = [...output.matchAll(/\b(final[A-Z]\w+)\b/g)].map(m => m[1]);
        const allDecls = new Set([...output.matchAll(/final Object (final\w+)\s*=/g)].map(m => m[1]));
        const undeclared = [...new Set(allRefs)].filter(r => !allDecls.has(r));
        expect(undeclared).toEqual([]);
    });

    // Regression (real CCXT bingx watchOrderBook shape): `params` is reassigned
    // via tuple-destructure (`[marketType, params] = this.handle(...)`). The
    // printer's ArrayLiteralExpression branch in printCustomBinaryExpressionIfAny
    // flags each element in ReassignedVars at emit time. Pass 1 needs to mirror
    // this so the version-bump fires; otherwise sibling if/else captures share
    // `finalParameters` and the else-branch declaration can be suppressed.
    test('object literal: tuple-destructure target captured in if/else literals — distinct per-branch snapshots', () => {
        const fresh = new Transpiler();
        const input =
        "class T {\n" +
        "    async watchOrderBook(symbol, limit = undefined, params = {}) {\n" +
        "        let marketType = undefined;\n" +
        "        [ marketType, params ] = this.handleMarketTypeAndParams('watchOrderBook', undefined, params);\n" +
        "        let subscriptionArgs = {};\n" +
        "        if (this.someFlag(symbol)) {\n" +
        "            subscriptionArgs = { 'params': params };\n" +
        "        } else {\n" +
        "            subscriptionArgs = { 'params': params };\n" +
        "        }\n" +
        "        return subscriptionArgs;\n" +
        "    }\n" +
        "    handleMarketTypeAndParams(method, market, params) { return [undefined, params]; }\n" +
        "    someFlag(s) { return true; }\n" +
        "}";
        const output = fresh.transpileJava(input).content;
        // Both branches declare their own snapshot with distinct names.
        expect(output).toMatch(/final Object finalParameters = parameters;/);
        expect(output).toMatch(/final Object finalParameters_2 = parameters;/);
        // Each literal references its branch's own snapshot.
        expect(output).toMatch(/put\(\s*"params",\s*finalParameters\s*\)/);
        expect(output).toMatch(/put\(\s*"params",\s*finalParameters_2\s*\)/);
        // No undeclared finalXxx anywhere.
        const allRefs = [...output.matchAll(/\b(final[A-Z]\w+)\b/g)].map(m => m[1]);
        const allDecls = new Set([...output.matchAll(/final Object (final\w+)\s*=/g)].map(m => m[1]));
        const undeclared = [...new Set(allRefs)].filter(r => !allDecls.has(r));
        expect(undeclared).toEqual([]);
    });

    // Coverage gap: deeply nested if/else where the inner branches and the
    // outer post-if all capture the same reassigned symbol. The version bump
    // must propagate up through nested IfStatement walks so each region gets
    // a distinct snapshot name.
    test('object literal: deeply nested if/else — each region gets a distinct snapshot', () => {
        const fresh = new Transpiler();
        const input =
        "class T {\n" +
        "    async f(type, sub) {\n" +
        "        let x = 'init';\n" +
        "        x = x + '!';\n" +
        "        if (type === 'a') {\n" +
        "            if (sub === 'x') {\n" +
        "                return { 'v': x };\n" +
        "            } else {\n" +
        "                return { 'v': x };\n" +
        "            }\n" +
        "        }\n" +
        "        return { 'v': x };\n" +
        "    }\n" +
        "}";
        const output = fresh.transpileJava(input).content;
        // Three distinct regions → three distinct snapshot names.
        const decls = [...output.matchAll(/final Object (finalX\w*) = x;/g)].map(m => m[1]);
        const unique = new Set(decls);
        expect(unique.size).toBe(3);
        expect(decls.length).toBe(3);
        // Every finalXxx reference must resolve to a declaration.
        const allRefs = [...output.matchAll(/\b(final[A-Z]\w+)\b/g)].map(m => m[1]);
        const allDecls = new Set([...output.matchAll(/final Object (final\w+)\s*=/g)].map(m => m[1]));
        const undeclared = [...new Set(allRefs)].filter(r => !allDecls.has(r));
        expect(undeclared).toEqual([]);
    });

    // Coverage gap: try/catch are sibling scopes like if/else. A captured
    // reassigned symbol in both blocks gets the same un-suffixed name without
    // intervention, leaving the catch block vulnerable to ancestor-scope dedup
    // leak in the same way as the if/else case.
    test('object literal: try/catch sibling blocks — distinct per-block snapshots', () => {
        const fresh = new Transpiler();
        const input =
        "class T {\n" +
        "    async f() {\n" +
        "        let x = '';\n" +
        "        x = x + '!';\n" +
        "        let r = undefined;\n" +
        "        try {\n" +
        "            r = { 'v': x };\n" +
        "        } catch (e) {\n" +
        "            r = { 'v': x };\n" +
        "        }\n" +
        "        return r;\n" +
        "    }\n" +
        "}";
        const output = fresh.transpileJava(input).content;
        expect(output).toMatch(/final Object finalX = x;/);
        expect(output).toMatch(/final Object finalX_2 = x;/);
        const allRefs = [...output.matchAll(/\b(final[A-Z]\w+)\b/g)].map(m => m[1]);
        const allDecls = new Set([...output.matchAll(/final Object (final\w+)\s*=/g)].map(m => m[1]));
        const undeclared = [...new Set(allRefs)].filter(r => !allDecls.has(r));
        expect(undeclared).toEqual([]);
    });

    // Ternary captures: both branches of a ConditionalExpression evaluate in
    // the parent scope, so a single snapshot at parent scope serves both. No
    // sibling-scope hazard here — just locks in the expected single-decl shape.
    test('object literal: ternary branches share parent-scope snapshot — single declaration', () => {
        const fresh = new Transpiler();
        const input =
        "class T {\n" +
        "    async f(type) {\n" +
        "        let x = '';\n" +
        "        x = x + '!';\n" +
        "        const r = (type === 'a') ? { 'v': x } : { 'v': x };\n" +
        "        return r;\n" +
        "    }\n" +
        "}";
        const output = fresh.transpileJava(input).content;
        // Both ternary branches share one snapshot at the enclosing scope.
        expect((output.match(/final Object finalX = x;/g) || []).length).toBe(1);
        expect((output.match(/put\(\s*"v",\s*finalX\s*\)/g) || []).length).toBe(2);
        const allRefs = [...output.matchAll(/\b(final[A-Z]\w+)\b/g)].map(m => m[1]);
        const allDecls = new Set([...output.matchAll(/final Object (final\w+)\s*=/g)].map(m => m[1]));
        const undeclared = [...new Set(allRefs)].filter(r => !allDecls.has(r));
        expect(undeclared).toEqual([]);
    });

    // Negative regression: a var that is truly never reassigned and only read
    // outside any BinaryExpression context must NOT get a snapshot in the
    // captured literal. Catches accidental over-eager versioning from the
    // pass-1 broadening (mirror of printCustomBinaryExpressionIfAny).
    test('object literal: truly read-only var captured in if/else — NO snapshot emitted', () => {
        const fresh = new Transpiler();
        const input =
        "class T {\n" +
        "    async f(type) {\n" +
        "        const x = 'const';\n" +
        "        let r = undefined;\n" +
        "        if (type === 'a') {\n" +
        "            r = { 'v': x };\n" +
        "        } else {\n" +
        "            r = { 'v': x };\n" +
        "        }\n" +
        "        return r;\n" +
        "    }\n" +
        "}";
        const output = fresh.transpileJava(input).content;
        // x appears only as a read inside literals; never on the left of any
        // BinaryExpression and never reassigned. No finalX snapshot expected.
        expect(output).not.toMatch(/final Object finalX\b/);
        expect(output).toMatch(/put\(\s*"v",\s*x\s*\)/);
    });

    // Regression (real CCXT bitmart authenticate shape): the var `timestamp` is
    // declared `const` (never reassigned in source) but later used as the left
    // side of a BinaryExpression (`timestamp + '#' + memo`). The printer flags
    // this in ReassignedVars mid-print, then substitutes `timestamp` → `finalTimestamp`
    // in every literal that captures it. Without analyzer awareness, both if/else
    // branches share the same `finalTimestamp` name and the consumer's scope
    // tracking can suppress the else-branch declaration.
    //
    // Pass 1 of the analyzer now mirrors the printer's heuristic: any
    // BinaryExpression with an Identifier left flags the symbol, so the version
    // bump fires for these too.
    test('object literal: var read in BinaryExpression then captured in if/else literals — distinct per-branch snapshots', () => {
        const fresh = new Transpiler();
        const input =
        "class T {\n" +
        "    async authenticate(type) {\n" +
        "        const authenticated = this.safeValue(this.client.subscriptions, 'authenticated');\n" +
        "        if (authenticated === undefined) {\n" +
        "            const timestamp = '123';\n" +
        "            const auth = timestamp + '#' + 'memo';\n" +
        "            let request = undefined;\n" +
        "            if (type === 'spot') {\n" +
        "                request = { 'args': [ this.apiKey, timestamp, auth ] };\n" +
        "            } else {\n" +
        "                request = { 'args': [ this.apiKey, timestamp, auth, 'web' ] };\n" +
        "            }\n" +
        "        }\n" +
        "    }\n" +
        "    apiKey = 'k';\n" +
        "    client = { subscriptions: {} };\n" +
        "    safeValue(o, k) { return undefined; }\n" +
        "}";
        const output = fresh.transpileJava(input).content;
        expect(output).toMatch(/final Object finalTimestamp = timestamp;/);
        expect(output).toMatch(/final Object finalTimestamp_2 = timestamp;/);
        // Each branch references its own snapshot, no cross-scope leaks.
        expect(output).toMatch(/Arrays\.asList\([^)]*finalTimestamp,[^)]*\)/);
        expect(output).toMatch(/Arrays\.asList\([^)]*finalTimestamp_2,[^)]*\)/);
        // No undeclared finalXxx anywhere.
        const allRefs = [...output.matchAll(/\b(final[A-Z]\w+)\b/g)].map(m => m[1]);
        const allDecls = new Set([...output.matchAll(/final Object (final\w+)\s*=/g)].map(m => m[1]));
        const undeclared = [...new Set(allRefs)].filter(r => !allDecls.has(r));
        expect(undeclared).toEqual([]);
    });

    // Regression (real CCXT bitmart/bingx authenticate shape with state leak):
    // a var is marked in ReassignedVars from a prior transpile (cross-call leak)
    // but is `const` in the current function body. Without analyzer awareness of
    // the leak, sibling if/else branches share the same `finalTimestamp` name,
    // and the consumer's scope-tracking suppresses the else-branch declaration.
    //
    // The analyzer now consults ReassignedVars during pass 1, so leaked-in symbols
    // also get per-branch version bumps. We simulate the leak by transpiling a
    // priming class first.
    test('object literal: nested if/else with ReassignedVars state leak — distinct per-branch snapshots', () => {
        const fresh = new Transpiler();
        // Prime ReassignedVars: T-authenticate-timestamp will get set.
        const priming =
        "class T {\n" +
        "    async authenticate(type, params = {}) {\n" +
        "        let timestamp = '0';\n" +
        "        timestamp = timestamp + '!';\n" +
        "        return timestamp;\n" +
        "    }\n" +
        "}";
        fresh.transpileJava(priming);
        // Target: same class+method shape but timestamp is now `const`.
        const target =
        "class T {\n" +
        "    async authenticate(type, params = {}) {\n" +
        "        if (true) {\n" +
        "            const timestamp = '123';\n" +
        "            const signature = 'sig';\n" +
        "            let request = null;\n" +
        "            if (type === 'spot') {\n" +
        "                request = { 'args': [ timestamp, signature ] };\n" +
        "            } else {\n" +
        "                request = { 'args': [ timestamp, signature, 'web' ] };\n" +
        "            }\n" +
        "        }\n" +
        "    }\n" +
        "}";
        const output = fresh.transpileJava(target).content;
        // Each sibling branch declares its own snapshot with a distinct name.
        expect(output).toMatch(/final Object finalTimestamp = timestamp;/);
        expect(output).toMatch(/final Object finalTimestamp_2 = timestamp;/);
        // Each literal references its branch's own snapshot — no out-of-scope refs.
        expect(output).toMatch(/Arrays\.asList\(\s*finalTimestamp,/);
        expect(output).toMatch(/Arrays\.asList\(\s*finalTimestamp_2,/);
        // No undeclared finalXxx anywhere.
        const allRefs = [...output.matchAll(/\b(final[A-Z]\w+)\b/g)].map(m => m[1]);
        const allDecls = new Set([...output.matchAll(/final Object (final\w+)\s*=/g)].map(m => m[1]));
        const undeclared = [...new Set(allRefs)].filter(r => !allDecls.has(r));
        expect(undeclared).toEqual([]);
    });

    // Regression (real CCXT parseWsTrade shape): a single if-without-else block
    // contains a HashMap literal capturing `market`; a later return-statement
    // literal also captures `market`. Pre-fix, both got the same `finalMarket`
    // name and the second emission was suppressed by ancestor-scope dedup in
    // some environments — leaving the return literal with an undeclared reference.
    // The analyzer's per-block version bump gives each region a distinct name
    // (finalMarket inside the if, finalMarket_2 after the if).
    test('object literal: if-without-else inner capture + post-if outer capture — distinct snapshots', () => {
        const fresh = new Transpiler();
        const input =
        "class T {\n" +
        "    parseWsTrade(trade, market = undefined) {\n" +
        "        market = this.safeMarket(this.safeString(trade, 'code'), market);\n" +
        "        let fee = null;\n" +
        "        const feeCost = this.safeString(trade, 'paid_fee');\n" +
        "        if (feeCost !== undefined) {\n" +
        "            fee = { 'currency': market['quote'], 'cost': feeCost };\n" +
        "        }\n" +
        "        return this.safeTrade({ 'symbol': market['symbol'], 'fee': fee });\n" +
        "    }\n" +
        "    safeMarket(a, b) { return b; }\n" +
        "    safeString(o, k) { return undefined; }\n" +
        "    safeTrade(t) { return t; }\n" +
        "}";
        const output = fresh.transpileJava(input).content;
        // Both regions declare their own snapshot with distinct names.
        expect(output).toMatch(/final Object finalMarket = market;/);
        expect(output).toMatch(/final Object finalMarket_2 = market;/);
        // The if-block literal references finalMarket; the return literal references finalMarket_2.
        expect(output).toMatch(/put\(\s*"currency",\s*Helpers\.GetValue\(finalMarket,/);
        expect(output).toMatch(/put\(\s*"symbol",\s*Helpers\.GetValue\(finalMarket_2,/);
        // No undeclared finalXxx references.
        const allRefs = [...output.matchAll(/\b(final[A-Z]\w+)\b/g)].map(m => m[1]);
        const allDecls = new Set([...output.matchAll(/final Object (final\w+)\s*=/g)].map(m => m[1]));
        const undeclared = [...new Set(allRefs)].filter(r => !allDecls.has(r));
        expect(undeclared).toEqual([]);
    });

    // Regression (real CCXT bitmart subscribe shape): the else-branch has
    // intervening statements (const speed = ..., a nested `if (speed !== undefined)`,
    // and a different prop key 'action' vs the if-branch's 'op') between the
    // reassignment and the literal. The if-branch's literal captures requestOp
    // and rawHash; the else-branch captures them again. Pre-fix output (in some
    // environments) had the else-branch reference `finalRequestOp`/`finalRawHash`
    // without declaring them, producing `cannot find symbol`. The analyzer's
    // per-branch version bump fixes this by giving sibling branches distinct
    // snapshot names.
    test('object literal: real-bitmart-shape if/else with intervening nested if — distinct per-branch snapshots', () => {
        const fresh = new Transpiler();
        const input =
        "class T {\n" +
        "    async subscribe(unifiedName, channel, symbol, type, params = {}) {\n" +
        "        const market = this.market(symbol);\n" +
        "        let request = {};\n" +
        "        let messageHash = undefined;\n" +
        "        let rawHash = undefined;\n" +
        "        const unsubscribe = this.safeBool(params, 'unsubscribe', false);\n" +
        "        let prefix = '';\n" +
        "        let requestOp = 'subscribe';\n" +
        "        if (unsubscribe) {\n" +
        "            params = this.omit(params, 'unsubscribe');\n" +
        "            prefix = 'unsubscribe::';\n" +
        "            requestOp = 'unsubscribe';\n" +
        "        }\n" +
        "        messageHash = unifiedName + '::' + symbol;\n" +
        "        if (type === 'spot') {\n" +
        "            rawHash = 'spot/' + channel + ':' + market['id'];\n" +
        "            request = { 'op': requestOp, 'args': [ rawHash ] };\n" +
        "        } else {\n" +
        "            rawHash = 'futures/' + channel + ':' + market['id'];\n" +
        "            const speed = this.safeString(params, 'speed');\n" +
        "            if (speed !== undefined) {\n" +
        "                params = this.omit(params, 'speed');\n" +
        "                messageHash += ':' + speed;\n" +
        "            }\n" +
        "            request = { 'action': requestOp, 'args': [ rawHash ] };\n" +
        "        }\n" +
        "        messageHash = prefix + messageHash;\n" +
        "        return await this.watch('url', messageHash, request, messageHash);\n" +
        "    }\n" +
        "    market(s) { return { 'id': s }; }\n" +
        "    safeBool(p, k, d) { return d; }\n" +
        "    safeString(p, k) { return undefined; }\n" +
        "    omit(p, k) { return p; }\n" +
        "    async watch(url, hash, req, sub) { return [url, hash, req, sub]; }\n" +
        "}";
        const output = fresh.transpileJava(input).content;
        // Each branch declares its own snapshot for both rawHash and requestOp.
        expect((output.match(/final Object finalRawHash\w* = rawHash;/g) || []).length).toBe(2);
        expect((output.match(/final Object finalRequestOp\w* = requestOp;/g) || []).length).toBe(2);
        // If-branch and else-branch use DIFFERENT snapshot names — both halves of
        // the version-suffix pair must be present.
        expect(output).toMatch(/final Object finalRawHash = rawHash;/);
        expect(output).toMatch(/final Object finalRawHash_2 = rawHash;/);
        expect(output).toMatch(/final Object finalRequestOp = requestOp;/);
        expect(output).toMatch(/final Object finalRequestOp_2 = requestOp;/);
        // The else-branch literal references the _2 names (the if-branch's names
        // are scoped to its block). No undeclared finalXxx anywhere.
        const allRefs = [...output.matchAll(/\b(final[A-Z]\w+)\b/g)].map(m => m[1]);
        const allDecls = new Set([...output.matchAll(/final Object (final\w+)\s*=/g)].map(m => m[1]));
        const undeclared = [...new Set(allRefs)].filter(r => !allDecls.has(r));
        expect(undeclared).toEqual([]);
        // Each finalRawHash variant declaration must be paired with a usage
        // inside an Arrays.asList (the anonymous-inner-class HashMap capture).
        expect(output).toMatch(/Arrays\.asList\(\s*finalRawHash\s*\)/);
        expect(output).toMatch(/Arrays\.asList\(\s*finalRawHash_2\s*\)/);
    });

    // Regression (user-reported reproducer): free-function shape with default-value
    // param `op = 'subscribe'`. Asserts both branches emit `final Object finalRawHash`
    // — the user's report claimed the else branch was missing its snapshot.
    test('object literal: free-function default-param subscribe shape — both branches declare', () => {
        const fresh = new Transpiler();
        const input =
        "async function subscribe (type, channel, symbol, op = 'subscribe') {\n" +
        "    let request = {};\n" +
        "    let rawHash = undefined;\n" +
        "    if (type === 'spot') {\n" +
        "        rawHash = 'spot/' + channel + ':' + symbol;\n" +
        "        request = { 'op': op, 'args': [ rawHash ] };\n" +
        "    } else {\n" +
        "        rawHash = 'futures/' + channel + ':' + symbol;\n" +
        "        request = { 'op': op, 'args': [ rawHash ] };\n" +
        "    }\n" +
        "    return request;\n" +
        "}";
        const output = fresh.transpileJava(input).content;
        // Each branch declares its own per-branch snapshot. With the analyzer's
        // sibling-branch version bump, the if-branch gets `finalRawHash` and the
        // else-branch gets `finalRawHash_2` (or similar) — distinct names per
        // branch so neither suppresses the other.
        expect((output.match(/final Object finalRawHash\w* = rawHash;/g) || []).length).toBe(2);
        // Both branches reference a finalRawHash variant; no raw rawHash leaks.
        expect((output.match(/Arrays\.asList\(\s*finalRawHash\w*\s*\)/g) || []).length).toBe(2);
        expect(output).not.toMatch(/Arrays\.asList\(\s*rawHash\s*\)/);
        // No `cannot find symbol`: every finalXxx reference has a declaration.
        const allRefs = [...output.matchAll(/\b(final[A-Z]\w+)\b/g)].map(m => m[1]);
        const allDecls = new Set([...output.matchAll(/final Object (final\w+)\s*=/g)].map(m => m[1]));
        const undeclared = [...new Set(allRefs)].filter(r => !allDecls.has(r));
        expect(undeclared).toEqual([]);
    });

    // Regression: same shape as above but with `op` actually reassigned inside the
    // function — so `op` itself enters ReassignedVars and needs a per-branch snapshot too.
    test('object literal: free-function with op reassigned + rawHash in if/else — both branches declare both', () => {
        const fresh = new Transpiler();
        const input =
        "async function subscribe (type, channel, symbol, op = 'subscribe') {\n" +
        "    op = op.toLowerCase();\n" +
        "    let request = {};\n" +
        "    let rawHash = undefined;\n" +
        "    if (type === 'spot') {\n" +
        "        rawHash = 'spot/' + channel + ':' + symbol;\n" +
        "        request = { 'op': op, 'args': [ rawHash ] };\n" +
        "    } else {\n" +
        "        rawHash = 'futures/' + channel + ':' + symbol;\n" +
        "        request = { 'op': op, 'args': [ rawHash ] };\n" +
        "    }\n" +
        "    return request;\n" +
        "}";
        const output = fresh.transpileJava(input).content;
        // Both branches declare their own snapshots for both vars (with distinct
        // version-suffixed names for the sibling branch).
        expect((output.match(/final Object finalRawHash\w* = rawHash;/g) || []).length).toBe(2);
        expect((output.match(/final Object finalOp\w* = op;/g) || []).length).toBe(2);
        const allRefs = [...output.matchAll(/\b(final[A-Z]\w+)\b/g)].map(m => m[1]);
        const allDecls = new Set([...output.matchAll(/final Object (final\w+)\s*=/g)].map(m => m[1]));
        const undeclared = [...new Set(allRefs)].filter(r => !allDecls.has(r));
        expect(undeclared).toEqual([]);
    });

    // Regression: bitmart-style subscribe helper. `rawHash` is declared with
    // `undefined`, then reassigned inside each if/else branch and immediately
    // used inside a HashMap literal in that same branch. The final-var snapshot
    // must be placed *inside* each branch, *after* the reassignment — never at
    // method scope before the if/else (which would capture null).
    test('object literal: per-branch reassignment captures branch-local snapshot, not method-scope null', () => {
        const fresh = new Transpiler();
        const input =
        "class T {\n" +
        "    async subscribe(symbol: string, op: string, kind: string): Promise<any> {\n" +
        "        let rawHash = undefined;\n" +
        "        let request = {};\n" +
        "        if (kind === 'spot') {\n" +
        "            rawHash = 'spot/ticker:' + symbol;\n" +
        "            request = { 'op': op, 'args': [ rawHash ] };\n" +
        "        } else {\n" +
        "            rawHash = 'futures/ticker:' + symbol;\n" +
        "            request = { 'op': op, 'args': [ rawHash ] };\n" +
        "        }\n" +
        "        return JSON.stringify(request);\n" +
        "    }\n" +
        "}";
        const output = fresh.transpileJava(input).content;
        // The literal must read from a finalRawHash variant, not raw rawHash.
        expect(output).toMatch(/Arrays\.asList\(\s*finalRawHash\w*\s*\)/);
        expect(output).not.toMatch(/Arrays\.asList\(\s*rawHash\s*\)/);
        // Each branch declares its own snapshot, after the reassignment, not at
        // method scope before the if. Names are per-branch unique
        // (finalRawHash + finalRawHash_2) so ancestor-scope dedup can't suppress.
        expect((output.match(/final Object finalRawHash\w* = rawHash;/g) || []).length).toBe(2);
        // The snapshot must come AFTER the corresponding reassignment in each branch.
        const branchPattern =
            /rawHash = Helpers\.add\([^;]*\);\s*final Object finalRawHash\w* = rawHash;\s*request = new java\.util\.HashMap/g;
        expect((output.match(branchPattern) || []).length).toBe(2);
        // Must NOT emit a method-scope snapshot before the if/else
        // (which the pre-fix output did, capturing the null seed value).
        expect(output).not.toMatch(/final Object finalRawHash\w* = rawHash;\s*if\s*\(/);
        // every finalXxx reference must have a matching declaration
        const allRefs = [...output.matchAll(/\b(final[A-Z]\w+)\b/g)].map(m => m[1]);
        const allDecls = new Set([...output.matchAll(/final Object (final\w+)\s*=/g)].map(m => m[1]));
        const undeclared = [...new Set(allRefs)].filter(r => !allDecls.has(r));
        expect(undeclared).toEqual([]);
    });

    // --- Helpers.* indirection for Object.keys / Object.values / Array.isArray ---
    //
    // The Java emit routes most TS built-ins through a consumer-provided `Helpers`
    // class (Helpers.add, Helpers.isEqual, Helpers.GetValue, Helpers.json, ...).
    // Object.keys/values and Array.isArray were the outliers — they inlined raw
    // stdlib calls (`new ArrayList<>(((Map<String,Object>)x).keySet())` etc.).
    // Routing them through Helpers gives consumers a single place to choose
    // semantics (thread-safety, null-handling, type coercion) and removes the
    // need for downstream regex post-processing that misses non-trivial
    // argument shapes (e.g. `this.x`, `obj[k].y`, nested calls).

    test('Object.keys(x) emits Helpers.objectKeys(x) — bare identifier', () => {
        const fresh = new Transpiler();
        const input =
        "class T {\n" +
        "    f(obj) {\n" +
        "        return Object.keys(obj);\n" +
        "    }\n" +
        "}";
        const output = fresh.transpileJava(input).content;
        expect(output).toMatch(/Helpers\.objectKeys\(\s*obj\s*\)/);
        expect(output).not.toMatch(/\.keySet\(\)/);
    });

    test('Object.keys(this.tickers) emits Helpers.objectKeys(this.tickers) — property access', () => {
        const fresh = new Transpiler();
        const input =
        "class T {\n" +
        "    tickers = {};\n" +
        "    f() {\n" +
        "        return Object.keys(this.tickers);\n" +
        "    }\n" +
        "}";
        const output = fresh.transpileJava(input).content;
        // The 13 sites CCXT's regex post-processor missed all had this.x as the
        // argument. AST-level emit must handle this shape correctly.
        expect(output).toMatch(/Helpers\.objectKeys\(\s*this\.tickers\s*\)/);
        expect(output).not.toMatch(/\.keySet\(\)/);
    });

    test('Object.keys(obj[k]) emits Helpers.objectKeys for ElementAccess argument', () => {
        const fresh = new Transpiler();
        const input =
        "class T {\n" +
        "    f(obj, k) {\n" +
        "        return Object.keys(obj[k]);\n" +
        "    }\n" +
        "}";
        const output = fresh.transpileJava(input).content;
        // Argument is an ElementAccessExpression; emit must wrap whatever the
        // arg parses to.
        expect(output).toMatch(/Helpers\.objectKeys\(/);
        expect(output).not.toMatch(/\.keySet\(\)/);
    });

    test('Object.values(x) emits Helpers.objectValues(x) — bare identifier', () => {
        const fresh = new Transpiler();
        const input =
        "class T {\n" +
        "    f(obj) {\n" +
        "        return Object.values(obj);\n" +
        "    }\n" +
        "}";
        const output = fresh.transpileJava(input).content;
        expect(output).toMatch(/Helpers\.objectValues\(\s*obj\s*\)/);
        expect(output).not.toMatch(/\.values\(\)/);
    });

    test('Object.values(this.x) emits Helpers.objectValues(this.x) — property access', () => {
        const fresh = new Transpiler();
        const input =
        "class T {\n" +
        "    cache = {};\n" +
        "    f() {\n" +
        "        return Object.values(this.cache);\n" +
        "    }\n" +
        "}";
        const output = fresh.transpileJava(input).content;
        expect(output).toMatch(/Helpers\.objectValues\(\s*this\.cache\s*\)/);
        expect(output).not.toMatch(/\.values\(\)/);
    });

    test('Array.isArray(x) emits Helpers.isArray(x) — bare identifier', () => {
        const fresh = new Transpiler();
        const input =
        "class T {\n" +
        "    f(arg) {\n" +
        "        return Array.isArray(arg);\n" +
        "    }\n" +
        "}";
        const output = fresh.transpileJava(input).content;
        expect(output).toMatch(/Helpers\.isArray\(\s*arg\s*\)/);
        // The old emit was a raw instanceof check — must not appear.
        expect(output).not.toMatch(/instanceof java\.util\.List/);
    });

    test('Array.isArray(this.x) emits Helpers.isArray(this.x) — property access', () => {
        const fresh = new Transpiler();
        const input =
        "class T {\n" +
        "    items = [];\n" +
        "    f() {\n" +
        "        return Array.isArray(this.items);\n" +
        "    }\n" +
        "}";
        const output = fresh.transpileJava(input).content;
        expect(output).toMatch(/Helpers\.isArray\(\s*this\.items\s*\)/);
        expect(output).not.toMatch(/instanceof java\.util\.List/);
    });

    test('async method with hoisted param, loop-local vars, ternaries, and two loops', () => {
        const input =
        "class Exchange {\n" +
        "    async fetchData(marketId, params = {}) {\n" +
        "        marketId = this.normalize(marketId);\n" +
        "        const result = [];\n" +
        "        for (let i = 0; i < 10; i++) {\n" +
        "            let code = this.safeString(params, 'code');\n" +
        "            code = this.safeCurrencyCode(code);\n" +
        "            let type = this.safeString(params, 'type');\n" +
        "            type = this.normalize(type);\n" +
        "            result.push({\n" +
        "                'market': marketId,\n" +
        "                'index': i,\n" +
        "                'code': code,\n" +
        "                'isSpot': type === 'spot',\n" +
        "                'linear': (type === 'swap') ? true : undefined,\n" +
        "            });\n" +
        "        }\n" +
        "        for (let i = 0; i < 5; i++) {\n" +
        "            let code = this.safeString(params, 'alt');\n" +
        "            code = this.normalize(code);\n" +
        "            result.push({ 'market': marketId, 'altCode': code, 'idx': i });\n" +
        "        }\n" +
        "        return { 'market': marketId, 'results': result };\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        // every finalXxx reference must have a matching declaration
        const allRefs = [...output.matchAll(/\b(final[A-Z]\w+)\b/g)].map(m => m[1]);
        const allDecls = new Set([...output.matchAll(/final Object (final\w+)\s*=/g)].map(m => m[1]));
        const undeclared = [...new Set(allRefs)].filter(r => !allDecls.has(r));
        expect(undeclared).toEqual([]);
        // marketId anchored at each usage (inside loop1, inside loop2, and before return) → 3
        // code per-loop (2), i per-loop (2), type in first loop (1)
        expect((output.match(/final Object finalMarketId/g) || []).length).toBe(3);
        expect((output.match(/final Object finalCode/g) || []).length).toBe(2);
        expect((output.match(/final Object finalI\b/g) || []).length).toBe(2);
        expect((output.match(/final Object finalType/g) || []).length).toBe(1);
    });
});
