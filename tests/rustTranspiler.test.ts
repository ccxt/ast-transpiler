import { Transpiler } from '../src/transpiler';
import { readFileSync } from 'fs';

jest.mock('module',()=>({
    __esModule: true,                 // this makes it work
    default: jest.fn()
  }));

let transpiler: Transpiler;

beforeAll(() => {
    const config = {
        'verbose': true,
        'rust': {
            'parser': {
                'NUM_LINES_END_FILE': 0,
                "ELEMENT_ACCESS_WRAPPER_OPEN": "getValue(",
                "ELEMENT_ACCESS_WRAPPER_CLOSE": ")"

            }
        }
    }
    transpiler = new Transpiler(config);
})

describe('rust transpiling tests', () => {
    test('basic variable declaration', () => {
        const ts = "const x = 1;"
        const rust = "let x: i32 = 1;"
        const output = transpiler.transpileRust(ts).content;
        expect(output).toBe(rust);
    });
    test('basic while true loop', () => {
        const ts =
        "while (true) {\n" +
        "    const x = 1;\n" +
        "    break;\n" +
        "}"
        
        const rust =
        'loop  {\n let x: i32 = 1;\n break;\n}'
       
        const output = transpiler.transpileRust(ts).content;
        expect(output).toBe(rust);
    });
    test('basic for loop', () => {
        const ts =
        "for (let i = 0; i < 10; i++) {\n" +
        "    break;\n" +
        "}"
        const rust =
       'let mut i: i32 = 0;\n'+
       'while i < 10 {\n break;\n i+=1\n}'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toBe(rust);
    });
    test('basic method declaration', () => {
        const ts =
        "class T {\n" +
        "    test(): void {\n" +
        "        console.log(\"Hello\")\n" +
        "    }\n" +
        "}"
        const rust ='struct T{\n\n}\nimpl T {\n  pub fn test(&self) {\n   println!("Hello");\n  }\n}\n'

      
        
        const output = transpiler.transpileRust(ts).content;
        expect(output).toBe(rust);
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
        const cs =''
        

        const output = transpiler.transpileRust(ts).content;
        expect(output).toBe(cs);
    });
    test ('basic new type',()=>{
        const ts = 'const person1 = new Person("Alice", 30);'
        const rust = 'let person1 = Person::new("Alice", 30);'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toBe(rust);
    })
    test('basic basic declaration with default parameters', () => {
        const ts = 
        "class T {\n" +
        "    test(s: string): void {\n" +
        "        console.log(\"Hello\")\n" +
        "    }\n" +
        "}"
        const rust =
        "struct T{\n\n}\nimpl T {\n    pub fn test(&self, s: String) {\n        println!(\"Hello\");\n    }\n}\n"
        const output = transpiler.transpileRust(ts).content;
        expect(output).toBe(rust);
    });
    test('basic class inheritance', () => {
        const ts =
        "class t extends ParentClass {\n" +
        "    method () {\n" +
        "\n" +
        "    }\n" +
        "}";
        const rust =
        "#[inherit((ParentClass)]\n"+
        "struct t{\n\n}\n"+
        "impl t {\n"+
        "  pub fn method(&self) {\n\n  }\n}\n";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toBe(rust);
    });
    test('basic identation check [nested if]', () => {
        const ts =
        "if (1) {\n" +
        "    if (2) {\n" +
        "        if (3) {\n" +
        "            if (4) {\n" +
        "                let x = 1;\n" +
        "            }\n" +
        "        }\n" +
        "    }\n" +
        "}";
        const rust = 'if 1 {\n if 2 {\n  if 3 {\n   if 4 {\n    let mut x: i32 = 1;\n   }\n  }\n }\n}'
        
        const output = transpiler.transpileRust(ts).content;
        expect(output).toBe(rust);
    });
    test('basic identation check [if-else-if]', () => {
        const ts =
        "if (false) {\n" +
        "  console.log(\"if\")\n" +
        "} else if (false) {\n" +
        "    console.log(\"else if\")\n" +
        "} else {\n" +
        "    console.log(\"else\")\n" +
        "}"
        const rust =
        'if false {\n println!("if");\n} else if false {\n println!("else if");\n} else {\n println!("else");\n}';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toBe(rust);
    });
    test('basic async function declaration [no args]', () => {
        const ts =
        "class t {\n" +
        "    \n" +
        "    async fn (): Promise<void> {\n" +
        "        const x = await this.asyncMethod();\n" +
        "        console.log(\"1\");\n" +
        "    }\n" +
        "}"
        const rust =
        'struct t{\n\n}\n'+
        'impl t {\n  async pub fn fn(&self) {\n'+
        '   let x = self.asyncMethod().await;\n'+
        '   println!("1");\n'+
        '  }\n}\n'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toBe(rust);
    });
    test('basic function declaration [with typed args]', () => {
        // to do add support for typed arrays and objects
        const ts =
        "class t {\n" +
        "    parseOrder (a: string, b: number, c: boolean) {\n" +
        "        console.log(\"here\");\n" +
        "    }\n" +
        "}";
        const rust =
        'struct t{\n\n}\n'+
        'impl t {\n'+
        '  pub fn parseOrder(&self, a: String, b: _, c: bool) {\n'+
        '   println!("here");\n  }\n}\n'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toBe(rust);
    });
    test('basic function declaration [with initialized args]', () => {
        const ts =
        "class t {\n" +
        "    parseOrder (a = \"hi\", b = 3, bb= 3.2, c = false, d = [], e = {}) {\n" +
        "        // I'm a comment\n" +
        "        console.log(\"here\");\n" +
        "    }\n" +
        "}";
        const rust = 
        'struct t{\n\n}\n'+
        'impl t {\n  pub fn parseOrder(&self, a: String = "hi", b: i32 = 3, bb: f64 = 3.2, c: bool = false, d: Vec = vec![], e: serde_json::Value = {}) {\n   // I\'m a comment\n   println!("here");\n  }\n}\n'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toBe(rust);
    });
    test('basic async function declaration [with typed return type]', () => {
        const ts =
        "class t {\n" +
        "    method (s:string): number {\n" +
        "        return 1;\n" +
        "    }\n" +
        "    method2(): void {\n" +
        "        console.log(1)\n" +
        "    }\n" +
        "    method3(): string {\n" +
        "        return \"1\"\n" +
        "    }\n" +
        "    async method4(): Promise<string> {\n" +
        "        return \"1\"\n" +
        "    }\n" +
        "    async method5(): Promise<object> {\n" +
        "        return {\n" +
        "            \"foo\": \"bar\"\n" +
        "        };\n" +
        "    }\n" +
        "}"
        const rust =
        'struct t{\n\n}\n'+
        'impl t {\n'+
        '  pub fn method(&self, s: String) {\n'+
        '   return 1;\n  }\n'+
        '  pub fn method2(&self) {\n'+
        '   println!(1);\n  }\n'+
        '  pub fn method3(&self) {\n'+
        '   return "1";\n  }\n'+
        '  async pub fn method4(&self) {\n'+
        '   return "1";\n  }\n'+
        '  async pub fn method5(&self) {\n'+
        '   return json!({\n    "foo": "bar",\n   ");\n'+
        '  }\n'+
        '}\n'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toBe(rust);
    });
    test('basic function declaration [with inferred return type]', () => {
        const ts =
        "class t {\n" +
        "    method1() {\n" +
        "        console.log(1);\n" +
        "    }\n" +
        "    method2() {\n" +
        "        return 1;\n" +
        "    }\n" +
        "    method3() {\n" +
        "        return \"1\";\n" +
        "    }\n" +
        "    method4() {\n" +
        "        return true;\n" +
        "    }\n" +
        "    async method5() {\n" +
        "        return \"1\";\n" +
        "    }\n" +
        "    async method6() {\n" +
        "        return {\n" +
        "            \"foo\": 1\n" +
        "        }\n" +
        "    }\n" +
        "}"
        const rust =
        'struct t{\n\n}\n'+
        'impl t {\n  pub fn method1(&self) {\n'+
        '   println!(1);\n  }\n'+
        '  pub fn method2(&self) {\n   return 1;\n  }\n'+
        '  pub fn method3(&self) {\n   return "1";\n  }\n'+
        '  pub fn method4(&self) {\n   return true;\n  }\n'+
        '  pub fn method5(&self) {\n   return "1";\n  }\n'+
        '  pub fn method6(&self) {\n   return {\n    "foo": 1,\n   };\n'+
        '  }\n}\n'
     
        const output = transpiler.transpileRust(ts).content;
        expect(output).toBe(rust);
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
        const output = transpiler.transpileRust(ts).content;
        expect(output).toBe(cs);
    });
    test('function expression transpilation', () => {
        const ts =
        "const consumer = function consumer(a) {\n" +
        "    return;\n" +
        "};";
        const rust =
        "void consumer(object a)\n" +
        "{\n" +
        "    return;\n" +
        "};";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toBe(rust);
    });
    test('basic class with constructor', () => {
        const ts =
        "class teste extends Test {\n" +
        "    constructor(config = {}) {\n" +
        "        console.log('teste');\n" +
        "        super(config)\n" +
        "    }\n" +
        "}"
        const rust =
        "class teste : Test\n" +
        "{\n" +
        "    teste(object config = null) : base(config)\n" +
        "    {\n" +
        "        config ??= new Dictionary<string, object>();\n" +
        "        Console.WriteLine(\"teste\");\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileRust(ts).content;
        expect(output).toBe(rust);
    });
    test('basic dictonary', () => {
        const ts =
        "const types = {\n" +
        "    'limit': 'limit',\n" +
        "    'market': 'market',\n" +
        "    'margin': 'margin',\n" +
        "}\n" 
        const rust =
        'let types: serde_json::Value = json!({\n "limit": "limit",\n "market": "market",\n "margin": "margin",\n");'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toBe(rust);
    });
    test('basic binary expressions', () => {
        const ts =
        "const a = 1 + 1;\n" +
        "const b = 2 * 2;\n" +
        "const c = 3 / 3;\n" +
        "const d = 4 - 4;\n" +
        "const e = 5 % 5;\n" +
        "const f = \"foo\" + \"bar\";\n";
        const rust =
        'let a = 1 + 1;\n'+
        'let b = 2 * 2;\n'+
        'let c = 3 / 3;\n'+
        'let d = 4 - 4;\n'+
        'let e = 5 % 5;\n'+
        'let f = "foo" + "bar";'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toBe(rust);
    })
    test('basic conditions expressions', () => {
        const ts =
        "const a = true;\n" +
        "const b = false;\n" +
        "const c = true;\n" +
        "const d = (a && b) || (c && !b);\n" 
        const rust =
        'let a: bool = true;\nlet b: bool = false;\nlet c: bool = true;\nlet d = (a && b) || (c && !b);'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toBe(rust);
    })
    // test('Should wrap falsy/truthy expressions [with the defined wrapper]', () => {
    //     const ts =
    //     "const a = \"hi\";\n" +
    //     "const b = false;\n" +
    //     "const c =  a && b;\n" +
    //     "const d = !a && !b;\n" +
    //     "const e = (a || !b);\n" +
    //     "if (a) {\n" +
    //     "    const f = 1;\n" +
    //     "}"
    //     const rust =
    //     "object a = \"hi\";\n" +
    //     "object b = false;\n" +
    //     "object c = isTrue(a) && isTrue(b);\n" +
    //     "object d = !isTrue(a) && !isTrue(b);\n" +
    //     "object e = (isTrue(a) || !isTrue(b));\n" +
    //     "if (isTrue(a))\n" +
    //     "{\n" +
    //     "    object f = 1;\n" +
    //     "}"
    //     const output = transpiler.transpileRust(ts).content;
    //     expect(output).toBe(rust);
    // })
    test('basic element access expression', () => {
        const ts =
        "const x = {};\n" +
        "x[\"teste\"] = 1;";
        const rust =
        "object x = new Dictionary<string, object>() {};\n" +
        "((IDictionary<string,object>)x)[\"teste\"] = 1;";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toBe(rust);
    })
    test('should wrap right side of element access expression', () => {
        const ts =
        "let a = {};\n" +
        "const b = a[\"teste\"]\n" +
        "a[\"b\"] = a[\"teste\"];"
        const rust =
        "object a = new Dictionary<string, object>() {};\n" +
        "object b = getValue(a, \"teste\");\n" +
        "((IDictionary<string,object>)a)[\"b\"] = getValue(a, \"teste\");"
        const output = transpiler.transpileRust(ts).content;
        expect(output).toBe(rust);
    })
    test('basic throw statement', () => {
        const ts =
        "function test () {\n" +
        "    throw new InvalidOrder (\"error\")\n" +
        "}";
        const rust =
        "function test() {\n" +
        "    throw new InvalidOrder('error');\n" +
        "}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toBe(rust);
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
        const rust =
        "object a = 1;\n" +
        "object b = add(1, 1);\n" +
        "object c = isEqual(a, b);\n" +
        "object d = !isEqual(a, b);\n" +
        "object e = isLessThan(a, b);\n" +
        "object f = isGreaterThan(a, b);\n" +
        "object g = isGreaterThanOrEqual(a, b);\n" +
        "object h = isLessThanOrEqual(a, b);"
        const output = transpiler.transpileRust(ts).content;
        expect(output).toBe(rust);
    })
    test('basic math functions', () => {
        const ts =
        "const num = 5\n" + 
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
        const rust =
        "object num = 5;\n" +
        "object ceil = Math.Ceiling((double)num);\n" +
        "object a = mathMin(0, 5);\n" +
        "object b = mathMax(0, 5);\n" +
        "object c = parseFloat(\"1.3\");\n" +
        "object d = parseInt(\"1.3\");\n" +
        "object e = Int32.MaxValue;\n" +
        "object f = Math.Abs((double)-2);\n" +
        "object g = Math.Pow((double)1, (double)2);\n" +
        "object h = Math.Round((double)5);\n" +
        "object i = Math.Floor((double)5.5);"
        const output = transpiler.transpileRust(ts).content;
        expect(output).toBe(rust);
    })
    test('basic json methods', () => {
        const ts =
        "const j = JSON.stringify ({ 'a': 1, 'b': 2 });\n" +
        "const k = JSON.parse (j);\n";
        const rust =
        "$j = json_encode(array(\n" +
        "    'a' => 1,\n" +
        "    'b' => 2,\n" +
        "));\n" +
        "$k = json_decode($j, $as_associative_array = true);";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toBe(rust);
    })
    test('string length', () => {
        const ts =
        "const myStr = \"test\";\n" +
        "const ff = myStr.length;"
        const rust =
        "object myStr = \"test\";\n" +
        "object ff = ((string)myStr).Length;"
        const output = transpiler.transpileRust(ts).content;
        expect(output).toBe(rust);
    })
    test('array length', () => {
        const ts =
        "const myArray = [1, 2, 3];\n" +
        "const aa = myArray.length;"
        const rust =
        "object myArray = new List<object>() {1, 2, 3};\n" +
        "object aa = getArrayLength(myArray);"
        const output = transpiler.transpileRust(ts).content;
        expect(output).toBe(rust);
    })
    test('basic string methods', () => {
        const ts =
        "let a = \"test\";\n" +
        "const w = a.toString();\n" +
        "a+= \"mundo\";\n" +
        "const t = a.split(\",\");\n" +
        "const b = a.length;\n" +
        "const c = a.indexOf(\"t\");\n" +
        "const d = a.toLowerCase();\n" +
        "const e = a.toUpperCase();"
        const rust =
        "object a = \"test\";\n" +
        "object w = a.ToString();\n" +
        "a += \"mundo\";\n" +
        "object t = ((string)a).Split(\",\").ToList<string>();\n" +
        "object b = ((string)a).Length;\n" +
        "object c = getIndexOf(a, \"t\");\n" +
        "object d = ((string)a).ToLower();\n" +
        "object e = ((string)a).ToUpper();"
        const output = transpiler.transpileRust(ts).content;
        expect(output).toBe(rust);
    })
    test('basic array manipulation', () => {
        const ts =
        "const myList = [1, 2, 3];\n" +
        "const y = myList.join (',')\n" +
        "const i = myList.indexOf(1);\n" +
        "const listLength = myList.length;\n" +
        "const listFirst = myList[0];\n" +
        "myList.push (4);\n" +
        "myList.pop ();\n" +
        "myList.reverse ();\n" +
        "myList.shift ();"
        const rust =
        "$myList = [1, 2, 3];\n" +
        "$y = implode(',', $myList);\n" +
        "$i = array_search(1, $myList);\n" + 
        "$listLength = count($myList);\n" +
        "$listFirst = $myList[0];\n" +
        "$myList[] = 4;\n" +
        "array_pop($myList);\n" +
        "array_reverse($myList);\n" +
        "array_shift($myList);"
        const output = transpiler.transpileRust(ts).content;
        expect(output).toBe(rust);
    })
    test('basic conditional expression', () => {
        const ts =
        "const frase = \"ola\";\n" +
        "const testN = frase.length > 0 ? frase.length : 0;"
        const rust =
        "object frase = \"ola\";\n" +
        "object testN = isGreaterThan(((string)frase).Length, 0) ? ((string)frase).Length : 0;" 
        const output = transpiler.transpileRust(ts).content;
        expect(output).toBe(rust);
    })
    test('basic object methods', () => {
        const ts =
        "const x = {};\n" +
        "const y = Object.keys(x);\n" +
        "const z = Object.values(x);"
        const rust =
        "object x = new Dictionary<string, object>() {};\n" +
        "object y = new List<string>(((Dictionary<string,object>)x).Keys);\n" +
        "object z = new List<object>(((Dictionary<string,object>)x).Values);"
        const output = transpiler.transpileRust(ts).content;
        expect(output).toBe(rust);
    })
    test('basic instanceof statement', () => {
        const ts =
        "if (e instanceof NullResponse) {\n" +
        "    return [];\n" +
        "}"
        const rust =
        "if (e instanceof NullResponse) {\n" +
        "    return [];\n" +
        "}"
        const output = transpiler.transpileRust(ts).content;
        expect(output).toBe(rust);
    })
    test('basic typeof expressions', () => {
        const ts =
        "const response = \"foo\";\n" +
        "typeof response !== 'string'\n" +
        "typeof response === 'object'\n" +
        "typeof response === 'boolean'\n" +
        "typeof response === 'number'";
        const rust =
        "$response = 'foo';\n" +
        "!is_string($response);\n" +
        "is_array($response);\n" +
        "is_bool($response);\n" +
        "(is_int($response) || is_float($response));";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toBe(rust);
    })
    test('basic indexOf string [check existence]', () => {
        const ts =
        "const myString = \'bar\'\n" +
        "const exists = myString.indexOf (\"b\") >= 0;"
        const rust =
        "$myString = 'bar';\n" +
        "$exists = mb_strpos($myString, 'b') !== false;"
        const output = transpiler.transpileRust(ts).content;
        expect(output).toBe(rust);
    })
    test('basic indexOf array [check existence]', () => {
        const ts =
        "const x = [1,2,3];\n" +
        "const y = x.indexOf(1) >= 0;"
        const rust =
        "$x = [1, 2, 3];\n" +
        "$y = in_array(1, $x);"
        const output = transpiler.transpileRust(ts).content;
        expect(output).toBe(rust);
    })
    test('basic includes string', () => {
        const ts =
        "const myString = \'bar\'\n" +
        "const exists = myString.includes (\"b\");"
        const rust =
        "object myString = \"bar\";\n" +
        "object exists = myString.Contains(\"b\");"
        const output = transpiler.transpileRust(ts).content;
        expect(output).toBe(rust);
    })
    test('basic includes array', () => {
        const ts =
        "const x = [1,2,3];\n" +
        "const y = x.includes(1);"
        const rust =
        "object x = new List<object>() {1, 2, 3};\n" +
        "object y = x.Contains(1);"
        const output = transpiler.transpileRust(ts).content;
        expect(output).toBe(rust);
    })
    test('basic as expression', () => {
        const ts =
        "const x = 1;\n" +
        "const a = \"foo\";\n" +
        "const y = x as any;\n" +
        "const t = a as string;\n" +
        "const z = x as number;"
        const rust =
        "object x = 1;\n" +
        "object a = \"foo\";\n" +
        "object y = ((object)x);\n" +
        "object t = ((string)a);\n" +
        "object z = x;" 
        const output = transpiler.transpileRust(ts).content;
        expect(output).toBe(rust);
    })
    test('basic postfixUnary expression', () => {
        const ts =
        "let x = 1;\n" +
        "x++;\n" +
        "let y = 1;\n" +
        "y--;"
        const rust =
        "let x = 1;\n" +
        "x+=1;\n" +
        "let y = 1;\n" +
        "y-=1;"
        const output = transpiler.transpileRust(ts).content;
        expect(output).toBe(rust);
    });
    test('should convert Promise.all to Promise\\all', () => {
        transpiler.setPhpUncamelCaseIdentifiers(true);
        const ts =
        "let promises = [ this.fetchSwapAndFutureMarkets (params), this.fetchUSDCMarkets (params) ];\n" +
        "promises = await Promise.all (promises);";
        const rust =
        "$promises = [$this->fetch_swap_and_future_markets($params), $this->fetch_usdc_markets($params)];\n" +
        "$promises = Async\\await(Promise\\all($promises));" 
        const output = transpiler.transpileRust(ts).content;
        expect(output).toBe(rust);
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
        const rust =
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
        const output = transpiler.transpileRust(ts).content;
        expect(output).toBe(rust);
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
        const rust =
        'struct t{\n\n}\nimpl t {\n  pub fn fn(&self) {\n   // my comment 1\n   // my comment 2\n   println!("Hello World!");\n  }\n}\n'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toBe(rust);
    })
    test('should convert leading and trailing comments', () => {
        const ts =
        "// I'm a leading comment\n" +
        "const z = \"my var\" // I'm a trailing comment\n" +
        "const a = \"bar\" // I'm second trailing comment\n";
        const rust =
        "// I'm a leading comment\n" +
        "object z = \"my var\"; // I'm a trailing comment\n" +
        "object a = \"bar\"; // I'm second trailing comment";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toBe(rust);
    })
    test('should keep function comments', () => {
        const ts =
        "class t {\n" +
        "    // this is a comment\n" +
        "    parseToInt (number: string) {\n" +
        "        // Solve Common parseInt misuse ex: parseInt ((since / 1000).toString ())\n" +
        "        // using a number as parameter which is not valid in ts\n" +
        "        const stringifiedNumber = number.toString ();\n" +
        "        const convertedNumber = parseFloat (stringifiedNumber) as any;\n" +
        "        return parseInt (convertedNumber);\n" +
        "    }\n" +
        "}"
        const rust =
        "class t\n" +
        "{\n" +
        "    // this is a comment\n" +
        "    public virtual object parseToInt(string number)\n" +
        "    {\n" +
        "        // Solve Common parseInt misuse ex: parseInt ((since / 1000).toString ())\n" +
        "        // using a number as parameter which is not valid in ts\n" +
        "        object stringifiedNumber = number.ToString();\n" +
        "        object convertedNumber = float.Parse(stringifiedNumber);\n" +
        "        return Int32.Parse(convertedNumber);\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileRust(ts).content;
        expect(output).toBe(rust);
    })
    test('basic try-catch-block', () => {
        const ts =
        "try {\n" +
        "    const x = 1;\n" +
        "} catch (e) {\n" +
        "    console.log(e);\n" +
        "}"
        const rust =
        "try\n{\n" +
        "    object x = 1;\n" +
        "} catch(Exception e)\n{\n" +
        "    Console.WriteLine(e);\n" +
        "}"
        const output = transpiler.transpileRust(ts).content;
        expect(output).toBe(rust);
    })
    test('should remove cjs import from transpiled code', () => {
        const ts =
        "const {a,b,x} = require  ('ola')  \n" +
        "const myVar = a.b;";
        const rust = "object myVar = a.b;"
        const output = transpiler.transpileRust(ts).content;
        expect(output).toBe(rust);
    });
    test('should remove cjs exports from transpiled code', () => {
        const ts =
        "module.exports = {\n" +
        "    a,\n" +
        "    b,\n" +
        "    c,\n" +
        "}";
        const rust = ""
        const output = transpiler.transpileRust(ts).content;
        expect(output).toBe(rust);
    });
    test('advanced: should infer arg type from parent method', () => {
        const ts =
        "class a {\n" +
        "\n" +
        "    main(a:string) {\n" +
        "        return \"1\";\n" +
        "    }\n" +
        "}\n" +
        "\n" +
        "class b extends a{\n" +
        "    main(a) {\n" +
        "        return \"2\";\n" +
        "    }\n" +
        "}"
        const rust = 
        "class a\n" +
        "{\n" +
        "    public virtual string main(string a)\n" +
        "    {\n" +
        "        return ((string) (\"1\"));\n" +
        "    }\n" +
        "}\n" +
        "class b : a\n" +
        "{\n" +
        "    public override string main(string a)\n" +
        "    {\n" +
        "        return ((string) (\"2\"));\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileRust(ts).content;
        expect(output).toBe(rust);
    });
    test('should transpile Number.isInteger', () => {
        const ts = "Number.isInteger(1)";
        const rust = "((1 is int) || (1 is long) || (1 is Int32) || (1 is Int64));";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toBe(rust);
    });
    test('should convert date.now()', () => {
        const ts = "Date.now();";
        const rust = "(new DateTimeOffset(DateTime.UtcNow)).ToUnixTimeMilliseconds();";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toBe(rust);
    });
    test('should convert delete', () => {
        const ts = "delete someObject[key];";
        const rust = "((IDictionary<string,object>)someObject).Remove((string)key);";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toBe(rust);
    });
    test('should convert concat', () => {
        const ts = "y.concat(z)";
        const result = "concat(y, z);";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toBe(result);
    });
    test('string literal', () => {
        const ts = "const x = \"foo, 'single', \\\"double\\\" \\t \\n \\r \\b \\f \";";
        const rust = "object x = \"foo, 'single', \\\"double\\\" \\t \\n \\r \\b \\f \";";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toBe(rust);
    });
    test('should convert isArray', () => {
        const ts = "Array.isArray(x);";
        const result = "((x is IList<object>) || (x.GetType().IsGenericType && x.GetType().GetGenericTypeDefinition().IsAssignableFrom(typeof(List<>))));";
        const output = transpiler.transpileRust(result).content;
        expect(output).toBe(result);
    });
    test('should transpile file from path', () => {
        transpiler.setPhpUncamelCaseIdentifiers(true);
        const rust = readFileSync ('./tests/files/output/php/test1.php', "utf8");
        const output = transpiler.transpileRustByPath('./tests/files/input/test1.ts').content;
        transpiler.setPhpUncamelCaseIdentifiers(false);
        expect(output).toBe(rust);
    });
    test('should convert search', () => {
        const ts = '"abcdxtzyw".search("xt");';
        const rust = '((string)"abcdxtzyw").IndexOf("xt");';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toBe(rust);
    });
  });
