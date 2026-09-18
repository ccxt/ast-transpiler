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
        expect(output).toContain('var b any = func() any { if EvalTruthy(a) { return "x" }; return "y" }()');
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
        expect(output).toContain('if cond { return 1 }; return 2 }()');
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

describe('go numeric equality preserves runtime numeric normalization', () => {
    test.each([
        ['===', 'IsEqual'],
        ['==', 'IsEqual'],
        ['!==', '!IsEqual'],
        ['!=', '!IsEqual'],
    ])('%s keeps the helper for a last-batch comparison in either operand order', (operator, helper) => {
        const output = transpile(`
            function last(values: any[]) {
                const count = values.length;
                for (let i = 0; i < count; i++) {
                    const forward = i ${operator} (count - 1);
                    const reverse = (count - 1) ${operator} i;
                    console.log(forward, reverse);
                }
            }
        `);
        expect(output).toContain(`${helper}(i, (Subtract(count, 1)))`);
        expect(output).toContain(`${helper}((Subtract(count, 1)), i)`);
    });

    test('number parameters keep normalization across differently boxed values', () => {
        const output = transpile('function compare(a: number, b: number) { return a === b; }');
        expect(output).toContain('return IsEqual(a, b)');
    });

    test('numeric locals emitted as any do not use native equality', () => {
        const output = transpile('const a = 1; const b = 1; console.log(a === b);');
        expect(output).toContain('IsEqual(a, b)');
    });

    test('different concrete numeric types keep normalization', () => {
        const output = transpile(`
            const values = [1];
            const count = values.length;
            const rounded = Math.floor(1.5);
            console.log(count === rounded, rounded !== count);
        `);
        expect(output).toContain('IsEqual(count, rounded)');
        expect(output).toContain('!IsEqual(rounded, count)');
    });

    test('matching concrete types and integer constants still use native equality', () => {
        const output = transpile(`
            const values = [1];
            const left = values.length;
            const right = values.length;
            const a = Math.floor(1.5);
            const b = Math.floor(2.5);
            console.log(left === right, left !== 0, 0 === right, a === b, a === 1);
        `);
        expect(output).toContain('(left == right)');
        expect(output).toContain('(left != 0)');
        expect(output).toContain('(0 == right)');
        expect(output).toContain('(a == b)');
        expect(output).toContain('(a == 1)');
        expect(output).not.toContain('IsEqual(');
    });

    test('number-returning calls are evaluated once per operand', () => {
        const output = transpile('function next(): number { return 1; } const same = next() === next();');
        expect(output).toContain('var same bool = IsEqual(Next(), Next())');
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
