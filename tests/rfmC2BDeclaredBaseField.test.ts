import { Transpiler } from '../src/transpiler';
import { SyntaxKind } from 'typescript/unstable/ast';

jest.mock('module', () => ({
    __esModule: true,
    default: jest.fn()
}));

const declared = { 'urls': 'IDictionary<string, object>', 'positions': 'object' };
const makeConfig = (hook: boolean): any => ({ 'verbose': false, 'csharp': { ...(hook ? { 'declaredBaseFieldTypes': declared } : {}), 'parser': { 'NUM_LINES_END_FILE': 0, 'ELEMENT_ACCESS_WRAPPER_OPEN': 'getValue(', 'ELEMENT_ACCESS_WRAPPER_CLOSE': ')' } } });

// RFM-C2-B: reads of a hand-written base field the consumer declares (config.csharp.declaredBaseFieldTypes)
const source =
    "class Exchange {\n" +
    "    urls: any;\n" +
    "    positions: any;\n" +
    "    limits: any;\n" +
    "    f (type: string, other: any) {\n" +
    "        const a = this.urls['api'];\n" +
    "        const b = this.urls[type];\n" +
    "        const c = 'x' in this.urls;\n" +
    "        const d = this.positions[type];\n" +
    "        const e = type in this.positions;\n" +
    "        const f = other in this.positions;\n" +
    "        const g = this.urls[other];\n" +
    "        const h = this.limits[type];\n" +
    "        this.positions = {};\n" +
    "        this.urls['k'] = 1;\n" +
    "    }\n" +
    "    g (a: number, b: number) {\n" +
    "        const x = this.parseToInt (a);\n" +
    "        const y = this.parseToInt (b);\n" +
    "        const p = x % y === 0;\n" +
    "        const q = x % 7 === 0;\n" +
    "        const r = x % y !== 3;\n" +
    "        const s = x % this.foo === 0;\n" +
    "    }\n" +
    "    parseToInt (x: any): number { return 1 }\n" +
    "}";

const printer = (hook: boolean): string => {
    const transpiler: any = new Transpiler(makeConfig(hook));
    if (hook) {
        transpiler.csharpTranspiler.csharpExpressionTypeResolver = (node: any) => (node.kind === SyntaxKind.Identifier && [ 'x', 'y' ].includes(node.text)) ? 'Int64' : undefined;
    }
    return transpiler.transpileCSharp(source).content;
};

describe('RFM-C2-B: declared base-field dictionary reads', () => {
    test('without the consumer hook the helper emission is unchanged', () => {
        const out = printer(false);
        expect(out).toContain('getValue(this.positions, type)');
        expect(out).toContain('inOp(this.positions, type)');
        expect(out).toContain('isEqual(mod(x, y), 0)');
    });

    test('a member declared a dictionary reads through its own indexer and ContainsKey', () => {
        const out = printer(true);
        expect(out).toContain('bool c = this.urls.ContainsKey("x");');
    });

    test('an object member whose every write stores a dictionary keeps the helper cast and tests the key type', () => {
        const out = printer(true);
        expect(out).toContain('(((IDictionary<string,object>)this.positions) != null && type != null && ((IDictionary<string,object>)this.positions).ContainsKey((string)type) ? ((IDictionary<string,object>)this.positions)[(string)type] : null)');
        expect(out).toMatch(/type is string hx10w3Key\d+ && \(\(IDictionary<string,object>\)this\.positions\)\.ContainsKey\(hx10w3Key\d+\)/);
        expect(out).toContain('inOp(this.positions, other)');
    });

    test('an undeclared member, a non-string key and a write keep the helper', () => {
        const out = printer(true);
        expect(out).toContain('getValue(this.limits, type)');
        expect(out).toContain('getValue(this.urls, other)');
        expect(out).toContain('["k"] = 1');
    });

    test('isEqual over an Int64 remainder and an integer literal prints the operator', () => {
        const out = printer(true);
        expect(out).toContain('((x % y) == 0)');
        expect(out).toContain('((x % y) != 3)');
        // RF-cs-2 c (folds ccxt build/hx10w2-C04 nestedEqualText): a literal divisor of an Int64 identifier prints the
        // same remainder the host's mod pass would (`(Int64)((double)x % 7)`) behind the operator, so isEqual(mod (x, 7), 0)
        // no longer reaches that pass. The non-Int64 and non-literal-divisor shapes below keep the helper.
        expect(out).toContain('(((Int64)((double)x % 7)) == 0)');
        expect(out).not.toContain('isEqual(mod(x, y)');
        expect(out).toContain('mod(x, this.foo)');
    });
});

describe('RFM-C2-B: omit of a declared dictionary member', () => {
    const omitSource = "class Exchange {\n    urls: any;\n    positions: any;\n    f () {\n        const a = this.omit (this.urls, 'x');\n        const b = this.omit (this.positions, 'x');\n        const c = this.omit (this.urls, 'x', 'y');\n        this.urls = a;\n    }\n    omit (a: any, ...k: any[]) { return a }\n}";
    const run = (hook: boolean): string => (new Transpiler(makeConfig(hook)) as any).transpileCSharp(omitSource).content;
    test('without the table the local keeps the printer box', () => {
        expect(run(false)).not.toContain('Dictionary<string, object> a = ');
    });
    test('with the table the 2-argument omit of a dictionary member names its result', () => {
        const out = run(true);
        expect(out).toContain('Dictionary<string, object> a = this.omit(this.urls, "x");');
        expect(out).not.toContain('Dictionary<string, object> b = ');
        expect(out).not.toContain('Dictionary<string, object> c = ');
    });
});
