import { Transpiler } from '../src/transpiler';
import { readFileSync } from 'fs';

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
        "int ff = ((string)myStr).Length;"
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
        // `parts` is declared `List<object>` here, so its own Count replaces the helper
        expect(output).toContain("int count = (parts?.Count ?? 0);");
        expect(output).not.toContain("getArrayLength(parts)");
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
        // the `value !== undefined` guard is a null test on the `object value` parameter
        expect(output).toContain("return ((bool)((object)(((value != null)) && ((value is IDictionary<string, object>))))!);");
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
        // the `in` guard prints a C# bool of its own (ContainsKey returns bool): no isTrue
        // round-trip; the receiver is still object, so the cast and the helper's null test stay
        expect(guardedOutput).toContain('if ((parameters != null && ((IDictionary<string, object>)parameters).ContainsKey("x")))');
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
    test('a market-row local the declared table proves is a dictionary prints the null-safe native read', () => {
        const input =
        "class Exchange {\n" +
        "    extend(a: any, b: any): any { return a; }\n" +
        "    main(a: any, b: any) {\n" +
        "        const market = this.extend(a, b);\n" +
        "        const id = market['id'];\n" +
        "        return id;\n" +
        "    }\n" +
        "}";
        const output = transpiler.transpileCSharp(input).content;
        expect(output).toContain('Dictionary<string, object> market = this.extend(a, b);');
        // getValue yields null for a missing key, a C# indexer throws: the native read keeps the
        // ContainsKey test
        expect(output).toContain('object id = (market.ContainsKey("id") ? market["id"] : null);');
        expect(output).not.toContain('getValue(market, "id")');
    });
    test('market-row reads outside the declared table keep getValue', () => {
        // the receiver local is not typed: no proof, the helper stays
        const untyped =
        "class Exchange {\n" +
        "    getMarketFromSymbols(symbols: any): any { return symbols; }\n" +
        "    main(symbols: any) {\n" +
        "        const market = this.getMarketFromSymbols(symbols);\n" +
        "        const id = market['id'];\n" +
        "        return id;\n" +
        "    }\n" +
        "}";
        const untypedOutput = transpiler.transpileCSharp(untyped).content;
        expect(untypedOutput).toContain('object market = this.getMarketFromSymbols(symbols);');
        expect(untypedOutput).toContain('object id = getValue(market, "id");');
        // another receiver name belongs to its own family
        const otherReceiver =
        "class Exchange {\n" +
        "    extend(a: any, b: any): any { return a; }\n" +
        "    main(a: any, b: any) {\n" +
        "        const response = this.extend(a, b);\n" +
        "        const id = response['id'];\n" +
        "        return id;\n" +
        "    }\n" +
        "}";
        const otherOutput = transpiler.transpileCSharp(otherReceiver).content;
        expect(otherOutput).toContain('Dictionary<string, object> response = this.extend(a, b);');
        expect(otherOutput).toContain('object id = getValue(response, "id");');
        // a numeric key is a list index, not a market key
        const numberKey =
        "class Exchange {\n" +
        "    extend(a: any, b: any): any { return a; }\n" +
        "    main(a: any, b: any) {\n" +
        "        const market = this.extend(a, b);\n" +
        "        const first = market[0];\n" +
        "        return first;\n" +
        "    }\n" +
        "}";
        expect(transpiler.transpileCSharp(numberKey).content).toContain('object first = getValue(market, 0);');
    });
    test('a market-row local later written a different type stays a box', () => {
        const input =
        "class Exchange {\n" +
        "    extend(a: any, b: any): any { return a; }\n" +
        "    main(a: any, b: any) {\n" +
        "        let market = this.extend(a, b);\n" +
        "        market = a;\n" +
        "        const id = market['id'];\n" +
        "        return id;\n" +
        "    }\n" +
        "}";
        const output = transpiler.transpileCSharp(input).content;
        expect(output).toContain('object market = this.extend(a, b);');
        expect(output).toContain('object id = getValue(market, "id");');
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
        expect(output).toContain("((bool) (isEqual(a, b))) ? 1 : 2");
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

// cs-14: a call whose own C# signature is a non-nullable `bool` needs no isTrue round-trip either —
// the wrapper is the identity on a bool. The C# signature is proven either by the TS declaration
// the generator prints itself (`this.<name>(...)`, same csharpBooleanReturnType as the definition)
// or by the hand-written-callee table (callees cs/ccxt/base declares with a bool signature and no
// TS annotation to read: Precise's comparisons, the imported isEmpty/isJsonEncodedObject props).
describe('isTrue is dropped for a call whose C# signature is a non-nullable bool (cs-14)', () => {
    test('a `this.` method declared `: boolean` goes bare, including under ! and ||', () => {
        const input =
        "class T {\n" +
        "    isLinear (type: string): boolean { return type === 'linear'; }\n" +
        "    isInverse (type: string): boolean { return type === 'inverse'; }\n" +
        "    f (type: string, p) {\n" +
        "        if (this.isLinear(type)) { return 1; }\n" +
        "        if (!this.isInverse(type)) { return 2; }\n" +
        "        if (this.isLinear(type) || this.isInverse(type)) { return 3; }\n" +
        "        if (this.isLinear(type) && p) { return 4; }\n" +
        "    }\n" +
        "}";
        const output = transpiler.transpileCSharp(input).content;
        expect(output).toContain("if (this.isLinear(type))");
        expect(output).toContain("if (!this.isInverse(type))");
        expect(output).toContain("if (this.isLinear(type) || this.isInverse(type))");
        expect(output).toContain("if (this.isLinear(type) && isTrue(p))");
    });
    test('an un-annotated override of a `: boolean` method inherits the parent type', () => {
        const input =
        "class B {\n" +
        "    flag (a: any): boolean { return true; }\n" +
        "}\n" +
        "class T extends B {\n" +
        "    flag (a) { return false; }\n" +
        "    f (a) { if (this.flag(a)) { return 1; } }\n" +
        "}";
        const output = transpiler.transpileCSharp(input).content;
        expect(output).toContain("public override bool flag(object a)");
        expect(output).toContain("if (this.flag(a))");
    });
    test('the table covers hand-written static callees (Precise comparisons)', () => {
        const input =
        "class Precise {\n" +
        "    static stringGt (a: any, b: any): boolean { return true; }\n" +
        "    static stringAdd (a: any, b: any): any { return a; }\n" +
        "}\n" +
        "class T {\n" +
        "    f (a, b) {\n" +
        "        if (Precise.stringGt(a, b)) { return 1; }\n" +
        "        if (!Precise.stringGt(a, b)) { return 2; }\n" +
        "        return Precise.stringAdd(a, b);\n" +
        "    }\n" +
        "}";
        const output = transpiler.transpileCSharp(input).content;
        expect(output).toContain("if (Precise.stringGt(a, b))");
        expect(output).toContain("if (!Precise.stringGt(a, b))");
        expect(output).toContain("Precise.stringAdd(a, b)");
    });
    test('the table covers a `bool isEmpty(...)` reached through a this property', () => {
        const input =
        "const isEmpty = (a: any[]) => { return a.length === 0; };\n" +
        "class T {\n" +
        "    isEmpty = isEmpty;\n" +
        "    f (a) { if (this.isEmpty(a)) { return 1; } }\n" +
        "}";
        const output = transpiler.transpileCSharp(input).content;
        expect(output).toContain("if (this.isEmpty(a))");
        expect(output).not.toContain("isTrue");
    });
    test('a bodiless (interface-merged) declaration keeps the wrapper', () => {
        const input =
        "class T {\n" +
        "    isInverse (type: string): boolean { return true; }\n" +
        "    f (type) {\n" +
        "        if (this.isInverse(type)) { return 1; }\n" +
        "        if (this.isLinear(type)) { return 2; }\n" +
        "    }\n" +
        "}\n" +
        "interface T {\n" +
        "    isLinear (type: string): boolean;\n" +
        "}";
        const output = transpiler.transpileCSharp(input).content;
        expect(output).toContain("if (this.isInverse(type))");
        expect(output).toContain("if (isTrue(this.isLinear(type)))");
    });
    test('a hand-written C# shadow and other receivers keep the wrapper', () => {
        const input =
        "class T {\n" +
        "    isDictionary (value: any): boolean { return true; }\n" +
        "    check (a: any): boolean { return true; }\n" +
        "    f (v, o) {\n" +
        "        if (this.isDictionary(v)) { return 1; }\n" +
        "        if (this.check(v)) { return 2; }\n" +
        "        if (o.check(v)) { return 3; }\n" +
        "    }\n" +
        "}";
        const output = transpiler.transpileCSharp(input).content;
        expect(output).toContain("if (isTrue(this.isDictionary(v)))");
        expect(output).toContain("if (this.check(v))");
        expect(output).toContain("if (isTrue(o.check(v)))");
    });
    test('a this-property call the printer cannot resolve keeps the wrapper', () => {
        const input =
        "const isEmpty = (a: any[]) => { return a.length === 0; };\n" +
        "class T {\n" +
        "    isEmpty = isEmpty;\n" +
        "    f (a) { if (this.filterClosed(a)) { return 1; } }\n" +
        "}";
        const output = transpiler.transpileCSharp(input).content;
        expect(output).toContain('if (isTrue(callDynamically(this, "filterClosed", new object[] { a })))');
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
    test('a local the embedding build layer declares a string compares natively to a literal', () => {
        // the embedding build layer (ccxt: build/csharp-local-types.js) prints some locals
        // with a concrete C# type of its own; its answer comes back through
        // csharpExpressionTypeResolver, so a read of such a local IS that declared type
        const withDeclaredTypes = (types, input) => {
            transpiler.csharpTranspiler.csharpExpressionTypeResolver = (node) => types[node?.escapedText];
            try {
                return transpiler.transpileCSharp(input).content;
            } finally {
                transpiler.csharpTranspiler.csharpExpressionTypeResolver = undefined;
            }
        };
        const input =
        "function f (params: object): boolean {\n" +
        "    const x = this.safeString(params, 'k');\n" +
        "    const isAbc = x === 'abc';\n" +
        "    const notAbc = x !== 'abc';\n" +
        "    const reversed = 'abc' === x;\n" +
        "    return isAbc || notAbc || reversed;\n" +
        "}\n";
        for (const declared of ['string', 'string?']) {
            const output = withDeclaredTypes({ x: declared }, input);
            expect(output).toContain("bool isAbc = (x == \"abc\");");
            expect(output).toContain("bool notAbc = (x != \"abc\");");
            expect(output).toContain("bool reversed = (\"abc\" == x);");
            expect(output).not.toContain("isEqual(x, \"abc\")");
        }
    });
    test('a declared type that is not a string keeps isEqual', () => {
        const withDeclaredTypes = (types, input) => {
            transpiler.csharpTranspiler.csharpExpressionTypeResolver = (node) => types[node?.escapedText];
            try {
                return transpiler.transpileCSharp(input).content;
            } finally {
                transpiler.csharpTranspiler.csharpExpressionTypeResolver = undefined;
            }
        };
        const input =
        "function f (params: object): boolean {\n" +
        "    const x = this.safeString(params, 'k');\n" +
        "    return x === 'abc';\n" +
        "}\n";
        // a list/dict/box answer is not a string, and no answer at all is the printer's
        // `object`: `==` would compare references instead of the helper's string branch
        for (const declared of ['List<object>', 'Dictionary<string, object>', 'object', 'Int64', 'bool']) {
            expect(withDeclaredTypes({ x: declared }, input)).toContain("isEqual(x, \"abc\")");
        }
        expect(withDeclaredTypes({}, input)).toContain("isEqual(x, \"abc\")");
    });
    test('a string local against another literal kind or another read keeps isEqual', () => {
        const withDeclaredTypes = (types, input) => {
            transpiler.csharpTranspiler.csharpExpressionTypeResolver = (node) => types[node?.escapedText];
            try {
                return transpiler.transpileCSharp(input).content;
            } finally {
                transpiler.csharpTranspiler.csharpExpressionTypeResolver = undefined;
            }
        };
        const input =
        "function f (params: object): boolean {\n" +
        "    const x = this.safeString(params, 'k');\n" +
        "    const y = this.safeString(params, 'k2');\n" +
        "    const numeric = x === 5;\n" +
        "    const both = x === y;\n" +
        "    return numeric || both;\n" +
        "}\n";
        const output = withDeclaredTypes({ x: 'string?', y: 'string?' }, input);
        expect(output).toContain("isEqual(x, 5)");
        expect(output).toContain("isEqual(x, y)");
    });
    test('a parameter keeps isEqual: it prints `object` and the resolver declines it', () => {
        const withDeclaredTypes = (types, input) => {
            transpiler.csharpTranspiler.csharpExpressionTypeResolver = (node) => types[node?.escapedText];
            try {
                return transpiler.transpileCSharp(input).content;
            } finally {
                transpiler.csharpTranspiler.csharpExpressionTypeResolver = undefined;
            }
        };
        const input =
        "function f (type: string): boolean {\n" +
        "    return type === 'market';\n" +
        "}\n";
        const output = withDeclaredTypes({}, input);
        expect(output).toContain("public object f(object type)");
        expect(output).toContain("isEqual(type, \"market\")");
    });
});

describe('csharp helper removal: isEqual on a numeric call result', () => {
    const outputOf = (input: string) => transpiler.transpileCSharp(input).content;
    test('a string indexOf against a negative literal prints the native operator', () => {
        const output = outputOf(
        "class Exchange {\n" +
        "    main(s: any) {\n" +
        "        if (s.indexOf(' ') !== -1) { return 1; }\n" +
        "        return 0;\n" +
        "    }\n" +
        "}");
        expect(output).toContain('if ((getIndexOf(s, " ") != -1))');
        expect(output).not.toContain('isEqual(');
    });
    test('the literal may be on either side of the call', () => {
        const output = outputOf(
        "class Exchange {\n" +
        "    main(s: any) {\n" +
        "        const first = -1 === s.indexOf(' ');\n" +
        "        return first;\n" +
        "    }\n" +
        "}");
        expect(output).toContain('bool first = (-1 == getIndexOf(s, " "));');
        expect(output).not.toContain('isEqual(');
    });
    test('a this.<name>() method whose C# signature is numeric compares natively', () => {
        const output = outputOf(
        "class Exchange {\n" +
        "    precisionFromString(v) { return 1; }\n" +
        "    parseToInt(v) { return 1; }\n" +
        "    main(x) {\n" +
        "        if (this.precisionFromString(x) !== 0) { return 1; }\n" +
        "        if (this.parseToInt(x) === 3) { return 2; }\n" +
        "        return 0;\n" +
        "    }\n" +
        "}");
        expect(output).toContain('if ((this.precisionFromString(x) != 0))');
        expect(output).toContain('if ((this.parseToInt(x) == 3))');
        expect(output).not.toContain('isEqual(');
    });
    test('a literal that kind cannot hold keeps isEqual', () => {
        const output = outputOf(
        "class Exchange {\n" +
        "    precisionFromString(v) { return 1; }\n" +
        "    main(x) {\n" +
        "        const unsafe_ = this.precisionFromString(x) === 9007199254740993;\n" +
        "        const fractional = this.precisionFromString(x) === 0.5;\n" +
        "        return [unsafe_, fractional];\n" +
        "    }\n" +
        "}");
        // the integer literal does not survive isEqual's Convert.ToInt64 round-trip, and the
        // fractional one would be truncated by its `(int)a == (int)b` branch
        expect(output).toContain('isEqual(this.precisionFromString(x), 9007199254740992)');
        expect(output).toContain('isEqual(this.precisionFromString(x), 0.5)');
    });
    test('an object-returning call keeps isEqual', () => {
        const output = outputOf(
        "class Exchange {\n" +
        "    main(position: any, ms: any) {\n" +
        "        if (position['contracts'] === 0) { return 1; }\n" +
        "        if (mod(ms, 2) === 0) { return 2; }\n" +
        "        return 0;\n" +
        "    }\n" +
        "}");
        expect(output).toContain('isEqual(getValue(position, "contracts"), 0)');
        expect(output).toContain('isEqual(mod(ms, 2), 0)');
    });
});

// The null test on a hand-written BaseExchange field (a reference box in C#) and on a
// method parameter (printed `object`, or `string` where the build layer narrows a string
// position) is native; a value-typed operand keeps the helper.
describe('csharp null comparisons on hand-written fields and parameters', () => {
    const nullTests = (input: string) => transpiler.transpileCSharp(input).content;
    test('a reference-typed hand-written field prints the null test', () => {
        const output = nullTests(
        "class T {\n" +
        "    markets: any = undefined;\n" +
        "    test(): void {\n" +
        "        const noMarkets = this.markets === undefined;\n" +
        "        console.log(noMarkets);\n" +
        "    }\n" +
        "}");
        expect(output).toContain("bool noMarkets = (this.markets == null);");
    });
    test('a field the table does not list keeps isEqual', () => {
        const output = nullTests(
        "class T {\n" +
        "    foo: any = undefined;\n" +
        "    test(): void {\n" +
        "        const noFoo = this.foo === undefined;\n" +
        "        console.log(noFoo);\n" +
        "    }\n" +
        "}");
        expect(output).toContain("bool noFoo = isEqual(this.foo, null);");
    });
    test('a value-typed hand-written field keeps isEqual — rateLimit is a C# double', () => {
        const output = nullTests(
        "class T {\n" +
        "    rateLimit: number = 2000;\n" +
        "    test(): void {\n" +
        "        const noRateLimit = this.rateLimit === undefined;\n" +
        "        console.log(noRateLimit);\n" +
        "    }\n" +
        "}");
        expect(output).toContain("bool noRateLimit = isEqual(this.rateLimit, null);");
    });
    test('a field never takes the value-equality branches', () => {
        const output = nullTests(
        "class T {\n" +
        "    apiKey: string = undefined;\n" +
        "    test(): void {\n" +
        "        const empty = this.apiKey === '';\n" +
        "        console.log(empty);\n" +
        "    }\n" +
        "}");
        expect(output).toContain("bool empty = isEqual(this.apiKey, \"\");");
    });
    test('an object-typed parameter prints the null test', () => {
        const output = nullTests(
        "function f (parameters = {}) {\n" +
        "    const noParams = parameters === undefined;\n" +
        "    return noParams;\n" +
        "}");
        expect(output).toContain("bool noParams = (parameters == null);");
    });
    test('a string-typed parameter prints the null test', () => {
        const output = nullTests(
        "function f (symbol: string) {\n" +
        "    const noSymbol = symbol === undefined;\n" +
        "    return noSymbol;\n" +
        "}");
        expect(output).toContain("bool noSymbol = (symbol == null);");
    });
    test('a rest parameter keeps isEqual — it prints a params object[]', () => {
        const output = nullTests(
        "function f (...args: string[]) {\n" +
        "    const noArgs = args === undefined;\n" +
        "    return noArgs;\n" +
        "}");
        expect(output).toContain("isEqual(args, null)");
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
    test('an unproven or double-mixed kind keeps the runtime helper', () => {
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
        "        return [epsilon < zeta, epsilon > zeta];\n" +
        "    }\n" +
        "}";
        // isEqual reads an integral double as an integer, so a double never mixes kinds
        const output = withKinds({ epsilon: 'int', zeta: 'double' }, mismatched);
        expect(output).toContain("isLessThan(epsilon, zeta)");
        expect(output).toContain("isGreaterThan(epsilon, zeta)");
    });
    test('an int/Int64 pair prints the native operator', () => {
        const input =
        "class Exchange {\n" +
        "    main(alpha: number, beta: number, gamma: number) {\n" +
        "        return [alpha < beta, alpha >= beta, alpha > 5, gamma <= 5];\n" +
        "    }\n" +
        "}";
        // the helper normalises int to Int64, the widening the C# operator applies too
        const output = withKinds({ alpha: 'Int64', beta: 'int', gamma: 'int' }, input);
        expect(output).toContain("alpha < beta");
        expect(output).toContain("alpha >= beta");
        expect(output).toContain("alpha > 5");
        expect(output).toContain("gamma <= 5");
        expect(output).not.toContain("isLessThan(");
        expect(output).not.toContain("isGreaterThan");
    });
    test('a double next to an integer kind keeps the helper', () => {
        const input =
        "class Exchange {\n" +
        "    main(mu: number, nu: number) {\n" +
        "        return [mu >= nu, mu > nu, mu <= nu, mu < nu];\n" +
        "    }\n" +
        "}";
        const output = withKinds({ mu: 'Int64', nu: 'double' }, input);
        expect(output).toContain("isGreaterThanOrEqual(mu, nu)");
        expect(output).toContain("isGreaterThan(mu, nu)");
        expect(output).toContain("isLessThanOrEqual(mu, nu)");
        expect(output).toContain("isLessThan(mu, nu)");
    });
    test('a declared kind prints natively even when the checker sees `any`', () => {
        const input =
        "class Exchange {\n" +
        "    main(eta: any, theta: number) {\n" +
        "        return eta < theta;\n" +
        "    }\n" +
        "}";
        // the resolver names both C# declarations: a declared number is that box at runtime
        expect(withKinds({ eta: 'int', theta: 'int' }, input)).toContain("eta < theta");
        // an operand the resolver leaves unproven keeps the helper
        expect(withKinds({ theta: 'int' }, input)).toContain("isLessThan(eta, theta)");
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
    test('length of a local this printer typed as a list emits the null-conditional Count', () => {
        const input =
        "class Exchange {\n" +
        "    safeList(a: any, b: any): any { return a; }\n" +
        "    main() {\n" +
        "        const xs = this.safeList({}, 'k');\n" +
        "        const n = xs.length;\n" +
        "        return n;\n" +
        "    }\n" +
        "}";
        const output = transpiler.transpileCSharp(input).content;
        expect(output).toContain('List<object> xs = this.safeList(new Dictionary<string, object>() {}, "k");');
        // `x?.Count ?? 0` is exactly getArrayLength on a list: null -> 0, else Count
        expect(output).toContain('int n = (xs?.Count ?? 0);');
        expect(output).not.toContain('getArrayLength(xs)');
    });
    test('length of a local this printer typed as a dictionary emits Count', () => {
        const input =
        "class Exchange {\n" +
        "    safeDict(a: any, b: any): any { return a; }\n" +
        "    main() {\n" +
        "        const d = this.safeDict({}, 'k');\n" +
        "        const n = d.length;\n" +
        "        return n;\n" +
        "    }\n" +
        "}";
        const output = transpiler.transpileCSharp(input).content;
        expect(output).toContain('IDictionary<string, object> d = this.safeDict(new Dictionary<string, object>() {}, "k");');
        expect(output).toContain('int n = (d?.Count ?? 0);');
    });
    test('length of a local this printer typed as a nullable string emits Length', () => {
        const input =
        "class Exchange {\n" +
        "    safeString(a: any, b: any): any { return a; }\n" +
        "    main() {\n" +
        "        const s = this.safeString({}, 'k');\n" +
        "        const n = s.length;\n" +
        "        return n;\n" +
        "    }\n" +
        "}";
        const output = transpiler.transpileCSharp(input).content;
        expect(output).toContain('string? s = this.safeString(new Dictionary<string, object>() {}, "k");');
        expect(output).toContain('int n = (s?.Length ?? 0);');
        expect(output).not.toContain('getArrayLength(s)');
    });
    test('length of a local the printer leaves object keeps getArrayLength', () => {
        const input =
        "class Exchange {\n" +
        "    safeValue(a: any, b: any): any { return a; }\n" +
        "    main() {\n" +
        "        const boxed = this.safeValue({}, 'k');\n" +
        "        const n = boxed.length;\n" +
        "        return n;\n" +
        "    }\n" +
        "}";
        const output = transpiler.transpileCSharp(input).content;
        expect(output).toContain('object boxed = this.safeValue(new Dictionary<string, object>() {}, "k");');
        expect(output).toContain('int n = getArrayLength(boxed);');
    });
    test('a declared type with no Count/Length member keeps getArrayLength', () => {
        const input =
        "class Exchange {\n" +
        "    main() {\n" +
        "        const xs = this.box();\n" +
        "        const n = xs.length;\n" +
        "        return n;\n" +
        "    }\n" +
        "}";
        const withType = (type) => {
            transpiler.csharpTranspiler.csharpExpressionTypeResolver = (node) => (node?.escapedText === 'xs') ? type : undefined;
            try {
                return transpiler.transpileCSharp(input).content;
            } finally {
                transpiler.csharpTranspiler.csharpExpressionTypeResolver = undefined;
            }
        };
        // the embedding build layer's proof for a local it retypes: only a collection or a
        // string carries the member the helper measures
        expect(withType(undefined)).toContain('int n = getArrayLength(xs);');
        expect(withType('double')).toContain('int n = getArrayLength(xs);');
        expect(withType('Int64')).toContain('int n = getArrayLength(xs);');
        expect(withType('List<object>')).toContain('int n = (xs?.Count ?? 0);');
        expect(withType('Dictionary<string, object>')).toContain('int n = (xs?.Count ?? 0);');
        expect(withType('string?')).toContain('int n = (xs?.Length ?? 0);');
    });
    test('length behind an elided `as` assertion emits Count', () => {
        const input =
        "class Exchange {\n" +
        "    safeDict(a: any, b: any, c: any): any { return a; }\n" +
        "    main(parameters: any) {\n" +
        "        const data = this.safeDict(parameters, 'data', {});\n" +
        "        const n = (data as List).length;\n" +
        "        return n;\n" +
        "    }\n" +
        "}";
        const output = transpiler.transpileCSharp(input).content;
        // the printer drops the assertion, so the read is the declared `data` local
        expect(output).toContain('IDictionary<string, object> data = this.safeDict(');
        expect(output).toContain('int n = (data?.Count ?? 0);');
        expect(output).not.toContain('getArrayLength');
    });
    test('an `as` assertion over an unproven local keeps getArrayLength', () => {
        const input =
        "class Exchange {\n" +
        "    safeValue(a: any, b: any): any { return a; }\n" +
        "    main(parameters: any) {\n" +
        "        const boxed = this.safeValue(parameters, 'data');\n" +
        "        const n = (boxed as List).length;\n" +
        "        return n;\n" +
        "    }\n" +
        "}";
        const output = transpiler.transpileCSharp(input).content;
        expect(output).toContain('object boxed = this.safeValue(');
        expect(output).toContain('int n = getArrayLength(boxed);');
    });
});

// `const x = this.<name>(...)` where the enclosing class itself declares <name> with a plain
// `boolean` return: that method prints a C# `bool`, so the local holding the call is declared
// `bool` and its condition reads drop the isTrue round-trip. The scope is the class's own
// methods — a base helper's C# signature lives in the base tree, not in this declaration.
describe('csharp helper removal: own bool-returning calls type their locals', () => {
    test('a plain boolean method types the local and drops isTrue at its conditions', () => {
        const input =
        "class T {\n" +
        "    isLinear(type: string, subType: string = undefined): boolean {\n" +
        "        return (subType === undefined) ? (type === 'swap') : (subType === 'linear');\n" +
        "    }\n" +
        "    isInverse(type: string): boolean {\n" +
        "        return type === 'delivery';\n" +
        "    }\n" +
        "    main(type: string, subType: string, market: any) {\n" +
        "        const isLinearType = this.isLinear(type, subType);\n" +
        "        const isInverseType = this.isInverse(type);\n" +
        "        const isLinearSwapConditional = isLinearType && (market !== undefined);\n" +
        "        if (isLinearSwapConditional) { return 1; }\n" +
        "        if (isLinearType) { return 2; }\n" +
        "        if (!isInverseType) { return 3; }\n" +
        "        return 0;\n" +
        "    }\n" +
        "}";
        const output = transpiler.transpileCSharp(input).content;
        expect(output).toContain('bool isLinearType = this.isLinear(type, subType);');
        expect(output).toContain('bool isInverseType = this.isInverse(type);');
        expect(output).toContain("bool isLinearSwapConditional = isLinearType && (!isEqual(market, null));");
        expect(output).toContain('if (isLinearSwapConditional)');
        expect(output).toContain('if (isLinearType)');
        expect(output).toContain('if (!isInverseType)');
        // the call is still evaluated exactly once, at the declaration
        expect((output.match(/this\.isLinear\(/g) ?? []).length).toBe(1);
        expect(output).not.toContain('isTrue');
    });
    test('a nullable boolean method keeps the object box and the isTrue wrapper', () => {
        const input =
        "class T {\n" +
        "    safeFlag(d: any): boolean | undefined {\n" +
        "        return undefined;\n" +
        "    }\n" +
        "    main(d: any) {\n" +
        "        const flag = this.safeFlag(d);\n" +
        "        if (flag) { return 1; }\n" +
        "        return 0;\n" +
        "    }\n" +
        "}";
        const output = transpiler.transpileCSharp(input).content;
        expect(output).toContain('object flag = this.safeFlag(d);');
        expect(output).toContain('if (isTrue(flag))');
    });
    test('a method declared by another class keeps the object box', () => {
        const input =
        "class Base {\n" +
        "    flag(): boolean {\n" +
        "        return true;\n" +
        "    }\n" +
        "}\n" +
        "class T extends Base {\n" +
        "    main() {\n" +
        "        const flag = this.flag();\n" +
        "        if (flag) { return 1; }\n" +
        "        return 0;\n" +
        "    }\n" +
        "}";
        const output = transpiler.transpileCSharp(input).content;
        expect(output).toContain('object flag = this.flag();');
        expect(output).toContain('if (isTrue(flag))');
    });
    test('a later write of another type demotes the local back to object', () => {
        const input =
        "class T {\n" +
        "    flag(): boolean {\n" +
        "        return true;\n" +
        "    }\n" +
        "    main(a: any) {\n" +
        "        let flag = this.flag();\n" +
        "        flag = a;\n" +
        "        if (flag) { return 1; }\n" +
        "        return 0;\n" +
        "    }\n" +
        "}";
        const output = transpiler.transpileCSharp(input).content;
        expect(output).toContain('object flag = this.flag();');
        expect(output).toContain('if (isTrue(flag))');
    });
    test('a boolean method result used as a ternary condition goes bare too', () => {
        const input =
        "class T {\n" +
        "    usesPrivateKey(): boolean {\n" +
        "        return true;\n" +
        "    }\n" +
        "    main(privateKey: string, secret: string) {\n" +
        "        const usesPrivKey = this.usesPrivateKey();\n" +
        "        const value = usesPrivKey ? privateKey : secret;\n" +
        "        return value;\n" +
        "    }\n" +
        "}";
        const output = transpiler.transpileCSharp(input).content;
        expect(output).toContain('bool usesPrivKey = this.usesPrivateKey();');
        expect(output).toContain('((bool) usesPrivKey) ? privateKey : secret');
        expect(output).not.toContain('isTrue');
    });
});

describe('csharp isEqual(getValue(x, "k"), lit) becomes a native comparison', () => {
    // the receiver's C# declaration comes from the embedding build layer (the resolver the
    // numeric-comparison installer sets), the element's type from the checker
    const withReceiverTypes = (types, input) => {
        transpiler.csharpTranspiler.csharpExpressionTypeResolver = (node) => types[node?.escapedText];
        try {
            return transpiler.transpileCSharp(input).content;
        } finally {
            transpiler.csharpTranspiler.csharpExpressionTypeResolver = undefined;
        }
    };
    test('a bool-proven dictionary element compared with a bool literal', () => {
        const output = withReceiverTypes({ market: 'Dictionary<string, object>' },
        "function f (market: { [key: string]: boolean | undefined }) {\n" +
        "    const isLinear = market['linear'] === true;\n" +
        "    const notInverse = market['inverse'] !== false;\n" +
        "    return [isLinear, notInverse];\n" +
        "}");
        expect(output).toContain('bool isLinear = ((getValue(market, "linear") as bool?) == true);');
        expect(output).toContain('bool notInverse = ((getValue(market, "inverse") as bool?) != false);');
        expect(output).not.toContain('isEqual(getValue(market, "linear"), true)');
        expect(output).not.toContain('isEqual(getValue(market, "inverse"), false)');
    });
    test('a string-proven dictionary element compared with a string literal', () => {
        const output = withReceiverTypes({ entry: 'Dictionary<string, object>' },
        "function f (entry: { [key: string]: string | undefined }) {\n" +
        "    const isPrimary = entry['default'] === 'primary';\n" +
        "    return isPrimary;\n" +
        "}");
        expect(output).toContain('bool isPrimary = ((getValue(entry, "default") as string) == "primary");');
        expect(output).not.toContain('isEqual(getValue(entry, "default"), "primary")');
    });
    test('the hand-written has field keeps the emulated string member comparable', () => {
        const output = transpiler.transpileCSharp(
        "class Exchange {\n" +
        "    has: { [key: string]: boolean | 'emulated' | undefined } = {};\n" +
        "    main() {\n" +
        "        const enabled = this.has['fetchTrades'] !== false;\n" +
        "        const emulated = this.has['fetchCurrencies'] === 'emulated';\n" +
        "        return [enabled, emulated];\n" +
        "    }\n" +
        "}").content;
        // a hard (bool?) cast would throw on the 'emulated' box, `as` reads it as null, where
        // isEqual answers false for the bool branch and true only for the string one
        expect(output).toContain('bool enabled = ((getValue(this.has, "fetchTrades") as bool?) != false);');
        expect(output).toContain('bool emulated = ((getValue(this.has, "fetchCurrencies") as string) == "emulated");');
    });
    test('an untyped dictionary element keeps isEqual', () => {
        const output = withReceiverTypes({ market: 'Dictionary<string, object>' },
        "function f (market: { [key: string]: any }) {\n" +
        "    const isLinear = market['linear'] === true;\n" +
        "    return isLinear;\n" +
        "}");
        expect(output).toContain('isEqual(getValue(market, "linear"), true)');
    });
    test('an unproven receiver keeps isEqual', () => {
        const output = transpiler.transpileCSharp(
        "function f (market: { [key: string]: boolean | undefined }) {\n" +
        "    const isLinear = market['linear'] === true;\n" +
        "    return isLinear;\n" +
        "}").content;
        expect(output).toContain('isEqual(getValue(market, "linear"), true)');
    });
    test('a literal of the other family keeps isEqual', () => {
        const output = withReceiverTypes({ market: 'Dictionary<string, object>' },
        "function f (market: { [key: string]: boolean | undefined }) {\n" +
        "    const isLinear = market['linear'] === 'true';\n" +
        "    return isLinear;\n" +
        "}");
        expect(output).toContain('isEqual(getValue(market, "linear"), "true")');
    });
    test('an identifier, a null and a numeric literal keep isEqual', () => {
        const output = withReceiverTypes({ market: 'Dictionary<string, object>' },
        "function f (market: { [key: string]: boolean | undefined }, flag) {\n" +
        "    const a = market['linear'] === flag;\n" +
        "    const b = market['linear'] === undefined;\n" +
        "    const c = market['linear'] === 1;\n" +
        "    return [a, b, c];\n" +
        "}");
        expect(output).toContain('isEqual(getValue(market, "linear"), flag)');
        expect(output).toContain('isEqual(getValue(market, "linear"), null)');
        expect(output).toContain('isEqual(getValue(market, "linear"), 1)');
    });
    test('a non-literal key keeps isEqual', () => {
        const output = withReceiverTypes({ market: 'Dictionary<string, object>' },
        "function f (market: { [key: string]: boolean | undefined }, key: string) {\n" +
        "    const isLinear = market[key] === true;\n" +
        "    const first = market[0] === true;\n" +
        "    return [isLinear, first];\n" +
        "}");
        expect(output).toContain('isEqual(getValue(market, key), true)');
        expect(output).toContain('isEqual(getValue(market, 0), true)');
    });
    test('a numeric-looking string literal keeps isEqual', () => {
        const output = withReceiverTypes({ code: 'Dictionary<string, object>' },
        "function f (code: { [key: string]: string | undefined }) {\n" +
        "    const one = code['value'] === '1';\n" +
        "    const primary = code['value'] === 'primary';\n" +
        "    return [one, primary];\n" +
        "}");
        // isEqual converts a boxed number and a numeric string on its double/decimal
        // branches, which the string cast cannot reproduce
        expect(output).toContain('isEqual(getValue(code, "value"), "1")');
        expect(output).toContain('bool primary = ((getValue(code, "value") as string) == "primary");');
    });
});

describe('csharp helper removal: a for-header counter prints the native ++ / --', () => {
    // the counter's printed `int` type comes back through csharpExpressionTypeResolver (the
    // embedding build layer proves it — build/csharp-local-types.js in ccxt retypes the
    // declaration `int i = 0` itself); these tests stub that resolver with a name map
    const withKinds = (kinds, input) => {
        transpiler.csharpTranspiler.csharpExpressionTypeResolver = (node) => kinds[node?.escapedText];
        try {
            return transpiler.transpileCSharp(input).content;
        } finally {
            transpiler.csharpTranspiler.csharpExpressionTypeResolver = undefined;
        }
    };
    const forLoop = (incrementor, declaration = 'let i = 0') =>
        "class Exchange {\n" +
        "    main(markets: any[]): void {\n" +
        "        for (" + declaration + "; i < 10; " + incrementor + ") {\n" +
        "            const x = markets[i];\n" +
        "        }\n" +
        "    }\n" +
        "}\n";
    test('an int counter prints i++ and drops the ref helper', () => {
        const output = withKinds({ i: 'int' }, forLoop('i++'));
        expect(output).toContain('; i++)');
        expect(output).not.toContain('postFixIncrement');
    });
    test('an int counter prints i-- (same ref-helper family)', () => {
        const output = withKinds({ i: 'int' }, forLoop('i--'));
        expect(output).toContain('; i--)');
        expect(output).not.toContain('postFixDecrement');
    });
    test('a counter the printer cannot name as int keeps the helper', () => {
        expect(withKinds({}, forLoop('i++'))).toContain('postFixIncrement(ref i)');
        expect(withKinds({ i: 'object' }, forLoop('i++'))).toContain('postFixIncrement(ref i)');
        expect(withKinds({ i: 'Int64' }, forLoop('i++'))).toContain('postFixIncrement(ref i)');
    });
    test('a postfix whose value is read keeps the helper (twin returns the new value)', () => {
        const input =
        "class Exchange {\n" +
        "    main(): void {\n" +
        "        let j = 0;\n" +
        "        const y = j++;\n" +
        "        console.log(y);\n" +
        "    }\n" +
        "}\n";
        expect(withKinds({ j: 'int' }, input)).toContain('postFixIncrement(ref j)');
    });
    test('a statement-position postfix keeps the helper (family is for headers only)', () => {
        const input =
        "class Exchange {\n" +
        "    main(): void {\n" +
        "        let k = 0;\n" +
        "        k++;\n" +
        "        console.log(k);\n" +
        "    }\n" +
        "}\n";
        expect(withKinds({ k: 'int' }, input)).toContain('postFixIncrement(ref k)');
    });
    test('a member-expression operand keeps the helper', () => {
        const input =
        "class Exchange {\n" +
        "    count: number = 0;\n" +
        "    main(): void {\n" +
        "        for (let i = 0; i < 10; this.count++) {\n" +
        "            const x = i;\n" +
        "        }\n" +
        "    }\n" +
        "}\n";
        const output = withKinds({ i: 'int', count: 'int' }, input);
        expect(output).toContain('postFixIncrement(ref this.count)');
    });
    test('a dictionary parameter prints the cast and the null test the helper applies', () => {
        const input =
        "class Exchange {\n" +
        "    parseTrade (trade: { [key: string]: any }) {\n" +
        "        if ('isDust' in trade) { return 1; }\n" +
        "        return 0;\n" +
        "    }\n" +
        "}";
        const output = transpiler.transpileCSharp(input).content;
        // a parameter is still `object`, so the receiver needs the same
        // (IDictionary<string, object>) cast the helper body applies, and the null test
        // because inOp answers false for a null receiver
        expect(output).toContain('public virtual object parseTrade(object trade)');
        expect(output).toContain('if ((trade != null && ((IDictionary<string, object>)trade).ContainsKey("isDust")))');
    });
    test('the params bag prints the cast without the null test', () => {
        const input =
        "function f (params: { [key: string]: any } = {}): any {\n" +
        "    if ('x' in params) { return params['x']; }\n" +
        "    return undefined;\n" +
        "}";
        const output = transpiler.transpileCSharp(input).content;
        // printFunctionBody already emitted `parameters ??= new Dictionary<string, object>()`,
        // so the box is a dictionary and can never be null at this point
        expect(output).toContain('parameters ??= new Dictionary<string, object>();');
        expect(output).toContain('if (((IDictionary<string, object>)parameters).ContainsKey("x"))');
    });
    test('a nullable dictionary receiver keeps the null test', () => {
        const input =
        "class Exchange {\n" +
        "    indexBy (a: any, b: any): { [key: string]: any } | undefined { return undefined; }\n" +
        "    main (a: any): any {\n" +
        "        const merged = this.indexBy(a, a);\n" +
        "        return ('k' in merged);\n" +
        "    }\n" +
        "}";
        const output = transpiler.transpileCSharp(input).content;
        expect(output).toContain('Dictionary<string, object> merged = this.indexBy(a, a);');
        // inOp answers false for the nullish arm, not a throw
        expect(output).toContain('return ((merged != null && merged.ContainsKey("k")));');
    });
    test('a dictionary parameter of another value type keeps the helper', () => {
        const input =
        "class Exchange {\n" +
        "    main (futures: { [key: string]: Promise<any> }): any {\n" +
        "        return ('k' in futures);\n" +
        "    }\n" +
        "}";
        const output = transpiler.transpileCSharp(input).content;
        // the C# box of a Dictionary<Future> is IDictionary<string, Future>: the invariant
        // cast to IDictionary<string, object> would throw, so the helper stays
        expect(output).toContain('return (inOp(futures, "k"));');
    });
    test('an object local keeps the helper: only parameters are cast', () => {
        const input =
        "function f (d: { [key: string]: any }): any {\n" +
        "    const other = d;\n" +
        "    return ('k' in other);\n" +
        "}";
        const output = transpiler.transpileCSharp(input).content;
        // the hand-written base may box its own instantiation (client.futures), and the
        // printer prints both locals as `object`
        expect(output).toContain('object other = d;');
        expect(output).toContain('return (inOp(other, "k"));');
    });
    test('a parameter rewritten before the read keeps the helper', () => {
        const input =
        "function f (params: { [key: string]: any } = {}): any {\n" +
        "    params = {};\n" +
        "    return ('x' in params);\n" +
        "}";
        const output = transpiler.transpileCSharp(input).content;
        // D2: the box at the read is whatever the assignment stored
        expect(output).toContain('return (inOp(parameters, "x"));');
    });
    test('a native receiver still needs a printed string key', () => {
        const input =
        "function f (params: { [key: string]: any } = {}, key: any): any {\n" +
        "    return (key in params);\n" +
        "}";
        const output = transpiler.transpileCSharp(input).content;
        // the C# parameter is `object`, so ContainsKey has no string to bind
        expect(output).toContain('return (inOp(parameters, key));');
    });
    test('a this-call on a delegate-valued base member prints the direct invocation', () => {
        // httpProxyCallback is `Func<object, object, object, object, object>` in
        // cs/ccxt/base/Exchange.Options.cs (4 parameters), so a 4-argument call is the
        // delegate invocation; ResolveMethod only finds methods, so the helper cannot
        // invoke it (callDynamically throws there)
        const input =
        "class Exchange {\n" +
        "    httpProxyCallback: any;\n" +
        "    main(url, method, headers, body) {\n" +
        "        const a = this.httpProxyCallback(url, method, headers, body);\n" +
        "        const b = this.https_proxy_callback(url, method, headers, body);\n" +
        "        return [a, b];\n" +
        "    }\n" +
        "}";
        const output = transpiler.transpileCSharp(input).content;
        expect(output).toContain('object a = this.httpProxyCallback(url, method, headers, body);');
        expect(output).toContain('object b = this.https_proxy_callback(url, method, headers, body);');
        expect(output).not.toContain('callDynamically(this, "httpProxyCallback"');
        expect(output).not.toContain('callDynamically(this, "https_proxy_callback"');
    });
    test('a 3-parameter delegate member takes exactly three arguments', () => {
        // proxyUrlCallback is `Func<object, object, object, object>` (3 parameters):
        // the matching call goes native, the 4-argument one the TS corpus writes keeps
        // the helper (a 4-argument call of a 3-parameter delegate does not compile)
        const input =
        "class Exchange {\n" +
        "    proxyUrlCallback: any;\n" +
        "    main(url, method, headers, body) {\n" +
        "        const three = this.proxyUrlCallback(url, method, headers);\n" +
        "        const four = this.proxyUrlCallback(url, method, headers, body);\n" +
        "        return [three, four];\n" +
        "    }\n" +
        "}";
        const output = transpiler.transpileCSharp(input).content;
        expect(output).toContain('object three = this.proxyUrlCallback(url, method, headers);');
        expect(output).toContain('object four = callDynamically(this, "proxyUrlCallback", new object[] { url, method, headers, body })');
    });
    test('an awaited delegate-member call or a non-delegate name keeps callDynamically', () => {
        // the delegates return object, not a Task, so an awaited call cannot go native;
        // `proxy` is a `string` member there and `someAnyFn` is not in the table at all
        const input =
        "class Exchange {\n" +
        "    httpProxyCallback: any;\n" +
        "    proxy: any;\n" +
        "    someAnyFn: any;\n" +
        "    async main(url, method, headers, body) {\n" +
        "        const a = await this.httpProxyCallback(url, method, headers, body);\n" +
        "        const b = this.proxy(url, method, headers, body);\n" +
        "        const c = this.someAnyFn(url, method, headers, body);\n" +
        "        return [a, b, c];\n" +
        "    }\n" +
        "}";
        const output = transpiler.transpileCSharp(input).content;
        expect(output).toContain('object a = await ((Task<object>)callDynamically(this, "httpProxyCallback", new object[] { url, method, headers, body }));');
        expect(output).toContain('object b = callDynamically(this, "proxy", new object[] { url, method, headers, body })');
        expect(output).toContain('object c = callDynamically(this, "someAnyFn", new object[] { url, method, headers, body })');
    });
});

describe('csharp helper removal: getIndexOf becomes the receiver IndexOf', () => {
    // the printed C# type of a local the embedding build layer retypes comes back through
    // csharpExpressionTypeResolver — these tests stub that resolver with a name map
    const withKinds = (kinds, input) => {
        transpiler.csharpTranspiler.csharpExpressionTypeResolver = (node) => kinds[node?.escapedText];
        try {
            return transpiler.transpileCSharp(input).content;
        } finally {
            transpiler.csharpTranspiler.csharpExpressionTypeResolver = undefined;
        }
    };
    test('a non-optional string parameter scans natively, ordinally', () => {
        const input =
        "class Exchange {\n" +
        "    main(symbol: string) {\n" +
        "        const hasSlash = symbol.indexOf ('/') > -1;\n" +
        "        return hasSlash;\n" +
        "    }\n" +
        "}\n";
        const output = transpiler.transpileCSharp(input).content;
        expect(output).toContain('((string)symbol).IndexOf("/", StringComparison.Ordinal) > -1');
        expect(output).not.toContain('getIndexOf(');
    });
    test('a `string?` local without a non-null test keeps the -1 answer for null', () => {
        const input =
        "class Exchange {\n" +
        "    main(flags: string) {\n" +
        "        const hasPost = flags.indexOf ('post') > -1;\n" +
        "        return hasPost;\n" +
        "    }\n" +
        "}\n";
        const output = withKinds({ flags: 'string?' }, input);
        expect(output).toContain('getIndexOf(flags, "post")');
        expect(output).not.toContain('StringComparison.Ordinal');
    });
    test('an early-exiting `x === undefined` guard admits the read', () => {
        const input =
        "class Exchange {\n" +
        "    main(type: string) {\n" +
        "        if (type === undefined) {\n" +
        "            throw new Error ('missing type');\n" +
        "        }\n" +
        "        const isFee = type.indexOf ('fee') >= 0;\n" +
        "        return isFee;\n" +
        "    }\n" +
        "}\n";
        const output = transpiler.transpileCSharp(input).content;
        expect(output).toContain('((string)type).IndexOf("fee", StringComparison.Ordinal) >= 0');
        expect(output).not.toContain('getIndexOf(');
    });
    test('a `&&` conjunct and a then-branch null test admit the read too', () => {
        const conjunct =
        "class Exchange {\n" +
        "    main(method: string) {\n" +
        "        const isHistorical = (method !== undefined) && (method.indexOf ('GetHistoricalTrades') >= 0);\n" +
        "        return isHistorical;\n" +
        "    }\n" +
        "}\n";
        const conjunctOutput = withKinds({ method: 'string?' }, conjunct);
        expect(conjunctOutput).toContain('((string)method).IndexOf("GetHistoricalTrades", StringComparison.Ordinal) >= 0');
        expect(conjunctOutput).not.toContain('getIndexOf(');
        const branch =
        "class Exchange {\n" +
        "    main(orderType: string) {\n" +
        "        let side = undefined;\n" +
        "        if (orderType !== undefined) {\n" +
        "            if (orderType.indexOf ('Bid') >= 0) {\n" +
        "                side = 'buy';\n" +
        "            }\n" +
        "        }\n" +
        "        return side;\n" +
        "    }\n" +
        "}\n";
        const branchOutput = withKinds({ orderType: 'string?' }, branch);
        expect(branchOutput).toContain('((string)orderType).IndexOf("Bid", StringComparison.Ordinal) >= 0');
        expect(branchOutput).not.toContain('getIndexOf(');
    });
    test('a write between the guard and the read voids the proof', () => {
        const guarded =
        "class Exchange {\n" +
        "    main(type: Str) {\n" +
        "        if (type === undefined) {\n" +
        "            return undefined;\n" +
        "        }\n" +
        "        const isFee = type.indexOf ('fee') >= 0;\n" +
        "        return isFee;\n" +
        "    }\n" +
        "}\n" +
        "type Str = string | undefined;\n";
        const guardedOutput = withKinds({ type: 'string?' }, guarded);
        expect(guardedOutput).toContain('((string)type).IndexOf("fee", StringComparison.Ordinal) >= 0');
        const written =
        "class Exchange {\n" +
        "    main(type: Str) {\n" +
        "        if (type === undefined) {\n" +
        "            return undefined;\n" +
        "        }\n" +
        "        type = 'fee';\n" +
        "        const isFee = type.indexOf ('fee') >= 0;\n" +
        "        return isFee;\n" +
        "    }\n" +
        "}\n" +
        "type Str = string | undefined;\n";
        // the guard inspected the value the parameter held, not what the branch bound afterwards
        expect(withKinds({ type: 'string?' }, written)).toContain('getIndexOf(type, "fee")');
    });
    test('a `Str` parameter and an `any` receiver keep the helper', () => {
        const input =
        "class Exchange {\n" +
        "    main(symbol: Str, value: any) {\n" +
        "        const hasSlash = symbol.indexOf ('/') > -1;\n" +
        "        const hasDot = value.indexOf ('.') > -1;\n" +
        "        return [hasSlash, hasDot];\n" +
        "    }\n" +
        "}\n" +
        "type Str = string | undefined;\n";
        const output = transpiler.transpileCSharp(input).content;
        expect(output).toContain('getIndexOf(symbol, "/")');
        expect(output).toContain('getIndexOf(value, ".")');
    });
    test('an `as string` assertion and a `this.field: string` are strings', () => {
        const input =
        "class Exchange {\n" +
        "    secret: string = undefined;\n" +
        "    apiKey: string;\n" +
        "    main(id: Str) {\n" +
        "        const casted = (id as string).indexOf ('F0') >= 0;\n" +
        "        const hasKey = this.apiKey.indexOf ('account') < 0;\n" +
        "        const hasSecret = this.secret.indexOf ('PRIVATE KEY') > -1;\n" +
        "        return [casted, hasKey, hasSecret];\n" +
        "    }\n" +
        "}\n" +
        "type Str = string | undefined;\n";
        const output = transpiler.transpileCSharp(input).content;
        expect(output).toContain('((string)id).IndexOf("F0", StringComparison.Ordinal) >= 0');
        expect(output).toContain('((string)this.apiKey).IndexOf("account", StringComparison.Ordinal) < 0');
        // `secret: string = undefined` holds undefined until the credentials are set
        expect(output).toContain('getIndexOf(this.secret, "PRIVATE KEY")');
    });
    test('a `List<object>` local takes its own IndexOf', () => {
        const input =
        "class Exchange {\n" +
        "    main(keys: any) {\n" +
        "        const at = keys.indexOf ('ticker');\n" +
        "        return at;\n" +
        "    }\n" +
        "}\n";
        const output = withKinds({ keys: 'List<object>' }, input);
        expect(output).toContain('((List<object>)keys).IndexOf("ticker")');
        expect(output).not.toContain('getIndexOf(');
    });
    test('a needle of unknown C# type takes the helper\'s own (string) cast; a numeric one keeps the helper', () => {
        const unknown =
        "class Exchange {\n" +
        "    main(symbol: string, key: any) {\n" +
        "        const at = symbol.indexOf (key);\n" +
        "        return at;\n" +
        "    }\n" +
        "}\n";
        const unknownOutput = transpiler.transpileCSharp(unknown).content;
        expect(unknownOutput).toContain('((string)symbol).IndexOf(((string)key), StringComparison.Ordinal)');
        const numeric =
        "class Exchange {\n" +
        "    main(symbol: string) {\n" +
        "        const at = symbol.indexOf (5);\n" +
        "        return at;\n" +
        "    }\n" +
        "}\n";
        expect(transpiler.transpileCSharp(numeric).content).toContain('getIndexOf(symbol, 5)');
    });
});
