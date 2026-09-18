import { assert } from 'console';
import { Transpiler, alignGoTrailingComments } from '../src/transpiler';

import { SyntaxKind } from 'typescript';
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
        "\tvar x any = 1\n" +
        "\tbreak\n" +
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
        "}\n"+
        "\n"+
        "func NewTest() *Test {\n"+
        "\tp := &Test{}\n"+
        "\tsetDefaults(p)\n"+
        "\treturn p\n"+
        "}\n"+
        "\n"+
        "func (this *Test) Main() any {\n"+
        "\treturn 1\n"+
        "}";
        const output = transpiler.transpileGo(ts).content;
        expect(output).toBe(go);
    });
    test('struct field columns are aligned like go/printer (tabwriter, block per column)', () => {
        // gofmt pads every field cell to the widest cell of its column block plus one: the
        // embedded `Base` has no type cell, so it terminates the block it opens, and the
        // untagged `NoTag` terminates the type block (its type is the trailing cell).
        const ts =
        "class Test extends Base {\n" +
        "    short: string = '';\n" +
        "    aLongerPropertyName: any = {};\n" +
        "    noTag: any;\n" +
        "    main() {\n" +
        "        return 1\n" +
        "    }\n" +
        "}";
        const go =
        "type Test struct {\n" +
        "\tBase\n" +
        "\tShort               string `default:\"\"`\n" +
        "\tALongerPropertyName any    `default:\"map[string]any{}\"`\n" +
        "\tNoTag               any\n" +
        "}\n" +
        "\n" +
        "func NewTest() *Test {\n" +
        "\tp := &Test{}\n" +
        "\tsetDefaults(p)\n" +
        "\treturn p\n" +
        "}\n" +
        "\n" +
        "func (this *Test) Main() any {\n" +
        "\treturn 1\n" +
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
        "if a != \"\" {\n" +
        "\tvar f any = 1\n" +
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
    // "func (this *A) Main() any {\n"+
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
        expect(output).toContain("func (this *Exchange) FetchTicker(symbol any) <-chan any {");
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
        expect(output).toContain("FetchTicker(symbol any, optionalArgs ...any) <-chan any");
        expect(output).toContain("go this.fetchTickerBody(ch, symbol, optionalArgs...)");
        expect(output).toContain("fetchTickerBody(ch chan any, symbol any, optionalArgs ...any) any");
        // the defaults are unpacked in the BODY, not in the trampoline
        expect(output).toContain("params := GetArg(optionalArgs, 0, map[string]any{})");
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
        // (`out <-chan any` / `out = ch`) that the flat emitter needed is therefore
        // gone, and the signature is the plain Go one again.
        const input =
        "class Exchange {\n" +
        "    async fetchTicker(symbol: string): Promise<any> {\n" +
        "        return { 'symbol': symbol };\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileGo(input).content;
        expect(output).toContain("FetchTicker(symbol any) <-chan any");
        expect(output).not.toContain("(out <-chan any)");
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
        expect(output).toContain("FetchTicker(out any) <-chan any");
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
        expect(output).not.toContain("(out <-chan any)");
        expect(output).toContain("recover()");
        expect(output).toContain("return ret__");
        expect(output).toContain("return ch");
    });
    test('object literals open with `map[string]any{`, never `map[string]any {` (gofmt)', () => {
        // gofmt writes `map[string]any{` / `map[string]any{}`: a space before the brace
        // puts one extra char on every object literal line of the generated tree.
        const input =
        "class Exchange {\n" +
        "    fetchTicker(symbol: string) {\n" +
        "        const empty = {};\n" +
        "        const opts = { 'symbol': symbol, 'nested': { 'a': 1 } };\n" +
        "        return [ empty, opts ];\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileGo(input).content;
        expect(output).toContain("map[string]any{");
        expect(output).toContain("map[string]any{}");
        expect(output).not.toContain("map[string]any {");
    });
});

describe('go typed body locals', () => {
    // the printer indents nested call expressions; gofmt collapses that downstream
    const squash = (output: string) => output.replace(/[\t ]+/g, ' ');
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
        expect(output).toContain("var count int = len(parts)");
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
        expect(output).toContain("var picked any = func() any {");
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
    const squash = (output: string) => output.replace(/[\t ]+/g, ' ');
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
        expect(output).toContain("var flag *bool = this.SafeBool(item, \"flag\")");
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
        expect(output).toContain("var post *bool = this.SafeBoolN(");
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
    test('a SafeBool local is declared *bool; SafeDict/SafeList locals stay any (those Go accessors return any)', () => {
        const input =
        "class Exchange {\n" +
        "    safeBool(a, b) { return a; }\n" +
        "    safeDict(a, b) { return a; }\n" +
        "    safeList(a, b) { return a; }\n" +
        "    main(item) {\n" +
        "        const flag = this.safeBool (item, 'flag');\n" +
        "        const info = this.safeDict (item, 'info');\n" +
        "        const rows = this.safeList (item, 'rows');\n" +
        "        return [flag, info, rows];\n" +
        "    }\n" +
        "}\n";
        const output = squash(transpiler.transpileGo(input).content);
        expect(output).toContain("var flag *bool = this.SafeBool(item, \"flag\")");
        expect(output).toContain("var info any = this.SafeDict(item, \"info\")");
        expect(output).toContain("var rows any = this.SafeList(item, \"rows\")");
    });
    test('the 2/N bool variants carry *bool; the dict/list variants stay any', () => {
        const input =
        "class Exchange {\n" +
        "    safeBool2(a, b, c) { return a; }\n" +
        "    safeBoolN(a, b) { return a; }\n" +
        "    safeDict2(a, b, c) { return a; }\n" +
        "    safeDictN(a, b) { return a; }\n" +
        "    safeList2(a, b, c) { return a; }\n" +
        "    safeListN(a, b) { return a; }\n" +
        "    main(item) {\n" +
        "        const post = this.safeBool2 (item, 'postOnly', 'post_only');\n" +
        "        const anyFlag = this.safeBoolN (item, ['reduceOnly']);\n" +
        "        const nested = this.safeDict2 (item, 'a', 'b');\n" +
        "        const deep = this.safeDictN (item, ['a', 'b']);\n" +
        "        const pair = this.safeList2 (item, 'a', 'b');\n" +
        "        const deepList = this.safeListN (item, ['a', 'b']);\n" +
        "        return [post, anyFlag, nested, deep, pair, deepList];\n" +
        "    }\n" +
        "}\n";
        const output = squash(transpiler.transpileGo(input).content);
        expect(output).toContain("var post *bool = this.SafeBool2(item, \"postOnly\", \"post_only\")");
        expect(output).toContain("var anyFlag *bool = this.SafeBoolN(");
        expect(output).toContain("var nested any = this.SafeDict2(item, \"a\", \"b\")");
        expect(output).toContain("var deep any = this.SafeDictN(");
        expect(output).toContain("var pair any = this.SafeList2(item, \"a\", \"b\")");
        expect(output).toContain("var deepList any = this.SafeListN(");
    });
    test('an any-typed dict/list local keeps the helper for truthiness/nil tests', () => {
        const input =
        "class Exchange {\n" +
        "    safeDict(a, b) { return a; }\n" +
        "    safeList(a, b) { return a; }\n" +
        "    safeBool(a, b) { return a; }\n" +
        "    main(item) {\n" +
        "        const info = this.safeDict (item, 'info');\n" +
        "        const rows = this.safeList (item, 'rows');\n" +
        "        const flag = this.safeBool (item, 'flag');\n" +
        "        if (rows === undefined) { return info; }\n" +
        "        if (flag) { return rows; }\n" +
        "        return [info, rows, flag];\n" +
        "    }\n" +
        "}\n";
        const output = squash(transpiler.transpileGo(input).content);
        expect(output).toContain("IsEqual(rows, nil)");
        expect(output).toContain("if flag != nil && *flag {");
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
        expect(output).toContain("spotMarketswapMarketVariable := (<-promiseAll([]any{spotMarketPromise, swapMarketPromise}))");
        // the array binding is newline-separated Go: no explicit ';' terminators,
        // and the GetValue index argument is separated by a space
        expect(output).toContain("spotMarket := GetValue(spotMarketswapMarketVariable, 0)");
        expect(output).toContain("swapMarket := GetValue(spotMarketswapMarketVariable, 1)");
        expect(output).not.toMatch(/;[ \t]*\n/);
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
        expect(output).toContain("results := (<-promiseAll(promises))");
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
        expect(normalize(output)).toContain("retRes := (<-p)");
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
        expect(doAwaitBody).toContain("a := (<-this.FetchSpotMarkets(params))");
        expect(doAwaitBody).toContain("PanicOnError(a)");
        expect(doAwaitBody).not.toContain("Spawn");
    });
    test('receive assignments use gofmt spacing', () => {
        // gofmt writes `x := (<-this.X())`: one space either side of `:=`, none after `<-`
        const input =
        "class Exchange {\n" +
        "    async fetchSpotMarkets (params = {}): Promise<any> {\n" +
        "        return [];\n" +
        "    }\n" +
        "    async doAwait (params = {}): Promise<any> {\n" +
        "        const a = await this.fetchSpotMarkets (params);\n" +
        "        return await this.fetchSpotMarkets (params);\n" +
        "    }\n" +
        "}"
        const output = normalize(transpiler.transpileGo(input).content);
        // declaration path and awaited-return path both keep the single space
        expect(output).toContain("a := (<-this.FetchSpotMarkets(params))");
        expect(output).toContain("retRes := (<-this.FetchSpotMarkets(params))");
        // no `name:=`, no double space after `:=` and no space after `<-`
        expect(output).not.toMatch(/\w:= /);
        expect(output).not.toMatch(/:= {2}\(<-/);
        expect(output).not.toMatch(/<-\(/);
        // sends keep their space
        expect(output).toContain("ch <- retRes");
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
        expect(output).toContain("func TestWatchTickersHelper(exchange any, skippedProperties any, argSymbols any) <-chan any");
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
    test('asyncMethodSuffix renames async declarations and their checker-resolved call sites', () => {
        const suffixed = new Transpiler({ 'verbose': false, 'go': { 'asyncMethodSuffix': 'Async', 'parser': { 'NUM_LINES_END_FILE': 0 } } });
        const input =
        "async function helper(x: any): Promise<any> {\n" +
        "    return x;\n" +
        "}\n" +
        "class Base {\n" +
        "    async fetchTicker(symbol: string): Promise<any> {\n" +
        "        return { 'symbol': symbol };\n" +
        "    }\n" +
        "    parseTicker(t: any): any {\n" +
        "        return t;\n" +
        "    }\n" +
        "}\n" +
        "class Exchange extends Base {\n" +
        "    async fetchTicker(symbol: string): Promise<any> {\n" +
        "        const raw = await super.fetchTicker(symbol);\n" +
        "        const h = await helper(raw);\n" +
        "        return this.parseTicker(h);\n" +
        "    }\n" +
        "    watchTicker(symbol: string): Promise<any> {\n" +
        "        return this.fetchTicker(symbol);\n" +
        "    }\n" +
        "}";
        const output = suffixed.transpileGo(input).content;
        // declarations: async (explicit and implicit) get the suffix, sync does not
        expect(output).toMatch(/func\s+HelperAsync\(x any\) <-chan any/);
        expect(output).toMatch(/func\s+\(this \*Base\) FetchTickerAsync\(symbol any\) <-chan any/);
        expect(output).toMatch(/func\s+\(this \*Exchange\) FetchTickerAsync\(symbol any\) <-chan any/);
        expect(output).toMatch(/func\s+\(this \*Exchange\) WatchTickerAsync\(symbol any\) <-chan any/);
        expect(output).toMatch(/func\s+\(this \*Base\) ParseTicker\(t any\) any/);
        // call sites follow the callee's declaration through this/super/bare-identifier
        expect(output).toContain("<-base.FetchTickerAsync(symbol)");
        expect(output).toContain("<-HelperAsync(raw)");
        expect(output).toContain("<-this.FetchTickerAsync(symbol)");
        expect(output).toContain("this.ParseTicker(h)");
        expect(output).not.toContain("ParseTickerAsync");
        // the body sibling stays unexported and unsuffixed
        expect(output).toContain("fetchTickerBody(ch");
        // default config leaves every name untouched
        const plain = transpiler.transpileGo(input).content;
        expect(plain).not.toContain("Async");
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
        // an `any` operand: only a string/bool literal may drop the helper, the
        // box can hold a number and IsEqual converts across numeric widths
        expect(output).toContain("var g bool = (o == \"delivery\")");
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
        "    const e = i === undefined;\n" +
        "    return [ a, b, c, d, e ];\n" +
        "}\n"
        const output = transpiler.transpileGo(input).content;
        expect(output).toContain("var a bool = (s == \"delivery\")");
        expect(output).toContain("var b bool = (s != \"delivery\")");
        expect(output).toContain("var c bool = IsEqual(i, 1)");
        expect(output).toContain("var d bool = (s == nil)");
        // a nullable number keeps the helper: the box may hold int, int64 or float64
        expect(output).toContain("var e bool = IsEqual(i, nil)");
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
    test('a classifier that types an any-box read at its declaration does not make the operand native', () => {
        // ccxt installs goTypeOfInitializer hooks that name the value inside `GetValue(keys, i)`
        // (a []string element) so the *declaration* can assert it; the printed operand is
        // still an interface box, so `"a:" + keys[i]` must keep the helper
        const hooked = new Transpiler({ 'verbose': false });
        const printer: any = hooked.goTranspiler;
        const upstream = printer.goTypeOfInitializer;
        printer.goTypeOfInitializer = function (initializer, printedValue) {
            const known = upstream.call(this, initializer, printedValue);
            if (known !== undefined) {
                return known;
            }
            return /^GetValue\(keys, i\)$/.test((printedValue ?? '').trim()) ? 'string' : undefined;
        };
        const input =
        "function f (symbols: any) {\n" +
        "    const keys = Object.keys (symbols);\n" +
        "    for (let i = 0; i < keys.length; i++) {\n" +
        "        const hash = 'myTrades:' + keys[i];\n" +
        "        const key = keys[i];\n" +
        "    }\n" +
        "}\n"
        const output = hooked.transpileGo(input).content;
        expect(output).toContain("var hash any = Add(\"myTrades:\", GetValue(keys, i))");
        expect(output).toContain("var key string = GetValue(keys, i)");
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
        expect(output).toContain("if s != nil && *s != \"\" {");
        expect(output).toContain("if n != nil && *n != 0 {");
        expect(output).toContain("if flag {");
        expect(output).toContain("if len(parts) > 0 {");
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
    test('a parenthesized operand is decided on the operand itself', () => {
        const input =
        "class T {\n" +
        "    safeString (a, b) { return a; }\n" +
        "    valueIsDefined (a) { return true; }\n" +
        "    f (response: any, opt: any) {\n" +
        "        const isWsProxyDefined = this.valueIsDefined (response);\n" +
        "        const s = this.safeString (response, 'id');\n" +
        "        const picked = (isWsProxyDefined) ? 1 : 2;\n" +
        "        if ((s)) { return 1; }\n" +
        "        if ((opt)) { return 2; }\n" +
        "        return picked;\n" +
        "    }\n" +
        "}\n"
        const output = transpiler.transpileGo(input).content;
        // a parenthesized operand the printer types inlines too: the ternary becomes a
        // func literal with the bare Go bool condition, laid out the way gofmt prints a
        // func literal holding an `if` (its control clause loses the parentheses)
        expect(output).toContain("var picked any = func() any {\n\t\tif isWsProxyDefined {\n\t\t\treturn 1\n\t\t}\n\t\treturn 2\n\t}()");
        expect(output).not.toContain("Ternary(");
        expect(output).toContain("if s != nil && *s != \"\" {");
        // an `any` operand still needs the helper, parentheses or not
        expect(output).toContain("if EvalTruthy(opt) {");
    });
    test('hand-written bool fields need no truthiness helper', () => {
        const input =
        "class T {\n" +
        "    f () {\n" +
        "        if (this.enableRateLimit) { return 1; }\n" +
        "        if (!this.verbose) { return 2; }\n" +
        "        if (this.options) { return 3; }\n" +
        "        return 0;\n" +
        "    }\n" +
        "}\n"
        const output = transpiler.transpileGo(input).content;
        expect(output).toContain("if this.EnableRateLimit {");
        expect(output).toContain("if !this.Verbose {");
        // a field the printer cannot name keeps the helper
        expect(output).toContain("if EvalTruthy(this.Options) {");
    });
});

describe('go ordered comparisons inline to native operators', () => {
    test('a for-loop counter compared to a length emits `<`', () => {
        const input =
        "class T {\\n" +
        "    f (arr: any[]) {\\n" +
        "        for (let i = 0; i < arr.length; i++) {\\n" +
        "            const z = arr[i];\\n" +
        "        }\\n" +
        "    }\\n" +
        "}\\n"
        const output = transpiler.transpileGo(input).content;
        expect(output).toContain("for i := 0; i < GetArrayLength(arr); i++ {");
        expect(output).not.toContain("IsLessThan(i, GetArrayLength(arr))");
    });
    test('an int local compared to an int literal emits `>` `>=` `<=`', () => {
        const input =
        "class T {\\n" +
        "    f (arr: any[]) {\\n" +
        "        const n = arr.length;\\n" +
        "        const a = n > 0;\\n" +
        "        const b = n >= 2;\\n" +
        "        const c = n <= 3;\\n" +
        "        return [ a, b, c ];\\n" +
        "    }\\n" +
        "}\\n"
        const output = transpiler.transpileGo(input).content;
        expect(output).toContain("var a bool = (n > 0)");
        expect(output).toContain("var b bool = (n >= 2)");
        expect(output).toContain("var c bool = (n <= 3)");
        expect(output).not.toContain("IsGreaterThan(n, 0)");
        expect(output).not.toContain("IsLessThanOrEqual(n, 3)");
    });
    test('float64 keeps IsLessThan/IsLessThanOrEqual but inlines `>`/`>=`', () => {
        // the helper answers true when an operand is NaN, Go answers false, so only
        // the two operators whose result cannot differ are inlined
        const input =
        "class T {\\n" +
        "    f (v: number) {\\n" +
        "        const g = Math.floor(v);\\n" +
        "        const a = g > 5;\\n" +
        "        const b = g >= 5;\\n" +
        "        const c = g < 5;\\n" +
        "        const d = g <= 5;\\n" +
        "        return [ a, b, c, d ];\\n" +
        "    }\\n" +
        "}\\n"
        const output = transpiler.transpileGo(input).content;
        expect(output).toContain("var a bool = (g > 5)");
        expect(output).toContain("var b bool = (g >= 5)");
        expect(output).toContain("var c bool = IsLessThan(g, 5)");
        expect(output).toContain("var d bool = IsLessThanOrEqual(g, 5)");
    });
    test('an `any` operand stays on the helper', () => {
        const input =
        "class T {\\n" +
        "    f (x: any) {\\n" +
        "        return x < 5;\\n" +
        "    }\\n" +
        "}\\n"
        const output = transpiler.transpileGo(input).content;
        expect(output).toContain("return IsLessThan(x, 5)");
        expect(output).not.toContain("(x < 5)");
    });
    test('a float literal against an int local stays on the helper', () => {
        // `n < 1.5` does not compile when n is an int, and Go would reject the constant
        const input =
        "class T {\\n" +
        "    f (arr: any[]) {\\n" +
        "        const n = arr.length;\\n" +
        "        return n < 1.5;\\n" +
        "    }\\n" +
        "}\\n"
        const output = transpiler.transpileGo(input).content;
        expect(output).toContain("return IsLessThan(n, 1.5)");
    });
    test('the inlined comparison stays a Go bool in a condition', () => {
        const input =
        "class T {\\n" +
        "    f (arr: any[]) {\\n" +
        "        const n = arr.length;\\n" +
        "        if (n > 0) {\\n" +
        "            return 1;\\n" +
        "        }\\n" +
        "        return 0;\\n" +
        "    }\\n" +
        "}\\n"
        const output = transpiler.transpileGo(input).content;
        expect(output).toContain("if n > 0 {");
        expect(output).not.toContain("EvalTruthy((n > 0))");
    });
});

describe('go native element assignment', () => {
    // the printer indents nested call expressions; gofmt collapses that downstream
    const squash = (output: string) => output.replace(/ +/g, ' ');
    test('a map local with a string literal key assigns natively', () => {
        const input =
        "class Exchange {\n" +
        "    main() {\n" +
        "        const request = {};\n" +
        "        request['symbol'] = 'BTC/USDT';\n" +
        "        return request;\n" +
        "    }\n" +
        "}";
        const output = squash(transpiler.transpileGo(input).content);
        expect(output).toContain("var request map[string]any = map[string]any{}");
        expect(output).toContain("request[\"symbol\"] = \"BTC/USDT\"");
        expect(output).not.toContain("AddElementToObject");
    });
    test('a map local with a string-typed local key assigns natively', () => {
        const input =
        "class Exchange {\n" +
        "    main() {\n" +
        "        const request = {};\n" +
        "        const key = 'symbol';\n" +
        "        request[key] = 1;\n" +
        "        return request;\n" +
        "    }\n" +
        "}";
        const output = squash(transpiler.transpileGo(input).content);
        expect(output).toContain("var key string = \"symbol\"");
        expect(output).toContain("request[key] = 1");
        expect(output).not.toContain("AddElementToObject");
    });
    test('a map local with a non-string key stays on the helper', () => {
        const input =
        "class Exchange {\n" +
        "    main(params, key) {\n" +
        "        const request = {};\n" +
        "        request[key] = 1;\n" +
        "        return request;\n" +
        "    }\n" +
        "}";
        const output = squash(transpiler.transpileGo(input).content);
        expect(output).toContain("AddElementToObject(request, key, 1)");
    });
    test('a nested element chain stays on the helper: GetValue is any', () => {
        const input =
        "class Exchange {\n" +
        "    main() {\n" +
        "        const request = {};\n" +
        "        request['a']['b'] = 1;\n" +
        "        return request;\n" +
        "    }\n" +
        "}";
        const output = squash(transpiler.transpileGo(input).content);
        expect(output).toContain("AddElementToObject(GetValue(request, \"a\"), \"b\", 1)");
    });
    test('an any receiver stays on the helper: Go cannot index an interface', () => {
        const input =
        "class Exchange {\n" +
        "    main(params) {\n" +
        "        const request = params;\n" +
        "        request['symbol'] = 'x';\n" +
        "        return request;\n" +
        "    }\n" +
        "}";
        const output = squash(transpiler.transpileGo(input).content);
        expect(output).toContain("var request any = params");
        expect(output).toContain("AddElementToObject(request, \"symbol\", \"x\")");
    });
    test('a map local reassigned to another type stays on the helper', () => {
        const input =
        "class Exchange {\n" +
        "    main(params) {\n" +
        "        const request = {};\n" +
        "        request['symbol'] = 1;\n" +
        "        request = params;\n" +
        "        return request;\n" +
        "    }\n" +
        "}";
        const output = squash(transpiler.transpileGo(input).content);
        expect(output).toContain("var request any = map[string]any{}");
        expect(output).toContain("AddElementToObject(request, \"symbol\", 1)");
    });
    test('a map local from a map-returning helper assigns natively', () => {
        const input =
        "class Exchange {\n" +
        "    extend(a, b) { return a; }\n" +
        "    main(params) {\n" +
        "        const request = this.extend({}, params);\n" +
        "        request['symbol'] = 'BTC/USDT';\n" +
        "        return request;\n" +
        "    }\n" +
        "}";
        const output = squash(transpiler.transpileGo(input).content);
        expect(output).toContain("var request map[string]any = this.Extend(map[string]any{}, params)");
        expect(output).toContain("request[\"symbol\"] = \"BTC/USDT\"");
        expect(output).not.toContain("AddElementToObject");
    });
    test('+= on a map local adds through the same native index', () => {
        const input =
        "class Exchange {\n" +
        "    main() {\n" +
        "        const request = {};\n" +
        "        request['count'] += 1;\n" +
        "        return request;\n" +
        "    }\n" +
        "}";
        const output = squash(transpiler.transpileGo(input).content);
        expect(output).toContain("request[\"count\"] = Add(request[\"count\"], 1)");
        expect(output).not.toContain("AddElementToObject");
    });
    test('a slice literal local with an in-range literal index assigns natively', () => {
        const input =
        "class Exchange {\n" +
        "    main() {\n" +
        "        const copy = [1, 2, 3];\n" +
        "        copy[0] = 5;\n" +
        "        return copy;\n" +
        "    }\n" +
        "}";
        const output = squash(transpiler.transpileGo(input).content);
        expect(output).toContain("var copy []any = []any{1, 2, 3}");
        expect(output).toContain("copy[0] = 5");
        expect(output).not.toContain("AddElementToObject");
    });
    test('a literal index past the slice literal stays on the helper (Go would panic)', () => {
        const input =
        "class Exchange {\n" +
        "    main() {\n" +
        "        const copy = [1, 2, 3];\n" +
        "        copy[7] = 5;\n" +
        "        return copy;\n" +
        "    }\n" +
        "}";
        const output = squash(transpiler.transpileGo(input).content);
        expect(output).toContain("AddElementToObject(copy, 7, 5)");
    });
    test('a runtime index stays on the helper (the helper ignores out-of-range)', () => {
        const input =
        "class Exchange {\n" +
        "    main(i) {\n" +
        "        const copy = [1, 2, 3];\n" +
        "        copy[i] = 5;\n" +
        "        return copy;\n" +
        "    }\n" +
        "}";
        const output = squash(transpiler.transpileGo(input).content);
        expect(output).toContain("AddElementToObject(copy, i, 5)");
    });
    test('a rebound slice stays on the helper: its length is no longer literal', () => {
        const input =
        "class Exchange {\n" +
        "    main(other) {\n" +
        "        const copy = [1, 2, 3];\n" +
        "        copy[0] = 5;\n" +
        "        copy = other;\n" +
        "        return copy;\n" +
        "    }\n" +
        "}";
        const output = squash(transpiler.transpileGo(input).content);
        expect(output).toContain("AddElementToObject(copy, 0, 5)");
    });
    test('a []string local stays on the helper: only []any inlines', () => {
        const input =
        "class Exchange {\n" +
        "    main(market) {\n" +
        "        const parts = market.split('/');\n" +
        "        parts[0] = 'x';\n" +
        "        return parts;\n" +
        "    }\n" +
        "}";
        const output = squash(transpiler.transpileGo(input).content);
        expect(output).toContain("var parts []string = Split(market, \"/\")");
        expect(output).toContain("AddElementToObject(parts, 0, \"x\")");
    });
    test('element access on an object literal reads the Go map natively', () => {
        const input =
        "function f() {\n" +
        "    return ({ 'a': 1 })['a'];\n" +
        "}\n"
        const output = transpiler.transpileGo(input).content;
        expect(output).toContain('})["a"]');
        expect(output).not.toContain('GetValue(');
    });
    test('element access on a local the printer typed map[string]any reads natively', () => {
        const input =
        "function f() {\n" +
        "    const m = { 'a': 1 };\n" +
        "    return m['a'];\n" +
        "}\n"
        const output = transpiler.transpileGo(input).content;
        expect(output).toContain("var m map[string]any =");
        expect(output).toContain('return m["a"]');
        expect(output).not.toContain('GetValue(');
    });
    test('the native index accepts a Go string key, not just a literal', () => {
        const input =
        "function f() {\n" +
        "    const m = { 'a': 1 };\n" +
        "    const k = 'a';\n" +
        "    return m[k];\n" +
        "}\n"
        const output = transpiler.transpileGo(input).content;
        expect(output).toContain("var k string =");
        expect(output).toContain('return m[k]');
        expect(output).not.toContain('GetValue(');
    });
    test('only the first step of a chain is native, the rest stay GetValue', () => {
        const input =
        "function f() {\n" +
        "    const m = { 'a': 1 };\n" +
        "    return m['a']['b'];\n" +
        "}\n"
        const output = transpiler.transpileGo(input).content;
        expect(output).toContain('GetValue(m["a"], "b")');
    });
    test('GetValue stays when the container is boxed in any', () => {
        const input =
        "function f(m) {\n" +
        "    return m['a'];\n" +
        "}\n"
        const output = transpiler.transpileGo(input).content;
        expect(output).toContain('GetValue(m, "a")');
    });
    test('GetValue stays for an array index: nil slice and out-of-range read as nil', () => {
        const input =
        "function f() {\n" +
        "    const a = [1, 2, 3];\n" +
        "    return a[0];\n" +
        "}\n"
        const output = transpiler.transpileGo(input).content;
        expect(output).toContain('GetValue(a, 0)');
    });
    test('a typed map assignment target assigns through the same native index', () => {
        const input =
        "function f() {\n" +
        "    const x = {};\n" +
        "    x['a'] = 1;\n" +
        "}\n"
        const output = transpiler.transpileGo(input).content;
        // the printer typed the `{}` literal as a Go map, so the receiver is proven
        // indexable: the write goes through the native index exactly like the read
        // does, and no boxed receiver keeps the helper alive
        expect(output).toContain("var x map[string]any = map[string]any{}");
        expect(output).toContain('x["a"] = 1');
        expect(output).not.toContain('AddElementToObject');
    });
    test('a local the reject filters demoted to any keeps GetValue', () => {
        const input =
        "function f() {\n" +
        "    let m = {};\n" +
        "    m = g();\n" +
        "    return m['a'];\n" +
        "}\n"
        const output = transpiler.transpileGo(input).content;
        expect(output).toContain('var m any =');
        expect(output).toContain('GetValue(m, "a")');
    });
    test('string concat replaces Add when both operands are Go strings', () => {
        const input =
        "class T {\n" +
        "    id: string = 'test';\n" +
        "    f () {\n" +
        "        var s = this.id + ' does not support ' + 'market';\n" +
        "        return s;\n" +
        "    }\n" +
        "}\n"
        const output = transpiler.transpileGo(input).content;
        expect(output).toContain("var s any = this.Id + \" does not support \" + \"market\"");
        expect(output).not.toContain("Add(");
    });
    test('concat with an any operand keeps the outer Add but inlines the string part', () => {
        const input =
        "class T {\n" +
        "    id: string = 'test';\n" +
        "    f (t: string) {\n" +
        "        var s = this.id + ' does not support ' + t + ' market';\n" +
        "        return s;\n" +
        "    }\n" +
        "}\n"
        const output = transpiler.transpileGo(input).content;
        // inside a two-argument call the native `+` sits one level deep: gofmt drops its blanks
        expect(output).toContain("Add(Add(this.Id+\" does not support \", t), \" market\")");
    });
    test('int64 local minus an integer literal is a bare Go subtraction', () => {
        const input =
        "class T {\n" +
        "    milliseconds (): number { return 1; }\n" +
        "    f () {\n" +
        "        var now = this.milliseconds();\n" +
        "        var since = now - 2592000000;\n" +
        "        return since;\n" +
        "    }\n" +
        "}\n"
        const output = transpiler.transpileGo(input).content;
        expect(output).toContain("var now int64 = this.Milliseconds()");
        expect(output).toContain("var since any = now - 2592000000");
    });
    test('Divide inlines a literal divisor but keeps the helper for a zero divisor', () => {
        const input =
        "class T {\n" +
        "    milliseconds (): number { return 1; }\n" +
        "    f () {\n" +
        "        var q = this.milliseconds() / 2;\n" +
        "        var z = this.milliseconds() / 0;\n" +
        "        return q;\n" +
        "    }\n" +
        "}\n"
        const output = transpiler.transpileGo(input).content;
        expect(output).toContain("var q any = this.Milliseconds() / 2");
        expect(output).toContain("var z any = Divide(this.Milliseconds(), 0)");
    });
    test('Mod stays a helper (float semantics, no panic on a zero divisor)', () => {
        const input =
        "class T {\n" +
        "    milliseconds (): number { return 1; }\n" +
        "    f () {\n" +
        "        var r = this.milliseconds() % 2;\n" +
        "        return r;\n" +
        "    }\n" +
        "}\n"
        const output = transpiler.transpileGo(input).content;
        expect(output).toContain("var r any = Mod(this.Milliseconds(), 2)");
    });
    test('Subtract on an int-typed helper result keeps the helper (it returns int64)', () => {
        const input =
        "class T {\n" +
        "    f (a: string[]) {\n" +
        "        var n = a.length - 1;\n" +
        "        return n;\n" +
        "    }\n" +
        "}\n"
        const output = transpiler.transpileGo(input).content;
        expect(output).toContain("var n any = Subtract(GetArrayLength(a), 1)");
    });
    test('Add on an int-typed helper result is native (the helper returns int too)', () => {
        const input =
        "class T {\n" +
        "    f (a: string[]) {\n" +
        "        var n = a.length + 1;\n" +
        "        return n;\n" +
        "    }\n" +
        "}\n"
        const output = transpiler.transpileGo(input).content;
        expect(output).toContain("var n any = GetArrayLength(a) + 1");
    });
    test('float operands keep Add (the helper collapses integral results to int64)', () => {
        const input =
        "class T {\n" +
        "    f (a: number) {\n" +
        "        var n = Math.floor(a) + 1;\n" +
        "        return n;\n" +
        "    }\n" +
        "}\n"
        const output = transpiler.transpileGo(input).content;
        expect(output).toContain("Add(MathFloor(a), 1)");
    });
    test('an inferred `:=` counter is a Go int, so Add on it is a bare addition', () => {
        const input =
        "class T {\n" +
        "    f (n: number) {\n" +
        "        for (let i = 0; i < n; i++) {\n" +
        "            var index = i + 1;\n" +
        "            return index;\n" +
        "        }\n" +
        "    }\n" +
        "}\n"
        const output = transpiler.transpileGo(input).content;
        expect(output).toContain("var index any = i + 1");
        expect(output).not.toContain("Add(i, 1)");
    });
    test('an inferred counter keeps Subtract and Multiply (both helpers return int64)', () => {
        const input =
        "class T {\n" +
        "    f (n: number) {\n" +
        "        for (let i = 0; i < n; i++) {\n" +
        "            var a = i - 1;\n" +
        "            var b = i * 2;\n" +
        "            return a;\n" +
        "        }\n" +
        "    }\n" +
        "}\n"
        const output = transpiler.transpileGo(input).content;
        expect(output).toContain("Subtract(i, 1)");
        expect(output).toContain("Multiply(i, 2)");
    });
    test('an inferred counter keeps Add when its literal would not fit a Go int', () => {
        const input =
        "class T {\n" +
        "    f (n: number) {\n" +
        "        for (let i = 4294967296; i < n; i++) {\n" +
        "            var index = i + 1;\n" +
        "            return index;\n" +
        "        }\n" +
        "    }\n" +
        "}\n"
        const output = transpiler.transpileGo(input).content;
        expect(output).toContain("Add(i, 1)");
    });
    test('a float-initialised inferred counter keeps Add (the helper collapses integral results)', () => {
        const input =
        "class T {\n" +
        "    f (n: number) {\n" +
        "        for (let i = 0.5; i < n; i++) {\n" +
        "            var index = i + 1;\n" +
        "            return index;\n" +
        "        }\n" +
        "    }\n" +
        "}\n"
        const output = transpiler.transpileGo(input).content;
        expect(output).toContain("Add(i, 1)");
    });
    test('a statement-level literal local keeps the helper (its own declaration names the type)', () => {
        const input =
        "class T {\n" +
        "    milliseconds (): number { return 1; }\n" +
        "    f (n: number) {\n" +
        "        let i = 0;\n" +
        "        while (i < n) {\n" +
        "            var index = i + 1;\n" +
        "            i = i + 1;\n" +
        "        }\n" +
        "    }\n" +
        "}\n"
        const output = transpiler.transpileGo(input).content;
        expect(output).toContain("Add(i, 1)");
    });
    test('a native Add on an inferred counter keeps its parentheses inside a call argument', () => {
        const input =
        "class T {\n" +
        "    f (n: number, a: any) {\n" +
        "        for (let i = 0; i < n; i++) {\n" +
        "            this.log (i + 1, a);\n" +
        "        }\n" +
        "    }\n" +
        "}\n"
        const output = transpiler.transpileGo(input).content;
        expect(output).toContain("callDynamically(\"log\", i+1, a)");
    });
    test('an int64 call plus an int counter keeps the helper (mixed kinds)', () => {
        const input =
        "class T {\n" +
        "    milliseconds (): number { return 1; }\n" +
        "    f (n: number) {\n" +
        "        for (let i = 0; i < n; i++) {\n" +
        "            var t = this.milliseconds () + i;\n" +
        "            return t;\n" +
        "        }\n" +
        "    }\n" +
        "}\n"
        const output = transpiler.transpileGo(input).content;
        expect(output).toContain("Add(this.Milliseconds(), i)");
    });
    test('concatenating into a typed string field is a compound assignment', () => {
        const input =
        "class T {\n" +
        "    id: string = 'test';\n" +
        "    f () {\n" +
        "        this.id += 'x';\n" +
        "    }\n" +
        "}\n"
        const output = transpiler.transpileGo(input).content;
        expect(output).toContain("this.Id += \"x\"");
    });

    test('a nullable scalar in an any box compares natively', () => {
        const input =
        "type Str = string | undefined;\n" +
        "type Bool = boolean | undefined;\n" +
        "function f (s: Str, flag: Bool, n: number | undefined) {\n" +
        "    const a = s === 'delivery';\n" +
        "    const b = s !== undefined;\n" +
        "    const c = flag === true;\n" +
        "    const d = flag === undefined;\n" +
        "    const e = n === undefined;\n" +
        "    const g = n === 1;\n" +
        "    return [ a, b, c, d, e, g ];\n" +
        "}\n"
        const output = transpiler.transpileGo(input).content;
        expect(output).toContain("var a bool = (s == \"delivery\")");
        expect(output).toContain("var b bool = (s != nil)");
        expect(output).toContain("var c bool = (flag == true)");
        expect(output).toContain("var d bool = (flag == nil)");
        expect(output).toContain("var e bool = IsEqual(n, nil)");
        // numbers keep the helper: the box may hold int, int64 or float64
        expect(output).toContain("var g bool = IsEqual(n, 1)");
    });
    test('an any local rewritten from a *string helper keeps the deref-aware helper', () => {
        const input =
        "type Str = string | undefined;\n" +
        "class T {\n" +
        "    safeString (a, b): Str { return a; }\n" +
        "    f (order: any) {\n" +
        "        let timeInForce = this.safeString (order, 'timeInForce');\n" +
        "        if (timeInForce === undefined) { timeInForce = 'IOC'; }\n" +
        "        const y = (timeInForce !== undefined) && (timeInForce === 'PO');\n" +
        "        return y;\n" +
        "    }\n" +
        "}\n"
        const output = transpiler.transpileGo(input).content;
        // the later string write keeps the local `any`, so it boxes the *string the
        // helper returned: a nil pointer inside `any` is not `== nil`, and the box is
        // never `== "PO"` — only IsEqual derefs it
        expect(output).toContain("var timeInForce any = this.SafeString(order, \"timeInForce\")");
        expect(output).toContain("if IsEqual(timeInForce, nil) {");
        expect(output).toContain("var y bool = (!IsEqual(timeInForce, nil)) && (IsEqual(timeInForce, \"PO\"))");
        expect(output).not.toContain("timeInForce == nil");
    });
    test('two nullable boxes of the same family compare natively', () => {
        const input =
        "type Str = string | undefined;\n" +
        "function f (a: Str, b: Str, c: string, d: Str) {\n" +
        "    const x = a === b;\n" +
        "    const y = c === d;\n" +
        "    return [ x, y ];\n" +
        "}\n"
        const output = transpiler.transpileGo(input).content;
        expect(output).toContain("var x bool = (a == b)");
        expect(output).toContain("var y bool = (c == d)");
    });
    test('a boxed helper result and the typed accessors compare against nil, a string and a bool', () => {
        const input =
        "class T {\n" +
        "    safeValue (a, b) { return a; }\n" +
        "    safeBool (a, b) { return a; }\n" +
        "    safeDict (a, b) { return a; }\n" +
        "    f (response: any, key: string) {\n" +
        "        const v = this.safeValue (response, key);\n" +
        "        const r = GetValue(response, key);\n" +
        "        const a = this.safeBool (response, key) === true;\n" +
        "        const b = this.safeDict (response, key) !== undefined;\n" +
        "        const c = GetValue(response, key) === 'spot';\n" +
        "        const d = GetValue(response, key) === undefined;\n" +
        "        const e = Ternary(true, r, v) === false;\n" +
        "        return [ v, r, a, b, c, d, e ];\n" +
        "    }\n" +
        "}\n"
        const output = transpiler.transpileGo(input).content;
        // this.SafeBool(...) is a *bool accessor: `== true` would not compile against
        // the pointer, and a call must not be repeated by the deref branches, so the
        // deref-aware IsEqual is the only emission with the same predicate
        expect(output).toContain("var a bool = IsEqual(this.SafeBool(response, key), true)");
        // an any-typed nil test is not a proven nullable scalar, so it keeps the helper
        expect(output).toContain("var b bool = !IsEqual(this.SafeDict(response, key), nil)");
        expect(output).toContain("var c bool = (GetValue(response, key) == \"spot\")");
        // an any-typed operand is not a proven nullable scalar: nil stays on the helper
        expect(output).toContain("var d bool = IsEqual(GetValue(response, key), nil)");
        expect(output).toContain("var e bool = (Ternary(true, r, v) == false)");
    });
    test('a concrete Go scalar keeps the helper for a nil test', () => {
        const input =
        "class T {\n" +
        "    f (s: string, d: any) {\n" +
        "        const n = s.length;\n" +
        "        const m = d.length;\n" +
        "        const a = n === undefined;\n" +
        "        const b = m === undefined;\n" +
        "        return [ a, b ];\n" +
        "    }\n" +
        "}\n"
        const output = transpiler.transpileGo(input).content;
        // `n` is an `any` box whose TypeScript type is `number` and `m` is a plain Go
        // int: `== nil` would not compile against the int, and the number family stays
        // on the helper in both cases
        expect(output).toContain("IsEqual(n, nil)");
        expect(output).toContain("IsEqual(m, nil)");
        expect(output).not.toContain("n == nil");
        expect(output).not.toContain("m == nil");
    });
    test('a number literal on a box stays on the helper, string and bool inline', () => {
        const input =
        "class T {\n" +
        "    f (o: any) {\n" +
        "        const values = o;\n" +
        "        const a = values === 0;\n" +
        "        const b = values === false;\n" +
        "        const c = values === '';\n" +
        "        return [ a, b, c ];\n" +
        "    }\n" +
        "}\n"
        const output = transpiler.transpileGo(input).content;
        expect(output).toContain("var a bool = IsEqual(values, 0)");
        expect(output).toContain("var b bool = (values == false)");
        expect(output).toContain("var c bool = (values == \"\")");
    });
});

describe('go array push onto an element access', () => {
    test('a native map index receiver is hoisted into a local before AppendToArray', () => {
        const input =
        "class Exchange {\n" +
        "    main(market: Dict) {\n" +
        "        const request: Dict = {};\n" +
        "        request['base'] = [];\n" +
        "        request['base'].push (market['baseId']);\n" +
        "        return request;\n" +
        "    }\n" +
        "}\n";
        const output = transpiler.transpileGo(input).content;
        expect(output).not.toContain('AppendToArray(&request["base"]');
        expect(output).toMatch(/retRes\d+ := request\["base"\]\n\s*AppendToArray\(&retRes\d+, /);
    });
});

// gofmt's go/printer/nodes.go controlClause() prints the condition of if/for through
// stripParens(): the outermost fully enclosing parentheses pair is dropped, and the
// rule repeats while the enclosed expression is parenthesized as well. Every expected
// line below was fed to /usr/local/go/bin/gofmt to prove it is a gofmt fixed point.
describe('go control-clause parens (gofmt stripParens)', () => {
    test('the outer parentheses of an if condition are dropped', () => {
        const input =
        "const a = \"x\";\n" +
        "const b = \"y\";\n" +
        "if ((a !== b)) {\n" +
        "    return 1;\n" +
        "}\n" +
        "return 0;";
        const output = transpiler.transpileGo(input).content;
        expect(output).toContain("if a != b {");
        expect(output).not.toContain("if (a != b) {");
    });
    test('a parenthesised else-if condition loses its parentheses too', () => {
        const input =
        "const a = \"x\";\n" +
        "if ((a !== \"\")) {\n" +
        "    const f = 1;\n" +
        "} else if ((a !== \"y\")) {\n" +
        "    const f = 2;\n" +
        "}";
        const output = transpiler.transpileGo(input).content;
        expect(output).toContain("if a != \"\" {");
        expect(output).toContain("} else if !IsEqual(a, \"y\") {");
    });
    test('while and the condition of a three-clause for follow the same rule', () => {
        const whileInput =
        "const calls = 0;\n" +
        "const maxCalls = 10;\n" +
        "while ((calls < maxCalls)) {\n" +
        "    break;\n" +
        "}";
        expect(transpiler.transpileGo(whileInput).content).toContain("for IsLessThan(calls, maxCalls) {");
        const forInput =
        "const n = 3;\n" +
        "for (let i = 0; (i < n); i++) {\n" +
        "    const f = 1;\n" +
        "}";
        expect(transpiler.transpileGo(forInput).content).toContain("for i := 0; IsLessThan(i, n); i++ {");
    });
    test('parentheses around an operand are not a control clause and stay', () => {
        const input =
        "class T {\n" +
        "    inArray2 (a: any) { return true; }\n" +
        "    f (params: any) {\n" +
        "        if ((this.inArray2 (params)) || (this.inArray2 (params))) { return 1; }\n" +
        "        return 0;\n" +
        "    }\n" +
        "}\n"
        const output = transpiler.transpileGo(input).content;
        expect(output).toContain("if EvalTruthy((this.InArray2(params))) || EvalTruthy((this.InArray2(params))) {");
    });
    test('the composite-literal guard of stripParens keeps the parentheses', () => {
        const go = (transpiler as any).goTranspiler;
        // `if T{} == x` does not parse and `if x == T{} {}` is rejected by gofmt too
        expect(go.goEnclosedExpression("(T{1} == x)")).toBeUndefined();
        expect(go.goEnclosedExpression("(x == MyStruct{a: 1})")).toBeUndefined();
        // a type literal is not a type name, so those parentheses go
        expect(go.goEnclosedExpression("(x == map[string]any{\"a\": 1})")).toBe("x == map[string]any{\"a\": 1}");
        expect(go.goEnclosedExpression("(x == []any{1})")).toBe("x == []any{1}");
        // parentheses inside a nested pair are protected, the pair itself is not
        expect(go.goEnclosedExpression("((x == 1))")).toBe("(x == 1)");
        expect(go.goEnclosedExpression("((x == 1) && (x == 2))")).toBe("(x == 1) && (x == 2)");
        expect(go.goEnclosedExpression("(a) && (b)")).toBeUndefined();
        expect(go.goEnclosedExpression("(len(parts) > 0)")).toBe("len(parts) > 0");
    });
});

describe('go redundant parentheses', () => {
    // gofmt prints a ParenExpr whose child is itself a ParenExpr without its own pair
    // (`((x))` prints as `(x)`): a source parenthesis around an expression the printer
    // already prints parenthesised must emit the single pair gofmt keeps.
    test('a parenthesised expression that already prints parenthesised collapses to one pair', () => {
        const input =
        "function f (x: string, o: any) {\n" +
        "    const a = (x === 'delivery');\n" +
        "    const b = ((x === 'delivery'));\n" +
        "    const c = (o === 'delivery');\n" +
        "    return [ a, b, c ];\n" +
        "}\n"
        const output = transpiler.transpileGo(input).content;
        expect(output).toMatch(/var a bool =\s+\(x == "delivery"\)/);
        expect(output).toMatch(/var b bool =\s+\(x == "delivery"\)/);
        expect(output).toMatch(/var c bool =\s+\(o == "delivery"\)/);
        expect(output).not.toContain("((x == \"delivery\"");
        expect(output).not.toContain("((IsEqual");
    });
    test('a parenthesised ternary condition emits one pair', () => {
        const input =
        "function f (x: string) {\n" +
        "    const a = (x === 'delivery') ? 'yes' : 'no';\n" +
        "    return a;\n" +
        "}\n"
        const output = transpiler.transpileGo(input).content;
        expect(output).toContain("func() any {\n\t\tif x == \"delivery\" {\n\t\t\treturn \"yes\"\n\t\t}\n\t\treturn \"no\"\n\t}()");
        expect(output).not.toContain("Ternary(((x == \"delivery\")");
    });
    test('parentheses that are not redundant stay: call arguments and operand pairs', () => {
        const input =
        "function f (n: number) {\n" +
        "    const a = Math.abs((n));\n" +
        "    const b = (n === 1) || (n === 2);\n" +
        "    return [ a, b ];\n" +
        "}\n"
        const output = transpiler.transpileGo(input).content;
        // the parentheses of a call are not a ParenExpr, the argument keeps its own pair
        expect(output).toContain("mathAbs((n))");
        // the source pairs sit on the operands, not around the whole disjunction
        expect(output).toContain("(n == 1) || (n == 2)");
        expect(output).not.toContain("((n == 1))");
    });
});

describe('go composite literal column alignment', () => {
    // F09: gofmt aligns the values of the consecutive single-line `key: value` entries of a
    // composite literal to the widest key of the block (go/printer exprList emits `:` +
    // vtab, text/tabwriter pads the column). The assertions below drop the leading
    // indentation so they stay independent of the indent unit.
    test('consecutive single-line entries align on the widest key', () => {
        const input =
        "class T {\n" +
        "    f () {\n" +
        "        const x = {\n" +
        "            'id': 'binance',\n" +
        "            'rateLimit': 50,\n" +
        "            'pro': true\n" +
        "        }\n" +
        "        return x;\n" +
        "    }\n" +
        "}\n"
        const output = transpiler.transpileGo(input).content;
        // "rateLimit" is the widest key cell (`"rateLimit":`, 12) -> column 13
        expect(output).toContain('"id":        "binance",');
        expect(output).toContain('"rateLimit": 50,');
        expect(output).toContain('"pro":       true,');
    });
    test('an entry whose value spans lines ends the alignment block', () => {
        const input =
        "class T {\n" +
        "    f () {\n" +
        "        const x = {\n" +
        "            'a': 1,\n" +
        "            'bb': 2,\n" +
        "            'nested': { 'longerKey': 1, 'x': 2 },\n" +
        "            'c': 3,\n" +
        "            'dd': 4\n" +
        "        }\n" +
        "        return x;\n" +
        "    }\n" +
        "}\n"
        const output = transpiler.transpileGo(input).content;
        expect(output).toContain('"a":  1,');
        expect(output).toContain('"bb": 2,');
        // the nested literal is not padded, and its own body starts a new block
        expect(output).toContain('"nested": map[string]any{');
        expect(output).toContain('"longerKey": 1,');
        expect(output).toContain('"x":         2,');
        // entries after the multi-line value align against each other, not against "a"/"bb"
        expect(output).toContain('"c":  3,');
        expect(output).toContain('"dd": 4,');
    });
    test('a key larger than 40 bytes breaks the section when it leaves the 2.5 ratio', () => {
        const input =
        "class T {\n" +
        "    f () {\n" +
        "        const x = {\n" +
        "            'short': 1,\n" +
        "            'thisIsAVeryLongKeyNameThatIsLongerThanFortyCharactersForSure': 2,\n" +
        "            'b': 3,\n" +
        "            'c': 4\n" +
        "        }\n" +
        "        return x;\n" +
        "    }\n" +
        "}\n"
        const output = transpiler.transpileGo(input).content;
        // 65 / 7 > 2.5 -> formfeed section break, so neither neighbour is padded
        expect(output).toContain('"short": 1,');
        expect(output).toContain('"thisIsAVeryLongKeyNameThatIsLongerThanFortyCharactersForSure": 2,');
        // the ratio of "b" against the new section's geomean is under 1/2.5 -> one more break
        expect(output).toContain('"b": 3,');
        expect(output).toContain('"c": 4,');
        expect(output).not.toContain('"b":   3,');
    });
    test('a trailing comment keeps its comma in front and aligns on the comment column', () => {
        const input =
        "class T {\n" +
        "    f () {\n" +
        "        const x = {\n" +
        "            'a': 1,\n" +
        "            'bb': 2 // last property keeps its trailing comment\n" +
        "        }\n" +
        "        return x;\n" +
        "    }\n" +
        "}\n"
        const output = transpiler.transpileGo(input).content;
        // gofmt prints `value, // comment`; the printer used to emit `// comment,` (the
        // comma landed inside the comment) which is not valid Go
        expect(output).toContain('"a":  1,');
        expect(output).toContain('"bb": 2, // last property keeps its trailing comment');
        expect(output).not.toContain('// last property keeps its trailing comment,');
    });
});

describe('go trailing comment alignment', () => {
    test('adjacent statements share one comment column', () => {
        const input =
        "class T {\n" +
        "    f (a: any) {\n" +
        "        const x = 1; // one\n" +
        "        const yyyy = 2222; // two\n" +
        "        return a;\n" +
        "    }\n" +
        "}\n"
        const output = transpiler.transpileGo(input).content;
        // gofmt pads both code cells to the widest one plus one space (tabwriter column)
        expect(output).toContain("var x any = 1       // one");
        expect(output).toContain("var yyyy any = 2222 // two");
    });
    test('a lone trailing comment is padded with exactly one space', () => {
        const input =
        "class T {\n" +
        "    f (a: any) {\n" +
        "        return null; // fallback\n" +
        "    }\n" +
        "}\n"
        const output = transpiler.transpileGo(input).content;
        // the return emitter separates the comment with two spaces; a one-line column gets one
        expect(output).toContain("return nil // fallback");
        expect(output).not.toContain("return nil  // fallback");
    });
    test('a nested block starts a new comment column', () => {
        const input =
        "class T {\n" +
        "    f (a: any) {\n" +
        "        const xxxxxxxxxx = 1; // one\n" +
        "        if (a) {\n" +
        "            return a; // inner\n" +
        "        }\n" +
        "        const y = 2; // two\n" +
        "        return y;\n" +
        "    }\n" +
        "}\n"
        const output = transpiler.transpileGo(input).content;
        expect(output).toContain("var xxxxxxxxxx any = 1 // one");
        expect(output).toContain("return a // inner");
        expect(output).toContain("var y any = 2 // two");
    });
    test('//nolint comments are aligned like any other comment', () => {
        const input =
        "class T {\n" +
        "    f (a: any) {\n" +
        "        const a1 = 1; //nolint:gosec\n" +
        "        const bbbb = 2; //nolint\n" +
        "        return a1;\n" +
        "    }\n" +
        "}\n"
        const output = transpiler.transpileGo(input).content;
        expect(output).toContain("var a1 any = 1   //nolint:gosec");
        expect(output).toContain("var bbbb any = 2 //nolint");
    });
    test('a // inside a string literal is not a trailing comment', () => {
        const input =
        "class T {\n" +
        "    f (a: any) {\n" +
        "        const url = 'https://example.com/x';\n" +
        "        const yyyy = 2222; // two\n" +
        "        return url;\n" +
        "    }\n" +
        "}\n"
        const output = transpiler.transpileGo(input).content;
        // the URL line carries no comment, so it neither joins nor shapes a column
        expect(output).toContain("var url string = \"https://example.com/x\"\n");
        expect(output).toContain("var yyyy any = 2222 // two");
    });
    test('the alignment pass is idempotent', () => {
        const input =
        "class T {\n" +
        "    f (a: any) {\n" +
        "        const x = 1; // one\n" +
        "        const yyyy = 2222; // two\n" +
        "        return null; // fallback\n" +
        "    }\n" +
        "}\n"
        const once = transpiler.transpileGo(input).content;
        expect(alignGoTrailingComments(once)).toBe(once);
    });
});

describe('go comment placement on the trampoline body half (gofmt)', () => {
    // The body half of an async method is a plain function whose statements, default
    // initializers and leading `/** */` doc block all sit at the defers' level, and every
    // `*` continuation line keeps its single leading space: gofmt re-indents a /* */ block
    // to `<indent> * text` (go/printer stripCommonPrefix + one tab per level).
    test('a doc block on the body first statement keeps its * alignment and level', () => {
        const input =
        "class Exchange {\n" +
        "    async fetchMarkOHLCV (symbol: string, timeframe = '1m', params = {}): Promise<any> {\n" +
        "        /**\n" +
        "         * @method\n" +
        "         * @name exchange#fetchMarkOHLCV\n" +
        "         */\n" +
        "        if (!this.has['fetchMarkOHLCV']) {\n" +
        "            throw new NotSupported(this.id + ' fetchMarkOHLCV not supported');\n" +
        "        }\n" +
        "        return { 'symbol': symbol };\n" +
        "    }\n" +
        "}\n"
        const output = transpiler.transpileGo(input).content;
        const lines = output.slice(output.indexOf("func (this *Exchange) fetchMarkOHLCVBody(")).split("\n");
        const indent = /^([ \t]+)defer close\(ch\)$/.exec(lines[1])[1];
        expect(lines[2]).toBe(`${indent}defer ReturnPanicError(ch)`);
        expect(lines[3]).toBe(`${indent}/**`);
        expect(lines[4]).toBe(`${indent} * @method`);
        expect(lines[5]).toBe(`${indent} * @name exchange#fetchMarkOHLCV`);
        expect(lines[6]).toBe(`${indent} */`);
        expect(lines[7]).toBe(`${indent}timeframe := GetArg(optionalArgs, 0, "1m")`);
        expect(lines[8]).toBe(`${indent}_ = timeframe`);
        expect(lines[9]).toBe(`${indent}params := GetArg(optionalArgs, 1, map[string]any{})`);
    });
    test('the body statements are not indented one level deeper than the defers', () => {
        const input =
        "class Exchange {\n" +
        "    async fetchTime (params = {}): Promise<any> {\n" +
        "        return this.milliseconds();\n" +
        "    }\n" +
        "}\n"
        const output = transpiler.transpileGo(input).content;
        const lines = output.slice(output.indexOf("func (this *Exchange) fetchTimeBody(")).split("\n");
        const indent = /^([ \t]+)defer close\(ch\)$/.exec(lines[1])[1];
        expect(lines[3]).toBe(`${indent}params := GetArg(optionalArgs, 0, map[string]any{})`);
        expect(lines[4]).toBe(`${indent}_ = params`);
        const chLine = lines.findIndex((line) => line.includes('ch <- callDynamically("milliseconds"'));
        expect(lines[chLine]).toBe(`${indent}ch <- callDynamically("milliseconds", )`);
        expect(lines[chLine + 1]).toBe(`${indent}return nil`);
    });
    test('a leading comment on a return statement does not swallow the ch <- indentation', () => {
        const input =
        "class Exchange {\n" +
        "    async fetchTicker (symbol: string, params = {}): Promise<any> {\n" +
        "        const x = 1;\n" +
        "        // parse the ticker through the helper\n" +
        "        return this.parseTicker(x);\n" +
        "    }\n" +
        "}\n"
        const output = transpiler.transpileGo(input).content;
        const lines = output.slice(output.indexOf("func (this *Exchange) fetchTickerBody(")).split("\n");
        const commentLine = lines.findIndex((line) => line.trim() === '// parse the ticker through the helper');
        const indent = /^([ \t]*)/.exec(lines[commentLine])[1];
        expect(commentLine).toBeGreaterThan(-1);
        expect(lines[commentLine + 1]).toBe(`${indent}ch <- callDynamically("parseTicker", x)`);
        expect(lines[commentLine + 2]).toBe(`${indent}return nil`);

    });
});
// ---------------------------------------------------------------------------
// gofmt binary expression spacing (go/printer nodes.go: binaryExpr/cutoff)
// ---------------------------------------------------------------------------
// gofmt prints a level-4/5 operator (`+ - * / % & | ^ << >>`) with a blank around
// it only at the top level of a statement - `x := "a" + "b"` - and compact one
// level down: as an argument of a call with more than one argument, inside an
// index expression (`a[i+1]`), or as the operand that a `+`/`*` chain nests
// (`a*b + c`). Every expectation below was checked against `/usr/local/go/bin/gofmt`
// (the same Go text is what gofmt prints, i.e. `gofmt -d` reports no difference).
describe('gofmt binary expression spacing', () => {
    let native: Transpiler;

    beforeAll(() => {
        const config = {
            'verbose': false,
            'go': {
                'parser': {
                    'NUM_LINES_END_FILE': 0,
                }
            }
        }
        native = new Transpiler(config);
        // the Go printer routes `+ - * / %` through the numeric helpers
        // (Add/Subtract/Multiply/Divide/Mod); printing them natively exercises the
        // gofmt spacing rule itself, which is what the campaign removes gofmt for
        const goTranspiler: any = (native as any).goTranspiler;
        goTranspiler.binaryExpressionsWrappers = {};
        Object.assign(goTranspiler.SupportedKindNames, {
            [SyntaxKind.PlusToken]: '+',
            [SyntaxKind.MinusToken]: '-',
            [SyntaxKind.AsteriskToken]: '*',
            [SyntaxKind.SlashToken]: '/',
            [SyntaxKind.PercentToken]: '%',
            [SyntaxKind.LessThanLessThanToken]: '<<',
        });
    });

    const go = (source: string) => native.transpileGo(source).content;

    test('top level of a statement keeps the blanks', () => {
        expect(go('const x = a + b;')).toBe('var x any = a + b');
        expect(go('const x = a + b + c;')).toBe('var x any = a + b + c');
        expect(go('const x = a + b * c;')).toBe('var x any = a + b*c');
        expect(go('const x = a * b + c;')).toBe('var x any = a*b + c');
        expect(go('const x = a % b + c % d;')).toBe('var x any = a%b + c%d');
        expect(go('const x = (a + b) * c;')).toBe('var x any = (a + b) * c');
    });

    test('an index expression prints its operand one level deeper', () => {
        expect(go('const x = y[i + 1];')).toBe('var x any = GetValue(y, i+1)');
        expect(go('const x = y[i] + 1;')).toBe('var x any = GetValue(y, i) + 1');
    });

    test('arguments of a call with more than one argument print one level deeper', () => {
        expect(go('const x = this.f2(a, b + c);')).toBe('var x any = callDynamically("f2", a, b+c)');
        expect(go('const x = this.f2(a + b);')).toBe('var x any = callDynamically("f2", a+b)');
        expect(go('const x = this.f3(a, b, c + d);')).toBe('var x any = callDynamically("f3", a, b, c+d)');
        expect(go('const x = this.f4(this.g(a, b + c));')).toBe('var x any = callDynamically("f4", callDynamically("g", a, b+c))');
    });

    test('composite literal elements and assignment right sides stay at the top level', () => {
        expect(go("const p = { 'k': a + b };")).toBe('var p map[string]any = map[string]any{\n\t"k": a + b,\n}');
        expect(go("const p = { 'k': this.f2(a, b + c) };")).toBe('var p map[string]any = map[string]any{\n\t"k": callDynamically("f2", a, b+c),\n}');
        expect(go('let z = 1; z = a + b;')).toBe('var z any = 1\nz = a + b');
    });

    test('parentheses undo one level of depth', () => {
        expect(go('const x = a * (b - c);')).toBe('var x any = a * (b - c)');
        expect(go('const x = (a << b) + c;')).toBe('var x any = (a << b) + c');
    });

    test('levels 3 and below always keep their blanks', () => {
        expect(go('const x = (a && b) || c;')).toBe('var x bool = (EvalTruthy(a) && EvalTruthy(b)) || EvalTruthy(c)');
        expect(go('if (a == b) { return 1; }')).toBe('if IsEqual(a, b) {\n\treturn 1\n}');
    });

    test('inside a single argument call nothing is compacted', () => {
        expect(go('const x = this.f2(a + b);').startsWith('var x any = callDynamically')).toBe(true);
        expect(go('const x = f(a + b);')).toBe('var x any = F(a + b)');
    });

    test('without the native operator mapping the helper calls are unchanged', () => {
        expect(transpiler.transpileGo('const x = a + b;').content).toBe('var x any = Add(a, b)');
        expect(transpiler.transpileGo('const x = a + b * c;').content).toBe('var x any = Add(a, Multiply(b, c))');
        expect(transpiler.transpileGo('let z = 1; z = a + b;').content).toBe('var z any = 1\nz = Add(a, b)');
    });
});

describe('go gofmt-clean native shapes', () => {
    const transpiler = new Transpiler({ verbose: false, go: { uncamelcaseIdentifiers: false } });
    test('a ternary func literal is laid out like gofmt prints it, nested literals relative to their return', () => {
        const input =
            "class Exchange {\n" +
            "    foo(isMaker: boolean, x: any) {\n" +
            "        const a = isMaker ? { 'k': 1 } : { 'k': 2 };\n" +
            "        if (isMaker) {\n" +
            "            return this.bar(isMaker ? x : 'y', isMaker ? 'maker' : 'taker');\n" +
            "        }\n" +
            "        return { 'side': isMaker ? 'buy' : 'sell', 'z': 1 };\n" +
            "    }\n" +
            "    bar(a: any, b: any) { return a; }\n" +
            "}\n";
        const output = transpiler.transpileGo(input).content;
        expect(output).toContain(
            "\tvar a any = func() any {\n" +
            "\t\tif EvalTruthy(isMaker) {\n" +
            "\t\t\treturn map[string]any{\n" +
            "\t\t\t\t\"k\": 1,\n" +
            "\t\t\t}\n" +
            "\t\t}\n" +
            "\t\treturn map[string]any{\n" +
            "\t\t\t\"k\": 2,\n" +
            "\t\t}\n" +
            "\t}()\n");
        expect(output).toContain(
            "\t\treturn this.Bar(func() any {\n" +
            "\t\t\tif EvalTruthy(isMaker) {\n" +
            "\t\t\t\treturn x\n" +
            "\t\t\t}\n" +
            "\t\t\treturn \"y\"\n" +
            "\t\t}(), func() any {\n");
        expect(output).toContain("\t\t\"side\": func() any {\n\t\t\tif EvalTruthy(isMaker) {\n\t\t\t\treturn \"buy\"\n\t\t\t}\n\t\t\treturn \"sell\"\n\t\t}(),\n\t\t\"z\": 1,\n");
        expect(output).not.toContain("Ternary(");
    });
    test('a native in-op literal stays on one line only while it fits gofmt\'s 100 columns', () => {
        const short = "function f(obj: any) { const d: { [k: string]: any } = {}; return 'k' in d; }";
        expect(transpiler.transpileGo(short).content).toContain("func() bool { _, ok := d[\"k\"]; return ok }()");
        const long = "function f() { const dictionaryWithAVeryLongName: { [k: string]: any } = {}; return 'someQuiteLongLookupKeyNameThatOverflowsTheWidthLimit' in dictionaryWithAVeryLongName; }";
        expect(transpiler.transpileGo(long).content).toContain("func() bool {\n\t\t_, ok := dictionaryWithAVeryLongName[\"someQuiteLongLookupKeyNameThatOverflowsTheWidthLimit\"]\n\t\treturn ok\n\t}()");
    });
    test('native arithmetic drops its blanks one level inside a call, keeps them in a plain assignment', () => {
        const input =
            "class T {\n" +
            "    id: string = 'test';\n" +
            "    milliseconds (): number { return 1; }\n" +
            "    f (params: any) {\n" +
            "        const request: { [k: string]: any } = {};\n" +
            "        request['type'] = this.id + '_' + this.id;\n" +
            "        const auth: string[] = [];\n" +
            "        auth.push(this.id + '=' + this.id);\n" +
            "        const parts = [ 'a', 'client-or' + 'der-id' ];\n" +
            "        const idx = this.milliseconds();\n" +
            "        const rest = this.id.slice(idx + 1);\n" +
            "        return [ request, auth, parts, rest ];\n" +
            "    }\n" +
            "}\n";
        const output = transpiler.transpileGo(input).content;
        expect(output).toContain("request[\"type\"] = this.Id + \"_\" + this.Id");
        expect(output).toContain("AppendToArray(&auth, this.Id+\"=\"+this.Id)");
        expect(output).toContain("[]any{\"a\", \"client-or\" + \"der-id\"}");
        expect(output).toContain("Slice(this.Id, idx+1, nil)");
    });
});
