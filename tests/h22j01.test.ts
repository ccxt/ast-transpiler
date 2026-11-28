import { Transpiler } from '../src/transpiler';

jest.mock('module',()=>({
    __esModule: true,
    default: jest.fn()
}));

const make = (split: string | undefined): Transpiler => new Transpiler({
    verbose: false,
    java: {
        parser: { NUM_LINES_END_FILE: 0 },
        asyncSupplier: 'BaseExchange.supplyAsync',
        ...(split === undefined ? {} : { asyncCoreSplit: split }),
    },
});

const SOURCE =
    "class T {\n" +
    "    async fetchData(symbol: string, params = {}): Promise<any> {\n" +
    "        const y = await this.other(symbol);\n" +
    "        return y;\n" +
    "    }\n" +
    "    async noReturn(x: any): Promise<void> {\n" +
    "        const z = x;\n" +
    "    }\n" +
    "    async other(x: any): Promise<any> {\n" +
    "        return x;\n" +
    "    }\n" +
    "}";

describe('java async methods: private sync core plus one-line supplier wrapper', () => {
    test('positive: the body moves into <name>Core and the public method is one line', () => {
        const out = make('.').transpileJava(SOURCE).content;
        expect(out).toMatch(/\{\n +return BaseExchange\.supplyAsync\(\(\) -> this\.fetchDataCore\(symbol, parameters\)\);\n +\}/);
        expect(out).toMatch(/ private Object fetchDataCore\(Object symbol, Object parameters\)\n +\{\n/);
        expect(out).not.toContain('supplyAsync(() -> {');
        // a body without a return keeps the lambda's trailing `return null;` in the core
        expect(out).toMatch(/private Object noReturnCore\(Object x\)\n +\{\s+Object z = x;\n +return null;\s+\}/);
    });

    test('negative: off by default, the block lambda is printed as before', () => {
        const out = make(undefined).transpileJava(SOURCE).content;
        expect(out).toContain('return BaseExchange.supplyAsync(() -> {');
        expect(out).not.toContain('Core(');
    });

    test('negative: a source file outside the configured pattern keeps the lambda', () => {
        const out = make('/ts/src/(?!test/)').transpileJava(SOURCE).content;
        expect(out).toContain('return BaseExchange.supplyAsync(() -> {');
        expect(out).not.toContain('Core(');
    });

    test('negative: a class that already declares <name>Core keeps the lambda for that method', () => {
        const src = SOURCE.replace("    async other(", "    fetchDataCore (x: any): any {\n        return x;\n    }\n    async other(");
        const out = make('.').transpileJava(src).content;
        expect(out).toContain('return BaseExchange.supplyAsync(() -> {');
        expect(out).toContain('this.noReturnCore(x)');
    });

    test('negative: sync methods and arrow functions are not split', () => {
        const src = "class T {\n    run(x: any): any {\n        const f = async (y: any) => y;\n        return f;\n    }\n}";
        const out = make('.').transpileJava(src).content;
        expect(out).not.toContain('Core(');
    });
});
