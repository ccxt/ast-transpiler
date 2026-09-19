import { Transpiler } from '../src/transpiler';
import fs from 'fs';
import path from 'path';

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
        expect(output).toContain('java.util.Objects.equals(finalType, "spot")');
        // finalType must appear in ternary expressions too (not raw 'type')
        expect(output).toMatch(/java\.util\.Objects\.equals\(finalType, "swap"\).*\? true/);
        expect(output).toMatch(/java\.util\.Objects\.equals\(finalType, "swap"\).*\? false/);
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
        expect(output).toMatch(/put\(\s*"swap",\s*!Boolean\.TRUE\.equals\(finalIsSpot\)\s*\)/);
        expect(output).toMatch(/put\(\s*"contract",\s*!Boolean\.TRUE\.equals\(finalIsSpot\)\s*\)/);
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
            /rawHash = [^;]*;\s*final Object finalRawHash\w* = rawHash;\s*return\b/g;
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

    // Regression (real CCXT bitmart/bingx authenticate shape): a var was marked in
    // ReassignedVars by a PRIOR transpile call and then read back while transpiling
    // a different file where the same class+method+var name is `const`. That
    // cross-call leak produced spurious `finalXxx` snapshots whose presence depended
    // on emit order, so re-emitting the same file gave different Java.
    //
    // ReassignedVars is now reset per source file, so the priming call below cannot
    // reach the target: `timestamp` is `const` here and must be captured directly.
    test('object literal: prior transpile does not leak ReassignedVars into the next file', () => {
        const fresh = new Transpiler();
        // Would previously prime ReassignedVars with T-authenticate-timestamp.
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
        // `timestamp` is effectively final in the target — no snapshot is needed, and
        // none may be invented from the previous call's state.
        expect(output).not.toMatch(/final Object finalTimestamp\b/);
        expect(output).toMatch(/Arrays\.asList\(\s*timestamp,\s*signature\s*\)/);
        expect(output).toMatch(/Arrays\.asList\(\s*timestamp,\s*signature,\s*"web"\s*\)/);
        // No undeclared finalXxx anywhere.
        const allRefs = [...output.matchAll(/\b(final[A-Z]\w+)\b/g)].map(m => m[1]);
        const allDecls = new Set([...output.matchAll(/final Object (final\w+)\s*=/g)].map(m => m[1]));
        const undeclared = [...new Set(allRefs)].filter(r => !allDecls.has(r));
        expect(undeclared).toEqual([]);
        // Transpiling the target standalone must give exactly the same Java.
        const standalone = new Transpiler().transpileJava(target).content;
        expect(output).toEqual(standalone);
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
            /rawHash = [^;]*;\s*final Object finalRawHash\w* = rawHash;\s*request = new java\.util\.HashMap/g;
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

    // --- objectKeys native emission (checker-proven dict argument) ---
    //
    // The helper keeps its `instanceof Map` fallback and its synchronized
    // snapshot for shared field maps; a checker-proven dict target is a Map on
    // every print and run path, so the key copy prints native.

    test('Object.keys(dict-typed identifier) emits the native key copy', () => {
        const fresh = new Transpiler();
        const input =
        "class T {\n" +
        "    f(dict: { [key: string]: any }) {\n" +
        "        return Object.keys(dict);\n" +
        "    }\n" +
        "}";
        const output = fresh.transpileJava(input).content;
        expect(output).toMatch(/new java\.util\.ArrayList<Object>\(\(\(java\.util\.Map<String, Object>\)dict\)\.keySet\(\)\)/);
        expect(output).not.toMatch(/Helpers\.objectKeys\(/);
    });

    test('Object.keys of a dict-returning call emits the native key copy', () => {
        const fresh = new Transpiler();
        const input =
        "class T {\n" +
        "    g(): { [key: string]: any } {\n" +
        "        return {};\n" +
        "    }\n" +
        "    f() {\n" +
        "        return Object.keys(this.g());\n" +
        "    }\n" +
        "}";
        const output = fresh.transpileJava(input).content;
        expect(output).toMatch(/new java\.util\.ArrayList<Object>\(\(\(java\.util\.Map<String, Object>\)this\.g\(\)\)\.keySet\(\)\)/);
    });

    test('Object.keys of a dict narrowed by Array.isArray (else branch) emits the native key copy', () => {
        const fresh = new Transpiler();
        const input =
        "class T {\n" +
        "    f(orders: { [key: string]: any } | any[]) {\n" +
        "        if (Array.isArray(orders)) {\n" +
        "            return orders.length;\n" +
        "        } else {\n" +
        "            return Object.keys(orders);\n" +
        "        }\n" +
        "    }\n" +
        "}";
        const output = fresh.transpileJava(input).content;
        expect(output).toMatch(/new java\.util\.ArrayList<Object>\(\(\(java\.util\.Map<String, Object>\)orders\)\.keySet\(\)\)/);
    });

    test('Object.keys(this.<dict field>) keeps the helper (shared field map)', () => {
        const fresh = new Transpiler();
        const input =
        "class T {\n" +
        "    dict: { [key: string]: any } = {};\n" +
        "    f() {\n" +
        "        return Object.keys(this.dict);\n" +
        "    }\n" +
        "}";
        const output = fresh.transpileJava(input).content;
        // Field maps are shared with other threads and the helper's synchronized
        // snapshot is the port's documented map-read invariant.
        expect(output).toMatch(/Helpers\.objectKeys\(\s*this\.dict\s*\)/);
        expect(output).not.toMatch(/\.keySet\(\)/);
    });

    test('Object.keys of a nullable dict / an array keeps the helper', () => {
        const fresh = new Transpiler();
        const nullable =
        "class T {\n" +
        "    f(dict: { [key: string]: any } | undefined) {\n" +
        "        return Object.keys(dict);\n" +
        "    }\n" +
        "}";
        const nullableOutput = fresh.transpileJava(nullable).content;
        expect(nullableOutput).toMatch(/Helpers\.objectKeys\(/);
        expect(nullableOutput).not.toMatch(/\.keySet\(\)/);
        const array =
        "class T {\n" +
        "    f(list: any[]) {\n" +
        "        return Object.keys(list);\n" +
        "    }\n" +
        "}";
        const arrayOutput = fresh.transpileJava(array).content;
        expect(arrayOutput).toMatch(/Helpers\.objectKeys\(/);
        expect(arrayOutput).not.toMatch(/\.keySet\(\)/);
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

    test('Array.isArray(x) emits (x instanceof java.util.List) — bare identifier', () => {
        const fresh = new Transpiler();
        const input =
        "class T {\n" +
        "    f(arg) {\n" +
        "        return Array.isArray(arg);\n" +
        "    }\n" +
        "}";
        const output = fresh.transpileJava(input).content;
        // Object operand: the helper's null/List answer is the same instanceof answer
        expect(output).toContain("return (arg instanceof java.util.List);");
        expect(output).not.toMatch(/Helpers\.isArray\(/);
    });

    test('Array.isArray(this.x) emits (this.x instanceof java.util.List) — property access', () => {
        const fresh = new Transpiler();
        const input =
        "class T {\n" +
        "    items = [];\n" +
        "    f() {\n" +
        "        return Array.isArray(this.items);\n" +
        "    }\n" +
        "}";
        const output = fresh.transpileJava(input).content;
        expect(output).toContain("return (this.items instanceof java.util.List);");
        expect(output).not.toMatch(/Helpers\.isArray\(/);
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
    test('non-async Promise-returning delegator transpiles like async return await', () => {
        // a method without `async` that returns a Promise (e.g. WS delegators
        // like `watchTicker(...) { return this.watchTickerInner(...); }`)
        // must produce the exact same Java as its `async`/`return await` twin:
        // CompletableFuture signature + supplyAsync wrapper + `.join()` on the
        // inner future (instead of returning the raw CompletableFuture, which
        // would make the outer future resolve to a future).
        const input =
        "class Exchange {\n" +
        "    async watchTickerInner(symbol: string): Promise<any> {\n" +
        "        return { 'symbol': symbol };\n" +
        "    }\n" +
        "    watchTicker(symbol: string): Promise<any> {\n" +
        "        return this.watchTickerInner(symbol);\n" +
        "    }\n" +
        "    async watchTickerClassic(symbol: string): Promise<any> {\n" +
        "        return await this.watchTickerInner(symbol);\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("java.util.concurrent.CompletableFuture<Object> watchTicker(");
        expect(output).toContain("return (this.watchTickerInner(symbol)).join();");
        // the delegator must be wrapped in supplyAsync like any async method
        expect((output.match(/supplyAsync/g) || []).length).toBe(3);
        // delegator body must be identical to the classic async/return await version
        const getBody = (name: string) => {
            const start = output.indexOf(`CompletableFuture<Object> ${name}(`);
            const end = output.indexOf('});', start);
            return output.slice(output.indexOf('{', start), end);
        };
        expect(getBody('watchTicker')).toBe(getBody('watchTickerClassic'));
    });

    // Idempotency: the Java emit must not be able to tell whether it is the first
    // or the tenth for the same input. The parsed SourceFile is cached and reused
    // across transpile calls, so the in-place `x` -> `finalX` identifier rewrite and
    // the ReassignedVars / object-literal caches all have to be unwound per file.
    // Before the fix, emit #2 dropped most `final Object finalX = x;` hoists while
    // keeping their usages (javac: cannot find symbol) or degenerated them into
    // `final Object finalX = finalX;` (javac: illegal self reference).
    test('java emit is idempotent — repeated emits of the same source are byte-identical', () => {
        const input =
        "class T {\n" +
        "    async fetchThing(symbol, params = {}) {\n" +
        "        let request = { 'symbol': symbol };\n" +
        "        request = this.extend(request, params);\n" +
        "        const timestamp = this.milliseconds();\n" +
        "        const payload = { 'ts': timestamp, 'req': request };\n" +
        "        return payload;\n" +
        "    }\n" +
        "}";
        const shared = new Transpiler();
        const emit1 = shared.transpileJava(input).content;
        const emit2 = shared.transpileJava(input).content;
        const emit3 = shared.transpileJava(input).content;
        expect(emit2).toEqual(emit1);
        expect(emit3).toEqual(emit1);
        // A reused instance must agree with a pristine one.
        expect(emit1).toEqual(new Transpiler().transpileJava(input).content);
        // Every finalXxx reference is declared, and no declaration is self-referential.
        for (const output of [ emit1, emit2, emit3 ]) {
            const refs = [...output.matchAll(/\b(final[A-Z]\w+)\b/g)].map(m => m[1]);
            const decls = new Set([...output.matchAll(/final Object (final\w+)\s*=/g)].map(m => m[1]));
            expect([...new Set(refs)].filter(r => !decls.has(r))).toEqual([]);
            expect(output).not.toMatch(/final Object (final\w+)\s*=\s*\1\s*;/);
        }
    });

    // Interleaving two files through one transpiler must not let either contaminate
    // the other: each file's Java has to match what it produces on its own.
    test('java emit is order-independent across files', () => {
        const fileA =
        "class A {\n" +
        "    async run(params = {}) {\n" +
        "        let request = 'a';\n" +
        "        request = request + '!';\n" +
        "        return { 'r': request };\n" +
        "    }\n" +
        "}";
        const fileB =
        "class A {\n" +
        "    async run(params = {}) {\n" +
        "        const request = 'b';\n" +
        "        return { 'r': request };\n" +
        "    }\n" +
        "}";
        const soloA = new Transpiler().transpileJava(fileA).content;
        const soloB = new Transpiler().transpileJava(fileB).content;
        const shared = new Transpiler();
        expect(shared.transpileJava(fileA).content).toEqual(soloA);
        expect(shared.transpileJava(fileB).content).toEqual(soloB);
        expect(shared.transpileJava(fileA).content).toEqual(soloA);
        // fileB's `request` is const — it must never acquire a snapshot from fileA.
        expect(soloB).not.toMatch(/final Object finalRequest/);
    });
});

describe('trailing null/undefined omission on this-calls (varargs ambiguity)', () => {
    // the generated java surface is uniformly varargs - a trailing bare null
    // triggers javac's "non-varargs call of varargs method" warning; the
    // transpiler drops exactly one trailing null/undefined on this.-calls
    const classWrap = (body: string) =>
        "class T {\n" +
        "    safeString2(o, k1, k2, d = undefined) { return undefined; }\n" +
        "    safeValue(o, k, d = undefined) { return undefined; }\n" +
        "    parseOrders(orders, market = undefined, since = undefined, limit = undefined) { return undefined; }\n" +
        "    handleParamString2(p, n1, n2, d = undefined) { return undefined; }\n" +
        "    method(a, b = undefined) { return undefined; }\n" +
        body +
        "}";

    test('drops trailing undefined on safe-family and parse helpers', () => {
        const input = classWrap(
            "    test() {\n" +
            "        const a = this.safeString2({}, 'x', 'y', undefined);\n" +
            "        const b = this.safeValue({}, 'x', undefined);\n" +
            "        const c = this.parseOrders([], undefined);\n" +
            "        const d = this.handleParamString2({}, 'x', 'y', undefined);\n" +
            "    }\n");
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain('this.safeString2(new java.util.HashMap<String, Object>() {{}}, "x", "y")');
        expect(output).not.toContain('safeString2(new java.util.HashMap<String, Object>() {{}}, "x", "y", null)');
        expect(output).toContain('this.safeValue(new java.util.HashMap<String, Object>() {{}}, "x")');
        expect(output).toContain('this.parseOrders(new java.util.ArrayList<Object>(java.util.Arrays.asList()))');
        expect(output).toContain('this.handleParamString2(new java.util.HashMap<String, Object>() {{}}, "x", "y")');
    });

    test('drops only one trailing nullish and leaves interior nulls intact', () => {
        const input = classWrap(
            "    test() {\n" +
            "        this.method(undefined, undefined);\n" +
            "    }\n");
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain('this.method(null)');
        expect(output).not.toContain('this.method(null, null)');
    });

    test('non-this calls keep trailing null', () => {
        const input =
            "function f(a, b = undefined) { return a; }\n" +
            "class T {\n" +
            "    test() {\n" +
            "        f('x', undefined);\n" +
            "    }\n" +
            "}";
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain('f("x", null)');
    });
});

describe('trailing undefined into a REQUIRED positional parameter is kept', () => {
    test('six required params, sixth passed as undefined - arity preserved', () => {
        const input =
        "class T {\n" +
        "    signDydxTx(pk, orderRequest, sub, chainName, account, authenticators) { return undefined; }\n" +
        "    test() {\n" +
        "        const signedTx = this.signDydxTx('pk', {}, '', 'chain', {}, undefined);\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain('this.signDydxTx("pk", new java.util.HashMap<String, Object>() {{}}, "", "chain", new java.util.HashMap<String, Object>() {{}}, null)');
    });

    test('optional tail still gets dropped', () => {
        const input =
        "class T {\n" +
        "    safeString2(o, k1, k2, d = undefined) { return undefined; }\n" +
        "    test() {\n" +
        "        const a = this.safeString2({}, 'x', 'y', undefined);\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain('this.safeString2(new java.util.HashMap<String, Object>() {{}}, "x", "y")');
    });
});

describe('java asyncExecutor option', () => {
    test('asyncExecutor: default emits the single-argument supplyAsync form', () => {
        const input =
        "class T {\n" +
        "    async fetchData(x: any): Promise<any> {\n" +
        "        const y = await this.other(x);\n" +
        "        return y;\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("supplyAsync(() -> {");
        expect(output).toContain("        });\n");
        expect(output).not.toMatch(/\}, [^)]+\);/);
    });

    test('asyncExecutor: option appends the executor as second supplyAsync argument', () => {
        const withExecutor = new Transpiler({
            'verbose': false,
            'java': {
                'parser': { 'NUM_LINES_END_FILE': 0 },
                'asyncExecutor': 'io.github.ccxt.BaseExchange.VIRTUAL_EXECUTOR',
            }
        });
        const input =
        "class T {\n" +
        "    async fetchData(x: any): Promise<any> {\n" +
        "        const y = await this.other(x);\n" +
        "        return y;\n" +
        "    }\n" +
        "    async noReturn(): Promise<void> {\n" +
        "        const x = 1;\n" +
        "    }\n" +
        "}"
        const output = withExecutor.transpileJava(input).content;
        const plain = transpiler.transpileJava(input).content;
        expect((output.match(/\}, io\.github\.ccxt\.BaseExchange\.VIRTUAL_EXECUTOR\);/g) || []).length).toBe(2);
        expect(output).toContain("            return null;\n        }, io.github.ccxt.BaseExchange.VIRTUAL_EXECUTOR);");
        // the option only appends the executor argument; everything else is identical
        expect(output.replace(/, io\.github\.ccxt\.BaseExchange\.VIRTUAL_EXECUTOR\);/g, ');')).toBe(plain);
    });
});

describe('java asyncSupplier option', () => {
    test('asyncSupplier: replaces CompletableFuture.supplyAsync and emits no executor argument', () => {
        const withSupplier = new Transpiler({
            'verbose': false,
            'java': {
                'parser': { 'NUM_LINES_END_FILE': 0 },
                'asyncSupplier': 'io.github.ccxt.BaseExchange.supplyAsync',
                'asyncExecutor': 'io.github.ccxt.BaseExchange.VIRTUAL_EXECUTOR',
            }
        });
        const input =
        "class T {\n" +
        "    async fetchData(x: any): Promise<any> {\n" +
        "        const y = await this.other(x);\n" +
        "        return y;\n" +
        "    }\n" +
        "    async noReturn(): Promise<void> {\n" +
        "        const x = 1;\n" +
        "    }\n" +
        "}"
        const output = withSupplier.transpileJava(input).content;
        expect(output).toContain("return io.github.ccxt.BaseExchange.supplyAsync(() -> {");
        expect(output).not.toContain("CompletableFuture.supplyAsync");
        expect(output).not.toContain("VIRTUAL_EXECUTOR");
        expect(output).toContain("return null;");
        expect((output.match(/^        \}\);$/gm) || []).length).toBe(2);
    });
});

describe('java boolean conditions emitted without the Helpers.isTrue wrapper', () => {
    const conditionOf = (body: string, signature = 'test(x: any): void') => {
        const input =
        "class T {\n" +
        "    " + signature + " {\n" +
        body +
        "    }\n" +
        "}"
        return transpiler.transpileJava(input).content;
    };

    test('comparison conditions print the comparison helper alone', () => {
        expect(conditionOf("        if (x === 1) { return; }\n")).toContain("if (Helpers.isEqual(x, 1))");
        // the null literal is native equality (d2): Objects.equals(x, null) is the identity test
        // Helpers.isEqual(x, null) performs, and the boolean needs no isTrue wrapper (d1)
        const notNull = conditionOf("        if (x !== null) { return; }\n");
        expect(notNull).toContain("if (!java.util.Objects.equals(x, null))");
        expect(notNull).not.toContain("Helpers.isTrue(");
        expect(conditionOf("        if (x == 1) { return; }\n")).toContain("if (Helpers.isEqual(x, 1))");
        expect(conditionOf("        if (x != null) { return; }\n"))
            .toContain("if (!java.util.Objects.equals(x, null))");
    });

    test('relational conditions print the comparison helper alone', () => {
        expect(conditionOf("        if (x > 1) { return; }\n")).toContain("if (Helpers.isGreaterThan(x, 1))");
        expect(conditionOf("        if (x >= 1) { return; }\n")).toContain("if (Helpers.isGreaterThanOrEqual(x, 1))");
        expect(conditionOf("        if (x < 1) { return; }\n")).toContain("if (Helpers.isLessThan(x, 1))");
        expect(conditionOf("        if (x <= 1) { return; }\n")).toContain("if (Helpers.isLessThanOrEqual(x, 1))");
    });

    test('while and ternary conditions are unwrapped too', () => {
        const loop = conditionOf("        while (x > 1) { x = 2; }\n");
        expect(loop).toContain("while (Helpers.isGreaterThan(x, 1))");
        const ternary = conditionOf("        return (x === 1) ? \"y\" : \"n\";\n", 'test(x: any): string');
        expect(ternary).toContain("(Helpers.isEqual(x, 1))");
        expect(ternary).not.toContain("Helpers.isTrue(");
    });

    test('typeof guards and instanceof print native/helper checks without the wrapper', () => {
        const typeofGuard = conditionOf("        if (typeof x === 'string') { return; }\n");
        expect(typeofGuard).toContain("if ((x instanceof String))");
        expect(typeofGuard).not.toContain("Helpers.isTrue(");
        const instance = conditionOf("        if (x instanceof Error) { return; }\n");
        expect(instance).toContain("if (Helpers.isInstance(x, Error.class))");
    });

    test('the `in` operator condition prints Helpers.inOp without the wrapper', () => {
        const output = conditionOf("        if (x in this.options) { return; }\n");
        expect(output).toContain("if (Helpers.inOp(this.options, x))");
        expect(output).not.toContain("Helpers.isTrue(");
    });

    test('logical operators of boolean conditions print native, no wrapper anywhere', () => {
        const and = conditionOf("        if (x === 1 && x !== 2) { return; }\n");
        expect(and).toContain("if (Helpers.isEqual(x, 1) && !Helpers.isEqual(x, 2))");
        expect(and).not.toContain("Helpers.isTrue(");
        const or = conditionOf("        if (x === 1 || x !== 2) { return; }\n");
        expect(or).toContain("if (Helpers.isEqual(x, 1) || !Helpers.isEqual(x, 2))");
        expect(or).not.toContain("Helpers.isTrue(");
    });

    test('negated boolean conditions drop the wrapper but keep the operator', () => {
        const output = conditionOf("        if (!(x === 1)) { return; }\n");
        expect(output).toContain("if (!(Helpers.isEqual(x, 1)))");
        expect(output).not.toContain("Helpers.isTrue(");
    });

    test('non-boolean conditions keep the falsy helper', () => {
        // a string / any condition still needs the runtime truthiness test
        expect(conditionOf("        if (x) { return; }\n", 'test(x: string): void'))
            .toContain("if (Helpers.isTrue(x))");
        expect(conditionOf("        if (x) { return; }\n")).toContain("if (Helpers.isTrue(x))");
        // `boolean | undefined` is not proven boolean - the helper must stay
        expect(conditionOf("        if (x) { return; }\n", 'test(x: boolean | undefined): void'))
            .toContain("if (Helpers.isTrue(x))");
        // negation of a non-boolean keeps the helper inside the `!`
        expect(conditionOf("        if (!x) { return; }\n", 'test(x: string): void'))
            .toContain("if (!Helpers.isTrue(x))");
    });

    test('logical operators over non-boolean operands keep the wrapper', () => {
        const output = conditionOf("        if (x && x) { return; }\n", 'test(x: string): void');
        expect(output).toContain("if (Helpers.isTrue(Helpers.isTrue(x) && Helpers.isTrue(x)))");
    });

    test('comparison operands inside a logical expression are unwrapped individually', () => {
        const output = conditionOf("        if (x && x === 1) { return; }\n", 'test(x: string): void');
        // the string operand prints native equality (d2); the comparison is still unwrapped on
        // its own - only the non-boolean `x` operand keeps an isTrue inside the &&
        expect(output).toContain("Helpers.isTrue(x) && java.util.Objects.equals(x, 1)");
        expect(output).not.toContain("Helpers.isTrue(java.util.Objects.equals(");
    });
});

describe('java isTrue around Precise relational statics (proven boolean)', () => {
    // the base class' relational statics are declared `public static boolean` in Precise.java;
    // the String-returning statics and a same-named method elsewhere keep the helper
    const conditionOf = (classBody: string, body: string, signature = 'test(a: any, b: any): void') => {
        const input =
        "class Precise {\n" +
        classBody +
        "}\n" +
        "class T {\n" +
        "    " + signature + " {\n" +
        body +
        "    }\n" +
        "}\n"
        return transpiler.transpileJava(input).content;
    };
    const boolStatics =
        "    static stringEq (a: any, b: any): boolean { return false; }\n" +
        "    static stringEquals (a: any, b: any): boolean { return false; }\n" +
        "    static stringGt (a: any, b: any): boolean { return false; }\n" +
        "    static stringGe (a: any, b: any): boolean { return false; }\n" +
        "    static stringLt (a: any, b: any): boolean { return false; }\n" +
        "    static stringLe (a: any, b: any): boolean { return false; }\n";

    test('a relational Precise static condition prints without the wrapper', () => {
        const output = conditionOf(boolStatics, "        if (Precise.stringLt(a, b)) { return; }\n");
        expect(output).toContain("if (Precise.stringLt(a, b))");
        expect(output).not.toContain("Helpers.isTrue(");
    });

    test('every relational static is unwrapped, parenthesised and negated too', () => {
        for (const name of ['stringEq', 'stringEquals', 'stringGt', 'stringGe', 'stringLt', 'stringLe']) {
            const plain = conditionOf(boolStatics, `        if (Precise.${name}(a, b)) { return; }\n`);
            expect(plain).toContain(`if (Precise.${name}(a, b))`);
            const negated = conditionOf(boolStatics, `        if (!Precise.${name}(a, b)) { return; }\n`);
            expect(negated).toContain(`if (!Precise.${name}(a, b))`);
            const parenthesised = conditionOf(boolStatics, `        if ((Precise.${name}(a, b))) { return; }\n`);
            expect(parenthesised).not.toContain("Helpers.isTrue(");
        }
    });

    test('while and ternary conditions drop the wrapper as well', () => {
        const loop = conditionOf(boolStatics, "        while (Precise.stringGe(a, b)) { a = 1; }\n");
        expect(loop).toContain("while (Precise.stringGe(a, b))");
        const ternary = conditionOf(boolStatics, "        return Precise.stringEquals(a, b) ? \"y\" : \"n\";\n", 'test(a: any, b: any): string');
        expect(ternary).toContain("(Precise.stringEquals(a, b))");
        expect(ternary).not.toContain("Helpers.isTrue(");
    });

    test('a Precise call inside a logical expression is unwrapped on its own', () => {
        const output = conditionOf(boolStatics, "        if (a && Precise.stringEq(a, b)) { return; }\n", 'test(a: string, b: any): void');
        // the non-boolean `a` operand keeps its isTrue; the Precise call does not
        expect(output).toContain("Helpers.isTrue(a) && Precise.stringEq(a, b)");
        expect(output).not.toContain("Helpers.isTrue(Precise");
    });

    test('a negated Precise call is boolean as well (real okx shape)', () => {
        const output = conditionOf(boolStatics, "        if ((a !== null) && (!Precise.stringEq(a, \"0\"))) { return; }\n");
        expect(output).toContain('&& (!Precise.stringEq(a, "0"))');
        expect(output).not.toContain("Helpers.isTrue(Precise");
    });

    test('non-boolean Precise statics and unproven receivers keep the helper', () => {
        const stringStatic =
            "    static stringAdd (a: any, b: any): string { return \"\"; }\n" +
            "    static stringLt (a: any, b: any): boolean | undefined { return undefined; }\n";
        expect(conditionOf(stringStatic, "        if (Precise.stringAdd(a, b)) { return; }\n"))
            .toContain("if (Helpers.isTrue(Precise.stringAdd(a, b)))");
        // `boolean | undefined` is not proven boolean - the union keeps the runtime truthiness test
        expect(conditionOf(stringStatic, "        if (Precise.stringLt(a, b)) { return; }\n"))
            .toContain("Helpers.isTrue(Precise.stringLt(a, b))");
        // another class with the same static name is not the base Precise
        const otherClass =
            "class Other {\n" +
            "    static stringLt (a: any, b: any): boolean { return false; }\n" +
            "}\n";
        const output = transpiler.transpileJava(otherClass + "class T {\n    test(a: any, b: any): void {\n        if (Other.stringLt(a, b)) { return; }\n    }\n}\n").content;
        expect(output).toContain("Helpers.isTrue(Other.stringLt(a, b))");
        // an unresolved `Precise` prints the same text but proves nothing
        const unresolved = transpiler.transpileJava("class T {\n    test(a: any, b: any): void {\n        if (Precise.stringLt(a, b)) { return; }\n    }\n}\n").content;
        expect(unresolved).toContain("Helpers.isTrue(Precise.stringLt(a, b))");
    });
});

describe('java boolean-returning `this.<name>(...)` conditions drop the Helpers.isTrue wrapper', () => {
    // the Java base declares these methods with a concrete boolean return (BaseExchange.java,
    // above the transpile delimiter), so the condition wrapper only re-tests the boolean the
    // printed call already produced
    const inputOf = (body: string) => `
class T {
    inArray(elem: any, list: any): boolean { return true; }
    isArray(a: any): boolean { return true; }
    isEmpty(a: any): boolean { return true; }
    valueIsDefined(value: any): value is Object { return true; }
    isBinaryMessage(msg: any) { return msg instanceof Uint8Array; }
    safeBool(d: any, k: any, defaultValue: boolean | undefined = undefined): boolean | undefined { return true; }
    safeBool2(d: any, k1: any, k2: any, defaultValue: boolean | undefined = undefined): boolean | undefined { return true; }
    other(x: any): any { return x; }
    test(x: any, y: any): void {
${body}
    }
}
`;

    const conditionOf = (body: string) => transpiler.transpileJava(inputOf(body)).content;

    test('primitive-boolean base calls print bare', () => {
        expect(conditionOf('if (this.inArray(x, [])) { return; }'))
            .toContain('if (this.inArray(x, new java.util.ArrayList<Object>(java.util.Arrays.asList())))');
        expect(conditionOf('if (this.isEmpty(x)) { return; }')).toContain('if (this.isEmpty(x))');
        expect(conditionOf('if (this.isArray(x)) { return; }')).toContain('if (this.isArray(x))');
        // a type predicate and an inferred return are both a plain boolean to the checker
        expect(conditionOf('if (this.valueIsDefined(x)) { return; }')).toContain('if (this.valueIsDefined(x))');
        expect(conditionOf('if (this.isBinaryMessage(x)) { return; }')).toContain('if (this.isBinaryMessage(x))');
        expect(conditionOf('if (this.inArray(x, [])) { return; }')).not.toContain('Helpers.isTrue(this.');
    });

    test('negated, logical and value-context calls stay native', () => {
        const negated = conditionOf('if (!this.isEmpty(x) && this.inArray(x, [])) { return; }');
        expect(negated).toContain('if (!this.isEmpty(x) && this.inArray(x,');
        expect(negated).not.toContain('Helpers.isTrue(this.');
        // the && operands of a value expression print through printCondition too
        const value = conditionOf('const z = this.isEmpty(x) && !this.inArray(x, []);');
        expect(value).toContain('Object z = this.isEmpty(x) && !this.inArray(x,');
        expect(value).not.toContain('Helpers.isTrue(this.');
    });

    test('safeBool boxes print Boolean.TRUE.equals', () => {
        expect(conditionOf("if (this.safeBool(x, 'k', false)) { return; }"))
            .toContain('if (Boolean.TRUE.equals(this.safeBool(x, "k", false)))');
        expect(conditionOf("if (this.safeBool2(x, 'a', 'b', true)) { return; }"))
            .toContain('if (Boolean.TRUE.equals(this.safeBool2(x, "a", "b", true)))');
        // absent default: the accessor hands back null, which is what TRUE.equals tests
        expect(conditionOf("if (this.safeBool(x, 'k')) { return; }"))
            .toContain('if (Boolean.TRUE.equals(this.safeBool(x, "k")))');
        expect(conditionOf("if (this.safeBool(x, 'k', false)) { return; }")).not.toContain('Helpers.isTrue(this.');
    });

    test('an unprovable default argument keeps the wrapper', () => {
        // safeBool hands the caller's default back untouched when the found value is not a
        // Boolean, so anything but a boolean/nullish literal keeps the box arbitrary
        expect(conditionOf("if (this.safeBool(x, 'k', y)) { return; }"))
            .toContain('if (Helpers.isTrue(this.safeBool(x, "k", y)))');
    });

    test('non-boolean and unresolvable callees keep the wrapper', () => {
        expect(conditionOf('if (this.other(x)) { return; }')).toContain('if (Helpers.isTrue(this.other(x)))');
        // a name the checker cannot resolve prints the dynamic-call wrapper, whose return is Object
        expect(conditionOf('if (this.unknownBaseCall(x)) { return; }'))
            .toContain('Helpers.isTrue(Helpers.callDynamically(this, "unknownBaseCall"');
    });
});

describe('java native equality (Helpers.isEqual -> Objects.equals)', () => {
    test('string operands compare with java.util.Objects.equals, negation keeps the !', () => {
        const input =
        "function f (x: string, s: string | undefined, o: any) {\n" +
        "    const a = x === 'delivery';\n" +
        "    const b = x !== 'delivery';\n" +
        "    const c = s === x;\n" +
        "    const d = o === 'delivery';\n" +
        "    const e = o !== 'delivery';\n" +
        "    return [ a, b, c, d, e ];\n" +
        "}\n"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain('java.util.Objects.equals(x, "delivery")');
        expect(output).toContain('!java.util.Objects.equals(x, "delivery")');
        // string | undefined folds into the string family
        expect(output).toContain("java.util.Objects.equals(s, x)");
        // an untyped operand still compares natively once the other side is a string
        expect(output).toContain('java.util.Objects.equals(o, "delivery")');
        expect(output).toContain('!java.util.Objects.equals(o, "delivery")');
        expect(output).not.toContain("Helpers.isEqual");
    });

    test('undefined/null literals compare natively against any operand type', () => {
        const input =
        "function f (o: any, n: number) {\n" +
        "    const a = o === undefined;\n" +
        "    const b = o !== undefined;\n" +
        "    const c = n === undefined;\n" +
        "    const d = o === null;\n" +
        "    return [ a, b, c, d ];\n" +
        "}\n"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("java.util.Objects.equals(o, null)");
        expect(output).toContain("!java.util.Objects.equals(o, null)");
        expect(output).toContain("java.util.Objects.equals(n, null)");
        expect(output).not.toContain("Helpers.isEqual");
    });

    test('boolean operands compare natively', () => {
        const input =
        "function f (b: boolean, o: any) {\n" +
        "    const a = b === true;\n" +
        "    const c = o === true;\n" +
        "    const d = b !== o;\n" +
        "    return [ a, c, d ];\n" +
        "}\n"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("java.util.Objects.equals(b, true)");
        expect(output).toContain("java.util.Objects.equals(o, true)");
        expect(output).toContain("!java.util.Objects.equals(b, o)");
        expect(output).not.toContain("Helpers.isEqual");
    });

    test('numeric and unproven pairs keep Helpers.isEqual', () => {
        const input =
        "function f (n: number, o: any) {\n" +
        "    const a = n === 1;\n" +
        "    const b = n === n;\n" +
        "    const e = o === o;\n" +
        "    const g = 1 === 2;\n" +
        "    return [ a, b, e, g ];\n" +
        "}\n"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("Helpers.isEqual(n, 1)");
        expect(output).toContain("Helpers.isEqual(n, n)");
        expect(output).toContain("Helpers.isEqual(o, o)");
        // two int literals print two Java primitives, so the constant pair is native (java-15)
        expect(output).toContain("(1 == 2)");
        expect(output).not.toContain("java.util.Objects.equals");
    });
});

describe('java numeric equality (Helpers.isEqual -> native compare, java-15)', () => {
    // Helpers.isEqual compares two numeric operands by value, so a pair whose printed Java
    // operands are primitives of one numeric kind prints the native operator, and a pair of
    // equal-kind boxes prints Objects.equals (whose class the kind pins down).
    test('a checker-proven string/List length compares with the native operator', () => {
        const input =
        "function f (s: string, xs: number[]) {\n" +
        "    const a = s.length === 0;\n" +
        "    const b = xs.length === 1;\n" +
        "    const c = xs.length !== 2;\n" +
        "    return [ a, b, c ];\n" +
        "}\n"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("(((String)s).length() == 0)");
        expect(output).toContain("(((java.util.List<?>)xs).size() == 1)");
        expect(output).toContain("(((java.util.List<?>)xs).size() != 2)");
        expect(output).not.toContain("Helpers.isEqual");
    });

    test('a length-typed local compares with Objects.equals (its box is an Integer)', () => {
        const input =
        "function f (xs: number[]) {\n" +
        "    const n = xs.length;\n" +
        "    return n === 0;\n" +
        "}\n"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("Object n = ((java.util.List<?>)xs).size();");
        expect(output).toContain("java.util.Objects.equals(n, 0)");
        expect(output).not.toContain("Helpers.isEqual");
    });

    test('a local re-assigned a different numeric kind keeps the helper (D2 scan)', () => {
        const input =
        "function f (xs: number[]) {\n" +
        "    let n = xs.length;\n" +
        "    if (n === 0) { n = 0.5; }\n" +
        "    return n === 0;\n" +
        "}\n"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("Helpers.isEqual(n, 0)");
    });

    test('a local re-assigned the same kind still compares natively', () => {
        const input =
        "function f (xs: number[], ys: number[]) {\n" +
        "    let n = xs.length;\n" +
        "    n = ys.length;\n" +
        "    return n === 0;\n" +
        "}\n"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("java.util.Objects.equals(n, 0)");
    });

    test('a for-loop counter compares with the native operator', () => {
        const input =
        "function f (xs: number[]) {\n" +
        "    for (let i = 0; i < xs.length; i++) {\n" +
        "        if (i === 0) { return i; }\n" +
        "    }\n" +
        "    return 0;\n" +
        "}\n"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("(i == 0)");
        expect(output).not.toContain("Helpers.isEqual");
    });

    test('a boxed double keeps the helper (-0.0/0.0), a literal pair compares natively', () => {
        const input =
        "function f (xs: number[]) {\n" +
        "    const rate = 0.5;\n" +
        "    const n = xs.length;\n" +
        "    const a = rate === 0.5;\n" +
        "    const b = 1.5 === 0.5;\n" +
        "    const c = n === 0.5;\n" +
        "    return [ a, b, c ];\n" +
        "}\n"
        const output = transpiler.transpileJava(input).content;
        // Double.equals separates -0.0 from 0.0 while the helper's toDouble compare does not
        expect(output).toContain("Helpers.isEqual(rate, 0.5)");
        expect(output).toContain("(1.5 == 0.5)");
        // a mixed int/double pair keeps the helper (the box classes differ)
        expect(output).toContain("Helpers.isEqual(n, 0.5)");
    });

    test('operands the checker does not prove a plain number keep the helper', () => {
        const input =
        "function f (xs: number[], o: any, n: number | undefined) {\n" +
        "    const d: Dict = { 'k': xs.length };\n" +
        "    const a = xs['length'] === 0;\n" +
        "    const b = o === 0;\n" +
        "    const c = n === 0;\n" +
        "    const e = (xs as any).length === 0;\n" +
        "    return [ d, a, b, c, e ];\n" +
        "}\n"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("Helpers.isEqual(o, 0)");
        expect(output).toContain("Helpers.isEqual(n, 0)");
        expect(output).not.toContain("Helpers.isEqual(xs, 0)");
    });
});

describe('checker-typed element access: Helpers.GetValue -> native Map/List access', () => {
    // the Java runtime holds every dict-shaped value as a Map<String, Object> (raw HashMap or a
    // types.TypedMap view) and every tuple as List<Object>, so a read the checker proves to be a
    // dict/tuple with a literal key prints the native accessor instead of the helper. `any`,
    // unions, strings, nullable values, non-tuple arrays and non-literal keys keep the helper.
    test('dict-typed container with a string literal key goes native', () => {
        const input =
        "type D = { [key: string]: any };\n" +
        "class T {\n" +
        "    test(d: D): void {\n" +
        "        const a = d['k'];\n" +
        "        const b = d['price'];\n" +
        "        this.something(a, b);\n" +
        "    }\n" +
        "    something(...args: any[]): void {}\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain('((java.util.Map<String, Object>)d).get("k")');
        expect(output).toContain('((java.util.Map<String, Object>)d).get("price")');
        expect(output).not.toContain('Helpers.GetValue(d,');
    });

    test('non-literal keys keep the helper', () => {
        const input =
        "type D = { [key: string]: any };\n" +
        "class T {\n" +
        "    test(d: D, k: string): void {\n" +
        "        const a = d[k];\n" +
        "        this.something(a);\n" +
        "    }\n" +
        "    something(...args: any[]): void {}\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("Helpers.GetValue(d, k)");
        expect(output).not.toContain("((java.util.Map<String, Object>)d).get(k)");
    });

    test('any-typed containers keep the helper (nothing is proven)', () => {
        const input =
        "class T {\n" +
        "    test(p: any): void {\n" +
        "        const a = p['k'];\n" +
        "        const b = p[0];\n" +
        "        this.something(a, b);\n" +
        "    }\n" +
        "    something(...args: any[]): void {}\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain('Helpers.GetValue(p, "k")');
        expect(output).toContain("Helpers.GetValue(p, 0)");
    });

    test('string containers keep the helper (index access yields a char)', () => {
        const input =
        "class T {\n" +
        "    test(s: string): void {\n" +
        "        const a = s['abc'];\n" +
        "        this.something(a);\n" +
        "    }\n" +
        "    something(...args: any[]): void {}\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain('Helpers.GetValue(s, "abc")');
    });

    test('nullable containers keep the helper (a null container must stay null)', () => {
        const input =
        "type D = { [key: string]: any };\n" +
        "class T {\n" +
        "    test(d: D | undefined): void {\n" +
        "        const a = d['k'];\n" +
        "        this.something(a);\n" +
        "    }\n" +
        "    something(...args: any[]): void {}\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain('Helpers.GetValue(d, "k")');
    });

    test('tuple reads go native inside the required elements and keep the helper outside', () => {
        const input =
        "type D = { [key: string]: any };\n" +
        "class T {\n" +
        "    test(tup: [any, D]): void {\n" +
        "        const a = tup[1];\n" +
        "        const b = tup[4];\n" +
        "        this.something(a, b);\n" +
        "    }\n" +
        "    something(...args: any[]): void {}\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("((java.util.List<Object>)tup).get(1)");
        expect(output).toContain("Helpers.GetValue(tup, 4)");
    });

    test('non-tuple array reads go native behind the null / off-range guard', () => {
        const input =
        "class T {\n" +
        "    test(arr: number[], symbols: string[]): void {\n" +
        "        const a = arr[0];\n" +
        "        const b = symbols[1];\n" +
        "        this.something(a, b);\n" +
        "    }\n" +
        "    something(...args: any[]): void {}\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("(arr == null || 0 >= ((java.util.List<?>)arr).size() ? null : ((java.util.List<?>)arr).get(0))");
        expect(output).toContain("(symbols == null || 1 >= ((java.util.List<?>)symbols).size() ? null : ((java.util.List<?>)symbols).get(1))");
        expect(output).not.toContain("Helpers.GetValue(arr, 0)");
        expect(output).not.toContain("Helpers.GetValue(symbols, 1)");
    });

    test('the guard keeps both helper outcomes: a null receiver and an off-range index still yield null', () => {
        const input =
        "class T {\n" +
        "    test(arr: number[]): void {\n" +
        "        const a = arr[0];\n" +
        "        this.something(a);\n" +
        "    }\n" +
        "    something(...args: any[]): void {}\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        // a bare get() throws on both paths the helper turns into null
        expect(output).not.toContain("(arr).get(0)");
        expect(output).toContain("arr == null");
        expect(output).toContain("((java.util.List<?>)arr).size()");
    });

    test('a receiver with side effects keeps the helper (single evaluation)', () => {
        const input =
        "class T {\n" +
        "    test(): void {\n" +
        "        const a = this.list()[0];\n" +
        "        this.something(a);\n" +
        "    }\n" +
        "    list(): number[] {\n" +
        "        return [];\n" +
        "    }\n" +
        "    something(...args: any[]): void {}\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("Helpers.GetValue(this.list(), 0)");
    });

    test('a split-produced receiver keeps the helper (the ccxt post-pass types the local from it)', () => {
        const input =
        "class T {\n" +
        "    test(name: string): void {\n" +
        "        const parts = name.split('.');\n" +
        "        const root = parts[0];\n" +
        "        this.something(root);\n" +
        "    }\n" +
        "    something(...args: any[]): void {}\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("Helpers.GetValue(parts, 0)");
    });

    test('a non-literal index on a proven array keeps the helper', () => {
        const input =
        "class T {\n" +
        "    test(arr: number[], i: number): void {\n" +
        "        const a = arr[i];\n" +
        "        this.something(a);\n" +
        "    }\n" +
        "    something(...args: any[]): void {}\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("Helpers.GetValue(arr, i)");
    });

    test('the out-of-range tuple index still keeps the helper', () => {
        const input =
        "type D = { [key: string]: any };\n" +
        "class T {\n" +
        "    test(tup: [any, D]): void {\n" +
        "        const b = tup[4];\n" +
        "        this.something(b);\n" +
        "    }\n" +
        "    something(...args: any[]): void {}\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("Helpers.GetValue(tup, 4)");
    });

    test('element writes keep the base emission (only reads go native)', () => {
        const input =
        "type D = { [key: string]: any };\n" +
        "class T {\n" +
        "    test(d: D, arr: number[]): void {\n" +
        "        d['x'] = 1;\n" +
        "        d['x'] += 1;\n" +
        "        arr[0] = 5;\n" +
        "        this.something(d, arr);\n" +
        "    }\n" +
        "    something(...args: any[]): void {}\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        // d6: a string-literal write into a checker-proven dictionary is a native Map.put
        expect(output).toContain('((java.util.Map<String, Object>)d).put("x", 1)');
        expect(output).not.toContain('Helpers.addElementToObject(d, "x"');
        // the array target keeps the helper (index append-at-size is not provable)
        expect(output).toContain("Helpers.addElementToObject(arr, 0, 5)");
        expect(output).toContain('((java.util.HashMap<String, Object>)d).get("x") = Helpers.add(');
    });

    test('comparison operators are reads, not writes (regression: !== is not an assignment)', () => {
        const input =
        "type D = { [key: string]: any };\n" +
        "class T {\n" +
        "    test(d: D): void {\n" +
        "        if (d['k'] !== undefined && d['k'] !== false) {\n" +
        "            this.something(d);\n" +
        "        }\n" +
        "    }\n" +
        "    something(...args: any[]): void {}\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        // both the read (d3) and the comparison on literal operands (d2) are native now; the
        // comparison must stay a comparison - nothing here is a write
        expect(output).toContain('!java.util.Objects.equals(((java.util.Map<String, Object>)d).get("k"), null)');
        expect(output).not.toContain('.put(');
        expect(output).not.toContain('!Helpers.isEqual(Helpers.GetValue(d, "k"), null)');
    });
});

describe('declared-map element reads: Helpers.GetValue(x, "lit") -> x.get("lit")', () => {
    // the checker-typed rule above needs a dict-shaped TS type. The local-typing passes
    // (build/java-local-types.js) retype declarations the checker leaves boxed, and they
    // hand the emitted declaration type to the printer; a read of such a local prints the
    // accessor with no cast, because the declaration already carries the type. Without a
    // consumer the resolver is absent and every read keeps the helper byte-identically.
    const MAP_TYPE = 'java.util.Map<String, Object>';
    const withResolver = (resolver: any, body: () => void) => {
        const printer: any = (transpiler as any).javaTranspiler;
        const previous = printer.javaDeclaredLocalTypeResolver;
        printer.javaDeclaredLocalTypeResolver = resolver;
        try {
            body();
        } finally {
            printer.javaDeclaredLocalTypeResolver = previous;
        }
    };

    test('declared map receiver reads native with no cast', () => {
        const input =
        "class T {\\n" +
        "    test(x: any): void {\\n" +
        "        const a = x['k'];\\n" +
        "        this.something(a);\\n" +
        "    }\\n" +
        "    something(...args: any[]): void {}\\n" +
        "}"
        withResolver(() => MAP_TYPE, () => {
            const output = transpiler.transpileJava(input).content;
            expect(output).toContain('Object a = x.get("k");');
            expect(output).not.toContain('Helpers.GetValue(x, "k")');
            expect(output).not.toContain('((java.util.Map<String, Object>)x).get');
        });
    });

    test('no consumer installed: the helper stays', () => {
        const input =
        "class T {\\n" +
        "    test(x: any): void {\\n" +
        "        const a = x['k'];\\n" +
        "        this.something(a);\\n" +
        "    }\\n" +
        "    something(...args: any[]): void {}\\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain('Helpers.GetValue(x, "k")');
        expect(output).not.toContain('x.get("k")');
    });

    test('a non-map declared type keeps the helper', () => {
        const input =
        "class T {\\n" +
        "    test(x: any): void {\\n" +
        "        const a = x['k'];\\n" +
        "        this.something(a);\\n" +
        "    }\\n" +
        "    something(...args: any[]): void {}\\n" +
        "}"
        for (const type of [ 'Object', 'java.util.List<Object>', 'String' ]) {
            withResolver(() => type, () => {
                const output = transpiler.transpileJava(input).content;
                expect(output).toContain('Helpers.GetValue(x, "k")');
            });
        }
        // the HashMap spelling is the same box: the accessor binds with no cast
        withResolver(() => 'HashMap<String, Object>', () => {
            const output = transpiler.transpileJava(input).content;
            expect(output).toContain('Object a = x.get("k");');
        });
    });

    test('non-literal keys and non-identifier receivers keep the helper', () => {
        const keys =
        "class T {\\n" +
        "    test(x: any, k: string): void {\\n" +
        "        const a = x[k];\\n" +
        "        this.something(a);\\n" +
        "    }\\n" +
        "    something(...args: any[]): void {}\\n" +
        "}"
        const field =
        "class T {\\n" +
        "    foo: any;\\n" +
        "    test(): void {\\n" +
        "        const a = this.foo['k'];\\n" +
        "        this.something(a);\\n" +
        "    }\\n" +
        "    something(...args: any[]): void {}\\n" +
        "}"
        withResolver(() => MAP_TYPE, () => {
            expect(transpiler.transpileJava(keys).content).toContain('Helpers.GetValue(x, k)');
            expect(transpiler.transpileJava(field).content).toContain('Helpers.GetValue(this.foo, "k")');
        });
    });

    test('a re-assigned local captured as finalX keeps the helper (finalX is Object)', () => {
        const input =
        "class T {\\n" +
        "    test(p: boolean): void {\\n" +
        "        let x = { 'a': 1 };\\n" +
        "        if (p) {\\n" +
        "            x = { 'a': 2 };\\n" +
        "        }\\n" +
        "        const y = { 'v': x['a'] };\\n" +
        "        this.something(x, y);\\n" +
        "    }\\n" +
        "    something(...args: any[]): void {}\\n" +
        "}"
        withResolver(() => MAP_TYPE, () => {
            const output = transpiler.transpileJava(input).content;
            expect(output).toContain('final Object finalX = x;');
            expect(output).toContain('Helpers.GetValue(finalX, "a")');
            expect(output).not.toContain('finalX.get(');
        });
    });

    test('the container of a nested write indexes natively, the steps above it keep the helper', () => {
        const input =
        "class T {\\n" +
        "    test(x: any, v: number): void {\\n" +
        "        x['a']['b'] = v;\\n" +
        "        x['c']['d']['e'] = v;\\n" +
        "        x['f'] = v;\\n" +
        "        this.something(x);\\n" +
        "    }\\n" +
        "    something(...args: any[]): void {}\\n" +
        "}"
        withResolver(() => MAP_TYPE, () => {
            const output = transpiler.transpileJava(input).content;
            // first step of each chain is a read of the declared map
            expect(output).toContain('Helpers.addElementToObject(x.get("a"), "b", v);');
            expect(output).toContain('Helpers.addElementToObject(Helpers.GetValue(x.get("c"), "d"), "e", v);');
            // a single-key write is not a chain: java-12's family, untouched here
            expect(output).toContain('Helpers.addElementToObject(x, "f", v);');
        });
        // without a consumer every step is the helper again
        const baseline = transpiler.transpileJava(input).content;
        expect(baseline).toContain('Helpers.addElementToObject(Helpers.GetValue(x, "a"), "b", v);');
        expect(baseline).toContain('Helpers.addElementToObject(Helpers.GetValue(Helpers.GetValue(x, "c"), "d"), "e", v);');
    });
});

describe('java helper-family inlining (+ - * / += -=)', () => {
    test('string + string with one statically-String operand prints a native concat', () => {
        const input =
        "class T {\n" +
        "    f(b: string): void {\n" +
        "        const x = \"a\" + b;\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain('String x = ("a" + b);');
        expect(output).not.toContain('Helpers.add(');
    });

    test('nested concat chain inlines every link', () => {
        const input =
        "class T {\n" +
        "    f(b: string): void {\n" +
        "        const x = (\"a\" + b) + \"c\";\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain('String x = ((("a" + b)) + "c");');
        expect(output).not.toContain('Helpers.add(');
    });

    test('+= with a string literal prints a native concat assignment', () => {
        const input =
        "class T {\n" +
        "    f(): void {\n" +
        "        let s = \"x\";\n" +
        "        s += \"y\";\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain('s = (s + "y");');
        expect(output).not.toContain('Helpers.add(');
    });

    test('integer literals print native long arithmetic, / prints double division', () => {
        const input =
        "class T {\n" +
        "    f(): void {\n" +
        "        const x = 2 * 3;\n" +
        "        const w = 7 + 1;\n" +
        "        const y = 10 / 4;\n" +
        "        const q = (2 * 3) * 4;\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain('Long x = (2L * 3L);');
        expect(output).toContain('Long w = (7L + 1L);');
        expect(output).toContain('Double y = (((double) 10) / ((double) 4));');
        expect(output).toContain('Long q = (((2L * 3L)) * 4L);');
        expect(output).not.toContain('Helpers.multiply(');
        expect(output).not.toContain('Helpers.divide(');
    });

    test('mixed literal kinds and non-literal numbers keep the helper', () => {
        const input =
        "class T {\n" +
        "    f(a: number, b: number): void {\n" +
        "        const z = 1.5 * 2;\n" +
        "        const x = a + b;\n" +
        "        const y = a * 3;\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain('Object z = Helpers.multiply(1.5, 2);');
        expect(output).toContain('Object x = Helpers.add(a, b);');
        expect(output).toContain('Object y = Helpers.multiply(a, 3);');
    });

    test('string-typed call operands do not anchor a concat (Java declares them Object)', () => {
        const input =
        "class T {\n" +
        "    host(path: string): string { return path; }\n" +
        "    f(a: string): void {\n" +
        "        const x = this.host(a) + this.host(a);\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain('Helpers.add(this.host(a), this.host(a))');
    });

    test('nullable aliases keep the helper', () => {
        const input =
        "class T {\n" +
        "    f(a: Str, b: Str, n: Num): void {\n" +
        "        const x = a + b;\n" +
        "        const y = n + 1;\n" +
        "    }\n" +
        "}\n"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain('Object x = Helpers.add(a, b);');
        expect(output).toContain('Object y = Helpers.add(n, 1);');
    });
});
describe('java string-concat chains anchored by a declared String', () => {
    // the printer names only literals and its own native concats itself; locals whose
    // emitted Java declaration is `String x = ` (the embedding build layer's retyping)
    // and calls to hand-written `public String` runtime methods come back through
    // javaExpressionTypeResolver — these tests stub that resolver with a name map
    const withStrings = (strings, input) => {
        transpiler.javaTranspiler.javaExpressionTypeResolver = (node) => strings[node?.escapedText];
        try {
            return transpiler.transpileJava(input).content;
        } finally {
            transpiler.javaTranspiler.javaExpressionTypeResolver = undefined;
        }
    };
    test('two checker-typed string locals chain natively when one is a declared String', () => {
        const input =
        "class T {\n" +
        "    f(a: string, b: string): void {\n" +
        "        const x = a + b;\n" +
        "        const y = a + b + a;\n" +
        "    }\n" +
        "}"
        const output = withStrings({ 'a': 'String' }, input);
        expect(output).toContain('String x = (a + b);');
        expect(output).toContain('String y = ((a + b) + a);');
        expect(output).not.toContain('Helpers.add(');
    });
    test('a String anchor on the right side is enough', () => {
        const input =
        "class T {\n" +
        "    f(a: string, b: string): void {\n" +
        "        const x = a + b;\n" +
        "    }\n" +
        "}"
        const output = withStrings({ 'b': 'String' }, input);
        expect(output).toContain('String x = (a + b);');
        expect(output).not.toContain('Helpers.add(');
    });
    test('no resolver verdict keeps the helper', () => {
        const input =
        "class T {\n" +
        "    f(a: string, b: string): void {\n" +
        "        const x = a + b;\n" +
        "    }\n" +
        "}"
        expect(withStrings({}, input)).toContain('Object x = Helpers.add(a, b);');
        expect(transpiler.transpileJava(input).content).toContain('Object x = Helpers.add(a, b);');
    });
    test('a resolver verdict of another Java type keeps the helper', () => {
        const input =
        "class T {\n" +
        "    f(a: string, b: string): void {\n" +
        "        const x = a + b;\n" +
        "    }\n" +
        "}"
        expect(withStrings({ 'a': 'Long' }, input)).toContain('Object x = Helpers.add(a, b);');
    });
    test('a nullable alias leaf chains natively off a declared String anchor (B-13)', () => {
        const input =
        "class T {\n" +
        "    f(a: Str, b: string): void {\n" +
        "        const x = a + b;\n" +
        "    }\n" +
        "}"
        const output = withStrings({ 'a': 'String', 'b': 'String' }, input);
        expect(output).toContain('Object x = (a + b);');
        expect(output).not.toContain('Helpers.add(');
    });
    test('a declared String local chains with a call operand natively', () => {
        const input =
        "class T {\n" +
        "    tag(): string { return \"x\"; }\n" +
        "    f(name: string): void {\n" +
        "        const x = name + this.tag();\n" +
        "    }\n" +
        "}"
        const output = withStrings({ 'name': 'String' }, input);
        expect(output).toContain('String x = (name + this.tag());');
        expect(output).not.toContain('Helpers.add(');
    });
});

describe('java literal-anchored concat (`a + "lit"` whatever the other operand is)', () => {
    const withStrings = (strings, input) => {
        transpiler.javaTranspiler.javaExpressionTypeResolver = (node) => strings[node?.escapedText];
        try {
            return transpiler.transpileJava(input).content;
        } finally {
            transpiler.javaTranspiler.javaExpressionTypeResolver = undefined;
        }
    };

    test('a nullable alias operand concatenates natively against a literal', () => {
        const input =
        "type Str = string | undefined;\n" +
        "class T {\n" +
        "    f(a: Str): void {\n" +
        "        const x = a + \"lit\";\n" +
        "        const y = \"pre\" + a;\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain('Object x = (a + "lit");');
        expect(output).toContain('Object y = ("pre" + a);');
        expect(output).not.toContain('Helpers.add(');
    });

    test('a string-literal-union element read concatenates natively against a literal', () => {
        const input =
        "class T {\n" +
        "    f(m: { t: 'a' | 'b' }): void {\n" +
        "        const x = m['t'] + \" orders\";\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain('+ " orders");');
        expect(output).not.toContain('Helpers.add(');
    });

    test('an any-valued dict read keeps the helper (the value can be a Double)', () => {
        const input =
        "type Dict = { [key: string]: any };\n" +
        "class T {\n" +
        "    f(d: Dict): void {\n" +
        "        const x = d[\"type\"] + \" orders\";\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain('Helpers.add(');
    });

    test('a boolean operand concatenates natively against a literal', () => {
        const input =
        "class T {\n" +
        "    f(b: boolean): void {\n" +
        "        const x = b + \"!\";\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain('Object x = (b + "!");');
    });

    test('an integer-literal operand concatenates natively', () => {
        const input =
        "class T {\n" +
        "    f(): void {\n" +
        "        const x = 2 + \" items\";\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).not.toContain('Helpers.add(');
    });

    test('a number operand keeps the helper (a boxed Double is added, not concatenated)', () => {
        const input =
        "class T {\n" +
        "    f(n: number, a: any): void {\n" +
        "        const x = n + \"s\";\n" +
        "        const y = a + \"s\";\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain('Helpers.add(n, "s")');
        expect(output).toContain('Helpers.add(a, "s")');
    });

    test('a ternary operand keeps the helper (the `+` would re-parse inside it)', () => {
        const input =
        "class T {\n" +
        "    f(a: Str, c: boolean): void {\n" +
        "        const x = (c ? a : \"b\") + \"s\";\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain('Helpers.add(');
    });

    test('an optional-chain operand keeps the helper', () => {
        const input =
        "class T {\n" +
        "    f(d: any): void {\n" +
        "        const x = d?.type + \"s\";\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain('Helpers.add(');
    });

    test('+= against a literal on a nullable alias prints the native concat assignment', () => {
        const input =
        "type Str = string | undefined;\n" +
        "class T {\n" +
        "    f(a: Str): void {\n" +
        "        let s: Str = undefined;\n" +
        "        s += \"lit\";\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain('s = (s + "lit");');
        expect(output).not.toContain('Helpers.add(');
    });

    test('a declared String anchor concatenates a nullable alias operand natively', () => {
        const input =
        "class T {\n" +
        "    f(a: Str, b: string): void {\n" +
        "        const x = a + b;\n" +
        "    }\n" +
        "}"
        const output = withStrings({ 'a': 'String' }, input);
        expect(output).toContain('Object x = (a + b);');
        expect(output).not.toContain('Helpers.add(');
    });
});


describe('java widened native add (numeric `+` on provably non-null operands)', () => {
    test('primitive int for-counter widens explicitly to a native long add', () => {
        const input =
        "class T {\n" +
        "    f(n: number): void {\n" +
        "        for (let i = 0; i < n; i++) {\n" +
        "            const x = i + 1;\n" +
        "        }\n" +
        "    }\n" +
        "}\n"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain('Object x = (((long) i) + 1L);');
        expect(output).not.toContain('Helpers.add(i, 1)');
    });

    test('two int counters widen both operands (an int sum would wrap and box Integer)', () => {
        const input =
        "class T {\n" +
        "    f(n: number): void {\n" +
        "        for (let i = 0; i < n; i++) {\n" +
        "            for (let j = 0; j < n; j++) {\n" +
        "                const x = i + j;\n" +
        "            }\n" +
        "        }\n" +
        "    }\n" +
        "}\n"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain('Object x = (((long) i) + ((long) j));');
        expect(output).not.toContain('Helpers.add(');
    });

    test('String length read widens to a native long add', () => {
        const input =
        "class T {\n" +
        "    f(s: string): void {\n" +
        "        const x = s.length + 1;\n" +
        "    }\n" +
        "}\n"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain('Object x = (((long) ((String)s).length()) + 1L);');
        expect(output).not.toContain('Helpers.add(');
    });

    test('List size read widens to a native long add', () => {
        const input =
        "class T {\n" +
        "    f(a: number[]): void {\n" +
        "        const x = a.length + 1;\n" +
        "    }\n" +
        "}\n"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain('Object x = (((long) ((java.util.List<?>)a).size()) + 1L);');
        expect(output).not.toContain('Helpers.add(');
    });

    test('a double-valued int operand needs no widening (int promotes natively)', () => {
        const input =
        "class T {\n" +
        "    f(n: number): void {\n" +
        "        for (let i = 0; i < n; i++) {\n" +
        "            const x = i + 1.5;\n" +
        "        }\n" +
        "    }\n" +
        "}\n"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain('Object x = (i + 1.5);');
        expect(output).not.toContain('Helpers.add(');
    });

    test('a counter with any assignment write keeps the helper', () => {
        const input =
        "class T {\n" +
        "    f(n: number): void {\n" +
        "        for (let i = 0; i < n; i++) {\n" +
        "            const x = i + 1;\n" +
        "            i += 1;\n" +
        "        }\n" +
        "    }\n" +
        "}\n"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain('Object x = Helpers.add(i, 1);');
        expect(output).not.toContain('((long) i)');
    });

    test('a boxed local (Object in Java) keeps the helper even with a numeric TS type', () => {
        const input =
        "class T {\n" +
        "    f(): void {\n" +
        "        const i = 0;\n" +
        "        const x = i + 1;\n" +
        "    }\n" +
        "}\n"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain('Object x = Helpers.add(i, 1);');
    });

    test('an unresolved this.milliseconds() (printed as callDynamically) keeps the helper', () => {
        const input =
        "class T {\n" +
        "    f(): void {\n" +
        "        const x = this.milliseconds() + 10000;\n" +
        "    }\n" +
        "}\n"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain('Helpers.callDynamically(this, "milliseconds"');
        expect(output).toContain('Helpers.add(');
        expect(output).not.toContain('+ 10000L');
    });

    test('a class-local override of milliseconds keeps the helper', () => {
        const input =
        "class T {\n" +
        "    milliseconds(): string { return \"x\"; }\n" +
        "    f(): void {\n" +
        "        const x = this.milliseconds() + 1;\n" +
        "    }\n" +
        "}\n"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain('Object x = Helpers.add(this.milliseconds(), 1);');
    });

    test('- and * keep their own literal rule (the counters stay on the helper)', () => {
        const input =
        "class T {\n" +
        "    f(n: number): void {\n" +
        "        for (let i = 0; i < n; i++) {\n" +
        "            const x = i - 1;\n" +
        "            const y = i * 2;\n" +
        "        }\n" +
        "    }\n" +
        "}\n"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain('Object x = Helpers.subtract(i, 1);');
        expect(output).toContain('Object y = Helpers.multiply(i, 2);');
    });
});

// java-19: `this.milliseconds()` is a hand-written BaseExchange method declared
// `public Long milliseconds()` (java/lib/.../BaseExchange.java), so a call to it is a
// provable Java long operand. The base-tier path below is what makes the call resolve
// to that declaration - the real run prints ts/src/base/Exchange.ts, a venue override
// prints its own class file and must keep the helper.
describe('java hand-written return-type arithmetic (java-19)', () => {
    const TMP = path.join(__dirname, 'files', 'tmp-java19');
    const BASE_FIXTURE = path.join(TMP, 'ts', 'src', 'base', 'Exchange.ts');
    const VENUE_FIXTURE = path.join(TMP, 'exchanges', 'bitfake.ts');

    const baseSource =
    "class T {\n" +
    "    milliseconds(): number { return 1; }\n" +
    "    f1(since): void {\n" +
    "        since = this.milliseconds() - 2592000000;\n" +
    "    }\n" +
    "    f2(since): void {\n" +
    "        since = this.milliseconds() - 86400000 * 30;\n" +
    "    }\n" +
    "    f3(a: any, b: any): void {\n" +
    "        a = this.milliseconds() - b;\n" +
    "    }\n" +
    "    f4(a: any): void {\n" +
    "        a = this.milliseconds() - 1000.5;\n" +
    "    }\n" +
    "    f5(a: any): void {\n" +
    "        a = 1000 - this.milliseconds();\n" +
    "    }\n" +
    "    f6(a: any): void {\n" +
    "        a = this.milliseconds() * 1000;\n" +
    "    }\n" +
    "}";

    let baseOutput: string;
    let venueOutput: string;

    beforeAll(() => {
        fs.mkdirSync(path.dirname(BASE_FIXTURE), { recursive: true });
        fs.mkdirSync(path.dirname(VENUE_FIXTURE), { recursive: true });
        fs.writeFileSync(BASE_FIXTURE, baseSource);
        fs.writeFileSync(VENUE_FIXTURE, baseSource);
        const byPath = new Transpiler({ 'verbose': false, 'java': { 'parser': { 'NUM_LINES_END_FILE': 0 } } });
        baseOutput = byPath.transpileJavaByPath(BASE_FIXTURE).content;
        venueOutput = byPath.transpileJavaByPath(VENUE_FIXTURE).content;
    });

    afterAll(() => {
        fs.rmSync(TMP, { recursive: true, force: true });
    });

    test('subtract anchored on the hand-written milliseconds() prints native long arithmetic', () => {
        expect(baseOutput).toContain('since = (this.milliseconds() - 2592000000L);');
        expect(baseOutput).not.toContain('Helpers.subtract(this.milliseconds(), 2592000000L)');
    });

    test('a nested literal product prints as a native long right operand', () => {
        expect(baseOutput).toContain('since = (this.milliseconds() - (86400000L * 30L));');
        expect(baseOutput).not.toContain('Helpers.subtract(this.milliseconds(), (86400000L * 30L))');
    });

    test('an unprovable right operand keeps the subtract helper', () => {
        expect(baseOutput).toContain('a = Helpers.subtract(this.milliseconds(), b);');
    });

    test('a double right operand keeps the subtract helper (the rule is long-only)', () => {
        expect(baseOutput).toContain('a = Helpers.subtract(this.milliseconds(), 1000.5);');
    });

    test('the anchor must be the left operand of the subtraction', () => {
        expect(baseOutput).toContain('a = Helpers.subtract(1000, this.milliseconds());');
    });

    test('sibling arithmetic operators are untouched by this rule', () => {
        expect(baseOutput).toContain('a = Helpers.multiply(this.milliseconds(), 1000);');
    });

    test('a venue declaring its own milliseconds() keeps the helper', () => {
        expect(venueOutput).toContain('since = Helpers.subtract(this.milliseconds(), 2592000000L);');
    });
});

describe('java optional parameter unpacking', () => {
    test('literal defaults unpack natively from optionalArgs (no Helpers.getArg)', () => {
        const input =
        "class T {\n" +
        "    m(arg, symbol = undefined) {\n" +
        "        return symbol;\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("public Object m(Object arg, Object... optionalArgs)");
        expect(output).toContain("Object symbol = optionalArgs != null && optionalArgs.length > 0 ? optionalArgs[0] : null;");
        expect(output).not.toContain("Helpers.getArg");
    });

    test('every literal default shape keeps its index and its default value', () => {
        const input =
        "class T {\n" +
        "    m(arg, a = 1, b = true, c = 'x', d = {}, e = []) {\n" +
        "        return a;\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("Object a = optionalArgs != null && optionalArgs.length > 0 ? optionalArgs[0] : 1;");
        expect(output).toContain("Object b = optionalArgs != null && optionalArgs.length > 1 ? optionalArgs[1] : true;");
        expect(output).toContain("Object c = optionalArgs != null && optionalArgs.length > 2 ? optionalArgs[2] : \"x\";");
        expect(output).toContain("Object d = optionalArgs != null && optionalArgs.length > 3 ? optionalArgs[3] : new java.util.HashMap<String, Object>() {{}};");
        expect(output).toContain("Object e = optionalArgs != null && optionalArgs.length > 4 ? optionalArgs[4] : new java.util.ArrayList<Object>(java.util.Arrays.asList());");
        expect(output).not.toContain("Helpers.getArg");
    });

    test('every native unpack is null-guarded, like the helper it replaces', () => {
        const input =
        "class T {\n" +
        "    m(arg, params = {}) {\n" +
        "        return params;\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        // a caller passing a bare trailing null supplies a null varargs array; the
        // guard keeps that reading like an empty one instead of throwing NPE
        expect(output).not.toMatch(/= optionalArgs\.length/);
        expect(output).toContain("optionalArgs != null && optionalArgs.length > 0");
    });

    test('defaults that are not pure literals keep Helpers.getArg', () => {
        const input =
        "class T {\n" +
        "    m(arg, params = this.something(arg), other = someVar) {\n" +
        "        return params;\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("Helpers.getArg(optionalArgs, 0, Helpers.callDynamically(this, \"something\", new Object[] { arg }));");
        expect(output).toContain("Helpers.getArg(optionalArgs, 1, someVar);");
        expect(output).not.toContain("optionalArgs.length >");
    });

    test('async method unpacks natively inside the supplyAsync lambda', () => {
        const input =
        "class T {\n" +
        "    async m(arg, params = {}) {\n" +
        "        return this.something(params);\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("            Object parameters = optionalArgs != null && optionalArgs.length > 0 ? optionalArgs[0] : new java.util.HashMap<String, Object>() {{}};");
        expect(output).not.toContain("Helpers.getArg");
    });

    test('constructor optional parameters unpack natively', () => {
        const input =
        "class T {\n" +
        "    constructor(a, b = 1) {\n" +
        "        this.b = b;\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("T(Object a, Object... optionalArgs)");
        expect(output).toContain("Object b = optionalArgs != null && optionalArgs.length > 0 ? optionalArgs[0] : 1;");
        expect(output).not.toContain("Helpers.getArg");
    });
});

// `obj[key] = value` prints the runtime helper by default; the native Map.put is
// printed only when the checker proves the target is a TS dictionary, the key is a
// string literal and the receiver is not a shared field map.
describe('java element-access write: native Map.put for proven dictionaries', () => {
    const put = '((java.util.Map<String, Object>)request).put("symbol", "BTC/USDT")';

    test('dictionary-typed local with a string-literal key prints Map.put', () => {
        const input =
        "class T {\n" +
        "    test(): void {\n" +
        "        const request: { [key: string]: any } = {};\n" +
        "        request[\"symbol\"] = \"BTC/USDT\";\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain(put);
        expect(output).not.toContain("addElementToObject");
    });

    test('dictionary-typed parameter with a string-literal key prints Map.put', () => {
        const input =
        "class T {\n" +
        "    test(request: { [key: string]: any }): void {\n" +
        "        request[\"symbol\"] = \"BTC/USDT\";\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain(put);
        expect(output).not.toContain("addElementToObject");
    });

    test('shared field map keeps the helper (ConcurrentHashMap null-removal + monitor)', () => {
        const input =
        "class T {\n" +
        "    test(): void {\n" +
        "        this.options[\"sandboxMode\"] = true;\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain('Helpers.addElementToObject(this.options, "sandboxMode", true)');
        expect(output).not.toContain(".put(");
    });

    test('string-typed key prints the typed put with the (String) cast', () => {
        const input =
        "class T {\n" +
        "    test(code: string): void {\n" +
        "        const request: { [key: string]: any } = {};\n" +
        "        request[code] = 1;\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain('((java.util.Map<String, Object>)request).put((String)code, 1)');
        expect(output).not.toContain("addElementToObject");
    });

    test('element read as key keeps the helper (GetValue returns Object)', () => {
        const input =
        "class T {\n" +
        "    test(market: { [key: string]: any }): void {\n" +
        "        const request: { [key: string]: any } = {};\n" +
        "        request[market[\"id\"]] = 1;\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        // the key is a plain read, so the d3 rule rewrites it; the write stays the helper
        // because the key is not a string literal
        expect(output).toContain('Helpers.addElementToObject(request, ((java.util.Map<String, Object>)market).get("id"), 1)');
        expect(output).not.toContain("Helpers.GetValue(");
    });

    test('array target keeps the helper (index append-at-size is not provable)', () => {
        const input =
        "class T {\n" +
        "    test(): void {\n" +
        "        const arr: any[] = [];\n" +
        "        arr[0] = 1;\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("Helpers.addElementToObject(arr, 0, 1)");
        expect(output).not.toContain(".set(");
    });

    test('object-literal local keeps the native put even when its type is any', () => {
        const input =
        "class T {\n" +
        "    test(): void {\n" +
        "        const x: any = {};\n" +
        "        x[\"k\"] = 1;\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        // the initializer is the object literal the printer turns into `new HashMap`, so the
        // receiver is a HashMap on every path the local takes
        expect(output).toContain('((java.util.Map<String, Object>)x).put("k", 1)');
        expect(output).not.toContain("addElementToObject");
    });

    test('interface-typed local with an object-literal initializer prints Map.put', () => {
        const input =
        "interface Foo { a: number; }\n" +
        "class T {\n" +
        "    test(): void {\n" +
        "        const x: Foo = { a: 1 };\n" +
        "        x[\"a\"] = 2;\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain('((java.util.Map<String, Object>)x).put("a", 2)');
        expect(output).not.toContain("addElementToObject");
    });

    test('a local reassigned after the object literal keeps the helper (D2)', () => {
        const input =
        "class T {\n" +
        "    test(foo: Foo, other: any): void {\n" +
        "        let x: Foo = { a: 1 };\n" +
        "        x = other;\n" +
        "        x[\"a\"] = 2;\n" +
        "    }\n" +
        "}\n" +
        "interface Foo { a: number; }"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("Helpers.addElementToObject(x, \"a\", 2)");
    });

    test('numeric key on a dictionary keeps the helper (Map.put takes a String key)', () => {
        const input =
        "class T {\n" +
        "    test(): void {\n" +
        "        const request: { [key: string]: any } = {};\n" +
        "        request[0] = 1;\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("Helpers.addElementToObject(request, 0, 1)");
    });

    test('nested dictionary write prints the native put on the inner map', () => {
        const input =
        "class T {\n" +
        "    test(): void {\n" +
        "        const features: { [key: string]: { [key: string]: any } } = {};\n" +
        "        features[\"spot\"][\"limit\"] = 1;\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain('((java.util.Map<String, Object>)Helpers.GetValue(features, "spot")).put("limit", 1)');
    });
});

// phase 2 of the element-write rule: keys proven String by the checker reach
// Map.put through a (String) cast, and receivers whose initializer is an object
// literal (or a call that only ever returns one) are plain HashMaps at runtime.
describe('java element-access write: proven-String keys and HashMap receivers', () => {
    test('string-literal-union key prints the typed put with the (String) cast', () => {
        const input =
        "class T {\n" +
        "    test(flag: boolean): void {\n" +
        "        const request: { [key: string]: any } = {};\n" +
        "        const key = flag ? \"orderId\" : \"strategyId\";\n" +
        "        request[key] = 1;\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain('((java.util.Map<String, Object>)request).put((String)key, 1)');
        expect(output).not.toContain("addElementToObject");
    });

    test('a call whose body returns object literals only prints Map.put', () => {
        const input =
        "interface BalanceAccount { free: any; used: any; total: any; }\n" +
        "class T {\n" +
        "    account(): BalanceAccount {\n" +
        "        return { \"free\": undefined, \"used\": undefined, \"total\": undefined };\n" +
        "    }\n" +
        "    test(): void {\n" +
        "        const account = this.account();\n" +
        "        account[\"used\"] = 1;\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain('((java.util.Map<String, Object>)account).put("used", 1)');
        expect(output).not.toContain("addElementToObject");
    });

    test('a call that can return something else keeps the helper', () => {
        const input =
        "interface Foo { a: number; }\n" +
        "class T {\n" +
        "    pick(x: Foo): Foo {\n" +
        "        if (x.a === 1) {\n" +
        "            return { a: 1 };\n" +
        "        }\n" +
        "        return x;\n" +
        "    }\n" +
        "    test(x: Foo): void {\n" +
        "        const y = this.pick(x);\n" +
        "        y[\"a\"] = 2;\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("Helpers.addElementToObject(y, \"a\", 2)");
    });

    test('a call returning a class instance keeps the helper (reflection branch)', () => {
        const input =
        "class Holder { a = 0; }\n" +
        "class T {\n" +
        "    make(): Holder {\n" +
        "        return { a: 1 } as any;\n" +
        "    }\n" +
        "    test(): void {\n" +
        "        const holder = this.make();\n" +
        "        holder[\"a\"] = 2;\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("Helpers.addElementToObject(holder, \"a\", 2)");
    });

    test('a call returning an array keeps the helper (append branch)', () => {
        const input =
        "class T {\n" +
        "    make(): number[] {\n" +
        "        return [1];\n" +
        "    }\n" +
        "    test(): void {\n" +
        "        const xs = this.make();\n" +
        "        xs[0] = 2;\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("Helpers.addElementToObject(xs, 0, 2)");
    });

    test('a parameter receiver without a dictionary type keeps the helper', () => {
        const input =
        "class T {\n" +
        "    test(fee: any): void {\n" +
        "        fee[\"cost\"] = 1;\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain('Helpers.addElementToObject(fee, "cost", 1)');
    });

    test('a nested write on a proven HashMap local keeps the helper (the read is untyped)', () => {
        const input =
        "class T {\n" +
        "    test(): void {\n" +
        "        const x = { a: {} };\n" +
        "        x[\"a\"][\"b\"] = 1;\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain('Helpers.addElementToObject(Helpers.GetValue(x, "a"), "b", 1)');
    });

    test('a string-typed key on a proven HashMap local prints the typed put', () => {
        const input =
        "class T {\n" +
        "    test(code: string): void {\n" +
        "        const result = { \"a\": 1 };\n" +
        "        result[code] = 2;\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain('((java.util.Map<String, Object>)result).put((String)code, 2)');
        expect(output).not.toContain("addElementToObject");
    });

    test('an any-typed key on a dictionary receiver keeps the helper', () => {
        const input =
        "class T {\n" +
        "    test(code: any): void {\n" +
        "        const result: { [key: string]: any } = {};\n" +
        "        result[code] = 2;\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("Helpers.addElementToObject(result, code, 2)");
    });

    test('a number-typed key on a proven HashMap local keeps the helper', () => {
        const input =
        "class T {\n" +
        "    test(i: number): void {\n" +
        "        const result = { \"a\": 1 };\n" +
        "        result[i] = 2;\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("Helpers.addElementToObject(result, i, 2)");
    });
});

describe('helper removal: native comparison / containsKey / size', () => {
    test('checker-proven array length prints List.size() instead of the runtime helper', () => {
        const input =
        "class T {\n" +
        "    f(xs: number[]): void {\n" +
        "        const n = xs.length;\n" +
        "        return;\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("((java.util.List<?>)xs).size()");
        expect(output).not.toContain("Helpers.getArrayLength");
    });

    test('unproven (any) receiver keeps the length helper', () => {
        const input =
        "class T {\n" +
        "    f(x: any): void {\n" +
        "        const n = x.length;\n" +
        "        return;\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("Helpers.getArrayLength(x)");
    });

    test('rest parameter (varargs array, not a List) keeps the length helper', () => {
        const input =
        "class T {\n" +
        "    f(...args: any[]): void {\n" +
        "        const n = args.length;\n" +
        "        return;\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("Helpers.getArrayLength(args)");
    });

    test('for-loop counter with an integer-literal initializer compares natively', () => {
        const input =
        "class T {\n" +
        "    f(xs: number[]): void {\n" +
        "        for (let i = 0; i < xs.length; i++) {\n" +
        "            return;\n" +
        "        }\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("for (var i = 0; i < ((java.util.List<?>)xs).size(); i++)");
        expect(output).not.toContain("Helpers.isLessThan");
    });

    test('while-loop counter (Object-typed local, not a for-counter) keeps the comparison helper', () => {
        const input =
        "class T {\n" +
        "    f(xs: number[]): void {\n" +
        "        let i = 0;\n" +
        "        while (i < xs.length) {\n" +
        "            i++;\n" +
        "        }\n" +
        "        return;\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("while (Helpers.isLessThan(i, ((java.util.List<?>)xs).size()))");
    });

    test('Object operands keep the comparison helper', () => {
        const input =
        "class T {\n" +
        "    f(a: number, b: number): void {\n" +
        "        if (a < b) {\n" +
        "            return;\n" +
        "        }\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("Helpers.isLessThan(a, b)");
    });

    test('string length stays a native int inside a comparison', () => {
        const input =
        "class T {\n" +
        "    f(s: string): void {\n" +
        "        if (s.length > 3) {\n" +
        "            return;\n" +
        "        }\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("((String)s).length() > 3");
        expect(output).not.toContain("Helpers.isGreaterThan");
    });

    test('checker-proven object receiver prints Map.containsKey', () => {
        const input =
        "interface Cfg { [key: string]: number; }\n" +
        "class T {\n" +
        "    f(c: Cfg, k: string): void {\n" +
        "        if (k in c) {\n" +
        "            return;\n" +
        "        }\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("((java.util.Map<?, ?>)c).containsKey(k)");
        expect(output).not.toContain("Helpers.inOp");
    });

    test('string-literal-union key prints Map.containsKey', () => {
        const input =
        "interface Cfg { [key: string]: number; }\n" +
        "class T {\n" +
        "    f(c: Cfg, k: 'a' | 'b'): void {\n" +
        "        if (k in c) {\n" +
        "            return;\n" +
        "        }\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("((java.util.Map<?, ?>)c).containsKey(k)");
    });

    test('array receiver of `in` keeps the membership helper', () => {
        const input =
        "class T {\n" +
        "    f(arr: number[], k: string): void {\n" +
        "        if (k in arr) {\n" +
        "            return;\n" +
        "        }\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("Helpers.inOp(arr, k)");
    });

    test('any-typed receiver of `in` keeps the membership helper', () => {
        const input =
        "class T {\n" +
        "    f(c: any, k: string): void {\n" +
        "        if (k in c) {\n" +
        "            return;\n" +
        "        }\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("Helpers.inOp(c, k)");
    });

    test('unproven nested receiver keeps the membership helper', () => {
        const input =
        "interface Cfg { [key: string]: number; }\n" +
        "interface Outer { [key: string]: Cfg; }\n" +
        "class T {\n" +
        "    f(o: Outer, k: string, j: string): void {\n" +
        "        if (j in o[k]) {\n" +
        "            return;\n" +
        "        }\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("((java.util.Map<?, ?>)Helpers.GetValue(o, k)).containsKey(j)");
    });

    // ---- java-17: printed-primitive comparison operands -------------------
    // `.length`, `.indexOf`/`.search`, Math.round and Math.floor/ceil/pow all print
    // through emitters whose Java text is a primitive, so the ordered comparison no
    // longer round-trips through the Object-taking helper.

    test('unproven length receiver compares natively through the int-returning helper', () => {
        const input =
        "class T {\\n" +
        "    f(o: any): boolean {\\n" +
        "        return o.length > 0;\\n" +
        "    }\\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("Helpers.getArrayLength(o) > 0");
        expect(output).not.toContain("Helpers.isGreaterThan");
    });

    test('indexOf result compares natively (int) instead of through the comparison helper', () => {
        const input =
        "class T {\\n" +
        "    f(s: any, needle: any): boolean {\\n" +
        "        return s.indexOf(needle) >= 0;\\n" +
        "    }\\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("Helpers.getIndexOf(s, needle) >= 0");
        expect(output).not.toContain("Helpers.isGreaterThanOrEqual");
    });

    test('zero-argument indexOf (no printed helper route) keeps the comparison helper', () => {
        const input =
        "class T {\\n" +
        "    f(s: any): boolean {\\n" +
        "        return s.indexOf() >= 0;\\n" +
        "    }\\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("Helpers.isGreaterThanOrEqual(s.indexOf(), 0)");
    });

    test('search result (String.indexOf, int) compares natively', () => {
        const input =
        "class T {\\n" +
        "    f(s: any, needle: any): boolean {\\n" +
        "        return s.search(needle) >= 0;\\n" +
        "    }\\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain('((String)s).indexOf(needle) >= 0');
        expect(output).not.toContain("Helpers.isGreaterThanOrEqual");
    });

    test('Math.round result (long, never NaN) compares natively under <', () => {
        const input =
        "class T {\\n" +
        "    f(x: number): boolean {\\n" +
        "        return Math.round(x) < 5;\\n" +
        "    }\\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("Math.round(Double.parseDouble(Helpers.toString(x))) < 5");
        expect(output).not.toContain("Helpers.isLessThan");
    });

    test('Math.floor result (double) keeps `<=` (NaN ordering) and goes native under `>`', () => {
        const lessEqual =
        "class T {\\n" +
        "    f(x: number): boolean {\\n" +
        "        return Math.floor(x) <= 5;\\n" +
        "    }\\n" +
        "}"
        const lessEqualOutput = transpiler.transpileJava(lessEqual).content;
        expect(lessEqualOutput).toContain("Helpers.isLessThanOrEqual((Math.floor(Double.parseDouble(Helpers.toString(x)))), 5)");
        const greater =
        "class T {\\n" +
        "    f(x: number): boolean {\\n" +
        "        return Math.floor(x) > 5;\\n" +
        "    }\\n" +
        "}"
        const greaterOutput = transpiler.transpileJava(greater).content;
        expect(greaterOutput).toContain("(Math.floor(Double.parseDouble(Helpers.toString(x)))) > 5");
        expect(greaterOutput).not.toContain("Helpers.isGreaterThan");
    });

    test('Math.pow result (double) goes native under `>` and keeps `>=`', () => {
        const greater =
        "class T {\\n" +
        "    f(x: number, y: number): boolean {\\n" +
        "        return Math.pow(x, y) > 5;\\n" +
        "    }\\n" +
        "}"
        const greaterOutput = transpiler.transpileJava(greater).content;
        expect(greaterOutput).toContain("Math.pow(Double.parseDouble(Helpers.toString(x)), Double.parseDouble(Helpers.toString(y))) > 5");
        expect(greaterOutput).not.toContain("Helpers.isGreaterThan");
        const greaterEqual =
        "class T {\\n" +
        "    f(x: number, y: number): boolean {\\n" +
        "        return Math.pow(x, y) >= 5;\\n" +
        "    }\\n" +
        "}"
        const greaterEqualOutput = transpiler.transpileJava(greaterEqual).content;
        expect(greaterEqualOutput).toContain("Helpers.isGreaterThanOrEqual(Math.pow(Double.parseDouble(Helpers.toString(x)), Double.parseDouble(Helpers.toString(y))), 5)");
    });

    test('two numeric literals compare natively, a fractional literal one-sidedly', () => {
        const input =
        "class T {\\n" +
        "    f(): boolean {\\n" +
        "        return 1.5 > 1;\\n" +
        "    }\\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("return 1.5 > 1;");
        expect(output).not.toContain("Helpers.isGreaterThan");
    });

    test('a NaN-capable double operand keeps `<` against a primitively-printed side', () => {
        const input =
        "class T {\\n" +
        "    f(x: number): boolean {\\n" +
        "        return Math.floor(x) < 0.5;\\n" +
        "    }\\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("Helpers.isLessThan((Math.floor(Double.parseDouble(Helpers.toString(x)))), 0.5)");
    });

    test('a double value keeps `>=` (isEqual is not exact for ±Infinity / 2^63 saturation)', () => {
        const input =
        "class T {\\n" +
        "    f(x: number): boolean {\\n" +
        "        return Math.floor(x) >= 5;\\n" +
        "    }\\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("Helpers.isGreaterThanOrEqual((Math.floor(Double.parseDouble(Helpers.toString(x)))), 5)");
    });

    test('a small finite double literal compares natively under `<`', () => {
        const input =
        "class T {\\n" +
        "    f(s: any): boolean {\\n" +
        "        return s.search(\"x\") < 1.5;\\n" +
        "    }\\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain('((String)s).indexOf("x") < 1.5');
        expect(output).not.toContain("Helpers.isLessThan");
    });

    test('a long literal above 2^53 keeps the helper once a double is involved', () => {
        const input =
        "class T {\\n" +
        "    f(): boolean {\\n" +
        "        return 9007199254740994 <= 1.5;\\n" +
        "    }\\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("Helpers.isLessThanOrEqual(9007199254740994L, 1.5)");
    });

    test('Object-typed side keeps the comparison helper even when the other side prints a primitive', () => {
        const input =
        "class T {\\n" +
        "    f(a: number, o: any): boolean {\\n" +
        "        return a < o.length;\\n" +
        "    }\\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("Helpers.isLessThan(a, Helpers.getArrayLength(o))");
    });
});

describe('java inOp -> containsKey: declared Map receivers and nullable dicts', () => {
    // the consumer-side hook build/java-local-types.js installs: declaration -> declared
    // Java type, for the names its slices retyped
    const declared = new Map<string, string>();
    const install = (entries: Array<[string, string]>) => {
        declared.clear();
        entries.forEach(([name, type]) => declared.set(name, type));
        (transpiler as any).javaTranspiler.javaDeclaredLocalTypeResolver =
            (declaration: any) => declared.get(String(declaration?.name?.escapedText));
    };
    afterEach(() => {
        (transpiler as any).javaTranspiler.javaDeclaredLocalTypeResolver = undefined;
    });

    test('a receiver declared Map prints containsKey with no cast', () => {
        install([['x', 'java.util.Map<String, Object>']]);
        const input =
        "class T {\n" +
        "    f(x: any, k: string): void {\n" +
        "        if (k in x) {\n" +
        "            return;\n" +
        "        }\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("if (x.containsKey(k))");
        expect(output).not.toContain("Helpers.inOp");
        expect(output).not.toContain("((java.util.Map<?, ?>)x)");
    });

    test('the same receiver with no declared type keeps the helper', () => {
        install([]);
        const input =
        "class T {\n" +
        "    f(x: any, k: string): void {\n" +
        "        if (k in x) {\n" +
        "            return;\n" +
        "        }\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("Helpers.inOp(x, k)");
    });

    test('a declared Map local whose declaration the consumer left Object keeps the helper', () => {
        install([['x', 'Object']]);
        const input =
        "class T {\n" +
        "    f(x: any, k: string): void {\n" +
        "        if (k in x) {\n" +
        "            return;\n" +
        "        }\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("Helpers.inOp(x, k)");
    });

    test('a declared String key unlocks the lookup on an any-typed key', () => {
        install([['x', 'java.util.Map<String, Object>'], ['raw', 'String']]);
        const input =
        "class T {\n" +
        "    f(x: any, raw: any): void {\n" +
        "        if (raw in x) {\n" +
        "            return;\n" +
        "        }\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("if (x.containsKey(raw))");
        expect(output).not.toContain("Helpers.inOp");
    });

    test('a nullable dict receiver prints the guarded containsKey', () => {
        install([]);
        const input =
        "interface D { [key: string]: any; }\n" +
        "class T {\n" +
        "    f(x: D | undefined, k: string): void {\n" +
        "        if (k in x) {\n" +
        "            return;\n" +
        "        }\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("(x != null && ((java.util.Map<?, ?>)x).containsKey(k))");
        expect(output).not.toContain("Helpers.inOp");
    });

    test('a null member joins the same guard', () => {
        install([]);
        const input =
        "interface D { [key: string]: any; }\n" +
        "class T {\n" +
        "    f(x: D | null | undefined, k: string): void {\n" +
        "        if (k in x) {\n" +
        "            return;\n" +
        "        }\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("(x != null && ((java.util.Map<?, ?>)x).containsKey(k))");
        expect(output).not.toContain("Helpers.inOp");
    });

    test('a nullable dict receiver that is a call keeps the helper (single evaluation)', () => {
        install([]);
        const input =
        "interface D { [key: string]: any; }\n" +
        "class T {\n" +
        "    safe(x: any): D | undefined {\n" +
        "        return undefined;\n" +
        "    }\n" +
        "    f(k: string): void {\n" +
        "        if (k in this.safe(1)) {\n" +
        "            return;\n" +
        "        }\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("Helpers.inOp(this.safe(1), k)");
    });

    test('a nullable non-dict union keeps the helper', () => {
        install([]);
        const input =
        "class T {\n" +
        "    f(x: number[] | undefined, k: string): void {\n" +
        "        if (k in x) {\n" +
        "            return;\n" +
        "        }\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("Helpers.inOp(x, k)");
    });

    test('a declared Map field receiver keeps the helper (only names resolve)', () => {
        install([['x', 'java.util.Map<String, Object>']]);
        const input =
        "class T {\n" +
        "    m: any;\n" +
        "    f(k: string): void {\n" +
        "        if (k in this.m) {\n" +
        "            return;\n" +
        "        }\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("Helpers.inOp(this.m, k)");
    });
});

describe('java replaceAll native emission', () => {
    // Literal pattern and replacement on a side-effect-free receiver: the helper's null /
    // empty-pattern guards cannot fire, so the call is emitted as a native String.replace
    // with a null-safe receiver read.
    test('literal pattern and replacement emit String.replace with a null guard', () => {
        const input =
        "class T {\n" +
        "    test(): void {\n" +
        "        const x = \"a-b-c\";\n" +
        "        const y = x.replaceAll(\"-\", \"+\");\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("(x == null ? null : ((String)x).replace(\"-\", \"+\"))");
        expect(output).not.toContain("Helpers.replaceAll");
    });

    test('a property receiver stays native (no call in the read)', () => {
        const input =
        "class T {\n" +
        "    m = \"a-b\";\n" +
        "    test(): void {\n" +
        "        const y = this.m.replaceAll(\"-\", \"+\");\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("(this.m == null ? null : ((String)this.m).replace(\"-\", \"+\"))");
    });

    // Fallbacks: every shape the native rule cannot prove keeps the runtime helper.
    test('a non-literal pattern keeps the helper', () => {
        const input =
        "class T {\n" +
        "    test(p: string): void {\n" +
        "        const x = \"a-b-c\";\n" +
        "        const y = x.replaceAll(p, \"+\");\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("Helpers.replaceAll((String)x, (String)p, (String)\"+\")");
    });

    test('the empty literal pattern keeps the helper (helper is a no-op there)', () => {
        const input =
        "class T {\n" +
        "    test(): void {\n" +
        "        const x = \"a-b-c\";\n" +
        "        const y = x.replaceAll(\"\", \"+\");\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("Helpers.replaceAll((String)x, (String)\"\", (String)\"+\")");
    });

    test('a call receiver keeps the helper (single evaluation of the receiver)', () => {
        const input =
        "class T {\n" +
        "    test(): void {\n" +
        "        const x = \"a-b-c\";\n" +
        "        const y = x.toLowerCase().replaceAll(\"-\", \"+\");\n" +
        "    }\n" +
        "}\n"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("Helpers.replaceAll((String)((String)x).toLowerCase()");
    });

    // java-18: `-`/`*`/`/` on a local the embedding layer declares `Long`/`Double` print
    // natively; the embedding layer (build/java-local-types.js) installs the resolver, so
    // the tests below fake it with a name table.
    const withNumericLocals = (javaTypes: any, body: () => void) => {
        const printer: any = (transpiler as any).javaTranspiler;
        const previous = printer.javaExpressionTypeResolver;
        printer.javaExpressionTypeResolver = (node: any) => javaTypes[node.escapedText];
        try {
            body();
        } finally {
            printer.javaExpressionTypeResolver = previous;
        }
    };

    test('a Long-declared local subtracts an integer literal natively', () => {
        withNumericLocals({ now: 'Long' }, () => {
            const input =
            "class T {\n" +
            "    f(): void {\n" +
            "        const now: number = this.milliseconds();\n" +
            "        const x = now - 7776000000;\n" +
            "    }\n" +
            "}"
            const output = transpiler.transpileJava(input).content;
            expect(output).toContain('Long x = (now - 7776000000L);');
            expect(output).not.toContain('Helpers.subtract(');
        });
    });

    test('two Long-declared locals multiply natively', () => {
        withNumericLocals({ a: 'Long', b: 'Long' }, () => {
            const input =
            "class T {\n" +
            "    f(): void {\n" +
            "        const a: number = this.milliseconds();\n" +
            "        const b: number = this.milliseconds();\n" +
            "        const x = a * b;\n" +
            "    }\n" +
            "}"
            const output = transpiler.transpileJava(input).content;
            expect(output).toContain('Long x = (a * b);');
            expect(output).not.toContain('Helpers.multiply(');
        });
    });

    test('a Double-declared local divides natively as a double division', () => {
        withNumericLocals({ ratio: 'Double' }, () => {
            const input =
            "class T {\n" +
            "    f(): void {\n" +
            "        const ratio: number = this.milliseconds();\n" +
            "        const x = ratio / 1000;\n" +
            "    }\n" +
            "}"
            const output = transpiler.transpileJava(input).content;
            expect(output).toContain('Double x = (((double) ratio) / ((double) 1000));');
            expect(output).not.toContain('Helpers.divide(');
        });
    });

    test('a nullable local keeps the subtract helper (a null box would NPE)', () => {
        withNumericLocals({ until: 'Long' }, () => {
            const input =
            "class T {\n" +
            "    f(): void {\n" +
            "        let until: number | undefined = undefined;\n" +
            "        const x = until - 1;\n" +
            "    }\n" +
            "}"
            const output = transpiler.transpileJava(input).content;
            expect(output).toContain('Helpers.subtract(until, 1);');
        });
    });

    test('a Double-declared local keeps multiply (an integral double product re-boxes as Long)', () => {
        withNumericLocals({ ratio: 'Double' }, () => {
            const input =
            "class T {\n" +
            "    f(): void {\n" +
            "        const ratio: number = this.milliseconds();\n" +
            "        const x = ratio * 2;\n" +
            "    }\n" +
            "}"
            const output = transpiler.transpileJava(input).content;
            expect(output).toContain('Object x = Helpers.multiply(ratio, 2);');
        });
    });

    test('a declared numeric local never turns `+` native (java-13/14 own Add)', () => {
        withNumericLocals({ now: 'Long' }, () => {
            const input =
            "class T {\n" +
            "    f(): void {\n" +
            "        const now: number = this.milliseconds();\n" +
            "        const x = now + 1;\n" +
            "    }\n" +
            "}"
            const output = transpiler.transpileJava(input).content;
            expect(output).toContain('Object x = Helpers.add(now, 1);');
        });
    });

    test('a cast operand keeps the helper', () => {
        withNumericLocals({ now: 'Long' }, () => {
            const input =
            "class T {\n" +
            "    f(): void {\n" +
            "        const now: number = this.milliseconds();\n" +
            "        const x = (now as number) - 1;\n" +
            "    }\n" +
            "}"
            const output = transpiler.transpileJava(input).content;
            expect(output).toContain('Helpers.subtract(now, 1);');
        });
    });

    test('a captured object-literal local keeps the helper (it prints as an Object finalX)', () => {
        withNumericLocals({ time: 'Long' }, () => {
            const input =
            "class T {\n" +
            "    f(): void {\n" +
            "        const time: number = this.milliseconds();\n" +
            "        const request = { 'start_timestamp': time - 8, 'end_timestamp': time };\n" +
            "    }\n" +
            "}"
            const output = transpiler.transpileJava(input).content;
            expect(output).toContain('Helpers.subtract(finalTime, 8)');
        });
    });

    test('without the embedding layer table a numeric local keeps the helper', () => {
        const input =
        "class T {\n" +
        "    f(): void {\n" +
        "        const now: number = this.milliseconds();\n" +
        "        const x = now - 1;\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain('Object x = Helpers.subtract(now, 1);');
    });
});

describe('falsy-wrapper removal: boolean identifiers and Array.isArray', () => {
    const wrapped = (body: string, extra = '', signature = 'test(x: any): void') => {
        const input =
        "class T {\n" +
        "    newUpdates: boolean = true;\n" +
        "    secret: string = '';\n" +
        "    verbose: boolean = false;\n" +
        "    other: object = {};\n" +
        "    isBool (): boolean { return true; }\n" +
        "    valueIsDefined (v: any): boolean { return true; }\n" +
        "    isBoolNamed (v: any): string { return ''; }\n" +
        "    newUpdatesString (): string { return ''; }\n" +
        "    " + signature + " {\n" +
        body +
        "    }\n" +
        extra +
        "}\n"
        return transpiler.transpileJava(input).content;
    };

    test('a boolean field read drops the wrapper and keeps the native Java boolean', () => {
        const output = wrapped("        if (this.newUpdates) { return; }\n" +
            "        if (!this.verbose) { return; }\n");
        expect(output).toContain("if (this.newUpdates)");
        expect(output).toContain("if (!this.verbose)");
        expect(output).not.toContain("Helpers.isTrue(");
    });

    test('a non-boolean field read keeps the helper', () => {
        // secret is a String field, other is an object: their truthiness is the helper's job
        const output = wrapped("        if (this.secret) { return; }\n" +
            "        if (this.other) { return; }\n");
        expect(output).toContain("if (Helpers.isTrue(this.secret))");
        expect(output).toContain("if (Helpers.isTrue(this.other))");
    });

    test('a field the checker does not type boolean keeps the helper even when named like a bool field', () => {
        const output = wrapped("        if (this.newUpdatesString()) { return; }\n");
        expect(output).toContain("Helpers.isTrue(this.newUpdatesString())");
        const shadowed = wrapped("        if (this.newUpdates) { return; }\n", '', 'test(x: any): void');
        expect(shadowed).toContain("if (this.newUpdates)");
    });

    test('a local holding a Boolean box prints Boolean.TRUE.equals', () => {
        const output = wrapped("        const ok: boolean = true;\n" +
            "        if (ok) { return; }\n" +
            "        if (!ok) { return; }\n");
        expect(output).toContain("if (Boolean.TRUE.equals(ok))");
        expect(output).toContain("if (!Boolean.TRUE.equals(ok))");
        expect(output).not.toContain("Helpers.isTrue(ok)");
    });

    test('comparison / logical / literal / hand-written boolean initialisers are all proven', () => {
        const output = wrapped("        const a: boolean = (x === 1);\n" +
            "        const b: boolean = (a && x !== 2);\n" +
            "        const c: boolean = !(x in this.options);\n" +
            "        const d: boolean = this.valueIsDefined(x);\n" +
            "        if (a && b) { return; }\n" +
            "        if (c) { return; }\n" +
            "        if (d) { return; }\n");
        expect(output).toContain("if (Boolean.TRUE.equals(a) && Boolean.TRUE.equals(b))");
        expect(output).toContain("if (Boolean.TRUE.equals(c))");
        expect(output).toContain("if (Boolean.TRUE.equals(d))");
    });

    test('a generated boolean-returning method keeps the helper', () => {
        const output = wrapped("        const a: boolean = this.isBool();\n" +
            "        if (a) { return; }\n");
        expect(output).toContain("if (Helpers.isTrue(a))");
    });

    test('a later non-boolean write keeps the box (D2 scan)', () => {
        const output = wrapped("        let a: boolean = false;\n" +
            "        a = x;\n" +
            "        if (a) { return; }\n");
        expect(output).toContain("if (Helpers.isTrue(a))");
    });

    test('a later boolean write keeps the rewrite', () => {
        const output = wrapped("        let a: boolean = false;\n" +
            "        a = (x === 1);\n" +
            "        if (a) { return; }\n");
        expect(output).toContain("if (Boolean.TRUE.equals(a))");
    });

    test('nullable, any and parameter identifiers keep the helper', () => {
        const output = wrapped("        if (maybe) { return; }\n", '', 'test(x: any, maybe: boolean | undefined): void');
        expect(output).toContain("if (Helpers.isTrue(maybe))");
        const implicitAny = wrapped("        let a;\n        if (a) { return; }\n");
        expect(implicitAny).toContain("if (Helpers.isTrue(a))");
        const parameter = wrapped("        if (flag) { return; }\n", '', 'test(x: any, flag: boolean): void');
        expect(parameter).toContain("if (Helpers.isTrue(flag))");
    });

    test('a destructured binding element keeps the helper', () => {
        // a binding element is fed by the container, so its box is not proven boolean here
        const output = wrapped("        const [a, b] = x;\n" +
            "        if (b) { return; }\n");
        expect(output).toContain("if (Helpers.isTrue(b))");
    });

    test('Array.isArray prints instanceof List, negated and inside a logical expression too', () => {
        const output = wrapped("        if (Array.isArray(x)) { return; }\n" +
            "        if (!Array.isArray(x)) { return; }\n" +
            "        if (Array.isArray(x) && this.newUpdates) { return; }\n");
        expect(output).toContain("if ((x instanceof java.util.List))");
        expect(output).toContain("if (!(x instanceof java.util.List))");
        expect(output).toContain("if ((x instanceof java.util.List) && this.newUpdates)");
        expect(output).not.toContain("Helpers.isArray(");
        expect(output).not.toContain("Helpers.isTrue(");
    });

    test('a ternary condition and a while condition unwrap the same way', () => {
        const output = wrapped("        while (this.newUpdates) { x = 1; }\n" +
            "        return (this.verbose) ? 1 : 2;\n", '', 'test(x: any)');
        expect(output).toContain("while (this.newUpdates)");
        expect(output).toContain("((this.verbose)) ? 1 : 2");
        expect(output).not.toContain("Helpers.isTrue(");
    });
});

describe('java native indexOf (Helpers.getIndexOf -> String/List.indexOf)', () => {
    // a receiver the checker types as a plain string: String.indexOf(target) is the same
    // call the helper performs for that receiver, with -1 for a missing target on both paths
    test('checker-proven string receiver with a literal target prints String.indexOf', () => {
        const input =
        "class T {\n" +
        "    test(s: string): void {\n" +
        "        const i = s.indexOf(\".\");\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("((String)s).indexOf(\".\")");
        expect(output).not.toContain("Helpers.getIndexOf");
    });

    test('string receiver with a string-typed identifier target casts the target too', () => {
        const input =
        "class T {\n" +
        "    test(s: string, t: string): void {\n" +
        "        const i = s.indexOf(t);\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("((String)s).indexOf(((String)t))");
        expect(output).not.toContain("Helpers.getIndexOf");
    });

    // a List receiver: List.indexOf(target) is literally the call Helpers.getIndexOf makes
    // for that receiver, and List.indexOf takes any Object target
    test('checker-proven list receiver prints List.indexOf and keeps an untyped target', () => {
        const input =
        "class T {\n" +
        "    test(xs: string[], y: any): void {\n" +
        "        const i = xs.indexOf(y);\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("((java.util.List<?>)xs).indexOf(y)");
        expect(output).not.toContain("Helpers.getIndexOf");
    });

    // fallbacks: every shape without the proof keeps the runtime helper
    test('an any receiver keeps the helper', () => {
        const input =
        "class T {\n" +
        "    test(x: any): void {\n" +
        "        const i = x.indexOf(\"a\");\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("Helpers.getIndexOf(x, \"a\")");
    });

    test('a nullable/nullable-union receiver keeps the helper', () => {
        const input =
        "class T {\n" +
        "    test(s: string | undefined): void {\n" +
        "        const i = s.indexOf(\"a\");\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("Helpers.getIndexOf(s, \"a\")");
    });

    test('a string receiver with an untyped target keeps the helper', () => {
        const input =
        "class T {\n" +
        "    test(s: string, t: any): void {\n" +
        "        const i = s.indexOf(t);\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("Helpers.getIndexOf(s, t)");
    });

    test('a rest parameter (varargs array, not a List) keeps the helper', () => {
        const input =
        "class T {\n" +
        "    test(...xs: string[]): void {\n" +
        "        const i = xs.indexOf(\"a\");\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("Helpers.getIndexOf(xs, \"a\")");
    });
});

describe('java native split (Helpers.split -> Arrays.asList(String.split(Pattern.quote)))', () => {
    // a receiver the checker types as a plain string with a literal separator: the emitted
    // text is Helpers.split's own body without its String.valueOf/String branch, which is
    // unreachable for a plain string, and with the separator quoted exactly as the helper
    // quotes it (Pattern.quote), so a regex metacharacter stays a literal separator
    test('checker-proven string receiver with a literal separator prints the native split', () => {
        const input =
        "class T {\n" +
        "    test(s: string): void {\n" +
        "        const parts = s.split(',');\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("new java.util.ArrayList<Object>(java.util.Arrays.asList(((String)s).split(java.util.regex.Pattern.quote(\",\"))))");
        expect(output).not.toContain("Helpers.split");
    });

    test('a regex metacharacter separator is quoted, not passed as a pattern', () => {
        const input =
        "class T {\n" +
        "    test(s: string): void {\n" +
        "        const parts = s.split('?dt=');\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("java.util.regex.Pattern.quote(\"?dt=\")");
        expect(output).not.toContain("Helpers.split");
    });

    test('a string-literal receiver prints the native split', () => {
        const input =
        "class T {\n" +
        "    test(): void {\n" +
        "        const parts = 'a,b'.split(',');\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("new java.util.ArrayList<Object>(java.util.Arrays.asList(((String)\"a,b\").split(java.util.regex.Pattern.quote(\",\"))))");
        expect(output).not.toContain("Helpers.split");
    });

    test('an element read from a string array is a plain string and prints the native split', () => {
        const input =
        "class T {\n" +
        "    test(xs: string[]): void {\n" +
        "        const s = xs[0];\n" +
        "        const parts = s.split('/');\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("new java.util.ArrayList<Object>(java.util.Arrays.asList(((String)s).split(java.util.regex.Pattern.quote(\"/\"))))");
        expect(output).not.toContain("Helpers.split");
    });

    // fallbacks: every shape without the proof keeps the runtime helper
    test('an any receiver keeps the helper', () => {
        const input =
        "class T {\n" +
        "    test(x: any): void {\n" +
        "        const parts = x.split(',');\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("Helpers.split(x, \",\")");
    });

    test('a nullable alias receiver keeps the helper', () => {
        const input =
        "class T {\n" +
        "    test(s: Str): void {\n" +
        "        const parts = s.split(',');\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("Helpers.split(s, \",\")");
    });

    test('a nullable-union receiver keeps the helper', () => {
        const input =
        "class T {\n" +
        "    test(s: string | undefined): void {\n" +
        "        const parts = s.split(',');\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("Helpers.split(s, \",\")");
    });

    test('a non-literal separator keeps the helper', () => {
        const input =
        "class T {\n" +
        "    test(s: string, sep: string): void {\n" +
        "        const parts = s.split(sep);\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("Helpers.split(s, sep)");
    });

    test('a two-argument split keeps the helper (the printed call drops no limit)', () => {
        const input =
        "class T {\n" +
        "    test(s: string): void {\n" +
        "        const parts = s.split(',', 2);\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("Helpers.split(s, \",\")");
    });

    test('a conditional receiver keeps the helper (no added line carries a `?`)', () => {
        const input =
        "class T {\n" +
        "    test(c: boolean, a: string, b: string): void {\n" +
        "        const parts = (c ? a : b).split(',');\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("Helpers.split(");
        expect(output).toContain("? a : b");
    });
});

describe('java Math.min/Math.max native emission', () => {
    // Helpers.mathMin/mathMax take Object and hand the ORIGINAL operand box back (null when
    // either operand is null); java.lang.Math.min/max take primitives, so the native call is
    // emitted only when BOTH operands print as primitives of one numeric family: int/long
    // literals, `.length`/`.size()` and native long arithmetic are integral, a double literal
    // is the only NaN-free double.
    test('an integer literal and a proved integer .length emit Math.max', () => {
        const input =
        "class T {\n" +
        "    test(s: string, list: any[]): void {\n" +
        "        const a = Math.max (5, s.length);\n" +
        "        const b = Math.min (3, list.length);\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("Object a = Math.max(5, ((String)s).length());");
        expect(output).toContain("Object b = Math.min(3, ((java.util.List<?>)list).size());");
        expect(output).not.toContain("Helpers.mathMax(");
        expect(output).not.toContain("Helpers.mathMin(");
    });

    test('two double literals emit Math.min (a computed double can be NaN and keeps the helper)', () => {
        const input =
        "class T {\n" +
        "    test(a: number, b: number): void {\n" +
        "        const x = Math.min (1.5, 2.5);\n" +
        "        const y = Math.min (a / 100, b);\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("Object x = Math.min(1.5, 2.5);");
        expect(output).toContain("Helpers.mathMin(");
    });

    test('native long arithmetic of literals emits Math.min', () => {
        const input =
        "class T {\n" +
        "    test(): void {\n" +
        "        const x = Math.min (1 + 2, 4);\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("Object x = Math.min((1L + 2L), 4);");
    });

    // Fallbacks: every shape the native rule cannot prove keeps the runtime helper.
    test('an Object local operand keeps the helper', () => {
        const input =
        "class T {\n" +
        "    test(list: any[], params: any): void {\n" +
        "        const x = Math.min (10, params['limit']);\n" +
        "        const y = Math.min (list.length, params['limit']);\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("Helpers.mathMin(10, Helpers.GetValue(parameters, \"limit\"))");
        expect(output).toContain("Helpers.mathMin(");
        expect(output).not.toContain("Math.min(");
    });

    test('mixed int and double literal operands keep the helper (box kind would change)', () => {
        const input =
        "class T {\n" +
        "    test(): void {\n" +
        "        const x = Math.min (5, 1.5);\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("Helpers.mathMin(5, 1.5)");
    });

    test('an `as number` operand keeps the helper', () => {
        const input =
        "class T {\n" +
        "    test(limit: any): void {\n" +
        "        const x = Math.min ((limit as number), 100);\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("Helpers.mathMin(limit, 100)");
    });

    test('a receiver position keeps the helper (a primitive has no members)', () => {
        const input =
        "class T {\n" +
        "    test(s: string): void {\n" +
        "        const x = Math.min (5, s.length).toString ();\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("String.valueOf(Helpers.mathMin(5, ((String)s).length()))");
        expect(output).not.toContain("Math.min(");
    });
});

describe('java slice native emission (Helpers.slice -> substring / subList)', () => {
    // Literal bounds on a checker-proven String/List receiver: JS clamps both bounds into
    // [0, length], which the native call reproduces with Math.min / Math.max over the
    // receiver length behind the helper's null -> null guard.
    test('two literal bounds emit substring with min-clamped start and end', () => {
        const input =
        "class T {\n" +
        "    f(s: string): void {\n" +
        "        const y = s.slice(0, 2);\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("(s == null ? null : ((String)s).substring(0, Math.min(2, ((String)s).length())))");
        expect(output).not.toContain("Helpers.slice");
    });

    test('a negative start counts from the end and clamps at zero', () => {
        const input =
        "class T {\n" +
        "    f(s: string): void {\n" +
        "        const y = s.slice(-64);\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("(s == null ? null : ((String)s).substring(Math.max(((String)s).length() - 64, 0)))");
    });

    test('a single positive bound keeps the open end', () => {
        const input =
        "class T {\n" +
        "    f(s: string): void {\n" +
        "        const y = s.slice(18);\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("(s == null ? null : ((String)s).substring(Math.min(18, ((String)s).length())))");
    });

    test('a negative end clamps from the end', () => {
        const input =
        "class T {\n" +
        "    f(s: string): void {\n" +
        "        const y = s.slice(0, -1);\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("(s == null ? null : ((String)s).substring(0, Math.max(((String)s).length() - 1, 0)))");
    });

    test('two ordered negative bounds are both measured from the end', () => {
        const input =
        "class T {\n" +
        "    f(s: string): void {\n" +
        "        const y = s.slice(-5, -1);\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("substring(Math.max(((String)s).length() - 5, 0), Math.max(((String)s).length() - 1, 0))");
    });

    // A bound pair whose order is not provable for every length keeps substring valid by
    // taking the smaller of the two as the start: an inverted pair is the empty slice.
    test('an unprovably ordered pair guards the start with Math.min', () => {
        const input =
        "class T {\n" +
        "    f(s: string): void {\n" +
        "        const y = s.slice(-8, 5);\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("substring(Math.min(Math.max(((String)s).length() - 8, 0), Math.min(5, ((String)s).length())), Math.min(5, ((String)s).length()))");
    });

    test('a proven List receiver emits subList with size-clamped bounds', () => {
        const input =
        "class T {\n" +
        "    f(xs: string[]): void {\n" +
        "        const y = xs.slice(0, 2);\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("(xs == null ? null : ((java.util.List<Object>)xs).subList(0, Math.min(2, ((java.util.List<Object>)xs).size())))");
        expect(output).not.toContain("Helpers.slice");
    });

    // Fallbacks: every shape the native rule cannot prove keeps the runtime helper.
    test('a non-literal bound keeps the helper', () => {
        const input =
        "class T {\n" +
        "    f(s: string, a: number): void {\n" +
        "        const y = s.slice(a, 2);\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("Helpers.slice(s, a, 2)");
    });

    test('an unproven (any) receiver keeps the helper', () => {
        const input =
        "class T {\n" +
        "    f(s: any): void {\n" +
        "        const y = s.slice(0, 2);\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("Helpers.slice(s, 0, 2)");
    });

    test('a nullable string receiver keeps the helper', () => {
        const input =
        "class T {\n" +
        "    f(s: string | undefined): void {\n" +
        "        const y = s.slice(0, 2);\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("Helpers.slice(s, 0, 2)");
    });

    test('a call receiver keeps the helper (single evaluation of the receiver)', () => {
        const input =
        "class T {\n" +
        "    f(s: string): void {\n" +
        "        const y = s.trim().slice(0, 2);\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("Helpers.slice(((String)s).trim(), 0, 2)");
    });

    test('a varargs array receiver keeps the helper (it is an array, not a List)', () => {
        const input =
        "class T {\n" +
        "    f(...xs: any[]): void {\n" +
        "        const y = xs.slice(0, 2);\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("Helpers.slice(xs, 0, 2)");
    });

    test('a non-integer bound keeps the helper', () => {
        const input =
        "class T {\n" +
        "    f(s: string): void {\n" +
        "        const y = s.slice(0.5, 2);\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("Helpers.slice(s, 0.5, 2)");
    });

    test('a bound outside the Java int range keeps the helper', () => {
        const input =
        "class T {\n" +
        "    f(s: string): void {\n" +
        "        const y = s.slice(0, 9007199254740993);\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("Helpers.slice(s, 0, 9007199254740992L)");
    });
});

describe('java parseInt/parseFloat/toString/padStart native emission', () => {
    test('parseInt/parseFloat of a string literal the native parser accepts print the native parse', () => {
        const input =
        "class T {\n" +
        "    f(): void {\n" +
        "        const a = parseInt(\"8\");\n" +
        "        const b = parseInt(\"+7\");\n" +
        "        const c = parseInt(\"-3\");\n" +
        "        const d = parseFloat(\"1.5\");\n" +
        "        const e = parseFloat(\"1e3\");\n" +
        "        const g = parseFloat(\"NaN\");\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain('Object a = Long.parseLong("8");');
        expect(output).toContain('Object b = Long.parseLong("+7");');
        expect(output).toContain('Object c = Long.parseLong("-3");');
        expect(output).toContain('Object d = Double.parseDouble("1.5");');
        expect(output).toContain('Object e = Double.parseDouble("1e3");');
        expect(output).toContain('Object g = Double.parseDouble("NaN");');
        expect(output).not.toContain("Helpers.parseInt(");
        expect(output).not.toContain("Helpers.parseFloat(");
    });

    test('parseInt/parseFloat of a literal the native parser rejects keep the helper', () => {
        // the helper catches the NumberFormatException (null / 0.0); the native call throws
        const input =
        "class T {\n" +
        "    f(): void {\n" +
        "        const a = parseInt(\"1.5\");\n" +
        "        const b = parseInt(\" 8\");\n" +
        "        const c = parseInt(\"0x10\");\n" +
        "        const d = parseInt(\"99999999999999999999\");\n" +
        "        const e = parseFloat(\"abc\");\n" +
        "        const g = parseFloat(\" 1.5\");\n" +
        "        const h = parseFloat(\"1.5f\");\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain('Object a = Helpers.parseInt("1.5");');
        expect(output).toContain('Object b = Helpers.parseInt(" 8");');
        expect(output).toContain('Object c = Helpers.parseInt("0x10");');
        expect(output).toContain('Object d = Helpers.parseInt("99999999999999999999");');
        expect(output).toContain('Object e = Helpers.parseFloat("abc");');
        expect(output).toContain('Object g = Helpers.parseFloat(" 1.5");');
        expect(output).toContain('Object h = Helpers.parseFloat("1.5f");');
        expect(output).not.toContain("Long.parseLong(");
        expect(output).not.toContain("Double.parseDouble(");
    });

    test('parseInt/parseFloat of a non-literal keep the helper', () => {
        const input =
        "class T {\n" +
        "    f(s: string): void {\n" +
        "        const a = parseInt(s);\n" +
        "        const b = parseFloat(s);\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("Object a = Helpers.parseInt(s);");
        expect(output).toContain("Object b = Helpers.parseFloat(s);");
    });

    test('Math.* Helpers.toString -> String.valueOf when the argument cannot be null', () => {
        const input =
        "class T {\n" +
        "    f(): void {\n" +
        "        const a = Math.floor(10);\n" +
        "        const b = Math.round(1.5);\n" +
        "        const c = Math.ceil((2 * 3) * 4);\n" +
        "        const d = Math.pow(2, 8);\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("(Math.floor(Double.parseDouble(String.valueOf(10))))");
        expect(output).toContain("Math.round(Double.parseDouble(String.valueOf(1.5)))");
        expect(output).toContain("Math.ceil(Double.parseDouble(String.valueOf((((2L * 3L)) * 4L))))");
        expect(output).toContain("Math.pow(Double.parseDouble(String.valueOf(2)), Double.parseDouble(String.valueOf(8)))");
        expect(output).not.toContain("Helpers.toString(");
    });

    test('Math.* Helpers.toString stays when the argument is not provably non-null', () => {
        const input =
        "class T {\n" +
        "    f(o: any): void {\n" +
        "        const a = Math.floor(o);\n" +
        "        const b = Math.pow(10, o);\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("(Math.floor(Double.parseDouble(Helpers.toString(o))))");
        expect(output).toContain("Math.pow(Double.parseDouble(String.valueOf(10)), Double.parseDouble(Helpers.toString(o)))");
        expect(output).not.toContain("String.valueOf(o)");
    });

    test('padStart with a literal length and pad prints the native pad+truncate form', () => {
        const input =
        "class T {\n" +
        "    f(value: string): void {\n" +
        "        const a = value.padStart(8, '0');\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("((String)value).length() >= 8 ? ((String)value).substring(((String)value).length() - 8)");
        expect(output).toContain('String.format("%" + (8 - ((String)value).length()) + "s", "").replace(\' \', \'0\') + ((String)value)');
        expect(output).not.toContain("Helpers.padStart(");
    });

    test('padStart keeps the helper without a literal length, literal pad, or proven String receiver', () => {
        const input =
        "class T {\n" +
        "    f(value: string, n: number, pad: string, o: any): void {\n" +
        "        const a = value.padStart(n, '0');\n" +
        "        const b = value.padStart(8, pad);\n" +
        "        const c = o.padStart(8, '0');\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("Helpers.padStart((String)value, ((Number)n).intValue(), ((String)\"0\").charAt(0))");
        expect(output).toContain("Helpers.padStart((String)value, ((Number)8).intValue(), ((String)pad).charAt(0))");
        expect(output).toContain("Helpers.padStart((String)o, ((Number)8).intValue(), ((String)\"0\").charAt(0))");
        expect(output).not.toContain("String.format(");
    });

    test('padStart keeps the helper for a receiver that is a call (evaluate once)', () => {
        const input =
        "class T {\n" +
        "    g(): string { return \"x\"; }\n" +
        "    f(): void {\n" +
        "        const a = this.g().padStart(4, '0');\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("Helpers.padStart((String)this.g(), ((Number)4).intValue(), ((String)\"0\").charAt(0))");
        expect(output).not.toContain("String.format(");
    });

    // Helper-removal (java-28): `Promise.all ([...])` whose every element is
    // checker-typed `Promise<...>` prints CompletableFuture.allOf instead of the
    // reflective Helpers.promiseAll loop; anything unproven keeps the helper.
    const promiseAllSnippet = (body: string) =>
        "class T {\n" +
        "    async fetchA (): Promise<number> {\n" +
        "        return 1;\n" +
        "    }\n" +
        "    async fetchB (): Promise<string> {\n" +
        "        return 'x';\n" +
        "    }\n" +
        body +
        "}\n";

    test('a discarded Promise.all of typed futures prints CompletableFuture.allOf', () => {
        const input = promiseAllSnippet(
            "    async discarded (): Promise<void> {\n" +
            "        await Promise.all ([ this.fetchA (), this.fetchB () ]);\n" +
            "    }\n");
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain('(java.util.concurrent.CompletableFuture.allOf(((java.util.concurrent.CompletableFuture<?>) this.fetchA()), ((java.util.concurrent.CompletableFuture<?>) this.fetchB()))).join();');
        expect(output).not.toContain('Helpers.promiseAll');
    });

    test('a used Promise.all of const-bound typed futures collects the values natively', () => {
        const input = promiseAllSnippet(
            "    async destructured (): Promise<void> {\n" +
            "        const a = this.fetchA ();\n" +
            "        const b = this.fetchB ();\n" +
            "        const [ x, y ] = await Promise.all ([ a, b ]);\n" +
            "    }\n");
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain('java.util.concurrent.CompletableFuture.allOf(((java.util.concurrent.CompletableFuture<?>) a), ((java.util.concurrent.CompletableFuture<?>) b)).thenApply(promiseAllValue -> new java.util.ArrayList<Object>(java.util.Arrays.asList(((java.util.concurrent.CompletableFuture<?>) a).join(), ((java.util.concurrent.CompletableFuture<?>) b).join())))');
        expect(output).not.toContain('Helpers.promiseAll');
    });

    test('a consumed Promise.all whose element is not const-bound keeps the helper', () => {
        const input = promiseAllSnippet(
            "    async test (): Promise<void> {\n" +
            "        const a = this.fetchA ();\n" +
            "        let b = this.fetchB ();\n" +
            "        const results = await Promise.all ([ a, b ]);\n" +
            "    }\n");
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain('Helpers.promiseAll(new java.util.ArrayList<Object>(java.util.Arrays.asList(a, b)))');
    });

    test('a consumed Promise.all with a call element keeps the helper (single evaluation)', () => {
        const input = promiseAllSnippet(
            "    async test (): Promise<void> {\n" +
            "        const results = await Promise.all ([ this.fetchA (), this.fetchB () ]);\n" +
            "    }\n");
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain('Helpers.promiseAll(new java.util.ArrayList<Object>(java.util.Arrays.asList(this.fetchA(), this.fetchB())))');
    });

    test('a Promise.all over a list variable keeps the helper (element types unknown)', () => {
        const input = promiseAllSnippet(
            "    async test (): Promise<void> {\n" +
            "        const tasks: Promise<any>[] = [ this.fetchA () ];\n" +
            "        const results = await Promise.all (tasks);\n" +
            "    }\n");
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain('Helpers.promiseAll(tasks)');
    });

    test('a Promise.all with non-promise elements keeps the helper', () => {
        const input = promiseAllSnippet(
            "    async test (): Promise<void> {\n" +
            "        await Promise.all ([ 1, 2 ]);\n" +
            "    }\n");
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain('Helpers.promiseAll(new java.util.ArrayList<Object>(java.util.Arrays.asList(1, 2)))');
    });
});

describe('java native-arithmetic locals (java-31)', () => {
    test('a native concat initializer declares the local String', () => {
        const input =
        "class T {\n" +
        "    f(symbol: string, settle: string): void {\n" +
        "        const futuresSymbol = symbol + ':' + settle;\n" +
        "        this.g(futuresSymbol);\n" +
        "    }\n" +
        "    g(...args: any[]): void {}\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain('String futuresSymbol = ((symbol + ":") + settle);');
        expect(output).not.toContain('Object futuresSymbol');
    });

    test('a native long initializer declares the local Long', () => {
        const input =
        "class T {\n" +
        "    f(): void {\n" +
        "        const oneWeek = 7 * 24 * 60 * 60 * 1000;\n" +
        "        this.g(oneWeek);\n" +
        "    }\n" +
        "    g(...args: any[]): void {}\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain('Long oneWeek = ((((7L * 24L) * 60L) * 60L) * 1000L);');
    });

    test('a native double initializer declares the local Double', () => {
        const input =
        "class T {\n" +
        "    f(): void {\n" +
        "        const ratio = 10 / 4;\n" +
        "        this.g(ratio);\n" +
        "    }\n" +
        "    g(...args: any[]): void {}\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain('Double ratio = (((double) 10) / ((double) 4));');
    });

    test('an initializer that keeps the helper also keeps the Object declaration', () => {
        const input =
        "class T {\n" +
        "    f(a: Str, b: Str): void {\n" +
        "        const x = a + b;\n" +
        "        this.g(x);\n" +
        "    }\n" +
        "    g(...args: any[]): void {}\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain('Object x = Helpers.add(a, b);');
    });

    test('a later write of a helper result keeps the box (D2)', () => {
        const input =
        "class T {\n" +
        "    f(symbol: string, settle: string): void {\n" +
        "        let futuresSymbol = symbol + ':' + settle;\n" +
        "        futuresSymbol = this.safeDict(this.options, 'x');\n" +
        "        this.g(futuresSymbol);\n" +
        "    }\n" +
        "    safeDict(a: any, b: any): any { return undefined; }\n" +
        "    g(...args: any[]): void {}\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain('Object futuresSymbol = ((symbol + ":") + settle);');
        expect(output).not.toContain('String futuresSymbol');
    });

    test('a later write of the same native type keeps the narrowed declaration', () => {
        const input =
        "class T {\n" +
        "    f(symbol: string, settle: string): void {\n" +
        "        let futuresSymbol = symbol + ':' + settle;\n" +
        "        futuresSymbol = symbol + '/' + settle;\n" +
        "        this.g(futuresSymbol);\n" +
        "    }\n" +
        "    g(...args: any[]): void {}\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain('String futuresSymbol = ((symbol + ":") + settle);');
        expect(output).toContain('futuresSymbol = ((symbol + "/") + settle);');
    });

    test('a compound numeric assignment keeps the box', () => {
        const input =
        "class T {\n" +
        "    f(): void {\n" +
        "        let oneWeek = 7 * 24 * 60 * 60 * 1000;\n" +
        "        oneWeek += 1;\n" +
        "        this.g(oneWeek);\n" +
        "    }\n" +
        "    g(...args: any[]): void {}\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain('Object oneWeek = ((((7L * 24L) * 60L) * 60L) * 1000L);');
    });

    test('sibling blocks may each declare their own type for the same name', () => {
        const input =
        "class T {\n" +
        "    f(symbol: string, settle: string, b: any, s: string): void {\n" +
        "        if (s === 'a') {\n" +
        "            const futuresSymbol = symbol + ':' + settle;\n" +
        "            this.g(futuresSymbol);\n" +
        "        } else {\n" +
        "            const futuresSymbol = b + ':' + settle;\n" +
        "            this.g(futuresSymbol);\n" +
        "        }\n" +
        "    }\n" +
        "    g(...args: any[]): void {}\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain('String futuresSymbol = ((symbol + ":") + settle);');
        expect(output).toContain('Object futuresSymbol = Helpers.add(Helpers.add(b, ":"), settle);');
    });

    test('a String local as the left of a helper add keeps the box (overload trap)', () => {
        const input =
        "class T {\n" +
        "    f(symbol: string, x: string): void {\n" +
        "        const y = symbol + ':';\n" +
        "        this.g(y + x);\n" +
        "    }\n" +
        "    g(...args: any[]): void {}\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain('Object y = (symbol + ":");');
    });

    test('typeof, length and string casts stay valid on a String local', () => {
        const input =
        "class T {\n" +
        "    f(symbol: string, x: string): void {\n" +
        "        const y = symbol + ':';\n" +
        "        if (typeof y === 'string') {\n" +
        "            this.g(y.length, (y as string).toUpperCase());\n" +
        "        }\n" +
        "    }\n" +
        "    g(...args: any[]): void {}\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain('String y = (symbol + ":");');
        expect(output).toContain('((String)y).length()');
    });

    test('a numeric local in a conditional keeps the box (unboxing risk)', () => {
        const input =
        "class T {\n" +
        "    f(c: boolean): void {\n" +
        "        const oneWeek = 7 * 24 * 60 * 60 * 1000;\n" +
        "        this.g(c ? oneWeek : 0);\n" +
        "    }\n" +
        "    g(...args: any[]): void {}\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain('Object oneWeek = ((((7L * 24L) * 60L) * 60L) * 1000L);');
    });

    test('a numeric local as an argument of its own arithmetic stays boxed', () => {
        const input =
        "class T {\n" +
        "    f(): void {\n" +
        "        const oneWeek = 7 * 24 * 60 * 60 * 1000;\n" +
        "        this.g(oneWeek + 1);\n" +
        "    }\n" +
        "    g(...args: any[]): void {}\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        // the printed helper keeps the Object parameter, so the local is still typed
        expect(output).toContain('Long oneWeek = ((((7L * 24L) * 60L) * 60L) * 1000L);');
        expect(output).toContain('this.g(Helpers.add(oneWeek, 1));');
    });
});

describe('java unary minus inlining (opNeg)', () => {
    // Literals are primitives: Helpers.opNeg would return exactly the same box the
    // plain operator produces, so the printer drops the helper.
    test('an integer literal negates natively', () => {
        const input = "const x = -1;"
        const output = transpiler.transpileJava(input).content;
        expect(output).toBe("Object x = -1;");
    });

    test('a fractional literal negates natively', () => {
        const input = "const x = -1.5;"
        const output = transpiler.transpileJava(input).content;
        expect(output).toBe("Object x = -1.5;");
    });

    test('an exponent literal negates natively', () => {
        const input = "const x = -1e-7;"
        const output = transpiler.transpileJava(input).content;
        expect(output).toBe("Object x = -1e-7;");
    });

    // a > int-max literal already prints with the long suffix; the negation keeps it
    test('a long literal negates natively with its suffix', () => {
        const input = "const x = -3000000000;"
        const output = transpiler.transpileJava(input).content;
        expect(output).toBe("Object x = -3000000000L;");
    });

    // a nested `+` this rule prints natively is a primitive too
    test('a nested native arithmetic operand negates natively', () => {
        const input = "const x = -(1 + 2);"
        const output = transpiler.transpileJava(input).content;
        expect(output).toBe("Object x = -((1L + 2L));");
    });

    // a `.length` read on a String receiver is a Java int
    test('a String .length read negates natively', () => {
        const input =
        "class T {\n" +
        "    test(s: string): void {\n" +
        "        const x = -s.length;\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("Object x = -((String)s).length();");
    });

    // the counter of `for (var i = <literal>; ...)` is a Java int
    test('a for-statement counter negates natively', () => {
        const input =
        "class T {\n" +
        "    test(): void {\n" +
        "        for (let i = 0; -i > -10; i++) {\n" +
        "            const y = i;\n" +
        "        }\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("Helpers.isGreaterThan(-i, -10)");
    });

    // Boxed values keep the helper: it alone maps null -> null and returns the box it
    // was given, which `-x` on a Java Object cannot do (and would not compile on).
    test('a boxed local keeps the helper', () => {
        const input =
        "class T {\n" +
        "    test(): void {\n" +
        "        const y = 1;\n" +
        "        const x = -y;\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("Object x = Helpers.opNeg(y);");
    });

    test('a parameter keeps the helper', () => {
        const input =
        "class T {\n" +
        "    test(a: number): void {\n" +
        "        const x = -a;\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("Object x = Helpers.opNeg(a);");
    });

    // the printer's numeric literal text is already the decimal value (TS normalizes
    // 0x10 to 16), so a hex literal arrives as plain decimal text and negates natively
    test('a hex literal negates natively through its decimal print', () => {
        const input = "const x = -0x10;"
        const output = transpiler.transpileJava(input).content;
        expect(output).toBe("Object x = -16;");
    });

    test('a hex literal above int-max keeps the long suffix', () => {
        const input = "const x = -0xFFFFFFFF;"
        const output = transpiler.transpileJava(input).content;
        expect(output).toBe("Object x = -4294967295L;");
    });

    test('a non-numeric operand keeps the helper', () => {
        const input = "const x = -\"a\";"
        const output = transpiler.transpileJava(input).content;
        expect(output).toBe("Object x = Helpers.opNeg(\"a\");");
    });
});

describe('helper removal: Array.isArray -> native instanceof java.util.List', () => {
    // `Helpers.isArray(x)` answers false for null and true for a List, which is exactly what
    // `x instanceof java.util.List` answers for every operand the printer types as an object.
    // It stays where the operand prints as a Java array (rest parameters: the helper's
    // getClass().isArray() branch is true there) or as a final Java class (String/Long/Double/
    // Boolean: `instanceof` is not convertible), and where the operand's print has lower
    // precedence than `instanceof`.

    test('Object operand emits (operand instanceof java.util.List)', () => {
        const input =
        "class T {\n" +
        "    f(arg) {\n" +
        "        return Array.isArray(arg);\n" +
        "    }\n" +
        "}\n"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("return (arg instanceof java.util.List);");
        expect(output).not.toContain("Helpers.isArray(");
    });

    test('a declared List operand keeps the null test — never the constant true', () => {
        // a Java List reference is null-capable (safeList/parseJson/`any` callers): JS
        // Array.isArray(null) is false, so a literal `true` would flip that path
        const input =
        "class T {\n" +
        "    f(x: string[]) {\n" +
        "        return Array.isArray(x);\n" +
        "    }\n" +
        "}\n"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("return (x instanceof java.util.List);");
        expect(output).not.toContain("return true");
    });

    test('element-access operand emits the native instanceof', () => {
        const input =
        "class T {\n" +
        "    f(ticker) {\n" +
        "        return Array.isArray(ticker['bid']);\n" +
        "    }\n" +
        "}\n"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("return (Helpers.GetValue(ticker, \"bid\") instanceof java.util.List);");
    });

    test('a call operand keeps its single evaluation inside the instanceof', () => {
        const input =
        "class T {\n" +
        "    getItems(): any[] {\n" +
        "        return [];\n" +
        "    }\n" +
        "    f() {\n" +
        "        return Array.isArray(this.getItems());\n" +
        "    }\n" +
        "}\n"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("return (this.getItems() instanceof java.util.List);");
    });

    test('a side-effect-free array literal is the constant true', () => {
        const input =
        "class T {\n" +
        "    f() {\n" +
        "        return Array.isArray([1, 2]);\n" +
        "    }\n" +
        "}\n"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("return true;");
        expect(output).not.toContain("Helpers.isArray(");
    });

    test('an array literal with an evaluated element keeps the helper', () => {
        const input =
        "class T {\n" +
        "    getItems(): any[] {\n" +
        "        return [];\n" +
        "    }\n" +
        "    f() {\n" +
        "        return Array.isArray([this.getItems()]);\n" +
        "    }\n" +
        "}\n"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("Helpers.isArray(new java.util.ArrayList<Object>(java.util.Arrays.asList(this.getItems())));");
    });

    test('undefined is the constant false', () => {
        const input =
        "class T {\n" +
        "    f() {\n" +
        "        return Array.isArray(undefined);\n" +
        "    }\n" +
        "}\n"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("return false;");
        expect(output).not.toContain("Helpers.isArray(");
    });

    test('a String-typed operand keeps the helper (instanceof is not convertible)', () => {
        const input =
        "class T {\n" +
        "    s: string = 'a';\n" +
        "    f() {\n" +
        "        return Array.isArray(this.s);\n" +
        "    }\n" +
        "}\n"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("Helpers.isArray(this.s)");
        expect(output).not.toContain("instanceof java.util.List");
    });

    test('a String element access keeps the helper (List<String>.get(0) is a String)', () => {
        const input =
        "class T {\n" +
        "    f(xs: string[]) {\n" +
        "        return Array.isArray(xs[0]);\n" +
        "    }\n" +
        "}\n"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("Helpers.isArray((xs == null || 0 >= ((java.util.List<?>)xs).size() ? null : ((java.util.List<?>)xs).get(0)))");
        expect(output).not.toContain("instanceof java.util.List");
    });

    test('a rest parameter keeps the helper (it prints as a Java array)', () => {
        const input =
        "class T {\n" +
        "    f(...args: any[]) {\n" +
        "        return Array.isArray(args);\n" +
        "    }\n" +
        "}\n"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("Helpers.isArray(args)");
        expect(output).not.toContain("instanceof java.util.List");
    });

    test('a ternary operand keeps the helper (instanceof binds tighter than ?:)', () => {
        const input =
        "class T {\n" +
        "    f(c: boolean) {\n" +
        "        return Array.isArray(c ? 'a' : 'b');\n" +
        "    }\n" +
        "}\n"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("Helpers.isArray(");
        expect(output).not.toContain("instanceof java.util.List");
    });

    test('a statement-position call keeps the helper (a bare `true;` is not a statement)', () => {
        const input =
        "class T {\n" +
        "    f(): void {\n" +
        "        Array.isArray([1, 2]);\n" +
        "    }\n" +
        "}\n"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("Helpers.isArray(new java.util.ArrayList<Object>(java.util.Arrays.asList(1, 2)));");
    });
});

describe('java helper removal: mod / Math.pow residual families', () => {
    test('Math.pow emits java.lang.Math.pow (both arguments are already parsed doubles)', () => {
        const input =
        "class T {\n" +
        "    test(x: any, y: any): any {\n" +
        "        return Math.pow(x, y);\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("Math.pow(Double.parseDouble(Helpers.toString(x)), Double.parseDouble(Helpers.toString(y)))");
        expect(output).not.toContain("Helpers.mathPow");
    });

    test('mod on a for-counter emits the double remainder natively', () => {
        const input =
        "class T {\n" +
        "    test(xs: any[]): void {\n" +
        "        for (let i = 0; i < xs.length; i++) {\n" +
        "            if (i % 2 === 1) {\n" +
        "                return;\n" +
        "            }\n" +
        "        }\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("(((double) i) % ((double) 2))");
        expect(output).not.toContain("Helpers.mod(");
    });

    test('mod on an Object-typed operand keeps the helper', () => {
        const input =
        "class T {\n" +
        "    test(x: any, n: number): any {\n" +
        "        return x % n;\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("Helpers.mod(x, n)");
    });

    test('mod keeps the helper when the loop body assigns the counter', () => {
        const input =
        "class T {\n" +
        "    test(xs: any[]): void {\n" +
        "        for (let i = 0; i < xs.length; i++) {\n" +
        "            if (i % 2 === 1) {\n" +
        "                i = 0;\n" +
        "            }\n" +
        "        }\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("Helpers.mod(i, 2)");
    });

    test('mod keeps the helper on a non-counter local', () => {
        const input =
        "class T {\n" +
        "    test(): any {\n" +
        "        let i = 0;\n" +
        "        i++;\n" +
        "        return i % 2;\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("Helpers.mod(i, 2)");
    });
});
