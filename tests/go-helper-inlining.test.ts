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
