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
        const go = "var x any = 1"
        const output = transpiler.transpileGo(ts).content;
        expect(output).toBe(go);
    });
    test('string literal escaping', () => {
        const ts = 'const x = "foo, \'single\', \\"double\\" \\t \\n \\r \\b \\f \\\\ ";'
        const go = 'var x any = "foo, \'single\', \\"double\\" \\t \\n \\r \\b \\f \\\\ "'
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
        "    var x any = 1\n" +
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
        "func NewTest() *Test {\n"+
        "    p := &Test{}\n"+
        "    setDefaults(p)\n"+
        "    return p\n"+
        "}\n"+
        "\n"+
        "func  (this *Test) Main() any  {\n"+
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
        "var a any = \"hi\"\n" +
        "var b any = false\n" +
        "var c any = IsTrue(a) && IsTrue(b)\n" +
        "var d any = !IsTrue(a) && !IsTrue(b)\n" +
        "var e any = (IsTrue(a) || !IsTrue(b))\n" +
        "if IsTrue(a) {\n" +
        "    var f any = 1\n" +
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
    // "func  (this *A) Main() any  {\n"+
    // "    \n"+
    // "    {		ret__ := func(this *A) (ret_ any) {\n"+
    // "    		defer func() {\n"+
    // "    			if e := recover().(any); e != nil {\n"+
    // "                    if e == \"break\" {\n"+
    // "    				    return\n"+
    // "    			    }\n"+
    // "    				ret_ = func(this *A) any {\n"+
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
            "var x any = []any{1, 2, 3}\n" +
            "Foo(x...)";
        const output = transpiler.transpileGo(ts).content;
        expect(output).toBe(go);
    });
    test('non-async Promise-returning delegator transpiles like async return await', () => {
        // a method without `async` that returns a Promise (e.g. WS delegators
        // like `watchTicker(...) { return this.watchTickerInner(...); }`)
        // must produce the exact same Go as its `async`/`return await` twin:
        // channel-wrapped body with `<-` receive + PanicOnError on the result.
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
        const output = transpiler.transpileGo(input).content;
        // extract each method body
        const methods = output.split(/func\s+\(this \*Exchange\)/).slice(1);
        expect(methods.length).toBe(3);
        const [inner, delegator, classic] = methods;
        // the delegator must be channel-wrapped and receive from the inner channel
        expect(delegator).toContain("ch := make(chan any, 1)");
        expect(delegator).toContain("<-this.WatchTickerInner(symbol)");
        expect(delegator).toContain("PanicOnError(retRes");
        // must NOT return the raw channel of the inner call
        expect(delegator).not.toContain("ch <- this.WatchTickerInner");
        // normalized (method name + line-based retRes suffix stripped), the
        // delegator must be identical to the classic async/return await version
        const normalize = (s: string) => s
            .replace(/retRes\d+/g, 'retRes')
            .replace(/WatchTickerClassic|WatchTicker\b/g, 'METHOD')
            .trim();
        expect(normalize(delegator)).toBe(normalize(classic));
        void inner;
    });
    test('async method result channel is buffered with capacity 1', () => {
        // the generated async core deposits exactly one value and returns.
        // With an unbuffered channel the goroutine blocks on `ch <- ...` until
        // somebody receives, so an abandoned result leaks the goroutine forever.
        // Capacity 1 lets the producer deposit-and-exit for this one-shot,
        // promise-like channel.
        const input =
        "class Exchange {\n" +
        "    async fetchTicker(symbol: string): Promise<any> {\n" +
        "        return { 'symbol': symbol };\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileGo(input).content;
        expect(output).toContain("ch := make(chan any, 1)");
        expect(output).not.toContain("ch := make(chan any)");
    });
    test('async method body is emitted flat, without a nested goroutine', () => {
        // the async core used to run inside `go func() any { ... }()`. Since the
        // channel is buffered (cap 1) the single send never blocks, so the extra
        // goroutine bought nothing: it only added a scheduling hop, hid the body
        // one indentation level deeper and made stack traces useless.
        const input =
        "class Exchange {\n" +
        "    async fetchTicker(symbol: string): Promise<any> {\n" +
        "        return { 'symbol': symbol };\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileGo(input).content;
        // no nested goroutine, and therefore no closure to close over
        expect(output).not.toContain("go func()");
        // the core is inline: channel, named result, defers, body, return
        expect(output).toContain("ch := make(chan any, 1)");
        expect(output).toContain("out = ch");
        expect(output).toContain("defer close(ch)");
        expect(output).toContain("defer ReturnPanicError(ch)");
        expect(output).toContain("ch <- map[string]any");
        // the statements appear in that exact order
        const order = [
            "ch := make(chan any, 1)",
            "out = ch",
            "defer close(ch)",
            "defer ReturnPanicError(ch)",
            "ch <- map[string]any",
        ].map((needle) => output.indexOf(needle));
        expect(order).toEqual([...order].sort((a, b) => a - b));
        expect(Math.min(...order)).toBeGreaterThan(-1);
    });
    test('async method declares a named result channel', () => {
        // `defer ReturnPanicError(ch)` recovers, so a panicking method returns
        // *normally*. With an unnamed `<- chan any` result the zero value is a nil
        // channel and every caller doing `<-exchange.FetchTicker(...)` would block
        // forever. Naming the result and assigning it before the defers guarantees
        // callers always get the real channel back.
        const input =
        "class Exchange {\n" +
        "    async fetchTicker(symbol: string): Promise<any> {\n" +
        "        return { 'symbol': symbol };\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileGo(input).content;
        expect(output).toContain("FetchTicker(symbol any) (out <- chan any)");
        // `out = ch` must precede the defers, otherwise a panic recovered by
        // ReturnPanicError would still hand back a nil channel
        expect(output.indexOf("out = ch")).toBeLessThan(output.indexOf("defer close(ch)"));
        // non-async methods keep a plain (unnamed, non-channel) result
        expect(output).not.toContain("(out <- chan any) {\n    return");
    });
    test('async returns hand back the result channel, not nil', () => {
        // at the function's own level `return nil` would overwrite the named result
        // with a nil channel; only the try/catch closures may keep `return nil`.
        const input =
        "class Exchange {\n" +
        "    async doThing(symbol: string): Promise<any> {\n" +
        "        if (symbol === 'a') {\n" +
        "            return 1;\n" +
        "        }\n" +
        "        return 2;\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileGo(input).content;
        expect(output).not.toContain("go func()");
        expect(output).toContain("ch <- 1");
        expect(output).toContain("ch <- 2");
        expect(output).toContain("return ch");
        // no bare `return nil` survives at the function level
        expect(output).not.toMatch(/^\s*return nil\s*$/m);
    });
    test('async method with try/catch stays flat and returns the channel', () => {
        // try/catch is emulated with synthetic closures. Returns *inside* them must
        // stay `return nil` (they exit the closure), while the statement that ends
        // the try/catch at function level has to return the channel.
        const input =
        "class Exchange {\n" +
        "    async fetchTicker(symbol: string): Promise<any> {\n" +
        "        try {\n" +
        "            return await this.fetch(symbol);\n" +
        "        } catch (e) {\n" +
        "            return 1;\n" +
        "        }\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileGo(input).content;
        expect(output).not.toContain("go func()");
        expect(output).toContain("(out <- chan any)");
        expect(output).toContain("out = ch");
        // the closures still recover and still use `return nil` internally
        expect(output).toContain("recover()");
        expect(output).toContain("return nil");
        // the try/catch no longer captures `ret__`: an `any` cannot be returned
        // from a channel-typed function, so the tail just hands back `ch`
        expect(output).not.toContain("return ret__");
        expect(output).toContain("return ch");
    });
    test('named result avoids collision with a same-named local or parameter', () => {
        // a TS local called `out` would clash with the named result
        // (`out := ...` on an already-declared result is a Go compile error)
        const input =
        "class Exchange {\n" +
        "    async fetchTicker(out: string): Promise<any> {\n" +
        "        return out;\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileGo(input).content;
        expect(output).toContain("FetchTicker(out any) (out1 <- chan any)");
        expect(output).toContain("out1 = ch");
        expect(output).not.toContain("out = ch");
    });
});
