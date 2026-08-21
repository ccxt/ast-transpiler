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

describe('go Promise.all concurrent start', () => {
    // Async cores are emitted FLAT: the body runs on the caller's goroutine and the
    // capacity-1 result channel is already filled by the time the call expression
    // yields. That is right for an `await`ed call, but it silently serializes the
    // fan-out idiom, where a call is *stored* (or collected into an array) first and
    // only awaited later. Those deferred calls are emitted as
    // `this.Spawn(this.Method, args...).Await()`: Spawn runs the method on a fresh
    // goroutine and returns a *Future, `.Await()` turns it back into a `<- chan any`
    // so `promiseAll` and `<-x` consumers keep working unchanged.

    // split the transpiled class into one string per method body
    const methodBodies = (output: string): string[] =>
        output.split(/func\s+\(this \*Exchange\)/).slice(1);
    // retRes identifiers are line/column derived, so normalise them away
    const normalize = (s: string): string => s.replace(/retRes\d+/g, 'retRes');

    test('hoisted promise variables are started concurrently before Promise.all', () => {
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
        expect(output).toContain("var spotMarketPromise any = this.Spawn(this.FetchSpotMarkets, params).Await()");
        expect(output).toContain("var swapMarketPromise any = this.Spawn(this.FetchSwapMarkets, params).Await()");
        // the awaiting site is unchanged: both values are still plain channels
        expect(output).toContain("spotMarketswapMarketVariable := (<-promiseAll([]any{spotMarketPromise, swapMarketPromise}));");
        // a direct call would have run the whole body right here, serializing the fan-out
        expect(output).not.toContain("var spotMarketPromise any = this.FetchSpotMarkets(params)");
        expect(output).not.toContain("var swapMarketPromise any = this.FetchSwapMarkets(params)");
        // both branches must be in flight *before* the join
        const spawnSwap = output.indexOf("this.Spawn(this.FetchSwapMarkets, params).Await()");
        const join = output.indexOf("promiseAll([]any{spotMarketPromise, swapMarketPromise})");
        expect(spawnSwap).toBeGreaterThan(-1);
        expect(spawnSwap).toBeLessThan(join);
    });
    test('inline Promise.all array elements are each started concurrently', () => {
        // `Promise.all ([ this.a (), this.b () ])` evaluates its elements in argument
        // order, so without Spawn the first call would run to completion before the
        // second one even starts.
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
        expect(output).toContain("res:= (<-promiseAll([]any{this.Spawn(this.FetchSpotMarkets, params).Await(), this.Spawn(this.FetchSwapMarkets, params).Await()}))");
        expect(output).not.toContain("promiseAll([]any{this.FetchSpotMarkets(params), this.FetchSwapMarkets(params)})");
    });
    test('promises.push of an async call starts it concurrently', () => {
        // the classic fan-out loop: collect N promises, await them all afterwards.
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
        expect(output).toContain("AppendToArray(&promises, this.Spawn(this.FetchTicker, GetValue(symbols, i)).Await())");
        // pushing the *result* of a completed call would make the loop sequential
        expect(output).not.toContain("AppendToArray(&promises, this.FetchTicker(GetValue(symbols, i)))");
        expect(output).toContain("results:= (<-promiseAll(promises))");
    });
    test('zero-argument async call is spawned without a stray comma', () => {
        // `Spawn(this.LoadMarkets)` — the argument list is variadic, so an empty one
        // must emit no separator at all (`Spawn(this.LoadMarkets, )` is a syntax error).
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
        expect(output).toContain("var p any = this.Spawn(this.LoadMarkets).Await()");
        expect(output).not.toContain("this.Spawn(this.LoadMarkets, )");
        expect(output).not.toMatch(/this\.Spawn\(this\.LoadMarkets\s*,/);
        // the deferred value is still awaited through a plain channel receive
        expect(normalize(output)).toContain("retRes :=  (<-p)");
    });
    test('three-way Promise.all starts every branch concurrently', () => {
        const input =
        "class Exchange {\n" +
        "    async fetchA (params = {}): Promise<any> {\n" +
        "        return [];\n" +
        "    }\n" +
        "    async fetchB (params = {}): Promise<any> {\n" +
        "        return [];\n" +
        "    }\n" +
        "    async fetchC (params = {}): Promise<any> {\n" +
        "        return [];\n" +
        "    }\n" +
        "    async fetchAll (params = {}): Promise<any> {\n" +
        "        const aPromise = this.fetchA (params);\n" +
        "        const bPromise = this.fetchB (params);\n" +
        "        const cPromise = this.fetchC (params);\n" +
        "        const [ a, b, c ] = await Promise.all ([ aPromise, bPromise, cPromise ]);\n" +
        "        return a;\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileGo(input).content;
        expect(output).toContain("var aPromise any = this.Spawn(this.FetchA, params).Await()");
        expect(output).toContain("var bPromise any = this.Spawn(this.FetchB, params).Await()");
        expect(output).toContain("var cPromise any = this.Spawn(this.FetchC, params).Await()");
        expect(output).toContain("abcVariable := (<-promiseAll([]any{aPromise, bPromise, cPromise}));");
        // exactly three spawns — no branch left running inline
        expect(output.match(/this\.Spawn\(/g)).toHaveLength(3);
        expect(output.match(/\.Await\(\)/g)).toHaveLength(3);
    });
    test('an immediately awaited async call is NOT spawned', () => {
        // `await this.fetchX (params)` has nothing to parallelize: the caller blocks on
        // it anyway, so the flat inline body is both correct and one goroutine cheaper.
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
        expect(doAwait).not.toContain("Await()");
    });
    test('a stored SYNC method call is NOT spawned', () => {
        // Spawn is only for channel-returning (async) methods; a sync call has no
        // promise semantics to preserve and must keep its direct shape.
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
    test('SYNC calls inside an array literal are NOT spawned', () => {
        // only the elements of a genuinely async fan-out get wrapped; a plain array of
        // sync results stays a plain array.
        const input =
        "class Exchange {\n" +
        "    parseTicker (t) {\n" +
        "        return t;\n" +
        "    }\n" +
        "    async doSyncArray (t): Promise<any> {\n" +
        "        const parsed = [ this.parseTicker (t), this.parseTicker (t) ];\n" +
        "        return parsed;\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileGo(input).content;
        expect(output).toContain("var parsed any = []any{this.ParseTicker(t), this.ParseTicker(t)}");
        expect(output).not.toContain("Spawn");
    });
    test('a SYNC call pushed into an array is NOT spawned', () => {
        const input =
        "class Exchange {\n" +
        "    parseTicker (t) {\n" +
        "        return t;\n" +
        "    }\n" +
        "    async doPushSync (items): Promise<any> {\n" +
        "        const parsed = [];\n" +
        "        for (let i = 0; i < items.length; i++) {\n" +
        "            parsed.push (this.parseTicker (items[i]));\n" +
        "        }\n" +
        "        return parsed;\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileGo(input).content;
        expect(output).toContain("AppendToArray(&parsed, this.ParseTicker(GetValue(items, i)))");
        expect(output).not.toContain("Spawn");
    });
    test('an implicit-async delegator keeps the direct receive, without Spawn', () => {
        // `watchIt (x) { return this.fetchTicker (x); }` is compiled to
        // `return await ...`, so the delegator awaits immediately — nothing to spawn.
        const input =
        "class Exchange {\n" +
        "    async fetchTicker (symbol: string): Promise<any> {\n" +
        "        return {};\n" +
        "    }\n" +
        "    watchIt (symbol: string): Promise<any> {\n" +
        "        return this.fetchTicker (symbol);\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileGo(input).content;
        const [, watchIt] = methodBodies(output);
        expect(normalize(watchIt)).toContain("retRes :=  (<-this.FetchTicker(symbol))");
        expect(normalize(watchIt)).toContain("PanicOnError(retRes)");
        expect(watchIt).not.toContain("Spawn");
    });
    test('an unresolvable this.X() call is NOT spawned', () => {
        // no declaration to inspect: the call goes through callDynamically, which hands
        // back a channel started elsewhere, so wrapping it would be wrong.
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
});
