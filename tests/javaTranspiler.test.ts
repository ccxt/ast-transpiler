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

    test('finalXxx declaration is hoisted to method level when used in multiple scopes', () => {
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
        // final declaration must appear exactly once
        const declCount = (output.match(/final Object finalMarketId = marketId;/g) || []).length;
        expect(declCount).toBe(1);
        // all put() calls should use finalMarketId
        const putMatches = output.match(/put\(\s*"symbol",\s*(\w+)\s*\)/g) || [];
        expect(putMatches.length).toBe(2);
        putMatches.forEach(m => expect(m).toContain('finalMarketId'));
        // the declaration must be BEFORE the if block (at method level), not inside it
        const declPos = output.indexOf('final Object finalMarketId = marketId;');
        const ifPos = output.indexOf('if (');
        expect(declPos).toBeLessThan(ifPos);
    });

    test('finalXxx in if/else branches — declaration at method level', () => {
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
        const declCount = (output.match(/final Object finalCode = code;/g) || []).length;
        expect(declCount).toBe(1);
        // declaration must be before the if
        const declPos = output.indexOf('final Object finalCode = code;');
        const ifPos = output.indexOf('if (');
        expect(declPos).toBeLessThan(ifPos);
    });

    test('finalXxx in for-loop body then after loop — declaration at method level', () => {
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
        const declCount = (output.match(/final Object finalCode = code;/g) || []).length;
        expect(declCount).toBe(1);
        const declPos = output.indexOf('final Object finalCode = code;');
        const forPos = output.indexOf('for (');
        expect(declPos).toBeLessThan(forPos);
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

    test('method-param variable IS hoisted but loop-local variable is NOT in same method', () => {
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
        // marketId is a method param reassigned at method body level → hoisted
        const marketDeclPos = output.indexOf('final Object finalMarketId = marketId;');
        const forPos = output.indexOf('for (');
        expect(marketDeclPos).toBeGreaterThan(-1);
        expect(marketDeclPos).toBeLessThan(forPos);
        // code is loop-local → NOT hoisted, stays inside loop
        const codeDeclPos = output.indexOf('final Object finalCode = code;');
        expect(codeDeclPos).toBeGreaterThan(-1);
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

    test('method param hoisted, loop counter and loop-local stay inside loop', () => {
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
        // marketId is method param → hoisted before loop
        const finalMarketPos = output.indexOf('final Object finalMarketId');
        expect(finalMarketPos).toBeGreaterThan(-1);
        expect(finalMarketPos).toBeLessThan(forPos);
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

    test('for-let loop counter used in element access ids[i] — finalI inside loop', () => {
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
        // finalIds should be hoisted (method param, reassigned before loop)
        const finalIdsPos = output.indexOf('final Object finalIds');
        expect(finalIdsPos).toBeGreaterThan(-1);
        expect(finalIdsPos).toBeLessThan(forPos);
        // finalI must be inside the loop (loop counter)
        // Use regex to match finalI but not finalIds
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
});
