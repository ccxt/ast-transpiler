import { Transpiler } from '../src/transpiler';
import { readFileSync } from 'fs';

jest.mock('module',()=>({
    __esModule: true,                    // this makes it work
    default: jest.fn()
  }));

let transpiler: Transpiler;

beforeAll(() => {
    const config = {
        'verbose': false,
        'php': {
            'parser': {
                'NUM_LINES_END_FILE': 0
            }
        }
    }
    transpiler = new Transpiler(config);
})

describe('php transpiling tests', () => {
    test('basic variable declaration', () => {
        const ts = "const x = 1;"
        const php = "$x = 1;"
        const output = transpiler.transpilePhp(ts).content;
        expect(output).toBe(php);
    });
    test('basic while loop', () => {
        const ts =
        "while (true) {\n" +
        "    const x = 1;\n" +
        "    break;\n" +
        "}"
        const php =
        "while (true) {\n" +
        "    $x = 1;\n" +
        "    break;\n" +
        "}"
        const output = transpiler.transpilePhp(ts).content;
        expect(output).toBe(php);
    });
    test('basic for loop', () => {
        const ts =
        "for (let i = 0; i < 10; i++) {\n" +
        "    break;\n" +
        "}"
        const php =
        "for ($i = 0; $i < 10; $i++) {\n" +
        "    break;\n" +
        "}"
        const output = transpiler.transpilePhp(ts).content;
        expect(output).toBe(php);
    });
    test('basic function declaration', () => {
        const ts =
        "function teste () {\n" +
        "    return 1;\n" +
        "}\n";
        const php =
        "function teste() {\n" +
        "    return 1;\n" +
        "}";
        const output = transpiler.transpilePhp(ts).content;
        expect(output).toBe(php);
    });
    test('basic function declaration with default parameters', () => {
        const ts =
        "function teste(x = \"foo\", y = undefined, params = {}) {\n" +
        "    return 1;\n" +
        "}"
        const php =
        "function teste($x = 'foo', $y = null, $params = array()) {\n" +
        "    return 1;\n" +
        "}"
        const output = transpiler.transpilePhp(ts).content;
        expect(output).toBe(php);
    });
    test('callback function transpilation', () => {
        const ts =
        "function printResult(result) {\n" +
        "    return;\n" +
        "}\n" +
        "processNumbers(5, 10, printResult);";
        const php =
        "function printResult($result) {\n" +
        "    return;\n" +
        "}\n" +
        "processNumbers(5, 10, 'printResult');";
        const output = transpiler.transpilePhp(ts).content;
        expect(output).toBe(php);
    });
    test('function expression transpilation', () => {
        const ts =
        "const consumer = function consumer (a) {\n" +
        "    return a;\n" +
        "};";
        const php =
        "$consumer = function ($a) {\n" +
        "    return $a;\n" +
        "};"
        const output = transpiler.transpilePhp(ts).content;
        expect(output).toBe(php);
    });
    test('arrow function', () => {
        const ts =
        "const consumer = (a) => {\n" +
        "    return a;\n" +
        "};";
        const php =
        "$consumer = function ($a) {\n" +
        "    return $a;\n" +
        "};"
        const output = transpiler.transpilePhp(ts).content;
        expect(output).toBe(php);
    });
    test('basic identation check [nested if]', () => {
        const ts =
        "if (1) {\n" +
        "    if (2) {\n" +
        "        if (4) {\n" +
        "            if (5) {\n" +
        "                const x = {};\n" +
        "            }\n" +
        "        }\n" +
        "    }\n" +
        "}"
        const php =
        "if (1) {\n" +
        "    if (2) {\n" +
        "        if (4) {\n" +
        "            if (5) {\n" +
        "                $x = array();\n" +
        "            }\n" +
        "        }\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpilePhp(ts).content;
        expect(output).toBe(php);
    });
    test('basic identation check [if-else-if]', () => {
        const ts =
        "function teste() {\n" +
        "    if (1) {\n" +
        "        const x = 1;\n" +
        "    } else if (3) {\n" +
        "        const b = 2;\n" +
        "    } else {\n" +
        "        const a = 1;\n" +
        "    }\n" +
        "}" 
        const php =
        "function teste() {\n" +
        "    if (1) {\n" +
        "        $x = 1;\n" +
        "    } elseif (3) {\n" +
        "        $b = 2;\n" +
        "    } else {\n" +
        "        $a = 1;\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpilePhp(ts).content;
        expect(output).toBe(php);
    });
    test('basic identation check [nested objects]', () => {
        const ts =
        "const x = {\n" +
        "    'world': {\n" +
        "        'hello': {\n" +
        "            'foo': 'bar'\n" +
        "        }\n" +
        "    }\n" +
        "}"
        const php =
        "$x = array(\n" +
        "    'world' => array(\n" +
        "        'hello' => array(\n" +
        "            'foo' => 'bar',\n" +
        "        ),\n" +
        "    ),\n" +
        ");"
        const output = transpiler.transpilePhp(ts).content;
        expect(output).toBe(php);
    });
    test('basic if statement', () => {
        const ts =
        "if (1) {\n" +
        "    const x = 1;\n" +
        "}"
        const php =
        "if (1) {\n" +
        "    $x = 1;\n" +
        "}" 
        const output = transpiler.transpilePhp(ts).content;
        expect(output).toBe(php);
    });
    test('basic if else statement', () => {
        const ts =
        "if (1) {\n" +
        "    const x = 1;\n" +
        "} else {\n" +
        "    const x = 2;\n" +
        "}";
        const php =
        "if (1) {\n" +
        "    $x = 1;\n" +
        "} else {\n" +
        "    $x = 2;\n" +
        "}"
        const output = transpiler.transpilePhp(ts).content;
        expect(output).toBe(php);
    });
    test('basic if-elseif-else statement', () => {
        const ts =
        "if (1) {\n" +
        "    const x = 1;\n" +
        "} else if (2) {\n" +
        "    const x = 2;\n" +
        "} else {\n" +
        "    const x = 3;\n" +
        "}"
        const php =
        "if (1) {\n" +
        "    $x = 1;\n" +
        "} elseif (2) {\n" +
        "    $x = 2;\n" +
        "} else {\n" +
        "    $x = 3;\n" +
        "}"
        const output = transpiler.transpilePhp(ts).content;
        expect(output).toBe(php);
    });
    test('basic async function declaration [no args]', () => {
        const ts =
        "async function camelCase () {\n" +
        "    this.myFunc()\n" +
        "    await this.loadMarkets();\n" +
        "}\n"
        const php =
        "function camelCase() {\n" +
        "    return Async\\async(function () {\n" +
        "        $this->myFunc();\n" +
        "        Async\\await($this->loadMarkets());\n" +
        "    }) ();\n" +
        "}"
        const output = transpiler.transpilePhp(ts).content;
        expect(output).toBe(php);
    });
    test('basic async function declaration [with args]', () => {
        const ts =
        "async function camelCase (foo,bar) {\n" +
        "    this.myFunc()\n" +
        "    await this.loadMarkets();\n" +
        "}\n"
        const php =
        "function camelCase($foo, $bar) {\n" +
        "    return Async\\async(function () use ($foo, $bar) {\n" +
        "        $this->myFunc();\n" +
        "        Async\\await($this->loadMarkets());\n" +
        "    }) ();\n" +
        "}"; 
        const output = transpiler.transpilePhp(ts).content;
        expect(output).toBe(php);
    });
    test('should convert async function declaration to sync', () => {
        transpiler.setPhpAsyncTranspiling(false);
        const ts =
        "async function camelCase () {\n" +
        "    this.myFunc()\n" +
        "    await this.loadMarkets();\n" +
        "}"
        const php =
        "function camelCase() {\n" +
        "    $this->myFunc();\n" +
        "    $this->loadMarkets();\n" +
        "}"
        const output = transpiler.transpilePhp(ts).content;
        transpiler.setPhpAsyncTranspiling(true);
        expect(output).toBe(php);
    });
    test('basic class declaration', () => {
        const ts =
        "class Test {\n" +
        "    describe() {\n" +
        "        return \"foo\";\n" +
        "    }\n" +
        "}\n" 
        const php =
        "class Test {\n" +
        "    public function describe() {\n" +
        "        return 'foo';\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpilePhp(ts).content;
        expect(output).toBe(php);
    });
    test('basic class declaration with props', () => {
        const ts = 
        "class MyClass {\n" +
        "    public static x: number = 10;\n" +
        "    public static y: string = \"test\";\n" +
        "    public static a1: string[] = [ 'a', 'b' ];\n" +
        "    public static a2: any = whatever;\n" +
        "    public static a3: any = {};\n" +
        "    public static a4: any = Whatever;\n" +
        "    mainFeature(message) {\n" +
        "        console.log(\"Hello! I'm inside main class:\" + message)\n" +
        "    }\n" +
        "}"
        const php =
        "class MyClass {\n" +
        "    public static $x = 10;\n" +
        "    public static $y = 'test';\n" +
        "    public static $a1 = ['a', 'b'];\n" +
        "    public static $a2 = $whatever;\n" +
        "    public static $a3 = array();\n" +
        "    public static $a4 = Whatever;\n" +
        "\n" +
        "    public function mainFeature($message) {\n" +
        "        var_dump('Hello! I\\'m inside main class:' . $message);\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpilePhp(ts).content;
        expect(output).toBe(php);
    });
    test('basic class inheritance', () => {
        const ts =
        "class teste extends extended {\n" +
        "    method() {\n" +
        "        return 1;\n" +
        "    }\n" +
        "}";
        const php =
        "class teste extends extended {\n" +
        "    public function method() {\n" +
        "        return 1;\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpilePhp(ts).content;
        expect(output).toBe(php);
    });
    test('basic class with constructor', () => {
        const ts =
        "class teste extends extended {\n" +
        "    constructor(x) {\n" +
        "        super(x);\n" +
        "    }\n" +
        "}" 
        const php =
        "class teste extends extended {\n" +
        "    function __construct($x) {\n" +
        "        parent::__construct($x);\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpilePhp(ts).content;
        expect(output).toBe(php);
    });
    test('basic dictionary', () => {
        const ts =
        "const types = {\n" +
        "    'limit': 'limit',\n" +
        "    'market': 'market',\n" +
        "    'margin': 'market',\n" +
        "}\n" 
        const php =
        "$types = array(\n" +
        "    'limit' => 'limit',\n" +
        "    'market' => 'market',\n" +
        "    'margin' => 'market',\n" +
        ");"
        const output = transpiler.transpilePhp(ts).content;
        expect(output).toBe(php);
    });
    test('basic binary expressions', () => {
        const ts =
        "const a = 1 + 1;\n" +
        "const b = 2 * 2;\n" +
        "const c = 3 / 3;\n" +
        "const d = 4 - 4;\n" +
        "const e = 5 % 5;\n" +
        "const f = \"foo\" + \"bar\";\n";
        const php =
        "$a = 1 + 1;\n" +
        "$b = 2 * 2;\n" +
        "$c = 3 / 3;\n" +
        "$d = 4 - 4;\n" +
        "$e = 5 % 5;\n" +
        "$f = 'foo' . 'bar';"
        const output = transpiler.transpilePhp(ts).content;
        expect(output).toBe(php);
    })
    test('basic conditions expressions', () => {
        const ts =
        "const a = true;\n" +
        "const b = false;\n" +
        "const c = true;\n" +
        "const d = (a && b) || (c && !b);\n" 
        const php =
        "$a = true;\n" +
        "$b = false;\n" +
        "$c = true;\n" +
        "$d = ($a && $b) || ($c && !$b);"
        const output = transpiler.transpilePhp(ts).content;
        expect(output).toBe(php);
    })
    test('basic element access expression', () => {
        const ts =
        "const x = {};\n" +
        "x['foo'] = 'bar'"
        const php =
        "$x = array();\n" +
        "$x['foo'] = 'bar';"
        const output = transpiler.transpilePhp(ts).content;
        expect(output).toBe(php);
    })
    test('basic throw statement', () => {
        const ts =
        "function test () {\n" +
        "    throw new InvalidOrder (\"error\")\n" +
        "}";
        const php =
        "function test() {\n" +
        "    throw new InvalidOrder('error');\n" +
        "}";
        const output = transpiler.transpilePhp(ts).content;
        expect(output).toBe(php);
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
        const php =
        "$a = 1;\n" +
        "$b = 1 + 1;\n" +
        "$c = $a === $b;\n" +
        "$d = $a !== $b;\n" +
        "$e = $a < $b;\n" +
        "$f = $a > $b;\n" +
        "$g = $a >= $b;\n" +
        "$h = $a <= $b;";
        const output = transpiler.transpilePhp(ts).content;
        expect(output).toBe(php);
    })
    test('basic math functions', () => {
        const ts =
        "const ceil = Math.ceil (num);\n" +
        "const a = Math.min (0, 5);\n" +
        "const b = Math.max (0, 5);\n" +
        "const c = parseFloat ('1.3');\n" +
        "const d = parseInt ('1.3');\n" +
        "const e = Number.MAX_SAFE_INTEGER;\n" +
        "const f = Math.abs (-2);\n" +
        "const g = Math.pow (1, 2);\n" +
        "const h = Math.round (5);\n" +
        "const i = Math.floor (5.5);\n";
        const php =
        "$ceil = ((int) ceil($num));\n" +
        "$a = min(0, 5);\n" +
        "$b = max(0, 5);\n" +
        "$c = floatval('1.3');\n" +
        "$d = intval('1.3');\n" +
        "$e = PHP_INT_MAX;\n" +
        "$f = abs(-2);\n" +
        "$g = pow(1, 2);\n" +
        "$h = ((int) round(5));\n" +
        "$i = ((int) floor(5.5));"
        const output = transpiler.transpilePhp(ts).content;
        expect(output).toBe(php);
    })
    test('basic json methods', () => {
        const ts =
        "const j = JSON.stringify ({ 'a': 1, 'b': 2 });\n" +
        "const k = JSON.parse (j);\n";
        const php =
        "$j = json_encode(array(\n" +
        "    'a' => 1,\n" +
        "    'b' => 2,\n" +
        "));\n" +
        "$k = json_decode($j, $as_associative_array = true);";
        const output = transpiler.transpilePhp(ts).content;
        expect(output).toBe(php);
    })
    test('basic scope resolution access', () => {
        const ts =
        "const d = super.describe ();"
        const php =
        "$d = parent::describe();"
        const output = transpiler.transpilePhp(ts).content;
        expect(output).toBe(php);
    })
    test('custom scope resolution access', () => {
        const prev = transpiler.phpTranspiler.LeftPropertyAccessReplacements;
        prev["Precise"]= "Precise";
        transpiler.phpTranspiler.LeftPropertyAccessReplacements = prev;
        transpiler.setPHPPropResolution(['Precise'])
        const ts =
        "const d = Precise.describe ();"
        const php =
        "$d = Precise::describe();"
        const output = transpiler.transpilePhp(ts).content;
        expect(output).toBe(php);
    })
    test('string length', () => {
        const ts =
        "const myStr = \"test\";\n" +
        "const ff = myStr.length;"
        const php =
        "$myStr = 'test';\n" +
        "$ff = strlen($myStr);"
        const output = transpiler.transpilePhp(ts).content;
        expect(output).toBe(php);
    })
    test('array length', () => {
        const ts =
        "const myArray = [1, 2, 3];\n" +
        "const aa = myArray.length;"
        const php =
        "$myArray = [1, 2, 3];\n" +
        "$aa = count($myArray);"
        const output = transpiler.transpilePhp(ts).content;
        expect(output).toBe(php);
    })
    test('basic string methods', () => {
        const ts =
        "let a = 'test';\n" +
        "const w = a.toString();\n" + 
        "a+= \"mundo\"\n" +
        "const t = a.split (',');\n" +
        "const b = a.length;\n" +
        "const c = a.indexOf ('t');\n" +
        "const d = a.toUpperCase ();\n" +
        "const e = a.toLowerCase ();";
        const php =
        "$a = 'test';\n" +
        "$w = ((string) $a);\n" +
        "$a .= 'mundo';\n" +
        "$t = explode(',', $a);\n" +
        "$b = strlen($a);\n" +
        "$c = mb_strpos($a, 't');\n" +
        "$d = strtoupper($a);\n" +
        "$e = strtolower($a);";
        const output = transpiler.transpilePhp(ts).content;
        expect(output).toBe(php);
    })
    test('basic array manipulation', () => {
        const ts =
        "const myList = [1, 2, 3];\n" +
        "const b = 1 in myList;\n" +
        "const y = myList.join (',')\n" +
        "const i = myList.indexOf(1);\n" +
        "const listLength = myList.length;\n" +
        "const listFirst = myList[0];\n" +
        "myList.push (4);\n" +
        "myList.pop ();\n" +
        "myList.reverse ();\n" +
        "myList.shift ();"
        const php =
        "$myList = [1, 2, 3];\n" +
        "$b = is_array($myList) && array_key_exists(1, $myList);\n" +
        "$y = implode(',', $myList);\n" +
        "$i = array_search(1, $myList);\n" + 
        "$listLength = count($myList);\n" +
        "$listFirst = $myList[0];\n" +
        "$myList[] = 4;\n" +
        "array_pop($myList);\n" +
        "$myList = array_reverse($myList);\n" +
        "array_shift($myList);"
        const output = transpiler.transpilePhp(ts).content;
        expect(output).toBe(php);
    })
    test('basic conditional expression', () => {
        const ts =
        "const frase = \"ola\";\n" +
        "const test = frase ? frase.length : 0;"
        const php =
        "$frase = \'ola\';\n" +
        "$test = $frase ? strlen($frase) : 0;"
        const output = transpiler.transpilePhp(ts).content;
        expect(output).toBe(php);
    })
    test('basic object methods', () => {
        const ts =
        "const x = {};\n" +
        "const y = Object.keys (x);\n" +
        "const yy = Object.values (x);"
        const php =
        "$x = array();\n" +
        "$y = is_array($x) ? array_keys($x) : array();\n" +
        "$yy = is_array($x) ? array_values($x) : array();"
        const output = transpiler.transpilePhp(ts).content;
        expect(output).toBe(php);
    })
    test('basic instanceof statement', () => {
        const ts =
        "if (e instanceof NullResponse) {\n" +
        "    return [];\n" +
        "}"
        const php =
        "if ($e instanceof NullResponse) {\n" +
        "    return [];\n" +
        "}"
        const output = transpiler.transpilePhp(ts).content;
        expect(output).toBe(php);
    })
    test('basic typeof expressions', () => {
        const ts =
        "const response = \"foo\";\n" +
        "typeof response !== 'string'\n" +
        "typeof response === 'object'\n" +
        "typeof response === 'boolean'\n" +
        "typeof response === 'undefined'\n" +
        "typeof response === 'number'";
        const php =
        "$response = 'foo';\n" +
        "!is_string($response);\n" +
        "is_array($response);\n" +
        "is_bool($response);\n" +
        "$response === null;\n" +
        "(is_int($response) || is_float($response));";
        const output = transpiler.transpilePhp(ts).content;
        expect(output).toBe(php);
    })
    test('basic indexOf string [check existence]', () => {
        const ts =
        "const myString = \'bar\'\n" +
        "const exists = myString.indexOf (\"b\") >= 0;"
        const php =
        "$myString = 'bar';\n" +
        "$exists = mb_strpos($myString, 'b') !== false;"
        const output = transpiler.transpilePhp(ts).content;
        expect(output).toBe(php);
    })
    test('basic indexOf array [check existence]', () => {
        const ts =
        "const x = [1,2,3];\n" +
        "const y = x.indexOf(1) >= 0;"
        const php =
        "$x = [1, 2, 3];\n" +
        "$y = in_array(1, $x);"
        const output = transpiler.transpilePhp(ts).content;
        expect(output).toBe(php);
    })
    test('basic includes string', () => {
        const ts =
        "const myString = \'bar\'\n" +
        "const exists = myString.includes (\"b\");"
        const php =
        "$myString = 'bar';\n" +
        "$exists = str_contains($myString, 'b');"
        const output = transpiler.transpilePhp(ts).content;
        expect(output).toBe(php);
    })
    test('basic includes array', () => {
        const ts =
        "const x = [1,2,3];\n" +
        "const y = x.includes(1);"
        const php =
        "$x = [1, 2, 3];\n" +
        "$y = in_array(1, $x);"
        const output = transpiler.transpilePhp(ts).content;
        expect(output).toBe(php);
    })
    test('basic as expression', () => {
        const ts =
        "const x = 1;\n" +
        "const a = \"foo\";\n" +
        "const y = x as any;\n" +
        "const t = a as string;\n" +
        "const z = x as number;"
        const php =
        "$x = 1;\n" +
        "$a = 'foo';\n" +
        "$y = $x;\n" +
        "$t = $a;\n" +
        "$z = $x;" 
        const output = transpiler.transpilePhp(ts).content;
        expect(output).toBe(php);
    })
    test('basic postfixUnary expression', () => {
        const ts =
        "let x = 1;\n" +
        "x++;\n" +
        "let y = 1;\n" +
        "y--;"
        const php =
        "$x = 1;\n" +
        "$x++;\n" +
        "$y = 1;\n" +
        "$y--;"
        const output = transpiler.transpilePhp(ts).content;
        expect(output).toBe(php);
    });
    test('should snake_case function and method calls', () => {
        transpiler.setPhpUncamelCaseIdentifiers(true);
        const ts =
        "function camelCase () {\n" +
        "    this.myFunc()\n" +
        "    myFunc()\n" +
        "}";
        const php =
        "function camel_case() {\n" +
        "    $this->my_func();\n" +
        "    my_func();\n" +
        "}"
        const output = transpiler.transpilePhp(ts).content;
        expect(output).toBe(php);
        transpiler.setPhpUncamelCaseIdentifiers(false);
    })
    test('should convert Promise.all to Promise\\all', () => {
        transpiler.setPhpUncamelCaseIdentifiers(true);
        const ts =
        "let promises = [ this.fetchSwapAndFutureMarkets (params), this.fetchUSDCMarkets (params) ];\n" +
        "promises = await Promise.all (promises);";
        const php =
        "$promises = [$this->fetch_swap_and_future_markets($params), $this->fetch_usdc_markets($params)];\n" +
        "$promises = Async\\await(Promise\\all($promises));" 
        const output = transpiler.transpilePhp(ts).content;
        expect(output).toBe(php);
        transpiler.setPhpUncamelCaseIdentifiers(false);
    })
    test('should convert JS doc', () => {
        const ts =
        "function fetchStatus (params ) {\n" +
        "    /**\n" +
        "     * @method\n" +
        "     * @name aax#fetchStatus\n" +
        "     * @description the latest known information on the availability of the exchange API\n" +
        "     * @param {object} params extra parameters specific to the aax api endpoint\n" +
        "     * @returns {object} a [status structure]{@link https://docs.ccxt.com/en/latest/manual.html#exchange-status-structure}\n" +
        "     */\n" +
        "    return 1;\n" +
        "}";
        const php =
        "function fetchStatus($params) {\n" +
        "    /**\n" +
        "     * the latest known information on the availability of the exchange API\n" +
        "     * @param {array} params extra parameters specific to the aax api endpoint\n" +
        "     * @return {array} a {@link https://docs.ccxt.com/en/latest/manual.html#exchange-status-structure status structure}\n" +
        "     */\n" +
        "    return 1;\n" +
        "}";
        const output = transpiler.transpilePhp(ts).content;
        expect(output).toBe(php);
    })
    test('should convert regular comment', () => {
        const ts =
        "function test () {\n" +
        "    // comment 1\n" +
        "    // comment 2\n" +
        "    // comment 3\n" +
        "    const x = 1;\n" +
        "}";
        const php =
        "function test() {\n" +
        "    // comment 1\n" +
        "    // comment 2\n" +
        "    // comment 3\n" +
        "    $x = 1;\n" +
        "}";
        const output = transpiler.transpilePhp(ts).content;
        expect(output).toBe(php);
    })
    test('should convert leading and trailing comments', () => {
        const ts =
        "// I'm a leading comment\n" +
        "const z = \"my var\" // I'm a trailing comment\n" +
        "const a = \"bar\" // I'm second trailing comment\n";
        const php =
        "// I'm a leading comment\n" +
        "$z = 'my var'; // I'm a trailing comment\n" +
        "$a = 'bar'; // I'm second trailing comment";
        const output = transpiler.transpilePhp(ts).content;
        expect(output).toBe(php);
    })
    test('basic try-catch-block', () => {
        const ts =
        "try {\n" +
        "    const x = 1;\n" +
        "} catch (e) {\n" +
        "    console.log(e);\n" +
        "}"
        const php =
        "try {\n" +
        "    $x = 1;\n" +
        "} catch(Exception $e) {\n" +
        "    var_dump($e);\n" +
        "}"
        const output = transpiler.transpilePhp(ts).content;
        expect(output).toBe(php);
    })
    test('should remove cjs import from transpiled code', () => {
        const ts =
        "const {a,b,x} = require  ('ola')  \n" +
        "const myVar = a.b;";
        const php = "$myVar = $a->b;"
        const output = transpiler.transpilePhp(ts).content;
        expect(output).toBe(php);
    });
    test('should remove cjs exports from transpiled code', () => {
        const ts =
        "module.exports = {\n" +
        "    a,\n" +
        "    b,\n" +
        "    c,\n" +
        "}";
        const php = ""
        const output = transpiler.transpilePhp(ts).content;
        expect(output).toBe(php);
    });
    test('should transpile spread operator', () => {
        const ts =
        "const x = [1,2,3]\n" +
        "const y = [...x]"
        const php =
        "$x = [1, 2, 3];\n" +
        "$y = [...$x];"
        const output = transpiler.transpilePhp(ts).content;
        expect(output).toBe(php);
    });
    test('should transpile continue statement', () => {
        const ts =
        "while(true){\n"+
        "    continue;\n"+
        "}"
        const php =
        "while (true) {\n" +
        "    continue;\n" +
        "}"
        const output = transpiler.transpilePhp(ts).content;
        expect(output).toBe(php);
    });
    test('should transpile assert', () => {
        const ts =
        "assert(1+1, 'failed assertion')"
        const php =
        "assert(1 + 1, 'failed assertion');"
        const output = transpiler.transpilePhp(ts).content;
        expect(output).toBe(php);
    });
    test('transpile constants & imports', () => {
        const ts = "import { decimalToPrecision, ROUND, TRUNCATE, DECIMAL_PLACES, } from '../../somewhere.js';\n" +
        "const exc = new xyz ();\n" +
        "assert (exc.decimalToPrecision ('12.3456000', TRUNCATE, 100, DECIMAL_PLACES) === '12.3456');";
        const php = "$exc = new xyz();\n" +
        "assert($exc->decimalToPrecision('12.3456000', TRUNCATE, 100, DECIMAL_PLACES) === '12.3456');";
        const output = transpiler.transpilePhp(ts).content;
        expect(output).toBe(php);
    });
    test('should transpile Number.isInteger', () => {
        const ts = "Number.isInteger(1)";
        const php = "is_int(1);";
        const output = transpiler.transpilePhp(ts).content;
        expect(output).toBe(php);
    });
    test('should convert date.now()', () => {
        const ts = "Date.now();";
        const php = "round(microtime(true) * 1000);";
        const output = transpiler.transpilePhp(ts).content;
        expect(output).toBe(php);
    });
    test('should transpile file from path', () => {
        transpiler.setPhpUncamelCaseIdentifiers(true);
        const php = readFileSync ('./tests/files/output/php/test1.php', "utf8");
        const output = transpiler.transpilePhpByPath('./tests/files/input/test1.ts').content;
        transpiler.setPhpUncamelCaseIdentifiers(false);
        expect(output).toBe(php);
    });
    test('should convert delete', () => {
        const ts = "delete someObject[key];";
        const php = "unset($someObject[$key]);";
        const output = transpiler.transpilePhp(ts).content;
        expect(output).toBe(php);
    });
    test('should convert concat', () => {
        const ts = "y.concat(z)";
        const result = "array_merge($y, $z);";
        const output = transpiler.transpilePhp(ts).content;
        expect(output).toBe(result);
    });
    test('string literal', () => {
        const ts = "const x = \"foo, 'single', \\\"double\\\" \\t \\n \\r \\b \\f \";";
        const php = "$x = 'foo, \\\'single\\\', \"double\" \\t \\n \\r \\b \\f ';";
        const output = transpiler.transpilePhp(ts).content;
        expect(output).toBe(php);
    });
    test('should convert isArray', () => {
        const ts = "Array.isArray(x);";
        const result = "gettype($x) === 'array' && array_is_list($x);";
        const output = transpiler.transpilePhp(ts).content;
        expect(output).toBe(result);
    });
  });
