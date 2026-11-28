import { Transpiler } from '../src/transpiler';

// `x[0] = v` on a List<Object> local whose TS type is a tuple: List.set within the tuple's required length
describe('h36p34: literal-index writes on a tuple-typed List local', () => {
    let out: string;
    beforeAll(() => {
        const input =
            "type Num = number | undefined;\n" +
            "type OHLCV = [Num, Num, Num, Num, Num, Num];\n" +
            "type Opt = [Num, Num?];\n" +
            "class probe {\n" +
            "    p (x: any): OHLCV { return x; }\n" +
            "    q (x: any): Opt { return x; }\n" +
            "    a (x: any, t: Num) {\n" +
            "        const pa = this.p (x);\n" +
            "        pa[0] = t;\n" +
            "        return pa;\n" +
            "    }\n" +
            "    b (x: any, t: Num) {\n" +
            "        const pb = this.p (x);\n" +
            "        pb[0] = t;\n" +
            "        return pb;\n" +
            "    }\n" +
            "    c (x: any, t: Num) {\n" +
            "        const pc = this.q (x);\n" +
            "        pc[1] = t;\n" +
            "        return pc;\n" +
            "    }\n" +
            "    d (x: any, t: Num) {\n" +
            "        const pd: any[] = x;\n" +
            "        pd[0] = t;\n" +
            "        return pd;\n" +
            "    }\n" +
            "}\n";
        const transpiler = new Transpiler({ verbose: false, java: { parser: { NUM_LINES_END_FILE: 0 } } });
        const declared = { pa: 'List<Object>', pc: 'List<Object>', pd: 'List<Object>' };
        (transpiler as any).javaTranspiler.javaDeclaredLocalTypeResolver = (declaration: any) => declared[declaration?.name?.text];
        out = transpiler.transpileJava(input).content;
    });
    const body = (name: string): string => {
        const at = out.indexOf(` ${name}(`);
        return out.slice(at, out.indexOf('\n    }', at));
    };
    test('positive: an index below the tuple length on a declared List prints List.set (a null value too)', () => {
        expect(body('a')).toContain('pa.set(0, t)');
        expect(body('a')).not.toContain('Helpers.addElementToObject');
    });
    test('negative: a tuple local the build layer leaves Object keeps the helper', () => {
        expect(body('b')).toContain('Helpers.addElementToObject(pb, 0, t)');
    });
    test('negative: an optional tuple slot (the list may be shorter) keeps the helper', () => {
        expect(body('c')).toContain('Helpers.addElementToObject(pc, 1, t)');
    });
    test('negative: a plain array (no length proof) keeps the helper', () => {
        expect(body('d')).toContain('Helpers.addElementToObject(pd, 0, t)');
    });
});
