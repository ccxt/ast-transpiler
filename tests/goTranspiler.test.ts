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
    test('async method body runs on its own goroutine (trampoline)', () => {
        // The core is a TRAMPOLINE: it allocates the cap-1 channel, launches the body
        // on a goroutine and returns the channel IMMEDIATELY. That is what makes the
        // call a *hot handle* — work already in flight — matching the C#/Java ports,
        // so `const a = this.fetchA (); ... await Promise.all ([a, b])` overlaps with
        // no call-site wrapper.
        const input =
        "class Exchange {\n" +
        "    async fetchTicker(symbol: string): Promise<any> {\n" +
        "        return { 'symbol': symbol };\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileGo(input).content;
        expect(output).toContain("ch := make(chan any, 1)");
        expect(output).toContain("go func() any {");
        expect(output).toContain("defer close(ch)");
        expect(output).toContain("defer ReturnPanicError(ch)");
        expect(output).toContain("ch <- map[string]any");
        expect(output).toContain("}()");
        expect(output).toContain("return ch");
        // the statements appear in that exact order
        const order = [
            "ch := make(chan any, 1)",
            "go func() any {",
            "defer close(ch)",
            "defer ReturnPanicError(ch)",
            "ch <- map[string]any",
            "}()",
            "return ch",
        ].map((needle) => output.indexOf(needle));
        expect(order).toEqual([...order].sort((a, b) => a - b));
        expect(Math.min(...order)).toBeGreaterThan(-1);
    });
    test('async method result is an UNNAMED channel', () => {
        // With the trampoline the recover (`defer ReturnPanicError(ch)`) lives on the
        // BODY goroutine, not on the trampoline, so the trampoline's `return ch` always
        // runs and can never hand back a zero-value nil channel. The named result
        // (`out <- chan any` / `out = ch`) that the flat emitter needed is therefore
        // gone, and the signature is the plain Go one again.
        const input =
        "class Exchange {\n" +
        "    async fetchTicker(symbol: string): Promise<any> {\n" +
        "        return { 'symbol': symbol };\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileGo(input).content;
        expect(output).toContain("FetchTicker(symbol any) <- chan any");
        expect(output).not.toContain("(out <- chan any)");
        expect(output).not.toContain("out = ch");
        // the recover must sit on the body goroutine, i.e. AFTER `go func()`
        expect(output.indexOf("go func() any {")).toBeLessThan(output.indexOf("defer ReturnPanicError(ch)"));
    });
    test('a local or parameter named out no longer needs uniquifying', () => {
        // there is no named result any more, so `out` is just an ordinary identifier
        const input =
        "class Exchange {\n" +
        "    async fetchTicker(out: string): Promise<any> {\n" +
        "        return out;\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileGo(input).content;
        expect(output).toContain("FetchTicker(out any) <- chan any");
        expect(output).not.toContain("out1");
        expect(output).toContain("ch <- out");
    });
    test('returns inside the body send and then leave the goroutine with nil', () => {
        // the body is a `func() any` closure: its returns are the closure's returns,
        // never the channel. `return ch` belongs to the trampoline alone.
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
        expect(output).toContain("go func() any {");
        expect(output).toContain("ch <- 1");
        expect(output).toContain("ch <- 2");
        expect(output).toContain("return nil");
        // exactly one `return ch`: the trampoline's
        expect(output.match(/return ch/g)).toHaveLength(1);
    });
    test('async method with try/catch keeps the closure shape and captures ret__', () => {
        // try/catch is emulated with synthetic closures nested inside the body
        // goroutine, so their `return nil` / `ret__` capture is correct again.
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
        expect(output).toContain("go func() any {");
        expect(output).not.toContain("(out <- chan any)");
        expect(output).toContain("recover()");
        expect(output).toContain("return ret__");
        expect(output).toContain("return ch");
    });
});

describe('go Promise.all concurrent start (trampoline)', () => {
    // Async cores are TRAMPOLINES: the call allocates a cap-1 channel, launches the
    // body on a goroutine and returns the channel immediately. Every async call is
    // therefore already a hot handle, exactly like a C# Task or a Java
    // CompletableFuture, so a *deferred* call needs no call-site wrapper at all:
    //
    //     const a = this.fetchSpotMarkets (params);   // JS: starts, does not block
    //     const b = this.fetchSwapMarkets (params);   // JS: starts, does not block
    //     await Promise.all ([ a, b ]);               // both already in flight
    //
    // emits the two plain calls and a promiseAll over the two channels. The
    // `this.Spawn(...).Await()` wrapper the flat emitter needed is gone.

    // split the transpiled class into one string per method body
    const methodBodies = (output: string): string[] =>
        output.split(/func\s+\(this \*Exchange\)/).slice(1);
    // retRes identifiers are line/column derived, so normalise them away
    const normalize = (s: string): string => s.replace(/retRes\d+/g, 'retRes');

    test('hoisted promise variables are plain calls, already in flight', () => {
        const input =
        "class Exchange {\n" +
        "    async fetchSpotMarkets (params = {}): Promise<any> {\n" +
        "        return [];\n" +
        "    }\n" +
        "    async fetchSwapMarkets (params = {}): Promise<any> {\n" +
        "        return [];\n" +
        "    }\n" +
        "    arrayConcat (a, b) {\n" +
        "        return a;\n" +
        "    }\n" +
        "    async fetchMarketsHoisted (params = {}): Promise<any> {\n" +
        "        const spotMarketPromise = this.fetchSpotMarkets (params);\n" +
        "        const swapMarketPromise = this.fetchSwapMarkets (params);\n" +
        "        const [ spotMarket, swapMarket ] = await Promise.all ([ spotMarketPromise, swapMarketPromise ]);\n" +
        "        return this.arrayConcat (spotMarket, swapMarket);\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileGo(input).content;
        // the direct call IS the concurrent start now
        expect(output).toContain("var spotMarketPromise any = this.FetchSpotMarkets(params)");
        expect(output).toContain("var swapMarketPromise any = this.FetchSwapMarkets(params)");
        expect(output).toContain("spotMarketswapMarketVariable := (<-promiseAll([]any{spotMarketPromise, swapMarketPromise}));");
        // no call-site wrapper of any kind
        expect(output).not.toContain("Spawn");
        expect(output).not.toContain(".Await()");
    });
    test('inline Promise.all array elements are plain calls', () => {
        const input =
        "class Exchange {\n" +
        "    async fetchSpotMarkets (params = {}): Promise<any> {\n" +
        "        return [];\n" +
        "    }\n" +
        "    async fetchSwapMarkets (params = {}): Promise<any> {\n" +
        "        return [];\n" +
        "    }\n" +
        "    async fetchMarketsInline (params = {}): Promise<any> {\n" +
        "        const res = await Promise.all ([ this.fetchSpotMarkets (params), this.fetchSwapMarkets (params) ]);\n" +
        "        return res;\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileGo(input).content;
        expect(output).toContain("promiseAll([]any{this.FetchSpotMarkets(params), this.FetchSwapMarkets(params)})");
        expect(output).not.toContain("Spawn");
    });
    test('promises.push of an async call stays a direct call', () => {
        const input =
        "class Exchange {\n" +
        "    async fetchTicker (symbol: string): Promise<any> {\n" +
        "        return {};\n" +
        "    }\n" +
        "    async fetchTickers (symbols: string[]): Promise<any> {\n" +
        "        const promises = [];\n" +
        "        for (let i = 0; i < symbols.length; i++) {\n" +
        "            promises.push (this.fetchTicker (symbols[i]));\n" +
        "        }\n" +
        "        const results = await Promise.all (promises);\n" +
        "        return results;\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileGo(input).content;
        expect(output).toContain("AppendToArray(&promises, this.FetchTicker(GetValue(symbols, i)))");
        expect(output).toContain("results:= (<-promiseAll(promises))");
        expect(output).not.toContain("Spawn");
    });
    test('a zero-argument deferred call needs no wrapper', () => {
        const input =
        "class Exchange {\n" +
        "    async loadMarkets (): Promise<any> {\n" +
        "        return {};\n" +
        "    }\n" +
        "    async doThing (): Promise<any> {\n" +
        "        const p = this.loadMarkets ();\n" +
        "        return await p;\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileGo(input).content;
        expect(output).toContain("var p any = this.LoadMarkets()");
        expect(output).not.toContain("Spawn");
        // the deferred value is still awaited through a plain channel receive
        expect(normalize(output)).toContain("retRes :=  (<-p)");
    });
    test('an immediately awaited async call keeps its direct receive', () => {
        const input =
        "class Exchange {\n" +
        "    async fetchSpotMarkets (params = {}): Promise<any> {\n" +
        "        return [];\n" +
        "    }\n" +
        "    async doAwait (params = {}): Promise<any> {\n" +
        "        const a = await this.fetchSpotMarkets (params);\n" +
        "        return a;\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileGo(input).content;
        const [, doAwait] = methodBodies(output);
        expect(doAwait).toContain("a:= (<-this.FetchSpotMarkets(params))");
        expect(doAwait).toContain("PanicOnError(a)");
        expect(doAwait).not.toContain("Spawn");
    });
    test('a stored SYNC method call is unchanged', () => {
        const input =
        "class Exchange {\n" +
        "    parseTicker (t) {\n" +
        "        return t;\n" +
        "    }\n" +
        "    async doSync (t): Promise<any> {\n" +
        "        const parsed = this.parseTicker (t);\n" +
        "        return parsed;\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileGo(input).content;
        expect(output).toContain("var parsed any = this.ParseTicker(t)");
        expect(output).not.toContain("Spawn");
    });
    test('an unresolvable this.X() call keeps callDynamically', () => {
        const input =
        "class Exchange {\n" +
        "    async doThing (params = {}): Promise<any> {\n" +
        "        const p = this.someUnknownMethod (params);\n" +
        "        return p;\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileGo(input).content;
        expect(output).toContain("var p any = callDynamically(\"someUnknownMethod\", params)");
        expect(output).not.toContain("Spawn");
    });
    test('module-scope async functions are trampolines too, so no free-func Spawn', () => {
        // the transpiled test harness is written as module-scope `async function`s.
        // They get the same trampoline, so a deferred call to one is already hot and
        // the package-level `Spawn(Helper, ...)` twin is no longer emitted.
        const input =
        "async function testWatchTickersHelper (exchange, skippedProperties, argSymbols): Promise<any> {\n" +
        "    return [];\n" +
        "}\n" +
        "async function testWatchTickers (exchange, skippedProperties, symbol): Promise<any> {\n" +
        "    const withoutSymbol = testWatchTickersHelper (exchange, skippedProperties, undefined);\n" +
        "    const withSymbol = testWatchTickersHelper (exchange, skippedProperties, [ symbol ]);\n" +
        "    await Promise.all ([ withSymbol, withoutSymbol ]);\n" +
        "}\n"
        const output = transpiler.transpileGo(input).content;
        expect(output).toContain("func TestWatchTickersHelper(exchange any, skippedProperties any, argSymbols any) <- chan any");
        expect(output).toContain("var withoutSymbol any = TestWatchTickersHelper(exchange, skippedProperties, nil)");
        expect(output).toContain("var withSymbol any = TestWatchTickersHelper(exchange, skippedProperties, []any{symbol})");
        expect(output).not.toContain("Spawn");
    });
    test('module-scope async calls inside Promise.all stay direct', () => {
        const input =
        "async function helperA (x): Promise<any> {\n" +
        "    return x;\n" +
        "}\n" +
        "async function helperB (x): Promise<any> {\n" +
        "    return x;\n" +
        "}\n" +
        "async function joinThem (x): Promise<any> {\n" +
        "    const res = await Promise.all ([ helperA (x), helperB (x) ]);\n" +
        "    return res;\n" +
        "}\n"
        const output = transpiler.transpileGo(input).content;
        expect(output).toContain("promiseAll([]any{HelperA(x), HelperB(x)})");
        expect(output).not.toContain("Spawn");
    });
    test('a SYNC module-scope function call is unchanged', () => {
        const input =
        "function syncHelper (x) {\n" +
        "    return x;\n" +
        "}\n" +
        "async function useIt (x): Promise<any> {\n" +
        "    const v = syncHelper (x);\n" +
        "    return v;\n" +
        "}\n"
        const output = transpiler.transpileGo(input).content;
        expect(output).toContain("var v any = SyncHelper(x)");
        expect(output).not.toContain("Spawn");
    });
});