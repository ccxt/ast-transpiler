import { Transpiler } from '../src/transpiler';
import { readFileSync } from 'fs';
// the test bodies name their TS source snippets `ts`, so the compiler API gets its own name
import tsApi from 'typescript';
jest.mock('module',()=>({
    __esModule: true,                 // this makes it work
    default: jest.fn()
  }));

let transpiler: Transpiler;

beforeAll(() => {
    const config = {
        'verbose': false,
        'csharp': {
            'parser': {
                'NUM_LINES_END_FILE': 0,
                "ELEMENT_ACCESS_WRAPPER_OPEN": "getValue(",
                "ELEMENT_ACCESS_WRAPPER_CLOSE": ")"

            }
        }
    }
    transpiler = new Transpiler(config);
})

describe('csharp transpiling tests', () => {
    test('basic variable declaration', () => {
        const ts = "const x = 1;"
        const csharp = "object x = 1;"
        const output = transpiler.transpileCSharp(ts).content;
        expect(output).toBe(csharp);
    });
    test('basic while loop', () => {
        const ts =
        "while (true) {\n" +
        "    const x = 1;\n" +
        "    break;\n" +
        "}"
        
        const csharp =
        "while (true)\n{\n" +
        "    object x = 1;\n" +
        "    break;\n" +
        "}"
        const output = transpiler.transpileCSharp(ts).content;
        expect(output).toBe(csharp);
    });
    // test('basic for loop', () => {
    //     const ts =
    //     "for (let i = 0; i < 10; i++) {\n" +
    //     "    break;\n" +
    //     "}"
    //     const csharp =
    //     "for (object i = 0; isLessThan(i, 10); i++)\n{\n" +
    //     "    break;\n" +
    //     "}"
    //     const output = transpiler.transpileCSharp(ts).content;
    //     expect(output).toBe(csharp);
    // });
    test('basic method declaration', () => {
        const ts =
        "class T {\n" +
        "    test(): void {\n" +
        "        console.log(\"Hello\")\n" +
        "    }\n" +
        "}"
        const csharp =
        "class T\n" +
        "{\n" +
        "    public virtual void test()\n" +
        "    {\n" +
        "        Console.WriteLine(\"Hello\");\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileCSharp(ts).content;
        expect(output).toBe(csharp);
    });
    test('basic class declaration with props', () => {
        const ts = 
        "class MyClass {\n" +
        "    public x: number = 10;\n" +
        "    public y: string = \"test\";\n" +
        "    public z1: string[] = [ 'a', 'b' ];\n" +
        "    public z2: any = whatever;\n" +
        "    public z3: any = {};\n" +
        "    public z4: any = Whatever;\n" +
        "    mainFeature(message): void {\n" +
        "        console.log(\"Hello! I'm inside main class:\" + message)\n" +
        "    }\n" +
        "}";
        const cs =
        "class MyClass\n" +
        "{\n" +
        "    public object x = 10;\n" +
        "    public string y = \"test\";\n" +
        "    public List<object> z1 = new List<object>() {\"a\", \"b\"};\n" +
        "    public Dictionary<string, object>  z2 = whatever;\n" +
        "    public Dictionary<string, object> z3 = new Dictionary<string, object>() {};\n" +
        "    public Dictionary<string, object>  z4 = Whatever;\n" +
        "\n" +
        "    public virtual void mainFeature(object message)\n" +
        "    {\n" +
        "        Console.WriteLine(add(\"Hello! I'm inside main class:\", message));\n" +
        "    }\n" +
        "}";
        const output = transpiler.transpileCSharp(ts).content;
        expect(output).toBe(cs);
    });
    // test('basic basic declaration with default parameters', () => {
    //     const ts = 
    //     "class T {\n" +
    //     "    test(s: string): void {\n" +
    //     "        console.log(\"Hello\")\n" +
    //     "    }\n" +
    //     "}"
    //     const csharp =
    //     "class T\n" +
    //     "{\n" +
    //     "    public virtual void test(string s)\n" +
    //     "    {\n" +
    //     "        Console.WriteLine(\"Hello\");\n" +
    //     "    }\n" +
    //     "}"
    //     const output = transpiler.transpileCSharp(ts).content;
    //     expect(output).toBe(csharp);
    // });
    test('basic class inheritance', () => {
        const ts =
        "class t extends ParentClass {\n" +
        "    method () {\n" +
        "\n" +
        "    }\n" +
        "}";
        const csharp =
        "class t : ParentClass\n" +
        "{\n" +
        "    public virtual void method()\n" +
        "    {\n" +
        "\n" +
        "    }\n" +
        "}";
        const output = transpiler.transpileCSharp(ts).content;
        expect(output).toBe(csharp);
    });
    // test('basic identation check [nested if]', () => {
    //     const ts =
    //     "if (1) {\n" +
    //     "    if (2) {\n" +
    //     "        if (3) {\n" +
    //     "            if (4) {\n" +
    //     "                object x = 1;\n" +
    //     "            }\n" +
    //     "        } \n" +
    //     "    }\n" +
    //     "}";
    //     const csharp =
    //     "if (1)\n" +
    //     "{\n" +
    //     "    if (2)\n" +
    //     "    {\n" +
    //     "        if (3)\n" +
    //     "        {\n" +
    //     "            if (4)\n" +
    //     "            {\n" +
    //     "                object x = 1;\n" +
    //     "            }\n" +
    //     "        }\n" +
    //     "    }\n" +
    //     "}"
    //     const output = transpiler.transpileCSharp(ts).content;
    //     expect(output).toBe(csharp);
    // });
    // test('basic identation check [if-else-if]', () => {
    //     const ts =
    //     "if (false) {\n" +
    //     "  console.log(\"if\")\n" +
    //     "} else if (false) {\n" +
    //     "    console.log(\"else if\")\n" +
    //     "} else {\n" +
    //     "    console.log(\"else\")\n" +
    //     "}"
    //     const csharp =
    //     "if (false)\n" +
    //     "{\n" +
    //     "    Console.WriteLine(\"if\");\n" +
    //     "} else if (false)\n" +
    //     "{\n" +
    //     "    Console.WriteLine(\"else if\");\n" +
    //     "} else\n" +
    //     "{\n" +
    //     "    Console.WriteLine(\"else\");\n" +
    //     "}";
    //     const output = transpiler.transpileCSharp(ts).content;
    //     expect(output).toBe(csharp);
    // });
    // test('basic async function declaration [no args]', () => {
    //     const ts =
    //     "class t {\n" +
    //     "    \n" +
    //     "    async fn (): Promise<void> {\n" +
    //     "        const x = await this.asyncMethod();\n" +
    //     "        console.log(\"1\");\n" +
    //     "    }\n" +
    //     "}"
    //     const csharp =
    //     "class t\n" +
    //     "{\n" +
    //     "    public async virtual Task fn()\n" +
    //     "    {\n" +
    //     "        object x = await this.callAsync(\"asyncMethod\");\n" +
    //     "        Console.WriteLine(\"1\");\n" +
    //     "    }\n" +
    //     "}"
    //     const output = transpiler.transpileCSharp(ts).content;
    //     expect(output).toBe(csharp);
    // });
    // test('basic function declaration [with typed args]', () => {
    //     // to do add support for typed arrays and objects
    //     const ts =
    //     "class t {\n" +
    //     "    parseOrder (a: string, b: number, c: boolean) {\n" +
    //     "        console.log(\"here\");\n" +
    //     "    }\n" +
    //     "}";
    //     const csharp =
    //     "class t\n" +
    //     "{\n" +
    //     "    public virtual void parseOrder(string a, object b, bool c)\n" +
    //     "    {\n" +
    //     "        Console.WriteLine(\"here\");\n" +
    //     "    }\n" +
    //     "}"
    //     const output = transpiler.transpileCSharp(ts).content;
    //     expect(output).toBe(csharp);
    // });
    // test('basic function declaration [with initialized args]', () => {
    //     const ts =
    //     "class t {\n" +
    //     "    parseOrder (a = \"hi\", b = 3, bb= 3.2, c = false, d = [], e = {}) {\n" +
    //     "        // I'm a comment\n" +
    //     "        console.log(\"here\");\n" +
    //     "    }\n" +
    //     "}";
    //     const csharp =
    //     "class t\n" +
    //     "{\n" +
    //     "    public virtual void parseOrder(string a = \"hi\", object b = null, object bb = null, bool c = false, List<object> d = null, Dictionary<string, object> e = null)\n" +
    //     "    {\n" +
    //     "        // I'm a comment\n" +
    //     "        b ??= 3;\n" +
    //     "        bb ??= 3.2;\n" +
    //     "        d ??= new List<object>();\n" +
    //     "        e ??= new Dictionary<string, object>();\n" +
    //     "        console.log(\"here\");\n" +
    //     "    }\n" +
    //     "}"
    //     const output = transpiler.transpileCSharp(ts).content;
    //     expect(output).toBe(csharp);
    // });
    // test('basic async function declaration [with typed return type]', () => {
    //     const ts =
    //     "class t {\n" +
    //     "    method (s:string): number {\n" +
    //     "        return 1;\n" +
    //     "    }\n" +
    //     "    method2(): void {\n" +
    //     "        console.log(1)\n" +
    //     "    }\n" +
    //     "    method3(): string {\n" +
    //     "        return \"1\"\n" +
    //     "    }\n" +
    //     "    async method4(): Promise<string> {\n" +
    //     "        return \"1\"\n" +
    //     "    }\n" +
    //     "    async method5(): Promise<object> {\n" +
    //     "        return {\n" +
    //     "            \"foo\": \"bar\"\n" +
    //     "        };\n" +
    //     "    }\n" +
    //     "}"
    //     const csharp =
    //     "class t\n" +
    //     "{\n" +
    //     "    float method(string s)\n" +
    //     "    {\n" +
    //     "        return 1;\n" +
    //     "    }\n" +
    //     "\n" +
    //     "    void method2()\n" +
    //     "    {\n" +
    //     "        Console.WriteLine(1);\n" +
    //     "    }\n" +
    //     "\n" +
    //     "    string method3()\n" +
    //     "    {\n" +
    //     "        return \"1\";\n" +
    //     "    }\n" +
    //     "\n" +
    //     "    async Task<string> method4()\n" +
    //     "    {\n" +
    //     "        return \"1\";\n" +
    //     "    }\n" +
    //     "\n" +
    //     "    async Task<Dictionary<string, object>> method5()\n" +
    //     "    {\n" +
    //     "        return new Dictionary<string, object>() {\n" +
    //     "            { \"foo\", \"bar\" },\n" +
    //     "        };\n" +
    //     "    }\n" +
    //     "}"
    //     const output = transpiler.transpileCSharp(ts).content;
    //     expect(output).toBe(csharp);
    // });
    // test('basic function declaration [with inferred return type]', () => {
    //     transpiler.setPhpAsyncTranspiling(false);
    //     const ts =
    //     "class t {\n" +
    //     "    method1() {\n" +
    //     "        console.log(1);\n" +
    //     "    }\n" +
    //     "    method2() {\n" +
    //     "        return 1;\n" +
    //     "    }\n" +
    //     "    method3() {\n" +
    //     "        return \"1\";\n" +
    //     "    }\n" +
    //     "    method4() {\n" +
    //     "        return true;\n" +
    //     "    }\n" +
    //     "    async method5() {\n" +
    //     "        return \"1\";\n" +
    //     "    }\n" +
    //     "    async method6() {\n" +
    //     "        return {\n" +
    //     "            \"foo\": 1\n" +
    //     "        }\n" +
    //     "    }\n" +
    //     "}"
    //     const csharp =
    //     "class t\n" +
    //     "{\n" +
    //     "    void method1()\n" +
    //     "    {\n" +
    //     "        Console.WriteLine(1);\n" +
    //     "    }\n" +
    //     "\n" +
    //     "    float method2()\n" +
    //     "    {\n" +
    //     "        return 1;\n" +
    //     "    }\n" +
    //     "\n" +
    //     "    string method3()\n" +
    //     "    {\n" +
    //     "        return \"1\";\n" +
    //     "    }\n" +
    //     "\n" +
    //     "    bool method4()\n" +
    //     "    {\n" +
    //     "        return true;\n" +
    //     "    }\n" +
    //     "\n" +
    //     "    async Task<string> method5()\n" +
    //     "    {\n" +
    //     "        return \"1\";\n" +
    //     "    }\n" +
    //     "\n" +
    //     "    async Task<Dictionary<string, object>> method6()\n" +
    //     "    {\n" +
    //     "        return new Dictionary<string, object>() {\n" +
    //     "            { \"foo\", 1 },\n" +
    //     "        };\n" +
    //     "    }\n" +
    //     "}"
    //     const output = transpiler.transpileCSharp(ts).content;
    //     transpiler.setPhpAsyncTranspiling(true);
    //     expect(output).toBe(csharp);
    // });
    test('callback function transpilation', () => {
        const ts =
        "function printResult(result) {\n" +
        "    return;\n" +
        "}\n" +
        "processNumbers(5, 10, printResult);";
        const cs =
        "public void printResult(object result)\n{\n" +
        "    return;\n" +
        "}\n" +
        "processNumbers(5, 10, printResult);";
        const output = transpiler.transpileCSharp(ts).content;
        expect(output).toBe(cs);
    });
    test('function expression transpilation', () => {
        const ts =
        "const consumer = function consumer(a) {\n" +
        "    return;\n" +
        "};";
        const csharp =
        "void consumer(object a)\n" +
        "{\n" +
        "    return;\n" +
        "};";
        const output = transpiler.transpileCSharp(ts).content;
        expect(output).toBe(csharp);
    });
    test('basic class with constructor', () => {
        const ts =
        "class teste extends Test {\n" +
        "    constructor(config = {}) {\n" +
        "        console.log('teste');\n" +
        "        super(config)\n" +
        "    }\n" +
        "}"
        const csharp =
        "class teste : Test\n" +
        "{\n" +
        "    teste(object config = null) : base(config)\n" +
        "    {\n" +
        "        config ??= new Dictionary<string, object>();\n" +
        "        Console.WriteLine(\"teste\");\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileCSharp(ts).content;
        expect(output).toBe(csharp);
    });
    test('basic dictonary', () => {
        const ts =
        "const types = {\n" +
        "    'limit': 'limit',\n" +
        "    'market': 'market',\n" +
        "    'margin': 'margin',\n" +
        "}\n" 
        const csharp =
        "object types = new Dictionary<string, object>() {\n" +
        "    { \"limit\", \"limit\" },\n" +
        "    { \"market\", \"market\" },\n" +
        "    { \"margin\", \"margin\" },\n" +
        "};"
        const output = transpiler.transpileCSharp(ts).content;
        expect(output).toBe(csharp);
    });
    test('basic binary expressions', () => {
        const ts =
        "const a = 1 + 1;\n" +
        "const b = 2 * 2;\n" +
        "const c = 3 / 3;\n" +
        "const d = 4 - 4;\n" +
        "const e = 5 % 5;\n" +
        "const f = \"foo\" + \"bar\";\n";
        const csharp =
        "object a = add(1, 1);\n" +
        "object b = multiply(2, 2);\n" +
        "object c = divide(3, 3);\n" +
        "object d = subtract(4, 4);\n" +
        "object e = mod(5, 5);\n" +
        "object f = add(\"foo\", \"bar\");"
        const output = transpiler.transpileCSharp(ts).content;
        expect(output).toBe(csharp);
    })
    // test('basic conditions expressions', () => {
    //     const ts =
    //     "const a = true;\n" +
    //     "const b = false;\n" +
    //     "const c = true;\n" +
    //     "const d = (a && b) || (c && !b);\n" 
    //     const csharp =
    //     "object a = true;\n" +
    //     "bool b = false;\n" +
    //     "object c = true;\n" +
    //     "object d = (a && b) || (c && !b);"
    //     const output = transpiler.transpileCSharp(ts).content;
    //     expect(output).toBe(csharp);
    // })
    test('Should wrap falsy/truthy expressions [with the defined wrapper]', () => {
        const ts =
        "const a = \"hi\";\n" +
        "const b = false;\n" +
        "const c =  a && b;\n" +
        "const d = !a && !b;\n" +
        "const e = (a || !b);\n" +
        "if (a) {\n" +
        "    const f = 1;\n" +
        "}"
        const csharp =
        "string a = \"hi\";\n" +
        "bool b = false;\n" +
        // `b` is declared bool, so the condition operand prints natively; `a` is a string
        // local and keeps the falsy/truthy wrapper (csharpConditionOperandType answers bool
        // only for the declarations the printer itself types)
        "bool c = isTrue(a) && b;\n" +
        "bool d = !isTrue(a) && !b;\n" +
        "bool e = (isTrue(a) || !b);\n" +
        "if (isTrue(a))\n" +
        "{\n" +
        "    object f = 1;\n" +
        "}"
        const output = transpiler.transpileCSharp(ts).content;
        expect(output).toBe(csharp);
    })
    test('basic element access expression', () => {
        const ts =
        "const x = {};\n" +
        "x[\"teste\"] = 1;";
        const csharp =
        "object x = new Dictionary<string, object>() {};\n" +
        "((IDictionary<string,object>)x)[\"teste\"] = 1;";
        const output = transpiler.transpileCSharp(ts).content;
        expect(output).toBe(csharp);
    })
    test('should wrap right side of element access expression', () => {
        const ts =
        "const a = {};\n" +
        "const b = a[\"teste\"]\n" +
        "a[\"b\"] = a[\"teste\"];"
        const csharp =
        "object a = new Dictionary<string, object>() {};\n" +
        "object b = getValue(a, \"teste\");\n" +
        "((IDictionary<string,object>)a)[\"b\"] = getValue(a, \"teste\");"
        const output = transpiler.transpileCSharp(ts).content;
        expect(output).toBe(csharp);
    })
    // a consumer's receiver-type hook (ccxt's classifier names the declaration it retyped) proves
    // the receiver already carries a dictionary: the element WRITE needs no interface cast. The
    // unhooked emission is the test above — byte-identical with no hook installed.
    test('a dict-typed receiver drops the element-write cast when the type hook names it', () => {
        const config = {
            'verbose': false,
            'csharp': {
                'parser': {
                    'NUM_LINES_END_FILE': 0,
                    'ELEMENT_ACCESS_WRAPPER_OPEN': 'getValue(',
                    'ELEMENT_ACCESS_WRAPPER_CLOSE': ')'
                }
            }
        }
        const hooked = new Transpiler(config);
        const ts =
        "const x = {};\n" +
        "x[\"teste\"] = 1;";
        hooked.csharpTranspiler.csharpDeclaredReceiverType = (node) => (node?.escapedText === 'x') ? 'Dictionary<string, object>' : undefined;
        expect(hooked.transpileCSharp(ts).content).toBe(
            "object x = new Dictionary<string, object>() {};\n" +
            "x[\"teste\"] = 1;");
        hooked.csharpTranspiler.csharpDeclaredReceiverType = (node) => (node?.escapedText === 'x') ? 'IDictionary<string, object>' : undefined;
        expect(hooked.transpileCSharp(ts).content).toBe(
            "object x = new Dictionary<string, object>() {};\n" +
            "x[\"teste\"] = 1;");
        // an object receiver (the hook names no type) keeps the cast
        hooked.csharpTranspiler.csharpDeclaredReceiverType = () => undefined;
        expect(hooked.transpileCSharp(ts).content).toBe(
            "object x = new Dictionary<string, object>() {};\n" +
            "((IDictionary<string,object>)x)[\"teste\"] = 1;");
    })
    test('a non-string key keeps the element-write cast even on a dict-typed receiver', () => {
        const config = {
            'verbose': false,
            'csharp': {
                'parser': {
                    'NUM_LINES_END_FILE': 0,
                    'ELEMENT_ACCESS_WRAPPER_OPEN': 'getValue(',
                    'ELEMENT_ACCESS_WRAPPER_CLOSE': ')'
                }
            }
        }
        const hooked = new Transpiler(config);
        hooked.csharpTranspiler.csharpDeclaredReceiverType = (node) => (node?.escapedText === 'x') ? 'Dictionary<string, object>' : undefined;
        const ts =
        "const x = {};\n" +
        "x[1] = 1;";
        expect(hooked.transpileCSharp(ts).content).toBe(
            "object x = new Dictionary<string, object>() {};\n" +
            "((List<object>)x)[Convert.ToInt32(1)] = 1;");
    })
    // the typed dict read family: the consumer's classifier proves the receiver's declared C# type
    // (see build/csharp-local-types.js), the printer then binds the typed static twin. Without the
    // hook (undefined) every read keeps the `getValue (...)` wrapper byte for byte.
    describe('typed dict element access', () => {
        const install = (answer) => {
            (transpiler as any).csharpTranspiler.csharpElementAccessTypedReceiver = answer;
        };
        afterEach(() => {
            install(() => undefined);
        });
        test('a proven dict receiver with a literal key binds the typed twin', () => {
            install(() => 'IDictionary<string, object>');
            const ts =
            "const a = {};\n" +
            "const b = a[\"teste\"]\n" +
            "a[\"b\"] = a[\"teste\"];"
            const csharp =
            "object a = new Dictionary<string, object>() {};\n" +
            "object b = GetValue(a, \"teste\");\n" +
            "((IDictionary<string,object>)a)[\"b\"] = GetValue(a, \"teste\");"
            const output = transpiler.transpileCSharp(ts).content;
            expect(output).toBe(csharp);
        })
        test('a non-literal key keeps the wrapper (the twin takes a string)', () => {
            install((node: any) => (tsApi.isStringLiteralLike(node.argumentExpression) ? 'IDictionary<string, object>' : undefined));
            const ts =
            "class Exchange {\n" +
            "    async read (key) {\n" +
            "        const a = {};\n" +
            "        const byLiteral = a[\"teste\"];\n" +
            "        const byName = a[key];\n" +
            "        return [ byLiteral, byName ];\n" +
            "    }\n" +
            "}";
            const output = transpiler.transpileCSharp(ts).content;
            expect(output).toContain("GetValue(a, \"teste\")");
            expect(output).toContain("getValue(a, key)");
        })
        test('an element write is never rewritten to the read twin', () => {
            install(() => 'IDictionary<string, object>');
            const ts =
            "class Exchange {\n" +
            "    write (v) {\n" +
            "        const a = {};\n" +
            "        a[\"teste\"] = v;\n" +
            "        return a;\n" +
            "    }\n" +
            "}";
            const output = transpiler.transpileCSharp(ts).content;
            expect(output).toContain("((IDictionary<string,object>)a)[\"teste\"] = v;");
            expect(output).not.toContain("GetValue(a, \"teste\")");
        })
        test('an unproven receiver keeps the wrapper', () => {
            install(() => undefined);
            const ts =
            "const a = {};\n" +
            "const b = a[\"teste\"];"
            const output = transpiler.transpileCSharp(ts).content;
            expect(output).toContain("object b = getValue(a, \"teste\");");
        })
    })
    // test('basic throw statement', () => {
    //     const ts =
    //     "function test () {\n" +
    //     "    throw new InvalidOrder (\"error\")\n" +
    //     "}";
    //     const csharp =
    //     "function test() {\n" +
    //     "    throw new InvalidOrder('error');\n" +
    //     "}";
    //     const output = transpiler.transpileCSharp(ts).content;
    //     expect(output).toBe(csharp);
    // })
    test('basic comparison operators', () => {
        const ts =
        "const a = 1;\n" +
        "const b = 1+1;\n" +
        "const c = a === b;\n" +
        "const d = a !== b;\n" +
        "const e = a < b;\n" +
        "const f = a > b;\n" +
        "const g = a >= b;\n" +
        "const h = a <= b;";
        const csharp =
        "object a = 1;\n" +
        "object b = add(1, 1);\n" +
        "bool c = isEqual(a, b);\n" +
        "bool d = !isEqual(a, b);\n" +
        "bool e = isLessThan(a, b);\n" +
        "bool f = isGreaterThan(a, b);\n" +
        "bool g = isGreaterThanOrEqual(a, b);\n" +
        "bool h = isLessThanOrEqual(a, b);"
        const output = transpiler.transpileCSharp(ts).content;
        expect(output).toBe(csharp);
    })
    // test('basic math functions', () => {
    //     const ts =
    //     "const num = 5\n" + 
    //     "const ceil = Math.ceil (num);\n" +
    //     "const a = Math.min (0, 5);\n" +
    //     "const b = Math.max (0, 5);\n" +
    //     "const c = parseFloat ('1.3');\n" +
    //     "const d = parseInt ('1.3');\n" +
    //     "const e = Number.MAX_SAFE_INTEGER;\n" +
    //     "const f = Math.abs (-2);\n" +
    //     "const g = Math.pow (1, 2);\n" +
    //     "const h = Math.round (5);\n" +
    //     "const i = Math.floor (5.5);\n";
    //     const csharp =
    //     "object num = 5;\n" +
    //     "object ceil = Math.Ceiling((double)num);\n" +
    //     "object a = mathMin(0, 5);\n" +
    //     "object b = mathMax(0, 5);\n" +
    //     "object c = parseFloat(\"1.3\");\n" +
    //     "object d = parseInt(\"1.3\");\n" +
    //     "object e = Int32.MaxValue;\n" +
    //     "object f = Math.Abs((double)-2);\n" +
    //     "object g = Math.Pow((double)1, (double)2);\n" +
    //     "object h = Math.Round((double)5);\n" +
    //     "object i = Math.Floor((double)5.5);"
    //     const output = transpiler.transpileCSharp(ts).content;
    //     expect(output).toBe(csharp);
    // })
    // test('basic json methods', () => {
    //     const ts =
    //     "const j = JSON.stringify ({ 'a': 1, 'b': 2 });\n" +
    //     "const k = JSON.parse (j);\n";
    //     const csharp =
    //     "$j = json_encode(array(\n" +
    //     "    'a' => 1,\n" +
    //     "    'b' => 2,\n" +
    //     "));\n" +
    //     "$k = json_decode($j, $as_associative_array = true);";
    //     const output = transpiler.transpileCSharp(ts).content;
    //     expect(output).toBe(csharp);
    // })
    test('string length', () => {
        const ts =
        "const myStr = \"test\";\n" +
        "const ff = myStr.length;"
        const csharp =
        "string myStr = \"test\";\n" +
        "int ff = myStr.Length;"
        const output = transpiler.transpileCSharp(ts).content;
        expect(output).toBe(csharp);
    })
    // the receiver's static C# type is what decides the `((string)x)` wrapper: a local the
    // printer itself declares `string` already IS a string, so the cast names nothing
    test('string method receivers on a printer-typed local drop the cast', () => {
        const ts =
        "const s = \"Test\";\n" +
        "const a = s.toUpperCase();\n" +
        "const b = s.toLowerCase();\n" +
        "const c = s.trim();\n" +
        "const d = s.split(\"e\");\n" +
        "const e = s.replace(\"t\", \"x\");\n" +
        "const f = s.length;"
        const csharp =
        "string s = \"Test\";\n" +
        "string a = s.ToUpper();\n" +
        "string b = s.ToLower();\n" +
        "string c = s.Trim();\n" +
        "List<object> d = s.Split(new [] {((string)\"e\")}, StringSplitOptions.None).ToList<object>();\n" +
        "string e = s.Replace((string)\"t\", (string)\"x\");\n" +
        "int f = s.Length;"
        const output = transpiler.transpileCSharp(ts).content;
        expect(output).toBe(csharp);
    })
    test('string method receivers on an object local keep the cast', () => {
        const ts =
        "const s = this.safeString (m, \"k\");\n" +
        "const a = s.trim();\n" +
        "const b = s.toUpperCase();\n" +
        "const c = s.length;"
        const csharp =
        "object s = callDynamically(this, \"safeString\", new object[] { m, \"k\" });\n" +
        "string a = ((string)s).Trim();\n" +
        "string b = ((string)s).ToUpper();\n" +
        "int c = getArrayLength(s);"
        const output = transpiler.transpileCSharp(ts).content;
        expect(output).toBe(csharp);
    })
    test('string method receivers on a parameter keep the cast', () => {
        const ts =
        "function f (x) {\n" +
        "    const a = x.toUpperCase();\n" +
        "    const b = x.trim();\n" +
        "    return a;\n" +
        "}"
        const csharp =
        "public object f(object x)\n" +
        "{\n" +
        "    string a = ((string)x).ToUpper();\n" +
        "    string b = ((string)x).Trim();\n" +
        "    return a;\n" +
        "}"
        const output = transpiler.transpileCSharp(ts).content;
        expect(output).toBe(csharp);
    })
    test('string method receiver on a call keeps the cast', () => {
        const ts =
        "const a = this.safeString (m, \"k\").trim();"
        const csharp =
        "string a = ((string)callDynamically(this, \"safeString\", new object[] { m, \"k\" })).Trim();"
        const output = transpiler.transpileCSharp(ts).content;
        expect(output).toBe(csharp);
    })
    test('array length', () => {
        const ts =
        "const myArray = [1, 2, 3];\n" +
        "const aa = myArray.length;"
        const csharp =
        "object myArray = new List<object>() {1, 2, 3};\n" +
        "int aa = getArrayLength(myArray);"
        const output = transpiler.transpileCSharp(ts).content;
        expect(output).toBe(csharp);
    })
    // test('basic string methods', () => {
    //     const ts =
    //     "let a = \"test\";\n" +
    //     "const w = a.toString();\n" +
    //     "a+= \"mundo\";\n" +
    //     "const t = a.split(\",\");\n" +
    //     "const b = a.length;\n" +
    //     "const c = a.indexOf(\"t\");\n" +
    //     "const d = a.toLowerCase();\n" +
    //     "const e = a.toUpperCase();"
    //     const csharp =
    //     "object a = \"test\";\n" +
    //     "object w = a.ToString();\n" +
    //     "a += \"mundo\";\n" +
    //     "object t = ((string)a).Split(\",\").ToList<string>();\n" +
    //     "object b = ((string)a).Length;\n" +
    //     "object c = getIndexOf(a, \"t\");\n" +
    //     "object d = ((string)a).ToLower();\n" +
    //     "object e = ((string)a).ToUpper();"
    //     const output = transpiler.transpileCSharp(ts).content;
    //     expect(output).toBe(csharp);
    // })
    // test('basic array manipulation', () => {
    //     const ts =
    //     "const myList = [1, 2, 3];\n" +
    //     "const y = myList.join (',')\n" +
    //     "const i = myList.indexOf(1);\n" +
    //     "const listLength = myList.length;\n" +
    //     "const listFirst = myList[0];\n" +
    //     "myList.push (4);\n" +
    //     "myList.pop ();\n" +
    //     "myList.reverse ();\n" +
    //     "myList.shift ();"
    //     const csharp =
    //     "$myList = [1, 2, 3];\n" +
    //     "$y = implode(',', $myList);\n" +
    //     "$i = array_search(1, $myList);\n" + 
    //     "$listLength = count($myList);\n" +
    //     "$listFirst = $myList[0];\n" +
    //     "$myList[] = 4;\n" +
    //     "array_pop($myList);\n" +
    //     "array_reverse($myList);\n" +
    //     "array_shift($myList);"
    //     const output = transpiler.transpileCSharp(ts).content;
    //     expect(output).toBe(csharp);
    // })
    // test('basic conditional expression', () => {
    //     const ts =
    //     "const frase = \"ola\";\n" +
    //     "const testN = frase.length > 0 ? frase.length : 0;"
    //     const csharp =
    //     "object frase = \"ola\";\n" +
    //     "object testN = isGreaterThan(((string)frase).Length, 0) ? ((string)frase).Length : 0;" 
    //     const output = transpiler.transpileCSharp(ts).content;
    //     expect(output).toBe(csharp);
    // })
    // test('basic object methods', () => {
    //     const ts =
    //     "const x = {};\n" +
    //     "const y = Object.keys(x);\n" +
    //     "const z = Object.values(x);"
    //     const csharp =
    //     "object x = new Dictionary<string, object>() {};\n" +
    //     "object y = new List<string>(((Dictionary<string,object>)x).Keys);\n" +
    //     "object z = new List<object>(((Dictionary<string,object>)x).Values);"
    //     const output = transpiler.transpileCSharp(ts).content;
    //     expect(output).toBe(csharp);
    // })
    // test('basic instanceof statement', () => {
    //     const ts =
    //     "if (e instanceof NullResponse) {\n" +
    //     "    return [];\n" +
    //     "}"
    //     const csharp =
    //     "if (e instanceof NullResponse) {\n" +
    //     "    return [];\n" +
    //     "}"
    //     const output = transpiler.transpileCSharp(ts).content;
    //     expect(output).toBe(csharp);
    // })
    // test('basic typeof expressions', () => {
    //     const ts =
    //     "const response = \"foo\";\n" +
    //     "typeof response !== 'string'\n" +
    //     "typeof response === 'object'\n" +
    //     "typeof response === 'boolean'\n" +
    //     "typeof response === 'number'";
    //     const csharp =
    //     "$response = 'foo';\n" +
    //     "!is_string($response);\n" +
    //     "is_array($response);\n" +
    //     "is_bool($response);\n" +
    //     "(is_int($response) || is_float($response));";
    //     const output = transpiler.transpileCSharp(ts).content;
    //     expect(output).toBe(csharp);
    // })
    // test('basic indexOf string [check existence]', () => {
    //     const ts =
    //     "const myString = \'bar\'\n" +
    //     "const exists = myString.indexOf (\"b\") >= 0;"
    //     const csharp =
    //     "$myString = 'bar';\n" +
    //     "$exists = mb_strpos($myString, 'b') !== false;"
    //     const output = transpiler.transpileCSharp(ts).content;
    //     expect(output).toBe(csharp);
    // })
    // test('basic indexOf array [check existence]', () => {
    //     const ts =
    //     "const x = [1,2,3];\n" +
    //     "const y = x.indexOf(1) >= 0;"
    //     const csharp =
    //     "$x = [1, 2, 3];\n" +
    //     "$y = in_array(1, $x);"
    //     const output = transpiler.transpileCSharp(ts).content;
    //     expect(output).toBe(csharp);
    // })
    test('basic includes string', () => {
        const ts =
        "const myString = \'bar\'\n" +
        "const exists = myString.includes (\"b\");"
        const csharp =
        "string myString = \"bar\";\n" +
        "object exists = myString.Contains(\"b\");"
        const output = transpiler.transpileCSharp(ts).content;
        expect(output).toBe(csharp);
    })
    test('basic includes array', () => {
        const ts =
        "const x = [1,2,3];\n" +
        "const y = x.includes(1);"
        const csharp =
        "object x = new List<object>() {1, 2, 3};\n" +
        "object y = x.Contains(1);"
        const output = transpiler.transpileCSharp(ts).content;
        expect(output).toBe(csharp);
    })
    test('basic as expression', () => {
        const ts =
        "const x = 1;\n" +
        "const a = \"foo\";\n" +
        "const y = x as any;\n" +
        "const t = a as string;\n" +
        "const z = x as number;"
        const csharp =
        "object x = 1;\n" +
        "string a = \"foo\";\n" +
        "object y = ((object)x);\n" +
        "object t = ((string)a);\n" +
        "object z = x;" 
        const output = transpiler.transpileCSharp(ts).content;
        expect(output).toBe(csharp);
    })
    // test('basic postfixUnary expression', () => {
    //     const ts =
    //     "let x = 1;\n" +
    //     "x++;\n" +
    //     "let y = 1;\n" +
    //     "y--;"
    //     const csharp =
    //     "object x = 1;\n" +
    //     "x++;\n" +
    //     "object y = 1;\n" +
    //     "y--;"
    //     const output = transpiler.transpileCSharp(ts).content;
    //     expect(output).toBe(csharp);
    // });
    // test('should convert Promise.all to Promise\\all', () => {
    //     transpiler.setPhpUncamelCaseIdentifiers(true);
    //     const ts =
    //     "let promises = [ this.fetchSwapAndFutureMarkets (params), this.fetchUSDCMarkets (params) ];\n" +
    //     "promises = await Promise.all (promises);";
    //     const csharp =
    //     "$promises = [$this->fetch_swap_and_future_markets($params), $this->fetch_usdc_markets($params)];\n" +
    //     "$promises = Async\\await(Promise\\all($promises));" 
    //     const output = transpiler.transpileCSharp(ts).content;
    //     expect(output).toBe(csharp);
    //     transpiler.setPhpUncamelCaseIdentifiers(false);
    // })
    // test('should convert JS doc', () => {
    //     const ts =
    //     "function fetchStatus (params ) {\n" +
    //     "    /**\n" +
    //     "     * @method\n" +
    //     "     * @name aax#fetchStatus\n" +
    //     "     * @description the latest known information on the availability of the exchange API\n" +
    //     "     * @param {object} params extra parameters specific to the aax api endpoint\n" +
    //     "     * @returns {object} a [status structure]{@link https://docs.ccxt.com/en/latest/manual.html#exchange-status-structure}\n" +
    //     "     */\n" +
    //     "    return 1;\n" +
    //     "}";
    //     const csharp =
    //     "function fetchStatus($params) {\n" +
    //     "    /**\n" +
    //     "     * the latest known information on the availability of the exchange API\n" +
    //     "     * @param {array} params extra parameters specific to the aax api endpoint\n" +
    //     "     * @return {array} a {@link https://docs.ccxt.com/en/latest/manual.html#exchange-status-structure status structure}\n" +
    //     "     */\n" +
    //     "    return 1;\n" +
    //     "}";
    //     const output = transpiler.transpileCSharp(ts).content;
    //     expect(output).toBe(csharp);
    // })
    test('should convert regular comment', () => {
        const ts =
        "class t {\n" +
        "\n" +
        "    fn(): void {\n" +
        "        // my comment 1\n" +
        "        // my comment 2        \n" +
        "        console.log(\"Hello World!\");\n" +
        "    }\n" +
        "}"
        const csharp =
        "class t\n" +
        "{\n" +
        "    public virtual void fn()\n" +
        "    {\n" +
        "        // my comment 1\n" +
        "        // my comment 2\n" +
        "        Console.WriteLine(\"Hello World!\");\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileCSharp(ts).content;
        expect(output).toBe(csharp);
    })
    test('should convert leading and trailing comments', () => {
        const ts =
        "// I'm a leading comment\n" +
        "const z = \"my var\" // I'm a trailing comment\n" +
        "const a = \"bar\" // I'm second trailing comment\n";
        const csharp =
        "// I'm a leading comment\n" +
        "string z = \"my var\"; // I'm a trailing comment\n" +
        "string a = \"bar\"; // I'm second trailing comment";
        const output = transpiler.transpileCSharp(ts).content;
        expect(output).toBe(csharp);
    })
    // test('should keep function comments', () => {
    //     const ts =
    //     "class t {\n" +
    //     "    // this is a comment\n" +
    //     "    parseToInt (number: string) {\n" +
    //     "        // Solve Common parseInt misuse ex: parseInt ((since / 1000).toString ())\n" +
    //     "        // using a number as parameter which is not valid in ts\n" +
    //     "        const stringifiedNumber = number.toString ();\n" +
    //     "        const convertedNumber = parseFloat (stringifiedNumber) as any;\n" +
    //     "        return parseInt (convertedNumber);\n" +
    //     "    }\n" +
    //     "}"
    //     const csharp =
    //     "class t\n" +
    //     "{\n" +
    //     "    // this is a comment\n" +
    //     "    public virtual object parseToInt(string number)\n" +
    //     "    {\n" +
    //     "        // Solve Common parseInt misuse ex: parseInt ((since / 1000).toString ())\n" +
    //     "        // using a number as parameter which is not valid in ts\n" +
    //     "        object stringifiedNumber = number.ToString();\n" +
    //     "        object convertedNumber = float.Parse(stringifiedNumber);\n" +
    //     "        return Int32.Parse(convertedNumber);\n" +
    //     "    }\n" +
    //     "}"
    //     const output = transpiler.transpileCSharp(ts).content;
    //     expect(output).toBe(csharp);
    // })
    test('basic try-catch-block', () => {
        const ts =
        "try {\n" +
        "    const x = 1;\n" +
        "} catch (e) {\n" +
        "    console.log(e);\n" +
        "}"
        const csharp =
        "try\n{\n" +
        "    object x = 1;\n" +
        "} catch(Exception e)\n{\n" +
        "    Console.WriteLine(e);\n" +
        "}"
        const output = transpiler.transpileCSharp(ts).content;
        expect(output).toBe(csharp);
    })
    test('should remove cjs import from transpiled code', () => {
        const ts =
        "const {a,b,x} = require  ('ola')  \n" +
        "const myVar = a.b;";
        const csharp = "object myVar = a.b;"
        const output = transpiler.transpileCSharp(ts).content;
        expect(output).toBe(csharp);
    });
    test('should remove cjs exports from transpiled code', () => {
        const ts =
        "module.exports = {\n" +
        "    a,\n" +
        "    b,\n" +
        "    c,\n" +
        "}";
        const csharp = ""
        const output = transpiler.transpileCSharp(ts).content;
        expect(output).toBe(csharp);
    });
    // test('advanced: should infer arg type from parent method', () => {
    //     const ts =
    //     "class a {\n" +
    //     "\n" +
    //     "    main(a:string) {\n" +
    //     "        return \"1\";\n" +
    //     "    }\n" +
    //     "}\n" +
    //     "\n" +
    //     "class b extends a{\n" +
    //     "    main(a) {\n" +
    //     "        return \"2\";\n" +
    //     "    }\n" +
    //     "}"
    //     const csharp = 
    //     "class a\n" +
    //     "{\n" +
    //     "    public virtual string main(string a)\n" +
    //     "    {\n" +
    //     "        return ((string) (\"1\"));\n" +
    //     "    }\n" +
    //     "}\n" +
    //     "class b : a\n" +
    //     "{\n" +
    //     "    public override string main(string a)\n" +
    //     "    {\n" +
    //     "        return ((string) (\"2\"));\n" +
    //     "    }\n" +
    //     "}"
    //     const output = transpiler.transpileCSharp(ts).content;
    //     expect(output).toBe(csharp);
    // });
    test('should transpile Number.isInteger', () => {
        const ts = "Number.isInteger(1)";
        const csharp = "((1 is int) || (1 is long) || (1 is Int32) || (1 is Int64));";
        const output = transpiler.transpileCSharp(ts).content;
        expect(output).toBe(csharp);
    });
    test('should convert date.now()', () => {
        const ts = "Date.now();";
        const csharp = "(new DateTimeOffset(DateTime.UtcNow)).ToUnixTimeMilliseconds();";
        const output = transpiler.transpileCSharp(ts).content;
        expect(output).toBe(csharp);
    });
    test('should convert delete', () => {
        const ts = "delete someObject[key];";
        const csharp = "((IDictionary<string,object>)someObject).Remove((string)key);";
        const output = transpiler.transpileCSharp(ts).content;
        expect(output).toBe(csharp);
    });
    test('should convert concat', () => {
        const ts = "y.concat(z)";
        const result = "concat(y, z);";
        const output = transpiler.transpileCSharp(ts).content;
        expect(output).toBe(result);
    });
    test('string literal', () => {
        const ts = "const x = \"foo, 'single', \\\"double\\\" \\t \\n \\r \\b \\f \";";
        const csharp = "string x = \"foo, 'single', \\\"double\\\" \\t \\n \\r \\b \\f \";";
        const output = transpiler.transpileCSharp(ts).content;
        expect(output).toBe(csharp);
    });
    // test('should convert isArray', () => {
    //     const ts = "Array.isArray(x);";
    //     const result = "((x is IList<object>) || (x.GetType().IsGenericType && x.GetType().GetGenericTypeDefinition().IsAssignableFrom(typeof(List<>))));";
    //     const output = transpiler.transpileCSharp(result).content;
    //     expect(output).toBe(result);
    // });
    // test('should transpile file from path', () => {
    //     transpiler.setPhpUncamelCaseIdentifiers(true);
    //     const csharp = readFileSync ('./tests/files/output/php/test1.php', "utf8");
    //     const output = transpiler.transpileCSharpByPath('./tests/files/input/test1.ts').content;
    //     transpiler.setPhpUncamelCaseIdentifiers(false);
    //     expect(output).toBe(csharp);
    // });
    test('should convert search', () => {
        const ts = '"abcdxtzyw".search("xt");';
        const csharp = '((string)"abcdxtzyw").IndexOf("xt");';
        const output = transpiler.transpileCSharp(ts).content;
        expect(output).toBe(csharp);
    });
    test('non-async Promise-returning delegator transpiles like async return await', () => {
        // a method without `async` that returns a Promise (e.g. WS delegators
        // like `watchTicker(...) { return this.watchTickerInner(...); }`)
        // must produce the exact same C# as its `async`/`return await` twin:
        // `async ... Task<object>` signature + `return await ...`.
        const input =
        "class Exchange {\n" +
        "    async watchTickerInner(symbol: string): Promise<any> {\n" +
        "        return { 'symbol': symbol };\n" +
        "    }\n" +
        "    watchTicker(symbol: string): Promise<any> {\n" +
        "        return this.watchTickerInner(symbol);\n" +
        "    }\n" +
        "    async watchTickerClassic(symbol: string): Promise<any> {\n" +
        "        return await this.watchTickerInner(symbol);\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileCSharp(input).content;
        expect(output).toContain("public async virtual Task<object> watchTicker(object symbol)");
        expect(output).toContain("return await this.watchTickerInner(symbol);");
        // must not return the bare Task without awaiting it
        expect(output).not.toContain("return this.watchTickerInner(symbol);");
        // delegator body must be identical to the classic async/return await version
        const getBody = (name: string) => {
            const start = output.indexOf(`Task<object> ${name}(`);
            const open = output.indexOf('{', start);
            const close = output.indexOf('}', open);
            return output.slice(open, close + 1);
        };
        expect(getBody('watchTicker')).toBe(getBody('watchTickerClassic'));
    });
  });

describe('as string[] assertion must not emit a hard IList<string> runtime cast', () => {
    test('element access through as string[] stays covariance-safe', () => {
        const input =
        "class T {\n" +
        "    helper(argSymbols) {\n" +
        "        const first = (argSymbols as string[])[0];\n" +
        "        return first;\n" +
        "    }\n" +
        "    test() {\n" +
        "        const symbol = 'BTC/USDT';\n" +
        "        this.helper([ symbol ]);\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileCSharp(input).content;
        // no runtime cast of either flavor - IList<T> is invariant both ways,
        // so any hard cast breaks one of the two legitimate runtime list types
        expect(output).not.toContain('(IList<object>)');
        expect(output).not.toContain('(IList<string>)');
    });
});

describe('csharp typed body locals', () => {
    test('locals whose initializer has a concrete C# type are declared with it', () => {
        const input =
        "class Exchange {\n" +
        "    extend(a, b) { return a; }\n" +
        "    milliseconds() { return 1; }\n" +
        "    main(market) {\n" +
        "        const upper = market.toUpperCase();\n" +
        "        const parts = market.split('/');\n" +
        "        const count = parts.length;\n" +
        "        const same = (upper === market);\n" +
        "        const merged = this.extend({}, market);\n" +
        "        const now = this.milliseconds();\n" +
        "        const keys = Object.keys(merged);\n" +
        "        return [upper, parts, count, same, merged, now, keys];\n" +
        "    }\n" +
        "}";
        const output = transpiler.transpileCSharp(input).content;
        expect(output).toContain("string upper = ((string)market).ToUpper()");
        expect(output).toContain("List<object> parts = ((string)market).Split(");
        expect(output).toContain("int count = getArrayLength(parts)");
        expect(output).toContain("bool same = (isEqual(upper, market))");
        expect(output).toContain("Dictionary<string, object> merged = this.extend(");
        expect(output).toContain("Int64 now = this.milliseconds()");
        expect(output).toContain("List<object> keys = new List<object>(");
    });
    test('helpers that return object keep the local untyped', () => {
        const input =
        "class Exchange {\n" +
        "    safeValue(a, b) { return a; }\n" +
        "    main(item, a, b) {\n" +
        "        const income = this.safeValue(item, 'income');\n" +
        "        const first = item['first'];\n" +
        "        const sum = a + b;\n" +
        "        const picked = a ? b : item;\n" +
        "        const sliced = item.slice(0, 2);\n" +
        "        return [income, first, sum, picked, sliced];\n" +
        "    }\n" +
        "}";
        const output = transpiler.transpileCSharp(input).content;
        expect(output).toContain("object income = this.safeValue(item, \"income\")");
        expect(output).toContain("object first = getValue(item, \"first\")");
        expect(output).toContain("object sum = add(a, b)");
        expect(output).toContain("object picked = ");
        expect(output).toContain("object sliced = slice(item, 0, 2)");
    });
    test('safe* locals are declared with the helper\'s concrete C# type', () => {
        const input =
        "class Exchange {\n" +
        "    safeString(a, b) { return a; }\n" +
        "    safeInteger(a, b) { return a; }\n" +
        "    safeBool(a, b) { return a; }\n" +
        "    safeDict(a, b) { return a; }\n" +
        "    safeList(a, b) { return a; }\n" +
        "    main(item) {\n" +
        "        const id = this.safeString(item, 'id');\n" +
        "        const count = this.safeInteger(item, 'count');\n" +
        "        const flag = this.safeBool(item, 'flag');\n" +
        "        const nested = this.safeDict(item, 'nested');\n" +
        "        const rows = this.safeList(item, 'rows');\n" +
        "        return [id, count, flag, nested, rows];\n" +
        "    }\n" +
        "}";
        const output = transpiler.transpileCSharp(input).content;
        expect(output).toContain("string? id = this.safeString(item, \"id\")");
        expect(output).toContain("Int64? count = this.safeInteger(item, \"count\")");
        expect(output).toContain("bool? flag = this.safeBool(item, \"flag\")");
        expect(output).toContain("IDictionary<string, object> nested = this.safeDict(item, \"nested\")");
        expect(output).toContain("List<object> rows = this.safeList(item, \"rows\")");
    });
    test('safe* locals under a `+` LEFT operand or a numeric ref sink stay object', () => {
        const input =
        "class Exchange {\n" +
        "    safeString(a, b) { return a; }\n" +
        "    safeInteger(a, b) { return a; }\n" +
        "    main(item) {\n" +
        "        const found = this.safeString(item, 'id');\n" +
        "        const key = found + ':x';\n" +
        "        const count = this.safeInteger(item, 'count');\n" +
        "        const negated = -count;\n" +
        "        return [key, negated];\n" +
        "    }\n" +
        "}";
        const output = transpiler.transpileCSharp(input).content;
        expect(output).toContain("object found = this.safeString(item, \"id\")");
        expect(output).toContain("object count = this.safeInteger(item, \"count\")");
    });
    test('a this-call the printer cannot resolve stays object — it prints callDynamically', () => {
        // no class declares `safeString` here, so the printed call is
        // `callDynamically(this, "safeString", ...)`, whose C# signature returns `object`:
        // the concrete-type table describes the same-name base helper, not this wrapper
        const input =
        "function f () {\n" +
        "    const x = this.safeString({}, 'k');\n" +
        "    return x;\n" +
        "}";
        const output = transpiler.transpileCSharp(input).content;
        expect(output).toContain("object x = callDynamically(this, \"safeString\"");
        expect(output).not.toContain("string? x =");
    });
    test('a local appended to, incremented or spread stays object', () => {
        const input =
        "class Exchange {\n" +
        "    safeString(a, b) { return a; }\n" +
        "    main(market, other) {\n" +
        "        const appended = market.split('/');\n" +
        "        appended.push('extra');\n" +
        "        let reassigned = market.toUpperCase();\n" +
        "        reassigned = this.safeString(other, 'x');\n" +
        "        let counted = market.length;\n" +
        "        counted++;\n" +
        "        let grown = market.toUpperCase();\n" +
        "        grown += 'x';\n" +
        "        return [appended, reassigned, counted, grown];\n" +
        "    }\n" +
        "}";
        const output = transpiler.transpileCSharp(input).content;
        expect(output).toContain("object appended = ((string)market).Split(");
        expect(output).toContain("object reassigned = ((string)market).ToUpper()");
        expect(output).toContain("object counted = getArrayLength(market)");
        expect(output).toContain("object grown = ((string)market).ToUpper()");
    });
    test('a local reassigned with the same concrete type keeps the type', () => {
        const input =
        "class Exchange {\n" +
        "    main(market, other) {\n" +
        "        let upper = market.toUpperCase();\n" +
        "        upper = other.toUpperCase();\n" +
        "        return upper;\n" +
        "    }\n" +
        "}";
        const output = transpiler.transpileCSharp(input).content;
        expect(output).toContain("string upper = ((string)market).ToUpper()");
    });
    test('a renamed local is scanned under its source name', () => {
        // `params` prints as `parameters`; the reject scan must still see the
        // destructuring assignment that reassigns it
        const input =
        "class Exchange {\n" +
        "    handleMarketTypeAndParams(a, b, c) { return [a, b]; }\n" +
        "    main(params) {\n" +
        "        let type = 'spot';\n" +
        "        [ type, params ] = this.handleMarketTypeAndParams('fetchBalance', undefined, params);\n" +
        "        return type;\n" +
        "    }\n" +
        "}";
        const output = transpiler.transpileCSharp(input).content;
        expect(output).toContain("object type = \"spot\"");
    });
    test('a parameter shadowing a C# type name blocks that refinement', () => {
        const input =
        "class Exchange {\n" +
        "    main(bool, other) {\n" +
        "        const flag = other.startsWith('x');\n" +
        "        return [bool, flag];\n" +
        "    }\n" +
        "}";
        const output = transpiler.transpileCSharp(input).content;
        expect(output).toContain("object flag = ((string)other).StartsWith(");
    });
    test('a method declared `: boolean` returns bool and unboxes through object', () => {
        const input =
        "class Exchange {\n" +
        "    isDictionary (value: any): boolean {\n" +
        "        return (value !== undefined) && (typeof value === 'object');\n" +
        "    }\n" +
        "}";
        const output = transpiler.transpileCSharp(input).content;
        expect(output).toContain("public virtual bool isDictionary(object value)");
        // the `isTrue(...)` the `&&` operand used to carry is gone: the operand
        // prints as a C# bool (this is #82's csharpConditionPrintsBool node-shape fold,
        // and S62's printed-form fold names the same identity); the return unbox is
        // unchanged
        expect(output).toContain("return ((bool)((object)((!isEqual(value, null)) && ((value is IDictionary<string, object>))))!);");
    });
    test('a method declared `: boolean | undefined` (or an alias) returns bool? and keeps null', () => {
        const input =
        "type Bool = boolean | undefined;\n" +
        "class Exchange {\n" +
        "    safeValue (a, b, c = undefined) { return a; }\n" +
        "    safeBool (dictionaryOrList: any, key: any, defaultValue: Bool = undefined): boolean | undefined {\n" +
        "        const value = this.safeValue (dictionaryOrList, key, defaultValue);\n" +
        "        if (typeof value === 'boolean') {\n" +
        "            return value;\n" +
        "        }\n" +
        "        return defaultValue;\n" +
        "    }\n" +
        "    aliased (x: any): Bool {\n" +
        "        return undefined;\n" +
        "    }\n" +
        "}";
        const output = transpiler.transpileCSharp(input).content;
        expect(output).toContain("public virtual bool? safeBool(object dictionaryOrList, object key, object defaultValue = null)");
        expect(output).toContain("return ((bool?)((object)(value)));");
        expect(output).toContain("return ((bool?)((object)(defaultValue)));");
        expect(output).toContain("public virtual bool? aliased(object x)");
        expect(output).toContain("return ((bool?)((object)(null)));");
    });
    test('boolean return typing skips async, inferred and mixed-union methods and callback returns', () => {
        const input =
        "class Exchange {\n" +
        "    async later (x: any): Promise<boolean> { return true; }\n" +
        "    inferred (x: any) { return true; }\n" +
        "    mixed (x: any): boolean | string { return x; }\n" +
        "    filtered (items: any[]): boolean {\n" +
        "        const found = items.filter ((i) => { return i > 1; });\n" +
        "        return found.length > 0;\n" +
        "    }\n" +
        "}";
        const output = transpiler.transpileCSharp(input).content;
        expect(output).toContain("public async virtual Task<object> later(object x)");
        expect(output).toContain("public virtual object inferred(object x)");
        expect(output).toContain("public virtual object mixed(object x)");
        expect(output).toContain("public virtual bool filtered(object items)");
        expect(output).toContain("return isGreaterThan(i, 1);");
        expect(output).toContain("return ((bool)((object)(getArrayLength(found) > 0))!);");
    });
    test('an un-annotated override of a bool? method inherits the parent type and unboxes', () => {
        const input =
        "class Base {\n" +
        "    flag (x: any): boolean | undefined { return undefined; }\n" +
        "}\n" +
        "class Child extends Base {\n" +
        "    flag (x: any) { return true; }\n" +
        "}";
        const output = transpiler.transpileCSharp(input).content;
        expect(output).toContain("public override bool? flag(object x)");
        expect(output).toContain("return ((bool?)((object)(true)));");
    });
    test('guarded reads print the native dictionary indexer', () => {
        const guarded =
        "function f (params: { [key: string]: any }): any {\n" +
        "    if ('x' in params) {\n" +
        "        const y = params['x'];\n" +
        "        return y;\n" +
        "    }\n" +
        "    return undefined;\n" +
        "}";
        const guardedOutput = transpiler.transpileCSharp(guarded).content;
        // the `in` guard prints a C# bool of its own (`inOp` returns bool): no isTrue round-trip
        expect(guardedOutput).toContain('if (inOp(parameters, "x"))');
        expect(guardedOutput).toContain('object y = ((IDictionary<string,object>)parameters)["x"];');
        // the else-branch of a negated guard runs only when the key is there
        const negatedElse =
        "function f (params: { [key: string]: any }): any {\n" +
        "    let y = undefined;\n" +
        "    if (!('x' in params)) {\n" +
        "        y = 1;\n" +
        "    } else {\n" +
        "        y = params['x'];\n" +
        "    }\n" +
        "    return y;\n" +
        "}";
        expect(transpiler.transpileCSharp(negatedElse).content).toContain('y = ((IDictionary<string,object>)parameters)["x"];');
        // `if (!(key in recv)) return ...;` proves presence for everything after it
        const earlyExit =
        "function f (params: { [key: string]: any }): any {\n" +
        "    if (!('x' in params)) {\n" +
        "        return undefined;\n" +
        "    }\n" +
        "    return params['x'];\n" +
        "}";
        expect(transpiler.transpileCSharp(earlyExit).content).toContain('return ((IDictionary<string,object>)parameters)["x"];');
        // a loop condition holds for its body
        const whileGuard =
        "function f (params: { [key: string]: any }): any {\n" +
        "    while ('x' in params) {\n" +
        "        return params['x'];\n" +
        "    }\n" +
        "    return undefined;\n" +
        "}";
        expect(transpiler.transpileCSharp(whileGuard).content).toContain('return ((IDictionary<string,object>)parameters)["x"];');
    });
    test('literal-built receivers print the native indexer for the keys they declare', () => {
        const objectLiteral =
        "function f (): any {\n" +
        "    const x = { 'a': 1 };\n" +
        "    const y = x['a'];\n" +
        "    return y;\n" +
        "}";
        const objectOutput = transpiler.transpileCSharp(objectLiteral).content;
        expect(objectOutput).toContain('object x = new Dictionary<string, object>() {');
        expect(objectOutput).toContain('object y = ((IDictionary<string,object>)x)["a"];');
        const arrayLiteral =
        "function f (): any {\n" +
        "    const x = [ 1, 2 ];\n" +
        "    const y = x[0];\n" +
        "    return y;\n" +
        "}";
        const arrayOutput = transpiler.transpileCSharp(arrayLiteral).content;
        expect(arrayOutput).toContain('object x = new List<object>() {1, 2};');
        expect(arrayOutput).toContain('object y = ((List<object>)x)[0];');
    });
    test('reads the checker cannot prove present keep getValue', () => {
        // no guard at all
        const unproven =
        "function f (params: { [key: string]: any }): any {\n" +
        "    const y = params['x'];\n" +
        "    return y;\n" +
        "}";
        expect(transpiler.transpileCSharp(unproven).content).toContain('object y = getValue(parameters, "x");');
        // non-literal key
        const identifierKey =
        "function f (params: { [key: string]: any }, k: string): any {\n" +
        "    const y = params[k];\n" +
        "    return y;\n" +
        "}";
        expect(transpiler.transpileCSharp(identifierKey).content).toContain('object y = getValue(parameters, k);');
        // guard for another key
        const otherKey =
        "function f (params: { [key: string]: any }): any {\n" +
        "    if ('z' in params) {\n" +
        "        const y = params['x'];\n" +
        "        return y;\n" +
        "    }\n" +
        "    return undefined;\n" +
        "}";
        expect(transpiler.transpileCSharp(otherKey).content).toContain('object y = getValue(parameters, "x");');
        // read outside the guarded branch
        const outsideBranch =
        "function f (params: { [key: string]: any }): any {\n" +
        "    if ('x' in params) {\n" +
        "        const y = 1;\n" +
        "    }\n" +
        "    const z = params['x'];\n" +
        "    return z;\n" +
        "}";
        expect(transpiler.transpileCSharp(outsideBranch).content).toContain('object z = getValue(parameters, "x");');
        // the guard's key is deleted before the read
        const deleted =
        "function f (params: { [key: string]: any }): any {\n" +
        "    if ('x' in params) {\n" +
        "        delete params['x'];\n" +
        "        const y = params['x'];\n" +
        "        return y;\n" +
        "    }\n" +
        "    return undefined;\n" +
        "}";
        expect(transpiler.transpileCSharp(deleted).content).toContain('object y = getValue(parameters, "x");');
        // any-typed receivers are not dictionary-like
        const anyReceiver =
        "function f (params: any): any {\n" +
        "    if ('x' in params) {\n" +
        "        const y = params['x'];\n" +
        "        return y;\n" +
        "    }\n" +
        "    return undefined;\n" +
        "}";
        expect(transpiler.transpileCSharp(anyReceiver).content).toContain('object y = getValue(parameters, "x");');
        // literal that does not declare the key
        const otherLiteralKey =
        "function f (): any {\n" +
        "    const x = { 'a': 1 };\n" +
        "    const y = x['b'];\n" +
        "    return y;\n" +
        "}";
        expect(transpiler.transpileCSharp(otherLiteralKey).content).toContain('object y = getValue(x, "b");');
        // a reassigned local is not the literal the proof described
        const reassigned =
        "function f (): any {\n" +
        "    let x = { 'a': 1 };\n" +
        "    x = undefined;\n" +
        "    const y = x['a'];\n" +
        "    return y;\n" +
        "}";
        expect(transpiler.transpileCSharp(reassigned).content).toContain('object y = getValue(x, "a");');
        // index outside the literal's length
        const outOfRange =
        "function f (): any {\n" +
        "    const x = [ 1, 2 ];\n" +
        "    const y = x[5];\n" +
        "    return y;\n" +
        "}";
        expect(transpiler.transpileCSharp(outOfRange).content).toContain('object y = getValue(x, 5);');
    });
});

describe('isTrue is dropped when the condition already prints a C# bool', () => {
    test('comparison results and bool locals need no isTrue round-trip', () => {
        const input =
        "class T {\n" +
        "    f(a, b) {\n" +
        "        const same = (a === b);\n" +
        "        if (a === b) { return 1; }\n" +
        "        if (same) { return 2; }\n" +
        "        if (!same) { return 3; }\n" +
        "    }\n" +
        "}";
        const output = transpiler.transpileCSharp(input).content;
        expect(output).toContain("if (isEqual(a, b))");
        expect(output).toContain("if (same)");
        expect(output).toContain("if (!same)");
        expect(output).not.toContain("isTrue");
    });
    test('object locals, parameters and bool? calls keep the wrapper', () => {
        const input =
        "class T {\n" +
        "    safeBool(d: any, k: any): boolean | undefined { return undefined; }\n" +
        "    f(a, p) {\n" +
        "        const v = a['k'];\n" +
        "        if (v) { return 1; }\n" +
        "        if (p) { return 2; }\n" +
        "        if (this.safeBool(a, 'k')) { return 3; }\n" +
        "    }\n" +
        "}";
        const output = transpiler.transpileCSharp(input).content;
        expect(output).toContain("if (isTrue(v))");
        expect(output).toContain("if (isTrue(p))");
        expect(output).toContain("if (isTrue(this.safeBool(a, \"k\")))");
    });
    test('logical conditions keep their operator binding when the wrapper goes', () => {
        const input =
        "class T {\n" +
        "    f(a, b, p) {\n" +
        "        const x = (a === b);\n" +
        "        const y = (a !== b);\n" +
        "        if ((a === b) && x && p) { return 1; }\n" +
        "        if (!(x && (a === b))) { return 2; }\n" +
        "        return ((x || y) && x);\n" +
        "    }\n" +
        "}";
        const output = transpiler.transpileCSharp(input).content;
        expect(output).toContain("if ((isEqual(a, b)) && x && isTrue(p))");
        expect(output).toContain("if (!(x && (isEqual(a, b))))");
        expect(output).toContain("return ((x || y) && x);");
    });
    test('a ternary condition and typed bool-returning calls also go bare', () => {
        const input =
        "class T {\n" +
        "    f(a: string, b: string) {\n" +
        "        const z = (a === b) ? 1 : 2;\n" +
        "        if (a.startsWith('x')) { return 1; }\n" +
        "        return z;\n" +
        "    }\n" +
        "}";
        const output = transpiler.transpileCSharp(input).content;
        expect(output).toContain("(isEqual(a, b)) ? 1 : 2");
        expect(output).toContain("if (((string)a).StartsWith(((string)\"x\")))");
    });
    test('a bool local reassigned with another bool keeps the type and the bare condition', () => {
        const input =
        "class T {\n" +
        "    f(a, b, c) {\n" +
        "        let flag = (a === b);\n" +
        "        flag = (b === c);\n" +
        "        if (flag) { return 1; }\n" +
        "    }\n" +
        "}";
        const output = transpiler.transpileCSharp(input).content;
        expect(output).toContain("bool flag = (isEqual(a, b));");
        expect(output).toContain("if (flag)");
    });
    test('a local demoted back to object by an unsafe reassignment keeps the wrapper', () => {
        const input =
        "class T {\n" +
        "    f(a, b, c) {\n" +
        "        let flag = (a === b);\n" +
        "        flag = c;\n" +
        "        if (flag) { return 1; }\n" +
        "    }\n" +
        "}";
        const output = transpiler.transpileCSharp(input).content;
        expect(output).toContain("object flag = (isEqual(a, b));");
        expect(output).toContain("if (isTrue(flag))");
    });
});

// `a === b` / `a !== b` print the native operator instead of isEqual whenever both
// operands are C# values of one scalar family, or one side is null/undefined and the
// other is a type `== null` compiles for.
describe('csharp equality operators instead of the isEqual wrapper', () => {
    const equalityTests = (input: string) => transpiler.transpileCSharp(input).content;
    test('two string-typed operands, including a string literal', () => {
        const output = equalityTests(
        "function f () {\n" +
        "    const s = 'abc';\n" +
        "    const isAbc = s === 'abc';\n" +
        "    const notAbc = s !== 'abc';\n" +
        "    return [isAbc, notAbc];\n" +
        "}");
        expect(output).toContain("bool isAbc = (s == \"abc\");");
        expect(output).toContain("bool notAbc = (s != \"abc\");");
    });
    test('two bool operands, including a bool literal', () => {
        const output = equalityTests(
        "function f () {\n" +
        "    const b = true;\n" +
        "    const isTrue_ = b === true;\n" +
        "    return isTrue_;\n" +
        "}");
        expect(output).toContain("bool isTrue_ = (b == true);");
    });
    test('a length-derived int against a numeric literal', () => {
        const output = equalityTests(
        "function f () {\n" +
        "    const s = 'abc';\n" +
        "    const n = s.length;\n" +
        "    const isThree = n === 3;\n" +
        "    return isThree;\n" +
        "}");
        expect(output).toContain("bool isThree = (n == 3);");
    });
    test('an object-typed local keeps isEqual — `==` would compare references', () => {
        const output = equalityTests(
        "function f () {\n" +
        "    const x = this.safeString({}, 'k');\n" +
        "    const isAbc = x === 'abc';\n" +
        "    return isAbc;\n" +
        "}");
        expect(output).toContain("isEqual(x, \"abc\")");
        expect(output).not.toContain("(x == \"abc\")");
    });
    test('a mixed int/double pair keeps isEqual — isEqual is not a numeric cast', () => {
        const output = equalityTests(
        "function f () {\n" +
        "    const s = 'abc';\n" +
        "    const n = s.length;\n" +
        "    const d = Math.floor(1.5);\n" +
        "    const same = n === d;\n" +
        "    return same;\n" +
        "}");
        expect(output).toContain("isEqual(n, d)");
    });
    test('an integer literal that a double cannot hold exactly keeps isEqual', () => {
        const output = equalityTests(
        "function f () {\n" +
        "    const s = 'abc';\n" +
        "    const n = s.length;\n" +
        "    const big = n === 9007199254740993;\n" +
        "    return big;\n" +
        "}");
        // 9007199254740993 does not survive the double round-trip isEqual's
        // Convert.ToInt64 does, so the operand stays on the helper (the printer
        // prints the rounded literal next to the untouched isEqual call)
        expect(output).toContain("isEqual(n, 9007199254740992)");
    });
    test('null checks inline for a string local and for an object box', () => {
        const output = equalityTests(
        "function f () {\n" +
        "    const s = 'abc';\n" +
        "    let t: string | undefined = undefined;\n" +
        "    const x = this.safeString({}, 'k');\n" +
        "    const noS = s == undefined;\n" +
        "    const noT = t === undefined;\n" +
        "    const noX = x !== undefined;\n" +
        "    return [noS, noT, noX];\n" +
        "}");
        expect(output).toContain("bool noS = (s == null);");
        expect(output).toContain("bool noT = (t == null);");
        expect(output).toContain("bool noX = (x != null);");
    });
    test('a number-typed operand keeps isEqual — its C# type is a value type', () => {
        const output = equalityTests(
        "function f (limit: number) {\n" +
        "    const noLimit = limit === undefined;\n" +
        "    return noLimit;\n" +
        "}");
        expect(output).toContain("isEqual(limit, null)");
        expect(output).not.toContain("(limit == null)");
    });
    test('a boolean-typed operand keeps isEqual — its C# type is a value type', () => {
        const output = equalityTests(
        "function f (flag: boolean) {\n" +
        "    const noFlag = flag === undefined;\n" +
        "    return noFlag;\n" +
        "}");
        expect(output).toContain("isEqual(flag, null)");
    });
    test('a union with a number member keeps isEqual', () => {
        const output = equalityTests(
        "function f (x: string | number) {\n" +
        "    const missing = x === undefined;\n" +
        "    return missing;\n" +
        "}");
        expect(output).toContain("isEqual(x, null)");
    });
});

// U55: `isEqual (x, null)` -> `x == null` for an operand whose emitted declaration the
// embedding classifier names a typed reference / nullable scalar (csharpNullComparisonTypeOf).
// The helper's first two guards are the C# null test itself, so the native operator is the same
// comparison; a non-nullable value scalar does not compile with `== null` and every operand the
// hook cannot name keeps the helper.
describe('csharp null-literal comparisons instead of the isEqual wrapper', () => {
    const withNullTypes = (types, input) => {
        transpiler.csharpTranspiler.csharpNullComparisonTypeOf = (node) => types[node?.escapedText];
        try {
            return transpiler.transpileCSharp(input).content;
        } finally {
            delete transpiler.csharpTranspiler.csharpNullComparisonTypeOf;
        }
    };
    // `a` is a number-typed operand: the base printer keeps the helper for it (a TS number
    // may be a C# value scalar), which is exactly the operand the hook has to answer for
    const nullCheckInput =
        "function f (a: number) {\n" +
        "    const noA = a === undefined;\n" +
        "    const hasA = a !== undefined;\n" +
        "    return [noA, hasA];\n" +
        "}";
    test('a nullable-scalar declaration prints the native null test', () => {
        const output = withNullTypes({ a: 'Int64?' }, nullCheckInput);
        expect(output).toContain("bool noA = (a == null);");
        expect(output).toContain("bool hasA = (a != null);");
        expect(output).not.toContain("isEqual(a, null)");
    });
    test('the same input without the hook keeps the helper (untyped emission)', () => {
        const output = transpiler.transpileCSharp(nullCheckInput).content;
        expect(output).toContain("isEqual(a, null)");
        expect(output).toContain("!isEqual(a, null)");
        expect(output).not.toContain("(a == null)");
        expect(output).not.toContain("(a != null)");
    });
    test('typed references print the native null test', () => {
        for (const type of [ 'string', 'string?', 'IDictionary<string, object>', 'IList<object>', 'List<object>', 'Dictionary<string, object>', 'ccxt.pro.ArrayCache', 'double?' ]) {
            const output = withNullTypes({ a: type }, nullCheckInput);
            expect(output).toContain("bool noA = (a == null);");
            expect(output).toContain("bool hasA = (a != null);");
        }
    });
    test('object, var, a non-nullable scalar and an unknown operand keep the helper', () => {
        for (const type of [ 'object', 'var', 'Int64', 'bool', 'double', 'int', undefined ]) {
            const output = withNullTypes({ a: type }, nullCheckInput);
            expect(output).toContain("isEqual(a, null)");
            expect(output).not.toContain("(a == null)");
        }
    });
    test('a null literal on the left prints the same native null test', () => {
        const output = withNullTypes({ a: 'Int64?' },
        "function f (a: number) {\n" +
        "    const missing = undefined === a;\n" +
        "    return missing;\n" +
        "}");
        expect(output).toContain("bool missing = (a == null);");
    });
    test('a non-identifier operand keeps the helper', () => {
        const output = withNullTypes({},
        "function f () {\n" +
        "    const x = this.markets === undefined;\n" +
        "    return x;\n" +
        "}");
        expect(output).toContain("isEqual(this.markets, null)");
    });
    test('the string-literal rule is unaffected by the null hook', () => {
        transpiler.csharpTranspiler.csharpLocalTypeOf = (node) => (node?.escapedText === 's' ? 'string?' : undefined);
        try {
            const output = transpiler.transpileCSharp(
            "function f (s: string) {\n" +
            "    const isAbc = s === 'abc';\n" +
            "    return isAbc;\n" +
            "}").content;
            expect(output).toContain('s == "abc"');
            expect(output).not.toContain('isEqual(s, "abc")');
        } finally {
            delete transpiler.csharpTranspiler.csharpLocalTypeOf;
        }
    });
});

describe('csharp native numeric comparisons', () => {
    // the printer names the C# kind of int-range literals, `.length` and a few call results
    // itself; locals it leaves `object` (or that the embedding build layer retypes) come back
    // through csharpExpressionTypeResolver — these tests stub that resolver with a name map
    const withKinds = (kinds, input) => {
        transpiler.csharpTranspiler.csharpExpressionTypeResolver = (node) => kinds[node?.escapedText];
        try {
            return transpiler.transpileCSharp(input).content;
        } finally {
            transpiler.csharpTranspiler.csharpExpressionTypeResolver = undefined;
        }
    };
    test('two operands of one proven kind print the native operator', () => {
        const input =
        "class Exchange {\n" +
        "    main(alpha: number, beta: number) {\n" +
        "        const lt = alpha < beta;\n" +
        "        const gt = alpha > beta;\n" +
        "        const le = alpha <= beta;\n" +
        "        const ge = alpha >= beta;\n" +
        "        return [lt, gt, le, ge];\n" +
        "    }\n" +
        "}";
        const output = withKinds({ alpha: 'int', beta: 'int' }, input);
        expect(output).toContain("bool lt = alpha < beta;");
        expect(output).toContain("bool gt = alpha > beta;");
        expect(output).toContain("bool le = alpha <= beta;");
        expect(output).toContain("bool ge = alpha >= beta;");
        expect(output).not.toContain("isLessThan(");
        expect(output).not.toContain("isGreaterThan");
    });
    test('an unproven or mismatched kind keeps the runtime helper', () => {
        const unproven =
        "class Exchange {\n" +
        "    main(gamma: number, delta: number) {\n" +
        "        return gamma < delta;\n" +
        "    }\n" +
        "}";
        expect(withKinds({}, unproven)).toContain("isLessThan(gamma, delta)");
        const mismatched =
        "class Exchange {\n" +
        "    main(epsilon: number, zeta: number) {\n" +
        "        return epsilon < zeta;\n" +
        "    }\n" +
        "}";
        expect(withKinds({ epsilon: 'int', zeta: 'Int64' }, mismatched)).toContain("isLessThan(epsilon, zeta)");
    });
    test('an operand the checker does not see as a plain number keeps the helper', () => {
        const input =
        "class Exchange {\n" +
        "    main(eta: any, theta: number) {\n" +
        "        return eta < theta;\n" +
        "    }\n" +
        "}";
        // the resolver claims int for both, the checker sees `any` on the left
        expect(withKinds({ eta: 'int', theta: 'int' }, input)).toContain("isLessThan(eta, theta)");
    });
    test('two doubles print `>`/`>=` but keep `<`/`<=` (NaN)', () => {
        const input =
        "class Exchange {\n" +
        "    main(iota: number, kappa: number) {\n" +
        "        return [iota < kappa, iota <= kappa, iota > kappa, iota >= kappa];\n" +
        "    }\n" +
        "}";
        const output = withKinds({ iota: 'double', kappa: 'double' }, input);
        expect(output).toContain("isLessThan(iota, kappa)");
        expect(output).toContain("isLessThanOrEqual(iota, kappa)");
        expect(output).toContain("iota > kappa");
        expect(output).toContain("iota >= kappa");
    });
    test('printer-named operands compare natively without a resolver', () => {
        const input =
        "class Exchange {\n" +
        "    main(items: any[]): boolean {\n" +
        "        const lambda = items.filter ((i) => i > 1);\n" +
        "        const floor = Math.floor(1) > Math.floor(2);\n" +
        "        const smaller = Math.floor(1) < Math.floor(2);\n" +
        "        return lambda.length >= 1 && floor && smaller;\n" +
        "    }\n" +
        "}";
        const output = transpiler.transpileCSharp(input).content;
        expect(output).toContain("getArrayLength(lambda) >= 1");
        expect(output).toContain(") > (Math.Floor("); // two doubles, `>` only
        expect(output).toContain("isLessThan((Math.Floor("); // NaN: `<` keeps the helper
        expect(output).toContain("isGreaterThan(i, 1)"); // `any` callback parameter stays a helper
    });
});


describe('csharp helper removal: inOp / getArrayLength become native members', () => {
    test('in-operator on a checker-typed dictionary emits ContainsKey', () => {
        const input =
        "class Exchange {\n" +
        "    options: { [key: string]: any } = {};\n" +
        "    urls: { [key: string]: any } = {};\n" +
        "    main(key) {\n" +
        "        if ('cached' in this.options) { return 1; }\n" +
        "        if ('test' in this.urls) { return 2; }\n" +
        "        if (key in this.options) { return 3; }\n" +
        "        return 0;\n" +
        "    }\n" +
        "}";
        const output = transpiler.transpileCSharp(input).content;
        // both members print a C# bool, so the isTrue round-trip is gone with the helper
        expect(output).toContain('if (this.options.ContainsKey("cached"))');
        // `urls` is a hand-written `object` field whose box is always a dict: the same
        // (IDictionary<string, object>) cast the helper body applies
        expect(output).toContain('if (((IDictionary<string, object>)this.urls).ContainsKey("test"))');
        // the key is not proven a string -> the runtime helper keeps its coercion
        expect(output).toContain('if (inOp(this.options, key))');
    });
    test('length on a list this printer typed itself emits Count', () => {
        const input =
        "class Exchange {\n" +
        "    main() {\n" +
        "        const params: { [key: string]: any } = {};\n" +
        "        const keys = Object.keys(params);\n" +
        "        const n = keys.length;\n" +
        "        return n;\n" +
        "    }\n" +
        "}";
        const output = transpiler.transpileCSharp(input).content;
        expect(output).toContain('List<object> keys = new List<object>(((IDictionary<string,object>)parameters).Keys);');
        expect(output).toContain('int n = keys.Count;');
        expect(output).not.toContain('getArrayLength(keys)');
    });
    test('unproven operands keep the runtime helpers', () => {
        const input =
        "class Exchange {\n" +
        "    main(arr, obj) {\n" +
        "        const n = arr.length;\n" +
        "        const m = obj.length;\n" +
        "        if ('x' in obj) { return 1; }\n" +
        "        return [n, m];\n" +
        "    }\n" +
        "}";
        const output = transpiler.transpileCSharp(input).content;
        // parameters print `object name = null`, so neither the checker proof nor a
        // printed C# type exists -> getArrayLength / inOp stay
        expect(output).toContain('int n = getArrayLength(arr);');
        expect(output).toContain('int m = getArrayLength(obj);');
        expect(output).toContain('if (inOp(obj, "x"))'); // inOp returns a C# bool: no isTrue round-trip
    });
    test('a dictionary local of a call this printer typed emits ContainsKey', () => {
        const input =
        "class Exchange {\n" +
        "    extend(a: { [key: string]: any }, b: any): { [key: string]: any } { return a; }\n" +
        "    main(a: any, b: any) {\n" +
        "        const merged = this.extend(a, b);\n" +
        "        const has = ('k' in merged);\n" +
        "        return has;\n" +
        "    }\n" +
        "}";
        const output = transpiler.transpileCSharp(input).content;
        expect(output).toContain('Dictionary<string, object> merged = this.extend(a, b);');
        expect(output).toContain('bool has = (merged.ContainsKey("k"));');
    });
    test('a checker array that is not a dictionary keeps inOp', () => {
        const input =
        "class Exchange {\n" +
        "    main(d: { [key: string]: any }) {\n" +
        "        const keys = Object.keys(d);\n" +
        "        const has = ('k' in keys);\n" +
        "        return has;\n" +
        "    }\n" +
        "}";
        const output = transpiler.transpileCSharp(input).content;
        expect(output).toContain('bool has = (inOp(keys, "k"));');
    });
    test('a string-typed parameter key keeps inOp: the printed C# parameter is object', () => {
        const input =
        "class Exchange {\n" +
        "    options: { [key: string]: any } = {};\n" +
        "    main(key: string) {\n" +
        "        if (key in this.options) { return 1; }\n" +
        "        return 0;\n" +
        "    }\n" +
        "}";
        const output = transpiler.transpileCSharp(input).content;
        // ContainsKey takes a string, and a parameter is still `object` in the generated
        // C# (its narrowing happens in a later pass), so the helper must stay
        expect(output).toContain('public virtual object main(object key)');
        expect(output).toContain('if (inOp(this.options, key))');
    });
    test('destructuring holder stays untyped while csharpDestructuringTempType returns undefined', () => {
        const input =
        "class Exchange {\n" +
        "    test (): void {\n" +
        "        const [a, b] = this.someTuple(1);\n" +
        "        let c;\n" +
        "        [c, params] = this.handleSomethingAndParams(params);\n" +
        "    }\n" +
        "}";
        const output = transpiler.transpileCSharp(input).content;
        expect(output).toContain("var abVariable = callDynamically(this, \"someTuple\", new object[] { 1 });");
        expect(output).toContain("var a = ((IList<object>) abVariable)[0];");
        expect(output).toContain("var b = ((IList<object>) abVariable)[1];");
        expect(output).toContain("var cparametersVariable = callDynamically(this, \"handleSomethingAndParams\", new object[] { parameters });");
        expect(output).toContain("c = ((IList<object>)cparametersVariable)[0];");
        expect(output).toContain("parameters = ((IList<object>)cparametersVariable)[1];");
    });
    test('a typed destructuring holder is declared with it and read without the re-cast', () => {
        const input =
        "class Exchange {\n" +
        "    test (): void {\n" +
        "        const [a, b] = this.someTuple(1);\n" +
        "        let c;\n" +
        "        [c, params] = this.handleSomethingAndParams(params);\n" +
        "    }\n" +
        "}";
        const printer: any = (transpiler as any).csharpTranspiler;
        printer.csharpDestructuringTempType = () => 'IList<object>';
        try {
            const output = transpiler.transpileCSharp(input).content;
            expect(output).toContain("IList<object> abVariable = (IList<object>)callDynamically(this, \"someTuple\", new object[] { 1 });");
            expect(output).toContain("var a = abVariable[0];");
            expect(output).toContain("var b = abVariable[1];");
            expect(output).toContain("IList<object> cparametersVariable = (IList<object>)callDynamically(this, \"handleSomethingAndParams\", new object[] { parameters });");
            expect(output).toContain("c = cparametersVariable[0];");
            expect(output).toContain("parameters = cparametersVariable[1];");
        } finally {
            delete printer.csharpDestructuringTempType;
        }
    });
    test('a ternary condition drops the redundant (bool) cast around isTrue', () => {
        // printCondition always renders a C# bool, so `((bool) isTrue(x))` was a cast on a bool
        const input =
        "class Exchange {\n" +
        "    main(side, a, b) {\n" +
        "        const first = side === 'sell' ? a : b;\n" +
        "        return first;\n" +
        "    }\n" +
        "}";
        const output = transpiler.transpileCSharp(input).content;
        // S62 folds the wrapper around the printed `isEqual (...)` too (that describe), so the
        // ternary condition is the bare helper call here; the `((bool) …)` cast removal stays
        // this unit's own change and is asserted by the two negatives below.
        expect(output).toContain("isEqual(side, \"sell\") ? a : b");
        expect(output).not.toContain("isTrue(isEqual(side, \"sell\")) ? a : b");
        expect(output).not.toContain("((bool) isTrue");
        expect(output).not.toContain("((bool) !isTrue");
    });
    test('a ternary condition that prints as a bool local drops isTrue too', () => {
        // `isTrue` is the identity on a C# `bool`, and the local is declared bool by the
        // printer itself (getCSharpLocalType) — same proof as the declaration
        const input =
        "class Exchange {\n" +
        "    main(market, a, b) {\n" +
        "        const isSpot = market['spot'] === true;\n" +
        "        return isSpot ? a : b;\n" +
        "    }\n" +
        "}";
        const output = transpiler.transpileCSharp(input).content;
        expect(output).toContain("bool isSpot = isEqual(getValue(market, \"spot\"), true)");
        expect(output).toContain("return isSpot ? a : b;");
    });
    test('a ternary condition the printer cannot declare bool keeps isTrue', () => {
        const input =
        "class Exchange {\n" +
        "    main(market, flag, a, b) {\n" +
        "        const read = market['spot'];\n" +
        "        let reassigned = market['spot'] === true;\n" +
        "        reassigned = market['x'];\n" +
        "        return [read ? a : b, reassigned ? a : b, flag ? a : b];\n" +
        "    }\n" +
        "}";
        const output = transpiler.transpileCSharp(input).content;
        expect(output).toContain("object read = getValue(market, \"spot\")");
        expect(output).toContain("object reassigned = isEqual(getValue(market, \"spot\"), true)");
        expect(output).toContain("isTrue(read) ? a : b");
        expect(output).toContain("isTrue(reassigned) ? a : b");
        expect(output).toContain("isTrue(flag) ? a : b");
    });

    // S60: `isEqual (x, "lit")` -> `x == "lit"` when csharpLocalTypeOf names the operand a
    // string. A string literal is never null and isEqual's string branch is the same
    // `((string)a) == ((string)b)` ordinal comparison, so the emission is equivalent.
    test('string-literal equality keeps isEqual while csharpLocalTypeOf is not installed', () => {
        const input =
        "class Exchange {\n" +
        "    test (a: any) {\n" +
        "        const s = a;\n" +
        "        if (s === 'lit') { return 1; }\n" +
        "        if (s !== 'other') { return 2; }\n" +
        "        if ('third' === s) { return 3; }\n" +
        "    }\n" +
        "}";
        const output = transpiler.transpileCSharp(input).content;
        // no hook installed: the helper call is what S60's gate must keep. S62 folds the isTrue
        // wrapper around the printed isEqual (see the S62 describe), so the assertions below
        // pin the helper AND -- stronger -- that no native operator was emitted.
        expect(output).toContain('if (isEqual(s, "lit"))');
        expect(output).toContain('if (!isEqual(s, "other"))');
        expect(output).toContain('if (isEqual("third", s))');
        expect(output).not.toContain('s == "lit"');
        expect(output).not.toContain('s != "other"');
        expect(output).not.toContain('"third" == s');
    });
    test('csharpLocalTypeOf naming the operand a string emits the native operator', () => {
        const csharp: any = (transpiler as any).csharpTranspiler;
        csharp.csharpLocalTypeOf = (node: any) => (node?.escapedText === 's' ? 'string' : undefined);
        try {
            const input =
            "class Exchange {\n" +
            "    test (a: any) {\n" +
            "        const s = a;\n" +
            "        if (s === 'lit') { return 1; }\n" +
            "        if (s !== 'other') { return 2; }\n" +
            "        if ('third' === s) { return 3; }\n" +
            "    }\n" +
            "}";
            const output = transpiler.transpileCSharp(input).content;
            expect(output).toContain('if (s == "lit")');
            expect(output).toContain('if (s != "other")');
            expect(output).toContain('if ("third" == s)');
            expect(output).not.toContain('isEqual(s,');
        } finally {
            delete csharp.csharpLocalTypeOf;
        }
    });
    test('a non-string hook answer and a non-literal side keep the helper', () => {
        const csharp: any = (transpiler as any).csharpTranspiler;
        csharp.csharpLocalTypeOf = (node: any) => (node?.escapedText === 's' ? 'object' : undefined);
        try {
            const input =
            "class Exchange {\n" +
            "    test (a: any) {\n" +
            "        const s = a;\n" +
            "        if (s === 'lit') { return 1; }\n" +
            "        if (s === a) { return 2; }\n" +
            "        if (s === null) { return 3; }\n" +
            "    }\n" +
            "}";
            const output = transpiler.transpileCSharp(input).content;
            // an 'object' answer is not a string: S60 never fires and the helper stays (S62
            // folds the isTrue wrapper around the printed isEqual)
            expect(output).toContain('if (isEqual(s, "lit"))');
            expect(output).toContain('if (isEqual(s, a))');
            // `isEqual(s, null)` is inlined by #82's printInlineEquality (null comparison on an
            // object operand); the S60 string gate above cannot name it either way
            expect(output).toContain('if ((s == null))');
            expect(output).not.toContain('s == "lit"');
        } finally {
            delete csharp.csharpLocalTypeOf;
        }
    });
});

describe('x.push on a receiver the classifier declares a list drops the cast', () => {
    // the printer's own print names no type for `const keys = []` / `this.safeList (...)`:
    // the ccxt classifier (build/csharp-local-types.js) retypes those declarations AFTER
    // printing, so the printer asks the csharpLocalTypeOf hook for the printed type
    afterEach(() => {
        delete (transpiler as any).csharpTranspiler.csharpLocalTypeOf;
    });
    test('the untyped emission keeps the cast', () => {
        const input =
        "class Exchange {\n" +
        "    safeList (a, b) { return a; }\n" +
        "    main (item) {\n" +
        "        const keys = [];\n" +
        "        keys.push('a');\n" +
        "        const other = this.safeList(item, 'k');\n" +
        "        other.push('b');\n" +
        "        return [keys, other];\n" +
        "    }\n" +
        "}";
        const output = transpiler.transpileCSharp(input).content;
        expect(output).toContain("((IList<object>)keys).Add(\"a\")");
        expect(output).toContain("((IList<object>)other).Add(\"b\")");
    });
    test('a receiver the hook names a list is printed without the cast', () => {
        (transpiler as any).csharpTranspiler.csharpLocalTypeOf = (node: any) => {
            if (node?.escapedText === 'keys') {
                return 'List<object>';
            }
            if (node?.escapedText === 'other') {
                return 'IList<object>';
            }
            return undefined;
        };
        const input =
        "class Exchange {\n" +
        "    safeList (a, b) { return a; }\n" +
        "    main (item) {\n" +
        "        const keys = [];\n" +
        "        keys.push('a');\n" +
        "        const other = this.safeList(item, 'k');\n" +
        "        other.push('b');\n" +
        "        const plain = item['k'];\n" +
        "        plain.push('c');\n" +
        "        return [keys, other, plain];\n" +
        "    }\n" +
        "}";
        const output = transpiler.transpileCSharp(input).content;
        expect(output).toContain("keys.Add(\"a\")");
        expect(output).toContain("other.Add(\"b\")");
        expect(output).not.toContain("((IList<object>)keys)");
        expect(output).not.toContain("((IList<object>)other)");
        // a receiver the hook cannot name keeps the cast
        expect(output).toContain("((IList<object>)plain).Add(\"c\")");
    });
    test('a receiver the hook names object keeps the cast', () => {
        (transpiler as any).csharpTranspiler.csharpLocalTypeOf = (node: any) => (node?.escapedText === 'keys' ? 'object' : undefined);
        const input =
        "class Exchange {\n" +
        "    main () {\n" +
        "        const keys = [];\n" +
        "        keys.push('a');\n" +
        "        return keys;\n" +
        "    }\n" +
        "}";
        const output = transpiler.transpileCSharp(input).content;
        expect(output).toContain("((IList<object>)keys).Add(\"a\")");
    });
});

// cs-strict S14: `((List<object>)x)[i] = v` drops the cast when the receiver's PRINTED
// declaration is a concrete List<object>. The declaration is typed after printing by the
// ccxt classifier (build/csharp-local-types.js), so the printer reads it through the
// `csharpLocalTypeOf` hook the classifier installs; the tests below stub that hook.
describe('cs-strict S14 element-access list cast gate', () => {
    const config = {
        'verbose': false,
        'csharp': {
            'parser': {
                'NUM_LINES_END_FILE': 0,
                'ELEMENT_ACCESS_WRAPPER_OPEN': 'getValue(',
                'ELEMENT_ACCESS_WRAPPER_CLOSE': ')',
            }
        }
    };
    const transpile = (input: string, localTypeOf?: (node: any) => string | undefined) => {
        const localTranspiler: any = new Transpiler(config as any);
        if (localTypeOf !== undefined) {
            localTranspiler.csharpTranspiler.csharpLocalTypeOf = localTypeOf;
        }
        return localTranspiler.transpileCSharp(input).content;
    };
    const listInput = (statement: string) => 'function test () {\n    const orders: any[] = [];\n' + statement + '\n}';
    const listReceiver = () => 'List<object>';

    test('an untyped receiver keeps the printer cast (no classifier hook)', () => {
        const output = transpile(listInput('    orders[0] = 5;'));
        expect(output).toContain("((List<object>)orders)[Convert.ToInt32(0)] = 5;");
    });
    test('a List<object>-declared receiver drops the cast', () => {
        const output = transpile(listInput('    orders[0] = 5;'), listReceiver);
        expect(output).toContain("orders[Convert.ToInt32(0)] = 5;");
        expect(output).not.toContain("((List<object>)orders)");
    });
    test('an IList<object>-declared receiver keeps the cast (it would be a downcast)', () => {
        const output = transpile(listInput('    orders[0] = 5;'), () => 'IList<object>');
        expect(output).toContain("((List<object>)orders)[Convert.ToInt32(0)] = 5;");
    });
    test('index reads are never touched (they print getValue)', () => {
        const output = transpile(listInput('    const a = orders[0];'), listReceiver);
        expect(output).toContain("object a = getValue(orders, 0);");
    });
    test('a string key keeps the dictionary cast', () => {
        const output = transpile(listInput('    orders["k"] = 5;'), listReceiver);
        expect(output).toContain('((IDictionary<string,object>)orders)["k"] = 5;');
    });
    test('a non-identifier receiver keeps the cast', () => {
        const output = transpile(listInput('    this.orders[0] = 5;'), listReceiver);
        expect(output).toContain("((List<object>)this.orders)[Convert.ToInt32(0)] = 5;");
    });
    test('a compound element write keeps both casts', () => {
        const output = transpile(listInput('    orders[0] += 5;'), listReceiver);
        expect(output).toContain("((List<object>)orders)[Convert.ToInt32(0)] = add(((List<object>)orders)[Convert.ToInt32(0)], 5);");
    });
    test('a union string key defers to the instance exception hook (worker dispatch)', () => {
        const localTranspiler: any = new Transpiler(config as any);
        localTranspiler.csharpTranspiler.csharpLocalTypeOf = listReceiver;
        // build/csharp-worker.ts#setupCsharpPrinter replaces this hook per instance; the
        // element-access rule must not preempt it for a key that may be a string
        localTranspiler.csharpTranspiler.printElementAccessExpressionExceptionIfAny = () => 'INSTANCE_HOOK';
        const output = localTranspiler.transpileCSharp('function test (key: string | undefined) {\n    const orders: any[] = [];\n    orders[key] = 5;\n}').content;
        expect(output).toContain('INSTANCE_HOOK');
    });
    test('an any-typed key is a dictionary element and keeps the cast', () => {
        const output = transpile(listInput('    const key: any = "k";\n    orders[key] = 5;'), listReceiver);
        expect(output).toContain("((IDictionary<string,object>)orders)[(string)key] = 5;");
    });
});

describe('dictionary index-write cast elision hook', () => {
    const hookConfig = {
        'verbose': false,
        'csharp': {
            'parser': {
                'NUM_LINES_END_FILE': 0,
                "ELEMENT_ACCESS_WRAPPER_OPEN": "getValue(",
                "ELEMENT_ACCESS_WRAPPER_CLOSE": ")"
            }
        }
    };
    test('an index write keeps the upstream dictionary cast while no hook is installed', () => {
        const t = new Transpiler(hookConfig);
        const output = t.transpileCSharp("class A { f (x: any, v: any) { x[\"k\"] = v; } }").content;
        expect(output).toContain('((IDictionary<string,object>)x)["k"] = v;');
    });
    test('the hook drops only the receiver cast and keeps the key cast', () => {
        const t = new Transpiler(hookConfig);
        t.csharpTranspiler.csharpDictionaryIndexWriteNeedsNoCast = () => true;
        const output = t.transpileCSharp("class A { f (x: any, k: string, v: any) { x[k] = v; } }").content;
        expect(output).toContain('x[(string)k] = v;');
        expect(output).not.toContain('IDictionary<string,object>');
    });
});

describe('csharp typed condition operands', () => {
    // ast-transpiler's C# printer wraps every if / while / && / || / ! condition operand in
    // `isTrue (x)`. The helper is the identity on a C# `bool` and `x == true` on a `bool?`
    // (null -> false), so a bare operand whose emitted declaration is already that type
    // prints natively. The gate is csharpConditionOperandType (the type hook the ccxt
    // classifier overrides); an operand it cannot name keeps the isTrue wrapper.
    test('a typed bool local drops the isTrue wrapper in every listed position', () => {
        const input =
        "class Exchange {\n" +
        "    main (market, a) {\n" +
        "        const isSpot = market['spot'] === true;\n" +
        "        if (isSpot) { a = 1; }\n" +
        "        if (!isSpot) { a = 2; }\n" +
        "        const both = isSpot && (a === 1);\n" +
        "        const either = isSpot || (a === 1);\n" +
        "        return [both, either];\n" +
        "    }\n" +
        "}";
        const output = transpiler.transpileCSharp(input).content;
        expect(output).toContain("bool isSpot = isEqual(getValue(market, \"spot\"), true)");
        expect(output).toContain("if (isSpot)");
        expect(output).toContain("if (!isSpot)");
        expect(output).toContain("bool both = isSpot && (isEqual(a, 1));");
        expect(output).toContain("bool either = isSpot || (isEqual(a, 1));");
        // S62 folds the wrapper around the printed `(isEqual(a, 1))` operand too; what this test
        // pins is the bare `isSpot` operand, which only S61's type hook can name
        expect(output).not.toContain("isTrue((isEqual(a, 1)))");
        expect(output).not.toContain("isTrue(isSpot)");
    });
    test('a bool? operand named by the type hook prints x == true (parenthesised under !)', () => {
        const input =
        "class Exchange {\n" +
        "    main (a, b) {\n" +
        "        const flag = a;\n" +
        "        if (flag) { b = 1; }\n" +
        "        if (!flag) { b = 2; }\n" +
        "        const both = flag && a;\n" +
        "        const either = flag || a;\n" +
        "        return [both, either];\n" +
        "    }\n" +
        "}";
        const csharp = transpiler.csharpTranspiler;
        const upstream = csharp.csharpConditionOperandType.bind(csharp);
        // what the ccxt classifier's installCsharpConditionOperands override answers for a
        // declaration its tables retype to `bool?`
        csharp.csharpConditionOperandType = (node) => ((node?.escapedText === 'flag') ? 'bool?' : upstream(node));
        try {
            const output = transpiler.transpileCSharp(input).content;
            expect(output).toContain("if (flag == true)");
            expect(output).toContain("if (!(flag == true))");
            expect(output).toContain("bool both = flag == true && isTrue(a);");
            expect(output).toContain("bool either = flag == true || isTrue(a);");
            expect(output).not.toContain("isTrue(flag)");
        } finally {
            csharp.csharpConditionOperandType = upstream;
        }
    });
    test('an operand the type hook cannot name keeps the isTrue wrapper', () => {
        const input =
        "class Exchange {\n" +
        "    main (a, b) {\n" +
        "        const read = a;\n" +
        "        if (read) { b = 1; }\n" +
        "        if (!read) { b = 2; }\n" +
        "        const both = read && a;\n" +
        "        return both;\n" +
        "    }\n" +
        "}";
        const output = transpiler.transpileCSharp(input).content;
        expect(output).toContain("object read = a;");
        expect(output).toContain("if (isTrue(read))");
        expect(output).toContain("if (!isTrue(read))");
        expect(output).toContain("bool both = isTrue(read) && isTrue(a);");
    });
    test('a typed bool parameter is not named by the hook and keeps isTrue', () => {
        const input =
        "class Exchange {\n" +
        "    main (a, flag: boolean | undefined) {\n" +
        "        if (flag) { a = 1; }\n" +
        "        return a;\n" +
        "    }\n" +
        "}";
        const output = transpiler.transpileCSharp(input).content;
        expect(output).toContain("if (isTrue(flag))");
        expect(output).not.toContain("if (flag)");
    });
    test('a ternary condition is not this hook\'s position and keeps the base emission', () => {
        const input =
        "class Exchange {\n" +
        "    main (market, a, b) {\n" +
        "        const isSpot = market['spot'] === true;\n" +
        "        return isSpot ? a : b;\n" +
        "    }\n" +
        "}";
        const csharp = transpiler.csharpTranspiler;
        const upstream = csharp.csharpConditionOperandType.bind(csharp);
        // wave-1's ternary unit (printTernaryCondition + csharpConditionPrintsAsBool) owns this
        // site: the printer itself declares `isSpot` bool, so the condition prints natively and
        // neither the `((bool) …)` wrapper nor the isTrue call survives. S61's hook must never
        // fire in a ternary, so it answers `bool?` here and the ` == true` spelling below must
        // stay absent.
        csharp.csharpConditionOperandType = (node) => ((node?.escapedText === 'isSpot') ? 'bool?' : upstream(node));
        try {
            const output = transpiler.transpileCSharp(input).content;
            expect(output).toContain("return isSpot ? a : b;");
            expect(output).not.toContain("isSpot == true");
            expect(output).not.toContain("isTrue(isSpot)");
        } finally {
            csharp.csharpConditionOperandType = upstream;
        }
    });
});

describe('S62: falsy wrapper around a printed bool', () => {
    test('the wrapper is dropped around a bool-returning helper call', () => {
        const input =
        "class Exchange {\n" +
        "    main(a, b) {\n" +
        "        if (a === b) { return 1; }\n" +
        "        if (a !== b) { return 2; }\n" +
        "        if (a < b) { return 3; }\n" +
        "        if ('k' in a) { return 4; }\n" +
        "        return 5;\n" +
        "    }\n" +
        "}";
        const output = transpiler.transpileCSharp(input).content;
        expect(output).toContain("if (isEqual(a, b))");
        expect(output).toContain("if (!isEqual(a, b))");
        expect(output).toContain("if (isLessThan(a, b))");
        expect(output).toContain("if (inOp(a, \"k\"))");
        expect(output).not.toContain("isTrue(isEqual(");
        expect(output).not.toContain("isTrue(inOp(");
    });
    test('the wrapper is dropped through `!` and through whole parentheses', () => {
        const input =
        "class Exchange {\n" +
        "    main(a, b) {\n" +
        "        if (!(a === b)) { return 1; }\n" +
        "        if ((a === b)) { return 2; }\n" +
        "        if (!(a && b)) { return 3; }\n" +
        "        return 4;\n" +
        "    }\n" +
        "}";
        const output = transpiler.transpileCSharp(input).content;
        expect(output).toContain("if (!(isEqual(a, b)))");
        expect(output).toContain("if ((isEqual(a, b)))");
        expect(output).toContain("if (!(isTrue(a) && isTrue(b)))");
    });
    test('a logical composite loses its own wrapper, its operands keep theirs', () => {
        const input =
        "class Exchange {\n" +
        "    main(a, b) {\n" +
        "        if (a && b) { return 1; }\n" +
        "        if (a || b) { return 2; }\n" +
        "        return 3;\n" +
        "    }\n" +
        "}";
        const output = transpiler.transpileCSharp(input).content;
        expect(output).toContain("if (isTrue(a) && isTrue(b))");
        expect(output).toContain("if (isTrue(a) || isTrue(b))");
        expect(output).not.toContain("isTrue(isTrue(");
    });
    test('conditions the printer cannot name bool keep the wrapper', () => {
        const input =
        "class Exchange {\n" +
        "    safeBool(a, b) { return a; }\n" +
        "    isThing(a) { return a; }\n" +
        "    main(flag, a, b) {\n" +
        "        if (flag) { return 1; }\n" +
        "        if (this.safeBool(a, 'x')) { return 2; }\n" +
        "        if (this.isThing(a)) { return 3; }\n" +
        "        if (a instanceof Object) { return 4; }\n" +
        "        if (flag ? a : b) { return 5; }\n" +
        "        return 6;\n" +
        "    }\n" +
        "}";
        const output = transpiler.transpileCSharp(input).content;
        expect(output).toContain("if (isTrue(flag))");
        expect(output).toContain("if (isTrue(this.safeBool(a, \"x\")))");
        expect(output).toContain("if (isTrue(this.isThing(a)))");
        expect(output).toContain("if (isTrue(a is Object))");
        // wave-1's ternary unit dropped the `((bool) …)` cast around the condition; the ternary
        // itself stays inside the wrapper, because its C# type is the branches' common type
        // (object), not bool -- see csharpTextHasTopLevelConditional. The merged printer must
        // not fold it on the strength of the leading `isTrue(flag)` text.
        expect(output).toContain("if (isTrue(isTrue(flag) ? a : b))");
        expect(output).not.toContain("((bool)");
        expect(output).not.toContain("if (isTrue(flag) ? a : b)");
    });
});

describe('csharp declared-receiver .length: getArrayLength -> Count/Length (hook gated)', () => {
    const withReceiverType = (type, source) => {
        const previous = transpiler.csharpTranspiler.csharpLengthReceiverType;
        transpiler.csharpTranspiler.csharpLengthReceiverType = (node) => ((node?.kind === tsApi.SyntaxKind.Identifier) ? type : undefined);
        try {
            return transpiler.transpileCSharp(source).content;
        } finally {
            transpiler.csharpTranspiler.csharpLengthReceiverType = previous;
        }
    };
    const body = (line) =>
        "class Exchange {\n" +
        "    box(a: any, b: any): any { return a; }\n" +
        "    main() {\n" +
        "        const xs = this.box({}, 'k');\n" +
        "        " + line + "\n" +
        "        return n;\n" +
        "    }\n" +
        "}";
    test('without the hook the emission is the unchanged helper call', () => {
        const output = transpiler.transpileCSharp(body('const n = xs.length;')).content;
        expect(output).toContain('int n = getArrayLength(xs);');
    });
    test('a list-typed receiver counts its own Count', () => {
        const output = withReceiverType('List<object>', body('const n = xs.length;'));
        expect(output).toContain('int n = (xs?.Count ?? 0);');
        expect(output).not.toContain('getArrayLength(xs)');
    });
    test('the element type does not change the member: List<string> counts too', () => {
        const output = withReceiverType('List<string>', body('const n = xs.length;'));
        expect(output).toContain('int n = (xs?.Count ?? 0);');
        expect(output).not.toContain('getArrayLength(xs)');
    });
    test('a dictionary receiver counts its entries', () => {
        const output = withReceiverType('Dictionary<string, object>', body('const n = xs.length;'));
        expect(output).toContain('int n = (xs?.Count ?? 0);');
    });
    test('a string receiver reads its Length', () => {
        const output = withReceiverType('string?', body('const n = xs.length;'));
        expect(output).toContain('int n = (xs?.Length ?? 0);');
        expect(output).not.toContain('getArrayLength(xs)');
    });
    test('a declared type with no Count/Length member keeps the helper', () => {
        expect(withReceiverType('double', body('const n = xs.length;'))).toContain('int n = getArrayLength(xs);');
        expect(withReceiverType('Int64', body('const n = xs.length;'))).toContain('int n = getArrayLength(xs);');
        expect(withReceiverType('object', body('const n = xs.length;'))).toContain('int n = getArrayLength(xs);');
    });
    test('a printed cast names the receiver type without any hook', () => {
        const output = transpiler.transpileCSharp(body('const n = (xs as any[]).length;')).content;
        expect(output).toContain('int n = (((IList<object>)(xs))?.Count ?? 0);');
        expect(output).not.toContain('getArrayLength(');
    });
});
