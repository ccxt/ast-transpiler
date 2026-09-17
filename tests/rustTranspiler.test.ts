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
        "while is_true(&Value::Bool(true)) {\n" +
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
        expect(output).toContain('Value::List(vec![');
        expect(output).toContain('Value::Int(1)');
        expect(output).toContain('Value::Int(2)');
        expect(output).toContain('Value::Int(3)');
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
        expect(output).toContain('let mut r: Value = Value::Bool(a.as_f64().unwrap_or(f64::NAN) >= b.as_f64().unwrap_or(f64::NAN));');
    });

    test('native comparison as a ternary condition stays a bare bool', () => {
        const ts =
        "let a = 1;\n" +
        "let b = 2;\n" +
        "const r = a > b ? 1 : 2;";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('ternary(a.as_f64().unwrap_or(f64::NAN) > b.as_f64().unwrap_or(f64::NAN), Value::Int(1), Value::Int(2))');
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
        expect(output).toContain('ternary(');
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
        expect(output).toContain('get_value(&o, &Value::Str("k".to_string()))');
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
        expect(output).toContain('get_value(&d, &Value::Str("x".to_string()))');
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
        expect(output).toContain('add(&get_value(&result, &Value::Str("k".to_string())), &v)');
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
        expect(output).toContain('get_value(&self.options, &Value::Str("id".to_string()))');
    });
});
