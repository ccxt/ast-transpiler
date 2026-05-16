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
        const ts = "const b = false;"
        const rust = "let mut b: Value = Value::Bool(false);"
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
        expect(output).toContain('is_less_than(&i, &Value::Int(10))');
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
        expect(output).toContain('Value::Bool(true)');
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

    test('reserved keyword match is renamed', () => {
        const ts = 'const match = 1;'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('match_val');
    });
});
