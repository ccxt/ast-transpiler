import { Transpiler } from '../src/transpiler';

jest.mock('module',()=>({
    __esModule: true,
    default: jest.fn()
}));

const make = (): Transpiler => new Transpiler({
    verbose: false,
    java: {
        parser: { NUM_LINES_END_FILE: 0 },
    },
});

const wrap = (body: string) =>
    "class T {\n" +
    "    async fetchA (x: number): Promise<number> {\n" +
    "        return x;\n" +
    "    }\n" +
    "    foo (): number {\n" +
    "        return 1;\n" +
    "    }\n" +
    body +
    "}\n";

const run = (body: string) => {
    const t = make();
    return t.transpileJava(wrap(body)).content;
};

describe('h27-J06 typed future list for Promise.all', () => {
    test('a pushed future list prints List<CompletableFuture<?>> and a short allOf join', () => {
        const out = run(
            "    async many (): Promise<any> {\n" +
            "        const promises = [];\n" +
            "        promises.push (this.fetchA (1));\n" +
            "        promises.push (this.fetchA (2));\n" +
            "        const results = await Promise.all (promises);\n" +
            "        return results;\n" +
            "    }\n");
        expect(out).toContain('java.util.List<java.util.concurrent.CompletableFuture<?>> promises = new java.util.ArrayList<java.util.concurrent.CompletableFuture<?>>();');
        expect(out).toContain('promises.add(this.fetchA(1));');
        expect(out).toContain('(java.util.concurrent.CompletableFuture.allOf(promises.toArray(new java.util.concurrent.CompletableFuture<?>[0])).thenApply((promiseAllDone) -> new java.util.ArrayList<Object>(promises.stream().<Object>map(java.util.concurrent.CompletableFuture::join).toList()))).join()');
        expect(out).not.toContain('promiseAllItem');
        expect(out).not.toContain('Helpers.promiseAll');
    });

    test('a non-promise push keeps the boxed list', () => {
        const out = run(
            "    async many (): Promise<any> {\n" +
            "        const promises = [];\n" +
            "        promises.push (this.fetchA (1));\n" +
            "        promises.push (this.foo ());\n" +
            "        return await Promise.all (promises);\n" +
            "    }\n");
        expect(out).not.toContain('CompletableFuture<?>> promises');
        expect(out).toContain('((java.util.List<Object>)promises).add(this.foo())');
    });

    test('another use of the list (length) keeps the boxed list', () => {
        const out = run(
            "    async many (): Promise<any> {\n" +
            "        const promises = [];\n" +
            "        promises.push (this.fetchA (1));\n" +
            "        const n = promises.length;\n" +
            "        return await Promise.all (promises);\n" +
            "    }\n");
        expect(out).toContain('java.util.List<java.util.concurrent.CompletableFuture<?>> promises = new java.util.ArrayList<java.util.concurrent.CompletableFuture<?>>();');
    });

    test('a reassignable let list keeps the boxed list', () => {
        const out = run(
            "    async many (): Promise<any> {\n" +
            "        let promises = [];\n" +
            "        promises.push (this.fetchA (1));\n" +
            "        promises = [];\n" +
            "        return await Promise.all (promises);\n" +
            "    }\n");
        expect(out).not.toContain('CompletableFuture<?>> promises');
    });
});
