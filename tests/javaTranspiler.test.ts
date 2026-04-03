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
        const ts = "const x = 1;"
        const java = "Object x = 1;"
        const output = transpiler.transpileJava(ts).content;
        expect(output).toBe(java);
    });

    test('basic method declaration', () => {
        const ts =
        "class T {\n" +
        "    test(): string {\n" +
        "        return \"hello\";\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(ts).content;
        expect(output).toContain("Object test(");
        expect(output).toContain('return "hello"');
    });

    test('async method returns CompletableFuture<Object> not <Void>', () => {
        const ts =
        "class T {\n" +
        "    async doSomething(): Promise<void> {\n" +
        "        const x = 1;\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(ts).content;
        expect(output).toContain("java.util.concurrent.CompletableFuture<Object> doSomething(");
        expect(output).not.toContain("CompletableFuture<Void>");
    });

    test('async method with typed return uses CompletableFuture<Object>', () => {
        const ts =
        "class T {\n" +
        "    async fetchData(): Promise<string> {\n" +
        "        return \"data\";\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(ts).content;
        // Java transpiler emits CompletableFuture<Object> for all async returns
        expect(output).toContain("CompletableFuture<Object> fetchData(");
        expect(output).not.toContain("CompletableFuture<Void>");
    });

    test('async method body gets return null at end when no explicit return', () => {
        const ts =
        "class T {\n" +
        "    async doSomething(): Promise<void> {\n" +
        "        const x = 1;\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(ts).content;
        // supplyAsync lambda should end with return null before closing
        expect(output).toContain("return null;");
        expect(output).toContain("supplyAsync");
    });

    test('async method body does not add return null when last stmt is return', () => {
        const ts =
        "class T {\n" +
        "    async fetchData(): Promise<string> {\n" +
        "        return \"data\";\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(ts).content;
        const lines = output.split('\n');
        // Should not have a stray "return null;" — only the actual return "data"
        const returnNullCount = lines.filter(l => l.trim() === 'return null;').length;
        expect(returnNullCount).toBe(0);
    });

    test('bare return in async method becomes return null', () => {
        const ts =
        "class T {\n" +
        "    async handleMessage(msg: any): Promise<void> {\n" +
        "        if (msg === undefined) {\n" +
        "            return;\n" +
        "        }\n" +
        "        const x = msg;\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(ts).content;
        // The bare return; inside the if should become return null;
        // since it's inside an async method (supplyAsync lambda)
        expect(output).not.toMatch(/\breturn;\s*$/m);
        expect(output).toContain("return null;");
    });

    test('bare return in sync void method stays as return', () => {
        const ts =
        "class T {\n" +
        "    handleMessage(msg: any): void {\n" +
        "        if (msg === undefined) {\n" +
        "            return;\n" +
        "        }\n" +
        "        const x = msg;\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(ts).content;
        // Sync void method should keep bare return;
        expect(output).toMatch(/\breturn;\s*$/m);
        expect(output).not.toContain("supplyAsync");
    });

    test('async method with multiple returns does not add extra return null', () => {
        const ts =
        "class T {\n" +
        "    async fetchData(x: any): Promise<string> {\n" +
        "        if (x) {\n" +
        "            return \"a\";\n" +
        "        }\n" +
        "        return \"b\";\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(ts).content;
        // Last statement is a return, so no return null should be added
        const returnNullCount = output.split('\n').filter(l => l.trim() === 'return null;').length;
        expect(returnNullCount).toBe(0);
    });

    test('basic while loop', () => {
        const ts =
        "while (true) {\n" +
        "    const x = 1;\n" +
        "    break;\n" +
        "}"
        const java =
        "while (true)\n{\n" +
        "    Object x = 1;\n" +
        "    break;\n" +
        "}"
        const output = transpiler.transpileJava(ts).content;
        expect(output).toBe(java);
    });
});
