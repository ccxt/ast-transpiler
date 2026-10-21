import { Transpiler } from '../src/transpiler';
import { isElementAccessExpression, isIdentifier } from "typescript/unstable/ast/is";
import { RUST_DECLARED_DICT_LOCALS } from '../src/rustTranspiler';

jest.mock('module',()=>({
    __esModule: true,
    default: jest.fn()
}));

let transpiler: Transpiler;

beforeAll(() => {
    const config = {
        'verbose': false,
        'rust': {
            'parser': {
                'NUM_LINES_END_FILE': 0,
            }
        }
    }
    transpiler = new Transpiler(config);
})

describe('rust transpiling tests', () => {
    test('basic variable declaration', () => {
        const ts = "const x = 1;"
        const rust = "let mut x: Value = Value::Int(1);"
        const output = transpiler.transpileRust(ts).content;
        expect(output).toBe(rust);
    });

    test('string variable declaration', () => {
        const ts = 'const s = "hello";'
        const rust = 'let mut s: Value = Value::Str("hello".into());'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toBe(rust);
    });

    test('boolean variable declaration', () => {
        // An unused bool literal is a native `bool` local (see the
        // native-typed-locals tests at the end of this file).
        const ts = "const b = false;"
        const rust = "let mut b: bool = false;"
        const output = transpiler.transpileRust(ts).content;
        expect(output).toBe(rust);
    });

    test('basic while loop', () => {
        const ts =
        "while (true) {\n" +
        "    const x = 1;\n" +
        "    break;\n" +
        "}"
        const rust =
        "while (true) {\n" +
        "    let mut x: Value = Value::Int(1);\n" +
        "    break;\n" +
        "}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toBe(rust);
    });

    test('basic class declaration', () => {
        const ts =
        "class Test {\n" +
        "    main() {\n" +
        "        return 1\n" +
        "    }\n" +
        "}";
        const rust = transpiler.transpileRust(ts).content;
        expect(rust).toContain('pub struct Test');
        expect(rust).toContain('pub fn new()');
        expect(rust).toContain('pub fn main(');
        expect(rust).toContain('return Value::Int(1)');
    });

    test('falsy values', () => {
        const ts =
        'const a = "hi";\n' +
        "const b = false;\n" +
        "const c = a && b;\n" +
        "if (a) {\n" +
        "    const f = 1;\n" +
        "}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('is_true(&a)');
        expect(output).toContain('is_true(&b)');
        expect(output).toContain('if is_true(&a)');
    });

    test('equality comparison', () => {
        const ts = "const r = (x == y);"
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('is_equal(&x, &y)');
    });

    test('not equal comparison', () => {
        const ts = "const r = (x !== y);"
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('!is_equal(&x, &y)');
    });

    test('addition wrapping', () => {
        const ts = "const c = a + b;"
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('add(&a, &b)');
    });

    test('should convert concat', () => {
        const ts = "y.concat(z)";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('concat(');
        expect(output).toContain('y');
        expect(output).toContain('z');
    });

    test('array literal', () => {
        const ts = "const x = [1,2,3];"
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('Value::from(vec![');
        expect(output).not.toContain('Value::List(');
        expect(output).toContain('Value::Int(1)');
        expect(output).toContain('Value::Int(2)');
        expect(output).toContain('Value::Int(3)');
    });

    test('empty array literal', () => {
        const ts = "const x = [];"
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('Value::from(vec![])');
        expect(output).not.toContain('Value::List(');
    });

    test('nested array literal', () => {
        const ts = "const x = [[1],[]];"
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('Value::from(vec![Value::from(vec![Value::Int(1)]), Value::from(vec![])])');
        expect(output).not.toContain('Value::List(');
    });

    test('array literal as a call argument', () => {
        const ts = "const x = this.foo([1,2]);"
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('self.foo(Value::from(vec![Value::Int(1), Value::Int(2)]))');
        expect(output).not.toContain('Value::List(');
    });

    test('array length', () => {
        const ts = "const n = arr.length;"
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('get_array_length(&arr)');
    });

    test('element access', () => {
        const ts = "const x = arr[0];"
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('get_value(&arr, &Value::Int(0))');
    });

    test('console.log', () => {
        const ts = 'console.log(x);'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('println_val(&x)');
    });

    test('new expression', () => {
        const ts = "const obj = new MyClass();"
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('MyClass::new()');
    });

    test('null/undefined', () => {
        const ts = "const x = undefined;"
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('Value::Null');
    });

    test('object literal', () => {
        const ts = 'const d = {"a": 1};'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('Value::Map(');
        expect(output).toContain('HashMap::new()');
        expect(output).toContain('"a".to_string()');
    });

    test('for loop converts to while', () => {
        const ts =
        "for (let i = 0; i < 10; i++) {\n" +
        "    const x = 1;\n" +
        "}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('while');
        // Both operands are checker-typed numbers — native f64 comparison.
        expect(output).toContain('i.as_f64().unwrap_or(f64::NAN) < Value::Int(10).as_f64().unwrap_or(f64::NAN)');
    });

    // Numeric comparisons: numbers go native, everything else keeps the helper
    test('less than on typed numbers compares natively', () => {
        const ts =
        "let a = 1;\n" +
        "let b = 2;\n" +
        "if (a < b) {\n" +
        "    const x = 1;\n" +
        "}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('a.as_f64().unwrap_or(f64::NAN) < b.as_f64().unwrap_or(f64::NAN)');
        expect(output).not.toContain('is_less_than(');
    });

    test('less than or equal on typed numbers compares natively', () => {
        const ts =
        "let a = 1;\n" +
        "let b = 2;\n" +
        "if (a <= b) {\n" +
        "    const x = 1;\n" +
        "}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('a.as_f64().unwrap_or(f64::NAN) <= b.as_f64().unwrap_or(f64::NAN)');
        expect(output).not.toContain('is_less_than_or_equal(');
    });

    test('greater than on typed numbers compares natively', () => {
        const ts =
        "let a = 1;\n" +
        "let b = 2;\n" +
        "if (a > b) {\n" +
        "    const x = 1;\n" +
        "}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('a.as_f64().unwrap_or(f64::NAN) > b.as_f64().unwrap_or(f64::NAN)');
        expect(output).not.toContain('is_greater_than(');
    });

    test('greater than or equal on typed numbers compares natively', () => {
        const ts =
        "let a = 1;\n" +
        "let b = 2;\n" +
        "if (a >= b) {\n" +
        "    const x = 1;\n" +
        "}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('a.as_f64().unwrap_or(f64::NAN) >= b.as_f64().unwrap_or(f64::NAN)');
        expect(output).not.toContain('is_greater_than_or_equal(');
    });

    test('number literal operand compares natively', () => {
        const ts =
        "let a = 1;\n" +
        "if (a > 0) {\n" +
        "    const x = 1;\n" +
        "}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('a.as_f64().unwrap_or(f64::NAN) > Value::Int(0).as_f64().unwrap_or(f64::NAN)');
    });

    test('native comparison in a value position is boxed in Value::Bool', () => {
        const ts =
        "let a = 1;\n" +
        "let b = 2;\n" +
        "const r = a >= b;";
        const output = transpiler.transpileRust(ts).content;
        // d8 types the local natively when the checker proves boolean and every
        // use is a condition sink (`r` is unused), so no `Value::Bool` box is
        // emitted; the comparison itself stays the native f64 operator.
        expect(output).toContain('let mut r: bool = a.as_f64().unwrap_or(f64::NAN) >= b.as_f64().unwrap_or(f64::NAN);');
    });

    test('native comparison as a ternary condition stays a bare bool', () => {
        const ts =
        "let a = 1;\n" +
        "let b = 2;\n" +
        "const r = a > b ? 1 : 2;";
        const output = transpiler.transpileRust(ts).content;
        // d7 prints the ternary natively, so the condition must stay a bare
        // bool inside the `if` (never `Value::Bool(<compare>)`).
        expect(output).toContain('(if a.as_f64().unwrap_or(f64::NAN) > b.as_f64().unwrap_or(f64::NAN) { Value::Int(1) } else { Value::Int(2) })');
        expect(output).not.toContain('Value::Bool(a.as_f64()');
    });

    test('native comparison as a logical operand stays a bare bool', () => {
        const ts =
        "let a = 1;\n" +
        "let b = 2;\n" +
        "const c = false;\n" +
        "if (a > b || c) {\n" +
        "    const x = 1;\n" +
        "}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('a.as_f64().unwrap_or(f64::NAN) > b.as_f64().unwrap_or(f64::NAN) || is_true(&c)');
    });

    test('parenthesized native comparison under ! stays a bare bool', () => {
        const ts =
        "let a = 1;\n" +
        "let b = 2;\n" +
        "if (!(a < b)) {\n" +
        "    const x = 1;\n" +
        "}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('a.as_f64().unwrap_or(f64::NAN) < b.as_f64().unwrap_or(f64::NAN)');
        expect(output).not.toContain('Value::Bool(a.as_f64()');
    });

    test('string comparison replicates the helper natively (hx4 R22)', () => {
        const ts =
        "let a = 'x';\n" +
        "let b = 'y';\n" +
        "if (a < b) {\n" +
        "    const x = 1;\n" +
        "}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('(match (a.as_str(), b.as_str()) { (Some(__x), Some(__y)) => (match (__x.parse::<f64>(), __y.parse::<f64>()) { (Ok(__p), Ok(__q)) => __p < __q, _ => __x < __y }), _ => false })');
    });

    test('any-typed comparison keeps the helper', () => {
        const ts =
        "let a: any = 1;\n" +
        "let b: any = 2;\n" +
        "if (a < b) {\n" +
        "    const x = 1;\n" +
        "}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('(match (&(a), &(b)) { (__a, __b) =>'); // hx4 R25 inline helper dispatch
    });

    // One number at runtime already pins `<`/`>` to the helper's f64 compare
    // (its lexical branch needs two strings), so an `any` other side folds too.
    test('less than with a single typed number operand is native', () => {
        const ts =
        "function f(x: any, y: number) {\n" +
        "    if (x < y) {\n" +
        "        const z = 1;\n" +
        "    }\n" +
        "}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('if x.as_f64().unwrap_or(f64::NAN) < y.as_f64().unwrap_or(f64::NAN) {');
        expect(output).not.toContain('is_less_than(');
    });

    test('greater than with a single typed number operand is native', () => {
        const ts =
        "function f(x: any, y: number) {\n" +
        "    if (x > y) {\n" +
        "        const z = 1;\n" +
        "    }\n" +
        "}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('if x.as_f64().unwrap_or(f64::NAN) > y.as_f64().unwrap_or(f64::NAN) {');
        expect(output).not.toContain('is_greater_than(');
    });

    // `>=`/`<=` also OR `is_equal` in, which is TRUE for two Nulls — an `any`
    // operand can be Null, so a nullable number is not enough for them.
    test('greater or equal with a single typed number operand keeps the helper', () => {
        const ts =
        "function f(x: any, y: number) {\n" +
        "    if (x >= y) {\n" +
        "        const z = 1;\n" +
        "    }\n" +
        "}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('(match (&(x), &(y)) { (__a, __b) =>'); // hx4 R25
    });

    test('less or equal with a single typed number operand keeps the helper', () => {
        const ts =
        "function f(x: any, y: number) {\n" +
        "    if (x <= y) {\n" +
        "        const z = 1;\n" +
        "    }\n" +
        "}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('(match (&(x), &(y)) { (__a, __b) =>'); // hx4 R25
    });

    // A numeric literal / `.length` / `indexOf` is Int or Float at runtime,
    // never Null, so it satisfies even the is_equal-folding operators.
    test('greater or equal against a numeric literal is native', () => {
        const ts =
        "function f(x: any) {\n" +
        "    if (x >= 0) {\n" +
        "        const z = 1;\n" +
        "    }\n" +
        "}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('if x.as_f64().unwrap_or(f64::NAN) >= Value::Int(0).as_f64().unwrap_or(f64::NAN) {');
        expect(output).not.toContain('is_greater_than_or_equal(');
    });

    test('less or equal with the literal on the left is native', () => {
        const ts =
        "function f(x: any) {\n" +
        "    if (0 <= x) {\n" +
        "        const z = 1;\n" +
        "    }\n" +
        "}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('if Value::Int(0).as_f64().unwrap_or(f64::NAN) <= x.as_f64().unwrap_or(f64::NAN) {');
        expect(output).not.toContain('is_less_than_or_equal(');
    });

    test('less or equal on two lengths is native', () => {
        const ts =
        "function f(xs: any, ys: any) {\n" +
        "    if (xs.length <= ys.length) {\n" +
        "        const z = 1;\n" +
        "    }\n" +
        "}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('get_array_length(&xs).as_f64().unwrap_or(f64::NAN) <= get_array_length(&ys).as_f64().unwrap_or(f64::NAN)');
        expect(output).not.toContain('is_less_than_or_equal(');
    });

    test('greater or equal on an indexOf result is native', () => {
        const ts =
        "function f(s: any, n: any) {\n" +
        "    if (s.indexOf('a') >= n) {\n" +
        "        const z = 1;\n" +
        "    }\n" +
        "}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('_ => Value::Int(-1) }).as_f64().unwrap_or(f64::NAN) >= n.as_f64().unwrap_or(f64::NAN)');
        expect(output).not.toContain('is_greater_than_or_equal(');
    });

    // `x as T` prints as `x`, so the assertion must not hide the operand's shape.
    test('as-asserted number operand compares natively', () => {
        const ts =
        "function f(x: any, y: number) {\n" +
        "    if ((x as number) > y) {\n" +
        "        const z = 1;\n" +
        "    }\n" +
        "}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('if x.as_f64().unwrap_or(f64::NAN) > y.as_f64().unwrap_or(f64::NAN) {');
        expect(output).not.toContain('is_greater_than(');
    });

    // Two strings are the helper's lexical branch — a numeric-string literal
    // goes through the same path, so it must keep the helper.
    test('string against a numeric-string literal keeps the f64 parse (hx4 R22)', () => {
        const ts =
        "function f(hex: string) {\n" +
        "    if (hex >= '80') {\n" +
        "        const z = 1;\n" +
        "    }\n" +
        "}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('(match (hex.as_str(), Some("80")) { (Some(__x), Some(__y)) => (match (__x.parse::<f64>(), __y.parse::<f64>()) { (Ok(__p), Ok(__q)) => __p > __q, _ => __x > __y }) || __x == __y, (None, None) => true, _ => false })');
    });

    test('object keys', () => {
        const ts = "const k = Object.keys(d);"
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('object_keys(&d)');
    });

    test('reverse call reassigns', () => {
        const ts = "arr.reverse();"
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('arr = reverse(arr.clone())');
    });

    test('replace all', () => {
        const ts = 'const s = base.replaceAll("a", "");'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('replace_all_str(&base,');
    });

    test('delete expression', () => {
        const ts = 'delete dict["key"];'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('remove(&mut dict,');
    });

    // Numeric literals
    test('float numeric literal', () => {
        const ts = 'const x = 3.14;'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('Value::Float(3.14)');
    });

    test('true boolean literal', () => {
        const ts = 'const x = true;'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('let mut x: bool = true;');
    });

    // String escape sequences
    test('string with double quote escape', () => {
        const ts = 'const s = "say \\"hi\\"";'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('\\"hi\\"');
    });

    test('string with backslash escape', () => {
        const ts = 'const s = "a\\\\b";'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('\\\\');
    });

    // Arithmetic binary ops
    test('subtraction wrapping', () => {
        const ts = 'const c = a - b;'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('(match (&(a), &(b)) { (Value::Int(__x), Value::Int(__y)) => Value::Int(__x - __y),'); // hx4 R25
    });

    test('multiplication wrapping', () => {
        const ts = 'const c = a * b;'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('(match (&(a), &(b)) { (Value::Int(__x), Value::Int(__y)) => Value::Int(__x * __y),'); // hx4 R25
    });

    test('division wrapping', () => {
        const ts = 'const c = a / b;'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('(Some(__x), Some(__y)) if __y != 0.0 => Value::Float(__x / __y)'); // hx4 R25
    });

    test('modulo wrapping', () => {
        const ts = 'const c = a % b;'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('mod_val(&a, &b)');
    });

    // Comparison operators
    test('less than wrapping', () => {
        const ts = 'const r = a < b;'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('(match (&(a), &(b)) { (__a, __b) =>'); // hx4 R25 inline helper dispatch
    });

    test('less than or equal wrapping', () => {
        const ts = 'const r = a <= b;'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('__x < __y'); // hx4 R25
        expect(output).toContain('(Value::Null, Value::Null) => true');
    });

    test('greater than wrapping', () => {
        const ts = 'const r = a > b;'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('__x > __y'); // hx4 R25
    });

    test('greater than or equal wrapping', () => {
        const ts = 'const r = a >= b;'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('__x > __y'); // hx4 R25
    });

    // Compound assignment
    test('+= assignment', () => {
        const ts = 'x += 1;'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('x = add(&x, &Value::Int(1))');
    });

    test('-= assignment', () => {
        const ts = 'x -= 1;'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('x = (match (&(x), &(Value::Int(1))) { (Value::Int(__x), Value::Int(__y)) => Value::Int(__x - __y),'); // hx4 R25
    });

    // Postfix unary
    test('i++ converts to add', () => {
        const ts = 'i++;'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('i = add(&i, &Value::Int(1))');
    });

    test('i-- converts to subtract', () => {
        const ts = 'i--;'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('i = subtract(&i, &Value::Int(1))');
    });

    // Prefix unary
    test('negation prefix', () => {
        const ts = 'const x = -n;'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('negate(&n)');
    });

    test('logical not prefix', () => {
        const ts = 'if (!x) { const y = 1; }'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('!is_true(&x)');
    });

    // typeof comparisons
    test('typeof string check', () => {
        const ts = 'const r = typeof x === "string";'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('is_string(&x)');
    });

    test('typeof number check', () => {
        const ts = 'const r = typeof x === "number";'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('is_number(&x)');
    });

    test('typeof boolean check', () => {
        const ts = 'const r = typeof x === "boolean";'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('is_bool(&x)');
    });

    test('typeof negated check', () => {
        const ts = 'const r = typeof x !== "string";'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('!is_string(&x)');
    });

    // in operator
    test('in operator', () => {
        const ts = 'const r = "key" in obj;'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('in_op(&obj,');
    });

    // Element access assignment
    test('element access assignment', () => {
        const ts = 'arr[0] = 5;'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('add_element_to_object(&mut arr, &Value::Int(0), Value::Int(5))');
    });

    test('nested element access', () => {
        const ts = 'const x = a[b][c];'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('get_value(&get_value(&a, &b), &c)');
    });

    // Variable declaration edge cases
    test('variable without initializer', () => {
        const ts = 'let x: number;'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('let mut x: Value = Value::Null');
    });

    test('array destructuring', () => {
        const ts = 'const [a, b] = arr;'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('let mut abVariable');
        expect(output).toContain('let mut a: Value = get_value(&abVariable, &Value::Int(0))');
        expect(output).toContain('let mut b: Value = get_value(&abVariable, &Value::Int(1))');
    });

    // If / else if / else
    test('if/else statement', () => {
        const ts =
        "if (x) {\n" +
        "    const a = 1;\n" +
        "} else {\n" +
        "    const b = 2;\n" +
        "}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('if is_true(&x)');
        expect(output).toContain('else {');
    });

    test('else if chain', () => {
        const ts =
        "if (a) {\n" +
        "    const x = 1;\n" +
        "} else if (b) {\n" +
        "    const y = 2;\n" +
        "}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('if is_true(&a)');
        expect(output).toContain('else if is_true(&b)');
    });

    test('comparison in if does not double-wrap', () => {
        const ts = "if (a === b) { const x = 1; }";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('if is_equal(&a, &b)');
        expect(output).not.toContain('is_true(&is_equal');
    });

    // Ternary
    test('ternary expression', () => {
        const ts = 'const x = a ? b : c;'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('(if is_true(&a) { b.clone() } else { c.clone() })');
        expect(output).not.toContain('ternary(');
    });

    test('ternary bool arm is boxed as Value', () => {
        const ts = 'const x = c ? (a || b) : false;'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('(if is_true(&c) { Value::Bool((is_true(&a) || is_true(&b))) } else { Value::Bool(false) })');
    });

    test('ternary with value arms', () => {
        const ts = "const x = flag ? 'a' : 'b';"
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('(if is_true(&flag) { Value::Str("a".into()) } else { Value::Str("b".into()) })');
    });

    // Checker-proven helper removal: array/string .length → native Value::len()
    test('array length native for typed array', () => {
        const ts = 'const arr = [1, 2, 3];\nconst n = arr.length;'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('Value::Int(arr.len() as i64)');
        expect(output).not.toContain('get_array_length(&arr)');
    });

    test('string length native for typed string', () => {
        const ts = 'const s = "test";\nconst n = s.length;'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('Value::Int(s.len() as i64)');
        expect(output).not.toContain('get_array_length(&s)');
    });

    test('object length keeps the helper', () => {
        const ts = 'const o: { [key: string]: any } = {};\nconst n = o.length;'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('get_array_length(&o)');
    });

    // Checker-proven helper removal: key in dict → native contains_key
    test('in operator native for typed object', () => {
        const ts = 'const o: { [key: string]: any } = {};\nconst r = "key" in o;'
        const output = transpiler.transpileRust(ts).content;
        // d8 declares the proven-bool local natively, so the `matches!` result
        // is not wrapped in `Value::Bool(...)`.
        expect(output).toContain('let mut r: bool = matches!(&o, Value::Dict(__d) if __d.contains_key("key"));');
        expect(output).not.toContain('in_op(');
    });

    test('in operator keeps the helper for typed array', () => {
        const ts = 'const a: any[] = [];\nconst r = "key" in a;'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('in_op(&a,');
    });

    // A `Dict` alias / generic dictionary is a Reference to its index-signature
    // interface — still a plain Value::Dict at runtime, so the key test is native.
    test('in operator native for a dictionary alias receiver', () => {
        const ts = 'interface Dictionary<T> { [key: string]: T }\ntype Dict = Dictionary<any>;\nconst o: Dict = {};\nconst r = "key" in o;'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('matches!(&o, Value::Dict(__d) if __d.contains_key("key"))');
        expect(output).not.toContain('in_op(');
    });

    test('in operator native for a generic dictionary receiver', () => {
        const ts = 'interface Dictionary<T> { [key: string]: T }\nconst o: Dictionary<any> = {};\nconst r = "key" in o;'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('matches!(&o, Value::Dict(__d) if __d.contains_key("key"))');
        expect(output).not.toContain('in_op(');
    });

    test('in operator native for a dictionary parameter', () => {
        const ts = 'interface Dictionary<T> { [key: string]: T }\nfunction f (params: Dictionary<any>) {\n    return "key" in params;\n}'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('matches!(&params, Value::Dict(__d) if __d.contains_key("key"))');
        expect(output).not.toContain('in_op(');
    });

    // A class instance is not a Dict at runtime: the helper stays.
    test('in operator keeps the helper for a class instance receiver', () => {
        const ts = 'class OrderBook { bids = 1; }\nconst b = new OrderBook();\nconst r = "key" in b;'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('in_op(&b,');
    });

    // Lib-declared types (Map, …) are not backed by a plain Value map.
    test('in operator keeps the helper for a lib-declared receiver', () => {
        const ts = 'const m = new Map<string, any>();\nconst r = "key" in m;'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('in_op(&m,');
    });

    // `any` proves nothing: an array element search stays the helper's job.
    test('in operator keeps the helper for an any-typed receiver', () => {
        const ts = 'function f (params: any) {\n    return "key" in params;\n}'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('in_op(&params,');
    });

    // Checker-proven helper removal: negate of a numeric literal folds
    test('negate literal folds to a literal', () => {
        const intOutput = transpiler.transpileRust('const x = -1;').content;
        expect(intOutput).toContain('Value::Int(-1)');
        expect(intOutput).not.toContain('negate(');
        const floatOutput = transpiler.transpileRust('const x = -0.5;').content;
        expect(floatOutput).toContain('Value::Float(-0.5)');
        expect(floatOutput).not.toContain('negate(');
    });

    // instanceof
    test('instanceof expression', () => {
        const ts = 'const r = x instanceof MyClass;'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('is_instance(&x, &MyClass)');
    });

    // Throw statement
    test('throw statement', () => {
        const ts = 'throw new Error("oops");'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('panic!(');
    });

    // Return / break / continue
    test('return statement with value', () => {
        const ts = "function f() { return 42; }";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('return Value::Int(42);');
    });

    test('break statement', () => {
        const ts = "while (true) { break; }";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('break;');
    });

    test('continue statement', () => {
        const ts = "while (true) { continue; }";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('continue;');
    });

    // Empty object literal
    test('empty object literal', () => {
        const ts = 'const d = {};'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('Value::Map(');
        expect(output).toContain('HashMap::new()');
    });

    // console.log with multiple args
    test('console.log with multiple args', () => {
        const ts = 'console.log(a, b);'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('println_val(&a, &b)');
    });

    // Built-in method calls
    test('Array.isArray call', () => {
        const ts = 'const r = Array.isArray(x);'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('is_array(&x)'); // an undeclared x keeps the helper
    });

    test('Object.values call', () => {
        const ts = 'const v = Object.values(d);'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('object_values(&d)');
    });

    test('JSON.parse call', () => {
        const ts = 'const x = JSON.parse(s);'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('json_parse(&s)');
    });

    test('JSON.stringify call', () => {
        const ts = 'const x = JSON.stringify(s);'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('json_stringify(&s)');
    });

    test('Math.floor call', () => {
        const ts = 'const x = Math.floor(n);'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('math_floor(&n)');
    });

    test('Math.ceil call', () => {
        const ts = 'const x = Math.ceil(n);'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('math_ceil(&n)');
    });

    test('Math.round call', () => {
        const ts = 'const x = Math.round(n);'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('math_round(&n)');
    });

    test('Number.isInteger call', () => {
        const ts = 'const r = Number.isInteger(n);'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('is_integer(&n)');
    });

    test('array push call', () => {
        const ts = 'arr.push(x);'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('append_to_array(&mut arr, x)');
    });

    test('array includes call', () => {
        const ts = 'const r = arr.includes(x);'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('contains(&arr, &x)');
    });

    test('indexOf call', () => {
        const ts = 'const i = arr.indexOf(x);'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('(match (&(arr), &(x))');
    });

    test('startsWith call', () => {
        const ts = 'const r = s.startsWith("a");'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('starts_with(&s,');
    });

    test('endsWith call', () => {
        const ts = 'const r = s.endsWith("a");'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('ends_with(&s,');
    });

    test('trim call', () => {
        const ts = 'const r = s.trim();'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('trim(&s)');
    });

    test('join call', () => {
        const ts = 'const r = arr.join(",");'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('join(&arr,');
    });

    test('split call', () => {
        const ts = 'const r = s.split(",");'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('split(&s,');
    });

    test('toFixed call', () => {
        const ts = 'const r = n.toFixed(2);'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('to_fixed(&n,');
    });

    test('toString call', () => {
        const ts = 'const r = n.toString();'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('to_string_val(&n)');
    });

    test('toUpperCase call', () => {
        const ts = 'const r = s.toUpperCase();'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('(match &(s) { Value::Str(__s) => Value::Str(__s.to_uppercase().into())');
    });

    test('toLowerCase call', () => {
        const ts = 'const r = s.toLowerCase();'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('(match &(s) { Value::Str(__s) => Value::Str(__s.to_lowercase().into())');
    });

    test('shift call', () => {
        const ts = 'const x = arr.shift();'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('shift(arr.clone())');
    });

    test('pop call', () => {
        const ts = 'const x = arr.pop();'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('pop(arr.clone())');
    });

    test('slice call', () => {
        const ts = 'const r = arr.slice(1, 3);'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('(match (&(arr), ');
    });

    test('replace call', () => {
        const ts = 'const r = s.replace("a", "b");'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('replace_str(&s,');
    });

    // Class with property initializers
    test('class with property initializers generates struct fields', () => {
        const ts =
        "class Foo {\n" +
        "    count = 0;\n" +
        "    name = \"bar\";\n" +
        "    run() { return this.count; }\n" +
        "}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('pub count: Value,');
        expect(output).toContain('pub name: Value,');
        expect(output).toContain('count: Value::Int(0),');
        expect(output).toContain('name: Value::Str("bar".into()),');
    });

    // Class with optional method parameters
    test('class method with optional parameters uses optional_args slice', () => {
        const ts =
        "class MyClass {\n" +
        "    greet(name, greeting = \"hello\") {\n" +
        "        return greeting;\n" +
        "    }\n" +
        "}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('optional_args: &[Value]');
        expect(output).toContain('get_arg(optional_args, 0,');
    });

    // this keyword
    test('this keyword becomes self', () => {
        const ts = "class A { run() { return this; } }";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('return self;');
    });

    // Reserved keyword renaming
    test('reserved keyword type is renamed', () => {
        const ts = 'const type = 1;'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('type_var');
    });


    // ── native-typed locals ──────────────────────────────────────────────────
    // A local whose initializer is already a bool in Rust is declared `bool`
    // when every use is a condition sink (`is_true` is generic over IsTruthy).

    test('bool local: comparison initializer', () => {
        const ts = 'const ok = a === 1; if (ok) { x(); }';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('let mut ok: bool = is_equal(&a, &Value::Int(1));');
    });

    test('bool local: redundant source parens are dropped', () => {
        const ts = 'const ok = (a === 1); if (ok) { x(); }';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('let mut ok: bool = is_equal(&a, &Value::Int(1));');
    });

    test('bool local: Value::Bool box is peeled at the init site', () => {
        const ts = 'const ok = Array.isArray(v); if (ok) { x(); }';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('let mut ok: bool = is_array(&v);');
    });

    test('bool local: in operator initializer', () => {
        const ts = 'const ok = k in obj; if (ok) { x(); }';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('let mut ok: bool = in_op(&obj, &k);');
    });

    test('bool local: boolean literal initializer', () => {
        const ts = 'const ok = true; if (ok) { x(); }';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('let mut ok: bool = true;');
    });

    test('bool local: parenthesized condition operand still allows bool', () => {
        const ts = 'const ok = a === 1; if ((ok)) { x(); }';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('let mut ok: bool = is_equal(&a, &Value::Int(1));');
        expect(output).toContain('is_true(&(ok))');
    });

    test('bool local: && operands of a typed condition', () => {
        const ts =
            'class T {\n' +
            '    m(a: boolean, b: boolean) {\n' +
            '        const ok = a && b;\n' +
            '        if (ok) { return 1; }\n' +
            '    }\n' +
            '}';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('let mut ok: bool = is_true(&a) && is_true(&b);');
    });

    test('bool local: string helper results stay bool', () => {
        const ts =
            'class T {\n' +
            '    m(s: string) {\n' +
            '        const ok = s.startsWith("x");\n' +
            '        if (ok) { return 1; }\n' +
            '    }\n' +
            '}';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('let mut ok: bool = s.as_str().is_some_and(|__s| __s.starts_with("x"));');
    });

    // Rejected shapes: any sink that takes `&Value` keeps the local boxed.

    test('bool local: value sink keeps Value', () => {
        const ts = 'const ok = a === 1; m.insert("k", ok);';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('let mut ok: Value = is_equal(&a, &Value::Int(1));');
    });

    test('bool local: comparison sink keeps Value', () => {
        const ts = 'const ok = a === 1; if (ok === true) { x(); }';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('let mut ok: Value = is_equal(&a, &Value::Int(1));');
    });

    test('bool local: return sink keeps Value', () => {
        const ts = 'const ok = a === 1; return ok;';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('let mut ok: Value = is_equal(&a, &Value::Int(1));');
    });

    test('bool local: reassignment keeps Value', () => {
        const ts = 'let ok = a === 1; ok = b === 2; if (ok) { x(); }';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('let mut ok: Value = is_equal(&a, &Value::Int(1));');
    });

    test('bool local: a second binding of the name keeps Value', () => {
        const ts = 'const ok = a === 1; items.filter((ok) => x(ok));';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('let mut ok: Value = is_equal(&a, &Value::Int(1));');
    });

    test('bool local: non-bool initializer keeps Value', () => {
        const ts = 'const ok = v; if (ok) { x(); }';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('let mut ok: Value = v;');
    });

    test('reserved keyword match is renamed', () => {
        const ts = 'const match = 1;'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('match_val');
    });

    // ── typed string locals ──────────────────────────────────────────────────
    // A local holding a `safeString*` result is declared `Option<String>` when
    // the checker proves the string and every use is a native sink (null test,
    // string-literal compare); the helper call stays as its producer.

    describe('typed string locals', () => {
        const withHelper = (helper: string, body: string) =>
            `class A {\n    ${helper}(o: any, k: any): string { return undefined as any; }\n    run(o: any) {\n${body}\n    }\n}`;

        test('string-literal compare retypes the local and compares as_deref', () => {
            const ts = withHelper('safeString',
                "        const side = this.safeString(o, 'side');\n        if (side === 'buy') { return 1; }\n        return 2;");
            const output = transpiler.transpileRust(ts).content;
            expect(output).toContain('let mut side: Option<String> = self.safeString(o, Value::Str("side".into())).as_str().map(str::to_owned);');
            expect(output).toContain('if (side.as_deref() == Some("buy")) {');
            expect(output).not.toContain('side: Value');
        });

        test('null test retypes the local and prints is_none', () => {
            const ts = withHelper('safeString',
                "        const s = this.safeString(o, 's');\n        if (s === null) { return 1; }\n        return 2;");
            const output = transpiler.transpileRust(ts).content;
            expect(output).toContain('let mut s: Option<String> = self.safeString(o, Value::Str("s".into())).as_str().map(str::to_owned);');
            expect(output).toContain('if (s.is_none()) {');
            expect(output).not.toContain('s == Value::Null');
        });

        test('undefined test retypes the local and prints is_some', () => {
            const ts = withHelper('safeString',
                "        const s = this.safeString(o, 's');\n        if (s !== undefined) { return 1; }\n        return 2;");
            const output = transpiler.transpileRust(ts).content;
            expect(output).toContain('let mut s: Option<String> = self.safeString(o, Value::Str("s".into())).as_str().map(str::to_owned);');
            expect(output).toContain('if (s.is_some()) {');
            expect(output).not.toContain('s != Value::Null');
        });

        test('mixed native sinks stay typed together', () => {
            const ts = withHelper('safeString',
                "        const s = this.safeString(o, 's');\n        if (s === undefined) { return 0; }\n        return s === 'x';");
            const output = transpiler.transpileRust(ts).content;
            expect(output).toContain('let mut s: Option<String> = self.safeString(o, Value::Str("s".into())).as_str().map(str::to_owned);');
            expect(output).toContain('if (s.is_none()) {');
            expect(output).toContain('s.as_deref() == Some("x")');
        });

        test('safeStringLower / safeString2 results are typed too', () => {
            const lower = transpiler.transpileRust(withHelper('safeStringLower',
                "        const side = this.safeStringLower(o, 'side');\n        return side === 'buy';")).content;
            expect(lower).toContain('let mut side: Option<String> = self.safeStringLower(o, Value::Str("side".into())).as_str().map(str::to_owned);');
            expect(lower).toContain('side.as_deref() == Some("buy")');
            const two = transpiler.transpileRust(withHelper('safeString2',
                "        const id = this.safeString2(o, 'a', 'b');\n        return id !== undefined;")).content;
            expect(two).toContain('let mut id: Option<String> = self.safeString2(o, Value::Str("a".into()), Value::Str("b".into())).as_str().map(str::to_owned);');
            expect(two).toContain('id.is_some()');
        });

        test('a property name equal to the local does not block the retype', () => {
            const ts = withHelper('safeString',
                "        const status = this.safeString(o, 'status');\n        return status === 'ok' && o.status === 1;");
            const output = transpiler.transpileRust(ts).content;
            expect(output).toContain('let mut status: Option<String> = self.safeString(o, Value::Str("status".into())).as_str().map(str::to_owned);');
            expect(output).toContain('status.as_deref() == Some("ok")');
        });

        // Rejected shapes: any `&Value` sink keeps the local boxed.

        test('a Value sink keeps Value', () => {
            const ts = withHelper('safeString',
                "        const s = this.safeString(o, 's');\n        m.insert('k', s);");
            const output = transpiler.transpileRust(ts).content;
            expect(output).toContain('let mut s: Value = self.safeString(o, Value::Str("s".into()));');
            expect(output).not.toContain('Option<String>');
        });

        test('truthiness keeps Value (is_true has no Option impl)', () => {
            const ts = withHelper('safeString',
                "        const s = this.safeString(o, 's');\n        if (s) { return 1; }\n        return 2;");
            const output = transpiler.transpileRust(ts).content;
            expect(output).toContain('let mut s: Value = self.safeString(o, Value::Str("s".into()));');
            expect(output).toContain('if is_true(&s) {');
        });

        test('reassignment keeps Value', () => {
            const ts = withHelper('safeString',
                "        let s = this.safeString(o, 's');\n        s = this.safeString(o, 't');\n        return s === 'x';");
            const output = transpiler.transpileRust(ts).content;
            expect(output).toContain('let mut s: Value = self.safeString(o, Value::Str("s".into()));');
            expect(output).not.toContain('Option<String>');
        });

        test('a second binding of the name keeps Value', () => {
            const ts = withHelper('safeString',
                "        const s = this.safeString(o, 's');\n        const f = (s) => s === 'x';\n        return f(s);");
            const output = transpiler.transpileRust(ts).content;
            expect(output).toContain('let mut s: Value = self.safeString(o, Value::Str("s".into()));');
            expect(output).not.toContain('Option<String>');
        });

        test('no native use keeps Value', () => {
            const ts = withHelper('safeString',
                "        const s = this.safeString(o, 's');\n        return 1;");
            const output = transpiler.transpileRust(ts).content;
            expect(output).toContain('let mut s: Value = self.safeString(o, Value::Str("s".into()));');
        });

        test('string concat and other payload compares keep Value', () => {
            const concat = transpiler.transpileRust(withHelper('safeString',
                "        const s = this.safeString(o, 's');\n        return s + 'x';")).content;
            expect(concat).toContain('let mut s: Value = self.safeString(o, Value::Str("s".into()));');
            const againstLocal = transpiler.transpileRust(withHelper('safeString',
                "        const s = this.safeString(o, 's');\n        return s === o.other;")).content;
            expect(againstLocal).toContain('let mut s: Value = self.safeString(o, Value::Str("s".into()));');
        });

        test('a non-string helper result keeps Value', () => {
            const ts = withHelper('safeString',
                "        const s = this.safeString(o, 's');\n        return s === 'x';")
                .replace('safeString(o: any, k: any): string', 'safeString(o: any, k: any): any');
            const output = transpiler.transpileRust(ts).content;
            expect(output).toContain('let mut s: Value = self.safeString(o, Value::Str("s".into()));');
        });
    });

    // Native equality on unwrapped payloads (is_equal removal) — typed operands
    describe('native equality', () => {
        const typed = (body: string) => `class A {\n    run(a: string, b: string, n: number, m: number, flag: boolean, other: boolean, anything: any) {\n${body}\n    }\n}`;

        test('null literal compares natively for any operand type', () => {
            const output = transpiler.transpileRust(typed('        if (a === undefined) {\n            return b;\n        }\n        return a;')).content;
            expect(output).toContain('if (a == Value::Null) {');
            expect(output).not.toContain('is_equal(&a, &Value::Null)');
        });

        test('string literal compares the unwrapped &str', () => {
            const output = transpiler.transpileRust(typed("        return a === 'swap';")).content;
            expect(output).toContain('return Value::Bool(a.as_str() == Some("swap"));');
            expect(output).not.toContain('is_equal(');
        });

        test('number literal compares the unwrapped f64', () => {
            const output = transpiler.transpileRust(typed('        return n === 1;')).content;
            expect(output).toContain('return Value::Bool(n.as_f64() == Some(1.0));');
        });

        test('boolean literal compares the unwrapped bool', () => {
            const output = transpiler.transpileRust(typed('        return flag === true;')).content;
            expect(output).toContain('return Value::Bool(flag.as_bool() == Some(true));');
        });

        test('two string operands compare their payloads', () => {
            const output = transpiler.transpileRust(typed('        return a !== b;')).content;
            expect(output).toContain('return Value::Bool(a.as_str() != b.as_str());');
        });

        test('two number operands compare their payloads', () => {
            const output = transpiler.transpileRust(typed('        return n === m;')).content;
            expect(output).toContain('return Value::Bool(n.as_f64() == m.as_f64());');
        });

        test('two boolean operands compare their payloads', () => {
            const output = transpiler.transpileRust(typed('        return flag == other;')).content;
            expect(output).toContain('return Value::Bool(flag.as_bool() == other.as_bool());');
        });

        test('boolean string literal stays on the helper without a string proof', () => {
            const output = transpiler.transpileRust(typed("        return anything === '1';")).content;
            expect(output).toContain('is_equal(&anything, &Value::Str("1".into()))');
        });

        test('a bool-valued comparison operand stays on the helper', () => {
            const output = transpiler.transpileRust(typed("        return (a === b) === flag;")).content;
            expect(output).toContain('is_equal(&(Value::Bool(a.as_str() == b.as_str())), &flag)');
        });

        test('a class instance operand stays on the helper', () => {
            const ts =
                'class B {}\n' +
                'class A {\n' +
                '    run(u: any) {\n' +
                '        const created = new B();\n' +
                '        return created === undefined;\n' +
                '    }\n' +
                '}';
            const output = transpiler.transpileRust(ts).content;
            expect(output).toContain('is_equal(&created, &Value::Null)');
        });

        test('a logical expression with native compares is boxed for Value positions', () => {
            const output = transpiler.transpileRust(typed("        return a === 'x' || n === 1;")).content;
            expect(output).toContain('return Value::Bool((a.as_str() == Some("x")) || (n.as_f64() == Some(1.0)));');
        });

        test('a logical expression keeps bare compares in a condition', () => {
            const output = transpiler.transpileRust(typed("        if (a === 'x' || n === 1) {\n            return b;\n        }\n        return a;")).content;
            expect(output).toContain('if (a.as_str() == Some("x")) || (n.as_f64() == Some(1.0)) {');
            expect(output).not.toContain('Value::Bool((a.as_str()');
        });
    });
});

describe('rust checker-typed native container access', () => {
    const MAP_NATIVE = 'market.as_map().and_then(|__m| __m.get("id")).cloned().unwrap_or(Value::Null)';

    test('string-literal element access on a typed map emits a native read', () => {
        const ts =
            "interface Market { id: string; }\n" +
            "function f(market: Market) {\n" +
            "    return market['id'];\n" +
            "}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain(MAP_NATIVE);
        expect(output).not.toContain('get_value(&market');
    });

    test('nested string-literal element accesses chain native reads', () => {
        const ts =
            "interface Info { symbol: string; }\n" +
            "interface Market { info: Info; }\n" +
            "function f(market: Market) {\n" +
            "    return market['info']['symbol'];\n" +
            "}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain(
            'market.as_map().and_then(|__m| __m.get("info")).cloned().unwrap_or(Value::Null)' +
            '.as_map().and_then(|__m| __m.get("symbol")).cloned().unwrap_or(Value::Null)');
        expect(output).not.toContain('get_value(&market');
    });

    test('numeric-literal element access on a typed array emits a native read', () => {
        const ts =
            "function f(rows: number[][]) {\n" +
            "    return rows[0];\n" +
            "}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('rows.as_array().and_then(|__arr| __arr.get(0)).cloned().unwrap_or(Value::Null)');
        expect(output).not.toContain('get_value(&rows');
    });

    test('property access on a typed map local emits a native read', () => {
        const ts =
            "interface Cfg { defaultType: string; }\n" +
            "function f(cfg: Cfg) {\n" +
            "    return cfg.defaultType;\n" +
            "}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('cfg.as_map().and_then(|__m| __m.get("defaultType")).cloned().unwrap_or(Value::Null)');
    });

    test('array binding pattern over a tuple return emits native reads', () => {
        const ts =
            "function g(): [string, number] { return ['a', 1]; }\n" +
            "function h() {\n" +
            "    const [p, q] = g();\n" +
            "    return p;\n" +
            "}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('let mut pqVariable = g();');
        expect(output).toContain('let mut p: Value = pqVariable.as_array().and_then(|__arr| __arr.get(0)).cloned().unwrap_or(Value::Null)');
        expect(output).toContain('let mut q: Value = pqVariable.as_array().and_then(|__arr| __arr.get(1)).cloned().unwrap_or(Value::Null)');
        expect(output).not.toContain('Value::Int(0)');
    });

    test('array destructuring reassignment over a tuple emits native reads', () => {
        const ts =
            "function g(): [string, number] { return ['a', 1]; }\n" +
            "function h() {\n" +
            "    let p: any = undefined;\n" +
            "    let q: any = undefined;\n" +
            "    [p, q] = g();\n" +
            "    return p;\n" +
            "}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('{ let __destr_tmp = g(); p = __destr_tmp.as_array()');
        expect(output).not.toContain('get_value(&__destr_tmp');
    });

    // keep the helper unless the checker proves a plain map/list receiver

    test('any-typed receiver keeps the get_value helper', () => {
        const ts =
            "function f(o: any) {\n" +
            "    return o['k'];\n" +
            "}";
        const output = transpiler.transpileRust(ts).content;
        // A literal key on an unproven receiver keeps the helper — d6's
        // `&str`-key form, which is the same lookup without the `Value::Str`.
        expect(output).toContain('crate::value::get_value_k(&o, "k")');
    });

    test('class-typed receiver keeps the get_value helper', () => {
        const ts =
            "class Book { url: string = 'x'; }\n" +
            "function f(book: Book) {\n" +
            "    return book['url'];\n" +
            "}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('get_value(&book, &Value::Str("url".into()))');
    });

    test('lib-declared receiver keeps the get_value helper', () => {
        const ts =
            "function f(d: Date) {\n" +
            "    return d['x'];\n" +
            "}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('crate::value::get_value_k(&d, "x")');
    });

    test('string receiver keeps the get_value helper', () => {
        const ts =
            "function f(s: string) {\n" +
            "    return s[0];\n" +
            "}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('get_value(&s, &Value::Int(0))');
    });

    test('non-literal key keeps the get_value helper', () => {
        const ts =
            "function f(rows: string[], i: number) {\n" +
            "    return rows[i];\n" +
            "}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('get_value(&rows, &i)');
    });

    test('method call target of an element access keeps the helper', () => {
        const ts =
            "type Dict = { [key: string]: any };\n" +
            "function f(d: Dict, v: any) {\n" +
            "    d['a'].push(v);\n" +
            "}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('append_to_array(&mut get_value(&d, &Value::Str("a".into())), v)');
    });

    test('same-place write then read keeps the helper', () => {
        const ts =
            "type Dict = { [key: string]: any };\n" +
            "function f(result: Dict, v: any) {\n" +
            "    result['k'] = result['k'] + v;\n" +
            "}";
        const output = transpiler.transpileRust(ts).content;
        // The read keeps the `&str`-key helper form; the ccxt borrow-split pass
        // hoists it on `&result` (not on the helper text), so the E0502 shape
        // is fixed downstream either way.
        expect(output).toContain('add(&crate::value::get_value_k(&result, "k"), &v)');
    });

    test('read in a &mut self method argument keeps the helper', () => {
        const ts =
            "type Dict = { [key: string]: any };\n" +
            "class A {\n" +
            "    options: Dict = {};\n" +
            "    watch(a: any, b: any) { return b; }\n" +
            "    run() {\n" +
            "        return this.watch('x', this.options['id']);\n" +
            "    }\n" +
            "}";
        const output = transpiler.transpileRust(ts).content;
        // d6's ccxt companion hunk extends the `&mut self` argument hoist to the
        // `get_value_k` text, so the read inside the `&mut self` call is hoisted
        // exactly like the allocating form was.
        expect(output).toContain('crate::value::get_value_k(&self.options, "id")');
    });

    // native arithmetic: two checker-typed strings → format! concat
    test('string + string emits native concat', () => {
        const ts =
        'const a: string = "x";\n' +
        'const b: string = "y";\n' +
        'const c = a + b;';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('let mut c: Value = Value::Str(format!("{}{}", a, b).into());');
        expect(output).not.toContain('add(');
    });

    // native arithmetic: two checker-typed numbers → Int/Float match
    test('number + number emits native arithmetic', () => {
        const ts =
        'const a: number = 1;\n' +
        'const b: number = 2;\n' +
        'const c = a + b;';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('(match (&(a), &(b)) {');
        expect(output).toContain('(Value::Int(x), Value::Int(y)) => Value::Int(x + y)');
        expect(output).toContain('(Value::Float(x), Value::Float(y)) => Value::Float(x + y)');
        expect(output).not.toContain('add(');
    });

    test('number - number, number * number and number / number emit native arithmetic', () => {
        const ts =
        'const a: number = 1;\n' +
        'const b: number = 2;\n' +
        'const c = a - b;\n' +
        'const d = a * b;\n' +
        'const e = a / b;';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('Value::Int(x - y)');
        expect(output).toContain('Value::Int(x * y)');
        expect(output).toContain('(match ((a).as_f64(), (b).as_f64()) { (Some(x), Some(y)) if y != 0.0 => Value::Float(x / y), _ => Value::Null })');
        expect(output).not.toContain('subtract(');
        expect(output).not.toContain('multiply(');
        expect(output).not.toContain('divide(');
    });

    // unproven operands keep the runtime helper
    test('untyped operands keep the add helper', () => {
        const ts = "const a: any = 1;\nconst b: any = 2;\nconst c = a + b;";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('add(&a, &b)');
    });

    // hx4 R09: a non-null string side puts `add` on its string branch (stringify_simple == Display).
    test('number + string emits native concat', () => {
        const ts =
        'const a: number = 1;\n' +
        'const s: string = "q";\n' +
        'const c = a + s;';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('let mut c: Value = Value::Str(format!("{}{}", a, s).into());');
        expect(output).not.toContain('add(&a, &s)');
    });

    // phase-2 rust-19: a `Str` (`string | undefined`) operand holds only a
    // string or the `Value::Null` the helper stringifies as "null" — the same
    // text `Display` produces — so it concatenates natively against an operand
    // the checker proves is ALWAYS a string.
    test('string | undefined operand + proven string emits native concat', () => {
        const ts =
        'type Str = string | undefined;\n' +
        'function g(): Str { return "x"; }\n' +
        'const a = g();\n' +
        'const b: string = "y";\n' +
        'const c = a + b;';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('let mut c: Value = Value::Str(format!("{}{}", a, b).into());');
        expect(output).not.toContain('add(');
    });

    test('optional string parameter + proven string emits native concat', () => {
        const ts =
        'function f(x?: string) {\n' +
        '    const s: string = "y";\n' +
        '    return x + s;\n' +
        '}';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('return Value::Str(format!("{}{}", x, s).into());');
        expect(output).not.toContain('add(');
    });

    test('string | undefined operand + string literal emits native concat', () => {
        const ts =
        'type Str = string | undefined;\n' +
        'function g(): Str { return "x"; }\n' +
        'const a = g();\n' +
        'const c = a + "y";';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('Value::Str(format!("{}{}", a, Value::Str("y".into())).into())');
        expect(output).not.toContain('add(');
    });

    test('string | undefined += string literal emits native concat', () => {
        const ts =
        'type Str = string | undefined;\n' +
        'function g(): Str { return "x"; }\n' +
        'let s = g();\n' +
        's += "b";';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('s = Value::Str(format!("{}{}", s, Value::Str("b".into())).into());');
        expect(output).not.toContain('add(');
    });

    test('string | undefined on both sides keeps the add helper', () => {
        // No side is always a string: the helper's Null+Null case returns
        // Value::Null, where format! would build "nullnull".
        const ts =
        'type Str = string | undefined;\n' +
        'function g(): Str { return "x"; }\n' +
        'const a = g();\n' +
        'const b = g();\n' +
        'const c = a + b;';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('add(&a, &b)');
    });

    test('string | undefined + number keeps the add helper', () => {
        // Null + number is Value::Null through the helper, "null5" through format!.
        const ts =
        'type Str = string | undefined;\n' +
        'function g(): Str { return "x"; }\n' +
        'function n(): number { return 5; }\n' +
        'const a = g();\n' +
        'const b = n();\n' +
        'const c = a + b;';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('add(&a, &b)');
    });

    test('always-Str local + any concatenates natively (hx4 R22)', () => {
        const ts =
        'function h(): any { return 2; }\n' +
        'const a: string = "x";\n' +
        'const b = h();\n' +
        'const c = a + b;';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('Value::Str(format!("{}{}", a, b).into())');
    });

    test('x++ / x-- on a number emit native increment', () => {
        const ts = 'let i: number = 0;\ni++;\ni--;';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('i = (match (&(i), &(Value::Int(1))) {');
        expect(output).toContain('Value::Int(x + y)');
        expect(output).toContain('Value::Int(x - y)');
        expect(output).not.toContain('add(&i');
        expect(output).not.toContain('subtract(&i');
    });

    test('number += number and number -= number emit native arithmetic', () => {
        const ts = 'let j: number = 5;\nj += 2;\nlet k: number = 5;\nk -= 2;';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('j = (match (&(j), &(Value::Int(2))) {');
        expect(output).toContain('k = (match (&(k), &(Value::Int(2))) {');
        expect(output).not.toContain('add(&j');
        expect(output).not.toContain('subtract(&k');
    });

    test('string += string emits native concat', () => {
        const ts = 'let s: string = "a";\ns += "b";';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('s = Value::Str(format!("{}{}", s, Value::Str("b".into())).into());');
        expect(output).not.toContain('add(');
    });

    test('string property + string literal emits native concat', () => {
        const ts =
        'class A {\n' +
        '    id: string = "a";\n' +
        '    run(): string { return this.id + "x"; }\n' +
        '}';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('Value::Str(format!("{}{}", self.id, Value::Str("x".into())).into())');
    });

    // Dictionary reads with a string-literal key skip the `Value::Str`
    // allocation through `get_value_k`, the `&str` lookup in value.rs.
    test('literal element access key uses get_value_k', () => {
        const ts = "const id = market['id'];"
        const rust = 'let mut id: Value = crate::value::get_value_k(&market, "id");'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toBe(rust);
    });

    test('computed element access key keeps get_value', () => {
        const ts = 'const id = market[key];'
        const rust = 'let mut id: Value = get_value(&market, &key);'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toBe(rust);
    });

    test('live client keys keep get_value', () => {
        const ts = "const subs = client['subscriptions'];"
        const rust = 'let mut subs: Value = get_value(&client, &Value::Str("subscriptions".into()));'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toBe(rust);
    });

    test('numeric-string keys keep get_value', () => {
        const ts = "const v = cache['0'];"
        const rust = 'let mut v: Value = get_value(&cache, &Value::Str("0".into()));'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toBe(rust);
    });

    test('nested literal element access chains get_value_k', () => {
        const ts = "const a = obj['x']['y'];"
        const rust = 'let mut a: Value = crate::value::get_value_k(&crate::value::get_value_k(&obj, "x"), "y");'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toBe(rust);
    });
});

describe('rust error constructor message arguments', () => {
    test('a literal message prints as a bare str', () => {
        const ts = "function f() {\n    throw new NotSupported('demo trading is not supported');\n}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('crate::exchange_errors::not_supported("demo trading is not supported")');
        expect(output).not.toContain('Value::Str("demo trading is not supported"');
    });

    test('escapes in a literal message are preserved', () => {
        const ts = "function f() {\n    throw new NotSupported('it\\'s \"quoted\"');\n}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('crate::exchange_errors::not_supported("it\'s \\"quoted\\"")');
    });

    test('a string concat message drops its Value::Str box', () => {
        const ts = "function f(id: string) {\n    throw new NotSupported(id + ' handleDelta not supported yet');\n}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('crate::exchange_errors::not_supported(format!("{}{}", id, Value::Str(" handleDelta not supported yet".into())))');
        expect(output).not.toContain('not_supported(Value::Str(');
    });

    test('a parenthesised concat message drops its Value::Str box', () => {
        const ts = "function f(id: string) {\n    throw new NotSupported((id + ' msg'));\n}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('crate::exchange_errors::not_supported(format!("{}{}", id, Value::Str(" msg".into())))');
    });

    test('a concat message of a post-pass error class also drops its box', () => {
        const ts = "function f(id: string) {\n    throw new BadRequest (id + ' msg');\n}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('BadRequest::new(format!("{}{}", id, Value::Str(" msg".into())))');
        expect(output).not.toContain('BadRequest::new(Value::Str(');
    });

    test('an unproven message keeps its box', () => {
        const ts = "function f(msg: any) {\n    throw new NotSupported(msg);\n}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('crate::exchange_errors::not_supported(msg)');
    });

    test('a non-error class constructor is untouched', () => {
        const ts = "function f(id: string) {\n    const p = new Precise (id + ' msg');\n    return p;\n}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('Precise::new(Value::Str(format!(');
    });
});

// B-31 — the runtime `Value::Str` payload is a `Cow<'static, str>`: a string
// literal borrows its `&'static str` (`Value::Str("lit".into())`, zero
// allocation) instead of allocating a `String`, so `.clone()` on a literal
// box is a pointer copy.
describe('rust borrowed string literals (Cow payload)', () => {
    test('a literal in a Value position borrows instead of allocating', () => {
        const ts = "function f(): Value {\n    let s: Value = 'lit';\n    return s;\n}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('Value::Str("lit".into())');
        expect(output).not.toContain('Value::Str("lit".to_string())');
    });

    test('a class string field borrows', () => {
        const ts = 'class A {\n    id: string = "a";\n}';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('id: Value::Str("a".into()),');
    });

    test('a native string slice maps the borrowed payload', () => {
        const ts = "function f(s: string): string {\n    return s.slice(1, 3);\n}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('Value::Str(__s.into())');
        expect(output).not.toContain('.map(Value::Str)');
    });

    test('an error-ctor concat message drops the Cow conversion', () => {
        const ts = "function f(id: string) {\n    throw new NotSupported(id + ' msg');\n}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('not_supported(format!("{}{}", id, Value::Str(" msg".into())))');
        expect(output).not.toContain('Value::Str(" msg".into())).into())');
    });
});

describe('rust native dict inserts', () => {
    const insert = (receiver: string, key: string, value: string) =>
        `if let Value::Dict(__d) = &mut ${receiver} { std::sync::Arc::make_mut(__d).insert("${key}".into(), ${value}); }`;
    const dynamic = (receiver: string, key: string, value: string) =>
        `if let Value::Dict(__d) = &mut ${receiver} { std::sync::Arc::make_mut(__d).insert(crate::runtime::stringify_param(&${key}), ${value}); }`;

    test('string-literal write on a typed dict local inserts natively', () => {
        const ts = 'const result: { [key: string]: any } = {};\nresult["k"] = 1;';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain(insert('result', 'k', 'Value::Int(1)'));
        expect(output).not.toContain('add_element_to_object(&mut result');
    });

    test('a Dictionary-typed receiver counts as a dict', () => {
        const ts = 'interface Dictionary<T> { [key: string]: T; }\nconst account: Dictionary<any> = {};\naccount["free"] = 1;';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain(insert('account', 'free', 'Value::Int(1)'));
    });

    test('a bare identifier value is cloned like the helper call would', () => {
        const ts = 'const result: { [key: string]: any } = {};\nconst v = 1;\nresult["k"] = v;';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain(insert('result', 'k', 'v.clone()'));
    });

    test('a value operand reading the receiver is hoisted into a temp', () => {
        const ts = 'const result: { [key: string]: any } = {};\nresult["k"] = result["j"];';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('{ let __be_tmp = ');
        expect(output).toContain('&mut result { std::sync::Arc::make_mut(__d).insert("k".into(), __be_tmp); }');
        expect(output).not.toContain('add_element_to_object(&mut result');
    });

    test('a call passing the receiver as an arg is hoisted too', () => {
        const ts = 'const params: { [key: string]: any } = {};\nparams["auth"] = this.createAuth(params);';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('{ let __be_tmp = self.createAuth(params); if let Value::Dict(__d) = &mut params { std::sync::Arc::make_mut(__d).insert("auth".into(), __be_tmp); } }');
    });

    test('a bool-typed value operand is boxed in Value::Bool', () => {
        const ts = 'const result: { [key: string]: any } = {};\nconst a: any = 1;\nresult["k"] = (a === 1);';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('insert("k".into(), Value::Bool(');
    });

    test('this.<field> receivers insert natively', () => {
        const ts = 'class A { options: { [key: string]: any } = {};\n    f() { this.options["k"] = 1; } }';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain(insert('self.options', 'k', 'Value::Int(1)'));
        expect(output).not.toContain('add_element_to_object(&mut self.options');
    });

    test('array-typed receivers keep the helper', () => {
        const ts = 'const result: any[] = [];\nresult["k"] = 1;';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('add_element_to_object(&mut result');
    });

    test('class-typed receivers keep the helper', () => {
        const ts = 'class Book { bids: any[] = []; }\nfunction f(book: Book) { book["k"] = 1; }';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('add_element_to_object(&mut book');
    });

    test('receivers bound from an element read keep the helper', () => {
        const ts = 'const rows: any[] = [];\nconst result = rows[0];\nresult["k"] = 1;';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('add_element_to_object(&mut result');
    });

    test('book-meta keys insert natively on a constructed dict', () => {
        const ts = 'const result: { [key: string]: any } = {};\nresult["timestamp"] = 1;';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain(insert('result', 'timestamp', 'Value::Int(1)'));
        expect(output).not.toContain('add_element_to_object(&mut result');
    });

    test('book-meta keys keep the helper on a declared-Dict local', () => {
        const ts = 'function f(response) {\n    const data = this.safeDict(response, "data", {});\n    data["timestamp"] = 1;\n}';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('add_element_to_object(&mut data, &Value::Str("timestamp"');
    });

    test('book-meta keys keep the helper on a whitelisted name without a construction proof', () => {
        const ts = 'let result = undefined;\nresult = {};\nresult["timestamp"] = 1;';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('add_element_to_object(&mut result, &Value::Str("timestamp"');
    });

    test('computed keys insert natively through stringify_param', () => {
        const ts = 'const result: { [key: string]: any } = {};\nconst k = "x";\nresult[k] = 1;';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain(dynamic('result', 'k', 'Value::Int(1)'));
        expect(output).not.toContain('add_element_to_object(&mut result');
    });

    test('computed keys on a base dict field insert natively', () => {
        const ts = 'class A {\n' +
            '    balance: any = {};\n' +
            '    f(account) {\n' +
            '        this.balance[account] = 1;\n' +
            '    }\n' +
            '}';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain(dynamic('self.balance', 'account', 'Value::Int(1)'));
        expect(output).not.toContain('add_element_to_object(&mut self.balance');
    });

    test('a computed key reading the receiver keeps the helper', () => {
        const ts = 'const result: { [key: string]: any } = {};\nresult[result["k"]] = 1;';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('add_element_to_object(&mut result');
    });

    test('a computed key that is not a plain place keeps the helper', () => {
        const ts = 'const result: { [key: string]: any } = {};\nconst o: any = {};\nresult[o.k] = 1;';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('add_element_to_object(&mut result');
    });

    test('a later write of another shape keeps the helper', () => {
        const ts = 'let result: { [key: string]: any } = {};\nresult = [] as any;\nresult["k"] = 1;';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('add_element_to_object(&mut result');
    });

    test('a fresh-map request local inserts natively', () => {
        const ts = 'const request: { [key: string]: any } = {};\nrequest["k"] = 1;';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain(insert('request', 'k', 'Value::Int(1)'));
    });

    test('a fresh-map local inserts natively whatever its name', () => {
        const ts = 'const headers: { [key: string]: any } = { "a": 1 };\nheaders["k"] = 1;';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain(insert('headers', 'k', 'Value::Int(1)'));
        expect(output).not.toContain('add_element_to_object(&mut headers');
    });

    test('a handler-tuple reassigned local stays a plain dict', () => {
        const ts = 'class A {\n' +
            '    f(params) {\n' +
            '        let request: { [key: string]: any } = { "a": 1 };\n' +
            '        [ request, params ] = this.handleUntilOption("endTime", request, params);\n' +
            '        request["k"] = 1;\n' +
            '    }\n' +
            '}';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain(insert('request', 'k', 'Value::Int(1)'));
        expect(output).not.toContain('add_element_to_object(&mut request');
    });

    test('a tuple reassigned from a non-handler call keeps the helper', () => {
        const ts = 'class A {\n' +
            '    f(params) {\n' +
            '        const rows: any[] = [];\n' +
            '        let request: { [key: string]: any } = { "a": 1 };\n' +
            '        [ request, params ] = rows[0];\n' +
            '        request["k"] = 1;\n' +
            '    }\n' +
            '}';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('add_element_to_object(&mut request');
    });

    test('an object literal carrying a runtime tag key keeps the helper', () => {
        const ts = 'const request: { [key: string]: any } = { "__book_id": 1 };\nrequest["k"] = 1;';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('add_element_to_object(&mut request');
    });

    test('a local reassigned from a call keeps the helper', () => {
        const ts = 'class A {\n' +
            '    f() {\n' +
            '        let request: { [key: string]: any } = { "a": 1 };\n' +
            '        request = this.extend(request, { "b": 2 });\n' +
            '        request["k"] = 1;\n' +
            '    }\n' +
            '}';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('add_element_to_object(&mut request');
    });

    test('a hand-written base dict field inserts natively', () => {
        const ts = 'class A {\n' +
            '    balance: any = {};\n' +
            '    f() {\n' +
            '        this.balance["swap"] = 1;\n' +
            '    }\n' +
            '}';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain(insert('self.balance', 'swap', 'Value::Int(1)'));
        expect(output).not.toContain('add_element_to_object(&mut self.balance');
    });

    test('a tagged handle field keeps the helper', () => {
        const ts = 'class A {\n' +
            '    subscriptions: any = {};\n' +
            '    f() {\n' +
            '        this.subscriptions["k"] = 1;\n' +
            '    }\n' +
            '}';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('add_element_to_object(&mut self.subscriptions');
    });

    test('a declared-Dict local (safeDict with an object default) inserts natively', () => {
        const ts = 'function f(response) {\n' +
            '    const data = this.safeDict(response, "data", {});\n' +
            '    data["ts"] = 1;\n' +
            '}';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain(insert('data', 'ts', 'Value::Int(1)'));
        expect(output).not.toContain('add_element_to_object(&mut data');
    });

    test('a declared-Dict local with a computed key inserts natively', () => {
        const ts = 'function f(response, code) {\n' +
            '    const data = this.safeDict(response, "data", {});\n' +
            '    data[code] = 1;\n' +
            '}';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain(dynamic('data', 'code', 'Value::Int(1)'));
    });

    test('a Dict-typed parameter inserts natively for literal and computed keys', () => {
        const decl = 'interface Dictionary<T> { [key: string]: T; }\ntype Dict = Dictionary<any>;\ntype Str = string | undefined;\n';
        const literal = transpiler.transpileRust(decl + 'function f (balance: Dict) {\n    balance["k"] = 1;\n}').content;
        expect(literal).toContain(insert('balance', 'k', 'Value::Int(1)'));
        expect(literal).not.toContain('add_element_to_object(&mut balance');
        const computed = transpiler.transpileRust(decl + 'function f (balance: Dict, code: Str) {\n    balance[code] = 1;\n}').content;
        expect(computed).toContain(dynamic('balance', 'code', 'Value::Int(1)'));
    });

    test('a parameter with a default value keeps the pre-unit tuple proof', () => {
        const decl = 'interface Dictionary<T> { [key: string]: T; }\ntype Dict = Dictionary<any>;\n';
        const ts = decl + 'class A {\n' +
            '    f(params: Dict = {}) {\n' +
            '        let uta: any = undefined;\n' +
            '        [ uta, params ] = this.getInstType("m", params);\n' +
            '        params["uta"] = true;\n' +
            '    }\n' +
            '}';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain(insert('params', 'uta', 'Value::Bool(true)'));
        expect(output).not.toContain('add_element_to_object(&mut params');
    });

    test('a parameter reassigned from a call keeps the helper', () => {
        const decl = 'interface Dictionary<T> { [key: string]: T; }\ntype Dict = Dictionary<any>;\n';
        const ts = decl + 'class A {\n' +
            '    f(params: Dict = {}) {\n' +
            '        params = this.omit(params, "margin");\n' +
            '        params["k"] = 1;\n' +
            '    }\n' +
            '}';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('add_element_to_object(&mut params');
    });

    test('any-typed receivers keep the helper', () => {
        const ts = 'function f(params: any) {\n    params["k"] = 1;\n}';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('add_element_to_object(&mut params');
    });
});

describe('rust truthiness sinks take the bare bool', () => {
    // `is_true` is the one sink whose signature takes a native `bool`
    // (`impl IsTruthy for bool`, and `IsTruthy for Value` unboxes a
    // `Value::Bool(b)` back to `b`), so the printer's box around a bool in a
    // truthiness position is a round-trip and prints as the bare expression.

    test('a boxed condition loses the Value::Bool box', () => {
        const ts = 'class A { f(x) { if (Array.isArray (x)) { return 1; } return 2; } }';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('if (matches!(&x, Value::Arr(_))) {');
        expect(output).not.toContain('Value::Bool(matches!(&x, Value::Arr(_)))');
    });

    test('a negated boxed condition prints the bare bool', () => {
        const ts = 'class A { f(x) { if (!Array.isArray (x)) { return 1; } return 2; } }';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('if !(matches!(&x, Value::Arr(_))) {');
    });

    test('every &&/|| operand is unboxed on its own', () => {
        const ts = 'class A { f(x, y) { if (Array.isArray (x) || y) { return 1; } return 2; } }';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('if (matches!(&x, Value::Arr(_))) || is_true(&y) {');
    });

    test('a boxed `in` condition loses the box', () => {
        const ts = 'class A { f(x) { if ("k" in x) { return 1; } return 2; } }';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('if is_true(&(in_op(&x, &Value::Str("k".into())))) {');
    });

    test('assert() takes the bare bool as well', () => {
        const ts = 'class A { f(x) { assert (Array.isArray (x), "msg"); } }';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('assert((matches!(&x, Value::Arr(_))), Value::Str("msg".into()));');
    });

    // negatives — every other sink takes a `Value` and keeps its box.
    test('a Value-argument box is untouched', () => {
        const ts = 'class A { f(x) { return g (Array.isArray (x)); } }';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('return g(Value::Bool(matches!(&x, Value::Arr(_))));');
    });

    test('a Value-local initializer box is untouched', () => {
        const ts = 'class A { f(x) { const y = Array.isArray (x); return y; } }';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('let mut y: Value = Value::Bool(matches!(&x, Value::Arr(_)));');
    });

    test('is_equal keeps its &Value operand box', () => {
        const ts = 'class A { f(x) { if (x === true) { return 1; } return 2; } }';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('if is_equal(&x, &Value::Bool(true)) {');
    });
});

// B-26: the condition printer's last resort wraps an operand no earlier branch
// claimed. A parenthesised comparison the checker proved native (or the
// `Value::Bool(…)` the printer boxes it in for a `Value` slot) is already a Rust
// `bool`, so `is_true(&(…))` — the identity over `IsTruthy for bool` — is dropped.
describe('rust is_true over an already-native bool expression', () => {
    test('a parenthesised null compare prints bare', () => {
        const ts = 'class A { f(a) { if ((a !== undefined)) { return 1; } return 2; } }';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('if (a != Value::Null) {');
        expect(output).not.toContain('is_true(&(a != Value::Null))');
    });

    test('a parenthesised string compare prints bare', () => {
        const ts = 'class A { f(a: string) { if ((a === "lit")) { return 1; } return 2; } }';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('if (a.as_str() == Some("lit")) {');
        expect(output).not.toContain('is_true(&(a.as_str() == Some("lit")))');
    });

    test('a parenthesised bool compare prints bare', () => {
        const ts = 'class A { f(a: boolean) { if ((a === true)) { return 1; } return 2; } }';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('if (a.as_bool() == Some(true)) {');
        expect(output).not.toContain('is_true(&(a.as_bool() == Some(true)))');
    });

    test('a parenthesised ordered compare prints bare', () => {
        const ts = 'class A { f(a: number, b: number) { if ((a < b)) { return 1; } return 2; } }';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('if (a.as_f64().unwrap_or(f64::NAN) < b.as_f64().unwrap_or(f64::NAN)) {');
    });

    test('a parenthesised numeric literal compare prints bare', () => {
        const ts = 'class A { f(a: number) { if ((a === 1)) { return 1; } return 2; } }';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('if (a.as_f64() == Some(1.0)) {');
    });

    test('a ternary condition prints bare', () => {
        const ts = 'class A { f(a: boolean) { const r: any = (a === true) ? 1 : 2; return r; } }';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('(if (a.as_bool() == Some(true)) {');
    });

    test('a while condition prints bare', () => {
        const ts = 'class A { f(a) { while ((a !== undefined)) { return 1; } } }';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('while (a != Value::Null) {');
    });

    test('every logical operand prints bare on its own', () => {
        const ts = 'class A { f(a: number, b: string) { if ((a !== undefined) && (b !== "x")) { return 1; } return 2; } }';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('if (a != Value::Null) && (b.as_str() != Some("x")) {');
    });

    test('a negated native compare prints bare', () => {
        const ts = 'class A { f(a) { if (!(a !== undefined)) { return 1; } return 2; } }';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('if !(a != Value::Null) {');
    });

    // negatives — a helper-led text keeps the is_true marker the post-passes key on.
    test('a helper-led comparison keeps the wrapper', () => {
        const ts = 'class A { f(a, b) { if ((a === b)) { return 1; } return 2; } }';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('if is_true(&(is_equal(&a, &b))) {');
    });

    test('a boxed Value-slot logical prints its native operands bare', () => {
        const ts = 'class A { f(a, b) { const r = (a === null) && b; return r; } }';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('let mut r: Value = Value::Bool((a == Value::Null) && is_true(&b));');
    });

    test('a helper-led Value-slot logical keeps the is_true markers', () => {
        const ts = 'class A { f(a, b, c) { const r = (a === b) && c; return r; } }';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('let mut r: Value = is_true(&(is_equal(&a, &b))) && is_true(&c);');
    });
});

describe('rust numeric literals', () => {
    test('an exponent literal is a float, negated or not', () => {
        const input = "class A { f(x) { const a = x.g(1e-7); const b = x.g(-1e-7); const c = -5; return [a, b, c]; } }";
        const output = transpiler.transpileRust(input).content;
        expect(output).toContain('x.g(Value::Float(1e-7))');
        expect(output).toContain('x.g(Value::Float(-1e-7))');
        expect(output).toContain('Value::Int(-5)');
        expect(output).not.toContain('Value::Int(1e-7)');
    });
});

// `is_true(&<call>)` is the identity when the callee's Rust signature is
// `-> bool`; those callees are listed in RUST_BOOL_RESULT_CALLEES and proven
// boolean by the checker, so the printer emits the call bare.
describe('rust hand-written bool-returning calls', () => {
    const typed = (body: string) =>
        'function tickerExceptionNeedsOhlcv(ex: any, exchange: any, ticker: any): boolean {\n' +
        '    return true;\n' +
        '}\n' +
        'function isTemporaryFailure(e: any): boolean {\n' +
        '    return false;\n' +
        '}\n' +
        'class A {\n' +
        '    run(ex: any, exchange: any, ticker: any) {\n' +
        body + '\n' +
        '    }\n' +
        '}';

    test('condition over a `-> bool` callee prints bare', () => {
        const output = transpiler.transpileRust(typed(
            '        if (tickerExceptionNeedsOhlcv(ex, exchange, ticker)) {\n' +
            '            return 1;\n' +
            '        }\n' +
            '        return 0;',
        )).content;
        expect(output).toContain('if tickerExceptionNeedsOhlcv(ex, exchange, ticker) {');
        expect(output).not.toContain('is_true(&tickerExceptionNeedsOhlcv');
    });

    test('logical operand over a `-> bool` callee prints bare', () => {
        const output = transpiler.transpileRust(typed(
            '        if ((ticker !== undefined) && tickerExceptionNeedsOhlcv(ex, exchange, ticker)) {\n' +
            '            return 1;\n' +
            '        }\n' +
            '        return 0;',
        )).content;
        expect(output).toContain('&& tickerExceptionNeedsOhlcv(ex, exchange, ticker) {');
        expect(output).not.toContain('is_true(&tickerExceptionNeedsOhlcv');
    });

    test('negated `-> bool` callee prints bare', () => {
        const output = transpiler.transpileRust(typed(
            '        if (!tickerExceptionNeedsOhlcv(ex, exchange, ticker)) {\n' +
            '            return 1;\n' +
            '        }\n' +
            '        return 0;',
        )).content;
        expect(output).toContain('if !tickerExceptionNeedsOhlcv(ex, exchange, ticker) {');
    });

    test('a boolean-typed callee outside the table keeps is_true', () => {
        const output = transpiler.transpileRust(typed(
            '        if (isTemporaryFailure(ex)) {\n' +
            '            return 1;\n' +
            '        }\n' +
            '        return 0;',
        )).content;
        expect(output).toContain('if is_true(&isTemporaryFailure(ex)) {');
    });
});

// ── is_true over a checker-proved boolean Value ─────────────────────────────
// `safeBool(...)` and element accesses whose checker type is boolean|undefined
// can only be `Value::Bool(..)` or `Value::Null` at runtime, where the truthy
// helper is exactly `matches!(.., Value::Bool(true))`.
describe('rust is_true over a proven boolean Value', () => {
    const boolClass = (body: string) =>
        'class A {\n' +
        '    safeBool(obj: any, key: any, defaultValue?: boolean): boolean | undefined { return undefined; }\n' +
        '    safeBool2(obj: any, k1: any, k2: any, defaultValue?: boolean): boolean | undefined { return undefined; }\n' +
        '    isLinear(market: any): boolean { return true; }\n' +
        '    run() {\n' + body + '\n    }\n' +
        '}';

    test('safeBool in a condition emits the native matches!', () => {
        const ts = boolClass("        if (this.safeBool(this.options, 'foo', false)) { return 1; }");
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('if matches!(self.safeBool(self.options, Value::Str("foo".into()), &[Value::Bool(false)]), Value::Bool(true))');
        expect(output).not.toContain('is_true(&self.safeBool');
    });

    test('negated safeBool keeps the negation around the matches!', () => {
        const ts = boolClass("        if (!this.safeBool(this.options, 'foo')) { return 1; }");
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('if !matches!(self.safeBool(self.options, Value::Str("foo".into()), &[]), Value::Bool(true))');
        expect(output).not.toContain('is_true(&self.safeBool');
    });

    test('safeBool2 and a ternary condition emit the native matches!', () => {
        const ts = boolClass("        return this.safeBool2(this.options, 'a', 'b', false) ? 1 : 2;");
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('(if matches!(self.safeBool2(self.options, Value::Str("a".into()), Value::Str("b".into()), &[Value::Bool(false)]), Value::Bool(true))');
        expect(output).not.toContain('is_true(&self.safeBool2');
    });

    test('a method returning only bool literals tests as_bool natively (hx4 R12)', () => {
        const ts = boolClass('        if (this.isLinear(this.options)) { return 1; }');
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('if self.isLinear(self.options).as_bool() == Some(true) {');
        expect(output).not.toContain('is_true(&self.isLinear');
    });

    test('a logical stored in a Value local keeps the helper', () => {
        const ts = boolClass("        const x = this.safeBool(this.options, 'a') || this.safeBool(this.options, 'b');\n        return x;");
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('is_true(&self.safeBool(self.options, Value::Str("a".into()), &[])) || is_true(&self.safeBool');
        expect(output).not.toContain('matches!(self.safeBool');
    });

    test('a logical inside a condition emits the native matches! operand', () => {
        const ts = boolClass("        if (this.safeBool(this.options, 'a') && this.safeBool(this.options, 'b')) { return 1; }");
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('if matches!(self.safeBool(self.options, Value::Str("a".into()), &[]), Value::Bool(true)) && matches!(self.safeBool');
    });

    test('a boolean-typed element access emits the native matches!', () => {
        const ts =
            'class B {\n' +
            '    run(options: { foo?: boolean }) {\n' +
            "        if (options['foo']) { return 1; }\n" +
            '        return 2;\n' +
            '    }\n' +
            '}';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('if matches!(options.get("foo").cloned().unwrap_or(Value::Null), Value::Bool(true))');
        expect(output).not.toContain('is_true(&options');
    });

    test('a non-boolean element access keeps the helper', () => {
        const ts =
            'class C {\n' +
            '    run(options: { foo?: string }, i: number) {\n' +
            "        if (options['foo']) { return 1; }\n" +
            '        if (options[i]) { return 2; }\n' +
            '        return 3;\n' +
            '    }\n' +
            '}';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('is_true(&options.as_map().and_then(|__m| __m.get("foo")).cloned().unwrap_or(Value::Null))');
        expect(output).toContain('is_true(&get_value(&options, &i))');
        expect(output).not.toContain('matches!(options');
    });
});

describe('rust declared-Dict locals', () => {
    const NATIVE = (name: string, key: string) =>
        `${name}.as_map().and_then(|__m| __m.get("${key}")).cloned().unwrap_or(Value::Null)`;

    // A default-valued bag param is lowered to `let x = get_arg(optionalArgs,
    // k, Value::Map({...}))` — a fresh dict whenever the caller passes none,
    // and any caller dict otherwise: a literal-key read needs no helper.
    test('default-valued bag param reads natively', () => {
        const ts =
            "function f(optionalArgs: any = [], config: any = {}) {\n" +
            "    return config['noCoin'];\n" +
            "}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain(NATIVE('config', 'noCoin'));
        expect(output).not.toContain('get_value_k(&config');
    });

    test('default-valued bag param reads a property natively', () => {
        const ts =
            "function f(optionalArgs: any = [], config: any = {}) {\n" +
            "    return config.noSymbol;\n" +
            "}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain(NATIVE('config', 'noSymbol'));
        expect(output).not.toContain('get_value(&config, &Value::Str("noSymbol"');
    });

    test('extend onto an object literal reads natively', () => {
        const ts =
            "class A {\n" +
            "    extend(a: any, b: any): any { return a; }\n" +
            "    f(market: any) {\n" +
            "        const cleanStructure = { 'spot': undefined, 'swap': undefined };\n" +
            "        const result = this.extend(cleanStructure, market);\n" +
            "        return result['spot'];\n" +
            "    }\n" +
            "}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain(NATIVE('result', 'spot'));
        expect(output).not.toContain('get_value_k(&result');
    });

    test('element of a Dictionary container reads natively', () => {
        const ts =
            "type Str = string | undefined;\n" +
            "interface Market { id: string; }\n" +
            "interface Markets { [key: string]: Market; }\n" +
            "class A {\n" +
            "    markets: Markets = {};\n" +
            "    f(symbol: Str) {\n" +
            "        const market = this.markets[symbol];\n" +
            "        return market['id'];\n" +
            "    }\n" +
            "}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain(NATIVE('market', 'id'));
        expect(output).not.toContain('get_value_k(&market');
    });

    // D2: any later write may replace the dict, so the proof is dropped.
    test('reassigned local keeps the helper', () => {
        const ts =
            "function f(other: any = {}, config: any = {}) {\n" +
            "    config = other;\n" +
            "    return config['noCoin'];\n" +
            "}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('crate::value::get_value_k(&config, "noCoin")');
    });

    // D5: these keys are served from the book store / a live snapshot by the
    // runtime helper, which a plain map read cannot see.
    test('runtime-routed keys keep the helper', () => {
        const ts =
            "function f(config: any = {}) {\n" +
            "    const a = config['symbol'];\n" +
            "    const b = config['cache'];\n" +
            "    return [a, b];\n" +
            "}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('crate::value::get_value_k(&config, "symbol")');
        expect(output).toContain('crate::value::get_value_k(&config, "cache")');
    });

    test('param without a dict default keeps the helper', () => {
        const ts =
            "function f(config: any) {\n" +
            "    return config['noCoin'];\n" +
            "}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('crate::value::get_value_k(&config, "noCoin")');
    });
});

describe('rust native string search and slicing', () => {
    const stringMethod = (body: string, params = 'a: string') =>
        `class A {\n    run(${params}) {\n${body}\n    }\n}`;

    test('indexOf with a literal needle on a proven string is native', () => {
        const output = transpiler.transpileRust(stringMethod("        return a.indexOf('/');")).content;
        expect(output).toContain('return Value::Int(a.as_str().and_then(|__s| __s.find("/")).map(|__i| __i as i64).unwrap_or(-1));');
        expect(output).not.toContain('get_index_of');
    });

    test('a nullable string receiver keeps the -1 branch through as_str', () => {
        const output = transpiler.transpileRust(stringMethod("        return a.indexOf(':');", 'a: string | undefined')).content;
        expect(output).toContain('Value::Int(a.as_str().and_then(|__s| __s.find(":")).map(|__i| __i as i64).unwrap_or(-1))');
        expect(output).not.toContain('get_index_of');
    });

    test('an unproven receiver keeps the helper', () => {
        const output = transpiler.transpileRust(stringMethod("        return a.indexOf('/');", 'a: any')).content;
        expect(output).toContain('(match (&(a), &(Value::Str("/".into())))');
    });

    test('an array receiver keeps the helper (the helper scans it)', () => {
        const output = transpiler.transpileRust(stringMethod("        return a.indexOf('/');", 'a: string[]')).content;
        expect(output).toContain('(match (&(a), &(Value::Str("/".into())))');
    });

    test('a non-literal needle keeps the helper', () => {
        const output = transpiler.transpileRust(stringMethod('        return a.indexOf(b);', 'a: string, b: any')).content;
        expect(output).toContain('(match (&(a), &(b))');
    });

    test('an escaped literal needle keeps its escapes', () => {
        const output = transpiler.transpileRust(stringMethod('        return a.indexOf("\\n");')).content;
        expect(output).toContain('__s.find("\\n")');
    });

    test('slice with a single negative literal bound is native', () => {
        const output = transpiler.transpileRust(stringMethod('        return a.slice(-64);', 'a: string')).content;
        expect(output).toContain('let __i = (__l - 64).max(0); let __j = __l;');
        expect(output).not.toContain('slice(&');
    });

    test('slice with two literal bounds clamps both ends', () => {
        const output = transpiler.transpileRust(stringMethod('        return a.slice(2, 4);')).content;
        expect(output).toContain('let __i = __l.min(2); let __j = __l.min(4);');
        expect(output).not.toContain('slice(&');
    });

    test('slice with a negative end counts from the end', () => {
        const output = transpiler.transpileRust(stringMethod('        return a.slice(2, -1);')).content;
        expect(output).toContain('let __i = __l.min(2); let __j = (__l - 1).max(0);');
    });

    test('slice keeps the helper for an expression bound', () => {
        const output = transpiler.transpileRust(stringMethod('        return a.slice(0, b);', 'a: string, b: number')).content;
        expect(output).toContain('(match (&(a), (match &(Value::Int(0)) {');
    });

    test('slice keeps the helper for an unproven receiver', () => {
        const output = transpiler.transpileRust(stringMethod('        return a.slice(0, 2);', 'a: any')).content;
        expect(output).toContain('(match (&(a), (match &(Value::Int(0)) {');
    });

    test('length on a nullable array or string is native', () => {
        const arrayOutput = transpiler.transpileRust(stringMethod('        return a.length;', 'a: string[] | undefined')).content;
        expect(arrayOutput).toContain('return Value::Int(a.len() as i64);');
        const stringOutput = transpiler.transpileRust(stringMethod('        return a.length;', 'a: string | undefined')).content;
        expect(stringOutput).toContain('return Value::Int(a.len() as i64);');
    });

    test('length on an unproven receiver keeps the helper', () => {
        const output = transpiler.transpileRust(stringMethod('        return a.length;', 'a: any')).content;
        expect(output).toContain('get_array_length(&a)');
    });
});

// Native equality for plain reads whose checker type is a class instance
// (struct field / local / param — all printed `Value`) and for operands the
// checker confines to Bool/Null/non-numeric strings.
describe('rust native equality on declared reads', () => {
    const CACHE_FIELD = 'class Cache {}\nclass A {\n    orders: Cache | undefined = undefined;\n';

    test('a class-typed field compares to null natively', () => {
        const ts = CACHE_FIELD +
            '    run(u: any) {\n' +
            '        if (this.orders === undefined) {\n' +
            '            return u;\n' +
            '        }\n' +
            '        return this.orders;\n' +
            '    }\n' +
            '}';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('if (self.orders == Value::Null) {');
        expect(output).not.toContain('is_equal(&self.orders');
    });

    test('a class-typed parameter compares to null natively', () => {
        const ts = 'class Cache {}\nclass A {\n' +
            '    run(orders: Cache | undefined, u: any) {\n' +
            '        if (orders === undefined) {\n' +
            '            return u;\n' +
            '        }\n' +
            '        return orders;\n' +
            '    }\n' +
            '}';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('if (orders == Value::Null) {');
        expect(output).not.toContain('is_equal(&orders');
    });

    test('a local initialised from a field compares to null natively', () => {
        const ts = CACHE_FIELD +
            '    run(u: any) {\n' +
            '        const cached = this.orders;\n' +
            '        if (cached === undefined) {\n' +
            '            return u;\n' +
            '        }\n' +
            '        return cached;\n' +
            '    }\n' +
            '}';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('if (cached == Value::Null) {');
        expect(output).not.toContain('is_equal(&cached');
    });

    test('a local holding a constructed struct stays on the helper', () => {
        const ts = 'class B {}\nclass A {\n' +
            '    run(u: any) {\n' +
            '        const created = new B();\n' +
            '        return created === undefined;\n' +
            '    }\n' +
            '}';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('is_equal(&created, &Value::Null)');
    });

    const HAS_UNION = 'class A {\n    has!: { [key: string]: boolean | \'emulated\' | undefined };\n';

    test('a bool-literal union compares the unwrapped bool', () => {
        const output = transpiler.transpileRust(HAS_UNION +
            '    run() {\n' +
            '        return this.has[\'fetchOrders\'] === true;\n' +
            '    }\n' +
            '}').content;
        expect(output).toContain('.unwrap_or(Value::Null).as_bool() == Some(true)');
        expect(output).not.toContain('is_equal(');
    });

    test('a negated bool-literal union compares the unwrapped bool', () => {
        const output = transpiler.transpileRust(HAS_UNION +
            '    run() {\n' +
            '        if (this.has[\'fetchOrders\'] !== false) {\n' +
            '            return 1;\n' +
            '        }\n' +
            '        return 2;\n' +
            '    }\n' +
            '}').content;
        expect(output).toContain('.unwrap_or(Value::Null).as_bool() != Some(false)');
        expect(output).not.toContain('is_equal(');
    });

    test('a numeric string member keeps the helper', () => {
        const output = transpiler.transpileRust(
            'class A {\n    has!: { [key: string]: boolean | \'1\' | undefined };\n' +
            '    run() {\n' +
            '        return this.has[\'fetchOrders\'] === true;\n' +
            '    }\n' +
            '}').content;
        expect(output).toContain('is_equal(&self.has');
    });

    test('a number member keeps the helper', () => {
        const output = transpiler.transpileRust(
            'class A {\n    has!: { [key: string]: boolean | number | undefined };\n' +
            '    run() {\n' +
            '        return this.has[\'fetchOrders\'] === true;\n' +
            '    }\n' +
            '}').content;
        expect(output).toContain('is_equal(&self.has');
    });

    test('a plain string member keeps the helper', () => {
        const output = transpiler.transpileRust(
            'class A {\n    has!: { [key: string]: string };\n' +
            '    run() {\n' +
            '        return this.has[\'fetchOrders\'] === true;\n' +
            '    }\n' +
            '}').content;
        expect(output).toContain('is_equal(&self.has');
    });
});

describe('rust declared-Dict locals (rust-25)', () => {
    // The declared-Dict table answers `rustDeclaredLocalTypeResolver(node)` for a
    // local the printer itself can prove holds a `Value::Dict` at every use: the
    // initialiser is a `safe_dict*` call whose default is itself Dict-proven, or
    // a `Value::Map(..)` object literal, and no later write changes the kind.
    // The declaration stays `Value`; consumers (get_value / in_op /
    // add_element_to_object families) read the hook.

    const rustPrinter = () => (transpiler as any).rustTranspiler;

    const identifierUses = (name: string) => {
        const sourceFile = rustPrinter().getSrc();
        const found: any[] = [];
        const walk = (node: any) => {
            if (isIdentifier(node) && node.text === name) found.push(node);
            node.forEachChild(walk);
        };
        walk(sourceFile);
        return found;
    };

    const resolveNamed = (snippet: string, name: string, predicate: (node: any) => boolean = () => true) => {
        transpiler.transpileRust(snippet);
        const rust = rustPrinter();
        const node = identifierUses(name).find(predicate);
        expect(node).toBeDefined();
        return { rust, answer: rust.rustDeclaredLocalTypeResolver(node), node };
    };

    const isElementReceiver = (node: any) => node.parent !== undefined && isElementAccessExpression(node.parent) && node.parent.expression === node;

    test('safe_dict with an object default is proven Dict', () => {
        const snippet =
            'class T {\n' +
            '    m(response) {\n' +
            "        const data = this.safeDict(response, 'data', {});\n" +
            "        data['a'] = 1;\n" +
            "        return data['b'];\n" +
            '    }\n' +
            '}';
        const { answer } = resolveNamed(snippet, 'data', isElementReceiver);
        expect(answer).toBe('dict');
    });

    test('the declaration stays Value (no native HashMap retype)', () => {
        const snippet =
            'class T {\n' +
            '    m(response) {\n' +
            "        const data = this.safeDict(response, 'data', {});\n" +
            "        return data['b'];\n" +
            '    }\n' +
            '}';
        const output = transpiler.transpileRust(snippet).content;
        expect(output).toContain('let mut data: Value = self.safeDict(response, Value::Str("data".into()), Value::Map({');
        expect(output).not.toContain('HashMap<String, Value> = self.safeDict');
    });

    test('safe_dict without a default may be Value::Null, so no proof', () => {
        const snippet =
            'class T {\n' +
            '    m(response) {\n' +
            "        const data = this.safeDict(response, 'data');\n" +
            "        return data['b'];\n" +
            '    }\n' +
            '}';
        const { answer } = resolveNamed(snippet, 'data', isElementReceiver);
        expect(answer).toBeUndefined();
    });

    test('an object literal initialiser is proven Dict', () => {
        const snippet =
            'class T {\n' +
            '    m(params) {\n' +
            '        const request = { symbol: params, type: 1 };\n' +
            "        request['limit'] = 10;\n" +
            "        return request['symbol'];\n" +
            '    }\n' +
            '}';
        const { answer } = resolveNamed(snippet, 'request', isElementReceiver);
        expect(answer).toBe('dict');
    });

    test('a safe_dict2 default proves Dict too', () => {
        const snippet =
            'class T {\n' +
            '    m(response) {\n' +
            "        const row = this.safeDict2(response, 'a', 'b', {});\n" +
            "        return row['x'];\n" +
            '    }\n' +
            '}';
        const { answer } = resolveNamed(snippet, 'row', isElementReceiver);
        expect(answer).toBe('dict');
    });

    test('a default that is itself a proven local proves Dict', () => {
        const snippet =
            'class T {\n' +
            '    m(response) {\n' +
            "        const fallback = this.safeDict(response, 'fallback', {});\n" +
            "        const row = this.safeDict(response, 'row', fallback);\n" +
            "        return row['x'];\n" +
            '    }\n' +
            '}';
        const { answer } = resolveNamed(snippet, 'row', isElementReceiver);
        expect(answer).toBe('dict');
    });

    test('reassignment of a non-proven value drops the proof (D2)', () => {
        const snippet =
            'class T {\n' +
            '    m(response, other) {\n' +
            "        let data = this.safeDict(response, 'data', {});\n" +
            '        data = other;\n' +
            "        return data['b'];\n" +
            '    }\n' +
            '}';
        const { answer } = resolveNamed(snippet, 'data', isElementReceiver);
        expect(answer).toBeUndefined();
    });

    test('reassignment of another proven Dict keeps the proof (D2)', () => {
        const snippet =
            'class T {\n' +
            '    m(response) {\n' +
            "        let data = this.safeDict(response, 'data', {});\n" +
            "        data = this.safeDict(response, 'other', {});\n" +
            "        return data['b'];\n" +
            '    }\n' +
            '}';
        const { answer } = resolveNamed(snippet, 'data', isElementReceiver);
        expect(answer).toBe('dict');
    });

    test('a destructuring write drops the proof (D2)', () => {
        const snippet =
            'class T {\n' +
            '    m(response, params) {\n' +
            "        let data = this.safeDict(response, 'data', {});\n" +
            "        [ data, params ] = this.handleUntilOption('endTime', data, params);\n" +
            "        return data['b'];\n" +
            '    }\n' +
            '}';
        const { answer } = resolveNamed(snippet, 'data', isElementReceiver);
        expect(answer).toBeUndefined();
    });

    test('a for-of rebind of the local drops the proof (D2)', () => {
        const snippet =
            'class T {\n' +
            '    m(response, list) {\n' +
            "        let data = this.safeDict(response, 'data', {});\n" +
            '        for (data of list) {}\n' +
            "        return data['b'];\n" +
            '    }\n' +
            '}';
        const { answer } = resolveNamed(snippet, 'data', isElementReceiver);
        expect(answer).toBeUndefined();
    });

    test('an element write into the local stays kind-preserving', () => {
        const snippet =
            'class T {\n' +
            '    m(response) {\n' +
            "        const data = this.safeDict(response, 'data', {});\n" +
            "        data['a'] = data['b'];\n" +
            "        return data['c'];\n" +
            '    }\n' +
            '}';
        const { rust, answer, node } = resolveNamed(snippet, 'data', isElementReceiver);
        expect(answer).toBe('dict');
        expect(rust.rustDeclaredLocalEntry(node).uses.elementAccess).toBe(3);
    });

    test('a different binding of the name in a nested block does not invalidate', () => {
        const snippet =
            'class T {\n' +
            '    m(response) {\n' +
            "        const data = this.safeDict(response, 'data', {});\n" +
            '        { const data = 1; m.insert("k", data); }\n' +
            "        return data['b'];\n" +
            '    }\n' +
            '}';
        const { answer } = resolveNamed(snippet, 'data', (node) => isElementReceiver(node) && node.getStart() > snippet.indexOf('return'));
        expect(answer).toBe('dict');
    });

    test('a use of a shadowing binding is not answered for the outer local', () => {
        const snippet =
            'class T {\n' +
            '    m(response) {\n' +
            "        const data = this.safeDict(response, 'data', {});\n" +
            '        { const other = 1; m.insert("k", other); }\n' +
            "        return data['b'];\n" +
            '    }\n' +
            '}';
        const { answer } = resolveNamed(snippet, 'data', isElementReceiver);
        expect(answer).toBe('dict');
    });

    test('an unrelated Value local is not in the table', () => {
        const snippet =
            'class T {\n' +
            '    m(response) {\n' +
            "        const value = this.safeValue(response, 'data');\n" +
            "        return value['b'];\n" +
            '    }\n' +
            '}';
        const { answer } = resolveNamed(snippet, 'value', isElementReceiver);
        expect(answer).toBeUndefined();
    });

    test('the census counts proven and unproven declarators', () => {
        const snippet =
            'class T {\n' +
            '    m(response, other) {\n' +
            "        const proven = this.safeDict(response, 'a', {});\n" +
            "        const mayBeNull = this.safeDict(response, 'b');\n" +
            "        let reassigned = this.safeDict(response, 'c', {});\n" +
            '        reassigned = other;\n' +
            "        return [ proven['x'], mayBeNull['y'], reassigned['z'] ];\n" +
            '    }\n' +
            '}';
        transpiler.transpileRust(snippet);
        const census = rustPrinter().rustDeclaredDictLocalCensus();
        expect(census).toEqual({ declarators: 3, dict: 1, alwaysDict: 2, kindUnstable: 1, retypeEligible: 1 });
    });

    test('the table is keyed by local name and skips non-dict initialisers', () => {
        const snippet =
            'class T {\n' +
            '    m(response) {\n' +
            "        const data = this.safeDict(response, 'data', {});\n" +
            "        const list = this.safeList(response, 'data');\n" +
            '        return data;\n' +
            '    }\n' +
            '}';
        transpiler.transpileRust(snippet);
        const table = rustPrinter().rustDeclaredDictLocals();
        expect(Array.from(table.keys())).toEqual(['data']);
    });

    test('RUST_DECLARED_DICT_LOCALS exposes the vocabulary and callee table', () => {
        expect(RUST_DECLARED_DICT_LOCALS.DICT).toBe('dict');
        expect(RUST_DECLARED_DICT_LOCALS.SAFE_CALLEES['safe_dict_k']).toBe(2);
        expect(RUST_DECLARED_DICT_LOCALS.SAFE_CALLEES['safe_dict2']).toBe(3);
        expect(RUST_DECLARED_DICT_LOCALS.KIND_PRESERVING_MUTATORS.has('add_element_to_object')).toBe(true);
    });
});

// `parseInt`/`parseFloat` print the runtime helpers; a checker-proven string
// argument needs no Value-kind dispatch, so the helper's own match with native
// `str::parse` is emitted (every helper branch kept).
describe('rust native parseInt/parseFloat', () => {
    const nativeInt = '(match &x { Value::Str(__parse_s) => __parse_s.trim().parse::<i64>().map(Value::Int).unwrap_or(Value::Null), Value::Int(__parse_n) => Value::Int(*__parse_n), Value::Float(__parse_f) => Value::Int(*__parse_f as i64), _ => Value::Null })';
    const nativeFloat = '(match &x { Value::Str(__parse_s) => __parse_s.trim().parse::<f64>().map(Value::Float).unwrap_or(Value::Null), Value::Float(__parse_f) => Value::Float(*__parse_f), Value::Int(__parse_n) => Value::Float(*__parse_n as f64), _ => Value::Null })';

    test('parseInt on a string param goes native', () => {
        const input = "class A {\n    f (x: string) {\n        const n = parseInt (x);\n        return n;\n    }\n}";
        const output = transpiler.transpileRust(input).content;
        expect(output).toContain(`let mut n: Value = ${nativeInt};`);
        expect(output).not.toContain('parseInt(');
    });

    test('parseFloat on a string local goes native', () => {
        const input = "class A {\n    f (x: string) {\n        const n = parseFloat (x);\n        return n;\n    }\n}";
        const output = transpiler.transpileRust(input).content;
        expect(output).toContain(`let mut n: Value = ${nativeFloat};`);
        expect(output).not.toContain('parseFloat(');
    });

    test('a cast-to-string argument is a proven string', () => {
        const input = "class A {\n    f (x: string | undefined) {\n        const n = parseInt (x as string);\n        return n;\n    }\n}";
        const output = transpiler.transpileRust(input).content;
        expect(output).toContain(`let mut n: Value = ${nativeInt};`);
        expect(output).not.toContain('parseInt(');
    });

    test('an any-typed argument keeps the helper', () => {
        const input = "class A {\n    f (x: any) {\n        const n = parseInt (x);\n        return n;\n    }\n}";
        const output = transpiler.transpileRust(input).content;
        expect(output).toContain('let mut n: Value = parseInt(x);');
    });

    test('a numeric argument keeps the helper', () => {
        const input = "class A {\n    f (x: number) {\n        const n = parseFloat (x);\n        return n;\n    }\n}";
        const output = transpiler.transpileRust(input).content;
        expect(output).toContain('let mut n: Value = parseFloat(x);');
    });

    test('the radix form keeps the helper', () => {
        const input = "class A {\n    f (x: string) {\n        const n = parseInt (x, 10);\n        return n;\n    }\n}";
        const output = transpiler.transpileRust(input).content;
        expect(output).toContain('let mut n: Value = parseInt(x, Value::Int(10));');
    });

    test('an integer string literal folds to Value::Int', () => {
        const input = "class A {\n    f () {\n        const n = parseInt ('4');\n        return n;\n    }\n}";
        const output = transpiler.transpileRust(input).content;
        expect(output).toContain('let mut n: Value = Value::Int(4);');
    });

    test('a decimal string literal folds to Value::Float', () => {
        const input = "class A {\n    f () {\n        const n = parseFloat ('1.5');\n        return n;\n    }\n}";
        const output = transpiler.transpileRust(input).content;
        expect(output).toContain('let mut n: Value = Value::Float(1.5);');
    });

    test('a literal rust cannot parse keeps the native match', () => {
        const input = "class A {\n    f () {\n        const n = parseInt ('x9');\n        return n;\n    }\n}";
        const output = transpiler.transpileRust(input).content;
        expect(output).toContain('.trim().parse::<i64>()');
        expect(output).not.toContain('parseInt(');
    });

    test('a native parse stays native in an argument position', () => {
        const input = "class A {\n    f (x: string) {\n        return this.g (parseInt (x), 2);\n    }\n}";
        const output = transpiler.transpileRust(input).content;
        expect(output).toContain(`return self.g(${nativeInt}, Value::Int(2));`);
    });
});

describe('rust native value predicates and json', () => {
    // `Array.isArray` / `typeof … === '…'` over a declared `Value` place inline
    // the runtime helper's own `matches!`; other operands keep the helper.
    test('Array.isArray on a declared local emits the native match', () => {
        const ts = "function f(response: any) {\n    if (Array.isArray(response)) {\n        return response;\n    }\n}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('if (matches!(&response, Value::Arr(_))) {');
        expect(output).not.toContain('is_array(');
    });

    test('Array.isArray on a declared field emits the native match', () => {
        const ts = "class A {\n    x: any;\n    f() {\n        if (Array.isArray(this.x)) {\n            return 1;\n        }\n    }\n}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('if (matches!(&self.x, Value::Arr(_))) {');
        expect(output).not.toContain('is_array(');
    });

    test('Array.isArray on a call result keeps the helper', () => {
        const ts = "function g(): any { return []; }\nfunction f() {\n    if (Array.isArray(g())) {\n        return 1;\n    }\n}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('is_array(&g())');
        expect(output).not.toContain('matches!(&g()');
    });

    test('typeof string in a condition emits the native match', () => {
        const ts = "function f(code: any) {\n    if (typeof code === 'string') {\n        return code;\n    }\n}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('if matches!(&code, Value::Str(_))');
        expect(output).not.toContain('is_string(');
    });

    test('negated typeof string emits the negated native match', () => {
        const ts = "function f(value: any) {\n    if (typeof value !== 'string') {\n        return 1;\n    }\n}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('if !matches!(&value, Value::Str(_))');
        expect(output).not.toContain('is_string(');
    });

    test('typeof boolean / number / object emit their native matches', () => {
        const ts = "function f(value: any) {\n    if (typeof value === 'boolean') { return 1; }\n    if (typeof value === 'number') { return 2; }\n    if (typeof value === 'object') { return 3; }\n}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('matches!(&value, Value::Bool(_))');
        expect(output).toContain('matches!(&value, Value::Int(_) | Value::Float(_))');
        expect(output).toContain('matches!(&value, Value::Dict(_))');
        expect(output).not.toContain('is_bool(');
        expect(output).not.toContain('is_number(');
        expect(output).not.toContain('is_object(');
    });

    test('typeof string in a Value position boxes the native match', () => {
        const ts = "function f(code: any) {\n    let flag = typeof code === 'string';\n    return flag;\n}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('let mut flag: Value = Value::Bool(matches!(&code, Value::Str(_)));');
    });

    test('typeof string on a call result keeps the helper', () => {
        const ts = "function g(): any { return 1; }\nfunction f() {\n    if (typeof g() === 'string') {\n        return 1;\n    }\n}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('is_string(&g())');
        expect(output).not.toContain('matches!(&g()');
    });

    test('this.json on a local calls the free json_stringify', () => {
        const ts = "class A {\n    id: any;\n    f(params: any) {\n        return this.json(params);\n    }\n}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('return json_stringify(&params);');
        expect(output).not.toContain('self.json(');
    });

    test('this.json drops the argument clone the method signature forced', () => {
        const ts = "class A {\n    id: any;\n    f(query: any) {\n        let body = this.json(query.clone());\n        return body;\n    }\n}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('let mut body: Value = json_stringify(&query);');
        expect(output).not.toContain('query.clone()');
    });

    test('this.json on a self field keeps the method call', () => {
        const ts = "class A {\n    id: any;\n    params: any;\n    f() {\n        return this.json(this.params);\n    }\n}\n";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('self.json(self.params');
        expect(output).not.toContain('json_stringify');
    });
});

describe('rust typed-parameter dict reads', () => {
    const DICT_DECL =
        "interface Dictionary<T> { [key: string]: T; }\n" +
        "type Dict = Dictionary<any>;\n";

    test('dynamic string key on a Dict parameter emits a native read', () => {
        const ts = DICT_DECL +
            "function f (balance: Dict, code: string) {\n" +
            "    return balance[code];\n" +
            "}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain(
            'balance.as_map().and_then(|__m| code.as_str().and_then(|__k| __m.get(__k))).cloned().unwrap_or(Value::Null)');
        expect(output).not.toContain('get_value(&balance');
    });

    test('dynamic Str key (string | undefined) is still a proven string key', () => {
        const ts = DICT_DECL +
            "type Str = string | undefined;\n" +
            "function f (balance: Dict, code: Str) {\n" +
            "    return balance[code];\n" +
            "}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('balance.as_map().and_then(|__m| code.as_str()');
        expect(output).not.toContain('get_value(&balance');
    });

    test('numeric key on a Dict parameter keeps the helper', () => {
        const ts = DICT_DECL +
            "function f (balance: Dict, i: number) {\n" +
            "    return balance[i];\n" +
            "}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('get_value(&balance');
    });

    test('any-typed receiver keeps the dynamic read helper', () => {
        const ts =
            "function f (balance: any, code: string) {\n" +
            "    return balance[code];\n" +
            "}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('get_value(&balance');
    });

    test('a reassigned Dict parameter keeps the helper (D2)', () => {
        const ts = DICT_DECL +
            "function g (): any { return []; }\n" +
            "function f (balance: Dict, code: string) {\n" +
            "    balance = g ();\n" +
            "    return balance[code];\n" +
            "}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('get_value(&balance');
    });

    test('a union alias with undefined proves the dict for a literal key', () => {
        const ts =
            "interface MarketInterface { id: string; }\n" +
            "type Market = MarketInterface | undefined;\n" +
            "function f (market: Market) {\n" +
            "    return market['id'];\n" +
            "}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('market.as_map().and_then(|__m| __m.get("id"))');
        expect(output).not.toContain('get_value(&market');
    });

    test('a union with a non-dict member keeps the helper', () => {
        const ts =
            "interface MarketInterface { id: string; }\n" +
            "type Market = MarketInterface | undefined | number;\n" +
            "function f (market: Market) {\n" +
            "    return market['id'];\n" +
            "}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('get_value_k(&market, \"id\")');
        expect(output).not.toContain('.as_map()');
    });
});

describe('rust native container reads (B-28)', () => {
    // A dynamic (non-literal) index into a checker-proven list reads natively,
    // a declared Dict local produced by `this.client(url)` reads its `url`
    // field natively, and a read the ccxt write passes have to see keeps the
    // helper.

    const DYNAMIC = '.as_array().and_then(|__arr| match &i { Value::Int(__n) => __arr.get(*__n as usize), Value::Str(__s) => __s.parse::<usize>().ok().and_then(|__n| __arr.get(__n)), _ => None }).cloned().unwrap_or(Value::Null)';

    test('a dynamic index into a proven list reads natively', () => {
        const ts =
            'class T {\n' +
            '    m(symbols: string[]) {\n' +
            '        for (let i = 0; i < symbols.length; i++) {\n' +
            '            const symbol = symbols[i];\n' +
            '            return symbol;\n' +
            '        }\n' +
            '    }\n' +
            '}';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain(`let mut symbol: Value = symbols${DYNAMIC};`);
        expect(output).not.toContain('get_value(&symbols, &i)');
    });

    test('a dynamic index into an unproven receiver keeps the helper', () => {
        const ts =
            'class T {\n' +
            '    m(symbols) {\n' +
            '        for (let i = 0; i < symbols.length; i++) {\n' +
            '            const symbol = symbols[i];\n' +
            '            return symbol;\n' +
            '        }\n' +
            '    }\n' +
            '}';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('let mut symbol: Value = get_value(&symbols, &i);');
        expect(output).not.toContain(DYNAMIC);
    });

    test('an index whose local is not a numeric-literal declaration keeps the helper', () => {
        const ts =
            'class T {\n' +
            '    m(symbols: string[], start: number) {\n' +
            '        let i = start;\n' +
            '        while (i < 2) {\n' +
            '            const symbol = symbols[i];\n' +
            '            i = i + 1;\n' +
            '        }\n' +
            '    }\n' +
            '}';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('get_value(&symbols, &i)');
        expect(output).not.toContain(DYNAMIC);
    });

    test('a string key on a proven list keeps the helper', () => {
        const ts =
            'class T {\n' +
            '    m(symbols: string[], key: string) {\n' +
            '        return symbols[key];\n' +
            '    }\n' +
            '}';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('get_value(&symbols, &key)');
    });

    test('a declared Dict local from this.client(url) reads its url natively', () => {
        const ts =
            'class T {\n' +
            '    m(url) {\n' +
            "        const client = this.client(url);\n" +
            '        return client.url;\n' +
            '    }\n' +
            '}';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('client.as_map().and_then(|__m| __m.get("url")).cloned().unwrap_or(Value::Null)');
        expect(output).not.toContain('get_value(&client');
    });

    test('live client fields (subscriptions / futures) keep the helper', () => {
        const ts =
            'class T {\n' +
            '    m(url) {\n' +
            "        const client = this.client(url);\n" +
            "        return client['subscriptions'];\n" +
            '    }\n' +
            '}';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('get_value(&client, &Value::Str("subscriptions".into()))');
        expect(output).not.toContain('__m.get("subscriptions")');
    });

    test('a property write on a client handle keeps the helper (the ccxt pass rewrites it)', () => {
        const ts =
            'class T {\n' +
            '    m(url) {\n' +
            "        const client = this.client(url);\n" +
            '        client.lastPong = 1;\n' +
            '        return client.url;\n' +
            '    }\n' +
            '}';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('client.lastPong = Value::Int(1);');
        expect(output).not.toContain('__m.get("lastPong")).cloned().unwrap_or(Value::Null) =');
    });

    test('an element write through a client field keeps the helper for the base', () => {
        const ts =
            'class T {\n' +
            '    m(url) {\n' +
            "        const client = this.client(url);\n" +
            "        client['subscriptions']['hash'] = 1;\n" +
            '    }\n' +
            '}';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('add_element_to_object(get_value_mut(&mut client, &Value::Str("subscriptions".into())), &Value::Str("hash".into()), Value::Int(1));');
        expect(output).not.toContain('get_value(&client.as_map()');
    });

    test('a Client-typed class outside the ws client path is not a handle', () => {
        const ts =
            'class Client {\n' +
            '    url: any;\n' +
            '}\n' +
            'class T {\n' +
            '    m(client: Client) {\n' +
            '        return client.url;\n' +
            '    }\n' +
            '}';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('client.url');
        expect(output).not.toContain('__m.get("url")');
    });

    test('a Client-typed parameter of the ws Client class is a handle', () => {
        // The fixture lives under a `ws/Client.ts` path, the shape the predicate
        // keys on (the class is the ws client; the port holds it as a Dict).
        const output = transpiler.transpileRustByPath('./tests/files/input/ws/Client.ts').content;
        expect(output).toContain('client.as_map().and_then(|__m| __m.get("url")).cloned().unwrap_or(Value::Null)');
        expect(output).not.toContain('get_value(&client, &Value::Str("url"');
        expect(output).toContain('let mut s: Value = client.subscriptions;');
    });

    test('a bind the next statement mutates keeps the helper (write-back pass)', () => {
        const ts =
            'class T {\n' +
            '    m(data: any[]) {\n' +
            '        for (let i = 0; i < data.length; i++) {\n' +
            '            const entry = data[i];\n' +
            "            entry['page'] = 1;\n" +
            '            return entry;\n' +
            '        }\n' +
            '    }\n' +
            '}';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('let mut entry: Value = get_value(&data, &i);');
        expect(output).not.toContain(DYNAMIC);
    });

    test('a bind whose next statement does not mutate reads natively', () => {
        const ts =
            'class T {\n' +
            '    m(data: any[]) {\n' +
            '        for (let i = 0; i < data.length; i++) {\n' +
            '            const entry = data[i];\n' +
            '            const other = data[i];\n' +
            '            return entry;\n' +
            '        }\n' +
            '    }\n' +
            '}';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('let mut entry: Value = data.as_array().and_then(|__arr| match &i');
        expect(output).not.toContain('let mut entry: Value = get_value(&data, &i);');
    });

});

describe('rust destructure over an array-returning callee', () => {
    // The `handle*AndParams` family (and its exchange overrides) declares
    // `any`, so the checker cannot prove the `[T, Dict]` tuple the body always
    // builds; the resolved callee's returns are the proof instead.
    const ANY_TUPLE_CALLEE =
        "class E {\n" +
        "    handleWithdrawTagAndParams (tag: any, params: any): any {\n" +
        "        return [ tag, params ];\n" +
        "    }\n" +
        "    withdraw (tag: any, params: any) {\n" +
        "        [ tag, params ] = this.handleWithdrawTagAndParams (tag, params);\n" +
        "        return tag;\n" +
        "    }\n" +
        "}";

    test('reassignment destructure over an any-typed tuple callee emits native reads', () => {
        const output = transpiler.transpileRust(ANY_TUPLE_CALLEE).content;
        expect(output).toContain('{ let __destr_tmp = self.handleWithdrawTagAndParams(tag, params); tag = __destr_tmp.as_array()');
        expect(output).not.toContain('get_value(&__destr_tmp');
    });

    test('declaration destructure over an any-typed tuple callee emits native reads', () => {
        const ts =
            "class E {\n" +
            "    prepare (code: any, params: any): any { return [ code, params ]; }\n" +
            "    f (code: any, params: any) {\n" +
            "        const [ request, extraParams ] = this.prepare (code, params);\n" +
            "        return request;\n" +
            "    }\n" +
            "}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('let mut request: Value = requestextraParamsVariable.as_array().and_then(|__arr| __arr.get(0)).cloned().unwrap_or(Value::Null)');
        expect(output).not.toContain('get_value(&requestextraParamsVariable');
    });

    test('a callee delegating to another array-returning method emits native reads', () => {
        const ts =
            "class E {\n" +
            "    inner (a: any, b: any): any { return [ a, b ]; }\n" +
            "    handleX (a: any, b: any): any { return this.inner (a, b); }\n" +
            "    f (a: any, b: any) {\n" +
            "        [ a, b ] = this.handleX (a, b);\n" +
            "        return a;\n" +
            "    }\n" +
            "}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('a = __destr_tmp.as_array().and_then(|__arr| __arr.get(0))');
        expect(output).not.toContain('get_value(&__destr_tmp');
    });

    test('a super-call override emits native reads', () => {
        const ts =
            "class A {\n" +
            "    handleX (a: any, b: any): any { if (a) { return [ a, b ]; } return [ a, b ]; }\n" +
            "}\n" +
            "class B extends A {\n" +
            "    handleX (a: any, b: any): any { return super.handleX (a, b); }\n" +
            "    f (a: any, b: any) {\n" +
            "        [ a, b ] = this.handleX (a, b);\n" +
            "        return a;\n" +
            "    }\n" +
            "}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('a = __destr_tmp.as_array().and_then(|__arr| __arr.get(0))');
        expect(output).not.toContain('get_value(&__destr_tmp');
    });

    test('string split destructure emits native reads (runtime split always yields an array)', () => {
        const ts =
            "function f (addressString: any) {\n" +
            "    let address: any = undefined;\n" +
            "    let rawTag: any = undefined;\n" +
            "    [ address, rawTag ] = addressString.split ('?');\n" +
            "    return address;\n" +
            "}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('{ let __destr_tmp = split(&addressString');
        expect(output).not.toContain('get_value(&__destr_tmp');
    });

    test('a callee returning a non-array keeps the helper', () => {
        const ts =
            "class E {\n" +
            "    handleX (a: any, b: any): any { return a; }\n" +
            "    f (a: any, b: any) {\n" +
            "        [ a, b ] = this.handleX (a, b);\n" +
            "        return a;\n" +
            "    }\n" +
            "}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('a = get_value(&__destr_tmp, &Value::Int(0))');
    });

    test('an unresolved callee keeps the helper', () => {
        const ts = "function f (g: any, a: any, b: any) {\n    [ a, b ] = g ();\n    return a;\n}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('a = get_value(&__destr_tmp, &Value::Int(0))');
    });

    test('a callee that never returns a value keeps the helper', () => {
        const ts =
            "class E {\n" +
            "    handleX (a: any, b: any): any { throw new Error ('x'); }\n" +
            "    f (a: any, b: any) {\n" +
            "        [ a, b ] = this.handleX (a, b);\n" +
            "        return a;\n" +
            "    }\n" +
            "}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('a = get_value(&__destr_tmp, &Value::Int(0))');
    });
});

describe('rust parameter shadows (D-25)', () => {
    const DICT_DECL =
        "interface Dictionary<T> { [key: string]: T; }\n" +
        "type Dict = Dictionary<any>;\n";

    test('a Dict parameter read but never written is shadowed at fn entry', () => {
        const ts = DICT_DECL +
            "class C {\n" +
            "    f (data: Dict): any {\n" +
            "        return data['id'];\n" +
            "    }\n" +
            "}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('let __data_empty = indexmap::IndexMap::new();');
        expect(output).toContain('let data = data.as_map().unwrap_or(&__data_empty);');
        expect(output).toContain('return data.get("id").cloned().unwrap_or(Value::Null);');
        expect(output).not.toContain('get_value(&data');
    });

    test('a dynamic string key reads through the shadow', () => {
        const ts = DICT_DECL +
            "class C {\n" +
            "    f (data: Dict, code: string): any {\n" +
            "        return data[code];\n" +
            "    }\n" +
            "}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('let data = data.as_map().unwrap_or(&__data_empty);');
        expect(output).toContain('code.as_str().and_then(|__k| data.get(__k)).cloned().unwrap_or(Value::Null)');
    });

    test('a `this.safeString` read inlines the coercion over the shadow', () => {
        const ts = DICT_DECL +
            "class C {\n" +
            "    f (data: Dict): any {\n" +
            "        const id = this.safeString (data, 'id');\n" +
            "        return id;\n" +
            "    }\n" +
            "}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('let data = data.as_map().unwrap_or(&__data_empty);');
        expect(output).toContain('match data.get("id") { Some(Value::Str(__s)) if !__s.is_empty() => Value::Str(__s.clone()), Some(Value::Int(__n)) => Value::Str(__n.to_string().into()), Some(Value::Float(__f)) => Value::Str(__f.to_string().into()), _ => Value::Null }');
        expect(output).not.toContain('self.safeString(data');
    });

    test('a `this.safeBool` read keeps its default argument', () => {
        const ts = DICT_DECL +
            "class C {\n" +
            "    f (data: Dict): any {\n" +
            "        const ok = this.safeBool (data, 'ok', false);\n" +
            "        return ok;\n" +
            "    }\n" +
            "}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('match data.get("ok") { Some(Value::Bool(__b)) => Value::Bool(*__b), _ => Value::Bool(false) }');
    });

    test('the `in` operator reads the shadow', () => {
        const ts = DICT_DECL +
            "class C {\n" +
            "    f (data: Dict): any {\n" +
            "        return 'id' in data;\n" +
            "    }\n" +
            "}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('Value::Bool(data.contains_key("id"))');
    });

    test('a List parameter reads length and literal indices natively', () => {
        const ts =
            "class C {\n" +
            "    f (rows: Array<any>): any {\n" +
            "        const n = rows.length;\n" +
            "        return rows[0];\n" +
            "    }\n" +
            "}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('let __rows_empty = Vec::new();');
        expect(output).toContain('let rows = rows.as_array().unwrap_or(&__rows_empty);');
        expect(output).toContain('let mut n: Value = Value::Int(rows.len() as i64);');
        expect(output).toContain('return rows.get(0).cloned().unwrap_or(Value::Null);');
    });

    test('returning the parameter keeps the box (D2/census)', () => {
        const ts = DICT_DECL +
            "class C {\n" +
            "    f (data: Dict): any {\n" +
            "        const id = data['id'];\n" +
            "        return data;\n" +
            "    }\n" +
            "}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).not.toContain('__data_empty');
        expect(output).toContain('data.as_map().and_then(|__m| __m.get("id")).cloned().unwrap_or(Value::Null)');
    });

    test('a written key keeps the box', () => {
        const ts = DICT_DECL +
            "class C {\n" +
            "    f (data: Dict): any {\n" +
            "        data['id'] = 1;\n" +
            "        return data['id'];\n" +
            "    }\n" +
            "}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).not.toContain('__data_empty');
        // the boxed write is D-31's native insert on the (unshadowed) Value
        expect(output).toContain('if let Value::Dict(__d) = &mut data { std::sync::Arc::make_mut(__d).insert("id".into(), Value::Int(1)); };');
    });

    test('passing the parameter to another method keeps the box', () => {
        const ts = DICT_DECL +
            "class C {\n" +
            "    f (data: Dict): any {\n" +
            "        const id = data['id'];\n" +
            "        return this.other (data);\n" +
            "    }\n" +
            "    other (d: Dict): any { return d; }\n" +
            "}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).not.toContain('__data_empty');
    });

    test('a marker-route key name keeps the box', () => {
        const ts = DICT_DECL +
            "class C {\n" +
            "    f (data: Dict): any {\n" +
            "        return data['subscriptions'];\n" +
            "    }\n" +
            "}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).not.toContain('__data_empty');
        expect(output).toContain('data.as_map().and_then(|__m| __m.get("subscriptions"))');
    });
});

describe('rust native Option<String> returns for `: Str` methods', () => {
    // An internal, non-override, non-async method declared `: Str` returns a
    // native `Option<String>` when every `return` in its own body converts
    // (`X.as_str().map(str::to_owned)`, or `None` for a nullish literal); a
    // call site that still needs a `Value` boxes the result back with the exact
    // inverse, and a local whose uses are all native sinks binds the
    // `Option<String>` directly.
    const HEAD = "type Str = string | undefined;\n";

    test('a proven `: Str` method returns Option<String> with the conversion', () => {
        const ts = HEAD + "class E {\n    parseStatus (status: any): Str {\n        return 'open';\n    }\n}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('pub fn parseStatus(&self, status: Value) -> Option<String>');
        expect(output).toContain('return Value::Str("open".into()).as_str().map(str::to_owned);');
    });

    test('a nullish return becomes the None arm', () => {
        const ts = HEAD +
            "class E {\n    parseStatus (status: any): Str {\n" +
            "        if (status === undefined) { return undefined; }\n" +
            "        return 'open';\n    }\n}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('pub fn parseStatus(&self, status: Value) -> Option<String>');
        expect(output).toContain('return None;');
    });

    test('a body whose last statement is not a return keeps -> Value', () => {
        const ts = HEAD +
            "class E {\n    parseStatus (status: any): Str {\n" +
            "        if (status === undefined) { return undefined; }\n    }\n}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('pub fn parseStatus(&self, status: Value) -> Value');
        expect(output).not.toContain('Option<String>');
    });

    test('a return the checker cannot prove is a string keeps -> Value', () => {
        const ts = HEAD +
            "class E {\n    parseStatus (status: any): Str {\n" +
            "        return this.safeValue (status);\n    }\n}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('pub fn parseStatus(&self, status: Value) -> Value');
        expect(output).not.toContain('Option<String>');
    });

    test('an override keeps the boxed signature', () => {
        const ts = HEAD +
            "class A {\n    parseStatus (status: any): Str { return 'x'; }\n}\n" +
            "class E extends A {\n    override parseStatus (status: any): Str { return 'y'; }\n}";
        const output = transpiler.transpileRust(ts).content;
        const overridden = output.split('class E')[1] ?? output;
        expect(output).toContain('pub fn parseStatus(&self, status: Value) -> Option<String>');
        expect(output.match(/pub fn parseStatus\(&self, status: Value\) -> Value \{/g)?.length).toBe(1);
        expect(overridden.length).toBeGreaterThan(0);
    });

    test('a Value-position call site boxes the native return back', () => {
        const ts = HEAD +
            "class E {\n    parseStatus (status: any): Str { return 'open'; }\n" +
            "    f (status: any) {\n        const m: any = {};\n" +
            "        m['status'] = this.parseStatus (status);\n        return m;\n    }\n}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('.insert("status".into(), self.parseStatus(status).map(|__s| Value::Str(__s.into())).unwrap_or(Value::Null));');
    });

    test('an assignment of a native return boxes', () => {
        const ts = HEAD +
            "class E {\n    parseStatus (status: any): Str { return 'open'; }\n" +
            "    f (status: any) {\n        let x: any = undefined;\n" +
            "        x = this.parseStatus (status);\n        return x;\n    }\n}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('x = self.parseStatus(status).map(|__s| Value::Str(__s.into())).unwrap_or(Value::Null);');
    });

    test('a declaration whose uses are not all native sinks stays a Value box', () => {
        const ts = HEAD +
            "class E {\n    parseStatus (status: any): Str { return 'open'; }\n" +
            "    f (status: any) {\n        const x = this.parseStatus (status);\n" +
            "        const m: any = {};\n        m['status'] = x;\n        return m;\n    }\n}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('let mut x: Value = self.parseStatus(status).map(|__s| Value::Str(__s.into())).unwrap_or(Value::Null);');
    });

    test('a caller whose uses are all native sinks binds Option<String>', () => {
        const ts = HEAD +
            "class E {\n    parseStatus (status: any): Str { return 'open'; }\n" +
            "    f (status: any) {\n        const x = this.parseStatus (status);\n" +
            "        if (x === undefined) { return 'a'; }\n" +
            "        if (x === 'open') { return 'b'; }\n        return 'c';\n    }\n}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('let mut x: Option<String> = self.parseStatus(status);');
        expect(output).not.toContain('let mut x: Value = self.parseStatus(status)');
    });
});

describe('rust typed-receiver native reads (D-28)', () => {
    // A dynamic-key read on a checker-proven map local (not only on an
    // annotated parameter) reads natively, and a local/parameter read stays
    // native inside the args of a `&mut self` call while a `this`-field read
    // there keeps the helper the ccxt hoist pass needs.

    const PLAIN = 'interface Plain { [key: string]: any; }\n';

    test('a dynamic-key read on a checker-proven map local reads natively', () => {
        const ts =
            PLAIN +
            'class T {\n' +
            '    m(code: string) {\n' +
            '        const currencies: Plain = {};\n' +
            '        return currencies[code];\n' +
            '    }\n' +
            '}';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('currencies.as_map().and_then(|__m| code.as_str().and_then(|__k| __m.get(__k))).cloned().unwrap_or(Value::Null)');
        expect(output).not.toContain('get_value(&currencies, &code)');
    });

    test('an any-typed local keeps the helper', () => {
        const ts =
            'class T {\n' +
            '    g(): any { return []; }\n' +
            '    m(code: string) {\n' +
            '        const currencies: any = this.g ();\n' +
            '        return currencies[code];\n' +
            '    }\n' +
            '}';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('get_value(&currencies, &code)');
        expect(output).not.toContain('currencies.as_map()');
    });

    test('a re-assigned local keeps the helper (D2)', () => {
        const ts =
            PLAIN +
            'class T {\n' +
            '    g(): any { return []; }\n' +
            '    m(code: string) {\n' +
            '        let currencies: Plain = {};\n' +
            '        currencies = this.g ();\n' +
            '        return currencies[code];\n' +
            '    }\n' +
            '}';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('get_value(&currencies, &code)');
    });

    test('a bind the next statement mutates keeps the helper (write-back pass)', () => {
        const ts =
            PLAIN +
            'class T {\n' +
            '    m(key: string, vs: number[]) {\n' +
            '        const result: Plain = {};\n' +
            '        result[key] = [];\n' +
            '        for (let i = 0; i < vs.length; i++) {\n' +
            '            const row = result[key];\n' +
            '            row.push(vs[i]);\n' +
            '        }\n' +
            '        return result;\n' +
            '    }\n' +
            '}';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('let mut row: Value = get_value(&result, &key);');
        expect(output).not.toContain('row.as_map()');
    });

    test('a local read inside a &mut self call reads natively', () => {
        const ts =
            PLAIN +
            'class T {\n' +
            '    m(key: string, items: string[]) {\n' +
            '        const dict: Plain = {};\n' +
            '        return this.extend(dict, { "a": dict[key], "b": items[0] });\n' +
            '    }\n' +
            '    extend(a: any, b: any) { return a; }\n' +
            '}';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('dict.as_map().and_then(|__m| key.as_str().and_then(|__k| __m.get(__k))).cloned().unwrap_or(Value::Null)');
        // the List parameter is shadowed (D-25), so the index reads on the borrowed slice
        expect(output).toContain('items.get(0).cloned().unwrap_or(Value::Null)');
        expect(output).not.toContain('get_value(&dict, &key)');
    });

    test('a self-field read inside a &mut self call keeps the helper', () => {
        const ts =
            PLAIN +
            'class T {\n' +
            '    dict: Plain;\n' +
            '    m(key: string) {\n' +
            '        return this.extend(this.dict, { "a": this.dict[key] });\n' +
            '    }\n' +
            '    extend(a: any, b: any) { return a; }\n' +
            '}';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('get_value(&self.dict, &key)');
        expect(output).not.toContain('self.dict.as_map()');
    });
});

describe('rust pro-tier handler message shadow (D-27)', () => {
    // `Client` is a class in the pro tier (base/ws/Client.ts); the shadow is
    // scoped to the `handle_x (client: Client, message: Dict)` shape.
    // A parameter whose every use is a read gets the D-25 borrowed shadow instead;
    // the handler view fires when the message is also passed on (a move the D-25
    // census rejects), so these fixtures forward the frame to the client.
    const DECLS =
        "interface Dictionary<T> { [key: string]: T; }\n" +
        "type Dict = Dictionary<any>;\n" +
        "class Client { resolve (v: any): void {} }\n";
    const SHADOW = 'let __pro_message: &indexmap::IndexMap<String, Value> = &__pro_message_arc;';

    test('a safeString read on the handler message param prints as a native .get match', () => {
        const ts = DECLS +
            "class T {\n" +
            "    handleTicker (client: Client, message: Dict): void {\n" +
            "        const channel = this.safeString (message, 'channel');\n" +
            "        client.resolve (channel);\n" +
            "        client.resolve (message);\n" +
            "    }\n" +
            "}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain(SHADOW);
        expect(output).toContain('(match __pro_message.get("channel").cloned() { Some(Value::Str(__s)) if !__s.is_empty() => Value::Str(__s),');
        expect(output).not.toContain('self.safeString(message, Value::Str("channel"');
    });

    test('value/dict/list/bool reads print the helper value kinds natively', () => {
        const ts = DECLS +
            "class T {\n" +
            "    handleTicker (client: Client, message: Dict): void {\n" +
            "        const v = this.safeValue (message, 'any');\n" +
            "        const d = this.safeDict (message, 'payload');\n" +
            "        const l = this.safeList (message, 'data', []);\n" +
            "        const b = this.safeBool (message, 'ok', false);\n" +
            "        client.resolve (v); client.resolve (d); client.resolve (l); client.resolve (b);\n" +
            "        client.resolve (message);\n" +
            "    }\n" +
            "}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('(match __pro_message.get("any").cloned() { Some(Value::Str(__s)) if __s.is_empty() => Value::Null, Some(__v) => __v, None => Value::Null })');
        expect(output).toContain('(match __pro_message.get("payload").cloned() { Some(__v) if matches!(__v, Value::Dict(_)) => __v, _ => Value::Null })');
        expect(output).toContain('(match __pro_message.get("data").cloned() { Some(__v) if matches!(__v, Value::Arr(_)) => __v, _ => Value::from(vec![]) })');
        expect(output).toContain('(match __pro_message.get("ok").cloned() { Some(__v) if matches!(__v, Value::Bool(_)) => __v, _ => Value::Bool(false) })');
    });

    test('the integer and float coercions mirror the runtime helper', () => {
        const ts = DECLS +
            "class T {\n" +
            "    handleTicker (client: Client, message: Dict): void {\n" +
            "        const n = this.safeInteger (message, 'count');\n" +
            "        const f = this.safeNumber (message, 'px');\n" +
            "        client.resolve (n); client.resolve (f);\n" +
            "        client.resolve (message);\n" +
            "    }\n" +
            "}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('Some(Value::Int(__n)) => Value::Int(__n), Some(Value::Float(__f)) => Value::Int(__f as i64), Some(Value::Str(__s)) if !__s.is_empty() => match __s.parse::<i64>()');
        expect(output).toContain('Some(Value::Float(__f)) => Value::Float(__f), Some(Value::Int(__n)) => Value::Float(__n as f64), Some(Value::Str(__s)) if !__s.is_empty() => match __s.parse::<f64>()');
    });

    test('a book-store key keeps the helper (marker routes cannot be proven away)', () => {
        const ts = DECLS +
            "class T {\n" +
            "    handleTicker (client: Client, message: Dict): void {\n" +
            "        const symbol = this.safeString (message, 'symbol');\n" +
            "        client.resolve (symbol);\n" +
            "    }\n" +
            "}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('self.safeString(message, Value::Str("symbol"');
        expect(output).not.toContain('__pro_message');
    });

    test('a non-handler method with a Dict param keeps the helper (scope is the pro tier)', () => {
        const ts = DECLS +
            "class T {\n" +
            "    parseWsTicker (message: Dict): void {\n" +
            "        const channel = this.safeString (message, 'channel');\n" +
            "        console.log (channel);\n" +
            "    }\n" +
            "}";
        const output = transpiler.transpileRust(ts).content;
        // read-only Dict param: the D-25 shadow prints the read, never the handler view
        expect(output).toContain('let message = message.as_map().unwrap_or(&__message_empty);');
        expect(output).not.toContain('__pro_message');
    });

    test('a written message param keeps the helper (D2)', () => {
        const ts = DECLS +
            "class T {\n" +
            "    handleTrade (client: Client, message: Dict): void {\n" +
            "        message['k'] = 1;\n" +
            "        const channel = this.safeString (message, 'channel');\n" +
            "        client.resolve (channel);\n" +
            "    }\n" +
            "}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('self.safeString(message, Value::Str("channel"');
        expect(output).not.toContain('__pro_message');
    });

    test('a merge onto the message param keeps the helper (D2)', () => {
        const ts = DECLS +
            "class T {\n" +
            "    handleTrade (client: Client, message: Dict): void {\n" +
            "        const merged = this.deepExtend (message, { 'a': 1 });\n" +
            "        const channel = this.safeString (message, 'channel');\n" +
            "        client.resolve (merged); client.resolve (channel);\n" +
            "    }\n" +
            "}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).not.toContain('__pro_message');
    });

    test('other uses of the param print unchanged next to the shadow', () => {
        const ts = DECLS +
            "class T {\n" +
            "    parseWsTrade (m: Dict, market: any): void { console.log (m, market); }\n" +
            "    handleTicker (client: Client, message: Dict): void {\n" +
            "        const channel = this.safeString (message, 'channel');\n" +
            "        this.parseWsTrade (message, undefined);\n" +
            "        client.resolve (channel);\n" +
            "    }\n" +
            "}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain(SHADOW);
        expect(output).toContain('self.parseWsTrade(message, Value::Null);');
    });

    test('an unproven (any) message param keeps everything boxed', () => {
        const ts =
            "class Client { resolve (v: any): void {} }\n" +
            "class T {\n" +
            "    handleTicker (client: Client, message: any): void {\n" +
            "        const channel = this.safeString (message, 'channel');\n" +
            "        client.resolve (channel);\n" +
            "    }\n" +
            "}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).not.toContain('__pro_message');
    });

    test('no nativizable read emits no shadow (no dead binding)', () => {
        const ts = DECLS +
            "class T {\n" +
            "    handleSmall (client: Client, message: Dict): void {\n" +
            "        client.resolve (message);\n" +
            "    }\n" +
            "}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).not.toContain('__pro_message');
    });
});

describe('rust order book sides keep the runtime helpers', () => {
    // A live WS book keeps bids/asks as side markers whose levels sit in the
    // side store; the checker's array type must not switch them to native
    // `.len()` / `.as_array()` reads, which only see the marker dict.
    test('bids of an OrderBook read through get_array_length and get_value', () => {
        const ts =
            'interface OrderBook { bids: [number, number][]; asks: [number, number][]; }\n' +
            'class T {\n' +
            '    m(orderbook: OrderBook) {\n' +
            '        const bids = orderbook[\'bids\'];\n' +
            '        const bidsLength = bids.length;\n' +
            '        const first = bids[0];\n' +
            '        for (let i = 0; i < bidsLength; i++) {\n' +
            '            const row = bids[i];\n' +
            '        }\n' +
            '        return first;\n' +
            '    }\n' +
            '}';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('get_array_length(&bids)');
        expect(output).toContain('get_value(&bids, &Value::Int(0))');
        expect(output).toContain('get_value(&bids, &i)');
        expect(output).not.toContain('bids.len()');
        expect(output).not.toContain('bids.as_array()');
    });
});

describe('hx4 R01 native element writes on plain-dict locals', () => {
    const insert = (receiver: string, key: string, value: string) =>
        `if let Value::Dict(__d) = &mut ${receiver} { std::sync::Arc::make_mut(__d).insert("${key}".into(), ${value}); }`;
    let output = '';
    beforeAll(() => {
        output = transpiler.transpileRustByPath('./tests/files/input/hx4r01/ts/src/venue.ts').content;
    });

    test('a base-tier account () builder local inserts natively (sibling-block bindings)', () => {
        expect(output).toContain(insert('account', 'free', 'Value::Str("1".into())'));
        expect(output).toContain(insert('account', 'used', 'Value::Str("0".into())'));
        expect(output).not.toContain('add_element_to_object(&mut account');
    });

    test('an undefined-initialised local reassigned only to literals inserts natively', () => {
        expect(output).toContain(insert('headers', 'Content-Type', 'Value::Str("application/json".into())'));
    });

    test('element 0 of handleUntilOption on a plain request inserts natively', () => {
        expect(output).toContain(insert('requestUntil', 'interval', 'Value::Str("1m".into())'));
    });

    test('a parse* result, a non-plain reassignment and a closure write keep the helper', () => {
        expect(output).toContain('add_element_to_object(&mut order, &Value::Str("status".into())');
        expect(output).toContain('add_element_to_object(&mut mixed, &Value::Str("k".into())');
        expect(output).toContain('add_element_to_object(&mut captured, &Value::Str("free".into())');
    });

    test('omit of itself / extend of plain dicts keep the local plain', () => {
        expect(output).toContain(insert('request', 'b', 'Value::Int(2)'));
        expect(output).toContain(insert('merged', 'd', 'Value::Int(4)'));
    });

    test('a local aliased into a let-bound literal keeps the helper', () => {
        expect(output).toContain('add_element_to_object(&mut aliased, &Value::Str("Content-Type".into())');
    });

    test('element 0 of a same-file tuple method returning a fresh literal inserts natively', () => {
        expect(output).toContain(insert('request', 'settle', 'Value::Str("usdt".into())'));
        expect(output).toContain('add_element_to_object(&mut echoed, &Value::Str("x".into())');
    });

    test('omit / extend of a foreign dict keep the helper', () => {
        expect(output).toContain('add_element_to_object(&mut foreign, &Value::Str("e".into())');
        expect(output).toContain('add_element_to_object(&mut extended, &Value::Str("f".into())');
    });
});

describe('rust this-field dynamic dict reads (hx4 R02)', () => {
    const DECL = 'interface Dictionary<T> { [key: string]: T; }\ntype Dict = Dictionary<any>;\nclass C { x: number; }\n';

    test('a dynamic string key on a Dict-declared field reads natively', () => {
        const ts = DECL + 'class A {\n    balance: Dict = {};\n    f (code: string) {\n        const a = this.balance[code];\n        return a;\n    }\n}\n';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('let mut a: Value = self.balance.as_map().and_then(|__m| code.as_str().and_then(|__k| __m.get(__k))).cloned().unwrap_or(Value::Null);');
        expect(output).not.toContain('get_value(&self.balance');
    });

    test('a nested read on a Dictionary<Dictionary<T>> field reads natively at both levels', () => {
        const ts = DECL + 'class A {\n    ohlcvs: Dictionary<Dictionary<C>>;\n    f (symbol: string, tf: string) {\n        const a = this.ohlcvs[symbol][tf];\n        return a;\n    }\n}\n';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('self.ohlcvs.as_map().and_then(|__m| symbol.as_str().and_then(|__k| __m.get(__k))).cloned().unwrap_or(Value::Null).as_map().and_then(|__m| tf.as_str().and_then(|__k| __m.get(__k))).cloned().unwrap_or(Value::Null)');
        expect(output).not.toContain('get_value(');
    });

    test('an any-declared field keeps the helper', () => {
        const ts = DECL + 'class A {\n    positions: any;\n    f (code: string) {\n        return this.positions[code];\n    }\n}\n';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('get_value(&self.positions, &code)');
    });

    test('a numeric key and write targets keep the helper', () => {
        const ts = DECL + 'class A {\n    balance: Dict = {};\n    f (code: string, n: number) {\n        this.balance[code] = this.g (this.balance[code]);\n        delete this.balance[code];\n        return this.balance[n];\n    }\n    g (x) { return x; }\n}\n';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('get_value(&self.balance, &n)');
        expect(output).toContain('self.g(get_value(&self.balance, &code))');
        expect(output).not.toContain('self.balance.as_map()');
    });
});

describe('hx4 R04: native Vec push on typed array locals', () => {
    const wrap = (body: string) => `class T {\n    parseX (x) { return x; }\n    filterBy (a, b) { return a; }\n    f (items: any[]) {\n${body}\n    }\n}`;
    test('push-only local returned is a Vec<Value> with native push', () => {
        const out = transpiler.transpileRust(wrap('        const result = [];\n        result.push (items[0]);\n        result.push (this.parseX (1));\n        return result;')).content;
        expect(out).toContain('let mut result: Vec<Value> = Vec::new();');
        expect(out).toContain('result.push(self.parseX(Value::Int(1)));');
        expect(out).toContain('return Value::from(result);');
        expect(out).not.toContain('append_to_array');
    });
    test('length read and this-call argument in a return box once', () => {
        const out = transpiler.transpileRust(wrap('        const result = [];\n        const item = items[0];\n        result.push (item);\n        const n = result.length;\n        return this.filterBy (result, n);')).content;
        expect(out).toContain('result.push(item.clone());');
        expect(out).toContain('Value::Int(result.len() as i64)');
        expect(out).toContain('return self.filterBy(Value::from(result), n);');
    });
    test('final-use argument / object value outside a loop box once', () => {
        const out = transpiler.transpileRust(wrap('        const args = [];\n        args.push (items[0]);\n        const request = { \'args\': args };\n        return this.parseX (request);')).content;
        expect(out).toContain('let mut args: Vec<Value> = Vec::new();');
        expect(out).toContain('Value::from(args)');
        const out2 = transpiler.transpileRust(wrap('        const hashes = [];\n        hashes.push (1);\n        const r = this.filterBy (hashes, 1);\n        return r;')).content;
        expect(out2).toContain('self.filterBy(Value::from(hashes), Value::Int(1))');
    });
    test('negative: alias, non-return argument, element read or non-empty init keep the box', () => {
        for (const body of [
            '        const out = [];\n        out.push (1);\n        const other = out;\n        return other;',
            '        const out = [];\n        for (let i = 0; i < 2; i++) {\n            out.push (i);\n            this.parseX (out);\n        }\n        return 1;',
            '        const out = [];\n        out.push (1);\n        return this.filterBy (out, out);',
            '        const out = [ 1 ];\n        out.push (2);\n        return out;',
            '        const out = [];\n        out.push (out.length);\n        return out;',
            '        let out = [];\n        out.push (1);\n        out = [];\n        return out;',
        ]) {
            const out = transpiler.transpileRust(wrap(body)).content;
            // the box stays (hx4 R18 may spell its Arr push natively)
            expect(out).toMatch(/append_to_array\(&mut out|if let Value::Arr\(__a\) = &mut out \{/);
            expect(out).not.toContain('Vec<Value>');
        }
    });
});

describe('hx4 R05 native IndexMap ops on proven dict receivers', () => {
    let rest = '';
    let ws = '';
    beforeAll(() => {
        rest = transpiler.transpileRustByPath('./tests/files/input/hx4r05/ts/src/venue.ts').content;
        ws = transpiler.transpileRustByPath('./tests/files/input/hx4r05/ts/src/pro/venue.ts').content;
    });

    test('k in this.<dict field> reads contains_key', () => {
        expect(rest).toContain('matches!((&self.balance, &code), (Value::Dict(__d), Value::Str(__k)) if __d.contains_key(__k.as_ref()))');
        expect(ws).toContain('matches!((&self.orderbooks, &symbol), (Value::Dict(__d), Value::Str(__k)) if __d.contains_key(__k.as_ref()))');
    });

    test('delete on a dict field / literal-built local is shift_remove', () => {
        expect(rest).toContain('if let (Value::Dict(__d), Value::Str(__k)) = (&mut self.balance, &code) { std::sync::Arc::make_mut(__d).shift_remove(__k.as_ref()); }');
        expect(rest).toContain('if let Value::Dict(__d) = &mut request { std::sync::Arc::make_mut(__d).shift_remove("a"); }');
        expect(ws).toContain('if let Value::Dict(__d) = &mut plain { std::sync::Arc::make_mut(__d).shift_remove("k"); }');
    });

    test('Object.keys / Object.values on REST dicts and untagged fields are native', () => {
        expect(rest).toContain('Value::Array(query.as_map().map(|__m| __m.keys().map(|__k| Value::Str(__k.clone().into())).collect()).unwrap_or_default())');
        expect(rest).toContain('Value::Array(self.tickers.as_map().map(|__m| __m.values().cloned().collect()).unwrap_or_default())');
        expect(ws).toContain('Value::Array(self.orderbooks.as_map().map(|__m| __m.keys()');
    });

    test('any receivers, ws subscriptions and non-dict operands keep the helpers', () => {
        expect(rest).toContain('remove(&mut response, &Value::Str("x".into()))');
        expect(rest).toContain('in_op(&response, &code)');
        expect(rest).toContain('object_keys(&flag)');
        expect(ws).toContain('in_op(&client.subscriptions, &messageHash)');
        expect(ws).toContain('remove(&mut client.subscriptions, &messageHash)');
        expect(ws).toContain('remove(&mut subs, &messageHash)');
        expect(ws).toContain('remove(&mut subscription, &symbol)');
    });
});

describe('hx4 R06 native string methods on proven strings', () => {
    const m = (body: string, params = 'a: string') => `class A {\n    run(${params}) {\n${body}\n    }\n}`;
    const out = (body: string, params?: string) => transpiler.transpileRust(m(body, params)).content;

    test('toUpperCase / toLowerCase', () => {
        const o = out("        const u = a.toUpperCase();\n        const l = a.toLowerCase();\n        return [u, l];");
        expect(o).toContain('let mut u: Value = a.as_str().map(|__s| Value::Str(__s.to_uppercase().into())).unwrap_or(Value::Null);');
        expect(o).toContain('let mut l: Value = a.as_str().map(|__s| Value::Str(__s.to_lowercase().into())).unwrap_or(Value::Null);');
        expect(o).not.toContain('to_upper(&');
    });
    test('split with a literal separator', () => {
        expect(out("        return a.split('-');")).toContain('return Value::Array(a.as_str().map(|__s| __s.split("-").map(|__p| Value::Str(__p.to_string().into())).collect()).unwrap_or_default());');
    });
    test('replace keeps the receiver for a non-string box', () => {
        expect(out("        return a.replace('x', 'y');")).toContain('return a.as_str().map(|__s| Value::Str(__s.replace("x", "y").into())).unwrap_or_else(|| a.clone());');
    });
    test('padStart with a one-char pad', () => {
        expect(out("        return a.padStart(64, '0');")).toContain('return a.as_str().map(|__s| Value::Str(format!("{:0>64}", __s).into())).unwrap_or(Value::Null);');
        expect(out("        return a.padStart(8, '00');")).toContain('pad_start(&a,');
    });
    test('startsWith / endsWith in a condition', () => {
        const o = out("        if (a.startsWith('0x') || a.endsWith('%')) {\n            return 1;\n        }\n        return 0;");
        expect(o).toContain('a.as_str().is_some_and(|__s| __s.starts_with("0x"))');
        expect(o).toContain('a.as_str().is_some_and(|__s| __s.ends_with("%"))');
        expect(o).not.toContain('starts_with(&a');
    });
    test('indexOf with a proven-string identifier needle', () => {
        expect(out('        return a.indexOf(b);', 'a: string, b: string')).toContain('Value::Int(a.as_str().zip(b.as_str()).and_then(|(__s, __n)| __s.find(__n)).map(|__i| __i as i64).unwrap_or(-1))');
    });
    test('join on a string[]', () => {
        expect(out("        return xs.join(',');", 'xs: string[]')).toContain('Value::Str(xs.as_array().map(|__a| __a.iter().map(|__v| __v.to_string()).collect::<Vec<String>>().join(",")).unwrap_or_default().into())');
    });
    test('unproven receivers keep the helpers', () => {
        const o = out("        const u = a.toUpperCase();\n        const p = a.split(',');\n        const j = xs.join(',');\n        const r = a.replace('x', 'y');\n        return [u, p, j, r, a.startsWith('x')];", 'a: any, xs: any[]');
        expect(o).toContain('(match &(a) { Value::Str(__s) => Value::Str(__s.to_uppercase().into())');
        expect(o).toContain('split(&a, &Value::Str(",".into()))');
        expect(o).toContain('join(&xs, &Value::Str(",".into()))');
        expect(o).toContain('replace_str(&a,');
        expect(o).toContain('starts_with(&a,');
    });
    test('non-literal operands keep the helpers', () => {
        const o = out("        return [a.split(s), a.startsWith(s), a.replace(s, 'y')];", 'a: string, s: string');
        // hx4 R13: a string-variable split delimiter / replace pattern goes native
        expect(o).toContain('a.as_str().zip(s.as_str()).map(|(__s, __d)| __s.split(__d)');
        // hx4 R17: a string-variable affix goes native too
        expect(o).toContain('a.as_str().zip(s.as_str()).is_some_and(|(__s, __p)| __s.starts_with(__p))');
        expect(o).toContain('a.as_str().zip(s.as_str()).map(|(__s, __p)| Value::Str(__s.replace(__p, \"y\").into()))');
    });
});

// hx4 R07 — numeric/string helpers go native on checker-proven operands
describe('rust R07 native numeric/string helpers', () => {
    const rust = (ts: string) => transpiler.transpileRust(ts).content;
    test('number toString prints Display format', () => {
        const out = rust('function f(n: number) { const r = n.toString(); return r; }');
        expect(out).toContain('Value::Str(format!("{}", n).into())');
        expect(out).not.toContain('to_string_val(');
    });
    test('string toString prints Display format', () => {
        const out = rust('function f(s: string) { const r = s.toString(); return r; }');
        expect(out).toContain('Value::Str(format!("{}", s).into())');
    });
    test('any toString keeps the helper', () => {
        expect(rust('function f(n: any) { const r = n.toString(); return r; }')).toContain('to_string_val(&n)');
    });
    test('Math.floor/round/ceil of a number go native', () => {
        const out = rust('function f(n: number) { const a = Math.floor(n); const b = Math.round(n); const c = Math.ceil(n); return [a, b, c]; }');
        expect(out).toContain('(n).as_f64().map(|__x| Value::Float(__x.floor())).unwrap_or(Value::Null)');
        expect(out).toContain('__x.round()');
        expect(out).toContain('__x.ceil()');
        expect(out).not.toMatch(/math_(floor|round|ceil)\(/);
    });
    test('Math.floor of any keeps the helper', () => {
        expect(rust('function f(n: any) { return Math.floor(n); }')).toContain('math_floor(&n)');
    });
    test('negate of a number goes native', () => {
        const out = rust('function f(n: number) { const x = -n; return x; }');
        expect(out).toContain('(match &(n) { Value::Int(x) => Value::Int(-x), Value::Float(x) => Value::Float(-x), _ => Value::Null })');
        expect(out).not.toContain('negate(');
    });
    test('negate of any keeps the helper', () => {
        expect(rust('function f(n: any) { return -n; }')).toContain('negate(&n)');
    });
    test('number % number goes native with zero guards', () => {
        const out = rust('function f(a: number, b: number) { return a % b; }');
        expect(out).toContain('(Value::Int(x), Value::Int(y)) if *y != 0 => Value::Int(x % y)');
        expect(out).not.toContain('mod_val(');
    });
    test('any % number keeps the helper', () => {
        expect(rust('function f(a: any, b: number) { return a % b; }')).toContain('mod_val(&a, &b)');
    });
});

describe('hx4 R09 rust typed-operand is_equal/add/subtract', () => {
    const r09 = (code: string) => transpiler.transpileRust(code).content;

    test('string + number and Str + number', () => {
        const out = r09('function f (n: number, s: string, t: string | undefined) {\n    const a = s + n;\n    const b = t + n;\n    return [ a, b ];\n}\n');
        expect(out).toContain('let mut a: Value = Value::Str(format!("{}{}", s, n).into());');
        expect(out).toContain('add(&t, &n)');
    });

    test('number + any keeps the helper', () => {
        const out = r09('function f (n: number, s: string, x: any) {\n    const a = s + x;\n    const b = x + n;\n    return [ a, b ];\n}\n');
        expect(out).toContain('add(&s, &x)');
        expect(out).toContain('add(&x, &n)');
    });

    test('.length on an any receiver minus/plus a number goes native', () => {
        const out = r09('function f (x: any, n: number) {\n    const a = x.length - 1;\n    const b = x.length + n;\n    return [ a, b ];\n}\n');
        expect(out).not.toContain('subtract(');
        expect(out).not.toContain('add(');
        expect(out).toContain('(match (&(get_array_length(&x)), &(Value::Int(1))) { (Value::Int(x), Value::Int(y)) => Value::Int(x - y)');
    });

    test('const length local of an any receiver compares natively', () => {
        const out = r09('function f (x: any, y: any) {\n    const length = x.length;\n    const other = y.length;\n    if (length === 0) {\n        return 1;\n    }\n    if (length === other) {\n        return 2;\n    }\n    return 3;\n}\n');
        expect(out).toContain('if (length.as_f64() == Some(0.0))');
        expect(out).toContain('if (length.as_f64() == other.as_f64())');
        expect(out).not.toContain('is_equal(');
    });

    test('let length local, and any vs const length, keep the helpers', () => {
        const out = r09('function f (x: any, y: any) {\n    let length = x.length;\n    length = y;\n    const l2 = x.length;\n    if (length === 0) {\n        return 1;\n    }\n    if (l2 === y) {\n        return 2;\n    }\n    return l2 - y;\n}\n');
        expect(out).toContain('is_equal(&length, &Value::Int(0))');
        expect(out).toContain('is_equal(&l2, &y)');
        expect(out).toContain('(match (&(l2), &(y)) {'); // hx4 R25
    });
});

describe('hx4 R10 native reads on plain-dict locals and Dict parameters', () => {
    const dyn = (receiver: string, key: string) =>
        `${receiver}.as_map().and_then(|__m| ${key}.as_str().and_then(|__k| __m.get(__k))).cloned().unwrap_or(Value::Null)`;
    let output = '';
    beforeAll(() => {
        output = transpiler.transpileRustByPath('./tests/files/input/hx4r10/ts/src/venue.ts').content;
    });

    test('a Dict parameter read with an any-typed key reads natively', () => {
        expect(output).toContain(`let mut value: Value = ${dyn('params', 'key')};`);
        expect(output).not.toContain('get_value(&params, &key);\n            out');
    });

    test('a literal-built local and an account () local read an untyped key natively', () => {
        expect(output).toContain(`let mut viaCode: Value = ${dyn('result', 'code')};`);
        expect(output).toContain(dyn('account', 'code'));
    });

    test('a reassigned param, a parse* local and a numeric key keep the helper', () => {
        expect(output).toContain('return get_value(&params, &key);');
        expect(output).toContain('return get_value(&order, &key);');
        expect(output).toContain('return get_value(&params, &n);');
    });
});

describe('hx4 R11: relaxed Vec locals and native list length', () => {
    const wrap = (body: string, params = 'items: any[]') => `class T {\n    parseX (x) { return x; }\n    filterBy (a, b) { return a; }\n    f (${params}) {\n${body}\n    }\n}`;
    const rs = (body: string, params?: string) => transpiler.transpileRust(wrap(body, params)).content;
    test('a non-final this-call argument clones into its box', () => {
        const out = rs('        const out = [];\n        out.push (1);\n        this.parseX (out);\n        return out;');
        expect(out).toContain('let mut out: Vec<Value> = Vec::new();');
        expect(out).toContain('self.parseX(Value::from(out.clone()));');
        expect(out).toContain('return Value::from(out);');
        expect(out).not.toContain('append_to_array');
    });
    test('index reads on a Vec local use Vec::get', () => {
        const out = rs('        const out = [];\n        out.push (1);\n        for (let i = 0; i < out.length; i++) {\n            const v = out[i];\n            this.parseX (v);\n        }\n        return out[0];');
        expect(out).toContain('let mut out: Vec<Value> = Vec::new();');
        expect(out).toContain('let mut v: Value = out.get((i).as_i64().map_or(usize::MAX, |__n| __n as usize)).cloned().unwrap_or(Value::Null);');
        expect(out).toContain('return out.get(0).cloned().unwrap_or(Value::Null);');
    });
    test('negative: in-loop this-call arg, element write, chained read, &mut self callee keep the box', () => {
        for (const body of [
            '        const out = [];\n        for (let i = 0; i < 2; i++) {\n            out.push (i);\n            this.parseX (out);\n        }\n        return 1;',
            '        const out = [];\n        out.push (1);\n        out[0] = 2;\n        return out;',
            '        const out = [];\n        out.push (items);\n        return out[0][1];',
            '        const out = [];\n        out.push (1);\n        this.extend (out);\n        return out;',
            '        const out = [];\n        out.push (1);\n        const k = \'a\';\n        return out[k];',
        ]) {
            const out = rs(body);
            // the box stays (hx4 R18 may spell its Arr push natively)
            expect(out).toMatch(/append_to_array\(&mut out|if let Value::Arr\(__a\) = &mut out \{/);
            expect(out).not.toContain('Vec<Value>');
        }
    });
    test('length of a split / array-literal-returning call local is native', () => {
        const out = rs('        const parts = s.split (\'-\');\n        const n = parts.length;\n        return n;', 's');
        expect(out).toContain('parts.as_array().map_or(Value::Int(0), |__a| Value::Int(__a.len() as i64))');
        expect(out).not.toContain('get_array_length');
    });
    test('negative: any-typed and reassigned locals keep get_array_length', () => {
        expect(rs('        const n = items2.length;\n        return n;', 'items2')).toContain('get_array_length(&items2)');
        expect(rs('        let parts = s.split (\'-\');\n        parts = s;\n        return parts.length;', 's')).toContain('get_array_length(&parts)');
    });
});

describe('hx4 R12 safeDict / builder plain dicts and bool-value truthiness', () => {
    const insert = (receiver: string, key: string, value: string) =>
        `if let Value::Dict(__d) = &mut ${receiver} { std::sync::Arc::make_mut(__d).insert("${key}".into(), ${value}); }`;
    let output = '';
    beforeAll(() => {
        output = transpiler.transpileRustByPath('./tests/files/input/hx4r12/ts/src/venue.ts').content;
    });

    test('a base safeDict read of caller data with no default inserts natively', () => {
        expect(output).toContain(insert('bare', 'a', 'Value::Int(1)'));
    });

    test('a same-file sync builder returning literals / extend of them inserts natively', () => {
        expect(output).toContain(insert('request', 'clientOid', 'Value::Str("1".into())'));
    });

    test('a non-plain default and a pass-through method keep the helper', () => {
        expect(output).toContain('add_element_to_object(&mut nonPlainDefault, &Value::Str("b".into())');
        expect(output).toContain('add_element_to_object(&mut parsed, &Value::Str("x".into())');
    });

    test('bool tuple elements compare natively against true', () => {
        expect(output).toContain('(enableUnifiedMargin.as_bool() == Some(true)) || (enableUnifiedAccount.as_bool() == Some(true))');
    });

    test('bool tuple elements and bool-returning methods test truthiness natively', () => {
        expect(output).toContain('if paginate.as_bool() == Some(true) {');
        expect(output).toContain('if isTrigger.as_bool() == Some(true) {');
        expect(output).toContain('if !(self.isConditionalOrder(&[params]).as_bool() == Some(true)) {');
    });

    test('an any-valued method / tuple element keeps is_true', () => {
        expect(output).toContain('if is_true(&self.looseFlag(&[params])) {');
        expect(output).toContain('if is_true(&loose) {');
    });
});

describe('hx4 R13 proven-Str safeString locals: native equality / replace / split / toString / case', () => {
    let replaceOut = '';
    let eqOut = '';
    beforeAll(() => {
        replaceOut = transpiler.transpileRust("class X {\n    safeString (o: any, k: any, d: any = undefined): string | undefined { return undefined; }\n    f (o: any, timeframe: string) {\n        const subscription = this.safeString (o, 'n', '');\n        const prefix = timeframe + '_';\n        const marketId = subscription.replace (prefix, '');\n        const net = this.safeString (o, 'network');\n        let code: string = this.safeString (o, 'code', '');\n        code = code.replace (net, '');\n        const id = this.safeString (o, 'id');\n        const parts = (code as string).split (id as string);\n        const s = (id as string).toString ();\n        const h = code.replace ('.' + o['x'], '');\n        return [ marketId, code, parts, s, h ];\n    }\n}\n").content;
        eqOut = transpiler.transpileRust("class X {\n    safeString (o: any, k: any, d: any = undefined): string | undefined { return undefined; }\n    safeString2 (o: any, k: any, k2: any, d: any = undefined): string | undefined { return undefined; }\n    safeValue (o: any, k: any, d: any = undefined): any { return undefined; }\n    f (o: any, net: any) {\n        const a: any = this.safeString (o, 'a');\n        const b: any = this.safeString2 (o, 'b', 'c');\n        if (a === b) { return 1; }\n        const c: any = this.safeString (o, 'c', net);\n        if (a === c) { return 2; }\n        let d: any = this.safeString (o, 'd');\n        d = this.safeValue (o, 'x');\n        if (a !== d) { return 3; }\n        let e: any = this.safeString (o, 'e');\n        [ e ] = o;\n        if (a === e) { return 4; }\n        const g: any = this.safeString (o, 'g', 'z');\n        const u = g.toUpperCase ();\n        const t = a.toString ();\n        const v = d.toString ();\n        return [ u, t, v ];\n    }\n}\n").content;
    });

    test('replace / split with a string-variable operand print native str ops', () => {
        expect(replaceOut).toContain('let mut marketId: Value = subscription.as_str().zip(prefix.as_str()).map(|(__s, __p)| Value::Str(__s.replace(__p, "").into())).unwrap_or_else(|| subscription.clone());');
        expect(replaceOut).toContain('code = code.as_str().zip(net.as_str()).map(|(__s, __p)| Value::Str(__s.replace(__p, "").into())).unwrap_or_else(|| code.clone());');
        expect(replaceOut).toContain('let mut parts: Value = Value::Array(code.as_str().zip(id.as_str()).map(|(__s, __d)| __s.split(__d).map(|__p| Value::Str(__p.to_string().into())).collect()).unwrap_or_default());');
        expect(replaceOut).toContain('.as_str().zip((Value::Str(format!("{}{}", Value::Str(".".into()), crate::value::get_value_k(&o, "x")).into())).as_str())');
        expect(replaceOut).toContain('let mut s: Value = Value::Str(format!("{}", id).into());');
        expect(replaceOut).not.toContain('replace_str(');
    });

    test('two proven-Str `any` locals compare with PartialEq', () => {
        expect(eqOut).toContain('if (a == b) {');
        expect(eqOut).toContain('if (a == c) {');
        expect(eqOut).toContain('let mut u: Value = g.as_str().map(|__s| Value::Str(__s.to_uppercase().into())).unwrap_or(Value::Null);');
        expect(eqOut).toContain('let mut t: Value = Value::Str(format!("{}", a).into());');
    });

    test('a non-string write or destructuring write keeps the helpers', () => {
        expect(eqOut).toContain('if !is_equal(&a, &d) {');
        expect(eqOut).toContain('if is_equal(&a, &e) {');
        expect(eqOut).toContain('let mut v: Value = to_string_val(&d);');
    });
});

describe('hx4 R14 overloaded base safeDict/safeList/safeBool feed the plain-dict and list proofs', () => {
    let output = '';
    beforeAll(() => {
        output = transpiler.transpileRustByPath('./tests/files/input/hx4r14/ts/src/venue.ts').content;
    });

    test('a dynamic-key read on an overloaded safeDict local with a {} default is native', () => {
        expect(output).toContain('let mut found: Value = byAlt.as_map().and_then(|__m| id.as_str().and_then(|__k| __m.get(__k))).cloned().unwrap_or(Value::Null);');
    });

    test('a non-plain default and a write-back bind keep get_value', () => {
        expect(output).toContain('return get_value(&loose, &id);');
        expect(output).toContain('let mut value: Value = get_value(&ledger, &key);');
    });

    test('an overloaded safeBool with a bool default tests truthiness natively', () => {
        expect(output).toContain('if flag.as_bool() == Some(true) {');
    });

    test('list reads at counter/length arithmetic indices are native; an any-typed operand keeps get_value', () => {
        expect(output).toContain('last = trades.as_array().and_then(|__arr| match &((match (&(numTrades), &(Value::Int(1)))');
        expect(output).toContain('let mut prev: Value = trades.as_array().and_then(|__arr| match &((match (&(i), &(Value::Int(1)))');
        expect(output).toContain('Value::Int(__n) if *__n >= 0 => __arr.get(*__n as usize), _ => None }).cloned().unwrap_or(Value::Null)');
        expect(output).toContain('get_value(&trades, &(match (&(k), &(Value::Int(1))) {'); // hx4 R25
    });
});

describe('hx4 R15 Vec<Value> object-literal / join uses and negated bool tuple locals', () => {
    let output = '';
    beforeAll(() => {
        output = transpiler.transpileRustByPath('./tests/files/input/hx4r15/ts/src/venue.ts').content;
    });

    test('a string[] local joined with a literal is a Vec with a native join', () => {
        expect(output).toContain('let mut out: Vec<Value> = Vec::new();');
        expect(output).toContain('Value::Str(out.iter().map(|__v| __v.to_string()).collect::<Vec<String>>().join(",").into())');
    });

    test('object-literal values are boxed clones, the last one a move', () => {
        expect(output).toContain('m.insert("ids".to_string(), Value::from(out.clone()));');
        expect(output).toContain('m.insert("more".to_string(), Value::from(out));');
    });

    test('a value pushed after the literal, an any[] join and an in-loop literal keep the helper', () => {
        expect(output).toContain('append_to_array(&mut late, Value::Str("x".into()));');
        expect(output).toContain('return join(&loose, &Value::Str(",".into()));');
        expect(output).toContain('append_to_array(&mut looped, Value::Str("a".into()));');
    });

    test('a negated bool tuple local tests as_bool natively', () => {
        expect(output).toContain('else if !(stock.as_bool() == Some(true)) {');
    });
});

describe('hx4 R16 rust math/comparison on structurally numeric operands', () => {
    const r16 = (code: string) => transpiler.transpileRust(code).content;
    const src = 'class X {\n' +
        '    sum (...xs: any[]): any { return xs[0]; }\n' +
        '    readU (s: string, n: number): any { let result = 0; result = this.sum (result, n * 2); return result; }\n' +
        '    f (ids: string[], chunkSize: number, bits0: string, limit: number | undefined, a: any, bid: number | undefined) {\n' +
        '        const idsLength = ids.length;\n' +
        '        const c = this.sum (idsLength, chunkSize - 1) / chunkSize;\n' +
        '        const m = this.sum (bid, 1) / 2;\n' +
        '        let bits = this.readU (bits0, 1);\n' +
        '        const bit = bits % 2;\n' +
        '        bits = (bits - bit) / 2;\n' +
        '        const neg = -(this.readU (bits0, 2));\n' +
        '        let errors = 0;\n' +
        '        while (errors <= limit) { errors += 1; }\n' +
        '        const q = -1 * ids.length;\n' +
        '        const anyCmp = a <= bid;\n' +
        '        const anySub = a - 1;\n' +
        '        const anySum = this.sum (a, 1) / 2;\n' +
        '        const nullCmp = bid <= limit;\n' +
        '        return [ c, m, bit, neg, q, anyCmp, anySub, anySum, nullCmp, bits ];\n' +
        '    }\n' +
        '}\n';
    let out = '';
    beforeAll(() => { out = r16(src); });

    test('this.sum of numbers, numeric method returns and inductive locals go native', () => {
        expect(out).toContain('let mut bit: Value = (match (&(bits), &(Value::Int(2))) { (Value::Int(x), Value::Int(y)) if *y != 0 => Value::Int(x % y)');
        expect(out).toContain('bits = (match ((((match (&(bits), &(bit)) { (Value::Int(x), Value::Int(y)) => Value::Int(x - y)');
        expect(out).toContain('let mut neg: Value = (match &((self.readU(bits0, Value::Int(2)))) { Value::Int(x) => Value::Int(-x)');
        expect(out).toContain('let mut q: Value = (match (&(Value::Int(-1)), &(Value::Int(ids.len() as i64))) {');
        expect(out).not.toContain('divide(&self.sum(&[idsLength');
        expect(out).not.toContain('mod_val(&bits');
        expect(out).not.toContain('negate(');
    });

    test('<= with a literal-initialised numeric local against a nullable number is native', () => {
        expect(out).toContain('while errors.as_f64().unwrap_or(f64::NAN) <= limit.as_f64().unwrap_or(f64::NAN) {');
    });

    test('any operands and two nullable sides of <= keep the helpers', () => {
        expect(out).toContain('(match (&(a), &(bid)) { (__a, __b) =>'); // hx4 R25
        expect(out).toContain('(match (&(a), &(Value::Int(1))) {'); // hx4 R25
        expect(out).toContain('(match (&(self.sum(a, Value::Int(1))), &(Value::Int(2))) { (__a, __b) =>'); // hx4 R25
        expect(out).toContain('let mut m: Value = (match ((self.sum(bid, Value::Int(1))).as_f64(), (Value::Int(2)).as_f64())');
        expect(out).toContain('(match (&(bid), &(limit)) { (__a, __b) =>'); // hx4 R25
    });
});

describe('hx4 R17 string helpers and anchored concat', () => {
    const src = "type Str = string | undefined;\nclass Precise { constructor (s: string) {} }\nclass A {\n    id: string = 'a';\n    safeString (o: any, k: any, d: any = undefined): Str { return undefined; }\n    run (x: any, code: string, s: Str, n: number) {\n        const h = this.safeString (x, 'h', '');\n        let qs = '';\n        qs = qs.replaceAll ('%2C', ',');\n        const r = code.replace (s, h);\n        const p = new Precise ('1');\n        return [ h.trim (), code.startsWith (s), code.endsWith (h), qs, r, this.id + ' x ' + x, 'n' + n, 'p' + p, x + 'y', x.trim (), x.replaceAll ('a', 'b'), x.startsWith (s) ];\n    }\n}\n";
    let o = '';
    beforeAll(() => { o = transpiler.transpileRust(src).content; });
    test('trim / startsWith / endsWith / replaceAll / replace on proven strings go native', () => {
        expect(o).toContain('h.as_str().map(|__s| Value::Str(__s.trim().to_string().into())).unwrap_or(Value::Null)');
        expect(o).toContain('code.as_str().zip(s.as_str()).is_some_and(|(__s, __p)| __s.starts_with(__p))');
        expect(o).toContain('code.as_str().zip(h.as_str()).is_some_and(|(__s, __p)| __s.ends_with(__p))');
        expect(o).toContain('qs = qs.as_str().map(|__s| Value::Str(__s.replace("%2C", ",").into())).unwrap_or_else(|| qs.clone());');
        expect(o).toContain('match (code.as_str(), s.as_str(), h.as_str()) { (Some(__s), Some(__p), Some(__r)) => Value::Str(__s.replace(__p, __r).into()), _ => code.clone() }');
    });
    test('concat anchored on an always-Str side goes native for any non-Precise box', () => {
        expect(o).toContain('Value::Str(format!("{}{}", Value::Str(format!("{}{}", self.id, Value::Str(" x ".into())).into()), x).into())');
        expect(o).toContain('Value::Str(format!("{}{}", Value::Str("n".into()), n).into())');
        expect(o).toContain('Value::Str(format!("{}{}", x, Value::Str("y".into())).into())');
    });
    test('Precise operands and any receivers keep the helpers', () => {
        expect(o).toContain('add(&Value::Str("p".into()), &p)');
        expect(o).toContain('trim(&x)');
        expect(o).toContain('replace_all_str(&x,');
        expect(o).toContain('starts_with(&x, &s)');
    });
});

describe('hx4 R18 collection helpers on proven plain-dict / Arr-only locals', () => {
    let rest = '';
    let prediction = '';
    beforeAll(() => {
        rest = transpiler.transpileRustByPath('./tests/files/input/hx4r18/ts/src/venue.ts').content;
        prediction = transpiler.transpileRustByPath('./tests/files/input/hx4r18/ts/src/prediction/venue.ts').content;
    });

    test('push on a [] local / length on a toArray local are native', () => {
        expect(rest).toContain('if let Value::Arr(__a) = &mut out { std::sync::Arc::make_mut(__a).push(rows.as_array()');
        expect(rest).toContain('return Value::from(vec![out, count, Value::Int(parsed.len() as i64)]);');
    });

    test('literal-key in on an R10 plain local is contains_key', () => {
        expect(rest).toContain('if (matches!(&account, Value::Dict(__d) if __d.contains_key("free"))) {');
        expect(rest).toContain('in_op(&response, &Value::Str("code".into()))');
    });

    test('rebound, nullable-push, dict-aliased and closure-captured locals keep the helpers', () => {
        expect(rest).toContain('append_to_array(&mut list, Value::Int(2));');
        expect(rest).toContain('return get_array_length(&list);');
        expect(rest).toContain('append_to_array(&mut maybe, Value::Int(3));');
        expect(rest).toContain('append_to_array(&mut ids, args);');
        expect(rest).toContain('append_to_array(&mut items, Value::Int(4));');
        expect(rest).toContain('append_to_array(&mut seq, Value::Int(seq.len() as i64));');
    });

    test('Object.keys / Object.values on a prediction plain local are native; any keeps the helper', () => {
        expect(prediction).toContain('let mut queryKeys: Value = Value::Array(query.as_map().map(|__m| __m.keys().map(|__k| Value::Str(__k.clone().into())).collect()).unwrap_or_default());');
        expect(prediction).toContain('let mut queryValues: Value = Value::Array(query.as_map().map(|__m| __m.values().cloned().collect()).unwrap_or_default());');
        expect(prediction).toContain('let mut loose: Value = object_keys(&response);');
    });
});

describe('hx4 R20 bool-call equality and numeric add', () => {
    const src = "class A {\n    sbeReadUint (h: string, o: number, l: number): number { return o + l; }\n    sum (...a: any[]): any { return a[0]; }\n    run (requestPath: any, frameHex: string, frameLength: number, x: any, flag: any) {\n        const blockLength = this.sbeReadUint (frameHex, 0, 2);\n        const position = this.sum (blockLength, 8);\n        if (requestPath.endsWith ('login') === true) { return 1; }\n        if (position + 4 > frameLength) { return 0; }\n        const k = x + 1;\n        return [ x.startsWith ('z') !== true, k, flag === true ];\n    }\n}\n";
    let o = '';
    beforeAll(() => { o = transpiler.transpileRust(src).content; });
    test('startsWith/endsWith compared to a bool literal is the bare bool', () => {
        expect(o).toContain('if (ends_with(&requestPath, &Value::Str("login".into()))) {');
        expect(o).toContain('Value::Bool(!starts_with(&x, &Value::Str("z".into())))');
    });
    test('+ on numeric-kind operands is the native match', () => {
        expect(o).toContain('if (match (&(position), &(Value::Int(4))) { (Value::Int(x), Value::Int(y)) => Value::Int(x + y),');
    });
    test('any operands keep the helpers', () => {
        expect(o).toContain('add(&x, &Value::Int(1))');
        expect(o).toContain('is_equal(&flag, &Value::Bool(true))');
    });
});

describe('hx4 R21 base-tier enumeration, Arr-only sources and string-method receivers', () => {
    let base = '';
    let rest = '';
    beforeAll(() => {
        base = transpiler.transpileRustByPath('./tests/files/input/hx4r21/ts/src/base/Exchange.ts').content;
        rest = transpiler.transpileRustByPath('./tests/files/input/hx4r21/ts/src/venue.ts').content;
    });

    test('Object.keys / Object.values on a base-tier plain local are native; any keeps the helper', () => {
        expect(base).toContain('let mut keys: Value = Value::Array(built.as_map().map(|__m| __m.keys().map(|__k| Value::Str(__k.clone().into())).collect()).unwrap_or_default());');
        expect(base).toContain('let mut values: Value = Value::Array(built.as_map().map(|__m| __m.values().cloned().collect()).unwrap_or_default());');
        expect(base).toContain('object_keys(&response)');
    });

    test('push on a local re-sorted by sortBy / built by arrayConcat is native; an any alias keeps the helper', () => {
        expect(base).toContain('if let Value::Arr(__a) = &mut out { std::sync::Arc::make_mut(__a).push(Value::Int(1)); }');
        expect(base).toContain('if let Value::Arr(__a) = &mut joined { std::sync::Arc::make_mut(__a).push(Value::Int(2)); }');
        expect(base).toContain('append_to_array(&mut loose, Value::Int(3));');
    });

    test('a string-typed map read receiving toUpperCase reads natively; an any read keeps get_value', () => {
        expect(rest).toContain('(currency.as_map().and_then(|__m| __m.get("id")).cloned().unwrap_or(Value::Null))');
        expect(rest).toMatch(/get_value\(&raw, &Value::Str\("id"\.into\(\)\)\)|get_value_k\(&raw, "id"\)/);
    });
});

describe('hx4 R22 self-referential numeric writes, always-Str locals, Str ordering', () => {
    const src = "type Str = string | undefined;\nclass A {\n    sum (...a: any[]): any { return a[0]; }\n    safeString (o: any, k: any, d: any = undefined): Str { return undefined; }\n    json (x: any): string { return ''; }\n    run (blockLength: number, raw: any, snap: any, method: string, path: string, params: any, x: any) {\n        let position = this.sum (blockLength, 8);\n        position = position + 4;\n        let earliest: Str = undefined;\n        const gameTime = this.safeString (raw, 'gameTime');\n        if ((gameTime !== undefined) && ((earliest === undefined) || (gameTime < earliest))) {\n            earliest = gameTime;\n        }\n        const version = this.safeString (snap, 'v', '');\n        const held = this.safeString (snap, 'h', '');\n        const newer = (held !== '') && (version <= held);\n        let body: any = undefined;\n        if (method === 'POST') { body = this.json (params); }\n        let auth = '/' + path;\n        if (body !== undefined) { auth = auth + body; }\n        let maybe = this.safeString (x, 'k');\n        const bad = maybe + body;\n        const loose = x < raw;\n        const anyLe = x <= 'b';\n        return [ position, earliest, newer, auth, bad, loose, anyLe ];\n    }\n}\n";
    let o = '';
    beforeAll(() => { o = transpiler.transpileRust(src).content; });
    test('a numeric local re-read in its own write goes native', () => {
        expect(o).toContain('position = (match (&(position), &(Value::Int(4))) {');
        expect(o).not.toContain('add(&position');
    });
    test('Str|Null ordering replicates the helper natively', () => {
        expect(o).toContain('(match (gameTime.as_str(), earliest.as_str()) { (Some(__x), Some(__y)) => (match (__x.parse::<f64>(), __y.parse::<f64>()) { (Ok(__p), Ok(__q)) => __p < __q, _ => __x < __y }), _ => false })');
        expect(o).toContain('(held.as_str() != Some("")) && ((match (version.as_str(), held.as_str()) { (Some(__x), Some(__y)) => (match (__x.parse::<f64>(), __y.parse::<f64>()) { (Ok(__p), Ok(__q)) => __p < __q, _ => __x < __y }) || __x == __y, (None, None) => true, _ => false })));');
    });
    test('a local whose every write is always-Str anchors a native concat', () => {
        expect(o).toContain('auth = Value::Str(format!("{}{}", auth, body).into());');
    });
    test('unproven operands keep the helpers', () => {
        expect(o).toContain('add(&maybe, &body)');
        expect(o).toContain('(match (&(x), &(raw)) { (__a, __b) =>'); // hx4 R25
        expect(o).toContain('(match (&(x), &(Value::Str("b".into()))) { (__a, __b) =>'); // hx4 R25
    });
});

describe('hx4 R23 plain-dict sources in the base tier and pro files', () => {
    let base = '';
    let pro = '';
    beforeAll(() => {
        base = transpiler.transpileRustByPath('./tests/files/input/hx4r23/ts/src/base/Exchange.ts').content;
        pro = transpiler.transpileRustByPath('./tests/files/input/hx4r23/ts/src/pro/venue.ts').content;
    });

    test('base extend copies of locals / typed Dict params insert natively', () => {
        expect(base).toContain('if let Value::Dict(__d) = &mut itemWithKey { std::sync::Arc::make_mut(__d).insert(crate::runtime::stringify_param(&keyName), key.clone()); }');
        expect(base).toContain('if let Value::Dict(__d) = &mut result { std::sync::Arc::make_mut(__d).insert("swap".into(), Value::Bool(false)); }');
    });

    test('base safeDict(this.options, k, {}) local reads natively', () => {
        expect(base).toContain('accountsByType.as_map().and_then(|__m| account.as_str().and_then(|__k| __m.get(__k))).cloned().unwrap_or(Value::Null)');
    });

    test('base extend of an any parameter keeps the helper', () => {
        expect(base).toContain('add_element_to_object(&mut r, &Value::Str("x".into()), Value::Int(1));');
    });

    test('pro extend of a proven local inserts natively; extend of a handler parameter keeps the helper', () => {
        expect(pro).toContain('if let Value::Dict(__d) = &mut request { std::sync::Arc::make_mut(__d).insert("id".into(), Value::Int(1)); }');
        expect(pro).toContain('add_element_to_object(&mut loose, &Value::Str("id".into()), Value::Int(2));');
    });

    test('pro safeDict(this.options, k, {}) local reads natively', () => {
        expect(pro).toContain('subs.as_map().and_then(|__m| __m.get("a")).cloned().unwrap_or(Value::Null)');
    });
});

describe('hx4 R25 inline math/comparison dispatch and Str|Null field concat', () => {
    const src = "class A {\n    convertToBigIntCustom (x: any) {\n        return parseInt (x);\n    }\n    signHash (hash: any, privateKey: any) {\n        const signature = ecdsa (hash, privateKey);\n        const r = signature['r'];\n        const s = signature['s'];\n        return {\n            'r': r.padStart (64, '0'),\n            's': s.padStart (64, '0'),\n            'v': 27,\n        };\n    }\n    signMessage (message: any, privateKey: any) {\n        return this.signHash (message, privateKey.slice (-64));\n    }\n    signOnboardingAction (): object {\n        const signature = this.signMessage ('x', 'y');\n        return signature;\n    }\n    run (request: any, params: any, config: any, cache: any[], h: any) {\n        const amountMultiplier = this.convertToBigIntCustom ('1000000');\n        const amountInt = request['num_tokens'] * amountMultiplier;\n        const z = this.parseToInt (request['num_tokens'] * amountMultiplier);\n        const limit = params['limit'];\n        const entry = config[0];\n        if (limit <= entry[0]) { return 1; }\n        const signature: any = this.signOnboardingAction ();\n        const pk = this.hashMessage (signature['r'] + signature['s']);\n        const cacheLength = cache.length;\n        const snapshotDelay = this.handleOption ('a', 'b', 25);\n        if (cacheLength === snapshotDelay) { return 2; }\n        if (h === 1) { return 3; }\n        return [ amountInt, z, pk ];\n    }\n}\n";
    let o = '';
    beforeAll(() => { o = transpiler.transpileRust(src).content; });
    test('any * numeric-call operand prints the multiply dispatch inline', () => {
        expect(o).toContain('let mut amountInt: Value = (match (&(crate::value::get_value_k(&request, "num_tokens")), &(amountMultiplier)) { (Value::Int(__x), Value::Int(__y)) => Value::Int(__x * __y), (__a, __b) =>');
        expect(o).not.toContain('multiply(');
    });
    test('any <= any prints the coercing order plus is_equal inline', () => {
        expect(o).toContain('if (match (&(limit), &(get_value(&entry, &Value::Int(0)))) { (__a, __b) =>');
        expect(o).toContain('(Value::Null, Value::Null) => true');
        expect(o).not.toContain('is_less_than_or_equal(');
    });
    test('Str|Null fields of a same-file returned literal concatenate natively', () => {
        expect(o).toContain('self.hashMessage((match (&(crate::value::get_value_k(&signature, "r")), &(crate::value::get_value_k(&signature, "s"))) { (Value::Null, Value::Null) => Value::Null, (__a, __b) => Value::Str(format!("{}{}", __a, __b).into()) }))');
        expect(o).not.toContain('add(');
    });
    test('a non-literal field source keeps the add helper', () => {
        const n = transpiler.transpileRust('class B {\n    run (x: any) {\n        const s = x[0];\n        return s[\'r\'] + s[\'s\'];\n    }\n}\n').content;
        expect(n).toContain('add(&');
    });
});

describe('hx4 R26 tuple slot-1 params of base handle*AndParams helpers', () => {
    const insert = (receiver: string, key: string, value: string) =>
        `if let Value::Dict(__d) = &mut ${receiver} { std::sync::Arc::make_mut(__d).insert("${key}".into(), ${value}); }`;
    let rest = '';
    let pro = '';
    beforeAll(() => {
        rest = transpiler.transpileRustByPath('./tests/files/input/hx4r26/ts/src/venue.ts').content;
        pro = transpiler.transpileRustByPath('./tests/files/input/hx4r26/ts/src/pro/venue.ts').content;
    });

    test('const [ a, p ] = handleOptionBoolAndParams (params, …) inserts natively on p', () => {
        expect(rest).toContain(insert('paramsStock', 'stock', 'Value::Bool(true)'));
        expect(rest).not.toContain('add_element_to_object(&mut paramsStock');
    });

    test('[ a, p ] = handleMarketTypeAndParams (…, params) write: native insert and read', () => {
        expect(rest).not.toContain('add_element_to_object(&mut paramsType');
        expect(rest).toContain('paramsType.as_map().and_then(|__m| __m.get("other")).cloned().unwrap_or(Value::Null)');
    });

    test('an unproven params argument or a non-listed handler keeps the helper', () => {
        expect(rest).toContain('add_element_to_object(&mut paramsLoose');
        expect(rest).toContain('add_element_to_object(&mut paramsOther');
    });

    test('pro: a parameter source keeps the helper, a plain local source goes native', () => {
        expect(pro).toContain('add_element_to_object(&mut paramsStock');
        expect(pro).not.toContain('add_element_to_object(&mut paramsLocal');
    });
});
