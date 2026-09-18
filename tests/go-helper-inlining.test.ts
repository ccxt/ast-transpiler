import { Transpiler } from '../src/transpiler';

jest.mock('module', () => ({
    __esModule: true,
    default: jest.fn()
}));

let transpiler: Transpiler;

beforeAll(() => {
    const config = {
        'verbose': false,
        'go': {
            'parser': {
                'NUM_LINES_END_FILE': 0,
            }
        }
    }
    transpiler = new Transpiler(config);
})

const transpile = (ts: string) => transpiler.transpileGo(ts).content;

// helper-family removal: Ternary / OpNeg / InOp / GetArrayLength print as native
// Go when the type probe can name the value; the helper stays for an `any` box
describe('go ternary -> func literal', () => {
    test('an any-typed condition keeps its truthiness wrapper', () => {
        const ts =
        "class Test {\n" +
        "    f (a: any) {\n" +
        "        const b = a ? 'x' : 'y'\n" +
        "        return b\n" +
        "    }\n" +
        "}";
        const output = transpile(ts);
        expect(output).toContain('var b any = func() any {\n\t\tif EvalTruthy(a) {\n\t\t\treturn "x"\n\t\t}\n\t\treturn "y"\n\t}()');
        expect(output).not.toContain('Ternary(');
    });
    test('a bool-typed condition is inlined bare', () => {
        const ts =
        "class Test {\n" +
        "    f (a: any) {\n" +
        "        const cond = (a === 'x')\n" +
        "        const b = cond ? 1 : 2\n" +
        "        return b\n" +
        "    }\n" +
        "}";
        const output = transpile(ts);
        expect(output).toContain('if cond {\n\t\t\treturn 1\n\t\t}\n\t\treturn 2\n\t}()');
        expect(output).not.toContain('Ternary(');
    });
});

describe('go .length -> len on a slice', () => {
    test('a slice-typed local prints len', () => {
        const ts =
        "class Test {\n" +
        "    f (a: any) {\n" +
        "        const parts = ObjectKeys(a)\n" +
        "        const n = parts.length\n" +
        "        return n\n" +
        "    }\n" +
        "}";
        const output = transpile(ts);
        expect(output).toContain('len(parts)');
        expect(output).not.toContain('GetArrayLength(');
    });
    test('an any-typed local keeps GetArrayLength', () => {
        const ts =
        "class Test {\n" +
        "    f (a: any) {\n" +
        "        const parts = GetValue(a, 0)\n" +
        "        const n = parts.length\n" +
        "        return n\n" +
        "    }\n" +
        "}";
        const output = transpile(ts);
        expect(output).toContain('GetArrayLength(parts)');
    });
    test('a map-typed local keeps GetArrayLength', () => {
        const ts =
        "class Test {\n" +
        "    f (a: any) {\n" +
        "        const m = { 'a': 1 }\n" +
        "        const n = m.length\n" +
        "        return n\n" +
        "    }\n" +
        "}";
        const output = transpile(ts);
        expect(output).toContain('GetArrayLength(m)');
    });
});

describe('go `key in obj` -> map membership', () => {
    test('a map-typed dict with a string literal key prints the func literal', () => {
        const ts =
        "class Test {\n" +
        "    f () {\n" +
        "        const m = { 'a': 1 }\n" +
        "        if ('a' in m) {\n" +
        "            return 1\n" +
        "        }\n" +
        "    }\n" +
        "}";
        const output = transpile(ts);
        expect(output).toContain('if func() bool { _, ok := m["a"]; return ok }() {');
        expect(output).not.toContain('InOp(');
    });
    test('a parenthesized operand inside || stays a bare bool', () => {
        const ts =
        "class Test {\n" +
        "    f () {\n" +
        "        const m = { 'a': 1 }\n" +
        "        if (('a' in m) || ('b' in m)) {\n" +
        "            return 1\n" +
        "        }\n" +
        "    }\n" +
        "}";
        const output = transpile(ts);
        expect(output).toContain('if (func() bool { _, ok := m["a"]; return ok }()) || (func() bool { _, ok := m["b"]; return ok }()) {');
        expect(output).not.toContain('EvalTruthy((func() bool');
        expect(output).not.toContain('InOp(');
    });
    test('an any-typed dict keeps InOp', () => {
        const ts =
        "class Test {\n" +
        "    f (a: any) {\n" +
        "        if ('a' in a) {\n" +
        "            return 1\n" +
        "        }\n" +
        "    }\n" +
        "}";
        const output = transpile(ts);
        expect(output).toContain('InOp(a, "a")');
    });
    test('a non-string key keeps InOp', () => {
        const ts =
        "class Test {\n" +
        "    f (k: any) {\n" +
        "        const m = { 'a': 1 }\n" +
        "        if (k in m) {\n" +
        "            return 1\n" +
        "        }\n" +
        "    }\n" +
        "}";
        const output = transpile(ts);
        expect(output).toContain('InOp(m, k)');
    });
});

describe('go unary minus -> -x', () => {
    test('a literal operand inside a normalizing comparison prints -1', () => {
        const ts =
        "class Test {\n" +
        "    f (a: any) {\n" +
        "        if (a > -1) {\n" +
        "            return 1\n" +
        "        }\n" +
        "    }\n" +
        "}";
        const output = transpile(ts);
        expect(output).toContain('if IsGreaterThan(a, -1) {');
        expect(output).not.toContain('OpNeg(');
    });
    test('a float64-typed local prints -x', () => {
        const ts =
        "class Test {\n" +
        "    f (a: any) {\n" +
        "        const f = Math.floor(a)\n" +
        "        const g = -f\n" +
        "        return g\n" +
        "    }\n" +
        "}";
        const output = transpile(ts);
        expect(output).toContain('var g any = -f');
        expect(output).not.toContain('OpNeg(');
    });
    test('a declaration initializer keeps OpNeg (int64 box)', () => {
        const ts =
        "class Test {\n" +
        "    f () {\n" +
        "        const x = -1\n" +
        "        return x\n" +
        "    }\n" +
        "}";
        const output = transpile(ts);
        expect(output).toContain('OpNeg(1)');
    });
    test('an any-typed operand keeps OpNeg', () => {
        const ts =
        "class Test {\n" +
        "    f (a: any) {\n" +
        "        const x = -a\n" +
        "        return x\n" +
        "    }\n" +
        "}";
        const output = transpile(ts);
        expect(output).toContain('OpNeg(a)');
    });
});

describe('go len() keeps the int classification', () => {
    test('a local initialised from len() is declared int', () => {
        const ts =
        "class Test {\n" +
        "    f (a: any) {\n" +
        "        const parts = ObjectKeys(a)\n" +
        "        const n = parts.length\n" +
        "        return n\n" +
        "    }\n" +
        "}";
        const output = transpile(ts);
        expect(output).toContain('var n int = ');
    });
});

// IsArray folds to a constant on an operand whose Go type the printer names, and to the
// two-value assertion on a box that only ever holds a []any; every other box keeps the helper
describe('go IsArray -> constant / type assertion', () => {
    test('a []string-typed local folds to true', () => {
        const ts =
        "class Test {\n" +
        "    f (a: any) {\n" +
        "        const parts = ObjectKeys(a)\n" +
        "        if (Array.isArray(parts)) {\n" +
        "            return parts.length\n" +
        "        }\n" +
        "        return 0\n" +
        "    }\n" +
        "}";
        const output = transpile(ts);
        expect(output).toContain('if true {');
        expect(output).not.toContain('IsArray(');
    });
    test('a []any-typed local folds to true', () => {
        const ts =
        "class Test {\n" +
        "    f (a: any) {\n" +
        "        const res = [a]\n" +
        "        if (Array.isArray(res)) {\n" +
        "            return res[0]\n" +
        "        }\n" +
        "        return 0\n" +
        "    }\n" +
        "}";
        const output = transpile(ts);
        expect(output).toContain('if true {');
        expect(output).not.toContain('IsArray(');
    });
    test('a map-typed local folds to false', () => {
        const ts =
        "class Test {\n" +
        "    f (a: any) {\n" +
        "        const d = { 'x': 1 }\n" +
        "        if (Array.isArray(d)) {\n" +
        "            return d['x']\n" +
        "        }\n" +
        "        return 0\n" +
        "    }\n" +
        "}";
        const output = transpile(ts);
        expect(output).toContain('if false {');
        expect(output).not.toContain('IsArray(');
    });
    test('a negated fold keeps the negation', () => {
        const ts =
        "class Test {\n" +
        "    f (a: any) {\n" +
        "        const parts = ObjectKeys(a)\n" +
        "        if (!Array.isArray(parts)) {\n" +
        "            return parts.length\n" +
        "        }\n" +
        "        return 0\n" +
        "    }\n" +
        "}";
        const output = transpile(ts);
        expect(output).toContain('if !true {');
    });
    test('a slice-typed local without another use keeps the helper', () => {
        const ts =
        "class Test {\n" +
        "    f (a: any) {\n" +
        "        const parts = ObjectKeys(a)\n" +
        "        return Array.isArray(parts)\n" +
        "    }\n" +
        "}";
        const output = transpile(ts);
        expect(output).toContain('IsArray(parts)');
    });
    test('an any-typed local keeps the helper', () => {
        const ts =
        "class Test {\n" +
        "    f (a: any) {\n" +
        "        const v = GetValue(a, 'k')\n" +
        "        if (Array.isArray(v)) {\n" +
        "            return v\n" +
        "        }\n" +
        "        return 0\n" +
        "    }\n" +
        "}";
        const output = transpile(ts);
        expect(output).toContain('IsArray(v)');
    });
    test('an any-typed local reassigned from a call keeps the helper', () => {
        const ts =
        "class Test {\n" +
        "    f (a: any) {\n" +
        "        let res = []\n" +
        "        res = this.parseTrades(a)\n" +
        "        if (Array.isArray(res)) {\n" +
        "            return res\n" +
        "        }\n" +
        "        return 0\n" +
        "    }\n" +
        "}";
        const output = transpile(ts);
        expect(output).toContain('IsArray(res)');
    });
    test('a boxed local that only ever holds a []any prints the assertion', () => {
        const ts =
        "class Test {\n" +
        "    f (a: any) {\n" +
        "        const res = []\n" +
        "        res.push(a)\n" +
        "        if (Array.isArray(res)) {\n" +
        "            return res\n" +
        "        }\n" +
        "        return 0\n" +
        "    }\n" +
        "}";
        const output = transpile(ts);
        expect(output).toContain('if func() bool { _, ok := res.([]any); return ok }() {');
        expect(output).not.toContain('IsArray(');
    });
    test('a call operand keeps the helper', () => {
        const ts =
        "class Test {\n" +
        "    f (a: any) {\n" +
        "        return Array.isArray(GetValue(a, 'k'))\n" +
        "    }\n" +
        "}";
        const output = transpile(ts);
        expect(output).toContain('IsArray(GetValue(a, "k"))');
    });
});
