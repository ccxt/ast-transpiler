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
        const go = 'var x string = "foo, \'single\', \\"double\\" \\t \\n \\r \\b \\f \\\\ "'
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
        "var a string = \"hi\"\n" +
        "var b bool = false\n" +
        "var c bool = (a != \"\") && b\n" +
        "var d bool = !(a != \"\") && !b\n" +
        "var e bool = ((a != \"\") || !b)\n" +
        "if (a != \"\") {\n" +
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
        // every async core is a trampoline + body PAIR, so three TS methods become six
        // Go funcs, in declaration order: WatchTickerInner/watchTickerInnerBody,
        // WatchTicker/watchTickerBody, WatchTickerClassic/watchTickerClassicBody
        const methods = output.split(/func\s+\(this \*Exchange\)/).slice(1);
        expect(methods.length).toBe(6);
        const [, , delegator, delegatorBody, classic, classicBody] = methods;
        // the delegator trampoline hands the work to its body
        expect(delegator).toContain("ch := make(chan any, 1)");
        expect(delegator).toContain("go this.watchTickerBody(ch, symbol)");
        expect(delegator).toContain("return ch");
        // the body receives from the inner channel
        expect(delegatorBody).toContain("<-this.WatchTickerInner(symbol)");
        expect(delegatorBody).toContain("PanicOnError(retRes");
        // must NOT return the raw channel of the inner call
        expect(delegatorBody).not.toContain("ch <- this.WatchTickerInner");
        // normalized (method name + line-based retRes suffix stripped), the delegator
        // pair must be identical to the classic async/return await pair
        const normalize = (s: string) => s
            .replace(/retRes\d+/g, 'retRes')
            .replace(/WatchTickerClassic|WatchTicker\b/g, 'METHOD')
            .replace(/watchTickerClassicBody|watchTickerBody\b/g, 'methodBody')
            .trim();
        expect(normalize(delegator)).toBe(normalize(classic));
        expect(normalize(delegatorBody)).toBe(normalize(classicBody));
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
    test('async method body runs on its own goroutine via a sibling body method', () => {
        // The core is a TRAMPOLINE: it allocates the cap-1 channel, `go`es a SIBLING body
        // method that owns the work, and returns the channel IMMEDIATELY. That is what
        // makes the call a *hot handle* — work already in flight — matching the C#/Java
        // ports, so `const a = this.fetchA (); ... await Promise.all ([a, b])` overlaps
        // with no call-site wrapper.
        const input =
        "class Exchange {\n" +
        "    async fetchTicker(symbol: string): Promise<any> {\n" +
        "        return { 'symbol': symbol };\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileGo(input).content;
        // the trampoline
        expect(output).toContain("func  (this *Exchange) FetchTicker(symbol any) <- chan any {");
        expect(output).toContain("ch := make(chan any, 1)");
        expect(output).toContain("go this.fetchTickerBody(ch, symbol)");
        expect(output).toContain("return ch");
        // the body, a plain non-channel-returning sibling that owns the defers
        expect(output).toContain("func (this *Exchange) fetchTickerBody(ch chan any, symbol any) any {");
        expect(output).toContain("defer close(ch)");
        expect(output).toContain("defer ReturnPanicError(ch)");
        expect(output).toContain("ch <- map[string]any");
        // no anonymous goroutine envelope any more
        expect(output).not.toContain("go func() any {");
        expect(output).not.toContain("}()");
        // the statements appear in that exact order
        const order = [
            "ch := make(chan any, 1)",
            "go this.fetchTickerBody(ch, symbol)",
            "return ch",
            "func (this *Exchange) fetchTickerBody(ch chan any, symbol any) any {",
            "defer close(ch)",
            "defer ReturnPanicError(ch)",
            "ch <- map[string]any",
        ].map((needle) => output.indexOf(needle));
        expect(order).toEqual([...order].sort((a, b) => a - b));
        expect(Math.min(...order)).toBeGreaterThan(-1);
    });
    test('the body method is unexported so it stays off interfaces and wrappers', () => {
        // the body is an implementation detail of the trampoline: it must never leak into
        // the generated ICoreExchange interface nor the typed *_wrapper.go facades, so it
        // is emitted lowercase (package private in Go).
        const input =
        "class Exchange {\n" +
        "    async fetchTicker(symbol: string): Promise<any> {\n" +
        "        return { 'symbol': symbol };\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileGo(input).content;
        expect(output).toContain("fetchTickerBody");
        expect(output).not.toContain("FetchTickerBody");
    });
    test('a defaulted parameter is forwarded to the body as the variadic tail', () => {
        const input =
        "class Exchange {\n" +
        "    async fetchTicker(symbol: string, params = {}): Promise<any> {\n" +
        "        return params;\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileGo(input).content;
        expect(output).toContain("FetchTicker(symbol any, optionalArgs ...any) <- chan any");
        expect(output).toContain("go this.fetchTickerBody(ch, symbol, optionalArgs...)");
        expect(output).toContain("fetchTickerBody(ch chan any, symbol any, optionalArgs ...any) any");
        // the defaults are unpacked in the BODY, not in the trampoline
        expect(output).toContain("params := GetArg(optionalArgs, 0, map[string]any {})");
        expect(output.indexOf("params := GetArg")).toBeGreaterThan(output.indexOf("fetchTickerBody(ch chan any"));
    });
    test('a colliding body name is uniquified instead of clobbered', () => {
        const input =
        "class Exchange {\n" +
        "    async fetchTicker(symbol: string): Promise<any> {\n" +
        "        return symbol;\n" +
        "    }\n" +
        "    fetchTickerBody(x): any {\n" +
        "        return x;\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileGo(input).content;
        expect(output).toContain("go this.fetchTickerBody1(ch, symbol)");
        expect(output).toContain("func (this *Exchange) fetchTickerBody1(ch chan any, symbol any) any {");
    });
    test('async method result is an UNNAMED channel', () => {
        // With the trampoline the recover (`defer ReturnPanicError(ch)`) lives on the
        // BODY method, not on the trampoline, so the trampoline's `return ch` always
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
        // the recover must sit on the body, i.e. AFTER the `go this....Body(...)` handoff
        expect(output.indexOf("go this.fetchTickerBody(")).toBeLessThan(output.indexOf("defer ReturnPanicError(ch)"));
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
    test('returns inside the body send and then leave the body with nil', () => {
        // the body is a plain `any`-returning sibling method: its returns are its own,
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
        expect(output).toContain("go this.doThingBody(ch, symbol)");
        expect(output).toContain("ch <- 1");
        expect(output).toContain("ch <- 2");
        expect(output).toContain("return nil");
        // exactly one `return ch`: the trampoline's
        expect(output.match(/return ch/g)).toHaveLength(1);
    });
    test('async method with try/catch keeps the closure shape and captures ret__', () => {
        // try/catch is emulated with synthetic closures nested inside the body method,
        // so their `return nil` / `ret__` capture is correct again.
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
        expect(output).toContain("go this.fetchTickerBody(ch, symbol)");
        expect(output).toContain("func (this *Exchange) fetchTickerBody(ch chan any, symbol any) any {");
        expect(output).not.toContain("(out <- chan any)");
        expect(output).toContain("recover()");
        expect(output).toContain("return ret__");
        expect(output).toContain("return ch");
    });
});

describe('go typed body locals', () => {
    // the printer indents nested call expressions; gofmt collapses that downstream
    const squash = (output: string) => output.replace(/ +/g, ' ');
    test('locals whose initializer has a concrete Go type are declared with it', () => {
        const input =
        "class Exchange {\n" +
        "    extend(a, b) { return a; }\n" +
        "    main(market) {\n" +
        "        const upper = market.toUpperCase();\n" +
        "        const parts = market.split('/');\n" +
        "        const count = parts.length;\n" +
        "        const same = (upper === market);\n" +
        "        const merged = this.extend({}, market);\n" +
        "        return [upper, parts, count, same, merged];\n" +
        "    }\n" +
        "}";
        const output = squash(transpiler.transpileGo(input).content);
        expect(output).toContain("var upper string = ToUpper(market)");
        expect(output).toContain("var parts []string = Split(market, \"/\")");
        expect(output).toContain("var count int = GetArrayLength(parts)");
        expect(output).toContain("var same bool = (IsEqual(upper, market))");
        expect(output).toContain("var merged map[string]any = this.Extend(");
    });
    test('helpers that return any keep the local untyped', () => {
        const input =
        "class Exchange {\n" +
        "    safeValue(a, b) { return a; }\n" +
        "    main(item, a, b) {\n" +
        "        const income = this.safeValue(item, 'income');\n" +
        "        const first = item['first'];\n" +
        "        const sum = a + b;\n" +
        "        const picked = a ? b : item;\n" +
        "        return [income, first, sum, picked];\n" +
        "    }\n" +
        "}";
        const output = squash(transpiler.transpileGo(input).content);
        expect(output).toContain("var income any = this.SafeValue(item, \"income\")");
        expect(output).toContain("var first any = GetValue(item, \"first\")");
        expect(output).toContain("var sum any = Add(a, b)");
        expect(output).toContain("var picked any = Ternary(");
    });
    test('a local reassigned with another type, appended to or spread stays any', () => {
        const input =
        "class Exchange {\n" +
        "    safeString(a, b) { return a; }\n" +
        "    main(market, other) {\n" +
        "        const reassigned = market.toUpperCase();\n" +
        "        reassigned = this.safeString(other, 'x');\n" +
        "        const appended = market.split('/');\n" +
        "        appended.push('extra');\n" +
        "        return [reassigned, appended];\n" +
        "    }\n" +
        "}";
        const output = squash(transpiler.transpileGo(input).content);
        expect(output).toContain("var reassigned any = ToUpper(market)");
        expect(output).toContain("var appended any = Split(market, \"/\")");
    });
    test('a local reassigned with the same concrete type keeps the type', () => {
        const input =
        "class Exchange {\n" +
        "    main(market, other) {\n" +
        "        const upper = market.toUpperCase();\n" +
        "        upper = other.toUpperCase();\n" +
        "        return upper;\n" +
        "    }\n" +
        "}";
        const output = squash(transpiler.transpileGo(input).content);
        expect(output).toContain("var upper string = ToUpper(market)");
    });
    test('a renamed local is scanned under its source name', () => {
        // `type` prints as `typeVar`; the reject scan must still see the
        // destructuring assignment that reassigns it from GetValue
        const input =
        "class Exchange {\n" +
        "    handleMarketTypeAndParams(a, b, c, d) { return [a, b]; }\n" +
        "    main(params) {\n" +
        "        let type = 'spot';\n" +
        "        [ type, params ] = this.handleMarketTypeAndParams('fetchBalance', undefined, params, type);\n" +
        "        return type;\n" +
        "    }\n" +
        "}";
        const output = squash(transpiler.transpileGo(input).content);
        expect(output).toContain("var typeVar any = \"spot\"");
    });
    test('a parameter shadowing a Go type name blocks that refinement', () => {
        const input =
        "class Exchange {\n" +
        "    main(string, other) {\n" +
        "        const upper = other.toUpperCase();\n" +
        "        return [string, upper];\n" +
        "    }\n" +
        "}";
        const output = squash(transpiler.transpileGo(input).content);
        expect(output).toContain("var upper any = ToUpper(other)");
    });
});

describe('go pointer-typed Safe* body locals', () => {
    // the printer indents nested call expressions; gofmt collapses that downstream
    const squash = (output: string) => output.replace(/ +/g, ' ');
    test('a local initialized from a Safe* accessor is declared with its pointer type', () => {
        const input =
        "class Exchange {\n" +
        "    safeString(a, b) { return a; }\n" +
        "    safeInteger(a, b) { return a; }\n" +
        "    safeFloat(a, b) { return a; }\n" +
        "    safeBool(a, b) { return a; }\n" +
        "    safeDict(a, b) { return a; }\n" +
        "    main(item) {\n" +
        "        const amount = this.safeString (item, 'income');\n" +
        "        const timestamp = this.safeInteger (item, 'time');\n" +
        "        const rate = this.safeFloat (item, 'rate');\n" +
        "        const flag = this.safeBool (item, 'flag');\n" +
        "        const info = this.safeDict (item, 'info');\n" +
        "        return [amount, timestamp, rate, flag, info];\n" +
        "    }\n" +
        "}";
        const output = squash(transpiler.transpileGo(input).content);
        expect(output).toContain("var amount *string = this.SafeString(item, \"income\")");
        expect(output).toContain("var timestamp *int64 = this.SafeInteger(item, \"time\")");
        expect(output).toContain("var rate *float64 = this.SafeFloat(item, \"rate\")");
        expect(output).toContain("var flag any = this.SafeBool(item, \"flag\")");
        expect(output).toContain("var info any = this.SafeDict(item, \"info\")");
    });
    test('the 2/N and lower/upper/product/timestamp variants carry the same pointer type', () => {
        const input =
        "class Exchange {\n" +
        "    safeString2(a, b, c) { return a; }\n" +
        "    safeStringLowerN(a, b) { return a; }\n" +
        "    safeStringUpper(a, b) { return a; }\n" +
        "    safeIntegerProduct(a, b, c) { return a; }\n" +
        "    safeTimestamp2(a, b, c) { return a; }\n" +
        "    safeBoolN(a, b) { return a; }\n" +
        "    main(item) {\n" +
        "        const id = this.safeString2 (item, 'id', 'orderId');\n" +
        "        const side = this.safeStringLowerN (item, ['side']);\n" +
        "        const code = this.safeStringUpper (item, 'code');\n" +
        "        const expiry = this.safeIntegerProduct (item, 'expiry', 1000);\n" +
        "        const created = this.safeTimestamp2 (item, 'created', 'ts');\n" +
        "        const post = this.safeBoolN (item, ['postOnly']);\n" +
        "        return [id, side, code, expiry, created, post];\n" +
        "    }\n" +
        "}";
        const output = squash(transpiler.transpileGo(input).content);
        expect(output).toContain("var id *string = this.SafeString2(item, \"id\", \"orderId\")");
        expect(output).toContain("var side *string = this.SafeStringLowerN(");
        expect(output).toContain("var code *string = this.SafeStringUpper(item, \"code\")");
        expect(output).toContain("var expiry *int64 = this.SafeIntegerProduct(item, \"expiry\", 1000)");
        expect(output).toContain("var created *int64 = this.SafeTimestamp2(item, \"created\", \"ts\")");
        expect(output).toContain("var post any = this.SafeBoolN(");
    });
    test('a Safe* local reassigned to a differently typed value falls back to any', () => {
        const input =
        "class Exchange {\n" +
        "    safeString(a, b) { return a; }\n" +
        "    safeInteger(a, b) { return a; }\n" +
        "    main(item, other) {\n" +
        "        let amount = this.safeString (item, 'income');\n" +
        "        amount = other.toUpperCase();\n" +
        "        let stamp = this.safeInteger (item, 'time');\n" +
        "        stamp = this.safeString (item, 'time');\n" +
        "        return [amount, stamp];\n" +
        "    }\n" +
        "}";
        const output = squash(transpiler.transpileGo(input).content);
        expect(output).toContain("var amount any = this.SafeString(item, \"income\")");
        expect(output).toContain("var stamp any = this.SafeInteger(item, \"time\")");
    });
    test('a Safe* local reassigned from the same Safe* family keeps its pointer type', () => {
        const input =
        "class Exchange {\n" +
        "    safeString(a, b) { return a; }\n" +
        "    safeString2(a, b, c) { return a; }\n" +
        "    main(item, other) {\n" +
        "        let amount = this.safeString (item, 'income');\n" +
        "        amount = this.safeString2 (other, 'income', 'amount');\n" +
        "        return amount;\n" +
        "    }\n" +
        "}";
        const output = squash(transpiler.transpileGo(input).content);
        expect(output).toContain("var amount *string = this.SafeString(item, \"income\")");
    });
    test('a Safe* local that is appended to or spread stays any', () => {
        const input =
        "class Exchange {\n" +
        "    safeDict(a, b) { return a; }\n" +
        "    safeString(a, b) { return a; }\n" +
        "    main(item) {\n" +
        "        const info = this.safeDict (item, 'info');\n" +
        "        info.push('x');\n" +
        "        return info;\n" +
        "    }\n" +
        "}";
        const output = squash(transpiler.transpileGo(input).content);
        expect(output).toContain("var info any = this.SafeDict(item, \"info\")");
    });
    test('a local initialized from Precise arithmetic is declared as *string', () => {
        const input =
        "class Exchange {\n" +
        "    main(item) {\n" +
        "        const product = Precise.stringMul ('-1', '2');\n" +
        "        const quotient = Precise.stringDiv ('1', '2');\n" +
        "        const total = Precise.stringAdd ('1', '2');\n" +
        "        const rest = Precise.stringSub ('1', '2');\n" +
        "        const biggest = Precise.stringMax ('1', '2');\n" +
        "        const bigger = Precise.stringGt ('1', '2');\n" +
        "        return [product, quotient, total, rest, biggest, bigger];\n" +
        "    }\n" +
        "}";
        const output = squash(transpiler.transpileGo(input).content);
        expect(output).toContain("var product *string = Precise.StringMul(\"-1\", \"2\")");
        expect(output).toContain("var quotient *string = Precise.StringDiv(\"1\", \"2\")");
        expect(output).toContain("var total *string = Precise.StringAdd(\"1\", \"2\")");
        expect(output).toContain("var rest *string = Precise.StringSub(\"1\", \"2\")");
        expect(output).toContain("var biggest *string = Precise.StringMax(\"1\", \"2\")");
        expect(output).toContain("var bigger bool = Precise.StringGt(\"1\", \"2\")");
    });
    test('a Safe* string local reassigned from Precise arithmetic keeps its pointer type', () => {
        const input =
        "class Exchange {\n" +
        "    safeString(a, b) { return a; }\n" +
        "    main(item) {\n" +
        "        let amount = this.safeString (item, 'income');\n" +
        "        amount = Precise.stringMul ('-1', amount);\n" +
        "        return amount;\n" +
        "    }\n" +
        "}";
        const output = squash(transpiler.transpileGo(input).content);
        expect(output).toContain("var amount *string = this.SafeString(item, \"income\")");
    });
    test('a parameter shadowing a Go type name blocks the pointer refinement too', () => {
        const input =
        "class Exchange {\n" +
        "    safeString(a, b) { return a; }\n" +
        "    main(string, item) {\n" +
        "        const amount = this.safeString (item, 'income');\n" +
        "        return [string, amount];\n" +
        "    }\n" +
        "}";
        const output = squash(transpiler.transpileGo(input).content);
        expect(output).toContain("var amount any = this.SafeString(item, \"income\")");
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
        // trampoline/body pairs: FetchSpotMarkets, fetchSpotMarketsBody, DoAwait, doAwaitBody
        const [, , doAwaitTrampoline, doAwaitBody] = methodBodies(output);
        expect(doAwaitTrampoline).toContain("go this.doAwaitBody(ch, optionalArgs...)");
        expect(doAwaitBody).toContain("a:= (<-this.FetchSpotMarkets(params))");
        expect(doAwaitBody).toContain("PanicOnError(a)");
        expect(doAwaitBody).not.toContain("Spawn");
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
describe('go inline equality', () => {
    test('=== / !== on present scalars inline to Go == / !=', () => {
        const input =
        "function f (x: string, n: number, b: boolean, o: any) {\n" +
        "    const a = x === 'delivery';\n" +
        "    const c = x !== 'delivery';\n" +
        "    const d = n === 1;\n" +
        "    const e = b === true;\n" +
        "    const g = o === 'delivery';\n" +
        "    return [ a, c, d, e, g ];\n" +
        "}\n"
        const output = transpiler.transpileGo(input).content;
        expect(output).toContain("var a bool = (x == \"delivery\")");
        expect(output).toContain("var c bool = (x != \"delivery\")");
        expect(output).toContain("var d bool = (n == 1)");
        expect(output).toContain("var e bool = (b == true)");
        expect(output).toContain("var g bool = IsEqual(o, \"delivery\")");
        expect(output).not.toContain("*x");
        expect(output).not.toContain("IsEqualString");
        expect(output).not.toContain("IsEqualInt");
        expect(output).not.toContain("IsEqualFloat");
        expect(output).not.toContain("IsEqualBool");
    });
    test('nullable aliases stay on the any helper IsEqual', () => {
        const input =
        "type Str = string | undefined;\n" +
        "type Int = number | undefined;\n" +
        "function f (s: Str, i: Int) {\n" +
        "    const a = s === 'delivery';\n" +
        "    const b = s !== 'delivery';\n" +
        "    const c = i === 1;\n" +
        "    const d = s === undefined;\n" +
        "    return [ a, b, c, d ];\n" +
        "}\n"
        const output = transpiler.transpileGo(input).content;
        expect(output).toContain("var a bool = IsEqual(s, \"delivery\")");
        expect(output).toContain("var b bool = !IsEqual(s, \"delivery\")");
        expect(output).toContain("var c bool = IsEqual(i, 1)");
        expect(output).toContain("var d bool = IsEqual(s, nil)");
        expect(output).not.toContain("IsEqualString");
        expect(output).not.toContain("*s");
    });
    test('mixed families and any operands keep IsEqual', () => {
        const input =
        "function f (s: string, n: number, o: any) {\n" +
        "    const a = s === o;\n" +
        "    const b = o === o;\n" +
        "    return [ a, b ];\n" +
        "}\n"
        const output = transpiler.transpileGo(input).content;
        expect(output).toContain("var a bool = IsEqual(s, o)");
        expect(output).toContain("var b bool = IsEqual(o, o)");
    });
    test('+ and += keep the runtime Add helper', () => {
        const input =
        "function f (a: string, b: string, p: number, o: any) {\n" +
        "    const x = a + '/';\n" +
        "    const y = a + b;\n" +
        "    const z = p + 1;\n" +
        "    let s: string = 'x';\n" +
        "    s += a;\n" +
        "    let u: any = o;\n" +
        "    u += 1;\n" +
        "    return [ x, y, z, s, u ];\n" +
        "}\n"
        const output = transpiler.transpileGo(input).content;
        expect(output).toContain("Add(a, \"/\")");
        expect(output).toContain("Add(a, b)");
        expect(output).toContain("Add(p, 1)");
        expect(output).toContain("s = Add(s, a)");
        expect(output).toContain("u = Add(u, 1)");
        expect(output).not.toContain("ConcatString");
        expect(output).not.toContain("AddNumber");
    });
    test('truthiness is inlined for locals whose Go type the printer declared', () => {
        const input =
        "class T {\n" +
        "    safeString (a, b) { return a; }\n" +
        "    safeInteger (a, b) { return a; }\n" +
        "    inArray (a, b) { return true; }\n" +
        "    f (response: any) {\n" +
        "        const s = this.safeString (response, 'id');\n" +
        "        const n = this.safeInteger (response, 'ts');\n" +
        "        const flag = this.inArray ('a', [ 'a' ]);\n" +
        "        const parts = this.safeString (response, 'x').split ('-');\n" +
        "        if (s) { return 1; }\n" +
        "        if (n) { return 2; }\n" +
        "        if (flag) { return 3; }\n" +
        "        if (parts) { return 4; }\n" +
        "        return 0;\n" +
        "    }\n" +
        "}\n"
        const output = transpiler.transpileGo(input).content;
        expect(output).toContain("if (s != nil && *s != \"\") {");
        expect(output).toContain("if (n != nil && *n != 0) {");
        expect(output).toContain("if flag {");
        expect(output).toContain("if (len(parts) > 0) {");
    });
    test('EvalTruthy stays for any locals, params and non-identifiers', () => {
        const input =
        "class T {\n" +
        "    safeValue (a, b) { return a; }\n" +
        "    f (response: any, opt: any) {\n" +
        "        const v = this.safeValue (response, 'a');\n" +
        "        if (v) { return 1; }\n" +
        "        if (opt) { return 2; }\n" +
        "        if (response['k']) { return 3; }\n" +
        "        return 0;\n" +
        "    }\n" +
        "}\n"
        const output = transpiler.transpileGo(input).content;
        expect(output).toContain("if EvalTruthy(v) {");
        expect(output).toContain("if EvalTruthy(opt) {");
        expect(output).toContain("if EvalTruthy(GetValue(response, \"k\")) {");
    });
    test('negated truthiness inlines too', () => {
        const input =
        "class T {\n" +
        "    safeString (a, b) { return a; }\n" +
        "    f (response: any) {\n" +
        "        const s = this.safeString (response, 'id');\n" +
        "        if (!s) { return 1; }\n" +
        "        return 0;\n" +
        "    }\n" +
        "}\n"
        const output = transpiler.transpileGo(input).content;
        expect(output).toContain("if !(s != nil && *s != \"\") {");
        expect(output).not.toContain("EvalTruthy(s)");
    });
    test('a direct Safe* call compared to a literal collapses to a nil-safe deref', () => {
        const input =
        "class T {\n" +
        "    safeString (a, b, c?) { return a; }\n" +
        "    safeInteger (a, b, c?) { return a; }\n" +
        "    f (raw: any) {\n" +
        "        const a = this.safeString (raw, 'status', '') === 'normal';\n" +
        "        const b = this.safeInteger (raw, 'success', 0) === 1;\n" +
        "        return [ a, b ];\n" +
        "    }\n" +
        "}\n"
        const output = transpiler.transpileGo(input).content;
        // the call must not be repeated, and `*string == \"normal\"` must not be emitted
        expect(output).toContain("var a bool = IsEqual(this.SafeString(raw, \"status\", \"\"), \"normal\")");
        expect(output).toContain("var b bool = IsEqual(this.SafeInteger(raw, \"success\", 0), 1)");
    });
    test('a direct Safe* call compared to undefined tests the pointer for nil', () => {
        const input =
        "class T {\n" +
        "    safeString (a, b) { return a; }\n" +
        "    f (raw: any) {\n" +
        "        const a = this.safeString (raw, 'id') === undefined;\n" +
        "        return a;\n" +
        "    }\n" +
        "}\n"
        const output = transpiler.transpileGo(input).content;
        expect(output).toContain("var a bool = (this.SafeString(raw, \"id\") == nil)");
    });
    test('mismatched Go widths keep IsEqual: *int64 vs int does not compile in Go', () => {
        const input =
        "class T {\n" +
        "    safeInteger (a, b) { return a; }\n" +
        "    f (raw: any, stored: any) {\n" +
        "        const limit = this.safeInteger (raw, 'limit');\n" +   // *int64
        "        const length = stored.length;\n" +                     // int
        "        const same = length === limit;\n" +
        "        return same;\n" +
        "    }\n" +
        "}\n"
        const output = transpiler.transpileGo(input).content;
        expect(output).toContain("var length int =");
        expect(output).toContain("IsEqual(length, limit)");
        expect(output).not.toContain("*limit == length");
    });
});
