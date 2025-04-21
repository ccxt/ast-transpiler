import { assert } from 'console';
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
        'go': {
            'parser': {
                'NUM_LINES_END_FILE': 0,
            }
        }
    }
    transpiler = new Transpiler(config);
})

describe('go transpiling tests', () => {
    test('basic variable declaration', () => {
        const ts = "const x = 1;"
        const go = "var x interface{} = 1"
        const output = transpiler.transpileGo(ts).content;
        expect(output).toBe(go);
    });
    test('basic while loop', () => {
        const ts =
        "while (true) {\n" +
        "    const x = 1;\n" +
        "    break;\n" +
        "}"
        const go =
        "for true {\n" +
        "    var x interface{} = 1\n" +
        "    break\n" +
        "}";
        const output = transpiler.transpileGo(ts).content;
        expect(output).toBe(go);
    });
    test('basic class declaration', () => {
        const ts =
        "class Test {\n" +
        "    main() {\n" +
        "        return 1\n" +
        "    }\n" +
        "}";
        const go =
        "type Test struct {\n"+
        "\n"+
        "}\n"+
        "\n"+
        "func NewTest() Test {\n"+
        "   p := Test{}\n"+
        "   setDefaults(&p)\n"+
        "   return p\n"+
        "}\n"+
        "\n"+
        "func  (this *Test) Main() interface{}  {\n"+
        "    return 1\n"+
        "}";
        const output = transpiler.transpileGo(ts).content;
        expect(output).toBe(go);
    });
    test('falsy values', () => {
        const ts =
        "const a = \"hi\";\n" +
        "const b = false;\n" +
        "const c =  a && b;\n" +
        "const d = !a && !b;\n" +
        "const e = (a || !b);\n" +
        "if (a) {\n" +
        "    const f = 1;\n" +
        "}";
        const go =
        "var a interface{} = \"hi\"\n" +
        "var b interface{} = false\n" +
        "var c interface{} = IsTrue(a) && IsTrue(b)\n" +
        "var d interface{} = !IsTrue(a) && !IsTrue(b)\n" +
        "var e interface{} = (IsTrue(a) || !IsTrue(b))\n" +
        "if IsTrue(a) {\n" +
        "    var f interface{} = 1\n" +
        "}"
        const output = transpiler.transpileGo(ts).content;
        expect(output).toBe(go);
    });
    // test('basic try catch', () => {
    //     assert true
    //     const ts =
    //     "class A {\n" +
    //     "    main() {\n" +
    //     "        try {\n" +
    //     "            if (1 == 1+1) {\n" +
    //     "                return 1\n" +
    //     "            }\n" +
    //     "        } catch (e) {\n" +
    //     "            return 2\n" +
    //     "        }\n" +
    //     "    }\n" +
    //     "}";
    //     const go =
    // "type A struct {\n"+
    // "\n"+
    // "}\n"+
    // "\n"+
    // "func NewA() A {\n"+
    // "   p := A{}\n"+
    // "   setDefaults(&p)\n"+
    // "   return p\n"+
    // "}\n"+
    // "\n"+
    // "func  (this *A) Main() interface{}  {\n"+
    // "    \n"+
    // "    {		ret__ := func(this *A) (ret_ interface{}) {\n"+
    // "    		defer func() {\n"+
    // "    			if e := recover().(interface{}); e != nil {\n"+
    // "                    if e == \"break\" {\n"+
    // "    				    return\n"+
    // "    			    }\n"+
    // "    				ret_ = func(this *A) interface{} {\n"+
    // "    					// catch block:\n"+
    // "                                return 2\n"+
    // "                     return nil\n"+
    // "    				}(this)\n"+
    // "    			}\n"+
    // "    		}()\n"+
    // "    		// try block:\n"+
    // "                    if IsTrue(IsEqual(1, Add(1, 1))) {\n"+
    // "                return 1\n"+
    // "            }\n"+
    // "    		return nil\n"+
    // "    	}(this)\n"+
    // "    	if ret__ != nil {\n"+
    // "    		return ret__\n"+
    // "    	}\n"+
    // "    }\n"+
    // "}";
    //     const output = transpiler.transpileGo(ts).content;
    //     expect(output).toBe(go);
    // });
    test('should convert concat', () => {
        const ts = "y.concat(z)";
        const result = "Concat(y, z)";
        const output = transpiler.transpileGo(ts).content;
        expect(output).toBe(result);
    });
    test('should transpile spread operator when passed to function', () => {
        const ts =
            "const x = [1,2,3]\n" +
            "foo(...x)";
        const go =
            "var x interface{} = []interface{}{1, 2, 3}\n" +
            "Foo(x...)";
        const output = transpiler.transpileGo(ts).content;
        expect(output).toBe(go);
    });
});
