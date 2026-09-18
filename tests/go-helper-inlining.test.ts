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

// the runtime Slice helper clamps a JS-style slice (negative bounds count from the end,
// a start-only call clamps its start to 0, an end past len is clamped to len), so the
// printed subscript reproduces that arithmetic; anything unproven keeps Slice(...)
describe('go .slice(a, b) -> native subscript on a declared string', () => {
    test('an end past len is clamped with min', () => {
        const ts =
        "class Test {\n" +
        "    f () {\n" +
        "        const s = 'abcdef'\n" +
        "        return s.slice (0, 3)\n" +
        "    }\n" +
        "}";
        const output = transpile(ts);
        expect(output).toContain('s[0:min(3, len(s))]');
        expect(output).not.toContain('Slice(');
    });
    test('a single non-negative bound keeps the :len form', () => {
        const ts =
        "class Test {\n" +
        "    f () {\n" +
        "        const s = 'abcdef'\n" +
        "        return s.slice (2)\n" +
        "    }\n" +
        "}";
        const output = transpile(ts);
        expect(output).toContain('s[2:]');
        expect(output).not.toContain('Slice(');
    });
    test('a negative start-only bound is clamped to 0 like the helper', () => {
        const ts =
        "class Test {\n" +
        "    f () {\n" +
        "        const s = 'abcdef'\n" +
        "        return s.slice (-4)\n" +
        "    }\n" +
        "}";
        const output = transpile(ts);
        expect(output).toContain('s[max(len(s) - 4, 0):]');
        expect(output).not.toContain('Slice(');
    });
    test('a negative end counts from the end', () => {
        const ts =
        "class Test {\n" +
        "    f () {\n" +
        "        const s = 'abcdef'\n" +
        "        return s.slice (0, -2)\n" +
        "    }\n" +
        "}";
        const output = transpile(ts);
        expect(output).toContain('s[0:len(s) - 2]');
        expect(output).not.toContain('Slice(');
    });
    test('two negative bounds shift both indices', () => {
        const ts =
        "class Test {\n" +
        "    f () {\n" +
        "        const s = 'abcdef'\n" +
        "        return s.slice (-4, -1)\n" +
        "    }\n" +
        "}";
        const output = transpile(ts);
        expect(output).toContain('s[len(s) - 4:len(s) - 1]');
        expect(output).not.toContain('Slice(');
    });
    test('the local keeps the string type the helper gave it', () => {
        const ts =
        "class Test {\n" +
        "    f () {\n" +
        "        const s = 'abcdef'\n" +
        "        const head = s.slice (0, 2)\n" +
        "        return head\n" +
        "    }\n" +
        "}";
        const output = transpile(ts);
        expect(output).toContain('var head string = s[0:min(2, len(s))]');
    });
    test('an any-typed receiver keeps Slice', () => {
        const ts =
        "class Test {\n" +
        "    f (a: any) {\n" +
        "        return a.slice (0, 3)\n" +
        "    }\n" +
        "}";
        const output = transpile(ts);
        expect(output).toContain('Slice(a, 0, 3)');
    });
    test('a non-literal bound keeps Slice', () => {
        const ts =
        "class Test {\n" +
        "    f (a: any) {\n" +
        "        const s = 'abcdef'\n" +
        "        const n = GetLength(a)\n" +
        "        return s.slice (0, n)\n" +
        "    }\n" +
        "}";
        const output = transpile(ts);
        expect(output).toContain('Slice(s, 0, n)');
    });
    test('a slice-list receiver keeps Slice', () => {
        const ts =
        "class Test {\n" +
        "    f (a: any) {\n" +
        "        const parts = Split(a, ',')\n" +
        "        return parts.slice (0, 2)\n" +
        "    }\n" +
        "}";
        const output = transpile(ts);
        expect(output).toContain('Slice(parts, 0, 2)');
    });
    test('a cast around the receiver prints nothing and keeps the subscript', () => {
        const ts =
        "class Test {\n" +
        "    f () {\n" +
        "        const s = 'abcdef'\n" +
        "        return (s as string).slice (0, 3)\n" +
        "    }\n" +
        "}";
        const output = transpile(ts);
        expect(output).toContain('s[0:min(3, len(s))]');
        expect(output).not.toContain('Slice(');
    });
});

// a `*string` local is nil when the accessor found nothing and the helper answers ""
// for it, so the inlined form keeps that branch as a guard around the subscript
describe('go .slice(a, b) -> native subscript on a declared *string', () => {
    test('the nil branch and the deref replace the helper call', () => {
        const ts =
        "class Test {\n" +
        "    f (a: any) {\n" +
        "        const s = Precise.stringMul (a, '2')\n" +
        "        return s.slice (2, 4)\n" +
        "    }\n" +
        "}";
        const output = transpile(ts);
        expect(output).not.toContain('Slice(');
        expect(output).toContain('if s == nil {\n\t\t\treturn ""\n\t\t}\n\t\tstr := *s\n\t\treturn str[2:min(4, len(str))]\n\t}()');
    });
    test('a pointer receiver with a non-literal bound keeps Slice', () => {
        const ts =
        "class Test {\n" +
        "    f (a: any) {\n" +
        "        const s = Precise.stringMul (a, '2')\n" +
        "        return s.slice (0, GetLength(a))\n" +
        "    }\n" +
        "}";
        const output = transpile(ts);
        expect(output).toContain('Slice(s, 0, GetLength(a))');
    });
    test('a cast around a pointer receiver is transparent too', () => {
        const ts =
        "class Test {\n" +
        "    f (a: any) {\n" +
        "        const s = Precise.stringMul (a, '2')\n" +
        "        return (s as string).slice (-4)\n" +
        "    }\n" +
        "}";
        const output = transpile(ts);
        expect(output).not.toContain('Slice(');
        expect(output).toContain('str[max(len(str) - 4, 0):]');
    });
    test('a cast around an any-typed receiver keeps Slice', () => {
        const ts =
        "class Test {\n" +
        "    f (a: any) {\n" +
        "        return (a as string).slice (0, 3)\n" +
        "    }\n" +
        "}";
        const output = transpile(ts);
        expect(output).toContain('Slice(a, 0, 3)');
    });
});
