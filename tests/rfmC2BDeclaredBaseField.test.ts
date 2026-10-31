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
        expect(out).toContain('object a = (this.urls != null && this.urls.ContainsKey("api") ? this.urls["api"] : null);');
        expect(out).toContain('bool c = this.urls.ContainsKey("x");');
        expect(out).not.toContain('(IDictionary<string, object>)this.urls');
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
        expect(out).toContain('isEqual(mod(x, 7), 0)');
        expect(out).not.toContain('isEqual(mod(x, y)');
        expect(out).toContain('mod(x, this.foo)');
    });
});
