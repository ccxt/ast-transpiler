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

const F = 'java.util.concurrent.CompletableFuture';

describe('h28-J06 future list seeded with typed calls', () => {
    test('a seeded list with a destructured join prints the typed list and allOf', () => {
        const out = run(
            "    async many (): Promise<any> {\n" +
            "        const promises = [ this.fetchA (1), this.fetchA (2) ];\n" +
            "        promises.push (this.fetchA (3));\n" +
            "        const [ a, b ] = await Promise.all (promises);\n" +
            "        return a;\n" +
            "    }\n");
        expect(out).toContain(`java.util.List<${F}<?>> promises = new java.util.ArrayList<${F}<?>>(java.util.Arrays.<${F}<?>>asList(this.fetchA(1), this.fetchA(2)));`);
        expect(out).toContain('promises.add(this.fetchA(3))');
        expect(out).not.toContain('promiseAllItem');
    });

    test('a seed that is not a future keeps the boxed list', () => {
        const out = run(
            "    async many (): Promise<any> {\n" +
            "        const promises = [ this.fetchA (1), this.foo () ];\n" +
            "        return await Promise.all (promises);\n" +
            "    }\n");
        expect(out).not.toContain(`${F}<?>> promises`);
    });

    test('an identifier seed keeps the boxed list', () => {
        const out = run(
            "    async many (): Promise<any> {\n" +
            "        const p = this.fetchA (1);\n" +
            "        const promises = [ p ];\n" +
            "        return await Promise.all (promises);\n" +
            "    }\n");
        expect(out).toContain(`${F}<?>> promises = new java.util.ArrayList<${F}<?>>(java.util.Arrays.<${F}<?>>asList(p));`);
    });

    test('another use of the list keeps the boxed list', () => {
        const out = run(
            "    async many (): Promise<any> {\n" +
            "        const promises = [ this.fetchA (1) ];\n" +
            "        const n = promises.length;\n" +
            "        return await Promise.all (promises);\n" +
            "    }\n");
        expect(out).toContain(`${F}<?>> promises = new java.util.ArrayList<${F}<?>>(java.util.Arrays.<${F}<?>>asList(this.fetchA(1)));`);
    });
});
