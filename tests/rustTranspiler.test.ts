import { Transpiler } from '../src/transpiler';

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
        const rust = 'let mut s: Value = Value::Str("hello".to_string());'
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
        "while is_true(&(true)) {\n" +
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

    test('string comparison keeps the helper', () => {
        const ts =
        "let a = 'x';\n" +
        "let b = 'y';\n" +
        "if (a < b) {\n" +
        "    const x = 1;\n" +
        "}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('is_less_than(&a, &b)');
    });

    test('any-typed comparison keeps the helper', () => {
        const ts =
        "let a: any = 1;\n" +
        "let b: any = 2;\n" +
        "if (a < b) {\n" +
        "    const x = 1;\n" +
        "}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('is_less_than(&a, &b)');
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
        expect(output).toContain('subtract(&a, &b)');
    });

    test('multiplication wrapping', () => {
        const ts = 'const c = a * b;'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('multiply(&a, &b)');
    });

    test('division wrapping', () => {
        const ts = 'const c = a / b;'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('divide(&a, &b)');
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
        expect(output).toContain('is_less_than(&a, &b)');
    });

    test('less than or equal wrapping', () => {
        const ts = 'const r = a <= b;'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('is_less_than_or_equal(&a, &b)');
    });

    test('greater than wrapping', () => {
        const ts = 'const r = a > b;'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('is_greater_than(&a, &b)');
    });

    test('greater than or equal wrapping', () => {
        const ts = 'const r = a >= b;'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('is_greater_than_or_equal(&a, &b)');
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
        expect(output).toContain('x = subtract(&x, &Value::Int(1))');
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
        expect(output).toContain('(if is_true(&flag) { Value::Str("a".to_string()) } else { Value::Str("b".to_string()) })');
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
        expect(output).toContain('is_array(&x)');
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
        expect(output).toContain('get_index_of(&arr, &x)');
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
        expect(output).toContain('to_upper(&s)');
    });

    test('toLowerCase call', () => {
        const ts = 'const r = s.toLowerCase();'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('to_lower(&s)');
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
        expect(output).toContain('slice(&arr,');
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
        expect(output).toContain('name: Value::Str("bar".to_string()),');
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
        expect(output).toContain('let mut ok: bool = starts_with(&s, &Value::Str("x".to_string()));');
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
            expect(output).toContain('is_equal(&anything, &Value::Str("1".to_string()))');
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
        expect(output).toContain('get_value(&book, &Value::Str("url".to_string()))');
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
        expect(output).toContain('append_to_array(&mut get_value(&d, &Value::Str("a".to_string())), v)');
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
        expect(output).toContain('let mut c: Value = Value::Str(format!("{}{}", a, b));');
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

    test('number + string keeps the add helper', () => {
        const ts =
        'const a: number = 1;\n' +
        'const s: string = "q";\n' +
        'const c = a + s;';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('add(&a, &s)');
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
        expect(output).toContain('let mut c: Value = Value::Str(format!("{}{}", a, b));');
        expect(output).not.toContain('add(');
    });

    test('optional string parameter + proven string emits native concat', () => {
        const ts =
        'function f(x?: string) {\n' +
        '    const s: string = "y";\n' +
        '    return x + s;\n' +
        '}';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('return Value::Str(format!("{}{}", x, s));');
        expect(output).not.toContain('add(');
    });

    test('string | undefined operand + string literal emits native concat', () => {
        const ts =
        'type Str = string | undefined;\n' +
        'function g(): Str { return "x"; }\n' +
        'const a = g();\n' +
        'const c = a + "y";';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('Value::Str(format!("{}{}", a, Value::Str("y".to_string())))');
        expect(output).not.toContain('add(');
    });

    test('string | undefined += string literal emits native concat', () => {
        const ts =
        'type Str = string | undefined;\n' +
        'function g(): Str { return "x"; }\n' +
        'let s = g();\n' +
        's += "b";';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('s = Value::Str(format!("{}{}", s, Value::Str("b".to_string())));');
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

    test('string + any keeps the add helper', () => {
        const ts =
        'function h(): any { return 2; }\n' +
        'const a: string = "x";\n' +
        'const b = h();\n' +
        'const c = a + b;';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('add(&a, &b)');
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
        expect(output).toContain('s = Value::Str(format!("{}{}", s, Value::Str("b".to_string())));');
        expect(output).not.toContain('add(');
    });

    test('string property + string literal emits native concat', () => {
        const ts =
        'class A {\n' +
        '    id: string = "a";\n' +
        '    run(): string { return this.id + "x"; }\n' +
        '}';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('Value::Str(format!("{}{}", self.id, Value::Str("x".to_string())))');
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
        const rust = 'let mut subs: Value = get_value(&client, &Value::Str("subscriptions".to_string()));'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toBe(rust);
    });

    test('numeric-string keys keep get_value', () => {
        const ts = "const v = cache['0'];"
        const rust = 'let mut v: Value = get_value(&cache, &Value::Str("0".to_string()));'
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
        expect(output).toContain('crate::exchange_errors::not_supported(format!("{}{}", id, Value::Str(" handleDelta not supported yet".to_string())))');
        expect(output).not.toContain('not_supported(Value::Str(');
    });

    test('a parenthesised concat message drops its Value::Str box', () => {
        const ts = "function f(id: string) {\n    throw new NotSupported((id + ' msg'));\n}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('crate::exchange_errors::not_supported(format!("{}{}", id, Value::Str(" msg".to_string())))');
    });

    test('a concat message of a post-pass error class also drops its box', () => {
        const ts = "function f(id: string) {\n    throw new BadRequest (id + ' msg');\n}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('BadRequest::new(format!("{}{}", id, Value::Str(" msg".to_string())))');
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

describe('rust native dict inserts', () => {
    const insert = (receiver: string, key: string, value: string) =>
        `if let Value::Dict(__d) = &mut ${receiver} { std::sync::Arc::make_mut(__d).insert("${key}".to_string(), ${value}); }`;

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
        expect(output).toContain('&mut result { std::sync::Arc::make_mut(__d).insert("k".to_string(), __be_tmp); }');
        expect(output).not.toContain('add_element_to_object(&mut result');
    });

    test('a call passing the receiver as an arg is hoisted too', () => {
        const ts = 'const params: { [key: string]: any } = {};\nparams["auth"] = this.createAuth(params);';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('{ let __be_tmp = self.createAuth(params); if let Value::Dict(__d) = &mut params { std::sync::Arc::make_mut(__d).insert("auth".to_string(), __be_tmp); } }');
    });

    test('a bool-typed value operand is boxed in Value::Bool', () => {
        const ts = 'const result: { [key: string]: any } = {};\nconst a: any = 1;\nresult["k"] = (a === 1);';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('insert("k".to_string(), Value::Bool(');
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

    test('book-meta keys keep the helper', () => {
        const ts = 'const result: { [key: string]: any } = {};\nresult["timestamp"] = 1;';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('add_element_to_object(&mut result');
    });

    test('computed keys keep the helper', () => {
        const ts = 'const result: { [key: string]: any } = {};\nconst k = "x";\nresult[k] = 1;';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('add_element_to_object(&mut result, &k,');
    });

    test('a later write of another shape keeps the helper', () => {
        const ts = 'let result: { [key: string]: any } = {};\nresult = [] as any;\nresult["k"] = 1;';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('add_element_to_object(&mut result');
    });

    test('the request receiver keeps the helper', () => {
        const ts = 'const request: { [key: string]: any } = {};\nrequest["k"] = 1;';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('add_element_to_object(&mut request');
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
        expect(output).toContain('if is_true(&(is_array(&x))) {');
        expect(output).not.toContain('Value::Bool(is_array(&x))');
    });

    test('a negated boxed condition keeps the is_true marker', () => {
        const ts = 'class A { f(x) { if (!Array.isArray (x)) { return 1; } return 2; } }';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('if !is_true(&(is_array(&x))) {');
    });

    test('every &&/|| operand is unboxed on its own', () => {
        const ts = 'class A { f(x, y) { if (Array.isArray (x) || y) { return 1; } return 2; } }';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('if is_true(&(is_array(&x))) || is_true(&y) {');
    });

    test('a boxed `in` condition loses the box', () => {
        const ts = 'class A { f(x) { if ("k" in x) { return 1; } return 2; } }';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('if is_true(&(in_op(&x, &Value::Str("k".to_string())))) {');
    });

    test('assert() takes the bare bool as well', () => {
        const ts = 'class A { f(x) { assert (Array.isArray (x), "msg"); } }';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('assert((is_array(&x)), Value::Str("msg".to_string()));');
    });

    // negatives — every other sink takes a `Value` and keeps its box.
    test('a Value-argument box is untouched', () => {
        const ts = 'class A { f(x) { return g (Array.isArray (x)); } }';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('return g(Value::Bool(is_array(&x)));');
    });

    test('a Value-local initializer box is untouched', () => {
        const ts = 'class A { f(x) { const y = Array.isArray (x); return y; } }';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('let mut y: Value = Value::Bool(is_array(&x));');
    });

    test('is_equal keeps its &Value operand box', () => {
        const ts = 'class A { f(x) { if (x === true) { return 1; } return 2; } }';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('if is_equal(&x, &Value::Bool(true)) {');
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
        expect(output).toContain('if matches!(self.safeBool(self.options, Value::Str("foo".to_string()), &[Value::Bool(false)]), Value::Bool(true))');
        expect(output).not.toContain('is_true(&self.safeBool');
    });

    test('negated safeBool keeps the negation around the matches!', () => {
        const ts = boolClass("        if (!this.safeBool(this.options, 'foo')) { return 1; }");
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('if !matches!(self.safeBool(self.options, Value::Str("foo".to_string()), &[]), Value::Bool(true))');
        expect(output).not.toContain('is_true(&self.safeBool');
    });

    test('safeBool2 and a ternary condition emit the native matches!', () => {
        const ts = boolClass("        return this.safeBool2(this.options, 'a', 'b', false) ? 1 : 2;");
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('(if matches!(self.safeBool2(self.options, Value::Str("a".to_string()), Value::Str("b".to_string()), &[Value::Bool(false)]), Value::Bool(true))');
        expect(output).not.toContain('is_true(&self.safeBool2');
    });

    test('a boolean-returning method keeps the helper', () => {
        const ts = boolClass('        if (this.isLinear(this.options)) { return 1; }');
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('is_true(&self.isLinear(self.options))');
        expect(output).not.toContain('matches!(self.isLinear');
    });

    test('a logical stored in a Value local keeps the helper', () => {
        const ts = boolClass("        const x = this.safeBool(this.options, 'a') || this.safeBool(this.options, 'b');\n        return x;");
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('is_true(&self.safeBool(self.options, Value::Str("a".to_string()), &[])) || is_true(&self.safeBool');
        expect(output).not.toContain('matches!(self.safeBool');
    });

    test('a logical inside a condition emits the native matches! operand', () => {
        const ts = boolClass("        if (this.safeBool(this.options, 'a') && this.safeBool(this.options, 'b')) { return 1; }");
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('if matches!(self.safeBool(self.options, Value::Str("a".to_string()), &[]), Value::Bool(true)) && matches!(self.safeBool');
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
        expect(output).toContain('if matches!(options.as_map().and_then(|__m| __m.get("foo")).cloned().unwrap_or(Value::Null), Value::Bool(true))');
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
