import { Transpiler } from '../src/transpiler';
import { SyntaxKind } from 'typescript/unstable/ast';

jest.mock('module', () => ({
    __esModule: true,
    default: jest.fn()
}));

const config: any = { 'verbose': false, 'csharp': { 'parser': { 'NUM_LINES_END_FILE': 0, 'ELEMENT_ACCESS_WRAPPER_OPEN': 'getValue(', 'ELEMENT_ACCESS_WRAPPER_CLOSE': ')' } } };

// declared C# kinds the consumer's resolver answers for identifier reads
const kinds: any = { 'x': 'Int64', 'y': 'Int64', 'n': 'Int64?', 'k': 'int', 'm': 'int', 'd': 'double', 'o': 'object', 'i': 'Int64' };

const source =
    "class Exchange {\n" +
    "    mods (x: number, y: number, n: number, o: any, d: number) {\n" +
    "        const a = x % y;\n" +
    "        const b = 1000 % x;\n" +
    "        const c = n % y;\n" +
    "        const e = x % 0;\n" +
    "        const f = 5 % 3;\n" +
    "        const g = x % 7;\n" +
    "        const h = o % y;\n" +
    "        const j = d % y;\n" +
    "    }\n" +
    "    minmax (x: number, y: number, k: number, m: number, n: number, d: number, o: any) {\n" +
    "        const a = Math.min (x, y);\n" +
    "        const b = Math.max (x, 100);\n" +
    "        const c = Math.min (100, k);\n" +
    "        const e = Math.min (d, 100);\n" +
    "        const f = Math.min (o, 100);\n" +
    "        const g = Math.min (3, 100);\n" +
    "        const h = Math.min (n, 100);\n" +
    "        const p = (n === undefined) ? 100 : Math.min (n, 100);\n" +
    "        const q = (n !== undefined) && Math.max (n, 1);\n" +
    "        if (n !== undefined) {\n" +
    "            const r = Math.min (n, 100);\n" +
    "        }\n" +
    "        const s = Math.min (x, y).toString ();\n" +
    "        const t = Math.min (x, k);\n" +
    "        const u = Math.min (k, 3000000000);\n" +
    "    }\n" +
    "    rebound (n: number) {\n" +
    "        if (n !== undefined) {\n" +
    "            n = undefined;\n" +
    "            const r = Math.min (n, 100);\n" +
    "        }\n" +
    "    }\n" +
    "}";

const printer = (hook: boolean): string => {
    const transpiler: any = new Transpiler(config);
    if (hook) {
        transpiler.csharpTranspiler.csharpExpressionTypeResolver = (node: any) => (node.kind === SyntaxKind.Identifier) ? kinds[node.text] : undefined;
    }
    return transpiler.transpileCSharp(source).content;
};

describe('RD-CS-3: native mod / Math.Min / Math.Max on declared integral operands', () => {
    test('without declared kinds every call keeps the helper', () => {
        const out = printer(false);
        expect(out).toContain('mod(x, y)');
        expect(out).toContain('mathMin(x, y)');
        expect(out).toContain('mathMax(x, 100)');
        expect(out).toContain('mathMin(100, k)');
    });

    test('mod over Int64 / Int64? / literal operands prints the lifted remainder', () => {
        const out = printer(true);
        expect(out).toContain('(x % y)');
        expect(out).toContain('(1000 % x)');
        expect(out).toContain('(n % y)');
    });

    test('mod keeps the helper for a zero divisor, two literals, a small literal divisor and non-Int64 operands', () => {
        const out = printer(true);
        expect(out).toContain('mod(x, 0)');
        expect(out).toContain('mod(5, 3)');
        expect(out).toContain('mod(x, 7)');
        expect(out).toContain('mod(o, y)');
        expect(out).toContain('mod(d, y)');
    });

    test('Math.min / Math.max over int / Int64 operands print Math.Min / Math.Max', () => {
        const out = printer(true);
        expect(out).toContain('Math.Min(x, y)');
        expect(out).toContain('Math.Max(x, 100)');
        expect(out).toContain('Math.Min(100, k)');
    });

    test('double, object, a receiver position and a long literal against an int keep the helper', () => {
        const out = printer(true);
        expect(out).toContain('mathMin(d, 100)');
        expect(out).toContain('mathMin(o, 100)');
        expect(out).toContain('((object)mathMin(x, y)).ToString()');
        expect(out).toContain('mathMin(k, 3000000000)');
    });

    test('an Int64? operand unboxes only under a dominating null test', () => {
        const out = printer(true);
        expect(out).toContain('mathMin(n, 100)'); // untested
        expect(out).toContain('? 100 : Math.Min(n.Value, 100)');
        expect(out).toContain('Math.Max(n.Value, 1)');
        expect(out).toContain('Math.Min(n.Value, 100);');
    });

    test('a null test does not dominate a read after the binding is rewritten', () => {
        const out = printer(true);
        const body = out.slice(out.indexOf('rebound'));
        expect(body).toContain('mathMin(n, 100)');
        expect(body).not.toContain('.Value');
    });
});
