import { Transpiler } from '../src/transpiler';

// writes of `Precise.decimals` (an `int` field in Precise.java) from sum / Math.max print natively
describe('h37p32: Precise.decimals writes', () => {
    let out: string;
    beforeAll(() => {
        const input =
            "type Int = number | undefined;\n" +
            "class Precise {\n" +
            "    decimals: number;\n" +
            "    constructor (s: string) { this.decimals = 0; }\n" +
            "}\n" +
            "class Other {\n" +
            "    decimals: number;\n" +
            "}\n" +
            "class BaseExchange {\n" +
            "    sum (a: any, b: any): any { return a; }\n" +
            "    parseToInt (x: any): any { return x; }\n" +
            "    safeInteger (o: any, k: any, d: any = undefined): Int { return o; }\n" +
            "}\n" +
            "class probe extends BaseExchange {\n" +
            "    a (s: string, scale: Int) {\n" +
            "        const pa = new Precise (s);\n" +
            "        pa.decimals = this.sum (pa.decimals, this.parseToInt (scale));\n" +
            "        return pa;\n" +
            "    }\n" +
            "    b (s: string, scale: Int) {\n" +
            "        const pb = new Precise (s);\n" +
            "        pb.decimals = this.sum (pb.decimals, this.safeInteger ([ scale ], 0, 0));\n" +
            "        return pb;\n" +
            "    }\n" +
            "    c (s: string, m: any) {\n" +
            "        const k = this.safeInteger (m, 'k');\n" +
            "        const pc = new Precise (s);\n" +
            "        if (k !== undefined) {\n" +
            "            pc.decimals = Math.max (pc.decimals, k);\n" +
            "        }\n" +
            "        return pc;\n" +
            "    }\n" +
            "    d (s: string, m: any) {\n" +
            "        const k = this.safeInteger (m, 'k');\n" +
            "        const pd = new Precise (s);\n" +
            "        pd.decimals = Math.max (pd.decimals, k);\n" +
            "        return pd;\n" +
            "    }\n" +
            "    e (o: Other, m: any) {\n" +
            "        o.decimals = this.sum (o.decimals, this.parseToInt (m));\n" +
            "        return o;\n" +
            "    }\n" +
            "    f (s: string, m: any) {\n" +
            "        const pf = new Precise (s);\n" +
            "        pf.decimals = this.sum (pf.decimals, m);\n" +
            "        return pf;\n" +
            "    }\n" +
            "}\n";
        const transpiler = new Transpiler({ verbose: false, java: { parser: { NUM_LINES_END_FILE: 0 } } });
        (transpiler as any).javaTranspiler.javaDeclaredLocalTypeResolver = (declaration: any) => (declaration?.name?.text === 'k' ? 'Long' : undefined);
        out = transpiler.transpileJava(input).content;
    });
    const line = (name: string): string => out.split('\n').find((l) => l.includes(`${name}.decimals =`) || l.includes(`${name}.decimals +=`)) ?? '';
    test('sum with parseToInt adds the Long natively, 0 for null', () => {
        expect(line('pa').trim()).toBe('pa.decimals += java.util.Objects.requireNonNullElse(this.parseToInt(scale), 0L).intValue();');
    });
    test('sum with safeInteger adds natively', () => {
        expect(line('pb')).toContain('pb.decimals += java.util.Objects.requireNonNullElse(this.safeInteger(');
    });
    test('guarded Math.max on a Long local is native', () => {
        expect(line('pc').trim()).toBe('pc.decimals = Math.max(pc.decimals, k.intValue());');
    });
    test('unguarded Math.max keeps the old form', () => {
        expect(line('pd')).not.toContain('k.intValue()');
    });
    test('a decimals field of another class keeps the helper', () => {
        expect(line('o')).toContain('this.sum(');
    });
    test('sum of an untyped operand keeps the helper', () => {
        expect(line('pf')).toContain('this.sum(');
    });
});
