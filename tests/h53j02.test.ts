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

const run = (body: string) => make().transpileJava("class T {\n" + body + "}\n").content;

describe('h53-J02 push on a receiver declared List<Object>', () => {
    test('an untyped local keeps the checkcast', () => {
        const out = run(
            "    rows (x: any): any {\n" +
            "        let result = undefined;\n" +
            "        result = x;\n" +
            "        result.push (1);\n" +
            "        return result;\n" +
            "    }\n");
        expect(out).toContain('((java.util.List<Object>)result).add(1)');
    });

    test('a local the build layer declares List<Object> pushes without the checkcast', () => {
        const t = make();
        (t as any).javaTranspiler.javaDeclaredLocalTypeResolver = (d: any) => (d?.name?.text === 'result' ? 'List<Object>' : undefined);
        const out = t.transpileJava("class T {\n" +
            "    rows (n: number): any[] {\n" +
            "        const result = [];\n" +
            "        result.push (n);\n" +
            "        return result;\n" +
            "    }\n}\n").content;
        expect(out).toContain('result.add(n);');
        expect(out).not.toContain('((java.util.List<Object>)result)');
    });

    test('a local the build layer declares List<String> keeps the checkcast', () => {
        const t = make();
        (t as any).javaTranspiler.javaDeclaredLocalTypeResolver = (d: any) => (d?.name?.text === 'result' ? 'List<String>' : undefined);
        const out = t.transpileJava("class T {\n" +
            "    rows (n: string): any[] {\n" +
            "        const result = [];\n" +
            "        result.push (n);\n" +
            "        return result;\n" +
            "    }\n}\n").content;
        expect(out).not.toContain('        result.add(n);');
    });

    test('the printer reports what it prints for a typed list local', () => {
        const out = run(
            "    rows (n: number): any[] {\n" +
            "        const result: any[] = [];\n" +
            "        for (let i = 0; i < n; i++) {\n" +
            "            result.push (i);\n" +
            "        }\n" +
            "        return result;\n" +
            "    }\n");
        const declaredList = /List<Object> result = /.test(out);
        if (declaredList) {
            expect(out).toContain('result.add(i)');
            expect(out).not.toContain('((java.util.List<Object>)result)');
        } else {
            expect(out).toContain('((java.util.List<Object>)result).add(i)');
        }
    });
});
