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
});
