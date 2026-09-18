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
        expect(output).toContain('var b string = func() string {\n\t\tif EvalTruthy(a) {\n\t\t\treturn "x"\n\t\t}\n\t\treturn "y"\n\t}()');
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
    test('a Go string local prints len (its bytes are what the helpers count)', () => {
        const ts =
        "class Test {\n" +
        "    f () {\n" +
        "        const s = 'abc'\n" +
        "        const n = s.length\n" +
        "        return n\n" +
        "    }\n" +
        "}";
        const output = transpile(ts);
        expect(output).toContain('var n int = len(s)');
        expect(output).not.toContain('GetArrayLength(');
        expect(output).not.toContain('GetLength(');
    });
    test('a TS-string-annotated local prints len instead of GetLength', () => {
        const ts =
        "class Test {\n" +
        "    f () {\n" +
        "        const s: string = 'abc'\n" +
        "        const n = s.length\n" +
        "        return n\n" +
        "    }\n" +
        "}";
        const output = transpile(ts);
        expect(output).toContain('var n int = len(s)');
        expect(output).not.toContain('GetLength(');
    });
    test('a *string local keeps GetLength', () => {
        const ts =
        "class Test {\n" +
        "    safeString (a: any, b: any): string { return a[b]; }\n" +
        "    f (a: any) {\n" +
        "        const s = this.safeString (a, 'b')\n" +
        "        const n = s.length\n" +
        "        return n\n" +
        "    }\n" +
        "}";
        const output = transpile(ts);
        expect(output).toContain('GetLength(s)');
        expect(output).not.toContain('len(s)');
    });
    test('a *string local with a TS-`any` type keeps GetArrayLength', () => {
        const ts =
        "class Test {\n" +
        "    safeString (a: any, b: any) { return a[b]; }\n" +
        "    f (a: any) {\n" +
        "        const s = this.safeString (a, 'b')\n" +
        "        const n = s.length\n" +
        "        return n\n" +
        "    }\n" +
        "}";
        const output = transpile(ts);
        expect(output).toContain('GetArrayLength(s)');
        expect(output).not.toContain('len(s)');
    });
    test('this.Symbols (a hand-written []string field) prints len', () => {
        const ts =
        "class Test {\n" +
        "    symbols: string[] = []\n" +
        "    f () {\n" +
        "        for (let i = 0; i < this.symbols.length; i++) {\n" +
        "            const s = this.symbols[i]\n" +
        "        }\n" +
        "    }\n" +
        "}";
        const output = transpile(ts);
        expect(output).toContain('for i := 0; i < len(this.Symbols); i++');
        expect(output).not.toContain('GetArrayLength(this.Symbols)');
    });
    test('a hand-written map/interface field keeps GetArrayLength', () => {
        const ts =
        "class Test {\n" +
        "    has: any = {}\n" +
        "    f () {\n" +
        "        const n = this.has.length\n" +
        "        return n\n" +
        "    }\n" +
        "}";
        const output = transpile(ts);
        expect(output).toContain('GetArrayLength(this.Has)');
    });
    test('a length feeding an arithmetic chain keeps the helper call', () => {
        const ts =
        "class Test {\n" +
        "    f () {\n" +
        "        const s = 'abc'\n" +
        "        const n = s.length - 2\n" +
        "        return n\n" +
        "    }\n" +
        "}";
        const output = transpile(ts);
        expect(output).toContain('Subtract(GetLength(s), 2)');
        expect(output).not.toContain('len(s)');
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
    // InOp derefs both operands (`derefScalar`): a *string key is the pointed-to
    // string and a nil pointer is a nil key, i.e. false
    const pointerKeyFixture = (body: string) =>
        "class Exchange {\n" +
        "    safeString(a, b) { return a; }\n" +
        "    safeInteger(a, b) { return a; }\n" +
        "    main(item) {\n" +
        body +
        "    }\n" +
        "}";
    test('a *string key prints the guarded deref read', () => {
        const ts = pointerKeyFixture(
        "        const m = { 'a': 1 }\n" +
        "        for (let i = 0; i < 2; i++) {\n" +
        "            const sym = this.safeString(item, 'symbol')\n" +
        "            if (sym in m) {\n" +
        "                return 1\n" +
        "            }\n" +
        "        }\n");
        const output = transpile(ts);
        expect(output).toContain('if func() bool {\n\t\t\tif sym == nil {\n\t\t\t\treturn false\n\t\t\t}\n\t\t\t_, ok := m[*sym]\n\t\t\treturn ok\n\t\t}() {');
        expect(output).not.toContain('InOp(');
    });
    test('a *string key keeps the statement indentation in a declaration', () => {
        const ts = pointerKeyFixture(
        "        const m = { 'a': 1 }\n" +
        "        const k = this.safeString(item, 'k')\n" +
        "        const has = !(k in m)\n" +
        "        return has\n");
        const output = transpile(ts);
        expect(output).toContain('var has bool = !(func() bool {\n\t\tif k == nil {\n\t\t\treturn false\n\t\t}\n\t\t_, ok := m[*k]\n\t\treturn ok\n\t}())');
        expect(output).not.toContain('InOp(');
    });
    test('a *string key operand of || keeps its parentheses', () => {
        const ts = pointerKeyFixture(
        "        const m = { 'a': 1 }\n" +
        "        const k = this.safeString(item, 'k')\n" +
        "        const other = this.safeString(item, 'o')\n" +
        "        if ((k in m) || (other in m)) {\n" +
        "            return 1\n" +
        "        }\n");
        const output = transpile(ts);
        expect(output).toContain('if (func() bool {\n\t\tif k == nil {\n\t\t\treturn false\n\t\t}\n\t\t_, ok := m[*k]\n\t\treturn ok\n\t}()) || (func() bool {\n\t\tif other == nil {\n\t\t\treturn false\n\t\t}\n\t\t_, ok := m[*other]\n\t\treturn ok\n\t}()) {');
        expect(output).not.toContain('InOp(');
    });
    test('a *int64 key keeps InOp', () => {
        const ts = pointerKeyFixture(
        "        const m = { 'a': 1 }\n" +
        "        const n = this.safeInteger(item, 'n')\n" +
        "        if (n in m) {\n" +
        "            return 1\n" +
        "        }\n");
        const output = transpile(ts);
        expect(output).toContain('InOp(m, n)');
    });
    test('a *string key on an any-typed dict keeps InOp', () => {
        const ts = pointerKeyFixture(
        "        let m: any = item\n" +
        "        const k = this.safeString(item, 'k')\n" +
        "        if (k in m) {\n" +
        "            return 1\n" +
        "        }\n");
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

// `x === 'lit'` on an identifier the printer itself declares `string`: the checker
// type of the initializer is `any` (an untyped helper result), but the emitted Go
// value is a plain string, so the comparison needs no IsEqual round-trip
describe('go IsEqual on a table-typed string local -> ==', () => {
    test('a string-declared local compared to a literal prints ==', () => {
        const ts =
        "class Test {\n" +
        "    f (fromAccount: any): boolean {\n" +
        "        const fromId = fromAccount.toUpperCase ()\n" +
        "        if (fromId === 'ISOLATED') {\n" +
        "            return true\n" +
        "        }\n" +
        "        return false\n" +
        "    }\n" +
        "}";
        const output = transpile(ts);
        expect(output).toContain('var fromId string = ToUpper(fromAccount)');
        expect(output).toContain('if fromId == "ISOLATED" {');
        expect(output).not.toContain('IsEqual(fromId');
    });
    test('!== prints != on the same declaration', () => {
        const ts =
        "class Test {\n" +
        "    f (fromAccount: any): boolean {\n" +
        "        const fromId = fromAccount.toUpperCase ()\n" +
        "        if (fromId !== 'ISOLATED') {\n" +
        "            return true\n" +
        "        }\n" +
        "        return false\n" +
        "    }\n" +
        "}";
        const output = transpile(ts);
        expect(output).toContain('if fromId != "ISOLATED" {');
        expect(output).not.toContain('IsEqual(fromId');
    });
    test('a literal on the left prints the same comparison', () => {
        const ts =
        "class Test {\n" +
        "    f (fromAccount: any): boolean {\n" +
        "        const fromId = fromAccount.toUpperCase ()\n" +
        "        if ('ISOLATED' === fromId) {\n" +
        "            return true\n" +
        "        }\n" +
        "        return false\n" +
        "    }\n" +
        "}";
        const output = transpile(ts);
        expect(output).toContain('if "ISOLATED" == fromId {');
        expect(output).not.toContain('IsEqual(');
    });
    test('a later string write keeps the declaration typed and the comparison native', () => {
        const ts =
        "class Test {\n" +
        "    f (a: any): boolean {\n" +
        "        let fromId = a.toUpperCase ()\n" +
        "        fromId = 'X'\n" +
        "        if (fromId === 'ISOLATED') {\n" +
        "            return true\n" +
        "        }\n" +
        "        if (fromId !== 'Y') {\n" +
        "            return true\n" +
        "        }\n" +
        "        return false\n" +
        "    }\n" +
        "}";
        const output = transpile(ts);
        expect(output).toContain('var fromId string = ToUpper(a)');
        expect(output).toContain('fromId = "X"');
        expect(output).toContain('if fromId == "ISOLATED" {');
        expect(output).toContain('if fromId != "Y" {');
        expect(output).not.toContain('IsEqual(fromId');
    });
    test('a later write of another type demotes the declaration back to any', () => {
        const ts =
        "class Test {\n" +
        "    f (a: any, b: any): boolean {\n" +
        "        let fromId = a.toUpperCase ()\n" +
        "        fromId = b\n" +
        "        if (fromId === 'ISOLATED') {\n" +
        "            return true\n" +
        "        }\n" +
        "        return false\n" +
        "    }\n" +
        "}";
        const output = transpile(ts);
        expect(output).toContain('var fromId any = ToUpper(a)');
    });
    test('two any-typed identifiers keep IsEqual', () => {
        const ts =
        "class Test {\n" +
        "    f (params: any): boolean {\n" +
        "        const x = GetValue(params, 'k')\n" +
        "        const y = GetValue(params, 'j')\n" +
        "        if (x === y) {\n" +
        "            return true\n" +
        "        }\n" +
        "        return false\n" +
        "    }\n" +
        "}";
        const output = transpile(ts);
        expect(output).toContain('IsEqual(x, y)');
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
