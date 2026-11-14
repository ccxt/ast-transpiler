import { Transpiler } from '../src/transpiler';
// the test bodies name their TS source snippets `ts`, so the compiler API gets its own name
import { SyntaxKind } from 'typescript/unstable/ast';
import { isStringLiteralLikeNode } from 'typescript/unstable/ast/is';
import { describe, test, expect } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
jest.mock('module',()=>({
    __esModule: true,                 // this makes it work
    default: jest.fn()
  }));

// the parser options most suites print with: getValue(...) element reads, no trailing lines
const WRAPPED_PARSER = { 'NUM_LINES_END_FILE': 0, 'ELEMENT_ACCESS_WRAPPER_OPEN': 'getValue(', 'ELEMENT_ACCESS_WRAPPER_CLOSE': ')' };
const PLAIN_PARSER = { 'NUM_LINES_END_FILE': 0 };

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
    installDeclaredMembers((transpiler as any).csharpTranspiler);
})

// the declared C# types of the hand-written runtime members (cs/ccxt/base/Exchange.Options.cs,
// Exchange.Generic.cs, ws/Client.cs), as the embedding build layer reads them from those files
const DECLARED_THIS: { [name: string]: any } = {
    'has': { type: 'Dictionary<string, object>', initializer: 'new dict()' },
    'features': { type: 'Dictionary<string, object>' },
    'timeframes': { type: 'Dictionary<string, object>', initializer: 'null' },
    'options': { type: 'ccxt.pro.OwnedTable<object>', initializer: 'new ccxt.pro.OwnedTable<object>()' },
    'markets': { type: 'IDictionary<string, object>', initializer: 'null' },
    'markets_by_id': { type: 'IDictionary<string, object>', initializer: 'null' },
    'exceptions': { type: 'IDictionary<string, object>', initializer: 'new dict()' },
    'headers': { type: 'IDictionary<string, object>', initializer: 'new dict()' },
    'fees': { type: 'IDictionary<string, object>', initializer: 'new dict()' },
    'requiredCredentials': { type: 'IDictionary<string, object>', initializer: 'new dict()' },
    'urls': { type: 'IDictionary<string, object>', initializer: 'new dict()', views: { api: { view: 'urlsApi', sections: 'urlsApiSections' } }, refresh: 'RefreshUrlsViews' },
    'accounts': { type: 'List<object>', initializer: 'new List<object>()' },
    'symbols': { type: 'List<object>', initializer: 'null' },
    'currencies': { type: 'object', initializer: 'new dict()' },
    'positions': { type: 'object' },
    'ohlcvs': { type: 'IDictionary<string, object>', routed: true },
};
const DECLARED_CLIENT: { [name: string]: any } = {
    'subscriptions': { type: 'OwnedTable<object>' },
    'rejections': { type: 'OwnedTable<object>' },
};
function installDeclaredMembers(printer: any, members = DECLARED_THIS) {
    printer.csharpDeclaredMemberType = (owner: string, name: string) => (owner === 'this' ? members : DECLARED_CLIENT)[name];
    printer.csharpDeclaredMethodReturnType = (name: string) => (name === 'isDictionary' ? 'bool' : undefined);
}

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
        "        Console.WriteLine((\"Hello! I'm inside main class:\" + message));\n" +
        "    }\n" +
        "}";
        const output = transpiler.transpileCSharp(ts).content;
        expect(output).toBe(cs);
    });
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
        "object b = (2L * 2L);\n" +
        "object c = divide(3, 3);\n" +
        "object d = subtract(4, 4);\n" +
        "object e = mod(5, 5);\n" +
        // two string literals: add(string, string) IS C# concatenation, nulls included
        "string f = (\"foo\" + \"bar\");"
        const output = transpiler.transpileCSharp(ts).content;
        expect(output).toBe(csharp);
    })
    test('multiply of two numeric literals prints the native product when the helper box is the same', () => {
        const ts =
        "const a = 30 * 24;\n" +
        "const b = 5 * 1.67;\n" +
        "const c = 2.5 * 1.5;\n" +
        "const d = 2 * 1.5;\n" +
        "const e = 9007199254740991 * 2;\n" +
        "const f = 1e3 * 2;\n" +
        "const g = 100 * 1.1;\n";
        const csharp =
        "object a = (30L * 24L);\n" +
        "object b = (5 * 1.67);\n" +
        "object c = (2.5 * 1.5);\n" +
        "object d = multiply(2, 1.5);\n" +
        "object e = multiply(9007199254740991, 2);\n" +
        "object f = (1000L * 2L);\n" +
        "object g = multiply(100, 1.1);"
        const output = transpiler.transpileCSharp(ts).content;
        expect(output).toBe(csharp);
    })
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
        hooked.csharpTranspiler.csharpDeclaredReceiverType = (node) => (node?.text === 'x') ? 'Dictionary<string, object>' : undefined;
        expect(hooked.transpileCSharp(ts).content).toBe(
            "object x = new Dictionary<string, object>() {};\n" +
            "x[\"teste\"] = 1;");
        hooked.csharpTranspiler.csharpDeclaredReceiverType = (node) => (node?.text === 'x') ? 'IDictionary<string, object>' : undefined;
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
        hooked.csharpTranspiler.csharpDeclaredReceiverType = (node) => (node?.text === 'x') ? 'Dictionary<string, object>' : undefined;
        const ts =
        "const x = {};\n" +
        "x[1] = 1;";
        expect(hooked.transpileCSharp(ts).content).toBe(
            "object x = new Dictionary<string, object>() {};\n" +
            "((List<object>)x)[Convert.ToInt32(1)] = 1;");
    })
    // the same declared-receiver proof reaches every other shape the printer wraps around a
    // dictionary element access — the element READ, Object.keys/values and `delete`. The unhooked
    // emission is the base printer's, byte for byte.
    test('a dict-typed receiver drops the cast on reads, Object.keys/values and delete', () => {
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
        const ts =
        "const x = { \"a\": 1 };\n" +
        "const v = x[\"a\"];\n" +
        "const k = Object.keys(x);\n" +
        "const w = Object.values(x);\n" +
        "delete x[\"a\"];\n" +
        "x[\"b\"] = 2;";
        expect(new Transpiler(config).transpileCSharp(ts).content).toBe(
            "object x = new Dictionary<string, object>() {\n" +
            "    { \"a\", 1 },\n" +
            "};\n" +
            "object v = ((IDictionary<string,object>)x)[\"a\"];\n" +
            "List<object> k = new List<object>(((IDictionary<string,object>)x).Keys);\n" +
            "List<object> w = new List<object>(((IDictionary<string,object>)x).Values);\n" +
            "((IDictionary<string,object>)x).Remove((string)\"a\");\n" +
            "((IDictionary<string,object>)x)[\"b\"] = 2;");
        const hooked = new Transpiler(config);
        hooked.csharpTranspiler.csharpDeclaredReceiverType = (node) => (node?.text === 'x') ? 'Dictionary<string, object>' : undefined;
        expect(hooked.transpileCSharp(ts).content).toBe(
            "object x = new Dictionary<string, object>() {\n" +
            "    { \"a\", 1 },\n" +
            "};\n" +
            "object v = x[\"a\"];\n" +
            "List<object> k = new List<object>(x.Keys);\n" +
            "List<object> w = new List<object>(x.Values);\n" +
            "x.Remove((string)\"a\");\n" +
            "x[\"b\"] = 2;");
        hooked.csharpTranspiler.csharpDeclaredReceiverType = (node) => (node?.text === 'x') ? 'IDictionary<string, object>' : undefined;
        expect(hooked.transpileCSharp(ts).content).toBe(
            "object x = new Dictionary<string, object>() {\n" +
            "    { \"a\", 1 },\n" +
            "};\n" +
            "object v = x[\"a\"];\n" +
            "List<object> k = new List<object>(x.Keys);\n" +
            "List<object> w = new List<object>(x.Values);\n" +
            "x.Remove((string)\"a\");\n" +
            "x[\"b\"] = 2;");
    })
    // a receiver that binds to a PARAMETER is answered by csharpPrintedParamType — the type
    // the printed signature carries (INFER_ARG_TYPE). Without a hook the same snippet keeps every
    // cast, and a parameter the printer leaves `object` keeps it too.
    test('the declared-receiver hook reaches a parameter receiver', () => {
        const config = {
            'verbose': false,
            'csharp': {
                'parser': {
                    'NUM_LINES_END_FILE': 0,
                    'ELEMENT_ACCESS_WRAPPER_OPEN': 'getValue(',
                    'ELEMENT_ACCESS_WRAPPER_CLOSE': ')',
                    'INFER_ARG_TYPE': true
                }
            }
        }
        const ts =
        "type Dict = { [key: string]: any };\n" +
        "class Test {\n" +
        "    async createOrder (params: Dict, amount: object) {\n" +
        "        params[\"type\"] = 'limit';\n" +
        "        amount[\"type\"] = 'limit';\n" +
        "    }\n" +
        "}\n";
        expect(new Transpiler(config).transpileCSharp(ts).content).toBe(
            "class Test\n" +
            "{\n" +
            "    public async virtual Task createOrder(Dictionary<string, object> parameters, object amount)\n" +
            "    {\n" +
            "        ((IDictionary<string,object>)parameters)[\"type\"] = \"limit\";\n" +
            "        ((IDictionary<string,object>)amount)[\"type\"] = \"limit\";\n" +
            "    }\n" +
            "}");
        const hooked = new Transpiler(config);
        hooked.csharpTranspiler.csharpDeclaredReceiverType = function (node) { return this.csharpPrintedParamType(node); };
        expect(hooked.transpileCSharp(ts).content).toBe(
            "class Test\n" +
            "{\n" +
            "    public async virtual Task createOrder(Dictionary<string, object> parameters, object amount)\n" +
            "    {\n" +
            "        parameters[\"type\"] = \"limit\";\n" +
            "        ((IDictionary<string,object>)amount)[\"type\"] = \"limit\";\n" +
            "    }\n" +
            "}");
    })
    // the typed dict read family: the consumer's classifier proves the receiver's declared C# type
    // (supplied by the embedding build layer), the printer then binds the typed static twin. Without the
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
            install((node: any) => (isStringLiteralLikeNode(node.argumentExpression) ? 'IDictionary<string, object>' : undefined));
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
        // `grown += 'x'` is a string self-concat: the local stays a NON-NULL string
        expect(output).toContain("string grown = ((string)market).ToUpper()");
        expect(output).toContain('grown = (grown + ("x"));');
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
        // prints as a C# bool (csharpConditionPrintsBool proves the node shape; the
        // printed-form check names the same identity); the return unbox is unchanged
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
        expect(output).toContain("public virtual bool filtered(IList<object> items)");
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
    test('a method declared `: Str` returns string? and a `: string` one returns string', () => {
        const input =
        "type Str = string | undefined;\n" +
        "class Exchange {\n" +
        "    getWsUrl (type: any): Str {\n" +
        "        return this.getId (type);\n" +
        "    }\n" +
        "    getId (type: any): string {\n" +
        "        return 'x';\n" +
        "    }\n" +
        "    unproven (type: any): Str {\n" +
        "        return this.safeString (type);\n" +
        "    }\n" +
        "    boxed (type: any): Str {\n" +
        "        const value: any = this.safeString (type);\n" +
        "        return value;\n" +
        "    }\n" +
        "    safeString (a: any, b?: any, c?: any) { return a; }\n" +
        "}";
        const output = transpiler.transpileCSharp(input).content;
        expect(output).toContain("public virtual string? getWsUrl(object type)");
        expect(output).toContain("public virtual string? getId(object type)");
        // a call to a method whose printed return already IS the declared string needs no unbox
        expect(output).toContain("return this.getId(type);");
        // a call whose printed return already IS string? needs no unbox
        expect(output).toContain("return this.safeString(type);");
        // an `object`-typed local keeps the unbox: the cast only names the box's type
        expect(output).toContain("return ((string?)((object)(value)));");
        // a `: string` method returning a literal needs no unbox either
        expect(output).toContain("return \"x\";");
    });
    test('string return typing skips async, inferred and mixed-union methods', () => {
        const input =
        "class Exchange {\n" +
        "    async later (x: any): Promise<string> { return 'a'; }\n" +
        "    inferred (x: any) { return 'a'; }\n" +
        "    mixed (x: any): string | number { return x; }\n" +
        "    dict (x: any): Dict { return x; }\n" +
        "}";
        const output = transpiler.transpileCSharp(input).content;
        expect(output).toContain("public async virtual Task<object> later(object x)");
        expect(output).toContain("public virtual object inferred(object x)");
        expect(output).toContain("public virtual object mixed(object x)");
        expect(output).toContain("public virtual object dict(object x)");
    });
    test('a proven string return concatenates natively, an unproven operand keeps add', () => {
        const input =
        "type Str = string | undefined;\n" +
        "class Exchange {\n" +
        "    getWsUrl (type: any): Str {\n" +
        "        const baseUrl = this.safeValue (this.urls, type);\n" +
        "        return this.wrap (baseUrl, 'ws');\n" +
        "    }\n" +
        "    wrap (base: any, tail: any): Str {\n" +
        "        return this.suffix (tail);\n" +
        "    }\n" +
        "    suffix (s: any): string {\n" +
        "        return s;\n" +
        "    }\n" +
        "    privateUrl (type: any, listenKey: any): Str {\n" +
        "        return this.getWsUrl (type) + '?listenKey=' + listenKey;\n" +
        "    }\n" +
        "}";
        const output = transpiler.transpileCSharp(input).content;
        // the typed-return call and both literals prove; the untyped `listenKey` keeps the helper
        expect(output).toContain("return ((string?)((object)(add((this.getWsUrl(type) + \"?listenKey=\"), listenKey))));");
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
        expect(otherOutput).toContain('object id = (response != null && response.ContainsKey("id") ? response["id"] : null);');
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
    test('a currency-row local the declared table proves is a dictionary prints the native read', () => {
        const input =
        "class Exchange {\n" +
        "    extend(a: any, b: any): any { return a; }\n" +
        "    main(a: any, b: any) {\n" +
        "        const currency = this.extend(a, b);\n" +
        "        const code = currency['code'];\n" +
        "        return code;\n" +
        "    }\n" +
        "}";
        const output = transpiler.transpileCSharp(input).content;
        expect(output).toContain('Dictionary<string, object> currency = this.extend(a, b);');
        // getValue yields null for a missing key, a C# indexer throws: the native read keeps the
        // ContainsKey test
        expect(output).toContain('object code = (currency.ContainsKey("code") ? currency["code"] : null);');
        expect(output).not.toContain('getValue(currency, "code")');
    });
    test('currency reads outside the declared table keep getValue', () => {
        // the receiver local is not typed: no proof, the helper stays
        const untyped =
        "class Exchange {\n" +
        "    getCurrencyFromSymbols(symbols: any): any { return symbols; }\n" +
        "    main(symbols: any) {\n" +
        "        const currency = this.getCurrencyFromSymbols(symbols);\n" +
        "        const code = currency['code'];\n" +
        "        return code;\n" +
        "    }\n" +
        "}";
        const untypedOutput = transpiler.transpileCSharp(untyped).content;
        expect(untypedOutput).toContain('object currency = this.getCurrencyFromSymbols(symbols);');
        expect(untypedOutput).toContain('object code = getValue(currency, "code");');
        // a numeric key is a list index, not a currency key
        const numberKey =
        "class Exchange {\n" +
        "    extend(a: any, b: any): any { return a; }\n" +
        "    main(a: any, b: any) {\n" +
        "        const currency = this.extend(a, b);\n" +
        "        const first = currency[0];\n" +
        "        return first;\n" +
        "    }\n" +
        "}";
        expect(transpiler.transpileCSharp(numberKey).content).toContain('object first = getValue(currency, 0);');
    });
    test('a declaration the declared-local resolver types as a dictionary reads natively', () => {
        const printer: any = (transpiler as any).csharpTranspiler;
        const previous = printer.csharpDeclaredLocalTypeResolver;
        // a parameter the build layer retypes to the interface: its box may still be null, so
        // the emitted read carries the helper's null receiver branch
        printer.csharpDeclaredLocalTypeResolver = (declaration: any) => (declaration?.name?.text === 'currency') ? 'IDictionary<string, object>' : undefined;
        const output = transpiler.transpileCSharp(
        "class Exchange {\n" +
        "    main(currency: any) {\n" +
        "        const code = currency['code'];\n" +
        "        return code;\n" +
        "    }\n" +
        "}").content;
        printer.csharpDeclaredLocalTypeResolver = previous;
        expect(output).toContain('object code = (currency != null && currency.ContainsKey("code") ? currency["code"] : null);');
        expect(output).not.toContain('getValue(currency, "code")');
    });
    test('a null-tested declared collection still reads natively', () => {
        const printer: any = (transpiler as any).csharpTranspiler;
        const previous = printer.csharpDeclaredLocalTypeResolver;
        printer.csharpDeclaredLocalTypeResolver = (declaration: any) => (declaration?.name?.text === 'row') ? 'Dictionary<string, object>' : ((declaration?.name?.text === 'items') ? 'List<object>' : undefined);
        const output = transpiler.transpileCSharp(
        "class Exchange {\n" +
        "    main(row: any, items: any, other: any) {\n" +
        "        if (row === undefined || items === undefined) {\n" +
        "            return undefined;\n" +
        "        }\n" +
        "        const code = row['code'];\n" +
        "        const first = items[0];\n" +
        "        const last = items[-1];\n" +
        "        const id = other['id'];\n" +
        "        return [ code, first, last, id ];\n" +
        "    }\n" +
        "}").content;
        printer.csharpDeclaredLocalTypeResolver = previous;
        expect(output).toContain('object code = (row != null && row.ContainsKey("code") ? row["code"] : null);');
        expect(output).toContain('object first = (items != null && 0 < items.Count ? items[0] : null);');
        expect(output).toContain('object last = getValue(items, -1);');
        expect(output).toContain('object id = getValue(other, "id");');
    });
    test('identifier keys on declared collections and base dict fields read natively', () => {
        const printer: any = (transpiler as any).csharpTranspiler;
        const previous = printer.csharpDeclaredLocalTypeResolver;
        const previousLocal = printer.csharpLocalTypeOf;
        printer.csharpDeclaredLocalTypeResolver = (declaration: any) => (declaration?.name?.text === 'row') ? 'Dictionary<string, object>' : ((declaration?.name?.text === 'items') ? 'List<object>' : undefined);
        printer.csharpLocalTypeOf = (node: any) => (node?.text === 'key') ? 'string?' : ((node?.text === 'big') ? 'Int64' : ((node?.text === 'i') ? 'int' : undefined));
        const output = transpiler.transpileCSharp(
        "class Exchange {\n" +
        "    has: any; urls: any; timeframes: any;\n" +
        "    main(row: any, items: any, other: any, key: any, big: any, k2: any) {\n" +
        "        const out = [];\n" +
        "        for (let i = 0; i < 3; i++) {\n" +
        "            out.push (items[i]);\n" +
        "        }\n" +
        "        const a = row[key];\n" +
        "        const b = this.has[key];\n" +
        "        const c = this.urls[key];\n" +
        "        const d = other[key];\n" +
        "        const e = items[big];\n" +
        "        const f = row[k2];\n" +
        "        const g = this.timeframes[k2];\n" +
        "        return [ out, a, b, c, d, e, f, g ];\n" +
        "    }\n" +
        "}").content;
        printer.csharpDeclaredLocalTypeResolver = previous;
        printer.csharpLocalTypeOf = previousLocal;
        expect(output).toContain('(items != null && i < items.Count ? items[i] : null)');
        expect(output).toContain('object a = (row != null && key != null && row.ContainsKey(key) ? row[key] : null);');
        expect(output).toContain('object b = (this.has != null && key != null && this.has.ContainsKey(key) ? this.has[key] : null);');
        expect(output).toContain('object c = (this.urls != null && key != null && this.urls.ContainsKey(key) ? this.urls[key] : null);');
        expect(output).toContain('object d = getValue(other, key);');
        expect(output).toContain('object e = getValue(items, big);');
        expect(output).toContain('object f = getValue(row, k2);');
        expect(output).toContain('object g = getValue(this.timeframes, k2);');
    });
    test('a non-dictionary declared-local resolver answer keeps getValue', () => {
        const printer: any = (transpiler as any).csharpTranspiler;
        const previous = printer.csharpDeclaredLocalTypeResolver;
        printer.csharpDeclaredLocalTypeResolver = () => 'List<object>';
        const output = transpiler.transpileCSharp(
        "class Exchange {\n" +
        "    main(currency: any) {\n" +
        "        const code = currency['code'];\n" +
        "        return code;\n" +
        "    }\n" +
        "}").content;
        printer.csharpDeclaredLocalTypeResolver = previous;
        expect(output).toContain('object code = getValue(currency, "code");');
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
        expect(output).toContain("if ((this.safeBool(a, \"k\") == true))");
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

// cs-14: a call whose own C# signature is a non-nullable `bool` needs no isTrue round-trip either —
// the wrapper is the identity on a bool. The C# signature is proven either by the TS declaration
// the generator prints itself (`this.<name>(...)`, same csharpBooleanReturnType as the definition)
// or by the hand-written-callee table (callees cs/ccxt/base declares with a bool signature and no
// TS annotation to read: Precise's comparisons, the imported isEmpty/isJsonEncodedObject props).
describe('isTrue is dropped for a call whose C# signature is a non-nullable bool', () => {
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
        // the hand-written base declares `bool isDictionary` (Exchange.Generic.cs): the declared return
        // type, not the TS annotation, decides, so the wrapper goes
        expect(output).toContain("if (this.isDictionary(v))");
        const printer: any = (transpiler as any).csharpTranspiler;
        const previous = printer.csharpDeclaredMethodReturnType;
        printer.csharpDeclaredMethodReturnType = (name: string) => (name === 'isDictionary' ? 'object' : undefined);
        const shadowed = transpiler.transpileCSharp(input).content;
        printer.csharpDeclaredMethodReturnType = previous;
        expect(shadowed).toContain("if (isTrue(this.isDictionary(v)))");
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

// `isTrue (x)` on a `bool?` read is `x == true`: both answer false for a null box. The
// declaration type is the proof, so a local the printer leaves `object` keeps the helper.
describe('a nullable bool local prints an explicit `== true` instead of isTrue', () => {
    const boolProgram = (body: string, second = false) =>
        "class T {\n" +
        "    safeBool(d: any, k: any): boolean | undefined { return undefined; }\n" +
        "    f(a, b) {\n" +
        "        const v = this.safeBool(a, 'k');\n" +
        (second ? "        const w = this.safeBool(b, 'k');\n" : "") +
        body +
        "    }\n" +
        "}";
    test('if / ! / ternary conditions on a bool? local', () => {
        const ifOutput = transpiler.transpileCSharp(boolProgram("        if (v) { return 1; }\n")).content;
        expect(ifOutput).toContain("bool? v = this.safeBool(a, \"k\");");
        expect(ifOutput).toContain("if ((v == true))");
        expect(ifOutput).not.toContain("isTrue");
        const notOutput = transpiler.transpileCSharp(boolProgram("        if (!v) { return 1; }\n")).content;
        expect(notOutput).toContain("if (v != true)");
        const ternaryOutput = transpiler.transpileCSharp(boolProgram("        const s = v ? 'yes' : 'no';\n        return s;\n")).content;
        expect(ternaryOutput).toContain("v == true ? \"yes\" : \"no\"");
    });
    test('logical conditions and a wrapped read keep their operands native', () => {
        const output = transpiler.transpileCSharp(boolProgram("        if (v || w) { return 1; }\n        if (v && w) { return 2; }\n        if ((v)) { return 3; }\n        return 4;\n", true)).content;
        expect(output).toContain("if ((v == true) || (w == true))");
        expect(output).toContain("if ((v == true) && (w == true))");
        expect(output).toContain("if ((v == true))");
        expect(output).not.toContain("isTrue");
    });
    test('an object box, a call result and a demoted bool? local keep the wrapper', () => {
        const objectOutput = transpiler.transpileCSharp(boolProgram("        const o = a['k'];\n        if (o) { return 1; }\n")).content;
        expect(objectOutput).toContain("if (isTrue(o))");
        const callOutput = transpiler.transpileCSharp(boolProgram("        if (this.safeBool(a, 'k')) { return 1; }\n")).content;
        expect(callOutput).toContain("if ((this.safeBool(a, \"k\") == true))");
        const demotedOutput = transpiler.transpileCSharp(
        "class T {\n" +
        "    safeBool(d: any, k: any): boolean | undefined { return undefined; }\n" +
        "    f(a, p) {\n" +
        "        let v = this.safeBool(a, 'k');\n" +
        "        v = p;\n" +
        "        if (v) { return 1; }\n" +
        "    }\n" +
        "}").content;
        expect(demotedOutput).toContain("object v = this.safeBool(a, \"k\");");
        expect(demotedOutput).toContain("if (isTrue(v))");
    });
    test('the embedding layer\'s declaration proof also drives the condition', () => {
        const printer: any = (transpiler as any).csharpTranspiler;
        const previous = printer.csharpExpressionTypeResolver;
        // a local the printer itself leaves `object` but the ccxt classifier prints `bool?`
        printer.csharpExpressionTypeResolver = (node: any) => (node?.text === 'v' ? 'bool?' : undefined);
        const output = transpiler.transpileCSharp(
        "class T {\n" +
        "    f(a) {\n" +
        "        let v = a['k'];\n" +
        "        if (v) { return 1; }\n" +
        "    }\n" +
        "}").content;
        printer.csharpExpressionTypeResolver = previous;
        expect(output).toContain("object v = getValue(a, \"k\");");
        expect(output).toContain("if ((v == true))");
        expect(output).not.toContain("isTrue");
    });
});

// `isTrue(<call>)` where the call's PRINTED C# signature is `bool?` — the hand-written
// `bool? safeBool(...)` base family and a `this.<name>(...)` whose TS declaration the generator
// prints itself — answers exactly what the lifted `== true` answers for that box (null -> false,
// the box's own bool otherwise), so the wrapper goes. A receiver the printer cannot name, or a
// callee whose declaration does not carry the `bool?` spelling, keeps the helper.
describe('isTrue on a bool?-returning call becomes the lifted `== true` comparison', () => {
    const callProgram = (body: string) =>
        "class T {\n" +
        "    safeBool(d: any, k: any): boolean | undefined { return undefined; }\n" +
        "    couldBe(a: any): boolean | undefined { return undefined; }\n" +
        "    f(a) {\n" +
        body +
        "    }\n" +
        "}";
    test('a this.<name>(...) declared `boolean | undefined` goes native in if / ! / ternary', () => {
        const ifOutput = transpiler.transpileCSharp(callProgram("        if (this.couldBe(a)) { return 1; }\n")).content;
        expect(ifOutput).toContain("if ((this.couldBe(a) == true))");
        expect(ifOutput).not.toContain("isTrue");
        const notOutput = transpiler.transpileCSharp(callProgram("        if (!this.couldBe(a)) { return 1; }\n")).content;
        expect(notOutput).toContain("if (!(this.couldBe(a) == true))");
        const ternaryOutput = transpiler.transpileCSharp(callProgram("        const s = this.couldBe(a) ? 'yes' : 'no';\n        return s;\n")).content;
        expect(ternaryOutput).toContain("(this.couldBe(a) == true) ? \"yes\" : \"no\"");
    });
    test('the hand-written safeBool family is proven by the printed return table', () => {
        const output = transpiler.transpileCSharp(callProgram("        if (this.safeBool(a, 'k')) { return 1; }\n        return 2;\n")).content;
        expect(output).toContain("if ((this.safeBool(a, \"k\") == true))");
        expect(output).not.toContain("isTrue");
    });
    test('a parameter the build layer retyped `bool?` goes native too', () => {
        const printer: any = (transpiler as any).csharpTranspiler;
        const previous = printer.csharpDeclaredLocalTypeResolver;
        const input =
        "class T {\n" +
        "    f(hedged: any) {\n" +
        "        if (hedged) { return 1; }\n" +
        "        const s = hedged ? 'a' : 'b';\n" +
        "        return s;\n" +
        "    }\n" +
        "}";
        try {
            // no declaration-level proof: the parameter stays a boxed read
            expect(transpiler.transpileCSharp(input).content).toContain("if (isTrue(hedged))");
            // the hook the typed-parameter units register names the PRINTED `bool?`
            printer.csharpDeclaredLocalTypeResolver = (declaration: any) => ((declaration?.name?.text === 'hedged') ? 'bool?' : undefined);
            const output = transpiler.transpileCSharp(input).content;
            expect(output).toContain("if ((hedged == true))");
            expect(output).toContain("(hedged == true) ? \"a\" : \"b\"");
            expect(output).not.toContain("isTrue");
        } finally {
            printer.csharpDeclaredLocalTypeResolver = previous;
        }
    });
    test('a call on a non-this receiver keeps the wrapper', () => {
        const output = transpiler.transpileCSharp(callProgram("        if (m.couldBe(a)) { return 1; }\n        return 2;\n")).content;
        expect(output).toContain("isTrue(m.couldBe(a))");
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
        "}\n");
        expect(output).toContain("isEqual(x, null)");
    });
    test('a local the embedding build layer declares a string compares natively to a literal', () => {
        // the embedding build layer prints some locals
        // with a concrete C# type of its own; its answer comes back through
        // csharpExpressionTypeResolver, so a read of such a local IS that declared type
        const withDeclaredTypes = (types, input) => {
            transpiler.csharpTranspiler.csharpExpressionTypeResolver = (node) => types[node?.text];
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
            transpiler.csharpTranspiler.csharpExpressionTypeResolver = (node) => types[node?.text];
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
            transpiler.csharpTranspiler.csharpExpressionTypeResolver = (node) => types[node?.text];
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
        expect(output).toContain("(x == y)"); // two declared string? locals compare natively
    });
    test('a parameter keeps isEqual: it prints `object` and the resolver declines it', () => {
        const withDeclaredTypes = (types, input) => {
            transpiler.csharpTranspiler.csharpExpressionTypeResolver = (node) => types[node?.text];
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

// A parameter whose TS declaration admits undefined prints as a reference box (`object` /
// `string`) or a nullable value type (`Int64?` / `double?`), never as a non-nullable scalar:
// the ccxt narrowing tables narrow a required number position to `double` / `Int64` only
// (createOrder's `double amount`). So its null comparison is isEqual's null branch.
describe('csharp helper removal: isEqual(<param>, null) for an undefined-admitting parameter', () => {
    const outputOf = (input: string) => transpiler.transpileCSharp(input).content;
    test('a defaulted numeric parameter prints the native null comparison', () => {
        const output = outputOf(
        "class Exchange {\n" +
        "    async fetchTrades (symbol: string, since: number = undefined, limit: number = undefined): Promise<void> {\n" +
        "        if (limit !== undefined) { return; }\n" +
        "        if (since === undefined) { return; }\n" +
        "        return;\n" +
        "    }\n" +
        "}\n");
        expect(output).toContain("if ((limit != null))");
        expect(output).toContain("if ((since == null))");
        expect(output).not.toContain("isEqual(");
    });
    test('an optional (`?:`) parameter prints natively, a required union does not', () => {
        const output = outputOf(
        "class Exchange {\n" +
        "    parse (limit?: number, since: number | undefined): void {\n" +
        "        if (limit === undefined) { return; }\n" +
        "        if (since !== undefined) { return; }\n" +
        "        return;\n" +
        "    }\n" +
        "}\n");
        expect(output).toContain("if ((limit == null))");
        // `since` has no default, so the wrapper declares the non-nullable `double since`
        expect(output).toContain("isEqual(since, null)");
    });
    test('a required alias-typed parameter (`Num` is `number | undefined`) keeps isEqual', () => {
        const output = outputOf(
        "type Num = number | undefined;\n" +
        "class Exchange {\n" +
        "    async createOrder (symbol: string, amount: Num): Promise<void> {\n" +
        "        if (amount === undefined) { return; }\n" +
        "        return;\n" +
        "    }\n" +
        "}\n");
        expect(output).toContain("isEqual(amount, null)");
        expect(output).not.toContain("(amount == null)");
    });
    test('the null literal may sit on either side and undefined prints as null', () => {
        const output = outputOf(
        "class Exchange {\n" +
        "    parse (since: number = undefined): void {\n" +
        "        if (null === since) { return; }\n" +
        "        return;\n" +
        "    }\n" +
        "}\n");
        expect(output).toContain("if ((since == null))");
        expect(output).not.toContain("isEqual(");
    });
    test('a required numeric parameter keeps isEqual — its C# type is a non-nullable scalar', () => {
        const output = outputOf(
        "class Exchange {\n" +
        "    async createOrder (symbol: string, amount: number, price: number = undefined): Promise<void> {\n" +
        "        if (amount === undefined) { return; }\n" +
        "        return;\n" +
        "    }\n" +
        "}\n");
        expect(output).toContain("isEqual(amount, null)");
        expect(output).not.toContain("(amount == null)");
    });
    test('a numeric parameter with a non-undefined default keeps isEqual', () => {
        const output = outputOf(
        "class Exchange {\n" +
        "    parse (recvWindow: number = 5000): void {\n" +
        "        if (recvWindow === undefined) { return; }\n" +
        "        return;\n" +
        "    }\n" +
        "}\n");
        expect(output).toContain("isEqual(recvWindow, null)");
    });
    test('a required boolean parameter keeps isEqual', () => {
        const output = outputOf(
        "class Exchange {\n" +
        "    parse (flag: boolean): void {\n" +
        "        if (flag === undefined) { return; }\n" +
        "        return;\n" +
        "    }\n" +
        "}\n");
        expect(output).toContain("isEqual(flag, null)");
    });
    test('a destructured or rest parameter keeps isEqual', () => {
        const output = outputOf(
        "class Exchange {\n" +
        "    parse (...args: number[]): void {\n" +
        "        if (args === undefined) { return; }\n" +
        "        return;\n" +
        "    }\n" +
        "    parse2 ({ limit }: { limit: number }): void {\n" +
        "        if (limit === undefined) { return; }\n" +
        "        return;\n" +
        "    }\n" +
        "}\n");
        expect(output).toContain("isEqual(args, null)");
        expect(output).toContain("isEqual(limit, null)");
    });
    test('two undefined-admitting parameters compare by the helper, not by reference', () => {
        const output = outputOf(
        "class Exchange {\n" +
        "    parse (a: number = undefined, b: number = undefined): void {\n" +
        "        if (a === b) { return; }\n" +
        "        return;\n" +
        "    }\n" +
        "}\n");
        expect(output).toContain("isEqual(a, b)");
    });
    test('an optional string parameter compared to a literal still keeps isEqual', () => {
        const output = outputOf(
        "class Exchange {\n" +
        "    parse (type: string = undefined): void {\n" +
        "        if (type === 'market') { return; }\n" +
        "        return;\n" +
        "    }\n" +
        "}\n");
        expect(output).toContain("isEqual(type, \"market\")");
    });
    test('a local still keeps isEqual — only a parameter is proven', () => {
        const output = outputOf(
        "class Exchange {\n" +
        "    parse (): void {\n" +
        "        const limit = 5;\n" +
        "        if (limit === undefined) { return; }\n" +
        "        return;\n" +
        "    }\n" +
        "}\n");
        expect(output).toContain("isEqual(limit, null)");
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

describe('csharp equality of two reads the embedding build layer typed', () => {
    // the ccxt build layer retypes the `object` declarations it proves (string?, Int64?,
    // bool?, ...) and records each one through csharpExpressionTypeResolver; a pair of reads
    // it typed compares like the two boxes isEqual compares. These tests stub that resolver.
    const withReadKinds = (kinds, input) => {
        transpiler.csharpTranspiler.csharpExpressionTypeResolver = (node) => kinds[node?.text];
        try {
            return transpiler.transpileCSharp(input).content;
        } finally {
            transpiler.csharpTranspiler.csharpExpressionTypeResolver = undefined;
        }
    };
    const twoReads =
        "function f () {\n" +
        "    const alpha = this.safeValue({}, 'a');\n" +
        "    const beta = this.safeValue({}, 'b');\n" +
        "    const same = alpha === beta;\n" +
        "    const different = alpha !== beta;\n" +
        "    return [same, different];\n" +
        "}";
    test('two reads of one value kind print the native operator', () => {
        const output = withReadKinds({ alpha: 'string?', beta: 'string?' }, twoReads);
        expect(output).toContain("bool same = (alpha == beta);");
        expect(output).toContain("bool different = (alpha != beta);");
        expect(output).not.toContain("isEqual(alpha, beta)");
    });
    test('bool and Int64 reads use the same rule', () => {
        const bools = withReadKinds({ alpha: 'bool?', beta: 'bool' }, twoReads);
        expect(bools).toContain("bool same = (alpha == beta);");
        const numbers = withReadKinds({ alpha: 'Int64?', beta: 'Int64' }, twoReads);
        expect(numbers).toContain("bool same = (alpha == beta);");
    });
    test('reads the resolver does not name keep isEqual', () => {
        expect(withReadKinds({}, twoReads)).toContain("isEqual(alpha, beta)");
    });
    test('collection-typed and mixed-kind reads keep isEqual', () => {
        const collections = withReadKinds({ alpha: 'List<object>', beta: 'List<object>' }, twoReads);
        expect(collections).toContain("isEqual(alpha, beta)");
        expect(collections).not.toContain("(alpha == beta)");
        const mixed = withReadKinds({ alpha: 'string?', beta: 'Int64?' }, twoReads);
        expect(mixed).toContain("isEqual(alpha, beta)");
    });
    test('a literal against a declared string? read compares natively', () => {
        const input =
        "function f () {\n" +
        "    const alpha = this.safeValue({}, 'a');\n" +
        "    const isA = alpha === 'a';\n" +
        "    return isA;\n" +
        "}";
        const output = withReadKinds({ alpha: 'string?' }, input);
        expect(output).toContain("(alpha == \"a\")");
    });
});

describe('csharp equality on a declared scalar read: literals and the parameter registry', () => {
    // a read the printer's own tables can only call `object` still compares by value
    // when its emitted DECLARATION carries a scalar type -- the build layer's read oracle
    // (locals it retyped) or its declared-type registry (parameters its typing pass narrowed).
    const p = () => transpiler.csharpTranspiler;
    const withResolver = (resolver, input) => {
        p().csharpExpressionTypeResolver = resolver;
        try {
            return transpiler.transpileCSharp(input).content;
        } finally {
            p().csharpExpressionTypeResolver = undefined;
        }
    };
    const withRegistry = (resolver, input) => {
        p().csharpDeclaredLocalTypeResolver = resolver;
        try {
            return transpiler.transpileCSharp(input).content;
        } finally {
            p().csharpDeclaredLocalTypeResolver = undefined;
        }
    };
    const boolRead =
        "function f () {\n" +
        "    const v = this.safeValue({}, 'v');\n" +
        "    const yes = v === true;\n" +
        "    const no = v !== false;\n" +
        "    return [yes, no];\n" +
        "}";
    test('a bool? read against a bool literal prints the operator', () => {
        const output = withResolver((node) => (node?.text === 'v') ? 'bool?' : undefined, boolRead);
        expect(output).toContain("bool yes = (v == true);");
        expect(output).toContain("bool no = (v != false);");
        expect(output).not.toContain("isEqual(v, true)");
    });
    test('an Int64? read against an integer literal prints the operator', () => {
        const input =
        "function f () {\n" +
        "    const n = this.safeValue({}, 'n');\n" +
        "    const isOne = n === 1;\n" +
        "    return isOne;\n" +
        "}";
        const output = withResolver((node) => (node?.text === 'n') ? 'Int64?' : undefined, input);
        expect(output).toContain("bool isOne = (n == 1);");
        expect(output).not.toContain("isEqual(n, 1)");
    });
    test('a parameter the declared-type registry types compares to a literal and to a read', () => {
        const input =
        "class T {\n" +
        "    f(x: string, y: string): boolean {\n" +
        "        const isA = x === 'a';\n" +
        "        const same = x === y;\n" +
        "        return isA || same;\n" +
        "    }\n" +
        "}";
        const output = withRegistry((declaration) => (declaration?.name?.text === 'x' || declaration?.name?.text === 'y') ? 'string' : undefined, input);
        expect(output).toContain("bool isA = (x == \"a\");");
        expect(output).toContain("bool same = (x == y);");
        expect(output).not.toContain("isEqual(x");
    });
    test('a registry-typed Int64? parameter against a numeric literal prints the operator', () => {
        const input =
        "class T {\n" +
        "    f(x: number): boolean {\n" +
        "        return x === 3;\n" +
        "    }\n" +
        "}";
        const output = withRegistry((declaration) => (declaration?.name?.text === 'x') ? 'Int64?' : undefined, input);
        expect(output).toContain("(x == 3)");
        expect(output).not.toContain("isEqual(x, 3)");
    });
    test('a string read against a number stays on the helper in every spelling', () => {
        const literal =
        "function f () {\n" +
        "    const s = this.safeValue({}, 's');\n" +
        "    const isOne = s === 1;\n" +
        "    return isOne;\n" +
        "}";
        expect(withResolver((node) => (node?.text === 's') ? 'string?' : undefined, literal)).toContain("isEqual(s, 1)");
        const pair =
        "class T {\n" +
        "    f(x: string, n: number): boolean {\n" +
        "        return x === n;\n" +
        "    }\n" +
        "}";
        const kinds = { x: 'string', n: 'Int64?' };
        const output = withRegistry((declaration) => kinds[declaration?.name?.text], pair);
        expect(output).toContain("isEqual(x, n)");
    });
    test('a mixed numeric pair and a collection still keep the helper', () => {
        const mixed =
        "class T {\n" +
        "    f(a: number, b: number): boolean {\n" +
        "        return a === b;\n" +
        "    }\n" +
        "}";
        const kinds = { a: 'double?', b: 'Int64?' };
        expect(withRegistry((declaration) => kinds[declaration?.name?.text], mixed)).toContain("isEqual(a, b)");
        const collections =
        "class T {\n" +
        "    f(rows, other): boolean {\n" +
        "        return rows === other;\n" +
        "    }\n" +
        "}";
        const rowKinds = { rows: 'List<object>', other: 'List<object>' };
        expect(withRegistry((declaration) => rowKinds[declaration?.name?.text], collections)).toContain("isEqual(rows, other)");
    });
    test('a registered read against null keeps the null branch decision', () => {
        // a required numeric parameter keeps the registry's answer (the helper): the registry spelling
        // must not turn the null branch into a native comparison; an optional one is
        // null-comparable and keeps printing `== null`
        const required =
        "class T {\n" +
        "    f(x: number): boolean {\n" +
        "        return x === undefined;\n" +
        "    }\n" +
        "}";
        const requiredOutput = withRegistry((declaration) => (declaration?.name?.text === 'x') ? 'Int64?' : undefined, required);
        expect(requiredOutput).toContain("isEqual(x, null)");
        const optional =
        "class T {\n" +
        "    f(x?: number): boolean {\n" +
        "        return x === undefined;\n" +
        "    }\n" +
        "}";
        const optionalOutput = withRegistry((declaration) => (declaration?.name?.text === 'x') ? 'Int64?' : undefined, optional);
        expect(optionalOutput).toContain("(x == null)");
    });
});

// `isEqual (x, null)` -> `x == null` for an operand whose emitted declaration the
// embedding classifier names a typed reference / nullable scalar (csharpNullComparisonTypeOf).
// The helper's first two guards are the C# null test itself, so the native operator is the same
// comparison; a non-nullable value scalar does not compile with `== null` and every operand the
// hook cannot name keeps the helper.
describe('csharp null-literal comparisons instead of the isEqual wrapper', () => {
    const withNullTypes = (types, input) => {
        transpiler.csharpTranspiler.csharpNullComparisonTypeOf = (node) => types[node?.text];
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
        "    const x = this.notAListedField === undefined;\n" +
        "    return x;\n" +
        "}");
        expect(output).toContain("isEqual(this.notAListedField, null)");
    });
    test('the string-literal rule is unaffected by the null hook', () => {
        transpiler.csharpTranspiler.csharpLocalTypeOf = (node) => (node?.text === 's' ? 'string?' : undefined);
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
        transpiler.csharpTranspiler.csharpExpressionTypeResolver = (node) => kinds[node?.text];
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
        // `urls` is declared `IDictionary<string, object>` (Exchange.Options.cs): its own members, with the
        // helper's null-receiver branch as a null test
        expect(output).toContain('if ((this.urls != null && this.urls.ContainsKey("test")))');
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
    // `k in x` on a dictionary the build layer retypes after printing: the printer asks the
    // csharpDeclaredDictReceiverType hook; the emission keeps inOp's null-safe receiver read and,
    // for a possibly-null identifier key, the helper's own `key != null` guard.
    test('a `k in x` receiver no hook names keeps inOp byte-identically', () => {
        const input =
        "class Exchange {\n" +
        "    main(a: any) {\n" +
        "        const merged = a;\n" +
        "        if ('k' in merged) { return 1; }\n" +
        "        if (a in merged) { return 2; }\n" +
        "        return 0;\n" +
        "    }\n" +
        "}\n";
        const output = transpiler.transpileCSharp(input).content;
        expect(output).toContain('if (inOp(merged, "k"))');
        expect(output).toContain('if (inOp(merged, a))');
        expect(output).not.toContain('merged?.ContainsKey');
    });
    test('csharpDeclaredDictReceiverType naming the receiver a dictionary emits ContainsKey', () => {
        const csharp: any = (transpiler as any).csharpTranspiler;
        csharp.csharpDeclaredDictReceiverType = (node: any) => (node?.text === 'merged' ? 'Dictionary<string, object>' : undefined);
        try {
            const input =
            "class Exchange {\n" +
            "    main(a: any) {\n" +
            "        const merged = a;\n" +
            "        if ('k' in merged) { return 1; }\n" +
            "        return 0;\n" +
            "    }\n" +
            "}\n";
            const output = transpiler.transpileCSharp(input).content;
            expect(output).toContain('if ((merged?.ContainsKey("k") == true))');
            expect(output).not.toContain('inOp(merged');
        } finally {
            delete csharp.csharpDeclaredDictReceiverType;
        }
    });
    test('an identifier key gets the helper null guard back', () => {
        const csharp: any = (transpiler as any).csharpTranspiler;
        csharp.csharpDeclaredDictReceiverType = (node: any) => (node?.text === 'merged' ? 'IDictionary<string, object>' : undefined);
        csharp.csharpLocalTypeOf = (node: any) => (node?.text === 'code' ? 'string?' : undefined);
        try {
            const input =
            "class Exchange {\n" +
            "    main(a: any, code: any) {\n" +
            "        const merged = a;\n" +
            "        if (code in merged) { return 1; }\n" +
            "        return 0;\n" +
            "    }\n" +
            "}\n";
            const output = transpiler.transpileCSharp(input).content;
            expect(output).toContain('if (((code != null) && (merged?.ContainsKey(code) == true)))');
            expect(output).not.toContain('inOp(merged');
        } finally {
            delete csharp.csharpDeclaredDictReceiverType;
            delete csharp.csharpLocalTypeOf;
        }
    });
    test('a non-dictionary hook answer, a foreign receiver and an unnameable key keep inOp', () => {
        const csharp: any = (transpiler as any).csharpTranspiler;
        csharp.csharpDeclaredDictReceiverType = (node: any) => (node?.text === 'merged' ? 'List<object>' : undefined);
        try {
            const input =
            "class Exchange {\n" +
            "    main(a: any, b: any) {\n" +
            "        const merged = a;\n" +
            "        if ('k' in merged) { return 1; }\n" +
            "        if ('k' in this.safeDict(a, 'x')) { return 2; }\n" +
            "        if (b in merged) { return 3; }\n" +
            "        return 0;\n" +
            "    }\n" +
            "}\n";
            const output = transpiler.transpileCSharp(input).content;
            // the hook answers a list for `merged`: not a ContainsKey receiver
            expect(output).toContain('if (inOp(merged, "k"))');
            expect(output).not.toContain('merged?.ContainsKey');
            // a call receiver is never one of the hook's locals, and `b` is no C# string key
            expect(output).toContain('if (inOp(merged, b))');
        } finally {
            delete csharp.csharpDeclaredDictReceiverType;
        }
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
            transpiler.csharpTranspiler.csharpExpressionTypeResolver = (node) => (node?.text === 'xs') ? type : undefined;
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
        expect(output).toContain("bool isLinearSwapConditional = isLinearType && ((market != null));");
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
        expect(output).toContain('usesPrivKey ? privateKey : secret');
        expect(output).not.toContain('isTrue');
    });
});

describe('csharp isEqual(getValue(x, "k"), lit) becomes a native comparison', () => {
    // the receiver's C# declaration comes from the embedding build layer (the resolver the
    // numeric-comparison installer sets), the element's type from the checker
    const withReceiverTypes = (types, input) => {
        transpiler.csharpTranspiler.csharpExpressionTypeResolver = (node) => types[node?.text];
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
        expect(output).toContain('bool isLinear = (((market.ContainsKey("linear") ? market["linear"] : null) as bool?) == true);');
        expect(output).toContain('bool notInverse = (((market.ContainsKey("inverse") ? market["inverse"] : null) as bool?) != false);');
        expect(output).not.toContain('isEqual((market.ContainsKey("linear") ? market["linear"] : null), true)');
        expect(output).not.toContain('isEqual(getValue(market, "inverse"), false)');
    });
    test('a string-proven dictionary element compared with a string literal', () => {
        const output = withReceiverTypes({ entry: 'Dictionary<string, object>' },
        "function f (entry: { [key: string]: string | undefined }) {\n" +
        "    const isPrimary = entry['default'] === 'primary';\n" +
        "    return isPrimary;\n" +
        "}");
        // the read goes native first (the resolver proves the receiver's box), then the
        // comparison drops isEqual
        expect(output).toContain('bool isPrimary = (((entry != null && ((IDictionary<string, object>)entry).ContainsKey("default") ? ((IDictionary<string, object>)entry)["default"] : null) as string) == "primary");');
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
        expect(output).toContain('bool enabled = (((this.has.ContainsKey("fetchTrades") ? this.has["fetchTrades"] : null) as bool?) != false);');
        expect(output).toContain('bool emulated = (((this.has.ContainsKey("fetchCurrencies") ? this.has["fetchCurrencies"] : null) as string) == "emulated");');
    });
    test('an untyped dictionary element keeps isEqual', () => {
        const output = withReceiverTypes({ market: 'Dictionary<string, object>' },
        "function f (market: { [key: string]: any }) {\n" +
        "    const isLinear = market['linear'] === true;\n" +
        "    return isLinear;\n" +
        "}");
        expect(output).toContain('isEqual((market.ContainsKey("linear") ? market["linear"] : null), true)');
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
        expect(output).toContain('isEqual((market.ContainsKey("linear") ? market["linear"] : null), "true")');
    });
    test('an identifier, a null and a numeric literal keep isEqual', () => {
        const output = withReceiverTypes({ market: 'Dictionary<string, object>' },
        "function f (market: { [key: string]: boolean | undefined }, flag) {\n" +
        "    const a = market['linear'] === flag;\n" +
        "    const b = market['linear'] === undefined;\n" +
        "    const c = market['linear'] === 1;\n" +
        "    return [a, b, c];\n" +
        "}");
        expect(output).toContain('isEqual((market.ContainsKey("linear") ? market["linear"] : null), flag)');
        expect(output).toContain('isEqual((market.ContainsKey("linear") ? market["linear"] : null), null)');
        expect(output).toContain('isEqual((market.ContainsKey("linear") ? market["linear"] : null), 1)');
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
        // branches, which the string cast cannot reproduce — the read itself goes native first
        expect(output).toContain('isEqual((code != null && ((IDictionary<string, object>)code).ContainsKey("value") ? ((IDictionary<string, object>)code)["value"] : null), "1")');
        expect(output).toContain('bool primary = (((code != null && ((IDictionary<string, object>)code).ContainsKey("value") ? ((IDictionary<string, object>)code)["value"] : null) as string) == "primary");');
    });
});

describe('csharp function parameters', () => {
    test('a string[] parameter of a top-level function prints IList<object> unless rebound', () => {
        const output = transpiler.transpileCSharp(
            "function f (exchange, symbols: string[]) {\n" +
            "    return symbols.length;\n" +
            "}\n" +
            "function g (exchange, symbols: string[]) {\n" +
            "    symbols = [];\n" +
            "    return symbols;\n" +
            "}\n").content;
        expect(output).toContain('f(object exchange, IList<object> symbols)');
        expect(output).toContain('g(object exchange, object symbols)');
    });
});

describe('csharp helper removal: a for-header counter prints the native ++ / --', () => {
    // the counter's printed `int` type comes back through csharpExpressionTypeResolver (the
    // embedding build layer retypes the declaration `int i = 0` itself); these tests stub
    // that resolver with a name map
    const withKinds = (kinds, input) => {
        transpiler.csharpTranspiler.csharpExpressionTypeResolver = (node) => kinds[node?.text];
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
    test('a header counter printed with a numeric declaration prints i++', () => {
        // stands in for the embedding layer's declaration retype (it wraps the same method)
        const printer: any = transpiler.csharpTranspiler;
        const own = printer.printVariableDeclarationList;
        printer.printVariableDeclarationList = function (node, identation) {
            return own.call(this, node, identation).replace(/^object i = /, 'Int64 i = ');
        };
        try {
            const output = transpiler.transpileCSharp(forLoop('i++', 'let i = markets.length - 1')).content;
            expect(output).toContain('for (Int64 i = subtract(');
            expect(output).toContain('; i++)');
        } finally {
            printer.printVariableDeclarationList = own;
        }
        expect(withKinds({}, forLoop('i++', 'let i = markets.length - 2'))).toContain('postFixIncrement(ref i)');
    });
    test('a counter the printer cannot name as int keeps the helper', () => {
        // a non-literal start is not a counter the printer proves Int64 itself
        const declaration = 'let i = markets.length';
        expect(withKinds({}, forLoop('i++', declaration))).toContain('postFixIncrement(ref i)');
        expect(withKinds({ i: 'object' }, forLoop('i++', declaration))).toContain('postFixIncrement(ref i)');
        expect(withKinds({ i: 'Int64' }, forLoop('i++', declaration))).toContain('postFixIncrement(ref i)');
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
        // the box at the read is whatever the assignment stored
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
        transpiler.csharpTranspiler.csharpExpressionTypeResolver = (node) => kinds[node?.text];
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
    test('a `string?` local without a non-null test answers -1 for null through ?.', () => {
        const input =
        "class Exchange {\n" +
        "    main(flags: string) {\n" +
        "        const hasPost = flags.indexOf ('post') > -1;\n" +
        "        return hasPost;\n" +
        "    }\n" +
        "}\n";
        const output = withKinds({ flags: 'string?' }, input);
        expect(output).toContain('(flags?.IndexOf("post", StringComparison.Ordinal) ?? -1) > -1');
        expect(output).not.toContain('getIndexOf(');
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
        expect(withKinds({ type: 'string?' }, written)).toContain('(type?.IndexOf("fee", StringComparison.Ordinal) ?? -1)');
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

describe('csharp Math.min/Math.max native emission', () => {
    // the printer names the C# kind of int-range literals and `.length` itself; the locals the
    // embedding build layer retypes come back through csharpExpressionTypeResolver — these
    // tests stub that resolver with a name map, like the numeric-comparison block above
    const withKinds = (kinds, input) => {
        transpiler.csharpTranspiler.csharpExpressionTypeResolver = (node) => kinds[node?.text];
        try {
            return transpiler.transpileCSharp(input).content;
        } finally {
            transpiler.csharpTranspiler.csharpExpressionTypeResolver = undefined;
        }
    };
    test('two operands of one integer kind print the native calls', () => {
        const input =
        "class Exchange {\n" +
        "    main(alpha: number, beta: number) {\n" +
        "        const smaller = Math.min (alpha, beta);\n" +
        "        const larger = Math.max (alpha, beta);\n" +
        "        return [ smaller, larger ];\n" +
        "    }\n" +
        "}";
        const output = withKinds({ alpha: 'Int64', beta: 'Int64' }, input);
        expect(output).toContain("object smaller = Math.Min(alpha, beta);");
        expect(output).toContain("object larger = Math.Max(alpha, beta);");
        expect(output).not.toContain("mathMin(");
        expect(output).not.toContain("mathMax(");
    });
    test('a literal and a printer-named .length print Math.Max on the same kind', () => {
        const input =
        "class Exchange {\n" +
        "    main(integerPart: string) {\n" +
        "        const significantDigits = Math.max (5, integerPart.length);\n" +
        "        return significantDigits;\n" +
        "    }\n" +
        "}";
        const output = transpiler.transpileCSharp(input).content;
        expect(output).toContain("Math.Max(5, ((string)integerPart).Length)");
        expect(output).not.toContain("mathMax(");
    });
    test('the result value still boxes into a dictionary value like the helper box', () => {
        const input =
        "class Exchange {\n" +
        "    main(alpha: number, beta: number) {\n" +
        "        const params = {};\n" +
        "        params['limit'] = Math.min (alpha, beta);\n" +
        "        return params;\n" +
        "    }\n" +
        "}";
        const output = withKinds({ alpha: 'int', beta: 'int' }, input);
        expect(output).toContain("Math.Min(alpha, beta)");
        expect(output).not.toContain("mathMin(");
    });
    test('two doubles keep the helper: Math.Min propagates a NaN operand', () => {
        const input =
        "class Exchange {\n" +
        "    main(gamma: number, delta: number) {\n" +
        "        return [ Math.min (gamma, delta), Math.max (gamma, delta) ];\n" +
        "    }\n" +
        "}";
        const output = withKinds({ gamma: 'double', delta: 'double' }, input);
        expect(output).toContain("mathMin(gamma, delta)");
        expect(output).toContain("mathMax(gamma, delta)");
    });
    test('mixed kinds keep the helper', () => {
        const input =
        "class Exchange {\n" +
        "    main(epsilon: number, zeta: number) {\n" +
        "        return Math.min (epsilon, zeta);\n" +
        "    }\n" +
        "}";
        const output = withKinds({ epsilon: 'int', zeta: 'Int64' }, input);
        expect(output).toContain("mathMin(epsilon, zeta)");
    });
    test('an operand the checker does not see as a plain number keeps the helper', () => {
        const input =
        "class Exchange {\n" +
        "    main(eta: any, theta: number) {\n" +
        "        return Math.min (eta, theta);\n" +
        "    }\n" +
        "}";
        // the resolver claims int for both, the checker sees `any` on the left
        expect(withKinds({ eta: 'int', theta: 'int' }, input)).toContain("mathMin(eta, theta)");
        const nullable =
        "class Exchange {\n" +
        "    main(iota: number | undefined, kappa: number) {\n" +
        "        return Math.min (iota, kappa);\n" +
        "    }\n" +
        "}";
        // the helper returns null when either side is null
        expect(withKinds({ iota: 'Int64', kappa: 'Int64' }, nullable)).toContain("mathMin(iota, kappa)");
    });
    test('a receiver position keeps the helper', () => {
        const input =
        "class Exchange {\n" +
        "    main(lambda: number, mu: number) {\n" +
        "        return Math.min (lambda, mu).toString ();\n" +
        "    }\n" +
        "}";
        const output = withKinds({ lambda: 'Int64', mu: 'Int64' }, input);
        expect(output).toContain("((object)mathMin(lambda, mu)).ToString()");
    });
    test('an `as` wrapper keeps the helper', () => {
        const input =
        "class Exchange {\n" +
        "    main(nu: number, xi: number) {\n" +
        "        return (Math.min (nu, xi) as any as string);\n" +
        "    }\n" +
        "}";
        const output = withKinds({ nu: 'Int64', xi: 'Int64' }, input);
        expect(output).toContain("mathMin(nu, xi)");
    });
});

describe('slice -> Substring / GetRange with the literal bounds clamped', () => {
    // `x.slice (a, b)` prints natively only when the checker proves x is a C# string (or the
    // printer declared it a `List<object>`) AND every bound is an integer literal. JS clamps a
    // negative / overflowing bound where C#'s Substring / GetRange throw, so the literals are
    // clamped with Math.Min / Math.Max and the receiver keeps the helper's null -> null guard.
    test('a string receiver with two literal bounds prints Substring', () => {
        const input =
        "class Exchange {\n" +
        "    convertExpireDate(date: string): string {\n" +
        "        const year = date.slice(0, 2);\n" +
        "        const month = date.slice(2, 4);\n" +
        "        return year + month;\n" +
        "    }\n" +
        "}\n";
        const output = transpiler.transpileCSharp(input).content;
        expect(output).toContain("((date == null) ? null : ((string)date).Substring(0, Math.Min(2, ((string)date).Length)))");
        expect(output).toContain("((date == null) ? null : ((string)date).Substring(Math.Min(2, ((string)date).Length), Math.Min(4, ((string)date).Length) - Math.Min(2, ((string)date).Length)))");
        expect(output).not.toContain("slice(date");
    });
    test('a `Str`-like union receiver is a proven string: `string | undefined`', () => {
        const input =
        "class Exchange {\n" +
        "    convertExpireDate(date: string | undefined): string {\n" +
        "        const year = date.slice(0, 2);\n" +
        "        return year;\n" +
        "    }\n" +
        "}\n";
        const output = transpiler.transpileCSharp(input).content;
        expect(output).toContain("((date == null) ? null : ((string)date).Substring(0, Math.Min(2, ((string)date).Length)))");
        expect(output).not.toContain("slice(date");
    });
    test('a negative start counts from the end: the one-argument Substring', () => {
        const input =
        "class Exchange {\n" +
        "    sign(privateKey: string) {\n" +
        "        const tail = privateKey.slice(-64);\n" +
        "        return tail;\n" +
        "    }\n" +
        "}\n";
        const output = transpiler.transpileCSharp(input).content;
        expect(output).toContain("((privateKey == null) ? null : ((string)privateKey).Substring(Math.Max(((string)privateKey).Length - 64, 0)))");
        expect(output).not.toContain("slice(privateKey");
    });
    test('a negative end counts from the end', () => {
        const input =
        "class Exchange {\n" +
        "    strip(encodedString: string) {\n" +
        "        return encodedString.slice(0, -1);\n" +
        "    }\n" +
        "}\n";
        const output = transpiler.transpileCSharp(input).content;
        expect(output).toContain("((encodedString == null) ? null : ((string)encodedString).Substring(0, Math.Max(((string)encodedString).Length - 1, 0)))");
    });
    test('two negative bounds keep their order after the clamp', () => {
        const input =
        "class Exchange {\n" +
        "    cut(id: string) {\n" +
        "        return id.slice(-9, -3);\n" +
        "    }\n" +
        "}\n";
        const output = transpiler.transpileCSharp(input).content;
        expect(output).toContain("Substring(Math.Max(((string)id).Length - 9, 0), Math.Max(((string)id).Length - 3, 0) - Math.Max(((string)id).Length - 9, 0))");
    });
    test('an inverted pair yields the JS empty slice: the count never goes below 0', () => {
        const input =
        "class Exchange {\n" +
        "    cut(id: string) {\n" +
        "        return id.slice(3, 1);\n" +
        "    }\n" +
        "}\n";
        const output = transpiler.transpileCSharp(input).content;
        expect(output).toContain("Substring(Math.Min(3, ((string)id).Length), Math.Max(Math.Min(1, ((string)id).Length) - Math.Min(3, ((string)id).Length), 0))");
    });
    test('a `(x as string)` receiver reuses its own cast and null test', () => {
        const input =
        "class Exchange {\n" +
        "    parse(id: any) {\n" +
        "        const baseId = (id as string).slice(0, 3);\n" +
        "        return baseId;\n" +
        "    }\n" +
        "}\n";
        const output = transpiler.transpileCSharp(input).content;
        expect(output).toContain("((((string)id) == null) ? null : ((string)id).Substring(0, Math.Min(3, ((string)id).Length)))");
        expect(output).not.toContain("((((string)id))");
    });
    test('a declared List<object> receiver prints GetRange', () => {
        const input =
        "class Exchange {\n" +
        "    main(market) {\n" +
        "        const parts = market.split('/');\n" +
        "        return parts.slice(0, 2);\n" +
        "    }\n" +
        "}\n";
        const output = transpiler.transpileCSharp(input).content;
        expect(output).toContain("List<object> parts = ");
        expect(output).toContain("((parts == null) ? null : ((List<object>)parts).GetRange(0, Math.Min(2, ((List<object>)parts).Count)))");
        expect(output).not.toContain("slice(parts");
    });
    test('a string local and a this-field receiver are side-effect-free receivers', () => {
        const input =
        "class Exchange {\n" +
        "    secret = 'abc';\n" +
        "    main(source: string) {\n" +
        "        const s: string = source;\n" +
        "        const head = s.slice(1, 3);\n" +
        "        return head + this.secret.slice(0, 2);\n" +
        "    }\n" +
        "}\n";
        const output = transpiler.transpileCSharp(input).content;
        expect(output).toContain("((s == null) ? null : ((string)s).Substring(Math.Min(1, ((string)s).Length), Math.Min(3, ((string)s).Length) - Math.Min(1, ((string)s).Length)))");
        expect(output).toContain("((this.secret == null) ? null : ((string)this.secret).Substring(0, Math.Min(2, ((string)this.secret).Length)))");
    });
    test('an `any` receiver, an expression bound, a call receiver and a mixed union keep the helper', () => {
        const input =
        "class Exchange {\n" +
        "    main(item, x: string, i: number, both: string | number, types, args) {\n" +
        "        const one = item.slice(0, 2);\n" +
        "        const two = x.slice(0, i);\n" +
        "        const three = both.slice(0, 2);\n" +
        "        const four = abiEncode(types, args).slice(2);\n" +
        "        return [one, two, three, four];\n" +
        "    }\n" +
        "}\n";
        const output = transpiler.transpileCSharp(input).content;
        expect(output).toContain("slice(item, 0, 2)");
        expect(output).toContain("slice(x, 0, i)");
        expect(output).toContain("slice(both, 0, 2)");
        expect(output).toContain("slice(abiEncode(types, args), 2, null)");
    });
    test('a bound written as int arithmetic over a length / int local prints native', () => {
        const input =
        "class Exchange {\n" +
        "    main(baseUrl: string) {\n" +
        "        const n = baseUrl.length;\n" +
        "        const a = baseUrl.slice(0, n - 1);\n" +
        "        const b = baseUrl.slice(0, baseUrl.length - 3);\n" +
        "        return [a, b];\n" +
        "    }\n" +
        "}\n";
        const output = transpiler.transpileCSharp(input).content;
        expect(output).not.toContain("slice(baseUrl");
        expect(output).toContain("((baseUrl == null) ? null : ((string)baseUrl).Substring(0, Math.Max(Math.Min(((n - 1) < 0 ? ((string)baseUrl).Length + ((n - 1)) : (n - 1)), ((string)baseUrl).Length), 0)))");
        expect(output).toContain("(((string)baseUrl).Length - 3)");
        expect(output).not.toContain("subtract(");
    });
    test('an arithmetic bound over a call, a double or an any operand keeps the helper', () => {
        const input =
        "class Exchange {\n" +
        "    main(x: string, y, d: number) {\n" +
        "        const a = x.slice(0, this.f() - 1);\n" +
        "        const b = x.slice(0, y - 1);\n" +
        "        return [a, b];\n" +
        "    }\n" +
        "}\n";
        const output = transpiler.transpileCSharp(input).content;
        expect(output).toContain("slice(x, 0,");
        expect(output).not.toContain("Substring");
    });
    test('a fractional or out-of-range literal bound keeps the helper', () => {
        const input =
        "class Exchange {\n" +
        "    main(x: string) {\n" +
        "        const a = x.slice(0, 2.5);\n" +
        "        const b = x.slice(0, 1e30);\n" +
        "        return [a, b];\n" +
        "    }\n" +
        "}\n";
        const output = transpiler.transpileCSharp(input).content;
        expect(output).toContain("slice(x, 0, 2.5)");
        expect(output).toContain("slice(x, 0, 1e+30)");
    });
});

describe('slice bounds that are proven integers (and the explicit null end)', () => {
    // a non-literal bound keeps the helper unless the printer can name its C# integer kind: the
    // clamp repeats the read, so only a side-effect-free `int` / `Int64` operand qualifies, and
    // `slice(x, a, null)` is the helper's "to the end" (the printer spells undefined as null).
    // Two non-literal bounds would repeat both reads as four clamped operands, so they stay.
    const withKinds = (kinds, input) => {
        transpiler.csharpTranspiler.csharpExpressionTypeResolver = (node) => kinds[node?.text];
        try {
            return transpiler.transpileCSharp(input).content;
        } finally {
            transpiler.csharpTranspiler.csharpExpressionTypeResolver = undefined;
        }
    };
    const clampInt = (name, length) => `Math.Max(Math.Min((${name} < 0 ? ${length} + (${name}) : ${name}), ${length}), 0)`;
    test('a from-zero slice with an int end prints the clamped Substring range', () => {
        const input =
        "class Exchange {\n" +
        "    cut(id: string, quoteLength: number) {\n" +
        "        return id.slice(0, quoteLength);\n" +
        "    }\n" +
        "}\n";
        const output = withKinds({ quoteLength: 'int' }, input);
        const length = "((string)id).Length";
        expect(output).toContain(`Substring(0, ${clampInt('quoteLength', length)})`);
        expect(output).not.toContain("slice(id");
    });
    test('an explicit null end is the open-ended Substring', () => {
        const input =
        "class Exchange {\n" +
        "    cut(id: string, start: number) {\n" +
        "        return id.slice(start, null);\n" +
        "    }\n" +
        "}\n";
        const output = withKinds({ start: 'int' }, input);
        expect(output).toContain(`Substring(${clampInt('start', "((string)id).Length")})`);
        expect(output).not.toContain("slice(id");
    });
    test('an Int64? bound is clamped in Int64, reads 0 when null and narrows after the clamp', () => {
        const input =
        "class Exchange {\n" +
        "    cut(id: string, start: number) {\n" +
        "        return id.slice(start, null);\n" +
        "    }\n" +
        "}\n";
        const output = withKinds({ start: 'Int64?' }, input);
        expect(output).toContain("((int)Math.Max(Math.Min(((start ?? 0L) < 0 ? ((Int64)((string)id).Length) + ((start ?? 0L)) : (start ?? 0L)), ((Int64)((string)id).Length)), 0L))");
        expect(output).not.toContain("slice(id");
    });
    test('two non-literal bounds keep the helper (four clamped operands)', () => {
        const input =
        "class Exchange {\n" +
        "    cut(id: string, start: number, end: number) {\n" +
        "        return id.slice(start, end);\n" +
        "    }\n" +
        "}\n";
        const output = withKinds({ start: 'int', end: 'int' }, input);
        expect(output).toContain("slice(id, start, end)");
    });
    test('a double bound, a call bound and an unproven receiver keep the helper', () => {
        const input =
        "class Exchange {\n" +
        "    cut(id: string, start: number, item) {\n" +
        "        const one = id.slice(0, start);\n" +
        "        const two = id.slice(0, this.getStart());\n" +
        "        const three = item.slice(0, start);\n" +
        "        return [one, two, three];\n" +
        "    }\n" +
        "    getStart() {\n" +
        "        return 0;\n" +
        "    }\n" +
        "}\n";
        const output = withKinds({ start: 'double' }, input);
        expect(output).toContain("slice(id, 0, start)");
        expect(output).toContain("slice(id, 0, this.getStart())");
        expect(output).toContain("slice(item, 0, start)");
    });
});

describe('csharp helper removal: parseInt / parseFloat / mod / prefix `-x`', () => {
    // the printer names the C# kind of int-range literals, `.length` and a few call results
    // itself; the locals the embedding build layer retypes come back through
    // csharpExpressionTypeResolver — these tests stub that resolver with a name map
    // (same pattern as the numeric-comparison block above)
    const withKinds = (kinds, input) => {
        transpiler.csharpTranspiler.csharpExpressionTypeResolver = (node) => kinds[node?.text];
        try {
            return transpiler.transpileCSharp(input).content;
        } finally {
            transpiler.csharpTranspiler.csharpExpressionTypeResolver = undefined;
        }
    };
    test('parseInt of an integer string literal folds to the Int64 box it returns', () => {
        const input =
        "const a = parseInt('8');\n" +
        "const b = parseInt('12');";
        const output = transpiler.transpileCSharp(input).content;
        expect(output).toContain('object a = 8L;');
        expect(output).toContain('object b = 12L;');
        expect(output).not.toContain('parseInt(');
    });
    test('parseInt floors a numeric literal into the same Int64 box', () => {
        const input =
        "const a = parseInt(2.7);\n" +
        "const b = parseInt(-3.7);";
        const output = transpiler.transpileCSharp(input).content;
        expect(output).toContain('object a = 2L;');
        expect(output).toContain('object b = (-4L);');
    });
    test('parseFloat of a literal folds to the double box it returns', () => {
        const input =
        "const a = parseFloat(1);\n" +
        "const b = parseFloat('1.5');";
        const output = transpiler.transpileCSharp(input).content;
        expect(output).toContain('object a = 1.0;');
        expect(output).toContain('object b = 1.5;');
        expect(output).not.toContain('parseFloat(');
    });
    test('a literal the helper does not read as that number keeps the helper', () => {
        const input =
        "const a = parseInt('1.5');\n" + // a point reads with the CURRENT culture
        "const b = parseInt('99999999999999999999');\n" + // round - overflow answers null
        "const c = parseFloat('abc');\n" +
        "const d = parseFloat('1e3');\n" + // not the plain decimal spelling
        "const e = parseInt('');";
        const output = transpiler.transpileCSharp(input).content;
        expect(output).toContain('object a = parseInt("1.5");');
        expect(output).toContain('object b = parseInt("99999999999999999999");');
        expect(output).toContain('object c = parseFloat("abc");');
        expect(output).toContain('object d = parseFloat("1e3");');
        expect(output).toContain('object e = parseInt("");');
    });
    test('parseInt / parseFloat of a declared numeric local convert in place', () => {
        const input =
        "class Exchange {\n" +
        "    main(items: any[], ms: number) {\n" +
        "        const len = items.length;\n" +
        "        const p = parseInt(len);\n" +
        "        const f = parseFloat(ms);\n" +
        "        return [p, f];\n" +
        "    }\n" +
        "}\n";
        const output = withKinds({ len: 'int', ms: 'Int64' }, input);
        expect(output).toContain('int len = (items?.Count ?? 0);');
        expect(output).toContain('object p = ((Int64)len);');
        expect(output).toContain('object f = ((double)ms);');
        expect(output).not.toContain('parseInt(');
        expect(output).not.toContain('parseFloat(');
    });
    test('a declared double passes through parseFloat unchanged', () => {
        const input =
        "class Exchange {\n" +
        "    main(fl: number) {\n" +
        "        const p = parseFloat(fl);\n" +
        "        return p;\n" +
        "    }\n" +
        "}\n";
        const output = withKinds({ fl: 'double' }, input);
        expect(output).toContain('object p = fl;');
        expect(output).not.toContain('parseFloat(');
    });
    test('an object / nullable / double operand keeps the parse helper', () => {
        const input =
        "class Exchange {\n" +
        "    main(box: any, n64: number, d: number) {\n" +
        "        const a = parseFloat(box);\n" +
        "        const b = parseInt(box);\n" +
        "        const c = parseFloat(n64);\n" +
        "        const e = parseInt(d);\n" +
        "        return [a, b, c, e];\n" +
        "    }\n" +
        "}\n";
        const output = withKinds({ box: 'object', n64: 'Int64?', d: 'double' }, input);
        expect(output).toContain('object a = parseFloat(box);');
        expect(output).toContain('object b = parseInt(box);');
        expect(output).toContain('object c = parseFloat(n64);'); // a null box converts to 0
        expect(output).toContain('object e = parseInt(d);'); // NaN / overflow answer null
    });
    test('a declared function named parseInt is not the runtime helper', () => {
        const input =
        "function parseInt(s) {\n" +
        "    return 2;\n" +
        "}\n" +
        "const a = parseInt('8');";
        const output = transpiler.transpileCSharp(input).content;
        expect(output).toContain('parseInt("8")');
    });
    test('mod of an int dividend and a nonzero literal divisor prints the native remainder', () => {
        const input =
        "class Exchange {\n" +
        "    main(items: any[]) {\n" +
        "        for (let i = 0; i < items.length; i++) {\n" +
        "            const r = i % 2;\n" +
        "        }\n" +
        "        return 1;\n" +
        "    }\n" +
        "}\n";
        const output = withKinds({ i: 'int' }, input);
        expect(output).toContain('object r = ((Int64)i % 2L);');
        expect(output).not.toContain('mod(');
    });
    test('an unprovable dividend or divisor keeps mod', () => {
        const input =
        "class Exchange {\n" +
        "    main(a: number, b: number, box: any, big: number, dbl: number) {\n" +
        "        const w = a % b;\n" + // a local divisor can be 0
        "        const x = box % 2;\n" + // object dividend
        "        const y = big % 2;\n" + // Int64 rounds through double above 2^53
        "        const z = a % 0;\n" + // a zero divisor changes the thrown exception
        "        const u = dbl % 2;\n" + // double remainder converts back with rounding
        "        return [w, x, y, z, u];\n" +
        "    }\n" +
        "}\n";
        const output = withKinds({ a: 'int', b: 'int', box: 'object', big: 'Int64', dbl: 'double' }, input);
        expect(output).toContain('object w = mod(a, b);');
        expect(output).toContain('object x = mod(box, 2);');
        expect(output).toContain('object y = mod(big, 2);');
        expect(output).toContain('object z = mod(a, 0);');
        expect(output).toContain('object u = mod(dbl, 2);');
    });
    test('prefix `-` on a declared numeric local negates it in place', () => {
        const input =
        "class Exchange {\n" +
        "    main(a: number) {\n" +
        "        const b = -a;\n" +
        "        return b;\n" +
        "    }\n" +
        "}\n";
        const output = withKinds({ a: 'Int64' }, input);
        // the typed prefixUnaryNeg overload is `a = -a; return a;`
        expect(output).toContain('object b = (a = -a);');
        expect(output).not.toContain('prefixUnaryNeg');
    });
    test('an object / nullable operand keeps prefixUnaryNeg', () => {
        const input =
        "class Exchange {\n" +
        "    main(box: any, n64: number) {\n" +
        "        const a = -box;\n" +
        "        const b = -n64;\n" +
        "        return [a, b];\n" +
        "    }\n" +
        "}\n";
        const output = withKinds({ box: 'object', n64: 'Int64?' }, input);
        expect(output).toContain('object a = prefixUnaryNeg(ref box);');
        expect(output).toContain('object b = prefixUnaryNeg(ref n64);');
    });
    test('a literal operand prints the plain unary minus', () => {
        const output = transpiler.transpileCSharp("const a = -1;").content;
        expect(output).toContain('object a = -1;');
    });
});

describe('csharp loop-index element reads', () => {
    // the printed C# type of both the receiver and the counter is what decides whether the List
    // indexer binds; a local the printer leaves `object` (or that the embedding build layer
    // retypes) comes back through csharpExpressionTypeResolver — these tests stub that resolver
    // with a name map, exactly like the numeric-comparison block above
    const withKinds = (kinds, input) => {
        transpiler.csharpTranspiler.csharpExpressionTypeResolver = (node) => kinds[node?.text];
        try {
            return transpiler.transpileCSharp(input).content;
        } finally {
            transpiler.csharpTranspiler.csharpExpressionTypeResolver = undefined;
        }
    };
    const loop = (body: string, bound = 'list.length') =>
        "class Exchange {\n" +
        "    main(d: { [key: string]: any }) {\n" +
        "        const list = Object.keys(d);\n" +
        "        for (let i = 0; i < " + bound + "; i++) {\n" +
        "            " + body + "\n" +
        "        }\n" +
        "    }\n" +
        "}";
    test('a list receiver and an int counter print the indexer', () => {
        const output = withKinds({ list: 'List<object>', i: 'int' }, loop("const symbol = list[i];"));
        expect(output).toContain('object symbol = list[i];');
        expect(output).not.toContain('getValue(list, i)');
    });
    test('a read inside an object literal prints the indexer too', () => {
        const output = withKinds({ list: 'List<object>', i: 'int' }, loop("const row = { \"id\": list[i] };"));
        expect(output).toContain('{ "id", list[i] }');
        expect(output).not.toContain('getValue(list, i)');
    });
    test('a counter the build layer cannot retype keeps the helper', () => {
        // `object i` does not bind the List indexer (the ccxt layer refuses the retype whenever
        // the counter has a use it cannot vet)
        const output = withKinds({ list: 'List<object>', i: 'object' }, loop("const symbol = list[i];"));
        expect(output).toContain('object symbol = getValue(list, i);');
    });
    test('an object receiver keeps the helper', () => {
        const output = withKinds({ list: 'object', i: 'int' }, loop("const symbol = list[i];"));
        expect(output).toContain('object symbol = getValue(list, i);');
    });
    test('no resolver keeps the helper: the printer alone never names the counter', () => {
        const output = transpiler.transpileCSharp(loop("const symbol = list[i];")).content;
        expect(output).toContain('object symbol = getValue(list, i);');
    });
    test('a bound that is not this receiver\'s length keeps the helper', () => {
        const output = withKinds({ list: 'List<object>', i: 'int' }, loop("const symbol = list[i];", '10'));
        expect(output).toContain('object symbol = getValue(list, i);');
    });
    test('a mutated receiver keeps the helper', () => {
        const output = withKinds({ list: 'List<object>', i: 'int' }, loop("const symbol = list[i]; list.pop();"));
        expect(output).toContain('object symbol = getValue(list, i);');
    });
    test('a counter written inside the body keeps the helper', () => {
        const output = withKinds({ list: 'List<object>', i: 'int' }, loop("i = i + 1; const symbol = list[i];"));
        expect(output).toContain('object symbol = getValue(list, i);');
    });
    test('a read inside a closure keeps the helper', () => {
        const output = withKinds({ list: 'List<object>', i: 'int' }, loop("this.foo (() => list[i]);"));
        expect(output).toContain('() => getValue(list, i)');
    });
    test('a decrementing header keeps the helper', () => {
        const input =
        "class Exchange { main(d: { [key: string]: any }) { const list = Object.keys(d);" +
        " for (let i = 1; i < list.length; i--) { const symbol = list[i]; } } }";
        const output = withKinds({ list: 'List<object>', i: 'int' }, input);
        expect(output).toContain('getValue(list, i)');
    });
});

// the embedding build layer prints the declaration of some
// locals itself and reports that same type through csharpExpressionTypeResolver; a `bool` there
// is the declaration the emitted code carries, so the condition can use the read bare
describe('isTrue drops for a declared bool the printer did not type itself', () => {
    // Identifier nodes only, the way installCsharpNumericComparisons installs the resolver
    const withKind = (kind, input) => {
        transpiler.csharpTranspiler.csharpExpressionTypeResolver = (node) => (node?.kind === SyntaxKind.Identifier) ? kind : undefined;
        try {
            return transpiler.transpileCSharp(input).content;
        } finally {
            transpiler.csharpTranspiler.csharpExpressionTypeResolver = undefined;
        }
    };
    const input = `
class T {
    f(leverage: number, helper: { isRoundNumber: (x: number) => boolean }) {
        const rational = helper.isRoundNumber(leverage);
        if (!rational) { return 1; }
        const band = rational ? 'a' : 'b';
        return band;
    }
}`;
    test('a resolver-declared bool local prints bare under ! and in a ternary condition', () => {
        const output = withKind('bool', input);
        expect(output).toContain('if (!rational)');
        expect(output).toContain('rational ? "a" : "b"');
        expect(output).not.toContain('isTrue');
    });
    test('without that declaration the local keeps the wrapper', () => {
        const output = transpiler.transpileCSharp(input).content;
        expect(output).toContain('if (!isTrue(rational))');
        expect(output).toContain('isTrue(rational) ? "a" : "b"');
    });
    test('a nullable or non-bool declaration keeps the wrapper', () => {
        // `bool?` is no condition in C#: it lifts to `== true` (what isTrue answers for a null box)
        expect(withKind('bool?', input)).toContain('if (!(rational == true))');
        expect(withKind('object', input)).toContain('if (!isTrue(rational))');
    });
});

// hand-written BaseExchange fields declared `bool` (cs/ccxt/base/Exchange.Options.cs, see
// CSHARP_NATIVE_BOOL_FIELDS): the read is a C# bool, so the wrapper around it goes
describe('isTrue drops for hand-written bool fields', () => {
    const input = `
class Exchange {
    newUpdates: boolean = true;
    verbose: boolean = true;
    f() {
        if (this.newUpdates) { return 1; }
        if (!this.verbose) { return 2; }
        const label = this.newUpdates ? 'a' : 'b';
        return label;
    }
}`;
    test('a checker-typed plain boolean field read prints bare', () => {
        const output = transpiler.transpileCSharp(input).content;
        expect(output).toContain('if (this.newUpdates)');
        expect(output).toContain('if (!this.verbose)');
        expect(output).toContain('this.newUpdates ? "a" : "b"');
        expect(output).not.toContain('isTrue');
    });
    test('a nullable or unlisted member keeps the wrapper', () => {
        const output = transpiler.transpileCSharp(`
class Exchange {
    maybe: boolean | undefined = undefined;
    f() {
        if (this.maybe) { return 1; }
    }
}`).content;
        expect(output).toContain('if (isTrue(this.maybe))');
    });
});

// `x instanceof T` prints the C# type test `<x> is <T>`, a bool of its own: the wrapper goes,
// with parentheses where `!` / the ternary's `(bool)` cast would otherwise rebind the text
describe('instanceof conditions print bare', () => {
    test('if, ! and a ternary condition', () => {
        const output = transpiler.transpileCSharp(`
class CustomError {}
class Exchange {
    f(e: any, x: any) {
        if (e instanceof CustomError) { return 1; }
        if (!(x instanceof CustomError)) { return 2; }
        const fix = e instanceof CustomError ? 'a' : 'b';
        return fix;
    }
}`).content;
        expect(output).toContain('if (e is CustomError)');
        expect(output).toContain('if (!(x is CustomError))');
        expect(output).toContain('(e is CustomError) ? "a" : "b"');
        expect(output).not.toContain('isTrue');
    });
    test('a negated test without source parentheses adds its own', () => {
        const output = transpiler.transpileCSharp(`
class CustomError {}
class Exchange {
    f(e: any) {
        if (!(e instanceof CustomError)) { return 1; }
    }
}`).content;
        expect(output).toContain('if (!(e is CustomError))');
    });
});

describe('csharp helper removal: reads of the hand-written has/options/urls dictionaries', () => {
    test('a literal-key read of has/options tests the key and keeps the null a missing key reads', () => {
        const input =
        "class Exchange {\n" +
        "    has: Dictionary<boolean> = {};\n" +
        "    options: Dict = {};\n" +
        "    main() {\n" +
        "        if (this.has['fetchTrades'] !== undefined) { return 1; }\n" +
        "        return this.options['timeDifference'];\n" +
        "    }\n" +
        "}";
        const output = transpiler.transpileCSharp(input).content;
        // both fields are declared concrete dictionaries in Exchange.Options.cs, so their own
        // members print what the helper computes: the indexer only runs when the key is there
        expect(output).toContain('(this.has.ContainsKey("fetchTrades") ? this.has["fetchTrades"] : null)');
        expect(output).toContain('(this.options.ContainsKey("timeDifference") ? this.options["timeDifference"] : null)');
        expect(output).not.toContain('getValue(this.has,');
        expect(output).not.toContain('getValue(this.options,');
    });
    test('a literal-key read of the object-typed urls field carries the helper\'s dictionary cast', () => {
        const input =
        "class Exchange {\n" +
        "    urls: { [key: string]: any } = {};\n" +
        "    main() {\n" +
        "        return this.urls['demo'];\n" +
        "    }\n" +
        "}";
        const output = transpiler.transpileCSharp(input).content;
        // `urls` is declared `IDictionary<string, object>`: no cast, the helper's null-receiver test stays
        expect(output).toContain('(this.urls != null && this.urls.ContainsKey("demo") ? this.urls["demo"] : null)');
        expect(output).not.toContain('getValue(this.urls,');
    });
    test('a non-literal key and a numeric key keep the helper on these fields', () => {
        const input =
        "class Exchange {\n" +
        "    has: Dictionary<boolean> = {};\n" +
        "    options: Dict = {};\n" +
        "    main(key) {\n" +
        "        const a = this.has[key];\n" +
        "        const b = this.options[3];\n" +
        "        return [a, b];\n" +
        "    }\n" +
        "}";
        const output = transpiler.transpileCSharp(input).content;
        // only a literal key can be proven a C# string / is comparable to ContainsKey
        expect(output).toContain('getValue(this.has, key)');
        expect(output).toContain('getValue(this.options, 3)');
    });
    test('other hand-written fields of the same class keep the helper', () => {
        const input =
        "class Exchange {\n" +
        "    ohlcvs: { [key: string]: any } = {};\n" +
        "    main() {\n" +
        "        return this.ohlcvs['BTC/USDT'];\n" +
        "    }\n" +
        "}\n";
        const output = transpiler.transpileCSharp(input).content;
        // `ohlcvs`/`tickers`/... are other units: the missing-key rule names its own table only
        expect(output).toContain('getValue(this.ohlcvs, "BTC/USDT")');
    });
    test('a guard-proven read of urls still prints the bare indexer', () => {
        const input =
        "class Exchange {\n" +
        "    urls: { [key: string]: any } = {};\n" +
        "    main() {\n" +
        "        if ('apiBackup' in this.urls) { return this.urls['apiBackup']; }\n" +
        "        return 0;\n" +
        "    }\n" +
        "}";
        const output = transpiler.transpileCSharp(input).content;
        // the guard proves the key is there: no key test is needed, the read stays as it was
        expect(output).toContain('return this.urls["apiBackup"];');
        expect(output).not.toContain('ContainsKey("apiBackup") ?');
    });
    test('a nested read of urls[\'api\'] with a parameter key reads the urlsApi view, casting the key like GetValue', () => {
        const input =
        "class Exchange {\n" +
        "    urls: { [key: string]: any } = {};\n" +
        "    main(endpoint) {\n" +
        "        return this.urls['api'][endpoint];\n" +
        "    }\n" +
        "}";
        const output = transpiler.transpileCSharp(input).content;
        // urls['api'] is the Dict view the hand-written base declares (urlsApi); the key is an untyped
        // parameter, so it carries GetValue's own null test and (string) cast
        expect(output).toContain('(this.urlsApi != null && endpoint != null && this.urlsApi.ContainsKey((string)endpoint) ? this.urlsApi[(string)endpoint] : null)');
        expect(output).not.toContain('getValue(');
    });
});

describe('literal-key reads on declared collection locals go native', () => {
    test('a dictionary local reads its key natively, answering null where GetValue does', () => {
        const input =
        "class Exchange {\n" +
        "    extend(a, b) { return a; }\n" +
        "    main(market) {\n" +
        "        const result = this.extend({}, market);\n" +
        "        const spot = result['spot'];\n" +
        "        return spot;\n" +
        "    }\n" +
        "}\n";
        const output = transpiler.transpileCSharp(input).content;
        expect(output).toContain("Dictionary<string, object> result = this.extend(");
        expect(output).toContain('object spot = (result != null && result.ContainsKey("spot") ? result["spot"] : null);');
    });
    test('a list local reads its index natively with the helper` own bounds test', () => {
        const input =
        "class Exchange {\n" +
        "    safeList(a, b) { return a; }\n" +
        "    main(item) {\n" +
        "        const rows = this.safeList(item, 'rows');\n" +
        "        const first = rows[0];\n" +
        "        const second = rows[1];\n" +
        "        return [first, second];\n" +
        "    }\n" +
        "}\n";
        const output = transpiler.transpileCSharp(input).content;
        expect(output).toContain("List<object> rows = this.safeList(");
        expect(output).toContain('object first = (rows != null && 0 < rows.Count ? rows[0] : null);');
        expect(output).toContain('object second = (rows != null && 1 < rows.Count ? rows[1] : null);');
    });
    test('the element-write container chain reads natively too', () => {
        const input =
        "class Exchange {\n" +
        "    extend(a, b) { return a; }\n" +
        "    main(market) {\n" +
        "        const result = this.extend({}, market);\n" +
        "        result['a']['b'] = 1;\n" +
        "        return result;\n" +
        "    }\n" +
        "}\n";
        const output = transpiler.transpileCSharp(input).content;
        expect(output).toContain('((IDictionary<string,object>)(result != null && result.ContainsKey("a") ? result["a"] : null))["b"] = 1;');
    });
    test('readers without a declared collection type keep getValue', () => {
        const input =
        "class Exchange {\n" +
        "    extend(a, b) { return a; }\n" +
        "    safeList(a, b) { return a; }\n" +
        "    safeValue(a, b) { return a; }\n" +
        "    main(market, item) {\n" +
        "        const result = this.extend({}, market);\n" +
        "        const rows = this.safeList(item, 'rows');\n" +
        "        const untyped = this.safeValue(item, 'x');\n" +
        "        const a = untyped['k'];\n" +
        "        const b = result[0];\n" +
        "        const c = rows['a'];\n" +
        "        const d = rows[0];\n" +
        "        const e = rows[1.5];\n" +
        "        return [a, b, c, d, e];\n" +
        "    }\n" +
        "}\n";
        const output = transpiler.transpileCSharp(input).content;
        // an `object` local is not a declared collection
        expect(output).toContain('object a = getValue(untyped, "k");');
        // a dictionary index and a list key have no native twin
        expect(output).toContain('object b = getValue(result, 0);');
        expect(output).toContain('object c = getValue(rows, "a");');
        // a declared list does read natively
        expect(output).toContain('object d = (rows != null && 0 < rows.Count ? rows[0] : null);');
        // ...but not through a non-integer index
        expect(output).toContain('object e = getValue(rows, 1.5);');
    });
    test('a receiver reassigned in the function keeps getValue', () => {
        const input =
        "class Exchange {\n" +
        "    extend(a, b) { return a; }\n" +
        "    main(market, other) {\n" +
        "        let result = this.extend({}, market);\n" +
        "        result = other;\n" +
        "        const spot = result['spot'];\n" +
        "        return spot;\n" +
        "    }\n" +
        "}\n";
        const output = transpiler.transpileCSharp(input).content;
        expect(output).toContain('object spot = getValue(result, "spot");');
    });
    test('a declaration type recorded by the embedding layer feeds the same rule', () => {
        // the printed declaration stays `object`; the resolver names the type it was emitted with,
        // so the read only goes native while that proof is installed
        const input =
        "class Exchange {\n" +
        "    safeValue(a, b) { return a; }\n" +
        "    main(item) {\n" +
        "        const untyped = this.safeValue(item, 'x');\n" +
        "        const y = untyped['k'];\n" +
        "        return y;\n" +
        "    }\n" +
        "}\n";
        transpiler.csharpTranspiler.csharpDeclaredLocalTypeResolver = (declaration) => (declaration.name?.text === 'untyped') ? 'Dictionary<string, object>' : undefined;
        try {
            const output = transpiler.transpileCSharp(input).content;
            expect(output).toContain("object untyped = this.safeValue(item, \"x\");");
            expect(output).toContain('object y = (untyped != null && untyped.ContainsKey("k") ? untyped["k"] : null);');
        } finally {
            transpiler.csharpTranspiler.csharpDeclaredLocalTypeResolver = undefined;
        }
        const fallback = transpiler.transpileCSharp(input).content;
        expect(fallback).toContain('object y = getValue(untyped, "k");');
    });
});

describe('always-dictionary fields and oracle-proven dictionaries read natively', () => {
    test('a literal-key read of the exceptions field carries the helper\'s dictionary cast', () => {
        const input =
        "class Exchange {\n" +
        "    exceptions: { [key: string]: any } = {};\n" +
        "    main() {\n" +
        "        return this.exceptions['exact'];\n" +
        "    }\n" +
        "}\n";
        const output = transpiler.transpileCSharp(input).content;
        // `exceptions` is declared `IDictionary<string, object>` (Exchange.Options.cs): no cast
        expect(output).toContain('(this.exceptions != null && this.exceptions.ContainsKey("exact") ? this.exceptions["exact"] : null)');
        expect(output).not.toContain('getValue(this.exceptions,');
    });
    test('a literal-key read of the markets field goes native too', () => {
        const input =
        "class Exchange {\n" +
        "    markets: { [key: string]: any } = {};\n" +
        "    main() {\n" +
        "        return this.markets['BTC/USDT'];\n" +
        "    }\n" +
        "}\n";
        const output = transpiler.transpileCSharp(input).content;
        expect(output).toContain('(this.markets != null && this.markets.ContainsKey("BTC/USDT") ? this.markets["BTC/USDT"] : null)');
        expect(output).not.toContain('getValue(this.markets,');
    });
    test('a non-literal key on these fields keeps the helper', () => {
        const input =
        "class Exchange {\n" +
        "    exceptions: { [key: string]: any } = {};\n" +
        "    main(key) {\n" +
        "        return this.exceptions[key];\n" +
        "    }\n" +
        "}\n";
        const output = transpiler.transpileCSharp(input).content;
        expect(output).toContain('getValue(this.exceptions, key)');
    });
    test('a local the embedding layer proves a dictionary reads natively behind the cast', () => {
        const input =
        "class Exchange {\n" +
        "    parseWsBidAsk(a) { return a; }\n" +
        "    main(row) {\n" +
        "        const ticker = this.parseWsBidAsk(row);\n" +
        "        const symbol = ticker['symbol'];\n" +
        "        return symbol;\n" +
        "    }\n" +
        "}\n";
        // the printed declaration stays `object`; the value-type oracle names the box the source
        // proves, so the read compiles behind the cast and keeps the helper's null answers
        transpiler.csharpTranspiler.csharpExpressionTypeResolver = (node) => (node?.text === 'ticker') ? 'Dictionary<string, object>' : undefined;
        try {
            const output = transpiler.transpileCSharp(input).content;
            expect(output).toContain('object ticker = this.parseWsBidAsk(row);');
            expect(output).toContain('object symbol = (ticker != null && ((IDictionary<string, object>)ticker).ContainsKey("symbol") ? ((IDictionary<string, object>)ticker)["symbol"] : null);');
            expect(output).not.toContain('getValue(ticker,');
        } finally {
            transpiler.csharpTranspiler.csharpExpressionTypeResolver = undefined;
        }
        const fallback = transpiler.transpileCSharp(input).content;
        expect(fallback).toContain('getValue(ticker, "symbol")');
    });
    test('a proven list box and the market/currency receivers keep the helper', () => {
        const input =
        "class Exchange {\n" +
        "    parseWsBidAsk(a) { return a; }\n" +
        "    main(row) {\n" +
        "        const rows = this.parseWsBidAsk(row);\n" +
        "        const ticker = this.parseWsBidAsk(row);\n" +
        "        const currency = this.parseWsBidAsk(row);\n" +
        "        const a = rows['x'];\n" +
        "        const b = currency['code'];\n" +
        "        const c = ticker[0];\n" +
        "        return [a, b, c];\n" +
        "    }\n" +
        "}\n";
        const kinds: any = { rows: 'List<object>', ticker: 'Dictionary<string, object>', currency: 'Dictionary<string, object>' };
        transpiler.csharpTranspiler.csharpExpressionTypeResolver = (node) => kinds[node?.text];
        try {
            const output = transpiler.transpileCSharp(input).content;
            // a list box has no dictionary key read; `currency` is a market-row receiver whose
            // proven dictionary type reads natively, with the helper's missing-key null
            expect(output).toContain('object a = getValue(rows, "x");');
            expect(output).toContain('object b = (currency.ContainsKey("code") ? currency["code"] : null);');
            // a numeric key is not a dictionary key
            expect(output).toContain('object c = getValue(ticker, 0);');
        } finally {
            transpiler.csharpTranspiler.csharpExpressionTypeResolver = undefined;
        }
    });
    test('a proven receiver reassigned in the function keeps the helper', () => {
        const input =
        "class Exchange {\n" +
        "    parseWsBidAsk(a) { return a; }\n" +
        "    main(row, other) {\n" +
        "        let ticker = this.parseWsBidAsk(row);\n" +
        "        ticker = other;\n" +
        "        return ticker['symbol'];\n" +
        "    }\n" +
        "}\n";
        transpiler.csharpTranspiler.csharpExpressionTypeResolver = (node) => (node?.text === 'ticker') ? 'Dictionary<string, object>' : undefined;
        try {
            const output = transpiler.transpileCSharp(input).content;
            expect(output).toContain('getValue(ticker, "symbol")');
        } finally {
            transpiler.csharpTranspiler.csharpExpressionTypeResolver = undefined;
        }
    });
    // a name the ts/src call-site analysis cleared (every declaration agrees, every call site passes a
    // compatible argument) prints the typed spelling on the base declaration and on every override;
    // every other name keeps `object` (C# overrides are invariant on parameter types, so a
    // half-retyped name cannot compile).
    describe('override parameter types', () => {
        const input =
        "type Dict = { [key: string]: any };\n" +
        "type List = any[];\n" +
        "class Exchange {\n" +
        "    parsePredictionOpenInterest (interest: Dict, market: Dict = undefined): Dict {\n" +
        "        return interest;\n" +
        "    }\n" +
        "    ethRpc (chainId: string, method: string, request: List = undefined): Dict {\n" +
        "        return {};\n" +
        "    }\n" +
        "    parseOrder (order: Dict, market: Dict = undefined): Dict {\n" +
        "        return order;\n" +
        "    }\n" +
        "}";
        test('a cleared name prints the dictionary / list spelling', () => {
            const output = transpiler.transpileCSharp(input).content;
            expect(output).toContain('parsePredictionOpenInterest(IDictionary<string, object> interest, object market = null)');
            expect(output).toContain('ethRpc(object chainId, object method, IList<object>? request = null)');
        });
        test('a name outside the census table keeps object', () => {
            const output = transpiler.transpileCSharp(input).content;
            expect(output).toContain('parseOrder(object order, object market = null)');
        });
        test('a parameter whose checker shape does not answer the table spelling keeps object', () => {
            const other =
            "type Dict = { [key: string]: any };\n" +
            "class Exchange {\n" +
            "    parsePredictionOpenInterest (interest: any, market: Dict = undefined): Dict {\n" +
            "        return interest;\n" +
            "    }\n" +
            "}";
            const output = transpiler.transpileCSharp(other).content;
            expect(output).toContain('parsePredictionOpenInterest(object interest, object market = null)');
        });
    });
    // ---- ws handler `message` parameter ----
    const wsHandlerSource = (body: string, messageType: string = 'Dict', extra: string = '') =>
        'type Dict = { [key: string]: any };\n' +
        'interface Client { id: string; }\n' +
        extra +
        'class Exchange {\n' +
        '    helper (symbols: Dict): void {\n' +
        '        if (Array.isArray (symbols)) { return; }\n' +
        '    }\n' +
        '    handleTicker (client: Client, message: ' + messageType + '): void {\n' +
        '        ' + body + '\n' +
        '    }\n' +
        '}\n';
    test('a table-only ws handler prints the typed message parameter and native reads', () => {
        const input = wsHandlerSource(
            'const methods = { \'ticker\': this.handleTicker };\n' +
            '        const a = message[\'ticker\'];\n' +
            '        const n = message.length;\n' +
            '        const has = \'k\' in message;\n' +
            '        return [methods, a, n, has];');
        const output = transpiler.transpileCSharp(input).content;
        // the typed signature (the class itself is not the ws bridge; the ccxt build layer
        // rewrites the client parameter)
        expect(output).toContain('public virtual void handleTicker(object client, Dictionary<string, object> message)');
        // the element read keeps the helper's missing-key null
        expect(output).toContain('(message != null && message.ContainsKey("ticker") ? message["ticker"] : null)');
        // the length read keeps the helper's null -> 0
        expect(output).toContain('(message?.Count ?? 0)');
        // `key in message` binds ContainsKey on the declared dictionary
        expect(output).toContain('message.ContainsKey("k")');
        // the message parameter itself keeps a dispatch-table entry (a method-group value)
        expect(output).toContain('{ "ticker", this.handleTicker }');
    });
    test('a ws handler called statically keeps the boxed message parameter', () => {
        const input = wsHandlerSource(
            'this.handleTicker (client, message);\n' +
            '        const a = message[\'ticker\'];',
            'Dict',
            'class Other extends Exchange { }\n');
        const output = transpiler.transpileCSharp(input).content;
        expect(output).toContain('public virtual void handleTicker(object client, object message)');
        expect(output).toContain('this.handleTicker(client, message);');
        expect(output).toContain('getValue(message, "ticker")');
    });
    test('a class with a list route keeps every handler message boxed', () => {
        const input = wsHandlerSource(
            'if (Array.isArray (message)) { return; }\n' +
            '        const methods = { \'ticker\': this.handleTicker };\n' +
            '        const a = message[\'ticker\'];',
            'any');
        const output = transpiler.transpileCSharp(input).content;
        expect(output).toContain('public virtual void handleTicker(object client, object message)');
        expect(output).toContain('getValue(message, "ticker")');
    });
    test('a written message parameter keeps the box', () => {
        const input = wsHandlerSource(
            'message = this.safeDict (message, \'data\', message);\n' +
            '        const methods = { \'ticker\': this.handleTicker };\n' +
            '        const a = message[\'ticker\'];');
        const output = transpiler.transpileCSharp(input).content;
        expect(output).toContain('public virtual void handleTicker(object client, object message)');
    });
    test('an untyped message parameter keeps the box', () => {
        const input = wsHandlerSource(
            'const methods = { \'ticker\': this.handleTicker };\n' +
            '        const a = message[\'ticker\'];',
            'any');
        const output = transpiler.transpileCSharp(input).content;
        expect(output).toContain('public virtual void handleTicker(object client, object message)');
        expect(output).toContain('getValue(message, "ticker")');
    });
    test('an override keeps the base class signature', () => {
        const input =
            'type Dict = { [key: string]: any };\n' +
            'interface Client { id: string; }\n' +
            'class Base {\n' +
            '    handleTicker (client: Client, message: Dict): void {}\n' +
            '}\n' +
            'class Exchange extends Base {\n' +
            '    override handleTicker (client: Client, message: Dict): void {\n' +
            '        const a = message[\'ticker\'];\n' +
            '    }\n' +
            '}\n';
        const output = transpiler.transpileCSharp(input).content;
        const overrideLine = output.split('\n').filter((line: string) => line.indexOf('override void handleTicker') >= 0);
        expect(overrideLine.length).toBe(1);
        expect(overrideLine[0]).toContain('object message');
    });
    test('a list test on an unrelated parameter keeps the handler typed', () => {
        const input = wsHandlerSource(
            'const methods = { \'ticker\': this.handleTicker };\n' +
            '        const a = message[\'ticker\'];');
        const output = transpiler.transpileCSharp(input).content;
        // the helper's `Array.isArray (symbols)` is not the handler message
        expect(output).toContain('public virtual void handleTicker(object client, Dictionary<string, object> message)');
    });
    test('a call from another class of the same file keeps the box', () => {
        const input =
            'type Dict = { [key: string]: any };\n' +
            'interface Client { id: string; }\n' +
            'class Alpha {\n' +
            '    alphaHelper (client: Client, message: Dict): void {\n' +
            '        const a = message[\'k\'];\n' +
            '    }\n' +
            '}\n' +
            'class Exchange {\n' +
            '    handleTicker (client: Client, message: Dict): void {\n' +
            '        const methods = { \'ticker\': this.handleTicker };\n' +
            '        this.betaPing (client, message);\n' +
            '    }\n' +
            '    betaPing (client: Client, message: Dict): void {\n' +
            '        const b = message[\'k\'];\n' +
            '    }\n' +
            '}\n';
        const output = transpiler.transpileCSharp(input).content;
        // the file-level index records the static call, so the callee keeps the box
        expect(output).toContain('public virtual void betaPing(object client, object message)');
        expect(output).not.toContain('betaPing(object client, Dictionary<string, object> message)');
        expect(output).toContain('getValue(message, "k")');
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
    test('a typed destructuring holder drops its cast when csharpDestructuringTempNeedsCast answers false', () => {
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
        printer.csharpDestructuringTempNeedsCast = (node, printed) => !printed.startsWith('callDynamically(this, "handleSomething');
        try {
            const output = transpiler.transpileCSharp(input).content;
            expect(output).toContain("IList<object> abVariable = (IList<object>)callDynamically(this, \"someTuple\", new object[] { 1 });");
            expect(output).toContain("IList<object> cparametersVariable = callDynamically(this, \"handleSomethingAndParams\", new object[] { parameters });");
            expect(output).toContain("c = cparametersVariable[0];");
        } finally {
            delete printer.csharpDestructuringTempType;
            delete printer.csharpDestructuringTempNeedsCast;
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
        // the falsy wrapper is dropped around the printed `isEqual (...)` too, so the ternary
        // condition is the bare helper call; the `((bool) …)` cast removal is asserted by the
        // two negatives below.
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

    // `isEqual (x, "lit")` -> `x == "lit"` when csharpLocalTypeOf names the operand a
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
        // no hook installed: the string-literal gate must keep the helper call. The isTrue wrapper
        // is dropped around the printed isEqual, so the assertions below pin the helper AND --
        // stronger -- that no native operator was emitted.
        expect(output).toContain('if (isEqual(s, "lit"))');
        expect(output).toContain('if (!isEqual(s, "other"))');
        expect(output).toContain('if (isEqual("third", s))');
        expect(output).not.toContain('s == "lit"');
        expect(output).not.toContain('s != "other"');
        expect(output).not.toContain('"third" == s');
    });
    test('csharpLocalTypeOf naming the operand a string emits the native operator', () => {
        const csharp: any = (transpiler as any).csharpTranspiler;
        csharp.csharpLocalTypeOf = (node: any) => (node?.text === 's' ? 'string' : undefined);
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
        csharp.csharpLocalTypeOf = (node: any) => (node?.text === 's' ? 'object' : undefined);
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
            // an 'object' answer is not a string: the string gate never fires and the helper
            // stays (the isTrue wrapper around the printed isEqual is still dropped)
            expect(output).toContain('if (isEqual(s, "lit"))');
            expect(output).toContain('if (isEqual(s, a))');
            // `isEqual(s, null)` is inlined by printInlineEquality (null comparison on an
            // object operand); the string gate above cannot name it either way
            expect(output).toContain('if ((s == null))');
            expect(output).not.toContain('s == "lit"');
        } finally {
            delete csharp.csharpLocalTypeOf;
        }
    });
});

describe('x.push on a receiver the classifier declares a list drops the cast', () => {
    // the printer's own print names no type for `const keys = []` / `this.safeList (...)`:
    // the embedding classifier retypes those declarations AFTER
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
            if (node?.text === 'keys') {
                return 'List<object>';
            }
            if (node?.text === 'other') {
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
        (transpiler as any).csharpTranspiler.csharpLocalTypeOf = (node: any) => (node?.text === 'keys' ? 'object' : undefined);
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

// `((List<object>)x)[i] = v` drops the cast when the receiver's PRINTED declaration is a
// concrete List<object>; the classifier types it after printing, so the printer reads it
// through the `csharpLocalTypeOf` hook (stubbed below).
describe('element-access list cast gate on a printed List<object> receiver', () => {
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
        // the embedding worker replaces this hook per instance; the
        // element-access rule must not preempt it for a key that may be a string
        localTranspiler.csharpTranspiler.printElementAccessExpressionExceptionIfAny = () => 'INSTANCE_HOOK';
        const output = localTranspiler.transpileCSharp('function test (key: string | undefined) {\n    const orders: any[] = [];\n    orders[key] = 5;\n}').content;
        expect(output).toContain('INSTANCE_HOOK');
    });
    test('an any-typed key is a dictionary element and keeps the cast', () => {
        const output = transpile(listInput('    const key: any = "k";\n    orders[key] = 5;'), listReceiver);
        expect(output).toContain("((IDictionary<string,object>)orders)[(string)key] = 5;");
    });
    const cacheTranspile = (input: string) => {
        const localTranspiler: any = new Transpiler(config as any);
        localTranspiler.csharpTranspiler.csharpExpressionTypeResolver = (node) => (node?.text === 'orders' ? 'ccxt.pro.ArrayCache' : undefined);
        return localTranspiler.transpileCSharp(input).content;
    };
    test('an ArrayCache-declared receiver writes through IList<object>', () => {
        const output = cacheTranspile(listInput('    orders[0] = 5;'));
        expect(output).toContain("((IList<object>)orders)[Convert.ToInt32(0)] = 5;");
    });
    test('an ArrayCache-declared receiver keeps the dictionary cast for a string key', () => {
        const output = cacheTranspile(listInput('    orders["k"] = 5;'));
        expect(output).toContain('((IDictionary<string,object>)orders)["k"] = 5;');
    });
});

describe('ws cache class parameters', () => {
    test('a configured params bag prints Dictionary<string, object>', () => {
        const t: any = new Transpiler({ 'verbose': false, 'csharp': { 'dictParamsMethods': [ 'FetchMyBuys' ], 'parser': { 'NUM_LINES_END_FILE': 0 } } } as any);
        const output = t.transpileCSharp('class Test {\n    fetchMyBuys (symbol, params = {}) {\n        return params;\n    }\n    other (params = {}) {\n        return params;\n    }\n}').content;
        expect(output).toContain('fetchMyBuys(object symbol, Dictionary<string, object> parameters = null)');
        expect(output).toContain('other(object parameters = null)');
    });
    test('configured core argument types print on the signature, a written one reads an object shadow', () => {
        const t: any = new Transpiler({ 'verbose': false, 'csharp': { 'coreArgTypes': { 'fetchThing': { 0: 'string', 1: 'string', 2: 'Int64?' } }, 'signatureArgTypes': { 'sign': { 0: 'string' } }, 'parser': { 'NUM_LINES_END_FILE': 0 } } } as any);
        const input = 'class Test {\n    fetchThing (symbol, timeframe = \'1m\', since = undefined) {\n        // the timeframe stays in comments\n        return [ symbol, timeframe, since ];\n    }\n    sign (path, api = \'public\') {\n        return path;\n    }\n}';
        const output = t.transpileCSharp(input).content;
        expect(output).toContain('fetchThing(string symbol, string timeframe = null, Int64? since = null)');
        expect(output).toContain('object timeframeVar = timeframe;\n        // the timeframe stays in comments\n        timeframeVar ??= "1m";');
        expect(output).toContain('new List<object>() {symbol, timeframeVar, since}');
        expect(output).toContain('sign(string path, object api = null)');
        expect(output).not.toContain('pathVar');
    });
    test('configured call-site argument types convert this./base. arguments in exchange sources', () => {
        const fs = require('fs');
        const os = require('os');
        const path = require('path');
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'csa-'));
        const file = path.join(dir, 'ts', 'src', 'thing.ts');
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, 'class Test {\n    fetchThing (symbol, limit = undefined, amount = undefined, params = {}) {\n        return symbol;\n    }\n    caller (s, x, n) {\n        this.fetchThing (s, x, n);\n        this.fetchThing ("BTC/USDT", 5, 1);\n        return this.fetchThing (s, undefined, x as number);\n    }\n}\n');
        const config = { 'verbose': false, 'csharp': { 'callSiteArgTypes': { 'fetchThing': { 0: 'string', 1: 'Int64?', 2: 'double' } }, 'parser': { 'NUM_LINES_END_FILE': 0 } } };
        const output = new Transpiler(config as any).transpileCSharpByPath(file).content;
        expect(output).toContain('this.fetchThing(((string)s),ccxt.BaseExchange.ToInt64Arg(x),ccxt.BaseExchange.ToDoubleArgRequired(n));');
        expect(output).toContain('this.fetchThing("BTC/USDT", 5L, 1d);');
        expect(output).toContain('return this.fetchThing(((string)s), null,ccxt.BaseExchange.ToDoubleArgRequired(x));');
        const plain = new Transpiler({ 'verbose': false, 'csharp': { 'parser': { 'NUM_LINES_END_FILE': 0 } } } as any).transpileCSharpByPath(file).content;
        expect(plain).toContain('this.fetchThing(s, x, n);');
    });
    test('configured typed cores print PascalCase on declarations and this./base. calls, per tier and venue', () => {
        const fs = require('fs');
        const os = require('os');
        const path = require('path');
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cst-'));
        const file = path.join(dir, 'ts', 'src', 'venue.ts');
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, 'class Base {\n    async fetchThing (symbol) {\n        return symbol;\n    }\n    async helper () {\n        return 1;\n    }\n}\nclass venue extends Base {\n    async fetchThing (symbol) {\n        const a = await this.helper ();\n        return await super.fetchThing (symbol);\n    }\n    async other () {\n        return await this.fetchThing ("x");\n    }\n}\n');
        const config = { 'verbose': false, 'csharp': { 'typedCores': { 'base': { 'fetchThing': 'Order' }, 'venue': { 'venue': { 'helper': 'Int64' } } }, 'parser': { 'NUM_LINES_END_FILE': 0 } } };
        const output = new Transpiler(config as any).transpileCSharpByPath(file).content;
        expect(output).toContain('Task<object> FetchThing(object symbol)');
        expect(output).toContain('return await base.FetchThing(symbol);');
        expect(output).toContain('return await this.FetchThing("x");');
        // the per-venue entry answers inside that venue's class only
        expect(output).toContain('object a = await this.Helper();');
        expect(output).toContain('Task<object> helper()');
        const plain = new Transpiler({ 'verbose': false, 'csharp': { 'parser': { 'NUM_LINES_END_FILE': 0 } } } as any).transpileCSharpByPath(file).content;
        expect(plain).toContain('this.fetchThing("x")');
        expect(plain).not.toContain('FetchThing');
    });
    test('a parameter annotated with a ws cache class prints that class', () => {
        const t: any = new Transpiler({ 'verbose': false, 'csharp': { 'parser': { 'NUM_LINES_END_FILE': 0 } } } as any);
        const input = 'class ArrayCache {}\nclass ArrayCacheBySymbolById extends ArrayCache {}\nclass Test {\n    prune (newCache: ArrayCacheBySymbolById, cache: ArrayCache, other) {\n        return newCache;\n    }\n}';
        const output = t.transpileCSharp(input).content;
        expect(output).toContain('prune(ccxt.pro.ArrayCacheBySymbolById newCache, ccxt.pro.ArrayCache cache, object other)');
    });
});

describe('hand-written numeric field comparisons', () => {
    test('an int / double field against an integer literal compares natively', () => {
        const t: any = new Transpiler({ 'verbose': false, 'csharp': { 'parser': PLAIN_PARSER } } as any);
        const input = 'class Test {\n    rateLimit: number = 2000;\n    fetchHistoryCacheSize: number = 0;\n    f () {\n        const a = this.fetchHistoryCacheSize > 0;\n        if (this.rateLimit > 0) {\n            return a;\n        }\n        return this.rateLimit < 1;\n    }\n}';
        const output = t.transpileCSharp(input).content;
        expect(output).toContain('bool a = (this.fetchHistoryCacheSize > 0);');
        expect(output).toContain('if ((this.rateLimit > 0))');
        expect(output).toContain('isLessThan(this.rateLimit, 1)'); // a double `<` keeps the helper
    });
});

describe('printed parameter / declaration equality and inOp', () => {
    const make = () => {
        const t: any = new Transpiler({ 'verbose': false, 'csharp': { 'parser': WRAPPED_PARSER, 'coreArgTypes': { 'setMode': { 0: 'bool?' } } } } as any);
        return t;
    };
    test('a bool? signature parameter compares with a bool? local by the lifted operator', () => {
        const t = make();
        t.csharpTranspiler.csharpDeclaredLocalTypeResolver = (d) => (d?.name?.text === 'was' ? 'bool?' : undefined);
        const input = 'class Test {\n    setMode (enable) {\n        const was = this.safeBool ({}, \'x\', false);\n        if (was !== enable) {\n            return 1;\n        }\n        return 0;\n    }\n    safeBool (a, b, c) { return c; }\n}';
        const output = t.transpileCSharp(input).content;
        expect(output).toContain('setMode(bool? enable)');
        expect(output).toContain('if (!(was == enable))');
    });
    test('a local whose final declaration is nullable prints a null test', () => {
        const t = make();
        t.csharpTranspiler.csharpFinalDeclaredLocalType = (d) => (d?.name?.text === 'p' ? 'double?' : undefined);
        const input = 'class Test {\n    f (o: any) {\n        const p: number = o[\'a\'];\n        if (p === undefined) {\n            return 1;\n        }\n        return p;\n    }\n}';
        const output = t.transpileCSharp(input).content;
        expect(output).toContain('if ((p == null))');
    });
    test('an object local holding a dictionary or null gets the typed inOp', () => {
        const t = make();
        const file = path.join(fs.mkdtempSync(path.join(require('os').tmpdir(), 'inop-')), 'ts', 'src');
        fs.mkdirSync(file, { recursive: true });
        const src = path.join(file, 'venue.ts');
        fs.writeFileSync(src, 'class Test {\n    omit (a, b) { return a; }\n    f (params = {}) {\n        const q: any = (params === undefined) ? this.omit (params, \'x\') : params;\n        if (\'k\' in q) {\n            return 1;\n        }\n        return 0;\n    }\n}');
        const output = t.transpileCSharpByPath(src).content;
        expect(output).toContain('(q is IDictionary<string, object> inOpDict0 && inOpDict0.ContainsKey("k"))');
    });
    test('the dictionary-or-null inOp stays the helper outside exchange sources', () => {
        const t = make();
        const input = 'class Test {\n    f (params = {}) {\n        const q: any = params;\n        return (\'k\' in q);\n    }\n}';
        expect(t.transpileCSharp(input).content).toContain('inOp(q, "k")');
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
        // the wrapper around the printed `(isEqual(a, 1))` operand is dropped too; what this test
        // pins is the bare `isSpot` operand, which only the local-type hook can name
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
        csharp.csharpConditionOperandType = (node) => ((node?.text === 'flag') ? 'bool?' : upstream(node));
        try {
            const output = transpiler.transpileCSharp(input).content;
            expect(output).toContain("if (flag == true)");
            expect(output).toContain("if (flag != true)");
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
    test('a ternary condition named by the hook prints natively (bool bare, bool? == true)', () => {
        const input =
        "class Exchange {\n" +
        "    main (market, a, b) {\n" +
        "        const isSpot = market['spot'] === true;\n" +
        "        const pick = isSpot ? a : b;\n" +
        "        const paren = (isSpot) ? a : b;\n" +
        "        return [pick, paren];\n" +
        "    }\n" +
        "}\n";
        // the printer itself declares `isSpot` bool, so the hook names it without any override:
        // the `((bool) …)` wrapper and the isTrue call are both gone from the condition
        const output = transpiler.transpileCSharp(input).content;
        expect(output).toContain("bool isSpot = isEqual(getValue(market, \"spot\"), true)");
        expect(output).toContain("object pick = isSpot ? a : b;");
        expect(output).toContain("object paren = isSpot ? a : b;");
        expect(output).not.toContain("isTrue(isSpot)");
        expect(output).not.toContain("isSpot == true");
    });
    test('a bool? ternary condition prints x == true (source parens unwrapped)', () => {
        const input =
        "class Exchange {\n" +
        "    main (a, b) {\n" +
        "        const flag = a;\n" +
        "        const pick = flag ? a : b;\n" +
        "        const paren = (flag) ? a : b;\n" +
        "        return [pick, paren];\n" +
        "    }\n" +
        "}\n";
        const csharp = transpiler.csharpTranspiler;
        const upstream = csharp.csharpConditionOperandType.bind(csharp);
        // what the ccxt classifier's installCsharpConditionOperands override answers for a
        // declaration its tables retype to `bool?`
        csharp.csharpConditionOperandType = (node) => ((node?.text === 'flag') ? 'bool?' : upstream(node));
        try {
            const output = transpiler.transpileCSharp(input).content;
            expect(output).toContain("object pick = flag == true ? a : b;");
            expect(output).toContain("object paren = flag == true ? a : b;");
            expect(output).not.toContain("isTrue(flag)");
        } finally {
            csharp.csharpConditionOperandType = upstream;
        }
    });
    test('a ternary condition the hook cannot name keeps the isTrue wrapper', () => {
        const input =
        "class Exchange {\n" +
        "    main (a, b) {\n" +
        "        const read = a;\n" +
        "        const pick = read ? a : b;\n" +
        "        return pick;\n" +
        "    }\n" +
        "}\n";
        const output = transpiler.transpileCSharp(input).content;
        expect(output).toContain("object read = a;");
        expect(output).toContain("object pick = isTrue(read) ? a : b;");
    });
    test('a bool? operand under ! prints x != true', () => {
        const input =
        "class Exchange {\n" +
        "    main (a, b) {\n" +
        "        const flag = a;\n" +
        "        if (!flag) { b = 1; }\n" +
        "        const not = !flag;\n" +
        "        return not;\n" +
        "    }\n" +
        "}\n";
        const csharp = transpiler.csharpTranspiler;
        const upstream = csharp.csharpConditionOperandType.bind(csharp);
        csharp.csharpConditionOperandType = (node) => ((node?.text === 'flag') ? 'bool?' : upstream(node));
        try {
            const output = transpiler.transpileCSharp(input).content;
            expect(output).toContain("if (flag != true)");
            expect(output).toContain("bool not = flag != true;");
            expect(output).not.toContain("isTrue(flag)");
            expect(output).not.toContain("!(flag == true)");
        } finally {
            csharp.csharpConditionOperandType = upstream;
        }
    });
    test('a ! operand the hook cannot name keeps !isTrue', () => {
        const input =
        "class Exchange {\n" +
        "    main (a, b) {\n" +
        "        const read = a;\n" +
        "        if (!read) { b = 1; }\n" +
        "        return b;\n" +
        "    }\n" +
        "}\n";
        const output = transpiler.transpileCSharp(input).content;
        expect(output).toContain("if (!isTrue(read))");
    });
    test('a typed bool operand keeps the printer\'s !x under !', () => {
        const input =
        "class Exchange {\n" +
        "    main (market, b) {\n" +
        "        const isSpot = market['spot'] === true;\n" +
        "        if (!isSpot) { b = 1; }\n" +
        "        return b;\n" +
        "    }\n" +
        "}\n";
        const output = transpiler.transpileCSharp(input).content;
        expect(output).toContain("if (!isSpot)");
        expect(output).not.toContain("isSpot != true");
    });
});

describe('falsy wrapper around a printed bool', () => {
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
        // safeBool is a hand-written bool? producer: its read is the lifted comparison (cs-22)
        expect(output).toContain("if ((this.safeBool(a, \"x\") == true))");
        expect(output).toContain("if (isTrue(this.isThing(a)))");
        expect(output).toContain("if (a is Object)");
        // the `((bool) …)` cast around the ternary condition is dropped; the ternary
        // itself stays inside the wrapper, because its C# type is the branches' common type
        // (object), not bool -- see csharpTextHasTopLevelConditional. The merged printer must
        // not drop it on the strength of the leading `isTrue(flag)` text.
        expect(output).toContain("if (isTrue(isTrue(flag) ? a : b))");
        expect(output).not.toContain("((bool)");
        expect(output).not.toContain("if (isTrue(flag) ? a : b)");
    });

    // `add (x, y)` -> `(x + y)` when csharpNativeStringConcat proves the LEFT operand's
    // printed declaration is a string. The call such an operand binds is add(string, string)
    // (`a + b`) or add(string, object) (`a + b?.ToString()`), and C#'s string concatenation
    // computes exactly those values for every input, null operands included.
    test('addition keeps the add helper while csharpNativeStringConcat is not installed', () => {
        const input =
        "class Exchange {\n" +
        "    test (a: any, b: any) {\n" +
        "        const s = a;\n" +
        "        const one = s + 'lit';\n" +
        "        const two = s + b;\n" +
        "        const three = 'lit' + s;\n" +
        "        return [one, two, three];\n" +
        "    }\n" +
        "}";
        const output = transpiler.transpileCSharp(input).content;
        expect(output).toContain('add(s, "lit")');
        expect(output).toContain('add(s, b)');
        // a literal LEFT is itself a non-null string: the printer's own proof prints the concat
        expect(output).toContain('string three = ("lit" + s)');
        expect(output).not.toContain('(s + "lit")');
        expect(output).not.toContain('add("lit", s)');
    });
    test('a proven string answer emits the parenthesised native concat', () => {
        const csharp: any = (transpiler as any).csharpTranspiler;
        csharp.csharpNativeStringConcat = (left: any, right: any, leftText: string, rightText: string) =>
            ((left?.text === 's') ? `(${leftText} + ${rightText})` : undefined);
        try {
            const input =
            "class Exchange {\n" +
            "    test (a: any, b: any) {\n" +
            "        const s = a;\n" +
            "        const one = s + 'lit';\n" +
            "        const two = s + b;\n" +
            "        return [one, two];\n" +
            "    }\n" +
            "}";
            const output = transpiler.transpileCSharp(input).content;
            expect(output).toContain('(s + "lit")');
            expect(output).toContain('(s + b)');
            expect(output).not.toContain('add(s, "lit")');
            expect(output).not.toContain('add(s, b)');
        } finally {
            delete csharp.csharpNativeStringConcat;
        }
    });
    test('a nested add chain converts through the same hook and stays parenthesised', () => {
        const csharp: any = (transpiler as any).csharpTranspiler;
        csharp.csharpNativeStringConcat = (left: any, right: any, leftText: string, rightText: string) =>
            ((left?.text === 's' || (left?.kind === SyntaxKind.BinaryExpression && left?.operatorToken?.kind === SyntaxKind.PlusToken))
                ? `(${leftText} + ${rightText})` : undefined);
        try {
            const input =
            "class Exchange {\n" +
            "    test (a: any, b: any) {\n" +
            "        const s = a;\n" +
            "        return s + 'a' + b;\n" +
            "    }\n" +
            "}";
            const output = transpiler.transpileCSharp(input).content;
            expect(output).toContain('((s + "a") + b)');
            expect(output).not.toContain('add(');
        } finally {
            delete csharp.csharpNativeStringConcat;
        }
    });
    test('an undefined answer and a compound assignment keep the helper', () => {
        const csharp: any = (transpiler as any).csharpTranspiler;
        csharp.csharpNativeStringConcat = () => undefined;
        try {
            const input =
            "class Exchange {\n" +
            "    test (a: any, b: any) {\n" +
            "        const s = a;\n" +
            "        let acc = b;\n" +
            "        acc += s;\n" +
            "        return [s + 'lit', acc];\n" +
            "    }\n" +
            "}";
            const output = transpiler.transpileCSharp(input).content;
            expect(output).toContain('add(s, "lit")');
            // `acc += s` prints `acc = add(acc, s)`; the hook is not consulted for `+=`
            expect(output).toContain('acc = add(acc, s)');
        } finally {
            delete csharp.csharpNativeStringConcat;
        }
    });
});

describe('csharp declared-receiver .length: getArrayLength -> Count/Length (hook gated)', () => {
    const withReceiverType = (type, source) => {
        const previous = transpiler.csharpTranspiler.csharpLengthReceiverType;
        transpiler.csharpTranspiler.csharpLengthReceiverType = (node) => ((node?.kind === SyntaxKind.Identifier) ? type : undefined);
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

// `x[i]` reads on a list receiver. getValue answers null for an index off the end while
// the C# indexer throws, so the native read is emitted only where the enclosing `for` re-tests
// `i < x.length` at the top of every iteration and neither the index nor the receiver can move
// in the body. The receiver/index types come from the consumer hook
// (csharpListIndexReadTypes); these tests stub it.
describe('list index reads bounded by the enclosing for', () => {
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
    const transpile = (input: string, hook?: (node: any) => any) => {
        const localTranspiler: any = new Transpiler(config as any);
        if (hook !== undefined) {
            localTranspiler.csharpTranspiler.csharpListIndexReadTypes = hook;
        }
        return localTranspiler.transpileCSharp(input).content;
    };
    const listRead = () => ({ receiver: 'List<object>', index: 'int' });
    const body = (lines: string[]) => 'function test () {\n    const orders: any[] = [];\n' + lines.join('\n') + '\n}';
    const loop = (read: string, extra: string[] = []) =>
        body(['    for (let i = 0; i < orders.length; i++) {', '        const a = ' + read + ';'].concat(extra).concat(['    }']));

    test('an untyped receiver keeps the helper (no hook)', () => {
        const output = transpile(loop('orders[i]'));
        expect(output).toContain('object a = getValue(orders, i);');
        expect(output).not.toContain('orders[i]');
    });
    test('a loop-bounded read on a List<object> receiver prints the native indexer', () => {
        const output = transpile(loop('orders[i]'), listRead);
        expect(output).toContain('object a = orders[i];');
        expect(output).not.toContain('getValue(orders, i)');
    });
    test('an IList<object> receiver is a valid indexer receiver too', () => {
        const output = transpile(loop('orders[i]'), () => ({ receiver: 'IList<object>', index: 'int' }));
        expect(output).toContain('object a = orders[i];');
    });
    test('a non-int index keeps the helper', () => {
        const output = transpile(loop('orders[i]'), () => ({ receiver: 'List<object>', index: 'Int64' }));
        expect(output).toContain('object a = getValue(orders, i);');
    });
    test('a receiver the hook does not name a list keeps the helper', () => {
        const output = transpile(loop('orders[i]'), () => ({ receiver: 'object', index: 'int' }));
        expect(output).toContain('object a = getValue(orders, i);');
    });
    test('a read outside any loop keeps the helper', () => {
        const output = transpile(body(['    let i = 0;', '    const a = orders[i];']), listRead);
        expect(output).toContain('object a = getValue(orders, i);');
    });
    test('a while loop keeps the helper', () => {
        const output = transpile(body(['    let i = 0;', '    while (i < orders.length) {', '        const a = orders[i];', '        i++;', '    }']), listRead);
        expect(output).toContain('object a = getValue(orders, i);');
    });
    test('a `<=` condition keeps the helper', () => {
        const output = transpile(body(['    for (let i = 0; i <= orders.length - 1; i++) {', '        const a = orders[i];', '    }']), listRead);
        expect(output).toContain('object a = getValue(orders, i);');
    });
    test('a condition bounding another name keeps the helper', () => {
        const output = transpile(body(['    const other: any[] = [];', '    for (let i = 0; i < other.length; i++) {', '        const a = orders[i];', '    }']), listRead);
        expect(output).toContain('object a = getValue(orders, i);');
    });
    test('a read in the loop header keeps the helper', () => {
        const output = transpile(body(['    for (let i = 0; i < orders.length; i++) {', '        const a = orders[i];', '    }']), listRead);
        expect(output).toContain('object a = orders[i];');
        const header = transpile(body(['    for (let i = 0; i < orders.length; i = i + orders[i].length) {', '        const a = orders[i];', '    }']), listRead);
        expect(header).toContain('getValue(orders, i)');
    });
    test('a receiver mutated in the body keeps the helper', () => {
        const push = transpile(loop('orders[i]', ['        orders.push (a);']), listRead);
        expect(push).toContain('object a = getValue(orders, i);');
        const pop = transpile(loop('orders[i]', ['        orders.pop ();']), listRead);
        expect(pop).toContain('object a = getValue(orders, i);');
        const truncate = transpile(loop('orders[i]', ['        orders.length = 0;']), listRead);
        expect(truncate).toContain('object a = getValue(orders, i);');
    });
    test('a receiver handed to a callee in the body keeps the helper', () => {
        const output = transpile(loop('orders[i]', ['        this.parseAll (orders);']), listRead);
        expect(output).toContain('object a = getValue(orders, i);');
    });
    test('an index written in the body keeps the helper', () => {
        const output = transpile(loop('orders[i]', ['        i = i + 1;']), listRead);
        expect(output).toContain('object a = getValue(orders, i);');
    });
    test('a read inside a nested function keeps the helper', () => {
        const output = transpile(loop('orders[i]', ['        const f = () => orders[i];']), listRead);
        expect(output).toContain('getValue(orders, i)');
    });
    test('a nested loop reading the outer receiver through the outer index prints natively', () => {
        const output = transpile(body([
            '    const other: any[] = [];',
            '    for (let i = 0; i < orders.length; i++) {',
            '        for (let j = 0; j < other.length; j++) {',
            '            const a = orders[i];',
            '        }',
            '    }',
        ]), listRead);
        expect(output).toContain('object a = orders[i];');
    });
    test('a receiver written before the loop still qualifies', () => {
        const output = transpile('function test (other) {\n    let orders: any[] = [];\n    orders = other;\n    for (let i = 0; i < orders.length; i++) {\n        const a = orders[i];\n    }\n}', listRead);
        expect(output).toContain('object a = orders[i];');
    });
    test('a property read of the receiver in the body keeps the bound', () => {
        const output = transpile(loop('orders[i]', ['        const n = orders.length;']), listRead);
        expect(output).toContain('object a = orders[i];');
    });
    test('an element write keeps the cast path', () => {
        const output = transpile(body(['    for (let i = 0; i < orders.length; i++) {', '        orders[i] = 5;', '    }']), listRead);
        expect(output).toContain('((List<object>)orders)[Convert.ToInt32(i)] = 5;');
    });
    test('a `(x as List).length` condition bounds the receiver itself', () => {
        const output = transpile(body(['    for (let i = 0; i < (orders as List).length; i++) {', '        const a = orders[i];', '    }']), listRead);
        expect(output).toContain('object a = orders[i];');
    });
    test('an `as any` / `as string[]` length receiver keeps the helper', () => {
        const anyCast = transpile(body(['    for (let i = 0; i < (orders as any).length; i++) {', '        const a = orders[i];', '    }']), listRead);
        expect(anyCast).toContain('getValue(orders, i)');
        const arrayCast = transpile(body(['    for (let i = 0; i < (orders as any[]).length; i++) {', '        const a = orders[i];', '    }']), listRead);
        expect(arrayCast).toContain('getValue(orders, i)');
    });
    test('a string key is not a list index read', () => {
        const output = transpile(body(['    for (let i = 0; i < orders.length; i++) {', '        const a = orders["k"];', '    }']), listRead);
        expect(output).not.toContain('orders["k"]');
    });
});

// a negation guarded by a null test of the same nullable read
describe('guarded nullable negation', () => {
    const transpiler = new Transpiler({});
    const cls = (body: string) =>
        "class Exchange {\n" +
        "    safeNumberN(a, b) { return a; }\n" +
        "    main(item) {\n" + body + "    }\n" +
        "}";
    test('if-guarded double? local keeps its type and negates in place', () => {
        const output = transpiler.transpileCSharp(cls(
            "        const amount = this.safeNumberN(item, ['amount']);\n" +
            "        let r = amount;\n" +
            "        if (amount !== undefined) {\n" +
            "            r = -amount;\n" +
            "        }\n" +
            "        return r;\n")).content;
        expect(output).toContain('double? amount = this.safeNumberN(');
        expect(output).toContain('r = (amount = -amount);');
        expect(output).not.toContain('prefixUnaryNeg');
    });
    test('&&-guarded double? local negates in place', () => {
        const output = transpiler.transpileCSharp(cls(
            "        const amount = this.safeNumberN(item, ['amount']);\n" +
            "        const x = (amount !== undefined) && this.safeNumberN(-amount, []);\n" +
            "        return x;\n")).content;
        expect(output).toContain('double? amount = this.safeNumberN(');
        expect(output).toContain('(amount = -amount)');
        expect(output).not.toContain('prefixUnaryNeg');
    });
    test('unguarded negation keeps object + helper', () => {
        const output = transpiler.transpileCSharp(cls(
            "        const amount = this.safeNumberN(item, ['amount']);\n" +
            "        return -amount;\n")).content;
        expect(output).toContain('object amount = this.safeNumberN(');
        expect(output).toContain('prefixUnaryNeg(ref amount)');
    });

describe('array-annotated parameters', () => {
    const listClass = (signature: string, body: string, extra = '') =>
        "class Exchange {\n" +
        "    safeValue(a, b) { return a; }\n" +
        extra +
        "    " + signature + " {\n" + body + "    }\n" +
        "}";
    test('a Dict[] parameter prints IList<object> and its reads go native', () => {
        const output = transpiler.transpileCSharp(listClass(
            'main (rows: { [key: string]: any }[])',
            "        const n = rows.length;\n" +
            "        return rows[0];\n")).content;
        expect(output).toContain('public virtual object main(IList<object> rows)');
        expect(output).toContain('(rows?.Count ?? 0)');
        expect(output).not.toContain('getArrayLength(rows)');
        expect(output).not.toContain('getValue(rows');
    });
    test('a string[] parameter keeps object and the helpers', () => {
        const output = transpiler.transpileCSharp(listClass(
            'main (symbols: string[])',
            "        const n = symbols.length;\n" +
            "        return symbols[0];\n")).content;
        expect(output).toContain('public virtual object main(object symbols)');
        expect(output).toContain('getArrayLength(symbols)');
    });
    test('a rebinding body keeps object', () => {
        const output = transpiler.transpileCSharp(listClass(
            'main (rows: any[])',
            "        rows = this.safeValue(rows, 'rows');\n" +
            "        return rows.length;\n")).content;
        expect(output).toContain('public virtual object main(object rows)');
        expect(output).toContain('getArrayLength(rows)');
    });
    test('a call site passing an object local keeps object', () => {
        const output = transpiler.transpileCSharp(listClass(
            'main (rows: any[])',
            "        return rows.length;\n",
            "    run (response) {\n" +
            "        const local = this.safeValue(response, 'rows');\n" +
            "        return this.main(local);\n" +
            "    }\n")).content;
        expect(output).toContain('public virtual object main(object rows)');
        expect(output).toContain('getArrayLength(rows)');
    });
    test('a same-named call site in another class is still a call site of that name', () => {
        // the call-site analysis is name-scoped: the second class's `main` shares the key, so its object
        // argument keeps BOTH declarations boxed (a worker batch resolves no declaration handle)
        const input =
        "class Exchange {\n" +
        "    safeValue(a, b) { return a; }\n" +
        "    main (rows: any[]) {\n        return rows.length;\n    }\n" +
        "}\n" +
        "class Second {\n" +
        "    safeValue(a, b) { return a; }\n" +
        "    main (rows: any[]) {\n        return rows.length;\n    }\n" +
        "    run (response) {\n" +
        "        const local = this.safeValue(response, 'rows');\n" +
        "        return this.main(local);\n" +
        "    }\n" +
        "}";
        const output = transpiler.transpileCSharp(input).content;
        expect(output).not.toContain('IList<object> rows');
        expect(output).toContain('getArrayLength(rows)');
    });
    test('a parameter argument needs its own key admitted, not its annotation', () => {
        // `outer` is boxed by an object call in `run`, so its body hands an `object` to `inner`:
        // `inner` must stay boxed too, whatever its annotation says
        const input =
        "class Exchange {\n" +
        "    safeValue(a, b) { return a; }\n" +
        "    outer (rows: any[]) {\n        return this.inner(rows);\n    }\n" +
        "    inner (rows: any[]) {\n        return rows.length;\n    }\n" +
        "    run (response) {\n" +
        "        const local = this.safeValue(response, 'rows');\n" +
        "        return this.outer(local);\n" +
        "    }\n" +
        "}";
        const output = transpiler.transpileCSharp(input).content;
        expect(output).not.toContain('IList<object> rows');
        expect(output).toContain('getArrayLength(rows)');
    });
});
});

// a `boolean` parameter prints `bool?` only when every call site in the program passes a
// C# bool at that position; the body condition then drops the `isTrue` wrapper.
describe('boolean parameters become bool? on a proven call-site census', () => {
    const method = (name, flag, body) =>
        "    " + name + " (" + flag + "): number {\n" + body + "    }\n";
    test('a parameter every caller passes a literal for prints bool? and loses isTrue', () => {
        const input =
        "class T {\n" +
        method("f", "flag: boolean", "        if (flag) { return 1; }\n        return 0;\n") +
        "    g (): number {\n        return this.f (true);\n    }\n" +
        "}";
        const output = transpiler.transpileCSharp(input).content;
        expect(output).toContain("public virtual object f(bool? flag)");
        expect(output).toContain("if (flag == true)");
        expect(output).not.toContain("isTrue");
    });
    test('an untyped/object argument keeps the parameter object and the helper', () => {
        const input =
        "class T {\n" +
        method("f", "flag: boolean", "        if (flag) { return 1; }\n        return 0;\n") +
        "    g (x: any): number {\n        const box = x['k'];\n        return this.f (box);\n    }\n" +
        "}";
        const output = transpiler.transpileCSharp(input).content;
        expect(output).toContain("public virtual object f(object flag)");
        expect(output).toContain("if (isTrue(flag))");
    });
    test('a boolean the caller passes along is proven at the same time', () => {
        const input =
        "class T {\n" +
        method("f", "flag: boolean", "        if (flag) { return 1; }\n        return 0;\n") +
        method("g", "outer: boolean", "        return this.f (outer);\n") +
        "    h (): number {\n        return this.g (false);\n    }\n" +
        "}";
        const output = transpiler.transpileCSharp(input).content;
        expect(output).toContain("public virtual object f(bool? flag)");
        expect(output).toContain("public virtual object g(bool? outer)");
        expect(output).toContain("this.f(outer)");
    });
    test('a nilable boolean (`boolean | undefined`) is the same proof', () => {
        const input =
        "class T {\n" +
        "    f (flag: boolean | undefined = undefined): number {\n        if (flag) { return 1; }\n        return 0;\n    }\n" +
        "    g (): number {\n        return this.f (undefined);\n    }\n" +
        "}";
        const output = transpiler.transpileCSharp(input).content;
        expect(output).toContain("public virtual object f(bool? flag = null)");
        expect(output).toContain("if (flag == true)");
    });
    test('an override repeats its base parameter type, so it stays object', () => {
        const input =
        "class A {\n" +
        method("f", "a1: boolean", "        if (a1) { return 1; }\n        return 0;\n") +
        "}\n" +
        "class B extends A {\n" +
        method("f", "flag: boolean", "        if (flag) { return 1; }\n        return 0;\n") +
        "    g (): number {\n        return this.f (true);\n    }\n" +
        "}";
        const output = transpiler.transpileCSharp(input).content;
        expect(output).toContain("public override object f(object flag)");
        expect(output).toContain("if (isTrue(flag))");
    });
    test('a parameter with no call site in the program keeps object', () => {
        const input =
        "class T {\n" +
        method("f", "flag: boolean", "        if (flag) { return 1; }\n        return 0;\n") +
        "}";
        const output = transpiler.transpileCSharp(input).content;
        expect(output).toContain("public virtual object f(object flag)");
        expect(output).toContain("if (isTrue(flag))");
    });
});

describe('csharp native Promise.all -> Task.WhenAll', () => {
    const head =
        "interface Ticker { id: string }\n" +
        "class Test {\n" +
        "    async fetchA (x: number): Promise<{ [key: string]: any }> { return {}; }\n" +
        "    async fetchB (x: number): Promise<{ [key: string]: any }> { return {}; }\n" +
        "    async dictList (x: number): Promise<{ [key: string]: any }[]> { return []; }\n" +
        "    async ticker (x: number): Promise<Ticker> { return { 'id': 'x' }; }\n";
    test('dict calls become typed task locals the helper no longer waits on', () => {
        const ts = head +
        "    async f (): Promise<void> {\n" +
        "        const r = await Promise.all ([ this.fetchA (1), this.fetchB (2) ]);\n" +
        "    }\n" +
        "}";
        const output = transpiler.transpileCSharp(ts).content;
        expect(output).not.toContain('promiseAll(');
        expect(output).toMatch(/var hxauTask\d+_\d+ = this\.fetchA\(1\);/);
        expect(output).toMatch(/var hxauTask\d+_\d+ = this\.fetchB\(2\);/);
        expect(output).toMatch(/await Task\.WhenAll\(hxauTask\d+_\d+, hxauTask\d+_\d+\);/);
        expect(output).toContain('List<object> r = new List<object> { ');
        expect(output).toMatch(/\.Result, hxauTask\d+_\d+\.Result \};/);
    });
    test('a const local feeding the list is declared as its concrete Task', () => {
        const ts = head +
        "    async f (): Promise<void> {\n" +
        "        const a = this.dictList (3);\n" +
        "        const b = this.dictList (4);\n" +
        "        const r = await Promise.all ([ a, b ]);\n" +
        "    }\n" +
        "}";
        const output = transpiler.transpileCSharp(ts).content;
        expect(output).not.toContain('promiseAll(');
        expect(output).toContain('var a = this.dictList(3);');
        expect(output).toContain('await Task.WhenAll(a, b);');
        expect(output).toContain('List<object> r = new List<object> { a.Result, b.Result };');
    });
    test('a destructured result keeps the holder-and-index shape', () => {
        const ts = head +
        "    async f (): Promise<void> {\n" +
        "        const a = this.dictList (3);\n" +
        "        const b = this.dictList (4);\n" +
        "        const [ first, second ] = await Promise.all ([ a, b ]);\n" +
        "    }\n" +
        "}";
        const output = transpiler.transpileCSharp(ts).content;
        expect(output).not.toContain('promiseAll(');
        expect(output).toContain('List<object> firstsecondVariable = new List<object> { a.Result, b.Result };');
        expect(output).toContain('var first = ((IList<object>) firstsecondVariable)[0];');
        expect(output).toContain('var second = ((IList<object>) firstsecondVariable)[1];');
    });
    test('a struct-typed value the helper de-types keeps the helper', () => {
        const ts = head +
        "    async f (): Promise<void> {\n" +
        "        const r = await Promise.all ([ this.ticker (1), this.ticker (2) ]);\n" +
        "    }\n" +
        "}";
        const output = transpiler.transpileCSharp(ts).content;
        expect(output).toContain('promiseAll(');
        expect(output).not.toContain('Task.WhenAll');
    });
    test('one unprovable element keeps the whole list on the helper', () => {
        const ts = head +
        "    async f (flag: boolean): Promise<void> {\n" +
        "        let a = this.dictList (3);\n" +
        "        a = this.dictList (4);\n" +
        "        const r = await Promise.all ([ a, this.fetchA (5) ]);\n" +
        "    }\n" +
        "}";
        const output = transpiler.transpileCSharp(ts).content;
        expect(output).toContain('promiseAll(');
        expect(output).not.toContain('Task.WhenAll');
    });
    test('a list argument that is not an array literal keeps the helper', () => {
        const ts = head +
        "    async f (promises: any[]): Promise<void> {\n" +
        "        const r = await Promise.all (promises);\n" +
        "    }\n" +
        "}";
        const output = transpiler.transpileCSharp(ts).content;
        expect(output).toContain('promiseAll(');
        expect(output).not.toContain('Task.WhenAll');
    });
});

describe('csharp native Promise.all over mixed Task types', () => {
    const head =
        "class Test {\n" +
        "    async fetchA (x: number): Promise<{ [key: string]: any }> { return {}; }\n" +
        "    async fetchList (x: number): Promise<{ [key: string]: any }[]> { return []; }\n" +
        "    async fetchVoid (): Promise<void> { }\n" +
        "    async fetchAny (x: number) { return x; }\n";
    test('a discarded result waits natively on any mix of resolved this-call tasks', () => {
        const ts = head +
        "    async f (): Promise<void> {\n" +
        "        await Promise.all ([ this.fetchA (1), this.fetchVoid (), this.fetchAny (2) ]);\n" +
        "    }\n" +
        "}";
        const output = transpiler.transpileCSharp(ts).content;
        expect(output).not.toContain('promiseAll(');
        expect(output).toContain('await Task.WhenAll(new Task[] {this.fetchA(1), this.fetchVoid(), this.fetchAny(2)});');
    });
    test('a discarded result with an unresolved or non-task element keeps the helper', () => {
        const ts = head +
        "    async f (other: any): Promise<void> {\n" +
        "        await Promise.all ([ this.fetchA (1), other.thing () ]);\n" +
        "    }\n" +
        "}";
        const output = transpiler.transpileCSharp(ts).content;
        expect(output).toContain('promiseAll(');
        expect(output).not.toContain('Task.WhenAll');
    });
    test('a used result of a mixed list keeps the helper', () => {
        const ts = head +
        "    async f (): Promise<void> {\n" +
        "        const r = await Promise.all ([ this.fetchA (1), this.fetchList (2) ]);\n" +
        "    }\n" +
        "}";
        const output = transpiler.transpileCSharp(ts).content;
        expect(output).not.toContain('Task.WhenAll(new Task[]');
    });
});

describe('csharp destructured Promise.all slots over un-annotated any tasks', () => {
    const head =
        "class Test {\n" +
        "    async fetchAny (x: any) { const r: any = x; return r; }\n" +
        "    async fetchTyped (x: any): Promise<string> { return 'a'; }\n";
    test('each slot is read from its own Task<object> local after one WhenAll', () => {
        const ts = head +
        "    async f (): Promise<void> {\n" +
        "        const p1 = this.fetchAny (1);\n" +
        "        const p2 = this.fetchAny (2);\n" +
        "        const [ a, b ] = await Promise.all ([ p1, p2 ]);\n" +
        "        console.log (a, b);\n" +
        "    }\n" +
        "}";
        const output = transpiler.transpileCSharp(ts).content;
        expect(output).not.toContain('promiseAll(');
        expect(output).toContain('Task<object> p1 = this.fetchAny(1);');
        expect(output).toContain('Task<object> p2 = this.fetchAny(2);');
        expect(output).toContain('await Task.WhenAll(p1, p2);');
        expect(output).toContain('var a = await p1;');
        expect(output).toContain('var b = await p2;');
    });
    test('a task local read again elsewhere keeps the helper', () => {
        const ts = head +
        "    async f (): Promise<void> {\n" +
        "        const p1 = this.fetchAny (1);\n" +
        "        const p2 = this.fetchAny (2);\n" +
        "        const [ a, b ] = await Promise.all ([ p1, p2 ]);\n" +
        "        await p1;\n" +
        "    }\n" +
        "}";
        const output = transpiler.transpileCSharp(ts).content;
        expect(output).toContain('promiseAll(');
        expect(output).not.toContain('Task.WhenAll');
    });
    test('an annotated Promise<string> task is a typed Task<string>, which the slots arm leaves to the helper', () => {
        const ts = head +
        "    async f (): Promise<void> {\n" +
        "        const p1 = this.fetchTyped (1);\n" +
        "        const p2 = this.fetchAny (2);\n" +
        "        const [ a, b ] = await Promise.all ([ p1, p2 ]);\n" +
        "    }\n" +
        "}";
        const output = transpiler.transpileCSharp(ts).content;
        expect(output).not.toContain('Task<object> p1');
    });
});

describe('csharp native Promise.all negative shapes', () => {
    const head =
        "class Test {\n" +
        "    async fetchA (x: number): Promise<{ [key: string]: any }> { return {}; }\n" +
        "    async dictList (x: number): Promise<{ [key: string]: any }[]> { return []; }\n";
    test('a let-bound result keeps the helper (a later write would not fit List<object>)', () => {
        const ts = head +
        "    async f (): Promise<void> {\n" +
        "        let r = await Promise.all ([ this.fetchA (1), this.fetchA (2) ]);\n" +
        "        r = [];\n" +
        "    }\n" +
        "}";
        const output = transpiler.transpileCSharp(ts).content;
        expect(output).toContain('promiseAll(');
        expect(output).not.toContain('Task.WhenAll');
    });
    test('a single-element list keeps the helper (WhenAll overload is ambiguous for one Task<T>)', () => {
        const ts = head +
        "    async f (): Promise<void> {\n" +
        "        const r = await Promise.all ([ this.fetchA (1) ]);\n" +
        "    }\n" +
        "}";
        const output = transpiler.transpileCSharp(ts).content;
        expect(output).toContain('promiseAll(');
        expect(output).not.toContain('Task.WhenAll');
    });
});

describe('csharp native Promise.all reaches every body shape', () => {
    const head =
        "type Dict = { [key: string]: any };\n" +
        "class Test {\n" +
        "    async a (q: string[], p: Dict = {}): Promise<Dict[]> { return []; }\n" +
        "    async b (q: string[], p: Dict = {}): Promise<Dict[]> { return []; }\n";
    test('a method with parameters prints its body statement by statement, the list still goes native', () => {
        const ts = head +
        "    async f (q: string[], rest: Dict): Promise<void> {\n" +
        "        const r = await Promise.all ([ this.a (q, rest), this.b (q, rest) ]);\n" +
        "    }\n" +
        "}";
        const output = transpiler.transpileCSharp(ts).content;
        expect(output).not.toContain('promiseAll(');
        expect(output).toContain('await Task.WhenAll(');
    });
    test('a nested block plans its own statements', () => {
        const ts = head +
        "    async f (n: number, q: string[], rest: Dict): Promise<void> {\n" +
        "        if (n > 0) {\n" +
        "            const r = await Promise.all ([ this.a (q, rest), this.b (q, rest) ]);\n" +
        "            rest['rows'] = r;\n" +
        "        }\n" +
        "    }\n" +
        "}";
        const output = transpiler.transpileCSharp(ts).content;
        expect(output).not.toContain('promiseAll(');
        expect(output).toContain('await Task.WhenAll(');
    });
});

describe('csharp native Promise.all keeps the helper for typed map aliases', () => {
    test('a Dict alias whose values are all any goes native', () => {
        const ts = "type Dict<Value = any> = { [key: string]: Value };\n" +
        "class Test {\n" +
        "    async a (p: Dict = {}): Promise<Dict> { return {}; }\n" +
        "    async f (): Promise<void> {\n" +
        "        const r = await Promise.all ([ this.a ({}), this.a ({}) ]);\n" +
        "    }\n" +
        "}";
        const output = transpiler.transpileCSharp(ts).content;
        expect(output).not.toContain('promiseAll(');
        expect(output).toContain('await Task.WhenAll(');
    });
    test('a typed map alias (values hold a struct) keeps the helper', () => {
        const ts = "interface Currency { id: string }\n" +
        "type Currencies = { [key: string]: Currency };\n" +
        "class Test {\n" +
        "    async a (p: object = {}): Promise<Currencies> { return {}; }\n" +
        "    async f (): Promise<void> {\n" +
        "        const r = await Promise.all ([ this.a ({}), this.a ({}) ]);\n" +
        "    }\n" +
        "}";
        const output = transpiler.transpileCSharp(ts).content;
        expect(output).toContain('promiseAll(');
        expect(output).not.toContain('Task.WhenAll');
    });
});

describe ('csharp isEqual / inOp over typed operands', () => {
    const transpiler = new Transpiler();
    const printer = () => (transpiler as any).csharpTranspiler;
    // the embedding build layer answers csharpExpressionTypeResolver
    // for the locals it prints with its own C# type: the reads are then already those types
    const cs = (input: string, types: { [name: string]: string } = {}) => {
        const target = printer();
        target.csharpExpressionTypeResolver = (node) => types[node?.text];
        try {
            return transpiler.transpileCSharp(input).content;
        } finally {
            target.csharpExpressionTypeResolver = undefined;
        }
    };
    const DICT = 'type Dict = { [key: string]: any };\n';

    describe('csharp isEqual over printed numeric arithmetic and hand-written number fields', () => {
        test('an integer modulo an integer literal prints the operator', () => {
            const output = cs(
            "class A {\n" +
            "    run (params: Dict) {\n" +
            "        const i = this.safeInteger(params, 'i');\n" +
            "        if ((i % 2) === 0) { return 1; }\n" +
            "        if ((i % 2) !== 0) { return 2; }\n" +
            "        return 0;\n" +
            "    }\n" +
            "}\n", { i: 'int' });
            expect(output).toContain('((Int64)i % 2L == 0)');
            expect(output).toContain('((Int64)i % 2L != 0)');
            expect(output).not.toContain('isEqual(');
        });
        test('a modulo that still prints the mod helper keeps isEqual', () => {
            const output = cs(
            "class A {\n" +
            "    run (params: Dict) {\n" +
            "        const msInt = this.safeInteger(params, 'ms');\n" +
            "        const week = this.safeInteger(params, 'w');\n" +
            "        if ((msInt % week) === 0) { return 1; }\n" +
            "        return 0;\n" +
            "    }\n" +
            "}\n", { msInt: 'Int64', week: 'Int64' });
            expect(output).toContain('if (((msInt % week) == 0))');
        });
        test('a literal the integer kind cannot hold keeps the helper', () => {
            const output = cs(
            "class A {\n" +
            "    run (params: Dict) {\n" +
            "        const i = this.safeInteger(params, 'i');\n" +
            "        if ((i % 2) === 0.5) { return 1; }\n" +
            "        return 0;\n" +
            "    }\n" +
            "}\n", { i: 'int' });
            expect(output).toContain('isEqual(');
        });
        test('a hand-written double field against a literal prints the operator', () => {
            const output = cs(
            "class A {\n" +
            "    rateLimit: number = 2000;\n" +
            "    rollingWindowSize: number = 0;\n" +
            "    run () {\n" +
            "        if (this.rateLimit === -1) { return 1; }\n" +
            "        if (this.rollingWindowSize === 0) { return 2; }\n" +
            "        return 0;\n" +
            "    }\n" +
            "}\n");
            expect(output).toContain('(this.rateLimit == -1)');
            expect(output).toContain('(this.rollingWindowSize == 0)');
            expect(output).not.toContain('isEqual(');
        });
        test('an object-boxed field keeps the helper', () => {
            const output = cs(
            "class A {\n" +
            "    precisionMode: any = 2;\n" +
            "    run () {\n" +
            "        if (this.precisionMode === 2) { return 1; }\n" +
            "        return 0;\n" +
            "    }\n" +
            "}\n");
            expect(output).toContain('isEqual(');
        });
        test('an object-typed local keeps the helper', () => {
            const output = cs(
            "class A {\n" +
            "    run (x: any) {\n" +
            "        if ((x % 2) === 0) { return 1; }\n" +
            "        return 0;\n" +
            "    }\n" +
            "}\n");
            expect(output).toContain('isEqual(');
        });
    });

    describe('csharp inOp on `this.headers`', () => {
        test('the printer leaves the site to the build layer (which emits the null guard)', () => {
            // the embedding build layer prints this site natively WITH the helper's null test (inOp
            // answers false for a null receiver); a printer-table entry would drop that guard
            const output = cs(DICT +
            "class A {\n" +
            "    headers: Dict = {};\n" +
            "    run () {\n" +
            "        if ('x-simulated-trading' in this.headers) { return 1; }\n" +
            "        return 0;\n" +
            "    }\n" +
            "}\n");
            expect(output).toContain('inOp(this.headers, "x-simulated-trading")');
        });
    });

    // the build layer types a numeric declaration (`Int64 week = (7 * day)`) without answering for the
    // later read, so the equality rule asks the declaration itself: getCSharpLocalType is the function
    // that printed the `<type> <name> =` prefix
    const csDeclared = (input: string, types: { [name: string]: string }, declared: { [name: string]: string }) => {
        const target = printer();
        target.csharpExpressionTypeResolver = (node) => types[node?.text];
        const original = target.getCSharpLocalType;
        target.getCSharpLocalType = (declaration) => declared[declaration?.name?.text] ?? original.call(target, declaration);
        try {
            return transpiler.transpileCSharp(input).content;
        } finally {
            target.csharpExpressionTypeResolver = undefined;
            target.getCSharpLocalType = original;
        }
    };

    describe('csharp isEqual over printed arithmetic against a declaration-typed number', () => {
        test('an Int64 remainder against a declared int local prints the operator', () => {
            const output = csDeclared(
            DICT +
            "class A {\n" +
            "    run (params: Dict) {\n" +
            "        const i = this.safeInteger(params, 'i');\n" +
            "        const n = this.safeInteger(params, 'n');\n" +
            "        if (i % 2 === n) { return 1; }\n" +
            "        return 0;\n" +
            "    }\n" +
            "}\n", { i: 'int' }, { n: 'int' });
            expect(output).toContain('== n)');
            expect(output).not.toContain('isEqual(');
        });
        test('an Int64 remainder against a declared Int64 local prints the operator', () => {
            const output = csDeclared(
            DICT +
            "class A {\n" +
            "    run (params: Dict) {\n" +
            "        const i = this.safeInteger(params, 'i');\n" +
            "        const n = this.safeInteger(params, 'n');\n" +
            "        if (i % 2 !== n) { return 1; }\n" +
            "        return 0;\n" +
            "    }\n" +
            "}\n", { i: 'int' }, { n: 'Int64?' });
            expect(output).toContain('!= n)');
            expect(output).not.toContain('isEqual(');
        });
        test('a declared double local keeps the helper (isEqual truncates, the operator does not)', () => {
            const output = csDeclared(
            DICT +
            "class A {\n" +
            "    run (params: Dict) {\n" +
            "        const i = this.safeInteger(params, 'i');\n" +
            "        const n = this.safeNumber(params, 'n');\n" +
            "        if (i % 2 === n) { return 1; }\n" +
            "        return 0;\n" +
            "    }\n" +
            "}\n", { i: 'int' }, { n: 'double' });
            expect(output).toContain('isEqual(');
        });
        test('an object-declared local keeps the helper', () => {
            const output = csDeclared(
            DICT +
            "class A {\n" +
            "    run (params: Dict) {\n" +
            "        const i = this.safeInteger(params, 'i');\n" +
            "        const n = this.safeValue(params, 'n');\n" +
            "        if (i % 2 === n) { return 1; }\n" +
            "        return 0;\n" +
            "    }\n" +
            "}\n", { i: 'int' }, {});
            expect(output).toContain('isEqual(');
        });
    });
});

describe ('csharp base dictionary views', () => {

    const config = {
        'verbose': false,
        'csharp': { 'parser': WRAPPED_PARSER }
    };

    // a class declaring the hand-written base members the way ts/src/base/Exchange.ts does
    const klass = (body: string, params = 'code: string') => [
        'class Exchange {',
        '    urls: any;',
        '    requiredCredentials: any;',
        '    currencies: any;',
        '    positions: any;',
        '    other: any;',
        `    f (${params}) {`,
        body,
        '    }',
        '}',
    ].join('\n');

    const printed = (body: string, params?: string): string => new Transpiler(config).transpileCSharp(klass(body, params)).content;

    const API_WS = '(this.urlsApi != null && this.urlsApi.ContainsKey("ws") ? this.urlsApi["ws"] : null)';

    describe('csharp typed views of the hand-written base dictionaries', () => {
        test('urls[\'api\'][literal] reads the urlsApi view instead of getValue', () => {
            const out = printed('        const a = this.urls[\'api\'][\'ws\'];\n        return a;');
            expect(out).toContain(`object a = ${API_WS};`);
            expect(out).not.toContain('getValue(');
        });

        test('an `as` assertion and parentheses around urls[\'api\'] print as the operand', () => {
            const out = printed('        const a = (this.urls[\'api\'] as any)[\'ws\'];\n        return a;');
            expect(out).toContain(`object a = ${API_WS};`);
        });

        test('a string-declared key keeps the helper\'s key test, an untyped key casts like GetValue', () => {
            const local = printed('        const key = \'k\' + \'1\';\n        return this.urls[\'api\'][key];');
            expect(local).toContain('(this.urlsApi != null && key != null && this.urlsApi.ContainsKey(key) ? this.urlsApi[key] : null)');
            const param = printed('        return this.currencies[code];');
            expect(param).toContain('(this.currenciesDict != null && code != null && this.currenciesDict.ContainsKey((string)code) ? this.currenciesDict[(string)code] : null)');
        });

        test('currencies and requiredCredentials: Object.keys and `in` use the typed member', () => {
            const out = printed('        const keys = Object.keys (this.currencies);\n        const names = Object.keys (this.requiredCredentials);\n        return [ keys, names, \'x\' in this.currencies, \'y\' in this.requiredCredentials ];');
            expect(out).toContain('new List<object>(this.currenciesDict.Keys)');
            expect(out).toContain('new List<object>(this.requiredCredentials.Keys)');
            expect(out).toContain('(this.currenciesDict != null && this.currenciesDict.ContainsKey("x"))');
            expect(out).toContain('(this.requiredCredentials != null && this.requiredCredentials.ContainsKey("y"))');
            expect(out).not.toContain('(IDictionary<string,object>)this.');
            expect(out).not.toContain('inOp(');
        });

        test('a declared IDictionary member is its own receiver for writes (no identity cast)', () => {
            const out = printed('        this.requiredCredentials[\'apiKey\'] = code;');
            expect(out).toContain('this.requiredCredentials["apiKey"] = ');
            expect(out).not.toContain('(IDictionary<string,object>)this.requiredCredentials');
        });

        test('members without a declared dictionary view keep the helper and the cast', () => {
            const positions = printed('        return this.positions[code];');
            expect(positions).toContain('getValue(this.positions, code)');
            expect(positions).not.toContain('IDictionary');
            const other = printed('        return this.urls[\'test\'][\'ws\'];');
            expect(other).not.toContain('urlsApi');
            const nonLiteralSection = printed('        return this.urls[code][\'ws\'];');
            expect(nonLiteralSection).not.toContain('urlsApi');
            const numeric = printed('        return this.currencies[code];', 'code: number');
            expect(numeric).toContain('getValue(this.currencies, code)');
        });

        test('a write target and a delete are never rewritten to the view', () => {
            const out = printed('        this.currencies[\'BTC\'] = code;\n        delete this.currencies[\'ETH\'];');
            expect(out).not.toContain('currenciesDict');
        });
    });
});

describe ('csharp declared string index reads', () => {

    const config = {
        'verbose': false,
        'csharp': { 'parser': WRAPPED_PARSER }
    };

    // `declared` answers csharpStringReceiverType, the hook the embedding build layer fills with the
    // type its retyped declaration carries
    function printed(source: string, declared?: string): string {
        const transpiler = new Transpiler(config);
        if (declared !== undefined) {
            (transpiler as any).csharpTranspiler.csharpStringReceiverType = (receiver: any) => (receiver?.text === 'id' ? declared : undefined);
        }
        return transpiler.transpileCSharp(source).content;
    }

    const body = (lines: string) => 'class T {\n    f (id: string, rows: any, i: number) {\n' + lines + '\n    }\n}';

    describe('csharp literal-index read on a declared string local', () => {
        test('a string? receiver reads through the indexer with the helper null and range tests', () => {
            const out = printed(body('        return id[0];'), 'string?');
            expect(out).toContain('(id != null && 0 < id.Length ? id[0].ToString () : null)');
            expect(out).not.toContain('getValue(id, 0)');
        });

        test('a string receiver and a larger literal index', () => {
            expect(printed(body('        return id[3];'), 'string')).toContain('(id != null && 3 < id.Length ? id[3].ToString () : null)');
        });

        test('an object-declared or unknown receiver keeps the helper', () => {
            expect(printed(body('        return id[0];'))).toContain('getValue(id, 0)');
            expect(printed(body('        return id[0];'), 'object')).toContain('getValue(id, 0)');
            expect(printed(body('        return id[0];'), 'List<object>')).not.toContain('.ToString ()');
        });

        test('a non-literal index, a string key and a foreign receiver keep the helper', () => {
            expect(printed(body('        return id[i];'), 'string?')).not.toContain('.ToString ()');
            expect(printed(body('        return id[\'a\'];'), 'string?')).not.toContain('.Length');
            expect(printed(body('        return rows[0];'), 'string?')).not.toContain('.Length');
        });

        test('a write target keeps its printed form', () => {
            const out = printed(body('        id[0] = \'x\';'), 'string?');
            expect(out).not.toContain('.Length');
        });
    });
});

describe ('csharp element-row local suite', () => {

    const config = {
        'verbose': false,
        'csharp': { 'parser': WRAPPED_PARSER }
    };

    function printed(source: string, enabled: boolean): string {
        const transpiler = new Transpiler(config);
        if (enabled) {
            (transpiler as any).csharpTranspiler.csharpElementRowLocalSource = () => true;
        }
        return transpiler.transpileCSharp(source).content;
    }

    const HEAD = 'IDictionary<string, object> row = ((IDictionary<string, object>)getValue(list, i));';

    const body = (lines: string) => 'class T {\n    f (list, i) {\n' + lines + '\n    }\n}';

    describe('csharp element-row locals', () => {
        test('a row read only through string keys declares the dictionary', () => {
            const ts = body('        const row = list[i];\n        const a = row[\'a\'];\n        row[\'b\'] = 1;\n        return a;');
            expect(printed(ts, true)).toContain(HEAD);
            expect(printed(ts, false)).toContain('object row = getValue(list, i);');
        });

        test('a safe* reader and a null test count as dictionary uses', () => {
            const ts = body('        const row = list[i];\n        if (row !== undefined) {\n            return this.safeString (row, \'a\');\n        }\n        return row[\'b\'];');
            expect(printed(ts, true)).toContain(HEAD);
        });

        test('a use that is not a dictionary read keeps object', () => {
            for (const use of [ 'return row;', 'return row[0];', 'return this.foo (row);', 'return row + 1;', 'row = list[0];' ]) {
                const ts = body('        let row = list[i];\n        const a = row[\'a\'];\n        ' + use);
                expect(printed(ts, true)).not.toContain('IDictionary<string, object> row');
            }
        });

        test('a string-keyed initializer, a non-read local and the market names keep object', () => {
            expect(printed(body('        const row = list[\'k\'];\n        return row[\'a\'];'), true)).not.toContain('IDictionary<string, object> row');
            expect(printed(body('        const row = list[i];\n        return 1;'), true)).not.toContain('IDictionary<string, object> row');
            expect(printed(body('        const market = list[i];\n        return market[\'a\'];'), true)).not.toContain('IDictionary<string, object> market');
        });

        test('a member-cache element read (this.orderbooks[sym]) is left to the host families', () => {
            const ts = body('        const row = this.orderbooks[i];\n        return row[\'a\'];');
            expect(printed(ts, true)).not.toContain('IDictionary<string, object> row');
        });

        test('a second binding of the name keeps object', () => {
            const ts = body('        const row = list[i];\n        const a = row[\'a\'];\n        if (a) {\n            const row = list[0];\n            return row[\'c\'];\n        }\n        return a;');
            expect(printed(ts, true)).not.toContain('IDictionary<string, object> row');
        });

        test('the source predicate decides per file', () => {
            const transpiler = new Transpiler(config);
            (transpiler as any).csharpTranspiler.csharpElementRowLocalSource = () => false;
            const ts = body('        const row = list[i];\n        return row[\'a\'];');
            expect(transpiler.transpileCSharp(ts).content).toContain('object row = getValue(list, i);');
        });

        test('without a host hook the default source rule keeps virtual (non ts/src) files on object', () => {
            const transpiler = new Transpiler(config);
            const ts = body('        const row = list[i];\n        return row[\'a\'];');
            expect(transpiler.transpileCSharp(ts).content).toContain('object row = getValue(list, i);');
        });
    });
});

describe ('csharp nullable state fields', () => {

    // Hand-written BaseExchange fields declared in cs/ccxt/base/Exchange.Options.cs as
    // `IDictionary<string, object> fees|requiredCredentials` and `List<object> accounts` stay null until
    // initializeProperties stores the describe() row, so a native read carries the helper's null test.
    const config = {
        'verbose': false,
        'csharp': { 'parser': WRAPPED_PARSER }
    };

    // the build layer answers the declared C# type of a local through
    // csharpLocalTypeOf; this stands in for it: the loop counter `i` is an int, `key` a string?
    const DECLARED: { [name: string]: any } = {
        'fees': { type: 'IDictionary<string, object>', initializer: 'new dict()' },
        'requiredCredentials': { type: 'IDictionary<string, object>', initializer: 'new dict()' },
        'accounts': { type: 'List<object>', initializer: 'new List<object>()' },
    };
    function printed(lines: string): string {
        const source = 'class BaseExchange {\n    fees: any; requiredCredentials: any; accounts: any[];\n    f (key: string | undefined) {\n' + lines + '\n    }\n}';
        const transpiler = new Transpiler(config);
        (transpiler as any).csharpTranspiler.csharpLocalTypeOf = (node: any) => ({ 'i': 'int', 'key': 'string?' } as any)[node.text];
        // the member rules read the declared C# type of the hand-written members (Exchange.Options.cs);
        // the fixture declares the same three members, the expectations below are unchanged
        (transpiler as any).csharpTranspiler.csharpDeclaredMemberType = (owner: string, name: string) => (owner === 'this' ? DECLARED : {} as any)[name];
        return transpiler.transpileCSharp(source).content;
    }

    describe('csharp nullable hand-written state fields', () => {
        test('a literal key on a dictionary field is a guarded ContainsKey read', () => {
            const out = printed('        const a = this.fees[\'trading\'];\n        const b = this.requiredCredentials[\'apiKey\'];\n        return [ a, b ];');
            expect(out).toContain('(this.fees != null && this.fees.ContainsKey(\"trading\") ? this.fees[\"trading\"] : null)');
            expect(out).toContain('(this.requiredCredentials != null && this.requiredCredentials.ContainsKey(\"apiKey\") ? this.requiredCredentials[\"apiKey\"] : null)');
        });

        test('a literal index on the list field is a guarded Count read', () => {
            const out = printed('        return this.accounts[0];');
            expect(out).toContain('(this.accounts != null && 0 < this.accounts.Count ? this.accounts[0] : null)');
        });

        test('an int loop counter indexes the list field, the length is the null-conditional count', () => {
            const out = printed('        for (let i = 0; i < this.accounts.length; i++) {\n            const account = this.accounts[i];\n        }');
            expect(out).toContain('(this.accounts?.Count ?? 0)');
            expect(out).toContain('(this.accounts != null && i < this.accounts.Count ? this.accounts[i] : null)');
        });

        test('a string-typed key on the dictionary field carries the key null test', () => {
            const out = printed('        const key = this.safeString ({}, \'k\');\n        return this.requiredCredentials[key];');
            expect(out).toContain('this.requiredCredentials != null && key != null && this.requiredCredentials.ContainsKey(key) ? this.requiredCredentials[key] : null');
        });

        test('`in` on a dictionary field tests the receiver for null', () => {
            const out = printed('        return \'BTC\' in this.requiredCredentials;');
            expect(out).toContain('(this.requiredCredentials != null && this.requiredCredentials.ContainsKey(\"BTC\"))');
        });

        test('shapes with no native twin keep the helper', () => {
            const out = printed('        const a = this.accounts[\'x\'];\n        const b = this.fees[0];\n        const c = this.positions[\'x\'];\n        return [ a, b, c ];');
            expect(out).toContain('getValue(this.accounts, \"x\")');
            expect(out).toContain('getValue(this.fees, 0)');
            expect(out).not.toContain('this.accounts.ContainsKey');
            expect(out).not.toContain('this.fees.Count');
        });
    });
});

describe ('csharp Promise.all over the implicit API', () => {

    // `await Promise.all (list)` whose every element is the Task<T> of an implicit-API endpoint
    // (a method of the generated ts/src/abstract/<ex>.ts class) with ONE plain T prints a List<Task<T>> and
    // awaits it with Task.WhenAll; T comes from the endpoint's declared Promise<...> type.
    describe('csharp promiseAll over implicit-API tasks -> Task.WhenAll', () => {
        const TMP = path.join(__dirname, 'files', 'tmp-csharp-promiseall-implicit-api');
        const BASE = path.join(TMP, 'ts', 'src', 'base', 'Exchange.ts');
        const ABSTRACT = path.join(TMP, 'ts', 'src', 'abstract', 'x.ts');
        const VENUE = path.join(TMP, 'ts', 'src', 'v.ts');
        let out: string;

        beforeAll(() => {
            fs.mkdirSync(path.dirname(BASE), { recursive: true });
            fs.mkdirSync(path.dirname(ABSTRACT), { recursive: true });
            fs.writeFileSync(BASE,
                "export type Dict = { [key: string]: any };\n" +
                "export type List = any[];\n" +
                "export class T {\n" +
                "    request(path: any, api: any, method: any, params: any, config: any): Promise<any> { return undefined as any; }\n" +
                "    extend(...args: any[]): any { return {}; }\n" +
                "}\n");
            fs.writeFileSync(ABSTRACT,
                "import { T, Dict, List } from '../base/Exchange.js';\n" +
                "export abstract class X extends T {\n" +
                "    publicGetA (params = {}): Promise<Dict> { return this.request ('a', 'public', 'GET', params, {}); }\n" +
                "    publicGetB (params = {}): Promise<Dict> { return this.request ('b', 'public', 'GET', params, {}); }\n" +
                "    publicGetL (params = {}): Promise<List> { return this.request ('l', 'public', 'GET', params, {}); }\n" +
                "    publicGetU (params = {}): Promise<Dict | List> { return this.request ('u', 'public', 'GET', params, {}); }\n" +
                "}\n");
            fs.writeFileSync(VENUE,
                "import { X } from './abstract/x.js';\n" +
                "import { List } from './base/Exchange.js';\n" +
                "export class V extends X {\n" +
                "    async own (params = {}): Promise<List> { return []; }\n" +
                // 1: a literal of two dict endpoints
                "    async literal (params = {}): Promise<any> {\n" +
                "        const r = await Promise.all ([ this.publicGetL (params), this.publicGetL (params) ]);\n" +
                "        return r;\n" +
                "    }\n" +
                // 2: a list filled by push in a loop
                "    async pushed (params = {}): Promise<any> {\n" +
                "        const promises = [];\n" +
                "        for (let i = 0; i < 2; i++) {\n" +
                "            promises.push (this.publicGetL (params));\n" +
                "        }\n" +
                "        const responses = await Promise.all (promises);\n" +
                "        for (let i = 0; i < responses.length; i++) {\n" +
                "            this.extend (responses[i], {});\n" +
                "        }\n" +
                "        return responses;\n" +
                "    }\n" +
                // 3: task locals read nowhere else, destructured result
                "    async locals (params = {}): Promise<any> {\n" +
                "        const a = this.publicGetL (params);\n" +
                "        const b = this.publicGetL (params);\n" +
                "        const [ first, second ] = await Promise.all ([ a, b ]);\n" +
                "        return [ first, second ];\n" +
                "    }\n" +
                // 4: a union endpoint keeps the widest T, the way the generated api spells it
                "    async union (params = {}): Promise<any> {\n" +
                "        const r = await Promise.all ([ this.publicGetU (params), this.publicGetU (params) ]);\n" +
                "        return r;\n" +
                "    }\n" +
                "    async dictAu03 (params = {}): Promise<any> {\n" +
                "        const r = await Promise.all ([ this.publicGetA (params), this.publicGetB (params) ]);\n" +
                "        return r;\n" +
                "    }\n" +
                // negatives
                "    async mixed (params = {}): Promise<any> {\n" +
                "        const r = await Promise.all ([ this.publicGetL (params), this.publicGetU (params) ]);\n" +
                "        return r;\n" +
                "    }\n" +
                "    async ownMethod (params = {}): Promise<any> {\n" +
                "        const r = await Promise.all ([ this.own (params), this.own (params) ]);\n" +
                "        return r;\n" +
                "    }\n" +
                "    async escapes (params = {}): Promise<any> {\n" +
                "        const promises = [];\n" +
                "        promises.push (this.publicGetL (params));\n" +
                "        this.extend (promises, {});\n" +
                "        const r = await Promise.all (promises);\n" +
                "        return r;\n" +
                "    }\n" +
                "    async localReadTwice (params = {}): Promise<any> {\n" +
                "        const a = this.publicGetL (params);\n" +
                "        this.extend (a, {});\n" +
                "        const r = await Promise.all ([ a, this.publicGetL (params) ]);\n" +
                "        return r;\n" +
                "    }\n" +
                "    async letResult (params = {}): Promise<any> {\n" +
                "        let r = await Promise.all ([ this.publicGetL (params), this.publicGetL (params) ]);\n" +
                "        r = [];\n" +
                "        return r;\n" +
                "    }\n" +
                "    async notAList (promises: any, params = {}): Promise<any> {\n" +
                "        const r = await Promise.all (promises);\n" +
                "        return r;\n" +
                "    }\n" +
                "}\n");
            const byPath = new Transpiler({ 'verbose': false, 'csharp': { 'parser': PLAIN_PARSER } });
            out = byPath.transpileCSharpByPath(VENUE).content;
        });

        afterAll(() => {
            fs.rmSync(TMP, { recursive: true, force: true });
        });

        // the text of one printed method
        const method = (name: string): string => {
            const start = out.indexOf(' ' + name + '(');
            expect(start).toBeGreaterThan(-1);
            const next = out.indexOf('\n    public ', start + 1);
            return out.substring(start, next < 0 ? out.length : next);
        };

        test('a literal of list endpoints awaits through a typed List<Task<T>>', () => {
            const body = method('literal');
            expect(body).toContain('List<object> r = new List<object>(await Task.WhenAll(new List<Task<List<object>>> {this.publicGetL(parameters), this.publicGetL(parameters)}));');
            expect(body).not.toContain('promiseAll(');
        });

        test('a list filled by push is declared with the task type and awaited natively', () => {
            const body = method('pushed');
            expect(body).toContain('List<Task<List<object>>> promises = new List<Task<List<object>>>() {};');
            expect(body).toContain('promises.Add(this.publicGetL(parameters));');
            expect(body).toContain('new List<object>(await Task.WhenAll(promises))');
            expect(body).not.toContain('promiseAll(');
            expect(body).not.toContain('((IList<object>)promises)');
        });

        test('task locals feeding the list are declared as their Task<T>', () => {
            const body = method('locals');
            expect(body).toContain('Task<List<object>> a = this.publicGetL(parameters);');
            expect(body).toContain('Task<List<object>> b = this.publicGetL(parameters);');
            expect(body).toContain('new List<object>(await Task.WhenAll(new List<Task<List<object>>>() {a, b}))');
            expect(body).not.toContain('promiseAll(');
        });

        test('a dict endpoint stays with the Promise.all task-local plan', () => {
            const body = method('dictAu03');
            expect(body).toMatch(/await Task\.WhenAll\(hxauTask\d+_\d+, hxauTask\d+_\d+\);/);
            expect(body).not.toContain('List<Task<');
        });

        test('a union endpoint keeps the widest task type', () => {
            const body = method('union');
            expect(body).toContain('new List<object>(await Task.WhenAll(new List<Task<object>> {this.publicGetU(parameters), this.publicGetU(parameters)}))');
        });

        test.each([ 'mixed', 'ownMethod', 'escapes', 'localReadTwice', 'letResult', 'notAList' ])('%s keeps the helper', (name) => {
            const body = method(name);
            expect(body).toContain('promiseAll(');
            expect(body).not.toContain('Task.WhenAll');
        });
    });
});

describe ('Int64 for-counters and literal-default shadows', () => {

    const config: any = {
        'verbose': false,
        'csharp': {
            'parser': WRAPPED_PARSER,
            'numericArgTypes': { 'fetchOHLCV': { 2: 'Int64?', 3: 'Int64?' } },
            'coreArgShadowCallees': [ 'fetchPaginatedCallDeterministic', 'parseOHLCVs' ]
        }
    };

    const printer = (source: string, resolver: boolean): string => {
        const transpiler: any = new Transpiler(config);
        if (resolver) {
            // the build layer's declared-kind answers: `maxLimit` is an int local
            const kinds: any = { 'maxLimit': 'int' };
            transpiler.csharpTranspiler.csharpExpressionTypeResolver = (node: any) => (node.kind === SyntaxKind.Identifier) ? kinds[node.text] : undefined;
        }
        return transpiler.transpileCSharp(source).content;
    };

    const counters =
        'class Exchange {\n' +
        '    strip (text: string, xs: any, d: any) {\n' +
        '        const chars = this.stringToCharsArray (text);\n' +
        '        for (let i = 0; i < chars.length; i++) {\n' +
        '            const ch = chars[i];\n' +
        '            const prev = (i > 0) && chars[i - 1];\n' +
        '        }\n' +
        '        for (let j = 1; j < 3; j++) {\n' +
        '            const key = String (j);\n' +
        '        }\n' +
        '        for (let k = 0; k < 3; k++) {\n' +
        '            const v = this.safeString (d, k);\n' +
        '        }\n' +
        '        for (let z = 0; z < 3; z++) {\n' +
        '            const w = this.safeString (d, \'a\', z);\n' +
        '        }\n' +
        '        for (let m = 0; m < 3; m++) {\n' +
        '            xs[m] = 1;\n' +
        '        }\n' +
        '        for (let n = 0; n < 3; n += 2) {\n' +
        '            const a = chars[n];\n' +
        '        }\n' +
        '        for (let q = 0; q < 3; q++) {\n' +
        '            q = q + 1;\n' +
        '        }\n' +
        '    }\n' +
        '}';

    describe('Int64 for-counter in the printer', () => {
        test('a literal counter whose reads normalise the box is declared Int64 with a native increment', () => {
            const out = printer(counters, false);
            expect(out).toContain('for (Int64 i = 0; ');
            expect(out).toContain('; i++)');
            expect(out).not.toContain('postFixIncrement(ref i)');
            expect(out).toContain('for (Int64 k = 0;');
        });

        test('a counter read as a string key, a compound step, an element write or a rewrite keeps the object helper form', () => {
            const out = printer(counters, false);
            expect(out).toContain('for (object j = 1; ');
            expect(out).toContain('postFixIncrement(ref j)');
            expect(out).toContain('postFixIncrement(ref m)');
            expect(out).toContain('for (object q = 0;');
            expect(out).not.toContain('for (Int64 n');
            expect(out).toContain('postFixIncrement(ref z)');
        });
    });

    const shadow =
        'class Exchange {\n' +
        '    fetchOHLCV (symbol: string, timeframe: string = \'1m\', since: number = undefined, limit: number = 100, params = {}) {\n' +
        '        const maxLimit = 1000;\n' +
        '        const r = (limit === undefined) ? 10000 : Math.min (limit, 10000);\n' +
        '        const p = this.parseOHLCVs ([], symbol, timeframe, since, limit);\n' +
        '        return r;\n' +
        '    }\n' +
        '    fetchOHLCV2 (symbol: string, since: number = undefined, limit: number = 100, params = {}) {\n' +
        '        const r = (limit === undefined) ? 10000 : Math.min (limit, 10000);\n' +
        '        return r;\n' +
        '    }\n' +
        '    fetchTicker (symbol: string, since: number = undefined, limit: number = 100, params = {}) {\n' +
        '        const r = (limit === undefined) ? 10000 : Math.min (limit, 10000);\n' +
        '        return r;\n' +
        '    }\n' +
        '    fetchOrders (symbol: string, since: number = undefined, limit: number = 100, params = {}) {\n' +
        '        const r = (limit === undefined) ? 10000 : Math.min (limit, 10000) + this.foo (limit);\n' +
        '        return r;\n' +
        '    }\n' +
        '}';

    describe('literal-default limit shadow proven on the AST', () => {
        test('without the build layer tables the helper stays', () => {
            const transpiler: any = new Transpiler({ 'verbose': false, 'csharp': { 'parser': PLAIN_PARSER } });
            const out = transpiler.transpileCSharp(shadow).content;
            expect(out).toContain('mathMin(limit, 10000)');
        });

        test('a narrowed Int64? limit position whose every use is an identity read unboxes under its null test', () => {
            const out = printer(shadow, true);
            expect(out).toContain('Math.Min(limit.Value, 10000)');
        });

        test('a position the table does not narrow, or a use outside the allowlist, keeps the helper', () => {
            const out = printer(shadow, true);
            const lines = out.split('\n').filter((l) => l.includes('mathMin') || l.includes('Math.Min'));
            expect(lines.length).toBe(4);
            expect(lines.filter((l) => l.includes('mathMin(limit, 10000)')).length).toBe(3);
            expect(lines.filter((l) => l.includes('Math.Min(limit.Value, 10000)')).length).toBe(1);
        });
    });
});

describe ('csharp nullable scalar locals', () => {

    const config: any = { 'verbose': false, 'csharp': { 'parser': WRAPPED_PARSER } };

    const transpile = (ts: string): string => new Transpiler(config).transpileCSharp(ts).content;

    describe('C# nullable scalar locals from safe* signatures', () => {
        test('safeNumber / safeNumber2 name the base signature `double?`', () => {
            const output = transpile(
                "class Exchange {\n" +
                "    safeNumber(o, k, d?) { return o; }\n" +
                "    safeNumber2(o, k1, k2, d?) { return o; }\n" +
                "    run (item) {\n" +
                "        let cost = this.safeNumber(item, 'cost');\n" +
                "        return cost;\n" +
                "    }\n" +
                "    other (item) {\n" +
                "        let rate = this.safeNumber2(item, 'a', 'b');\n" +
                "        return rate;\n" +
                "    }\n" +
                "}");
            expect(output).toContain('double? cost = this.safeNumber(item, "cost");');
            expect(output).toContain('double? rate = this.safeNumber2(item, "a", "b");');
        });

        test('a later write of the non-null twin keeps the nullable scalar type', () => {
            const output = transpile(
                "class Exchange {\n" +
                "    safeString(o, k, d?) { return o; }\n" +
                "    run (item) {\n" +
                "        let tag = this.safeString(item, 'tag');\n" +
                "        if (tag === undefined) {\n" +
                "            tag = 'default';\n" +
                "        }\n" +
                "        return tag;\n" +
                "    }\n" +
                "}");
            expect(output).toContain('string? tag = this.safeString(item, "tag");');
            expect(output).toContain('tag = "default";');
        });

        test('a null write and a widened numeric literal keep the nullable scalar type', () => {
            const output = transpile(
                "class Exchange {\n" +
                "    safeInteger(o, k, d?) { return o; }\n" +
                "    run (item) {\n" +
                "        let n = this.safeInteger(item, 'n');\n" +
                "        n = null;\n" +
                "        n = 0;\n" +
                "        return n;\n" +
                "    }\n" +
                "}");
            expect(output).toContain('Int64? n = this.safeInteger(item, "n");');
            expect(output).toContain('n = null;');
            expect(output).toContain('n = 0;');
        });

        test('a copy from a local the printer already declares that type is a keep', () => {
            const output = transpile(
                "class Exchange {\n" +
                "    safeString(o, k, d?) { return o; }\n" +
                "    run (item) {\n" +
                "        let first = this.safeString(item, 'a');\n" +
                "        let second = this.safeString(item, 'b');\n" +
                "        second = first;\n" +
                "        return second;\n" +
                "    }\n" +
                "}");
            expect(output).toContain('string? first = this.safeString(item, "a");');
            expect(output).toContain('string? second = this.safeString(item, "b");');
            expect(output).toContain('second = first;');
        });

        test('a write of an unproven box still blocks the declaration', () => {
            const output = transpile(
                "class Exchange {\n" +
                "    safeString(o, k, d?) { return o; }\n" +
                "    safeValue(o, k, d?) { return o; }\n" +
                "    run (item) {\n" +
                "        let tag = this.safeString(item, 'tag');\n" +
                "        tag = this.safeValue(item, 'other');\n" +
                "        return tag;\n" +
                "    }\n" +
                "}");
            expect(output).toContain('object tag = this.safeString(item, "tag");');
        });

        test('a null-guarded `+` left read of a string? local folds to native concatenation', () => {
            const output = transpile(
                "class Exchange {\n" +
                "    safeString(o, k, d?) { return o; }\n" +
                "    run (item) {\n" +
                "        let apiUrl = this.safeString(item, 'url');\n" +
                "        if (apiUrl === undefined) {\n" +
                "            throw new ExchangeError('no url');\n" +
                "        }\n" +
                "        return apiUrl + '/ticker';\n" +
                "    }\n" +
                "}");
            expect(output).toContain('string? apiUrl = this.safeString(item, "url");');
            expect(output).toContain('return (apiUrl + "/ticker");');
            expect(output).not.toContain('add(apiUrl');
        });

        test('the same read inside a `x !== undefined && …` conjunction folds too', () => {
            const output = transpile(
                "class Exchange {\n" +
                "    safeString(o, k, d?) { return o; }\n" +
                "    run (item, flag) {\n" +
                "        let host = this.safeString(item, 'host');\n" +
                "        if (host !== undefined && flag) {\n" +
                "            return host + '/x';\n" +
                "        }\n" +
                "        return undefined;\n" +
                "    }\n" +
                "}");
            expect(output).toContain('string? host = this.safeString(item, "host");');
            expect(output).toContain('return (host + "/x");');
        });

        test('a ternary arm guarded by a null test folds too', () => {
            const output = transpile(
                "class Exchange {\n" +
                "    safeString(o, k, d?) { return o; }\n" +
                "    run (item) {\n" +
                "        let baseId = this.safeString(item, 'baseId');\n" +
                "        return baseId === undefined ? undefined : baseId + 'SUSDT';\n" +
                "    }\n" +
                "}");
            expect(output).toContain('string? baseId = this.safeString(item, "baseId");');
            expect(output).toContain('(baseId + "SUSDT")');
        });

        test('an unguarded `+` left read stays object', () => {
            const output = transpile(
                "class Exchange {\n" +
                "    safeString(o, k, d?) { return o; }\n" +
                "    run (item) {\n" +
                "        let part = this.safeString(item, 'part');\n" +
                "        return part + '/';\n" +
                "    }\n" +
                "}");
            expect(output).toContain('object part = this.safeString(item, "part");');
            expect(output).toContain('part == null ? null : part + "/"');
        });

        test('a guarded read whose right operand is not a printed string stays object', () => {
            const output = transpile(
                "class Exchange {\n" +
                "    safeString(o, k, d?) { return o; }\n" +
                "    run (item, rest) {\n" +
                "        let head = this.safeString(item, 'head');\n" +
                "        if (head === null) {\n" +
                "            return undefined;\n" +
                "        }\n" +
                "        return head + rest;\n" +
                "    }\n" +
                "}");
            expect(output).toContain('object head = this.safeString(item, "head");');
            expect(output).toContain('head == null ? null : head + (string)(object)(rest)');
        });

        test('a null write never claims a non-null string declaration (the ccxt layer promotes it)', () => {
            const output = transpile(
                "class Exchange {\n" +
                "    run (value) {\n" +
                "        let side = 'long';\n" +
                "        if (value) {\n" +
                "            side = 'short';\n" +
                "        }\n" +
                "        side = undefined;\n" +
                "        return side;\n" +
                "    }\n" +
                "}");
            expect(output).toContain('object side = "long";');
            expect(output).toContain('side = null;');
        });

        test('a guarded numeric local stays a nullable scalar (no concat)', () => {
            const output = transpile(
                "class Exchange {\n" +
                "    safeInteger(o, k, d?) { return o; }\n" +
                "    run (item) {\n" +
                "        let n = this.safeInteger(item, 'n');\n" +
                "        if (n === undefined) {\n" +
                "            return 0;\n" +
                "        }\n" +
                "        return n;\n" +
                "    }\n" +
                "}");
            expect(output).toContain('Int64? n = this.safeInteger(item, "n");');
        });
    });
});

describe ('csharp add on non-null strings', () => {

    const config: any = { 'verbose': false, 'csharp': { 'parser': WRAPPED_PARSER } };

    const transpile = (ts: string): string => new Transpiler(config).transpileCSharp(ts).content;

    describe('`add` on a proven non-null string operand', () => {
        test('a local held a non-null string keeps its type across self-concat writes', () => {
            const output = transpile(
                "class Exchange {\n" +
                "    build (underlying, targetPrice) {\n" +
                "        let bs = underlying.toUpperCase();\n" +
                "        if (targetPrice) {\n" +
                "            bs = bs + '_ABOVE_' + targetPrice;\n" +
                "        }\n" +
                "        return bs + ':';\n" +
                "    }\n" +
                "}");
            expect(output).toContain('string bs = ((string)underlying).ToUpper();');
            expect(output).toContain('bs = ((bs + "_ABOVE_") + targetPrice);');
            expect(output).toContain('return (bs + ":");');
            expect(output).not.toContain('add(bs');
        });

        test('`+=` on that local prints the native concat too', () => {
            const output = transpile(
                "class Exchange {\n" +
                "    build (expiry) {\n" +
                "        let tag = 'x';\n" +
                "        tag += '_' + expiry;\n" +
                "        return tag;\n" +
                "    }\n" +
                "}");
            expect(output).toContain('string tag = "x";');
            expect(output).toContain('tag = (tag + (("_" + expiry)));');
            expect(output).not.toContain('add(tag');
        });

        test('a nullable string local stays object and keeps the helper', () => {
            const output = transpile(
                "class Exchange {\n" +
                "    safeString(a, b) { return a; }\n" +
                "    build (item, other) {\n" +
                "        let tag = this.safeString(item, 'tag');\n" +
                "        tag = tag + '_x';\n" +
                "        return tag + other;\n" +
                "    }\n" +
                "}");
            expect(output).toContain("object tag = this.safeString(item, \"tag\");");
            expect(output).toContain('tag = add(tag, "_x");');
            expect(output).toContain("return add(tag, other);");
        });

        test('a local written from an unproven operand stays object', () => {
            const output = transpile(
                "class Exchange {\n" +
                "    build (value, other) {\n" +
                "        let tag = 'x';\n" +
                "        tag = value;\n" +
                "        return tag + other;\n" +
                "    }\n" +
                "}");
            expect(output).toContain('object tag = "x";');
            expect(output).toContain('add(tag, other)');
        });

        test('a literal and a string-returning call are non-null string operands on either side', () => {
            const output = transpile(
                "class Exchange {\n" +
                "    json(a) { return a; }\n" +
                "    build (item, count) {\n" +
                "        return 'id:' + count + this.json(item) + '!';\n" +
                "    }\n" +
                "}");
            expect(output).toContain('return ((("id:" + count) + this.json(item)) + "!");');
            expect(output).not.toContain('add(');
        });

        test('a conditional whose arms are both non-null strings is one too', () => {
            const output = transpile(
                "class Exchange {\n" +
                "    build (flag, value) {\n" +
                "        let label = flag ? 'YES' : 'NO';\n" +
                "        label += value;\n" +
                "        return label;\n" +
                "    }\n" +
                "}");
            expect(output).toContain('string label = isTrue(flag) ? "YES" : "NO";');
            expect(output).toContain('label = (label + (value));');
        });

        test('an unproven left keeps the helper even with a string right', () => {
            const output = transpile(
                "class Exchange {\n" +
                "    build (a, b) {\n" +
                "        return a + b + 'suffix';\n" +
                "    }\n" +
                "}");
            expect(output).toContain('add(add(a, b), "suffix")');
        });
    });
});

describe ('csharp base-tier list parameters', () => {

    // A base-tier method (ts/src/base/*.ts, printed alone) types its array parameter from the
    // declared TS type; its overrides and in-program calls follow it.
    describe('csharp base-tier array parameters', () => {
        const TMP = path.join(__dirname, 'files', 'tmp-csharp-base-tier-array-parameters');
        const BASE = path.join(TMP, 'ts', 'src', 'base', 'Exchange.ts');
        const VENUE = path.join(TMP, 'ts', 'src', 'venue.ts');
        let base: string;
        let venue: string;

        beforeAll(() => {
            fs.mkdirSync(path.dirname(BASE), { recursive: true });
            fs.writeFileSync(BASE,
                'export class Exchange {\n' +
                '    arraysConcat (arraysOfArrays: any[]): any[] {\n' +
                '        let result: any[] = [];\n' +
                '        for (let i = 0; i < arraysOfArrays.length; i++) {\n' +
                '            result = this.arrayConcat (result, arraysOfArrays[i]);\n' +
                '        }\n' +
                '        return result;\n' +
                '    }\n' +
                '    arrayConcat (a: any[], b: any[]): any[] { return a; }\n' +
                '    ids (symbols: string[]): number { return symbols.length; }\n' +
                '    rewrites (items: any[]): any[] {\n' +
                '        items = [];\n' +
                '        return items;\n' +
                '    }\n' +
                '    marketsForSymbols (symbols: string[] = undefined): any[] { return []; }\n' +
                '    fetchThing (x: any): any { return x; }\n' +
                '}\n');
            fs.writeFileSync(VENUE,
                "import { Exchange } from './base/Exchange';\n" +
                'export class Venue extends Exchange {\n' +
                '    override marketsForSymbols (symbols: any = undefined): any[] { return []; }\n' +
                '    caller (box: any): any {\n' +
                '        return this.ids (box);\n' +
                '    }\n' +
                '}\n');
            const transpiler = new Transpiler({ 'verbose': false, 'csharp': { 'parser': WRAPPED_PARSER } });
            base = (transpiler as any).transpileCSharpByPath(BASE).content;
            venue = (transpiler as any).transpileCSharpByPath(VENUE).content;
        });

        afterAll(() => {
            fs.rmSync(TMP, { recursive: true, force: true });
        });

        test('an array-annotated base parameter prints IList<object> and its reads go native', () => {
            expect(base).toContain('arraysConcat(IList<object> arraysOfArrays)');
            expect(base).toContain('(arraysOfArrays?.Count ?? 0)');
            expect(base).not.toContain('getArrayLength(arraysOfArrays)');
        });

        test('a string[] base parameter prints IList<object> too', () => {
            expect(base).toContain('ids(IList<object> symbols)');
        });

        test('a parameter the body rebinds keeps object', () => {
            expect(base).toContain('rewrites(object items)');
        });

        test('a non-array parameter keeps object', () => {
            expect(base).toContain('fetchThing(object x)');
        });

        test('an override with a looser annotation follows the base spelling', () => {
            expect(venue).toContain('marketsForSymbols(IList<object> symbols = null)');
        });

        test('an object argument to a base-typed parameter is converted at the call', () => {
            expect(venue).toContain('this.ids(this.toArray(box))');
        });
    });
});

describe ('csharp declared member types', () => {

    // native dictionary / list operations on hand-written base members and ws client maps are keyed on the
    // member's DECLARED C# type (csharpDeclaredMemberType, read from the hand-written .cs files); the fixture
    // declares the same members, and the baseline run installs no hook and keeps every helper call.

    const config = {
        'verbose': false,
        'csharp': { 'parser': WRAPPED_PARSER }
    };

    const THIS: { [name: string]: any } = {
        'urls': { type: 'IDictionary<string, object>', initializer: 'new dict()', views: { api: { view: 'urlsApi', sections: 'urlsApiSections' } }, refresh: 'RefreshUrlsViews' },
        'headers': { type: 'IDictionary<string, object>', initializer: 'new dict()' },
        'fees': { type: 'IDictionary<string, object>', initializer: 'new dict()' },
        'accounts': { type: 'List<object>', initializer: 'new List<object>()' },
        'positions': { type: 'object' },
        'currencies': { type: 'object', initializer: 'new dict()' },
    };
    const CLIENT: { [name: string]: any } = {
        'subscriptions': { type: 'OwnedTable<object>' },
    };

    function printed(source: string, hooked: boolean, members: any = THIS): string {
        const transpiler = new Transpiler(config);
        const csharp: any = (transpiler as any).csharpTranspiler;
        if (hooked) {
            csharp.csharpDeclaredMemberType = (owner: string, name: string) => (owner === 'this' ? members : CLIENT)[name];
            csharp.csharpDeclaredMethodReturnType = (name: string) => (name === 'isDictionary' ? 'bool' : undefined);
        }
        return transpiler.transpileCSharp(source).content;
    }

    const BASE = 'class BaseExchange {\n'
        + '    urls!: { api: any, [key: string]: any };\n'
        + '    headers: any; fees: any; accounts!: any[]; positions: any; currencies: any;\n'
        + '    isDictionary (value: any): boolean { return true; }\n';
    const CLIENT_CLASS = 'class Client { subscriptions: any; }\n';

    describe('csharp declared hand-written members', () => {
        test('a dictionary member reads, tests and sizes through its own declared type', () => {
            const ts = BASE + '    f (k: string) { const a = this.urls["x"]; if ("test" in this.headers) { return 1; } const b = this.fees[k]; return [a, b]; }\n}';
            const out = printed(ts, true);
            expect(out).toContain('object a = (this.urls != null && this.urls.ContainsKey("x") ? this.urls["x"] : null);');
            expect(out).toContain('if ((this.headers != null && this.headers.ContainsKey("test")))');
            expect(out).toContain('this.fees.ContainsKey((string)k) ? this.fees[(string)k] : null);');
            expect(printed(ts, false)).toContain('getValue(this.fees, k)');
        });

        test('a list member reads by index and length with the helper null branches', () => {
            const ts = BASE + '    f () { for (let i = 0; i < this.accounts.length; i++) { const a = this.accounts[i]; } return this.accounts[0]; }\n}';
            const out = printed(ts, true);
            expect(out).toContain('(this.accounts?.Count ?? 0)');
            expect(out).toContain('(this.accounts != null && 0 < this.accounts.Count ? this.accounts[0] : null)');
            expect(printed(ts, false)).toContain('getArrayLength(this.accounts)');
            expect(printed(ts, false)).toContain('getValue(this.accounts, 0)');
        });

        test('an object member whose every write stores a dictionary takes the dictionary form behind one cast', () => {
            const ts = BASE + '    f (type: string) { if (this.positions === undefined) { this.positions = {}; } if (type in this.positions) { return 1; } return 0; }\n}';
            const out = printed(ts, true);
            expect(out).toContain('(((IDictionary<string,object>)this.positions) != null && type is string inOpKey0 && ((IDictionary<string,object>)this.positions).ContainsKey(inOpKey0))');
            expect(printed(ts, false)).toContain('inOp(this.positions, type)');
        });

        test('an object member written with a non-dictionary box keeps the helper', () => {
            const ts = BASE + '    f (type: string) { this.currencies = new ArrayCache (); if (type in this.currencies) { return 1; } return 0; }\n}\nclass ArrayCache {}';
            expect(printed(ts, true)).toContain('inOp(this.currencies, type)');
        });

        test('the cast around a member declared as the dictionary interface is an identity and is not printed', () => {
            const ts = BASE + '    f () { const a = this.urls["x"]; this.urls["y"] = a; delete this.urls["z"]; }\n}';
            const out = printed(ts, true);
            expect(out).not.toContain('(IDictionary<string,object>)this.urls');
            expect(out).toContain('this.urls["y"] = a;');
            expect(printed(ts, false)).toContain('((IDictionary<string,object>)this.urls)["y"] = a;');
        });

        test('a ws client map read goes through the declared map type', () => {
            const ts = CLIENT_CLASS + BASE + '    f (client: Client, hash: string) { if (hash in client.subscriptions) { return 1; } return 0; }\n}';
            const out = printed(ts, true);
            expect(out).toContain('(client.subscriptions != null && hash is string inOpKey0 && client.subscriptions.ContainsKey(inOpKey0))');
            expect(printed(ts, false)).toContain('inOp(client.subscriptions, hash)');
        });

        test('a call to a hand-written bool callee loses the isTrue wrapper only when the declared return is bool', () => {
            const ts = BASE + '    f (v: any) { if (this.isDictionary(v)) { return 1; } return 0; }\n}';
            expect(printed(ts, true)).toContain('if (this.isDictionary(v))');
            const transpiler = new Transpiler(config);
            const csharp: any = (transpiler as any).csharpTranspiler;
            csharp.csharpDeclaredMethodReturnType = (name: string) => (name === 'isDictionary' ? 'object' : undefined);
            expect(transpiler.transpileCSharp(ts).content).toContain('if (isTrue(this.isDictionary(v)))');
        });

        test('a section read through the declared views uses the typed sections and a write refreshes them', () => {
            const ts = BASE + '    f (type: string) { const u = this.urls["api"]["ws"]["public"]; this.urls["api"] = u; return u; }\n}';
            const out = printed(ts, true);
            expect(out).toContain('(this.urlsApiSections.ContainsKey("ws") && this.urlsApiSections["ws"].ContainsKey("public") ? this.urlsApiSections["ws"]["public"] : null)');
            expect(out).toContain('this.urls["api"] = u;\n        this.RefreshUrlsViews();');
            const base = printed(ts, false);
            expect(base).not.toContain('urlsApiSections');
            expect(base).not.toContain('RefreshUrlsViews');
            const noViews = printed(ts, true, { ...THIS, urls: { type: 'IDictionary<string, object>', initializer: 'new dict()' } });
            expect(noViews).not.toContain('urlsApiSections');
            expect(noViews).not.toContain('RefreshUrlsViews');
        });

        test('a nested write below an entry owes no refresh and a comparison is no write', () => {
            const ts = BASE + '    f () { this.urls["api"]["ws"] = 1; if (this.urls === undefined) { return 1; } return 0; }\n}';
            const out = printed(ts, true);
            expect(out).not.toContain('RefreshUrlsViews');
        });
        test('a const omit of a declared dictionary member names the dictionary and a nullable-string key is tested', () => {
            const ts = BASE + '    f (k: string | undefined) { const rest = this.omit (this.urls, \'x\'); this.urls = rest; if (k in this.headers) { return 1; } return 0; }\n    omit (a: any, b: any): any { return a; }\n}';
            const out = printed(ts, true);
            expect(out).toContain('Dictionary<string, object> rest = this.omit(this.urls, "x");');
            expect(printed(ts, false)).toContain('object rest = this.omit(this.urls, "x");');
            const noHook = printed(ts, true, { ...THIS, urls: { type: 'object', initializer: 'new dict()' } });
            expect(noHook).toContain('object rest = this.omit(this.urls, "x");');
        });
    });
});

describe ('csharp JSON.parse native deserialization', () => {

    const config = { 'verbose': false, 'csharp': { 'parser': PLAIN_PARSER } };
    const print = (src: string) => new Transpiler(config).transpileCSharp(src).content;

    describe('csharp JSON.parse on a string-declared read', () => {
        test('a string local calls the deserializer directly', () => {
            const out = print('class T {\n    f () {\n        const s = \'{}\';\n        return JSON.parse (s);\n    }\n}');
            expect(out).toContain('JsonHelper.Deserialize(s)');
        });
        test('an untyped parameter keeps the helper', () => {
            const out = print('class T {\n    f (s) {\n        return JSON.parse (s);\n    }\n}');
            expect(out).toContain('parseJson(s)');
            expect(out).not.toContain('JsonHelper');
        });
    });
});

describe ('csharp declared member views', () => {

    // a declared typed view of a hand-written base member
    // answers the member's reads natively, and a string-typed `object` local concatenates natively.

    const config = {
        'verbose': false,
        'csharp': { 'parser': WRAPPED_PARSER }
    };

    const THIS: { [name: string]: any } = {
        'urls': { type: 'IDictionary<string, object>', initializer: 'new dict()', views: { api: { view: 'urlsApi' } } },
        'urlsApi': { type: 'IDictionary<string, object>' },
        'currencies': { type: 'object', initializer: 'new dict()', dictView: 'currenciesDict' },
        'currenciesDict': { type: 'IDictionary<string, object>' },
        'currencies_by_id': { type: 'IDictionary<string, object>' },
    };

    function printed(source: string, hooked: boolean, members: any = THIS): string {
        const transpiler = new Transpiler(config);
        const csharp: any = (transpiler as any).csharpTranspiler;
        if (hooked) {
            csharp.csharpDeclaredMemberType = (owner: string, name: string) => (owner === 'this' ? members[name] : undefined);
        }
        return transpiler.transpileCSharp(source).content;
    }

    const BASE = 'class BaseExchange {\n'
        + '    urls!: { api: any, [key: string]: any };\n'
        + '    currencies: any;\n'
        + '    currencies_by_id: any;\n'
        + '    safeString (a: any, b: any): string | undefined { return undefined; }\n';

    describe('declared member views and string-typed object concatenation', () => {
        test('urls["api"][key] reads through the declared urlsApi view', () => {
            const ts = BASE + '    f (type: string, other: any) { const a = this.urls["api"]["ws"]; const b = this.urls["api"][type]; const k = this.safeString (other, "k"); const d = this.urls["api"][k]; const c = this.urls["api"][other]; return [a, b, c, d]; }\n}';
            const out = printed(ts, true);
            expect(out).toContain('(this.urlsApi != null && this.urlsApi.ContainsKey("ws") ? this.urlsApi["ws"] : null)');
            expect(out).toContain('(this.urlsApi != null && type != null && this.urlsApi.ContainsKey((string)type) ? this.urlsApi[(string)type] : null)');
            expect(out).toContain('(this.urlsApi != null && k != null && this.urlsApi.ContainsKey(k) ? this.urlsApi[k] : null)');
            expect(out).toContain('(this.urlsApi != null && other != null && this.urlsApi.ContainsKey((string)other) ? this.urlsApi[(string)other] : null)');
        });

        test('an object member with a declared dictionary view reads and tests through the view', () => {
            const ts = BASE + '    f (code: string) { const a = this.currencies[code]; if (code in this.currencies) { return Object.keys (this.currencies); } return a; }\n}';
            const out = printed(ts, true);
            expect(out).toContain('(this.currenciesDict != null && code != null && this.currenciesDict.ContainsKey((string)code) ? this.currenciesDict[(string)code] : null)');
            expect(out).toMatch(/\(this\.currenciesDict != null && code is string inOpKey\d+ && this\.currenciesDict\.ContainsKey\(inOpKey\d+\)\)/);
            expect(out).toContain('this.currenciesDict.Keys');
        });

        test('a const alias of a member declared the dictionary interface is declared with it', () => {
            const ts = BASE + '    f (code: string) { const byId = this.currencies_by_id; if (code in byId) { return byId[code]; } return undefined; }\n}';
            const out = printed(ts, true);
            expect(out).toContain('IDictionary<string, object> byId = this.currencies_by_id;');
            expect(printed(ts, false)).toContain('object byId = this.currencies_by_id;');
        });

        test('a string-typed object local concatenates with the null test and an object right casts like the helper', () => {
            const ts = BASE + '    f (a: any, b: any) { const id = this.safeString (a, "id"); const key = id + "-" + b; let auth = this.safeString (a, "x"); auth += "?"; return [key, auth]; }\n}';
            const out = printed(ts, false);
            expect(out).toContain('((object)(id == null ? null : id + "-" + (string)(object)(b)))');
            expect(out).toContain('auth = ((object)(auth == null ? null : auth + "?"))');
        });

        test('a copy of a destructured string slot keeps the helper', () => {
            const ts = BASE + '    f (a: any) { const [ s, p ] = this.pair (a); let m = s; m = m + "x"; return [ m, p ]; }\n    pair (a: any): [ string | undefined, any ] { return [ undefined, a ]; }\n}';
            expect(printed(ts, false)).not.toContain('m == null');
        });

        test('a right operand with effects and a non-string left keep the helper', () => {
            const ts = BASE + '    f (a: any, n: number, m: any) { const id = this.safeString (a, "id"); const x = id + (n++); const y = n + 1; const z = m + "s"; return [x, y, z]; }\n}';
            const out = printed(ts, false);
            expect(out).toContain('add(id, ');
            expect(out).not.toContain('id == null');
            expect(out).toContain('add(m, "s")');
        });
    });
});

describe ('csharp bool parameters and bool-declared calls', () => {

    const config = { 'verbose': false, 'csharp': { 'parser': PLAIN_PARSER } };
    const print = (src: string) => new Transpiler(config).transpileCSharp(src).content;

    describe('csharp boolean parameter call-site proof', () => {
        test('an un-annotated `= false` parameter every caller feeds a bool prints bool?', () => {
            const out = print('class T {\n    f (flag = false) {\n        if (flag) { return 1; }\n        return 0;\n    }\n    g () {\n        return this.f (true);\n    }\n}');
            expect(out).toContain('f(bool? flag = null)');
            expect(out).toContain('if (flag == true)');
            expect(out).not.toContain('isTrue(flag)');
        });
        test('an un-annotated default fed by an object keeps the parameter object', () => {
            const out = print('class T {\n    f (flag = false) {\n        if (flag) { return 1; }\n        return 0;\n    }\n    g (x: any) {\n        const box = x[\'k\'];\n        return this.f (box);\n    }\n}');
            expect(out).toContain('f(object flag = null)');
            expect(out).toContain('isTrue(flag)');
        });
        test('this.spawn (this.method, args) counts as a call of the method', () => {
            const out = print('class T {\n    spawn (f, ...args) { return 1; }\n    load (client: any, flag: boolean) {\n        if (flag) { return 1; }\n        return 0;\n    }\n    g () {\n        return this.spawn (this.load, 1, true);\n    }\n}');
            expect(out).toContain('load(object client, bool? flag)');
        });
        test('a spawned argument the census cannot prove keeps the parameter object', () => {
            const out = print('class T {\n    spawn (f, ...args) { return 1; }\n    load (client: any, flag: boolean) {\n        if (flag) { return 1; }\n        return 0;\n    }\n    g (x: any) {\n        const box = x[\'k\'];\n        return this.spawn (this.load, 1, box);\n    }\n}');
            expect(out).toContain('load(object client, object flag)');
        });
        test('a local the build layer declares bool? is a proven argument', () => {
            const transpiler = new Transpiler(config);
            (transpiler as any).csharpTranspiler.csharpExpressionTypeResolver = (node) => ((node?.text === 'flag') && (node.parent?.kind !== undefined) && (node.parent.kind === 214 || true)) ? 'bool?' : undefined;
            const out = transpiler.transpileCSharp('class T {\n    f (flag: boolean) {\n        if (flag) { return 1; }\n        return 0;\n    }\n    g (params: any) {\n        const [ flag, rest ] = this.h (params);\n        return this.f (flag);\n    }\n    h (params: any): [boolean | undefined, any] {\n        return [ undefined, params ];\n    }\n}').content;
            expect(out).toContain('f(bool? flag)');
        });
    });

    describe('csharp bool-declared call typed in a subclass', () => {
        test('a local fed by an inherited bool-returning method is bool', () => {
            const out = print('class R {\n}\nclass A extends R {\n    isOk (): boolean {\n        return true;\n    }\n}\nclass B extends A {\n    f () {\n        const ok = this.isOk ();\n        if (ok) { return 1; }\n        return 0;\n    }\n}');
            expect(out).toContain('bool ok = this.isOk()');
            expect(out).toContain('if (ok)');
        });
    });

    describe('csharp bool-declared call on a root class', () => {
        test('a method inherited from a class with no parent keeps the object box', () => {
            const out = print('class A {\n    isOk (): boolean {\n        return true;\n    }\n}\nclass B extends A {\n    f () {\n        const ok = this.isOk ();\n        if (ok) { return 1; }\n        return 0;\n    }\n}');
            expect(out).toContain('object ok = this.isOk()');
        });
    });
});

describe ('csharp inferred collection return box', () => {

    const unique = [ 'pairOf', 'rowOf', 'chained', 'mixed', 'dictLiteral', 'asyncPair', 'overridden', 'noReturn', 'scalar' ];
    const makeConfig = (table: boolean): any => ({ 'verbose': false, 'csharp': { ...(table ? { 'uniqueMethodNames': unique } : {}), 'parser': WRAPPED_PARSER } });

    // a venue-local method declared once, annotated with a collection
    const source =
        "type Dict = { [key: string]: any };\n" +
        "type List = any[];\n" +
        "interface MarketInterface { id: string }\n" +
        "class Base {\n" +
        "    markets: any;\n" +
        "    safeDict (d: any, k: string, def: any = undefined): Dict { return d[k]; }\n" +
        "    safeString (d: any, k: string): string { return d[k]; }\n" +
        "    overridden (a: any): List { throw new Error ('x'); }\n" +
        "}\n" +
        "class Venue extends Base {\n" +
        "    pairOf (a: any, b: any): List {\n" +
        "        return [ a, b ];\n" +
        "    }\n" +
        "    rowOf (symbol: string): MarketInterface {\n" +
        "        const market = this.safeDict (this.markets, symbol);\n" +
        "        return market as MarketInterface;\n" +
        "    }\n" +
        "    chained (a: any): List {\n" +
        "        if (a) {\n" +
        "            return this.pairOf (a, a);\n" +
        "        }\n" +
        "        return [ a ];\n" +
        "    }\n" +
        "    mixed (a: any): List {\n" +
        "        if (a) {\n" +
        "            return [ a ];\n" +
        "        }\n" +
        "        return this.safeString (a, 'k') as any;\n" +
        "    }\n" +
        "    dictLiteral (a: any): Dict {\n" +
        "        return { 'a': a };\n" +
        "    }\n" +
        "    async asyncPair (a: any): Promise<List> {\n" +
        "        return [ a ];\n" +
        "    }\n" +
        "    override overridden (a: any): List {\n" +
        "        return [ a ];\n" +
        "    }\n" +
        "    twoDecls (a: any): List {\n" +
        "        return [ a ];\n" +
        "    }\n" +
        "    noReturn (a: any): List {\n" +
        "        throw new Error ('x');\n" +
        "    }\n" +
        "    scalar (a: any): string {\n" +
        "        return 'x';\n" +
        "    }\n" +
        "    user (symbol: string) {\n" +
        "        const p = this.pairOf (1, 2);\n" +
        "        const n = p.length;\n" +
        "        const m = this.rowOf (symbol);\n" +
        "        const z = this.mixed (1);\n" +
        "        return [ p, n, m, z ];\n" +
        "    }\n" +
        "}\n" +
        "class Other {\n" +
        "    twoDecls (a: any): List {\n" +
        "        return [ a ];\n" +
        "    }\n" +
        "}";

    const printed = (table: boolean): string => (new Transpiler(makeConfig(table)) as any).transpileCSharp(source).content;

    describe('inferred collection return box', () => {
        test('without the table every signature and local keeps the printer box', () => {
            const out = printed(false);
            expect(out).toContain('public virtual object pairOf(object a, object b)');
            expect(out).toContain('public virtual object rowOf(object symbol)');
            expect(out).toContain('object p = this.pairOf(1, 2);');
        });

        test('a method whose every return proves the box prints it, callers type their locals', () => {
            const out = printed(true);
            expect(out).toContain('public virtual List<object> pairOf(object a, object b)');
            expect(out).toContain('return new List<object>() {a, b};');
            expect(out).toContain('public virtual IDictionary<string, object> rowOf(object symbol)');
            expect(out).toContain('return market;');
            expect(out).toContain('public virtual List<object> chained(object a)');
            expect(out).toContain('List<object> p = this.pairOf(1, 2);');
            expect(out).toContain('IDictionary<string, object> m = this.rowOf(symbol);');
            expect(out).toContain('int n = getArrayLength(p);');
            expect(out).not.toContain('((List<object>)((object)(');
        });

        test('an unproven return path, async, override, unlisted name and missing return keep object', () => {
            const out = printed(true);
            expect(out).toContain('public virtual object mixed(object a)');
            expect(out).toContain('object z = this.mixed(1);');
            expect(out).toContain('public virtual object dictLiteral(object a)');
            expect(out).toMatch(/public (async )?virtual Task<object> asyncPair/);
            expect(out).toContain('public override object overridden(object a)');
            expect(out).toMatch(/public virtual object twoDecls\(object a\)/);
            expect(out).toContain('public virtual object noReturn(object a)');
            expect(out).toContain('public virtual string? scalar(object a)');
        });
    });
});

describe ('csharp native mod / Math.Min / Math.Max', () => {

    const config: any = { 'verbose': false, 'csharp': { 'parser': WRAPPED_PARSER } };

    // declared C# kinds the consumer's resolver answers for identifier reads
    const kinds: any = { 'x': 'Int64', 'y': 'Int64', 'n': 'Int64?', 'k': 'int', 'm': 'int', 'd': 'double', 'o': 'object', 'i': 'Int64' };

    const source =
        "class Exchange {\n" +
        "    mods (x: number, y: number, n: number, o: any, d: number) {\n" +
        "        const a = x % y;\n" +
        "        const b = 1000 % x;\n" +
        "        const c = n % y;\n" +
        "        const e = x % 0;\n" +
        "        const f = 5 % 3;\n" +
        "        const g = x % 7;\n" +
        "        const h = o % y;\n" +
        "        const j = d % y;\n" +
        "    }\n" +
        "    minmax (x: number, y: number, k: number, m: number, n: number, d: number, o: any) {\n" +
        "        const a = Math.min (x, y);\n" +
        "        const b = Math.max (x, 100);\n" +
        "        const c = Math.min (100, k);\n" +
        "        const e = Math.min (d, 100);\n" +
        "        const f = Math.min (o, 100);\n" +
        "        const g = Math.min (3, 100);\n" +
        "        const h = Math.min (n, 100);\n" +
        "        const p = (n === undefined) ? 100 : Math.min (n, 100);\n" +
        "        const q = (n !== undefined) && Math.max (n, 1);\n" +
        "        if (n !== undefined) {\n" +
        "            const r = Math.min (n, 100);\n" +
        "        }\n" +
        "        const s = Math.min (x, y).toString ();\n" +
        "        const t = Math.min (x, k);\n" +
        "        const u = Math.min (k, 3000000000);\n" +
        "    }\n" +
        "    rebound (n: number) {\n" +
        "        if (n !== undefined) {\n" +
        "            n = undefined;\n" +
        "            const r = Math.min (n, 100);\n" +
        "        }\n" +
        "    }\n" +
        "}";

    const printer = (hook: boolean): string => {
        const transpiler: any = new Transpiler(config);
        if (hook) {
            transpiler.csharpTranspiler.csharpExpressionTypeResolver = (node: any) => (node.kind === SyntaxKind.Identifier) ? kinds[node.text] : undefined;
        }
        return transpiler.transpileCSharp(source).content;
    };

    describe('native mod / Math.Min / Math.Max on declared integral operands', () => {
        test('without declared kinds every call keeps the helper', () => {
            const out = printer(false);
            expect(out).toContain('mod(x, y)');
            expect(out).toContain('mathMin(x, y)');
            expect(out).toContain('mathMax(x, 100)');
            expect(out).toContain('mathMin(100, k)');
        });

        test('mod over Int64 / Int64? / literal operands prints the lifted remainder', () => {
            const out = printer(true);
            expect(out).toContain('(x % y)');
            expect(out).toContain('(1000 % x)');
            expect(out).toContain('(n % y)');
        });

        test('mod keeps the helper for a zero divisor, two literals, a small literal divisor and non-Int64 operands', () => {
            const out = printer(true);
            expect(out).toContain('mod(x, 0)');
            expect(out).toContain('mod(5, 3)');
            expect(out).toContain('mod(x, 7)');
            expect(out).toContain('mod(o, y)');
            expect(out).toContain('mod(d, y)');
        });

        test('Math.min / Math.max over int / Int64 operands print Math.Min / Math.Max', () => {
            const out = printer(true);
            expect(out).toContain('Math.Min(x, y)');
            expect(out).toContain('Math.Max(x, 100)');
            expect(out).toContain('Math.Min(100, k)');
        });

        test('double, object, a receiver position and a long literal against an int keep the helper', () => {
            const out = printer(true);
            expect(out).toContain('mathMin(d, 100)');
            expect(out).toContain('mathMin(o, 100)');
            expect(out).toContain('((object)mathMin(x, y)).ToString()');
            expect(out).toContain('mathMin(k, 3000000000)');
        });

        test('an Int64? operand unboxes only under a dominating null test', () => {
            const out = printer(true);
            expect(out).toContain('mathMin(n, 100)'); // untested
            expect(out).toContain('? 100 : Math.Min(n.Value, 100)');
            expect(out).toContain('Math.Max(n.Value, 1)');
            expect(out).toContain('Math.Min(n.Value, 100);');
        });

        test('a null test does not dominate a read after the binding is rewritten', () => {
            const out = printer(true);
            const body = out.slice(out.indexOf('rebound'));
            expect(body).toContain('mathMin(n, 100)');
            expect(body).not.toContain('.Value');
        });
    });
});

describe ('csharp parseJson on a string-returning call', () => {

    // a callee whose emitted signature already returns a string
    // makes parseJson's `(string)` unbox an identity, so the deserializer is called on the call itself.
    describe('parseJson on a string-returning this-call', () => {
        const TMP = path.join(__dirname, 'files', 'tmp-csharp-parsejson');
        const VENUE = path.join(TMP, 'ts', 'src', 'v.ts');
        let out: string;

        beforeAll(() => {
            fs.mkdirSync(path.dirname(VENUE), { recursive: true });
            fs.writeFileSync(VENUE,
                "export class V {\n" +
                "    parseJson (x: any): any { return x; }\n" +
                "    sign (h: string): string { return h; }\n" +
                "    other (h: string): any { return h; }\n" +
                "    f (h: string) {\n" +
                "        const a = JSON.parse (this.sign (h));\n" +
                "        const b = this.parseJson (this.sign (h));\n" +
                "        const c = JSON.parse (this.other (h));\n" +
                "        const d = this.parseJson (this.other (h));\n" +
                "        return [ a, b, c, d ];\n" +
                "    }\n" +
                "}\n");
            out = new Transpiler({ 'verbose': false, 'csharp': { 'parser': PLAIN_PARSER } }).transpileCSharpByPath(VENUE).content;
        });

        afterAll(() => {
            fs.rmSync(TMP, { recursive: true, force: true });
        });

        test('JSON.parse and this.parseJson of a string-typed call deserialize the call directly', () => {
            expect(out).toContain('object a = JsonHelper.Deserialize((string)this.sign(h));');
            expect(out).toContain('object b = JsonHelper.Deserialize((string)this.sign(h));');
        });

        test('an object-returning callee keeps the helper', () => {
            expect(out).toContain('parseJson(this.other(h))');
            expect(out).not.toContain('(string)this.other(h)');
        });
    });
});

describe ('csharp destructured tuple bool slot', () => {

    const config: any = { 'verbose': false, 'csharp': { 'parser': WRAPPED_PARSER } };

    const source =
        "class Exchange {\n" +
        "    handleOptionAndParams (params: any, methodName: string, optionName: string, defaultValue: any = undefined): any[] { return [ params, params ]; }\n" +
        "    handleOptionAndParams2 (params: any, methodName: string, optionName1: string, optionName2: string, defaultValue: any = undefined): any[] { return [ params, params ]; }\n" +
        "    use (x: any) { return x; }\n" +
        "    write (params: any) {\n" +
        "        let warn = true;\n" +
        "        let paramsValue = params;\n" +
        "        [ warn, paramsValue ] = this.handleOptionAndParams (paramsValue, 'cancelAllOrders', 'warnOnCancelAllOrdersWithOutcome', warn);\n" +
        "        if (warn) {\n" +
        "            throw new Error ('x');\n" +
        "        }\n" +
        "    }\n" +
        "    writeUsed (params: any) {\n" +
        "        let paginate = false;\n" +
        "        let paramsValue = params;\n" +
        "        [ paginate, paramsValue ] = this.handleOptionAndParams (paramsValue, 'fetchMyTrades', 'paginate', paginate);\n" +
        "        this.use (paginate);\n" +
        "        paginate = !paginate;\n" +
        "    }\n" +
        "    writeOtherKey (params: any) {\n" +
        "        let flag = true;\n" +
        "        let paramsValue = params;\n" +
        "        [ flag, paramsValue ] = this.handleOptionAndParams (paramsValue, 'm', 'someOption', flag);\n" +
        "        if (flag) {\n" +
        "            return 1;\n" +
        "        }\n" +
        "    }\n" +
        "    writeNoDefault (params: any) {\n" +
        "        let paginate = false;\n" +
        "        let paramsValue = params;\n" +
        "        [ paginate, paramsValue ] = this.handleOptionAndParams (paramsValue, 'm', 'paginate');\n" +
        "        if (paginate) {\n" +
        "            return 1;\n" +
        "        }\n" +
        "    }\n" +
        "    writeOtherWrite (params: any, other: any) {\n" +
        "        let paginate = false;\n" +
        "        let paramsValue = params;\n" +
        "        [ paginate, paramsValue ] = this.handleOptionAndParams (paramsValue, 'm', 'paginate', paginate);\n" +
        "        paginate = other;\n" +
        "        if (paginate) {\n" +
        "            return 1;\n" +
        "        }\n" +
        "    }\n" +
        "    declLiteral (params: any) {\n" +
        "        const [ useDepthEndpoint, rest ] = this.handleOptionAndParams (params, 'm', 'useDepthEndpoint', false);\n" +
        "        if (useDepthEndpoint) {\n" +
        "            return rest;\n" +
        "        }\n" +
        "    }\n" +
        "    declLiteral2 (params: any) {\n" +
        "        const [ paginate, rest ] = this.handleOptionAndParams2 (params, 'm', 'paginate', 'removeRepeated', true);\n" +
        "        const [ paginateOther, rest2 ] = this.handleOptionAndParams2 (params, 'm', 'paginate', 'other', true);\n" +
        "        if (paginate) {\n" +
        "            return rest;\n" +
        "        }\n" +
        "    }\n" +
        "    declParameter (params: any, removeRepeated = true) {\n" +
        "        const [ removeRepeatedOption, rest ] = this.handleOptionAndParams (params, 'm', 'removeRepeated', removeRepeated);\n" +
        "        if (removeRepeatedOption) {\n" +
        "            return rest;\n" +
        "        }\n" +
        "    }\n" +
        "    declParameterWritten (params: any, removeRepeated = true) {\n" +
        "        removeRepeated = this.use (removeRepeated);\n" +
        "        const [ removeRepeatedOption, rest ] = this.handleOptionAndParams (params, 'm', 'removeRepeated', removeRepeated);\n" +
        "        if (removeRepeatedOption) {\n" +
        "            return rest;\n" +
        "        }\n" +
        "    }\n" +
        "    declParameterNoDefault (params: any, removeRepeated: any) {\n" +
        "        const [ removeRepeatedOption, rest ] = this.handleOptionAndParams (params, 'm', 'removeRepeated', removeRepeated);\n" +
        "        if (removeRepeatedOption) {\n" +
        "            return rest;\n" +
        "        }\n" +
        "    }\n" +
        "    declOtherKey (params: any) {\n" +
        "        const [ interval, rest ] = this.handleOptionAndParams (params, 'm', 'interval', false);\n" +
        "        if (interval) {\n" +
        "            return rest;\n" +
        "        }\n" +
        "    }\n" +
        "    declNoDefault (params: any) {\n" +
        "        const [ paginate, rest ] = this.handleOptionAndParams (params, 'm', 'paginate');\n" +
        "        if (paginate) {\n" +
        "            return rest;\n" +
        "        }\n" +
        "    }\n" +
        "    declIncremented (params: any) {\n" +
        "        const [ paginate, rest ] = this.handleOptionAndParams (params, 'm', 'paginate', false);\n" +
        "        paginate++;\n" +
        "        return rest;\n" +
        "    }\n" +
        "    declOtherCallee (params: any) {\n" +
        "        const [ paginate, rest ] = this.unresolved.handleOptionAndParams (params, 'm', 'paginate', false);\n" +
        "        return rest;\n" +
        "    }\n" +
        "}";

    const printer = (typedHolder: boolean): string => {
        const transpiler: any = new Transpiler(config);
        if (typedHolder) {
            transpiler.csharpTranspiler.csharpDestructuringTempType = () => 'IList<object>';
        }
        return transpiler.transpileCSharp(source).content;
    };

    const method = (out: string, name: string): string => {
        const start = out.indexOf(' ' + name + '(');
        expect(start).toBeGreaterThan(-1);
        const end = out.indexOf('\n    }\n', start);
        return out.slice(start, end);
    };

    describe('bool slot of a destructured handleOptionAndParams', () => {
        test('an assignment destructuring types the bool local and casts the slot', () => {
            const body = method(printer(true), 'write');
            expect(body).toContain('bool warn = true;');
            expect(body).toContain('warn = (bool)warnparamsValueVariable[0];');
            expect(body).toContain('if (warn)');
            const untypedHolder = method(printer(false), 'write');
            expect(untypedHolder).toContain('bool warn = true;');
            expect(untypedHolder).toContain('warn = (bool)((IList<object>)warnparamsValueVariable)[0];');
        });

        test('a local read outside a condition is still typed bool', () => {
            const body = method(printer(true), 'writeUsed');
            expect(body).toContain('bool paginate = false;');
            expect(body).toContain('paginate = (bool)paginateparamsValueVariable[0];');
        });

        test('a variable destructuring on a bool literal default declares a bool', () => {
            const out = printer(true);
            expect(method(out, 'declLiteral')).toContain('bool useDepthEndpoint = (bool)useDepthEndpointrestVariable[0];');
            expect(method(out, 'declLiteral')).toContain('if (useDepthEndpoint)');
            expect(method(out, 'declLiteral2')).toContain('bool paginate = (bool)paginaterestVariable[0];');
            expect(method(out, 'declLiteral2')).toContain('var paginateOther = paginateOtherrest2Variable[0];');
        });

        test('a bool parameter default proven by its ??= prologue declares a bool', () => {
            const body = method(printer(true), 'declParameter');
            expect(body).toContain('removeRepeated ??= true;');
            expect(body).toContain('bool removeRepeatedOption = (bool)removeRepeatedOptionrestVariable[0];');
            expect(body).toContain('if (removeRepeatedOption)');
        });

        test('anything the proof does not cover keeps the object emission', () => {
            const out = printer(true);
            expect(method(out, 'writeOtherKey')).toContain('object flag = true;');
            expect(method(out, 'writeOtherKey')).toContain('flag = flagparamsValueVariable[0];');
            expect(method(out, 'writeNoDefault')).toContain('object paginate = false;');
            expect(method(out, 'writeOtherWrite')).toContain('object paginate = false;');
            expect(method(out, 'declParameterWritten')).toContain('var removeRepeatedOption = ');
            expect(method(out, 'declParameterNoDefault')).toContain('var removeRepeatedOption = ');
            expect(method(out, 'declOtherKey')).toContain('var interval = ');
            expect(method(out, 'declNoDefault')).toContain('var paginate = ');
            expect(method(out, 'declIncremented')).toContain('var paginate = ');
            expect(method(out, 'declOtherCallee')).toContain('var paginate = ');
            expect(out).not.toContain('(bool)paginateOther');
            expect(out).not.toContain('(bool)interval');
        });
    });
});

describe ('csharp declared dictionary member reads', () => {

    const config: any = { 'verbose': false, 'csharp': { 'parser': { 'NUM_LINES_END_FILE': 0, 'INFER_ARG_TYPE': true, 'ELEMENT_ACCESS_WRAPPER_OPEN': 'getValue(', 'ELEMENT_ACCESS_WRAPPER_CLOSE': ')' } } };

    const source =
        "class Client {\n" +
        "    futures: Dictionary<any>;\n" +
        "    subscriptions: Dictionary<any>;\n" +
        "}\n" +
        "class Exchange {\n" +
        "    f (client: Client, messageHash: string, other: any) {\n" +
        "        const a = client.futures[messageHash];\n" +
        "        const b = this.safeValue (client.subscriptions, messageHash);\n" +
        "        const c = client.subscriptions['authenticated'];\n" +
        "        const d = client.subscriptions[other];\n" +
        "        const e = this.safeValue (client.subscriptions, messageHash, {});\n" +
        "        client.subscriptions[messageHash] = 1;\n" +
        "    }\n" +
        "}";

    const printer = (hook: boolean): string => {
        const transpiler: any = new Transpiler(config);
        if (hook) {
            // the consumer hook: members declared by `Client` answer, everything else does not
            transpiler.csharpTranspiler.csharpDeclaredDictMember = (node: any) => {
                const getters: any = { 'futures': 'getFuture', 'subscriptions': 'getSubscription' };
                return getters[node.name.text] ? { getter: getters[node.name.text] } : undefined;
            };
        }
        return transpiler.transpileCSharp(source).content;
    };

    describe('declared dictionary member reads', () => {
        test('without the consumer hook the helper emission is unchanged', () => {
            const out = printer(false);
            expect(out).toContain('getValue(client.futures, messageHash)');
            expect(out).toContain('callDynamically(this, "safeValue", new object[] { client.subscriptions, messageHash })');
        });

        test('a member read through a string key prints the key-tested indexer', () => {
            const out = printer(true);
            expect(out).toContain('object a = (client.futures != null && messageHash != null && client.futures.ContainsKey(messageHash) ? client.futures[messageHash] : null);');
            expect(out).toContain('object c = (client.subscriptions != null && client.subscriptions.ContainsKey("authenticated") ? client.subscriptions["authenticated"] : null);');
        });

        test('safeValue on the member prints the typed accessor', () => {
            expect(printer(true)).toContain('object b = client.getSubscription(messageHash);');
        });

        test('a non-string key, a safeValue default and a write keep the helper', () => {
            const out = printer(true);
            expect(out).toContain('getValue(client.subscriptions, other)');
            expect(out).toContain('"safeValue", new object[] { client.subscriptions, messageHash');
            expect(out).not.toContain('ContainsKey(other)');
        });
    });
});

describe ('csharp object-key ws cache reads', () => {

    // ws cache properties of the hand-written base are owner-routed IDictionary<string, object> members;
    // an object-keyed read of a declared dictionary local carries the helper's (string) cast
    const DECLARED: { [name: string]: any } = {
        'ohlcvs': { type: 'IDictionary<string, object>', initializer: 'null', routed: true },
        'orderbooks': { type: 'IDictionary<string, object>', initializer: 'null', routed: true },
        'currencies_by_id': { type: 'IDictionary<string, object>', initializer: 'null', routed: false },
    };
    const config = {
        'verbose': false,
        'csharp': { 'parser': WRAPPED_PARSER }
    };

    function printed(lines: string, keyType: string, params = 'symbol: string'): string {
        const source = 'class BaseExchange {\n    ohlcvs: any; orderbooks: any; currencies_by_id: any;\n    f (' + params + ') {\n' + lines + '\n    }\n}';
        const transpiler = new Transpiler(config);
        (transpiler as any).csharpTranspiler.csharpLocalTypeOf = (node: any) => (node.text === 'symbol' ? keyType : undefined);
        (transpiler as any).csharpTranspiler.csharpPrintedLocalType = (node: any) => (node.text === 'balances' ? 'Dictionary<string, object>' : undefined);
        (transpiler as any).csharpTranspiler.csharpDeclaredMemberType = (owner: string, name: string) => (owner === 'this' ? DECLARED : {} as any)[name];
        return transpiler.transpileCSharp(source).content;
    }

    describe('csharp routed ws cache and object-key dictionary reads', () => {
        test('a string? key on a routed ws cache is a guarded ContainsKey read', () => {
            const out = printed('        return this.ohlcvs[symbol];', 'string?');
            expect(out).toContain('(this.ohlcvs != null && symbol != null && this.ohlcvs.ContainsKey(symbol) ? this.ohlcvs[symbol] : null)');
            expect(out).not.toContain('getValue(this.ohlcvs');
        });
        test('orderbooks keeps the helper the ws transpile maps to getOrderBook', () => {
            expect(printed('        return this.orderbooks[symbol];', 'string?')).toContain('getValue(this.orderbooks, symbol)');
        });
        test('a key of another type keeps the helper', () => {
            expect(printed('        return this.ohlcvs[symbol];', 'int')).toContain('getValue(this.ohlcvs, symbol)');
        });
        test('an object key on a declared dictionary local carries the helper cast', () => {
            const out = printed('        const balances = {};\n        return balances[symbol];', 'object');
            expect(out).toContain('(balances != null && symbol != null && balances.ContainsKey((string)symbol) ? balances[(string)symbol] : null)');
        });
        test('an object key parameter the body writes keeps the helper (a retyped shadow local)', () => {
            const out = printed('        symbol = symbol + "x";\n        const balances = {};\n        return balances[symbol];', 'object');
            expect(out).toContain('getValue(balances, symbol)');
        });
        test('a local copy of currencies_by_id names the declared dictionary type', () => {
            const out = printed('        const byId = this.currencies_by_id;\n        return byId.length;', 'string');
            expect(out).toContain('IDictionary<string, object> byId = this.currencies_by_id;');
        });
    });
});

describe ('csharp declared base-field reads', () => {

    const declared = { 'urls': 'IDictionary<string, object>', 'positions': 'object' };
    const makeConfig = (hook: boolean): any => ({ 'verbose': false, 'csharp': { ...(hook ? { 'declaredBaseFieldTypes': declared } : {}), 'parser': WRAPPED_PARSER } });

    // reads of a hand-written base field the consumer declares (config.csharp.declaredBaseFieldTypes)
    const source =
        "class Exchange {\n" +
        "    urls: any;\n" +
        "    positions: any;\n" +
        "    limits: any;\n" +
        "    f (type: string, other: any) {\n" +
        "        const a = this.urls['api'];\n" +
        "        const b = this.urls[type];\n" +
        "        const c = 'x' in this.urls;\n" +
        "        const d = this.positions[type];\n" +
        "        const e = type in this.positions;\n" +
        "        const f = other in this.positions;\n" +
        "        const g = this.urls[other];\n" +
        "        const h = this.limits[type];\n" +
        "        this.positions = {};\n" +
        "        this.urls['k'] = 1;\n" +
        "    }\n" +
        "    g (a: number, b: number) {\n" +
        "        const x = this.parseToInt (a);\n" +
        "        const y = this.parseToInt (b);\n" +
        "        const p = x % y === 0;\n" +
        "        const q = x % 7 === 0;\n" +
        "        const r = x % y !== 3;\n" +
        "        const s = x % this.foo === 0;\n" +
        "    }\n" +
        "    parseToInt (x: any): number { return 1 }\n" +
        "}";

    const printer = (hook: boolean): string => {
        const transpiler: any = new Transpiler(makeConfig(hook));
        if (hook) {
            transpiler.csharpTranspiler.csharpExpressionTypeResolver = (node: any) => (node.kind === SyntaxKind.Identifier && [ 'x', 'y' ].includes(node.text)) ? 'Int64' : undefined;
        }
        return transpiler.transpileCSharp(source).content;
    };

    describe('declared base-field dictionary reads', () => {
        test('without the consumer hook the helper emission is unchanged', () => {
            const out = printer(false);
            expect(out).toContain('getValue(this.positions, type)');
            expect(out).toContain('inOp(this.positions, type)');
            expect(out).toContain('isEqual(mod(x, y), 0)');
        });

        test('a member declared a dictionary reads through its own indexer and ContainsKey', () => {
            const out = printer(true);
            expect(out).toContain('bool c = this.urls.ContainsKey("x");');
        });

        test('an object member whose every write stores a dictionary keeps the helper cast and tests the key type', () => {
            const out = printer(true);
            expect(out).toContain('(((IDictionary<string,object>)this.positions) != null && type != null && ((IDictionary<string,object>)this.positions).ContainsKey((string)type) ? ((IDictionary<string,object>)this.positions)[(string)type] : null)');
            expect(out).toMatch(/type is string entryKey\d+ && \(\(IDictionary<string,object>\)this\.positions\)\.ContainsKey\(entryKey\d+\)/);
            expect(out).toContain('inOp(this.positions, other)');
        });

        test('an undeclared member, a non-string key and a write keep the helper', () => {
            const out = printer(true);
            expect(out).toContain('getValue(this.limits, type)');
            expect(out).toContain('getValue(this.urls, other)');
            expect(out).toContain('["k"] = 1');
        });

        test('isEqual over an Int64 remainder and an integer literal prints the operator', () => {
            const out = printer(true);
            expect(out).toContain('((x % y) == 0)');
            expect(out).toContain('((x % y) != 3)');
            // a literal divisor of an Int64 identifier prints the same remainder the host's mod pass would
            // (`(Int64)((double)x % 7)`) behind the operator; the non-Int64 and non-literal-divisor shapes keep the helper.
            expect(out).toContain('(((Int64)((double)x % 7)) == 0)');
            expect(out).not.toContain('isEqual(mod(x, y)');
            expect(out).toContain('mod(x, this.foo)');
        });
    });

    describe('omit of a declared dictionary member', () => {
        const omitSource = "class Exchange {\n    urls: any;\n    positions: any;\n    f () {\n        const a = this.omit (this.urls, 'x');\n        const b = this.omit (this.positions, 'x');\n        const c = this.omit (this.urls, 'x', 'y');\n        this.urls = a;\n    }\n    omit (a: any, ...k: any[]) { return a }\n}";
        const run = (hook: boolean): string => (new Transpiler(makeConfig(hook)) as any).transpileCSharp(omitSource).content;
        test('without the table the local keeps the printer box', () => {
            expect(run(false)).not.toContain('Dictionary<string, object> a = ');
        });
        test('with the table the 2-argument omit of a dictionary member names its result', () => {
            const out = run(true);
            expect(out).toContain('Dictionary<string, object> a = this.omit(this.urls, "x");');
            expect(out).not.toContain('Dictionary<string, object> b = ');
            expect(out).not.toContain('Dictionary<string, object> c = ');
        });
    });
});

describe ('csharp PascalCase Int64 task calls', () => {
    const input =
    "type int = number;\n" +
    "type Int = number | undefined;\n" +
    "class Exchange {\n" +
    "    async height (params = {}): Promise<int> { return 1; }\n" +
    "    async nonce (params = {}): Promise<Int> { return 1; }\n" +
    "    async other (params = {}): Promise<number> { return 1; }\n" +
    "    async run () {\n" +
    "        const a = await this.height ();\n" +
    "        const b = await this.nonce ();\n" +
    "        const c = await this.other ();\n" +
    "        return [ a, b, c ];\n" +
    "    }\n" +
    "}";
    test('awaited Promise<int|Int> this-calls bind the PascalCase Task<Int64> core when enabled', () => {
        const local = new Transpiler({ csharp: { pascalInt64TaskCalls: true } });
        const output = local.transpileCSharp(input).content;
        expect(output).toContain("await this.Height()");
        expect(output).toContain("await this.Nonce()");
        expect(output).toContain("await this.other()");
    });
    test('off by default: calls keep the declared camelCase name', () => {
        const output = transpiler.transpileCSharp(input).content;
        expect(output).toContain("await this.height()");
        expect(output).toContain("await this.nonce()");
    });
});

describe('ws future settle calls bind the declared Future methods', () => {
    const input =
    "class t {\n" +
    "    settle (client, messageHash, cache, e) {\n" +
    "        const future = client.futures[messageHash];\n" +
    "        future.resolve (cache);\n" +
    "        future.resolve ();\n" +
    "        future.reject (e);\n" +
    "        const other = client.futures[messageHash];\n" +
    "        other.resolve (cache);\n" +
    "        return future.resolve (cache);\n" +
    "    }\n" +
    "}";
    test('statement-position resolve/reject on `future` print the typed receiver', () => {
        const output = transpiler.transpileCSharp(input).content;
        expect(output).toContain("(future as Future).resolve(cache);");
        expect(output).toContain("(future as Future).resolve();");
        expect(output).toContain("((Future)future).reject(e);");
        expect(output).toContain("other.resolve(cache);");
        expect(output).not.toContain("return (future as Future)");
    });
});

describe('csharp ws cache-map entry locals', () => {
    const root = fs.mkdtempSync(path.join(require('os').tmpdir(), 'cs-cachemap-'));
    const write = (relative: string, content: string): string => {
        const file = path.join(root, relative);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, content);
        return file;
    };
    write('ts/src/base/ws/Cache.ts', 'export class ArrayCache {\n    append (item: any) {}\n}\n');
    write('ts/src/base/Exchange.ts', "import { ArrayCache } from './ws/Cache.js';\nexport interface Dictionary<T> { [key: string]: T }\nexport default class Exchange {\n    positionsByType: Dictionary<ArrayCache> = {};\n    loose: any = {};\n    safeValue (obj: any, key: any, defaultValue: any = undefined): any { return obj[key]; }\n}\n");
    const venue = write('ts/src/pro/venue.ts', "import Exchange from '../base/Exchange.js';\nexport default class venue extends Exchange {\n    a (type: string, p: any) {\n        const cache = this.positionsByType[type];\n        cache.append (p);\n        const other = this.safeValue (this.positionsByType, type);\n        other.append (p);\n        const plain = this.safeValue (this.loose, type);\n        return plain;\n    }\n}\n");
    test('a const read of a Dictionary<ArrayCache> base field names the cache class', () => {
        const output = new Transpiler({ 'verbose': false, 'csharp': { 'parser': { 'NUM_LINES_END_FILE': 0 } } } as any).transpileCSharpByPath(venue).content;
        expect(output).toMatch(/ccxt\.pro\.ArrayCache cache = \(\(ccxt\.pro\.ArrayCache\)/);
        expect(output).toMatch(/ccxt\.pro\.ArrayCache other = \(\(ccxt\.pro\.ArrayCache\)this\.safeValue\(this\.positionsByType, type\)\)/);
        expect(output).not.toMatch(/ccxt\.pro\.ArrayCache plain/);
    });
});
