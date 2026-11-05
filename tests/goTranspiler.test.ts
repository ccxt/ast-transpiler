import { assert } from 'console';
import { installFmGo5G04, Transpiler, alignGoTrailingComments, installCcxtGoHooks } from '../src/transpiler';

import { SyntaxKind } from 'typescript/unstable/ast';
import { readFileSync } from 'fs';
import * as nodefs from 'fs';
import * as nodepath from 'path';
import * as nodeos from 'os';
import { installFmGo5G01 } from '../src/transpiler';
import { installCcxtGoLocalTypes } from '../src/transpiler';
import { installFmGo5GP08 } from '../src/transpiler';
import { installFmGo5OG02 } from '../src/transpiler';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { installCcxtGoHooks as installCcxtGoHooksFromGoModule } from '../src/goTranspiler';
import fs__goToStringNativeArms from 'fs';
import os__goToStringNativeArms from 'os';
import path__goToStringNativeArms from 'path';
import fs__goTypedSliceArgs from 'fs';
import os__goTypedSliceArgs from 'os';
import path__goTypedSliceArgs from 'path';
import { installCcxtGoSignTyping } from '../src/transpiler';
import { goDynamicCallParamsCheck } from '../src/transpiler';
import { goDictParamTypesSelfTest } from '../src/transpiler';
import { goParseFrameParamTypesSelfTest } from '../src/transpiler';
import { goHandleErrorsCodeSelfTest } from '../src/transpiler';
import { goNilJoinTypeSelfTest } from '../src/transpiler';
import fs__goAnySliceToList from 'fs';
import os__goAnySliceToList from 'os';
import path__goAnySliceToList from 'path';
import fs__goEndpointReceiveTypedView from 'fs';
import os__goEndpointReceiveTypedView from 'os';
import path__goEndpointReceiveTypedView from 'path';
import fs__goBaseMapLocals from 'fs';
import os__goBaseMapLocals from 'os';
import path__goBaseMapLocals from 'path';
import { installCcxtGoDictParams } from '../src/transpiler';
import { installRfGo5OwnedTables } from '../src/transpiler';
import fs__rfmG4G21 from 'fs';
import os__rfmG4G21 from 'os';
import path__rfmG4G21 from 'path';
import fs__rfmG4GB08 from 'fs';
import os__rfmG4GB08 from 'os';
import path__rfmG4GB08 from 'path';

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
        expect(output).toContain("var params map[string]any = GetArgMap(optionalArgs, 0, map[string]any{})");
        expect(output.indexOf("var params map[string]any = GetArgMap")).toBeGreaterThan(output.indexOf("fetchTickerBody(ch chan any"));
    });
    test('a {}-defaulted params used as a ternary arm stays a typed map', () => {
        const input =
        "type Dict = { [key: string]: any };\n" +
        "type Str = string | undefined;\n" +
        "class Exchange {\n" +
        "    omit (x: Dict, k: string): Dict { return x; }\n" +
        "    safeString (x: Dict, k: string): Str { return undefined; }\n" +
        "    async fetchTicker(symbol: string, params: Dict = {}): Promise<any> {\n" +
        "        const cost = this.safeString (params, 'cost');\n" +
        "        const paramsCost = (cost !== undefined) ? this.omit (params, 'cost') : params;\n" +
        "        return paramsCost;\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileGo(input).content;
        expect(output).toContain("var params map[string]any = GetArgMap(optionalArgs, 0, map[string]any{})");
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
    test('a local reassigned with another type stays any, an appended []string keeps its type', () => {
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
        expect(output).toContain("var appended []string = Split(market, \"/\")");
        expect(output).toContain("appended = append(appended, \"extra\")");
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
    test('an annotated string local with a literal default takes the deref', () => {
        const input =
        "class Exchange {\n" +
        "    safeString(a, b, c) { return a; }\n" +
        "    main(o) {\n" +
        "        const id: string = this.safeString (o, 'id', 'dflt');\n" +
        "        return id + 'x';\n" +
        "    }\n" +
        "}\n" +
        "";
        const output = squash(transpiler.transpileGo(input).content);
        expect(output).toContain("var id string = *this.SafeString(o, \"id\", \"dflt\")");
        expect(output).not.toContain("var id *string");
    });
    test('an annotated string local with a string-typed identifier default takes the deref', () => {
        const input =
        "class Exchange {\n" +
        "    safeString(a, b, c) { return a; }\n" +
        "    main(o) {\n" +
        "        const d: string = 'SN_MAIN';\n" +
        "        const id: string = this.safeString (o, 'id', d);\n" +
        "        return id + d;\n" +
        "    }\n" +
        "}\n" +
        "";
        const output = squash(transpiler.transpileGo(input).content);
        expect(output).toContain("var id string = *this.SafeString(o, \"id\", d)");
        expect(output).not.toContain("var id *string");
    });
    test('an annotated string local without a default stays a pointer', () => {
        const input =
        "class Exchange {\n" +
        "    safeString(a, b, c) { return a; }\n" +
        "    main(o) {\n" +
        "        const id: string = this.safeString (o, 'id');\n" +
        "        return id;\n" +
        "    }\n" +
        "}\n" +
        "";
        const output = squash(transpiler.transpileGo(input).content);
        expect(output).toContain("var id *string = this.SafeString(o, \"id\")");
    });
    test('an unannotated local with a literal default stays a pointer', () => {
        const input =
        "class Exchange {\n" +
        "    safeString(a, b, c) { return a; }\n" +
        "    main(o) {\n" +
        "        const id = this.safeString (o, 'id', 'dflt');\n" +
        "        return id;\n" +
        "    }\n" +
        "}\n" +
        "";
        const output = squash(transpiler.transpileGo(input).content);
        expect(output).toContain("var id *string = this.SafeString(o, \"id\", \"dflt\")");
    });
    test('an annotated local later written a nil-able value stays a pointer', () => {
        const input =
        "class Exchange {\n" +
        "    safeString(a, b, c) { return a; }\n" +
        "    main(o) {\n" +
        "        let id: string = this.safeString (o, 'id', 'dflt');\n" +
        "        id = this.safeString (o, 'other');\n" +
        "        return id;\n" +
        "    }\n" +
        "}\n" +
        "";
        const output = squash(transpiler.transpileGo(input).content);
        expect(output).toContain("var id *string = this.SafeString(o, \"id\", \"dflt\")");
    });
    test("an annotated string local compared to undefined keeps the pointer", () => {
        const input =
        "class Exchange {\n" +
        "    safeString(a, b, c) { return a; }\n" +
        "    main(o, s: string | undefined) {\n" +
        "        const id: string = this.safeString (o, 'id', 'dflt');\n" +
        "        if (id !== undefined) { return 1; }\n" +
        "        return 0;\n" +
        "    }\n" +
        "}\n" +
        "";
        const output = squash(transpiler.transpileGo(input).content);
        expect(output).toContain("var id *string = this.SafeString(o, \"id\", \"dflt\")");
    });
    test("an annotated string local copied into a Str local keeps the pointer", () => {
        const input =
        "class Exchange {\n" +
        "    safeString(a, b, c) { return a; }\n" +
        "    main(o, s: string | undefined) {\n" +
        "        let r: string | undefined = s;\n" +
        "        const id: string = this.safeString (o, 'id', 'dflt');\n" +
        "        r = id;\n" +
        "        return r;\n" +
        "    }\n" +
        "}\n" +
        "";
        const output = squash(transpiler.transpileGo(input).content);
        expect(output).toContain("var id *string = this.SafeString(o, \"id\", \"dflt\")");
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
        expect(output).toContain("var amount *string = this.SafeString(item, \"income\")");
        expect(output).toContain("amount = SafeStringPtr(ToUpper(other))");
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
    test('a SafeList local read as a list is declared []any and read with SafeListTyped', () => {
        const input =
        "class Exchange {\n" +
        "    safeList(a, b, c?) { return a; }\n" +
        "    safeValue(a, b) { return a; }\n" +
        "    main(item) {\n" +
        "        const data = this.safeList (item, 'data', []);\n" +
        "        const out = [];\n" +
        "        for (let i = 0; i < data.length; i++) {\n" +
        "            out.push (this.safeValue (data[i], 'id'));\n" +
        "        }\n" +
        "        const first = this.safeValue (data[0], 'id');\n" +
        "        return [out, first];\n" +
        "    }\n" +
        "}\n";
        const output = squash(transpiler.transpileGo(input).content);
        expect(output).toContain("var data []any = SafeListTyped(item, \"data\")");
        expect(output).toContain("i < len(data)");
        // the loop bounds the read the plain index of a SafeList element
        expect(output).toContain("this.SafeValue(data[i], \"id\")");
        expect(output).not.toContain("DerefScalar(data[i])");
        expect(output).toContain("DerefScalar(data[0])");
        expect(output).not.toContain("GetArrayLength(data)");
    });
    test('a SafeList local with an empty-array default drops it: SafeListTyped carries no default', () => {
        const input =
        "class Exchange {\n" +
        "    safeList(a, b, c?) { return a; }\n" +
        "    main(item) {\n" +
        "        const data = this.safeList (item, 'data', []);\n" +
        "        const n = data.length;\n" +
        "        return n;\n" +
        "    }\n" +
        "}\n";
        const output = squash(transpiler.transpileGo(input).content);
        expect(output).toContain("var data []any = SafeListTyped(item, \"data\")");
        expect(output).not.toContain("[]any{}");
    });
    test('a SafeList local whose value escapes, is compared with nil or carries a default keeps the box', () => {
        const compared =
        "class Exchange {\n" +
        "    safeList(a, b, c?) { return a; }\n" +
        "    main(item) {\n" +
        "        const data = this.safeList (item, 'data', []);\n" +
        "        if (data === undefined) { return []; }\n" +
        "        return data.length;\n" +
        "    }\n" +
        "}\n";
        expect(squash(transpiler.transpileGo(compared).content)).toContain("var data any = this.SafeList(");
        const escaped =
        "class Exchange {\n" +
        "    safeList(a, b, c?) { return a; }\n" +
        "    main(item) {\n" +
        "        const data = this.safeList (item, 'data', []);\n" +
        "        return data;\n" +
        "    }\n" +
        "}\n";
        expect(squash(transpiler.transpileGo(escaped).content)).toContain("var data any = this.SafeList(");
        const defaulted =
        "class Exchange {\n" +
        "    safeList(a, b, c?) { return a; }\n" +
        "    main(item) {\n" +
        "        const data = this.safeList (item, 'data', ['x']);\n" +
        "        return data.length;\n" +
        "    }\n" +
        "}\n";
        expect(squash(transpiler.transpileGo(defaulted).content)).toContain("var data any = this.SafeList(");
    });
    test('a typed SafeList local appends natively on a push', () => {
        const input =
        "class Exchange {\n" +
        "    safeList(a, b, c?) { return a; }\n" +
        "    main(item) {\n" +
        "        const data = this.safeList (item, 'data', []);\n" +
        "        data.push ('x');\n" +
        "        return data.length;\n" +
        "    }\n" +
        "}\n";
        const output = squash(transpiler.transpileGo(input).content);
        expect(output).toContain("var data []any = SafeListTyped(item, \"data\")");
        expect(output).toContain("data = append(data, \"x\")");
        expect(output).not.toContain("AppendToArray(");
    });
    test('a SafeDict local read as a map is declared map[string]any and read with SafeMapTyped', () => {
        const input =
        "class Exchange {\n" +
        "    safeDict(a, b, c?) { return a; }\n" +
        "    safeString(a, b) { return a; }\n" +
        "    main(item) {\n" +
        "        const info = this.safeDict (item, 'info');\n" +
        "        const name = this.safeString (info, 'name');\n" +
        "        return name;\n" +
        "    }\n" +
        "}\n";
        const output = squash(transpiler.transpileGo(input).content);
        expect(output).toContain("var info map[string]any = SafeMapTyped(item, \"info\")");
        expect(output).toContain("this.SafeString(info, \"name\")");
    });
    test('a SafeDict local with an empty-map default drops it: SafeMapTyped carries no default', () => {
        const input =
        "class Exchange {\n" +
        "    safeDict(a, b, c?) { return a; }\n" +
        "    main(item) {\n" +
        "        const info = this.safeDict (item, 'info', {});\n" +
        "        const name = GetValue(info, 'name');\n" +
        "        return name;\n" +
        "    }\n" +
        "}\n";
        const output = squash(transpiler.transpileGo(input).content);
        expect(output).toContain("var info map[string]any = SafeMapTyped(item, \"info\")");
        expect(output).not.toContain("map[string]any{}");
    });
    test('a SafeDict local read through GetValue/ObjectKeys/InOp/an index stays typed', () => {
        const input =
        "class Exchange {\n" +
        "    safeDict(a, b, c?) { return a; }\n" +
        "    main(item) {\n" +
        "        const info = this.safeDict (item, 'info');\n" +
        "        const keys = ObjectKeys(info);\n" +
        "        const has = InOp(info, 'id');\n" +
        "        const id = info['id'];\n" +
        "        const extra = GetValue(info, 'extra');\n" +
        "        return [keys, has, id, extra];\n" +
        "    }\n" +
        "}\n";
        const output = squash(transpiler.transpileGo(input).content);
        expect(output).toContain("var info map[string]any = SafeMapTyped(item, \"info\")");
    });
    test('a market local (checker: MarketInterface) is declared map[string]any and reads natively', () => {
        const input =
        "type MarketInterface = { id: string; type: string };\n" +
        "class Exchange {\n" +
        "    market(symbol): MarketInterface { return undefined; }\n" +
        "    main(symbol) {\n" +
        "        const market = this.market (symbol);\n" +
        "        const id = market['id'];\n" +
        "        const type = this.safeString (market, 'type');\n" +
        "        return [id, type];\n" +
        "    }\n" +
        "}\n";
        const output = squash(transpiler.transpileGo(input).content);
        expect(output).toContain("var market map[string]any = this.Market(symbol)");
        expect(output).toContain("market[\"id\"]");
        expect(output).not.toContain("GetValue(market, \"id\")");
    });
    test('a market local written into keeps the box', () => {
        const input =
        "type MarketInterface = { id: string };\n" +
        "class Exchange {\n" +
        "    market(symbol): MarketInterface { return undefined; }\n" +
        "    main(symbol) {\n" +
        "        const market = this.market (symbol);\n" +
        "        market['created'] = 1;\n" +
        "        return market['id'];\n" +
        "    }\n" +
        "}\n";
        const output = squash(transpiler.transpileGo(input).content);
        expect(output).toContain("var market any = this.Market(symbol)");
        expect(output).not.toContain("MapTyped(");
    });
    test('a SafeMarket local handed to a call keeps the box (it may answer an absent value)', () => {
        const input =
        "type MarketInterface = { id: string };\n" +
        "class Exchange {\n" +
        "    safeMarket(symbol): MarketInterface { return undefined; }\n" +
        "    parseFee(fee, market) { return market; }\n" +
        "    main(symbol, fee) {\n" +
        "        const market = this.safeMarket (symbol);\n" +
        "        return this.parseFee (fee, market);\n" +
        "    }\n" +
        "}\n";
        const output = squash(transpiler.transpileGo(input).content);
        expect(output).toContain("var market any = this.SafeMarket(symbol)");
        expect(output).not.toContain("MapTyped(");
    });
    test('a market local compared to a boolean is declared map[string]any; the compared element keeps GetValue', () => {
        const input =
        "type Bool = boolean | undefined;\n" +
        "type MarketInterface = { id: string; swap: Bool };\n" +
        "class Exchange {\n" +
        "    market(symbol): MarketInterface { return undefined; }\n" +
        "    main(symbol) {\n" +
        "        const market = this.market (symbol);\n" +
        "        if (market['swap'] === true) { return market['id']; }\n" +
        "        if (market['swap'] !== true) { return market['id']; }\n" +
        "        return market['id'];\n" +
        "    }\n" +
        "}\n";
        const output = squash(transpiler.transpileGo(input).content);
        expect(output).toContain("var market map[string]any = this.Market(symbol)");
        // the compared element derefs through the helper, exactly what the boxed local answered
        expect(output).toContain("GetValue(market, \"swap\") == true");
        expect(output).toContain("GetValue(market, \"swap\") != true");
        expect(output).toContain("return market[\"id\"]");
    });
    test('a market local written through an element keeps the box', () => {
        const input =
        "type Bool = boolean | undefined;\n" +
        "type MarketInterface = { id: string; swap: Bool };\n" +
        "class Exchange {\n" +
        "    market(symbol): MarketInterface { return undefined; }\n" +
        "    main(symbol) {\n" +
        "        const market = this.market (symbol);\n" +
        "        if (market['swap'] === true) { market['created'] = 1; }\n" +
        "        return market['id'];\n" +
        "    }\n" +
        "}\n";
        const output = squash(transpiler.transpileGo(input).content);
        expect(output).toContain("var market any = this.Market(symbol)");
        expect(output).not.toContain("MapTyped(");
    });
    test('a Currency local (checker: CurrencyInterface) is declared map[string]any and reads natively', () => {
        const input =
        "type CurrencyInterface = { id: string; code: string };\n" +
        "class Exchange {\n" +
        "    currency(code): CurrencyInterface { return undefined; }\n" +
        "    safeCurrency(code): CurrencyInterface { return undefined; }\n" +
        "    main(code) {\n" +
        "        const currency = this.currency (code);\n" +
        "        const id = currency['id'];\n" +
        "        const safe = this.safeCurrency (code);\n" +
        "        return [id, safe['code']];\n" +
        "    }\n" +
        "}\n";
        const output = squash(transpiler.transpileGo(input).content);
        expect(output).toContain("var currency map[string]any = MapTyped(this.Currency(code))");
        expect(output).toContain("var safe map[string]any = MapTyped(this.SafeCurrency(code))");
        expect(output).toContain("currency[\"id\"]");
        expect(output).toContain("safe[\"code\"]");
        expect(output).not.toContain("GetValue(currency, \"id\")");
    });
    test('a SafeCurrency local compared to a boolean keeps the deref helper for the compared element', () => {
        const input =
        "type Bool = boolean | undefined;\n" +
        "type CurrencyInterface = { id: string; margin: Bool };\n" +
        "class Exchange {\n" +
        "    safeCurrency(code): CurrencyInterface { return undefined; }\n" +
        "    main(code) {\n" +
        "        const currency = this.safeCurrency (code);\n" +
        "        if (currency['margin'] === true) { return currency['id']; }\n" +
        "        return currency['id'];\n" +
        "    }\n" +
        "}\n";
        const output = squash(transpiler.transpileGo(input).content);
        expect(output).toContain("var currency map[string]any = MapTyped(this.SafeCurrency(code))");
        expect(output).toContain("GetValue(currency, \"margin\") == true");
    });
    test('a MarketInterface-returning accessor beyond Market/SafeMarket qualifies (getMarketFromSymbols)', () => {
        const input =
        "type Strings = string[];\n" +
        "type MarketInterface = { id: string };\n" +
        "class Exchange {\n" +
        "    getMarketFromSymbols(symbols): MarketInterface { return undefined; }\n" +
        "    main(symbols) {\n" +
        "        const first = this.getMarketFromSymbols (symbols);\n" +
        "        return first['id'];\n" +
        "    }\n" +
        "}\n";
        const output = squash(transpiler.transpileGo(input).content);
        expect(output).toContain("var first map[string]any = this.GetMarketFromSymbols(symbols)");
        expect(output).toContain("first[\"id\"]");
    });
    test('a producer whose every path answers a dictionary prints map[string]any and its local holds it', () => {
        const input =
        "type MarketInterface = { id: string };\n" +
        "type Market = MarketInterface | undefined;\n" +
        "class Exchange {\n" +
        "    safeMarketStructure(m): Market { return undefined; }\n" +
        "    parseMarket(market): Market {\n" +
        "        if (market['unknown'] === true) { return undefined; }\n" +
        "        return this.safeMarketStructure (market);\n" +
        "    }\n" +
        "    parseMarkets(markets) {\n" +
        "        const parsed = this.parseMarket (markets[0]);\n" +
        "        const id = parsed['id'];\n" +
        "        return id;\n" +
        "    }\n" +
        "}\n";
        const output = squash(transpiler.transpileGo(input).content);
        expect(output).toContain("func (this *Exchange) ParseMarket(market any) map[string]any {");
        expect(output).toContain("var parsed map[string]any = this.ParseMarket(GetValue(markets, 0))");
        expect(output).toContain("parsed[\"id\"]");
    });
    test('a producer returning a literal cast to the interface prints the map signature', () => {
        const input =
        "type MarketInterface = { id: string };\n" +
        "type Market = MarketInterface | undefined;\n" +
        "class Exchange {\n" +
        "    parseMarket(market): Market {\n" +
        "        if (market['id'] === undefined) { return undefined; }\n" +
        "        return { 'id': market['id'] } as Market;\n" +
        "    }\n" +
        "}\n";
        const output = squash(transpiler.transpileGo(input).content);
        expect(output).toContain("func (this *Exchange) ParseMarket(market any) map[string]any {");
    });
    test('a producer whose return shape is unproven keeps the any signature and the boxed local', () => {
        const input =
        "type MarketInterface = { id: string };\n" +
        "type Market = MarketInterface | undefined;\n" +
        "class Exchange {\n" +
        "    parseMarket(market): Market { return market['raw']; }\n" +
        "    parseMarkets(markets) {\n" +
        "        const parsed = this.parseMarket (markets[0]);\n" +
        "        return parsed['id'];\n" +
        "    }\n" +
        "}\n";
        const output = squash(transpiler.transpileGo(input).content);
        expect(output).toContain("func (this *Exchange) ParseMarket(market any) any {");
        expect(output).toContain("var parsed map[string]any = MapTyped(this.ParseMarket(GetValue(markets, 0)))");
    });
    test('a producer local appended into a list is typed: the producer prints the map, so the box already held the (typed nil) map', () => {
        const input =
        "type MarketInterface = { id: string };\n" +
        "type Market = MarketInterface | undefined;\n" +
        "class Exchange {\n" +
        "    parseMarket(market): Market { return undefined; }\n" +
        "    parseMarkets(markets) {\n" +
        "        const result = [];\n" +
        "        const parsed = this.parseMarket (markets[0]);\n" +
        "        if (parsed !== undefined) { result.push (parsed); }\n" +
        "        return result;\n" +
        "    }\n" +
        "}\n";
        const output = squash(transpiler.transpileGo(input).content);
        expect(output).toContain("var parsed map[string]any = this.ParseMarket(GetValue(markets, 0))");
        expect(output).toContain("append(result, parsed)");
    });
    test('a producer local nil-tested then read natively is typed and the read is native', () => {
        const input =
        "type MarketInterface = { id: string };\n" +
        "type Market = MarketInterface | undefined;\n" +
        "class Exchange {\n" +
        "    safeMarket(id): MarketInterface { return undefined; }\n" +
        "    getMarketFromClientAndMessage(client, message): Market {\n" +
        "        const market = this.safeMarket (message['s']);\n" +
        "        return market;\n" +
        "    }\n" +
        "    handleTicker(client, message) {\n" +
        "        const market = this.getMarketFromClientAndMessage (client, message);\n" +
        "        if (market === undefined) { return; }\n" +
        "        const symbol = market['symbol'];\n" +
        "        return symbol;\n" +
        "    }\n" +
        "}\n";
        const output = squash(transpiler.transpileGo(input).content);
        expect(output).toContain("func (this *Exchange) GetMarketFromClientAndMessage(client any, message any) map[string]any {");
        expect(output).toContain("var market map[string]any = this.GetMarketFromClientAndMessage(client, message)");
        expect(output).toContain("market[\"symbol\"]");
    });
    test('a Currency local whose element is written keeps the box', () => {
        const input =
        "type CurrencyInterface = { id: string };\n" +
        "class Exchange {\n" +
        "    currency(code): CurrencyInterface { return undefined; }\n" +
        "    main(code) {\n" +
        "        const currency = this.currency (code);\n" +
        "        currency['created'] = 1;\n" +
        "        return currency['id'];\n" +
        "    }\n" +
        "}\n";
        const output = squash(transpiler.transpileGo(input).content);
        expect(output).toContain("var currency any = this.Currency(code)");
        expect(output).not.toContain("MapTyped(");
    });
    test('a SafeDict local read through the `in` operator stays typed', () => {
        const input =
        "class Exchange {\n" +
        "    safeDict(a, b, c?) { return a; }\n" +
        "    main(item, code) {\n" +
        "        const info = this.safeDict (item, 'info');\n" +
        "        return (code in info);\n" +
        "    }\n" +
        "}\n";
        const output = squash(transpiler.transpileGo(input).content);
        expect(output).toContain("var info map[string]any = SafeMapTyped(item, \"info\")");
        expect(output).toContain("InOp(info, code)");
    });
    test('a SafeDict local handed to another Safe* accessor as its receiver stays typed', () => {
        const input =
        "class Exchange {\n" +
        "    safeDict(a, b, c?) { return a; }\n" +
        "    safeBool(a, b) { return a; }\n" +
        "    main(item, parsed) {\n" +
        "        const marginEntry = this.safeDict (item, 'margin');\n" +
        "        parsed['margin'] = this.safeBool (marginEntry, 'isBorrowable');\n" +
        "        return parsed;\n" +
        "    }\n" +
        "}\n";
        const output = squash(transpiler.transpileGo(input).content);
        expect(output).toContain("var marginEntry map[string]any = SafeMapTyped(item, \"margin\")");
    });
    test('a SafeDict local compared with nil is typed and tested natively', () => {
        const input =
        "class Exchange {\n" +
        "    safeDict(a, b, c?) { return a; }\n" +
        "    main(item) {\n" +
        "        const info = this.safeDict (item, 'info');\n" +
        "        if (info === undefined) { return 1; }\n" +
        "        return info['id'];\n" +
        "    }\n" +
        "}\n";
        const output = squash(transpiler.transpileGo(input).content);
        // a nil map and the absent box are both nil: `info == nil` is the helper's predicate
        expect(output).toContain("var info map[string]any = SafeMapTyped(item, \"info\")");
        expect(output).toContain("if info == nil {");
        expect(output).toContain("info[\"id\"]");
    });
    test('a SafeDict local compared with nil and backing an `in` keeps the box', () => {
        const input =
        "class Exchange {\n" +
        "    safeDict(a, b, c?) { return a; }\n" +
        "    main(item) {\n" +
        "        const data = this.safeDict (item, 'data');\n" +
        "        if (data === undefined) { return 1; }\n" +
        "        if ('oi' in data) { return 2; }\n" +
        "        return data['id'];\n" +
        "    }\n" +
        "}\n";
        const output = squash(transpiler.transpileGo(input).content);
        // a typed map answers `in` with a pasted comma-ok closure: the box keeps the helper
        expect(output).toContain("var data any = this.SafeDict(item, \"data\")");
        expect(output).not.toContain("_, ok := data[");
    });
    test('a SafeDict local whose truthiness is read stays any', () => {
        const input =
        "class Exchange {\n" +
        "    safeDict(a, b, c?) { return a; }\n" +
        "    main(item) {\n" +
        "        const info = this.safeDict (item, 'info');\n" +
        "        if (info) { return GetValue(info, 'id'); }\n" +
        "        return 1;\n" +
        "    }\n" +
        "}\n";
        const output = squash(transpiler.transpileGo(input).content);
        expect(output).toContain("var info any = this.SafeDict(item, \"info\")");
    });
    test('a SafeDict local returned or boxed into a value position stays any', () => {
        const input =
        "class Exchange {\n" +
        "    safeDict(a, b, c?) { return a; }\n" +
        "    main(item, params) {\n" +
        "        const info = this.safeDict (item, 'info');\n" +
        "        params['info'] = info;\n" +
        "        return info;\n" +
        "    }\n" +
        "}\n";
        const output = squash(transpiler.transpileGo(input).content);
        expect(output).toContain("var info any = this.SafeDict(item, \"info\")");
    });
    test('a SafeDict local written through stays any', () => {
        const input =
        "class Exchange {\n" +
        "    safeDict(a, b, c?) { return a; }\n" +
        "    main(item) {\n" +
        "        const info = this.safeDict (item, 'info');\n" +
        "        info['id'] = 1;\n" +
        "        return GetValue(info, 'id');\n" +
        "    }\n" +
        "}\n";
        const output = squash(transpiler.transpileGo(input).content);
        expect(output).toContain("var info any = this.SafeDict(item, \"info\")");
    });
    test('a SafeDict default that carries data keeps the local any', () => {
        const input =
        "class Exchange {\n" +
        "    safeDict(a, b, c?) { return a; }\n" +
        "    main(item) {\n" +
        "        const info = this.safeDict (item, 'info', { 'id': 1 });\n" +
        "        return GetValue(info, 'id');\n" +
        "    }\n" +
        "}\n";
        const output = squash(transpiler.transpileGo(input).content);
        expect(output).toContain("var info any = this.SafeDict(item, \"info\", map[string]any{");
    });
    test('the dict variants outside the safeDict(key) shape stay any', () => {
        const input =
        "class Exchange {\n" +
        "    safeDict2(a, b, c, d?) { return a; }\n" +
        "    safeDictN(a, b, c?) { return a; }\n" +
        "    main(item) {\n" +
        "        const nested = this.safeDict2 (item, 'a', 'b');\n" +
        "        const deep = this.safeDictN (item, ['a', 'b']);\n" +
        "        return GetValue(nested, 'x') + GetValue(deep, 'y');\n" +
        "    }\n" +
        "}\n";
        const output = squash(transpiler.transpileGo(input).content);
        expect(output).toContain("var nested any = this.SafeDict2(item, \"a\", \"b\")");
        expect(output).toContain("var deep any = this.SafeDictN(");
    });
    test('a SafeDict local handed out as a key or a trailing argument stays any', () => {
        const input =
        "class Exchange {\n" +
        "    safeDict(a, b, c?) { return a; }\n" +
        "    main(item, other) {\n" +
        "        const info = this.safeDict (item, 'info');\n" +
        "        const x = GetValue(other, info);\n" +
        "        AddElementToObject(other, 'k', info);\n" +
        "        return x;\n" +
        "    }\n" +
        "}\n";
        const output = squash(transpiler.transpileGo(input).content);
        expect(output).toContain("var info any = this.SafeDict(item, \"info\")");
    });
    test('a SafeDict local keeps the helper for truthiness/nil tests', () => {
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
        expect(output).toContain("promises = append(promises, this.FetchTicker(GetValue(symbols, i)))");
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
    test('a discarded awaited call is received inside PanicOnError, with no local', () => {
        const input =
        "class Exchange {\n" +
        "    async loadMarkets (reload = false): Promise<any> {\n" +
        "        return {};\n" +
        "    }\n" +
        "    async doLoad (params = {}): Promise<any> {\n" +
        "        await this.loadMarkets ();\n" +
        "        return params;\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileGo(input).content;
        const [, , , doLoadBody] = methodBodies(output);
        expect(doLoadBody).toContain("PanicOnError((<-this.LoadMarkets()))");
        expect(doLoadBody).not.toContain("retRes");
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
    test('asyncSuffixExemptPaths keeps plain call-site names for exempt declaring files', () => {
        const input =
        "class Api {\n" +
        "    async publicGetTime(params = {}): Promise<any> {\n" +
        "        return params;\n" +
        "    }\n" +
        "}\n" +
        "class Ex extends Api {\n" +
        "    async fetchTime(params = {}): Promise<any> {\n" +
        "        return await this.publicGetTime(params);\n" +
        "    }\n" +
        "}";
        const exempt = new Transpiler({ 'verbose': false, 'go': { 'asyncMethodSuffix': 'Async', 'asyncSuffixExemptPaths': ['.*'], 'parser': { 'NUM_LINES_END_FILE': 0 } } });
        const plain = new Transpiler({ 'verbose': false, 'go': { 'asyncMethodSuffix': 'Async', 'asyncSuffixExemptPaths': ['/no/such/dir/'], 'parser': { 'NUM_LINES_END_FILE': 0 } } });
        expect(exempt.transpileGo(input).content).toContain("this.PublicGetTime(params)");
        expect(plain.transpileGo(input).content).toContain("this.PublicGetTimeAsync(params)");
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
        "    for (let i = 0; i < symbols.length; i++) {\n" + // a loop bounded by keys.length reads keys[i] natively
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
    test('a bool-typed box drops the truthiness helper for a plain comparison', () => {
        const input =
        "type Bool = boolean | undefined;\n" +
        "class T {\n" +
        "    safeBool (a, b) { return a; }\n" +
        "    f (params: any) {\n" +
        "        let paginate: Bool = undefined;\n" +
        "        paginate = params['paginate'];\n" +
        "        const both = paginate && this.safeBool (params, 'k');\n" +
        "        if (paginate) { return 1; }\n" +
        "        return both;\n" +
        "    }\n" +
        "}\n"
        const output = transpiler.transpileGo(input).content;
        // the local stays an `any` box (a write the printer cannot type), but the
        // checker proves it holds a bool or nil: nil and `false` are both falsy
        expect(output).toContain("var paginate any = nil");
        expect(output).toContain("if paginate == true {");
        expect(output).toContain("(paginate == true) && (this.SafeBool(params, \"k\") != nil && *this.SafeBool(params, \"k\"))");
        expect(output).not.toContain("EvalTruthy(paginate)");
    });
    test('a box a SafeBool write can reach keeps the truthiness helper', () => {
        const input =
        "type Bool = boolean | undefined;\n" +
        "class T {\n" +
        "    safeBool (a, b, c?) { return a; }\n" +
        "    f (params: any) {\n" +
        "        let flag: Bool = undefined;\n" +
        "        flag = params['flag'];\n" +
        "        flag = this.safeBool (params, 'flag');\n" +
        "        if (flag) { return 1; }\n" +
        "        return 0;\n" +
        "    }\n" +
        "}\n"
        const output = transpiler.transpileGo(input).content;
        // the `*bool` write puts a pointer in the box, which the helper dereferences
        // and `x == true` never matches
        expect(output).toContain("if EvalTruthy(flag) {");
    });
    test('a bool parameter without a default keeps the box and the helper', () => {
        const input =
        "class T {\n" +
        "    f (enable: boolean) {\n" +
        "        if (enable) { return 1; }\n" +
        "        return 0;\n" +
        "    }\n" +
        "}\n"
        const output = transpiler.transpileGo(input).content;
        expect(output).toContain("func (this *T) F(enable any)");
        expect(output).toContain("if EvalTruthy(enable) {");
    });
    test('a defaulted bool parameter rides the GetArg binding', () => {
        const input =
        "class T {\n" +
        "    f (params: any, force: boolean = false) {\n" +
        "        if (force) { return 1; }\n" +
        "        return 0;\n" +
        "    }\n" +
        "}\n"
        const output = transpiler.transpileGo(input).content;
        // GetArg derefs a pointer argument, so the box holds a plain bool or the default
        expect(output).toContain("var force bool = GetArgBool(optionalArgs, 0, false)");
        expect(output).toContain("if force == true {");
        expect(output).not.toContain("EvalTruthy(force)");
    });
    test('a bool parameter every caller passes as a bool prints a Go bool', () => {
        const input =
        "class Base {\n" +
        "    f (x: any): any { return x; }\n" +
        "}\n" +
        "class Ex extends Base {\n" +
        "    run (enable: boolean): any {\n" +
        "        if (enable) { return 1; }\n" +
        "        return 0;\n" +
        "    }\n" +
        "    call (): any {\n" +
        "        return this.run (true);\n" +
        "    }\n" +
        "}\n"
        const output = transpiler.transpileGo(input).content;
        expect(output).toContain("func (this *Ex) Run(enable bool) any");
        expect(output).toContain("if enable {");
        expect(output).not.toContain("EvalTruthy(enable)");
    });
    test('one caller passing an unproven box keeps the bool parameter boxed', () => {
        const input =
        "class Base {\n" +
        "    f (x: any): any { return x; }\n" +
        "}\n" +
        "class Ex extends Base {\n" +
        "    run (enable: boolean): any {\n" +
        "        if (enable) { return 1; }\n" +
        "        return 0;\n" +
        "    }\n" +
        "    call (box: any): any {\n" +
        "        return this.run (box);\n" +
        "    }\n" +
        "}\n"
        const output = transpiler.transpileGo(input).content;
        expect(output).toContain("func (this *Ex) Run(enable any) any");
        expect(output).toContain("if EvalTruthy(enable) {");
    });
    test('a nullable bool parameter the body nil-tests keeps the box', () => {
        const input =
        "type Bool = boolean | undefined;\n" +
        "class Base {\n" +
        "    f (x: any): any { return x; }\n" +
        "}\n" +
        "class Ex extends Base {\n" +
        "    run (enable: Bool): any {\n" +
        "        if (enable === undefined) { return 0; }\n" +
        "        if (enable) { return 1; }\n" +
        "        return 0;\n" +
        "    }\n" +
        "    call (): any {\n" +
        "        return this.run (true);\n" +
        "    }\n" +
        "}\n"
        const output = transpiler.transpileGo(input).content;
        expect(output).toContain("func (this *Ex) Run(enable any) any");
        expect(output).toContain("if enable == nil {");
    });
    test('a number parameter whose only caller passes a literal keeps the box', () => {
        const input =
        "class Base {\n" +
        "    f (x: any): any { return x; }\n" +
        "}\n" +
        "class Ex extends Base {\n" +
        "    run (n: number): any {\n" +
        "        return n + 1;\n" +
        "    }\n" +
        "    call (): any {\n" +
        "        return this.run (3);\n" +
        "    }\n" +
        "}\n"
        const output = transpiler.transpileGo(input).content;
        expect(output).toContain("func (this *Ex) Run(n any) any");
        expect(output).toContain("Add(n, 1)");
    });
    test('the params slot of sign keeps the GetArg box', () => {
        const input =
        "class T {\n" +
        "    sign (path, api = 'public', method = 'GET', params = {}, headers = undefined, body = undefined) {\n" +
        "        const query = this.omit (params, 'x');\n" +
        "        return { 'url': path, 'method': method, 'body': body, 'headers': headers, 'q': query };\n" +
        "    }\n" +
        "    omit (a, b) { return a; }\n" +
        "}\n"
        const output = transpiler.transpileGo(input).content;
        // okx posts a list of orders through this slot
        expect(output).toContain("params := GetArg(optionalArgs, 2, map[string]any{})");
        expect(output).toContain("api := GetArg(optionalArgs, 0, \"public\")");
    });
    test('an any-annotated string-defaulted parameter keeps the GetArg box', () => {
        const input =
        "class T {\n" +
        "    fetch2 (path: any, api: any = 'public', method = 'GET') {\n" +
        "        return [ path, api, method ];\n" +
        "    }\n" +
        "}\n"
        const output = transpiler.transpileGo(input).content;
        // venues pass api as a list (['v1', 'private'])
        expect(output).toContain("api := GetArg(optionalArgs, 0, \"public\")");
        expect(output).toContain("var method string = GetArgString(optionalArgs, 1, \"GET\")");
    });
    test('a nil-defaulted dictionary that is only read binds through GetArgMap', () => {
        const inst = new Transpiler({ 'verbose': false });
        (inst as any).goTranspiler.CCXT_GO_GETARG_DECLARED_TYPES = { 'Market': 'map[string]any' };
        const input =
        "type Market = { [key: string]: any };\n" +
        "class T {\n" +
        "    safeString (a, b) { return a; }\n" +
        "    f (d: any, market: Market = undefined) {\n" +
        "        let id = undefined;\n" +
        "        if (market !== undefined) { id = market['id']; }\n" +
        "        return [ id, this.safeString (market, 'symbol'), ('x' in market) ];\n" +
        "    }\n" +
        "}\n"
        const output = inst.transpileGo(input).content;
        // GetValue/InOp/Safe* read a nil map as the absent value the nil box was
        expect(output).toContain("var market map[string]any = GetArgMap(optionalArgs, 0, nil)");
    });
    test('a nil-defaulted dictionary handed on or type-tested keeps the GetArg box', () => {
        const inst = new Transpiler({ 'verbose': false });
        (inst as any).goTranspiler.CCXT_GO_GETARG_DECLARED_TYPES = { 'Market': 'map[string]any' };
        const input =
        "type Market = { [key: string]: any };\n" +
        "class T {\n" +
        "    safeString (a, b) { return a; }\n" +
        "    isDictionary (a) { return true; }\n" +
        "    g (a, m = undefined) { return a; }\n" +
        "    f1 (d: any, market: Market = undefined) { return market; }\n" +
        "    f2 (d: any, market: Market = undefined) { return this.isDictionary (market); }\n" +
        "    f3 (d: any, market: Market = undefined) { return this.g (d, market); }\n" +
        "    f4 (d: any, market: Market = undefined) { return this.safeString (d, market); }\n" +
        "}\n"
        const output = inst.transpileGo(input).content;
        // a nil map is not nil once boxed into `any`, and IsDictionary/IsEqual see the difference
        expect((output.match(/market := GetArg\(optionalArgs, 0, nil\)/g) ?? []).length).toBe(3);
        // a defaulted callee position binds through GetArg, which folds a nil map to its default
        expect((output.match(/var market map\[string\]any = GetArgMap\(optionalArgs, 0, nil\)/g) ?? []).length).toBe(1);
    });
    test('the write-site check and the binding agree on a read-only nil-defaulted dictionary', () => {
        const inst = new Transpiler({ 'verbose': false });
        const go: any = (inst as any).goTranspiler;
        go.CCXT_GO_GETARG_DECLARED_TYPES = { 'Market': 'map[string]any' };
        const answers: (string | undefined)[] = [];
        const shipped = go.goGetArgLocalType.bind(go);
        const shippedBinary = go.printBinaryExpression.bind(go);
        // a write-site rule asks the same question from the assignment, mid-body
        go.printBinaryExpression = function (node: any, identation: number) {
            const param: any = this.getChecker().getSymbolAtLocation(node.left)?.valueDeclaration?.resolve();
            if (param?.initializer !== undefined) {
                answers.push(shipped(this.goEnclosingFunction(param), param, 'nil'));
            }
            return shippedBinary(node, identation);
        };
        const input =
        "type Market = { [key: string]: any };\n" +
        "class T {\n" +
        "    safeString (a, b) { return a; }\n" +
        "    f (d: any, market: Market = undefined) {\n" +
        "        market = { 'id': d };\n" +
        "        return this.safeString (market, 'symbol');\n" +
        "    }\n" +
        "}\n"
        const output = inst.transpileGo(input).content;
        expect(output).toContain("var market map[string]any = GetArgMap(optionalArgs, 0, nil)");
        // the parameter's own name is not a use, so both askers get the binding's answer
        expect(answers).toEqual(['map[string]any']);
    });
    test('an any-annotated override of an unannotated base parameter binds like the base', () => {
        const input =
        "class B {\n" +
        "    calculateFee (a, takerOrMaker = 'taker', config = {}) { return 0; }\n" +
        "    fetch2 (path, api: any = 'public') { return 0; }\n" +
        "}\n" +
        "class T extends B {\n" +
        "    calculateFee (a, takerOrMaker: any = 'taker', config: any = {}) {\n" +
        "        if (takerOrMaker === 'maker') { return config['maker']; }\n" +
        "        return config['taker'];\n" +
        "    }\n" +
        "    fetch2 (path, api: any = 'public') { return [ path, api ]; }\n" +
        "}\n"
        const output = transpiler.transpileGo(input).content;
        // both the base and the override bind through the twins
        expect((output.match(/var takerOrMaker string = GetArgString\(optionalArgs, 0, "taker"\)/g) ?? []).length).toBe(2);
        expect((output.match(/var config map\[string\]any = GetArgMap\(optionalArgs, 1, map\[string\]any\{\}\)/g) ?? []).length).toBe(2);
        // the base annotates api as `any` itself (venues pass lists), so both keep the box
        expect((output.match(/api := GetArg\(optionalArgs, 0, "public"\)/g) ?? []).length).toBe(2);
    });
    test('a union-typed parameter keeps the GetArg box even with a literal default', () => {
        const input =
        "type IndexType = number | string;\n" +
        "class T {\n" +
        "    filter (array: any[], key: IndexType = 'timestamp', kind: string = 'x') {\n" +
        "        return [ array, key, kind ];\n" +
        "    }\n" +
        "}\n"
        const output = transpiler.transpileGo(input).content;
        // callers pass an index (0) where the default is a key name
        expect(output).toContain("key := GetArg(optionalArgs, 0, \"timestamp\")");
        expect(output).toContain("var kind string = GetArgString(optionalArgs, 1, \"x\")");
    });
    test('a nil-defaulted dictionary returned bare keeps the GetArg box', () => {
        const input =
        "class T {\n" +
        "    safeValue (a, b, c?) { return a; }\n" +
        "    f (d: any, key: any, defaultValue: Dict = undefined) {\n" +
        "        const value = this.safeValue (d, key, defaultValue);\n" +
        "        if (value === undefined) { return defaultValue; }\n" +
        "        return value;\n" +
        "    }\n" +
        "}\n"
        const output = transpiler.transpileGo(input).content;
        // a nil map returned through `any` is not nil to the caller, so the untyped box stays
        expect(output).toContain("defaultValue := GetArg(optionalArgs, 0, nil)");
        expect(output).not.toContain("GetArgMap(optionalArgs, 0, nil)");
    });
    test('a direct SafeBool call derefs instead of boxing', () => {
        const input =
        "class T {\n" +
        "    safeBool (a, b, c?) { return a; }\n" +
        "    f (params: any) {\n" +
        "        if (this.safeBool (params, 'flag')) { return 1; }\n" +
        "        if (!this.safeBool (this.options, 'flag', true)) { return 2; }\n" +
        "        return 0;\n" +
        "    }\n" +
        "}\n"
        const output = transpiler.transpileGo(input).content;
        expect(output).toContain("if this.SafeBool(params, \"flag\") != nil && *this.SafeBool(params, \"flag\") {");
        expect(output).toContain("if !(this.SafeBool(this.Options, \"flag\", true) != nil && *this.SafeBool(this.Options, \"flag\", true)) {");
        expect(output).not.toContain("EvalTruthy(this.SafeBool");
    });
    test('a SafeBool call the deref arm cannot repeat keeps the helper', () => {
        const input =
        "class T {\n" +
        "    safeBool (a, b, c?) { return a; }\n" +
        "    f (params: any) {\n" +
        "        if (this.safeBool (this.parseFlags (), 'flag')) { return 1; }\n" +
        "        return 0;\n" +
        "    }\n" +
        "}\n"
        const output = transpiler.transpileGo(input).content;
        // a non-repeatable argument (a call) keeps the single-evaluation helper
        expect(output).toContain("EvalTruthy(this.SafeBool(callDynamically(\"parseFlags\", ), \"flag\"))");
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
        // the *string result derefs under a nil guard (a bare `*x == "normal"` would
        // panic on a missing key); the accessor is re-read, its arguments are plain
        // identifiers/literals so both reads return the same pointer target
        expect(output).toContain("var a bool = (this.SafeString(raw, \"status\", \"\") != nil && *this.SafeString(raw, \"status\", \"\") == \"normal\")");
        expect(output).toContain("var b bool = IsEqual(this.SafeInteger(raw, \"success\", 0), 1)");
    });
    test('a direct Safe* call comparison with a call argument keeps IsEqual', () => {
        const input =
        "class T {\n" +
        "    safeString (a, b, c?) { return a; }\n" +
        "    parseStatus (a) { return a; }\n" +
        "    f (raw: any) {\n" +
        "        const a = this.safeString (this.parseStatus (raw), 'status') === 'normal';\n" +
        "        const b = this.safeString (raw, 'status') !== 'normal';\n" +
        "        return [ a, b ];\n" +
        "    }\n" +
        "}\n"
        const output = transpiler.transpileGo(input).content;
        // an argument that is itself a call must not be re-evaluated by the deref
        expect(output).toContain("var a bool = IsEqual(this.SafeString(this.ParseStatus(raw), \"status\"), \"normal\")");
        // the negated form is the mirrored nil guard
        expect(output).toContain("var b bool = (this.SafeString(raw, \"status\") == nil || *this.SafeString(raw, \"status\") != \"normal\")");
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
        expect(output).toContain("var picked int = func() int {\n\t\tif isWsProxyDefined {\n\t\t\treturn 1\n\t\t}\n\t\treturn 2\n\t}()");
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
        "        if (this.newUpdates) { return 4; }\n" +
        "        return 0;\n" +
        "    }\n" +
        "}\n"
        const output = transpiler.transpileGo(input).content;
        expect(output).toContain("if this.EnableRateLimit {");
        expect(output).toContain("if !this.Verbose {");
        // `NewUpdates bool` in the hand-written BaseExchange struct
        expect(output).toContain("if this.NewUpdates {");
        // a field the printer cannot name keeps the helper
        expect(output).toContain("if EvalTruthy(this.Options) {");
    });
    test('a bool read the checker proves drops IsEqual against a bool literal', () => {
        const input =
        "type Bool = boolean | undefined;\n" +
        "interface MarketInterface { spot: Bool; linear: Bool; }\n" +
        "function f (markets: any, symbol: string) {\n" +
        "    const market: MarketInterface = markets[symbol];\n" +
        "    const a = market['spot'] === true;\n" +
        "    const b = market['linear'] !== true;\n" +
        "    const c = market['spot'] === false;\n" +
        "    const d = market['id'] === 'BTC/USDT';\n" +
        "    return [ a, b, c, d ];\n" +
        "}\n"
        const output = transpiler.transpileGo(input).content;
        expect(output).toContain("var market any = GetValue(markets, symbol)");
        // Market.spot is a Bool: the box holds that bool or nil, and every other
        // dynamic type is unequal to a Go bool exactly as in TypeScript
        expect(output).toContain("var a bool = (GetValue(market, \"spot\") == true)");
        expect(output).toContain("var b bool = (GetValue(market, \"linear\") != true)");
        expect(output).toContain("var c bool = (GetValue(market, \"spot\") == false)");
        expect(output).not.toContain("IsEqual(GetValue(market, \"spot\")");
        expect(output).not.toContain("IsEqual(GetValue(market, \"linear\")");
        // this family is the bool literal only: a string literal keeps the helper
        expect(output).toContain("var d bool = IsEqual(GetValue(market, \"id\"), \"BTC/USDT\")");
    });
    test('the mirrored literal inlines to the same comparison', () => {
        const input =
        "type Bool = boolean | undefined;\n" +
        "interface MarketInterface { option: Bool; }\n" +
        "function f (markets: any, symbol: string) {\n" +
        "    const market: MarketInterface = markets[symbol];\n" +
        "    const a = true === market['option'];\n" +
        "    const b = false !== market['option'];\n" +
        "    return [ a, b ];\n" +
        "}\n"
        const output = transpiler.transpileGo(input).content;
        expect(output).toContain("var a bool = (true == GetValue(market, \"option\"))");
        expect(output).toContain("var b bool = (false != GetValue(market, \"option\"))");
        expect(output).not.toContain("IsEqual(GetValue(market");
    });
    test('an unproven element read keeps IsEqual', () => {
        const input =
        "function f (markets: any, symbol: string) {\n" +
        "    const market = markets[symbol];\n" +
        "    const a = market['spot'] === true;\n" +
        "    const b = market['linear'] !== true;\n" +
        "    return [ a, b ];\n" +
        "}\n"
        const output = transpiler.transpileGo(input).content;
        // `markets` is any: the read is any too, and the box may hold a *bool
        expect(output).toContain("var a bool = IsEqual(GetValue(market, \"spot\"), true)");
        expect(output).toContain("var b bool = !IsEqual(GetValue(market, \"linear\"), true)");
    });
    test('a declared map receiver keeps its native index and drops IsEqual', () => {
        const input =
        "type Bool = boolean | undefined;\n" +
        "interface MarketInterface { spot: Bool; }\n" +
        "function f () {\n" +
        "    const market: MarketInterface = { 'spot': true };\n" +
        "    const a = market['spot'] === true;\n" +
        "    return a;\n" +
        "}\n"
        const output = transpiler.transpileGo(input).content;
        expect(output).toContain("var market map[string]any = map[string]any{");
        expect(output).toContain("var a bool = (market[\"spot\"] == true)");
        expect(output).not.toContain("IsEqual(market[");
    });
    test('a *sync.Map BaseExchange field nil test inlines to == / != nil', () => {
        const input =
        "class T {\n" +
        "    f () {\n" +
        "        if (this.quoteCurrencies === undefined) { return 1; }\n" +
        "        if (this.quoteCurrencies !== undefined) { return 2; }\n" +
        "        const a = this.transactions === undefined;\n" +
        "        const b = this.baseCurrencies !== undefined;\n" +
        "        const c = this.baseCurrencies === undefined;\n" +
        "        return [ a, b, c ];\n" +
        "    }\n" +
        "}\n"
        const output = transpiler.transpileGo(input).content;
        // go/v4/exchange.go declares these BaseExchange fields as *sync.Map: the Go nil
        // test answers exactly what the IsEqual helper answers for a nil pointer
        expect(output).toContain("if this.QuoteCurrencies == nil {");
        expect(output).toContain("if this.QuoteCurrencies != nil {");
        expect(output).toContain("var a bool = (this.Transactions == nil)");
        expect(output).toContain("var b bool = (this.BaseCurrencies != nil)");
        expect(output).toContain("var c bool = (this.BaseCurrencies == nil)");
        expect(output).not.toContain("IsEqual(this.QuoteCurrencies");
    });
    test('fields whose Go nil test the helpers do not reproduce keep IsEqual', () => {
        // Orders is an `any` field, Hostname a plain string, Clients a map, Ids a slice,
        // LastRequest is not a hand-written base field: `== nil` would change meaning
        const input =
        "class T {\n" +
        "    f () {\n" +
        "        if (this.orders === undefined) { return 1; }\n" +
        "        if (this.hostname === undefined) { return 2; }\n" +
        "        if (this.clients === undefined) { return 3; }\n" +
        "        if (this.ids === undefined) { return 4; }\n" +
        "        if (this.lastRequest === undefined) { return 5; }\n" +
        "        return 0;\n" +
        "    }\n" +
        "}\n"
        const output = transpiler.transpileGo(input).content;
        expect(output).toContain("IsEqual(this.Orders, nil)");
        expect(output).toContain("IsEqual(this.Hostname, nil)");
        expect(output).toContain("IsEqual(this.Clients, nil)");
        expect(output).toContain("IsEqual(this.Ids, nil)");
        expect(output).toContain("IsEqual(this.LastRequest, nil)");
        expect(output).not.toContain("this.Orders == nil");
    });
    test('a *sync.Map field compared to a literal or to another field keeps IsEqual', () => {
        // a *sync.Map is not comparable to a string, and two of them would have to be
        // dereferenced: the printer repeats each operand in that shape
        const input =
        "class T {\n" +
        "    f () {\n" +
        "        if (this.markets === 'tok') { return 1; }\n" +
        "        if (this.markets === this.options) { return 2; }\n" +
        "        return 0;\n" +
        "    }\n" +
        "}\n"
        const output = transpiler.transpileGo(input).content;
        expect(output).toContain("IsEqual(this.Markets, \"tok\")");
        expect(output).toContain("IsEqual(this.Markets, this.Options)");
        expect(output).not.toContain("*this.Markets");
    });
    test('a local holding the field stays the any box it was declared with', () => {
        const input =
        "class T {\n" +
        "    f () {\n" +
        "        const markets = this.markets;\n" +
        "        if (markets === undefined) { return 1; }\n" +
        "        return 0;\n" +
        "    }\n" +
        "}\n"
        const output = transpiler.transpileGo(input).content;
        expect(output).toContain("var markets any = this.Markets");
        expect(output).toContain("IsEqual(markets, nil)");
    });
    test('hand-written bool-returning methods need no truthiness helper', () => {
        const input =
        "class T {\n" +
        "    isEmpty (a: any): boolean { return true; }\n" +
        "    isJsonEncodedObject (a: any): boolean { return true; }\n" +
        "    isBinaryMessage (a: any): boolean { return true; }\n" +
        "    hasOutcome (a: any): boolean { return true; }\n" +
        "    safeBool (a: any, b: any): boolean { return true; }\n" +
        "    f (symbols: any, msg: any) {\n" +
        "        if (this.isEmpty (symbols)) { return 1; }\n" +
        "        if (!this.isEmpty (symbols)) { return 2; }\n" +
        "        if (this.isJsonEncodedObject (msg)) { return 3; }\n" +
        "        if (this.isBinaryMessage (msg)) { return 4; }\n" +
        "        if (this.hasOutcome (msg)) { return 5; }\n" +
        "        if (this.safeBool (msg, 'k')) { return 6; }\n" +
        "        return 0;\n" +
        "    }\n" +
        "}\n"
        const output = transpiler.transpileGo(input).content;
        expect(output).toContain("if this.IsEmpty(symbols) {");
        expect(output).toContain("if !this.IsEmpty(symbols) {");
        expect(output).toContain("if this.IsJsonEncodedObject(msg) {");
        expect(output).toContain("if this.IsBinaryMessage(msg) {");
        // an any-returning method keeps the helper; the *bool accessor derefs instead
        expect(output).toContain("if EvalTruthy(this.HasOutcome(msg)) {");
        expect(output).toContain("if this.SafeBool(msg, \"k\") != nil && *this.SafeBool(msg, \"k\") {");
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

describe('go ordered comparisons with signed literals and pointer locals', () => {
    // the printer indents nested call expressions; gofmt collapses that downstream
    const squash = (output: string) => output.replace(/[\t ]+/g, ' ');
    const pointerStubs =
        "    safeInteger(a, b, c = undefined) { return a; }\n" +
        "    safeFloat(a, b, c = undefined) { return a; }\n";
    test('a signed integer literal joins an int operand', () => {
        const input =
        "class Exchange {\n" +
        pointerStubs +
        "    f (arr) {\n" +
        "        const n = arr.length;\n" +
        "        return [ n > -1, n < -1, n <= -2, n >= -3 ];\n" +
        "    }\n" +
        "}\n";
        const output = squash(transpiler.transpileGo(input).content);
        expect(output).toContain("return []any{(n > -1), (n < -1), (n <= -2), (n >= -3)}");
        expect(output).not.toContain("IsGreaterThan(n, -1)");
    });
    test('a signed float literal joins a float64 operand and keeps the helper on an int', () => {
        const input =
        "class Exchange {\n" +
        pointerStubs +
        "    f (v, arr) {\n" +
        "        const g = Math.floor(v);\n" +
        "        const n = arr.length;\n" +
        "        return [ g >= -0.5, g > -1.5, n < -1.5 ];\n" +
        "    }\n" +
        "}\n";
        const output = squash(transpiler.transpileGo(input).content);
        expect(output).toContain("(g >= -0.5)");
        expect(output).toContain("(g > -1.5)");
        expect(output).toContain("IsLessThan(n, -1.5)");
    });
    test('a *int64 local against an integer literal writes the helper nil test out', () => {
        const input =
        "class Exchange {\n" +
        pointerStubs +
        "    f (item) {\n" +
        "        const x = this.safeInteger (item, 'x');\n" +
        "        return x > 0;\n" +
        "    }\n" +
        "}\n";
        const output = squash(transpiler.transpileGo(input).content);
        expect(output).toContain("var x *int64 = this.SafeInteger(item, \"x\")");
        expect(output).toContain("return (x != nil && *x > 0)");
        expect(output).not.toContain("IsGreaterThan(x, 0)");
    });
    test('an enclosing `!== undefined` guard drops the nil test', () => {
        const input =
        "class Exchange {\n" +
        pointerStubs +
        "    f (item) {\n" +
        "        const x = this.safeInteger (item, 'x');\n" +
        "        if (x !== undefined) {\n" +
        "            return x > 0;\n" +
        "        }\n" +
        "        return false;\n" +
        "    }\n" +
        "}\n";
        const output = squash(transpiler.transpileGo(input).content);
        expect(output).toContain("if x != nil {");
        expect(output).toContain("return (*x > 0)");
        expect(output).not.toContain("IsGreaterThan(x, 0)");
    });
    test('a guard earlier in the same `&&` chain drops the nil test', () => {
        const input =
        "class Exchange {\n" +
        pointerStubs +
        "    f (item) {\n" +
        "        const x = this.safeInteger (item, 'x');\n" +
        "        return x !== undefined && x > 0;\n" +
        "    }\n" +
        "}\n";
        const output = squash(transpiler.transpileGo(input).content);
        expect(output).toContain("return (x != nil) && (*x > 0)");
        expect(output).not.toContain("IsGreaterThan(x, 0)");
    });
    test('a literal against an unguarded pointer mirrors the helper nil predicate', () => {
        // a non-nil left operand is *greater* than nil, so `>`/`>=` answer true there
        // while `<`/`<=` answer false — the arms below are exactly that
        const input =
        "class Exchange {\n" +
        pointerStubs +
        "    f (item) {\n" +
        "        const x = this.safeInteger (item, 'x');\n" +
        "        return [ 5 > x, 5 < x, 5 >= x, 5 <= x ];\n" +
        "    }\n" +
        "}\n";
        const output = squash(transpiler.transpileGo(input).content);
        expect(output).toContain("return []any{(x == nil || 5 > *x), (x != nil && 5 < *x), (x == nil || 5 >= *x), (x != nil && 5 <= *x)}");
        expect(output).not.toContain("IsGreaterThan(5, x)");
    });
    test('two unguarded pointers mirror the helper nil predicate', () => {
        const input =
        "class Exchange {\n" +
        pointerStubs +
        "    f (item) {\n" +
        "        const a = this.safeInteger (item, 'a');\n" +
        "        const b = this.safeInteger (item, 'b');\n" +
        "        return [ a > b, a >= b, a < b, a <= b ];\n" +
        "    }\n" +
        "}\n";
        const output = squash(transpiler.transpileGo(input).content);
        expect(output).toContain("return []any{(a != nil && (b == nil || *a > *b)), (b == nil || (a != nil && *a >= *b)), (b != nil && (a == nil || *a < *b)), (a == nil || (b != nil && *a <= *b))}");
        expect(output).not.toContain("IsGreaterThan(a, b)");
    });
    test('two guarded pointers compare their derefs', () => {
        const input =
        "class Exchange {\n" +
        pointerStubs +
        "    f (item) {\n" +
        "        const a = this.safeInteger (item, 'a');\n" +
        "        const b = this.safeInteger (item, 'b');\n" +
        "        if (a !== undefined && b !== undefined) {\n" +
        "            return [ a > b, a >= b, a < b, a <= b ];\n" +
        "        }\n" +
        "        return [];\n" +
        "    }\n" +
        "}\n";
        const output = squash(transpiler.transpileGo(input).content);
        expect(output).toContain("if (a != nil) && (b != nil) {");
        expect(output).toContain("return []any{(*a > *b), (*a >= *b), (*a < *b), (*a <= *b)}");
        expect(output).not.toContain("IsGreaterThan(a, b)");
    });
    test('one guarded pointer only writes the other side nil test', () => {
        const input =
        "class Exchange {\n" +
        pointerStubs +
        "    f (item) {\n" +
        "        const a = this.safeInteger (item, 'a');\n" +
        "        const b = this.safeInteger (item, 'b');\n" +
        "        if (a !== undefined) {\n" +
        "            return a > b;\n" +
        "        }\n" +
        "        return false;\n" +
        "    }\n" +
        "}\n";
        const output = squash(transpiler.transpileGo(input).content);
        expect(output).toContain("return (b == nil || *a > *b)");
        expect(output).not.toContain("IsGreaterThan(a, b)");
    });
    test('a rebound pointer local keeps an explicit nil test', () => {
        // the guard may be dead by the time the comparison runs, so only the nil test
        // inside the comparison proves it
        const input =
        "class Exchange {\n" +
        pointerStubs +
        "    f (item) {\n" +
        "        let x = this.safeInteger (item, 'x');\n" +
        "        if (x !== undefined) {\n" +
        "            x = this.safeInteger (item, 'y');\n" +
        "            return x > 3;\n" +
        "        }\n" +
        "        return false;\n" +
        "    }\n" +
        "}\n";
        const output = squash(transpiler.transpileGo(input).content);
        expect(output).toContain("return (x != nil && *x > 3)");
        expect(output).not.toContain("(*x > 3)");
    });
    test('a guard does not cross a callback boundary', () => {
        const input =
        "class Exchange {\n" +
        pointerStubs +
        "    f (item) {\n" +
        "        const x = this.safeInteger (item, 'x');\n" +
        "        if (x !== undefined) {\n" +
        "            return [ 1 ].map ((y) => x > y);\n" +
        "        }\n" +
        "        return [];\n" +
        "    }\n" +
        "}\n";
        const output = squash(transpiler.transpileGo(input).content);
        expect(output).toContain("IsGreaterThan(x, y)");
    });
    test('a *float64 pointer inlines `>`/`>=` and keeps `<`/`<=`', () => {
        // the helper answers true for a NaN operand on `<` / `<=`, Go answers false
        const input =
        "class Exchange {\n" +
        pointerStubs +
        "    f (item) {\n" +
        "        const x = this.safeFloat (item, 'x');\n" +
        "        return [ x !== undefined && x > 3, x !== undefined && x >= 3, x !== undefined && x < 3, x !== undefined && x <= 3 ];\n" +
        "    }\n" +
        "}\n";
        const output = squash(transpiler.transpileGo(input).content);
        expect(output).toContain("(*x > 3)");
        expect(output).toContain("(*x >= 3)");
        expect(output).toContain("IsLessThan(x, 3)");
        expect(output).toContain("IsLessThanOrEqual(x, 3)");
    });
    test('an any box holding a pointer keeps the helper', () => {
        // D2: the printer demotes the local because a later write of another type
        // reaches it, so the compiler no longer knows it holds a *int64
        const input =
        "class Exchange {\n" +
        pointerStubs +
        "    f (item) {\n" +
        "        let x = this.safeInteger (item, 'x');\n" +
        "        if (x === undefined) {\n" +
        "            x = 0;\n" +
        "        }\n" +
        "        return x > 3;\n" +
        "    }\n" +
        "}\n";
        const output = squash(transpiler.transpileGo(input).content);
        expect(output).toContain("var x any = this.SafeInteger(item, \"x\")");
        expect(output).toContain("IsGreaterThan(x, 3)");
    });
    test('a pointer against an `any` operand or another kind keeps the helper', () => {
        const input =
        "class Exchange {\n" +
        pointerStubs +
        "    f (item, arr, since) {\n" +
        "        const x = this.safeInteger (item, 'x');\n" +
        "        const n = arr.length;\n" +
        "        return [ x > since, x > n ];\n" +
        "    }\n" +
        "}\n";
        const output = squash(transpiler.transpileGo(input).content);
        expect(output).toContain("IsGreaterThan(x, since)");
        // the int side widens to int64 the way the helper converts it
        expect(output).toContain("(x != nil && *x > int64(n))");
    });
    test('an unguarded call operand keeps the helper', () => {
        // the nil test would short-circuit the call the helper evaluates once
        const input =
        "class Exchange {\n" +
        pointerStubs +
        "    f (item) {\n" +
        "        const x = this.safeInteger (item, 'x');\n" +
        "        return this.safeInteger (item, 'y') < x;\n" +
        "    }\n" +
        "}\n";
        const output = squash(transpiler.transpileGo(input).content);
        expect(output).toContain("IsLessThan(this.SafeInteger(item, \"y\"), x)");
    });
    test('a signed literal joins a helper call whose Go type is known', () => {
        const input =
        "class T {\n" +
        "    f (arr) {\n" +
        "        return GetLength(arr) > -1;\n" +
        "    }\n" +
        "}\n";
        const output = squash(transpiler.transpileGo(input).content);
        expect(output).toContain("return (GetLength(arr) > -1)");
        expect(output).not.toContain("IsGreaterThan(GetLength(arr), -1)");
    });
    // numeric kind widening in comparisons
    const numericKindStubs =
        "    rateLimit: number = 2000;\n" +
        "    fetchHistoryCacheSize: number = 0;\n" +
        "    safeInteger(a, b, c = undefined) { return a; }\n" +
        "    safeFloat(a, b, c = undefined) { return a; }\n";
    test('mixed int/int64/float64 kinds widen the narrower side', () => {
        const input =
        "class Exchange {\n" +
        numericKindStubs +
        "    f (arr, item) {\n" +
        "        const n = arr.length;\n" +
        "        const x = this.safeInteger (item, 'x');\n" +
        "        const g = this.safeFloat (item, 'g');\n" +
        "        return [ n >= x, x !== undefined && n < x, g !== undefined && g > n ];\n" +
        "    }\n" +
        "}\n";
        const output = squash(transpiler.transpileGo(input).content);
        expect(output).toContain("(x == nil || int64(n) >= *x)");
        expect(output).toContain("(int64(n) < *x)");
        expect(output).toContain("(*g > float64(n))");
        expect(output).not.toContain("IsGreaterThanOrEqual(n, x)");
    });
    test('float64 `<` against another kind keeps the helper; a length read widens', () => {
        const input =
        "class Exchange {\n" +
        numericKindStubs +
        "    f (arr, item) {\n" +
        "        const n = arr.length;\n" +
        "        const g = this.safeFloat (item, 'g');\n" +
        "        const x = this.safeInteger (item, 'x');\n" +
        "        return [ g !== undefined && g < n, arr.length > x ];\n" +
        "    }\n" +
        "}\n";
        const output = squash(transpiler.transpileGo(input).content);
        expect(output).toContain("IsLessThan(g, n)");
        expect(output).toContain("(x == nil || int64(GetArrayLength(arr)) > *x)");
    });
    test('base value fields compare natively', () => {
        const input =
        "class Exchange {\n" +
        numericKindStubs +
        "    f () {\n" +
        "        return [ this.rateLimit > 0, this.fetchHistoryCacheSize > 0 ];\n" +
        "    }\n" +
        "}\n";
        const output = squash(transpiler.transpileGo(input).content);
        expect(output).toContain("(this.RateLimit > 0)");
        expect(output).toContain("(this.FetchHistoryCacheSize > 0)");
    });
    test('a same-named field outside the base class keeps the helper', () => {
        const input =
        "class Venue {\n" +
        "    rateLimit: number = 2000;\n" +
        "    f () {\n" +
        "        return this.rateLimit > 0;\n" +
        "    }\n" +
        "}\n";
        const output = squash(transpiler.transpileGo(input).content);
        expect(output).toContain("IsGreaterThan(this.RateLimit, 0)");
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
    test('a fresh map local takes a nil-guarded *string key natively', () => {
        const input =
        "class Exchange {\n" +
        "    safeString(a, b) { return a; }\n" +
        "    main(params) {\n" +
        "        const result = {};\n" +
        "        const code = this.safeString (params, 'code');\n" +
        "        if (code !== undefined) {\n" +
        "            result[code] = 'x';\n" +
        "        }\n" +
        "        return result;\n" +
        "    }\n" +
        "}";
        const output = squash(transpiler.transpileGo(input).content);
        expect(output).toContain("result[*code] = \"x\"");
        expect(output).not.toContain("AddElementToObject");
    });
    test('an unguarded, pointer-valued or captured map write keeps the helper', () => {
        const input =
        "class Exchange {\n" +
        "    safeString(a, b) { return a; }\n" +
        "    main(params) {\n" +
        "        const result = {};\n" +
        "        const code = this.safeString (params, 'code');\n" +
        "        result[code] = 'x';\n" +
        "        if (code !== undefined) {\n" +
        "            result[code] = code;\n" +
        "        }\n" +
        "        const other = {};\n" +
        "        if (code !== undefined) {\n" +
        "            other[code] = 'y';\n" +
        "        }\n" +
        "        const f = () => other;\n" +
        "        const shared = {};\n" +
        "        this.keep (shared);\n" +
        "        if (code !== undefined) {\n" +
        "            shared[code] = 'z';\n" +
        "        }\n" +
        "        return [ result, f ];\n" +
        "    }\n" +
        "}";
        const output = squash(transpiler.transpileGo(input).content);
        // the plain store now carries the helper's own nil-key test; a pointer value and a
        // map another holder can write keep the helper
        expect(output).toMatch(/if code != nil \{\s+result\[\*code\] = "x"\s+\}/);
        expect(output).toContain("AddElementToObject(result, code, code)");
        expect(output).toContain("AddElementToObject(other, code, \"y\")");
        expect(output).toContain("AddElementToObject(shared, code, \"z\")");
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
    test('a nested element chain indexes a declared map receiver natively', () => {
        const input =
        "class Exchange {\n" +
        "    main() {\n" +
        "        const request = {};\n" +
        "        request['a']['b'] = 1;\n" +
        "        return request;\n" +
        "    }\n" +
        "}";
        const output = squash(transpiler.transpileGo(input).content);
        expect(output).toContain("AddElementToObject(request[\"a\"], \"b\", 1)");
        expect(output).not.toContain("GetValue(request,");
    });
    test('a nested element chain over an any box keeps the helper: GetValue is any', () => {
        const input =
        "class Exchange {\n" +
        "    main(params) {\n" +
        "        const request = params;\n" +
        "        request['a']['b'] = 1;\n" +
        "        return request;\n" +
        "    }\n" +
        "}";
        const output = squash(transpiler.transpileGo(input).content);
        expect(output).toContain("AddElementToObject(GetValue(request, \"a\"), \"b\", 1)");
    });
    test('only the first step of a nested chain inlines; the steps above stay GetValue', () => {
        const input =
        "class Exchange {\n" +
        "    main() {\n" +
        "        const request = {};\n" +
        "        request['a']['b']['c'] = 1;\n" +
        "        return request;\n" +
        "    }\n" +
        "}";
        const output = squash(transpiler.transpileGo(input).content);
        expect(output).toContain("AddElementToObject(GetValue(request[\"a\"], \"b\"), \"c\", 1)");
    });
    test('+= through a nested chain re-reads the same native index', () => {
        const input =
        "class Exchange {\n" +
        "    main() {\n" +
        "        const request = {};\n" +
        "        request['a']['b'] += 1;\n" +
        "        return request;\n" +
        "    }\n" +
        "}";
        const output = squash(transpiler.transpileGo(input).content);
        expect(output).toContain("AddElementToObject(request[\"a\"], \"b\", Add(GetValue(request[\"a\"], \"b\"), 1))");
    });
    test('a nested chain over a string-typed local key indexes natively', () => {
        const input =
        "class Exchange {\n" +
        "    main() {\n" +
        "        const request = {};\n" +
        "        const k = 'a';\n" +
        "        request[k]['b'] = 1;\n" +
        "        return request;\n" +
        "    }\n" +
        "}";
        const output = squash(transpiler.transpileGo(input).content);
        expect(output).toContain("var k string = \"a\"");
        expect(output).toContain("AddElementToObject(request[k], \"b\", 1)");
    });
    test('a non-string first key keeps the whole chain on the helper', () => {
        const input =
        "class Exchange {\n" +
        "    main(params) {\n" +
        "        const request = {};\n" +
        "        request[params]['b'] = 1;\n" +
        "        return request;\n" +
        "    }\n" +
        "}";
        const output = squash(transpiler.transpileGo(input).content);
        expect(output).toContain("AddElementToObject(GetValue(request, params), \"b\", 1)");
    });
    test('a nested chain over an as-cast receiver indexes natively', () => {
        const input =
        "class Exchange {\n" +
        "    main() {\n" +
        "        const request = {};\n" +
        "        (request as Dict)['a']['b'] = 1;\n" +
        "        return request;\n" +
        "    }\n" +
        "}";
        const output = squash(transpiler.transpileGo(input).content);
        expect(output).toContain("AddElementToObject(request[\"a\"], \"b\", 1)");
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
    test('a type assertion on a typed map local reads the map natively', () => {
        const input =
        "function f() {\n" +
        "    const request = {};\n" +
        "    return (request as Dict)['a'];\n" +
        "}\n"
        const output = transpiler.transpileGo(input).content;
        // the assertion is not printed: the receiver is the same Go map the unasserted
        // `request['a']` prints, so the read is native too
        expect(output).toContain("var request map[string]any =");
        expect(output).toContain('return request["a"]');
        expect(output).not.toContain('GetValue(');
    });
    test('a parenthesised assertion unwraps the same way', () => {
        const input =
        "function f() {\n" +
        "    const request = {};\n" +
        "    return ((request as Dict))['a'];\n" +
        "}\n"
        const output = transpiler.transpileGo(input).content;
        // the source's own inner parens are kept (same as `((request))['a']`), the read is native
        expect(output).toContain('(request)["a"]');
        expect(output).not.toContain('GetValue(');
    });
    test('only the first step of an asserted chain is native, the rest stay GetValue', () => {
        const input =
        "function f() {\n" +
        "    const request = {};\n" +
        "    return (request as Dict)['a']['b'];\n" +
        "}\n"
        const output = transpiler.transpileGo(input).content;
        expect(output).toContain('GetValue(request["a"], "b")');
    });
    test('an asserted receiver boxed in any keeps GetValue', () => {
        const input =
        "function f(m) {\n" +
        "    return (m as Dict)['a'];\n" +
        "}\n"
        const output = transpiler.transpileGo(input).content;
        // the assertion alone cannot name a Go map: the receiver prints `any`
        expect(output).toContain('GetValue(m, "a")');
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
    test('an as-cast receiver is typed like the bare expression it wraps', () => {
        const input =
        "function f() {\n" +
        "    const m = { 'a': 1 };\n" +
        "    return (m as Dict)['a'];\n" +
        "}\n"
        const output = transpiler.transpileGo(input).content;
        expect(output).toContain("var m map[string]any =");
        expect(output).toContain('return m["a"]');
        expect(output).not.toContain('GetValue(');
    });
    test('an as-cast receiver over an any box keeps GetValue', () => {
        const input =
        "function f(params) {\n" +
        "    const m = params;\n" +
        "    return (m as Dict)['a'];\n" +
        "}\n"
        const output = transpiler.transpileGo(input).content;
        expect(output).toContain("var m any = params");
        expect(output).toContain('return GetValue(m, "a")');
    });
    test('an as-cast key still counts as a Go string', () => {
        const input =
        "function f() {\n" +
        "    const m = { 'a': 1 };\n" +
        "    const k = 'a';\n" +
        "    return m[k as string];\n" +
        "}\n"
        const output = transpiler.transpileGo(input).content;
        expect(output).toContain('return m[k]');
        expect(output).not.toContain('GetValue(');
    });
    test('GetValue stays when the container is boxed in any', () => {
        const input =
        "function f(m) {\n" +
        "    return m['a'];\n" +
        "}\n"
        const output = transpiler.transpileGo(input).content;
        expect(output).toContain('GetValue(m, "a")');
    });
    test('an array index on a declared []any prints the guarded read: nil slice and out-of-range read as nil', () => {
        const input =
        "function f() {\n" +
        "    const a = [1, 2, 3];\n" +
        "    return a[0];\n" +
        "}\n"
        const output = transpiler.transpileGo(input).content;
        // D-06: the guarded native index answers the same nil GetValue answered for an
        // out-of-range index (and for a nil slice), where a bare subscript would panic
        expect(output).toContain('if 0 >= 0 && 0 < len(a) {\n\t\t\treturn DerefScalar(a[0])\n\t\t}\n\t\treturn nil\n\t}()');
        expect(output).not.toContain('GetValue(a, 0)');
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
    test('a Safe*-boxed string key reads the declared map through the nil guard', () => {
        const input =
        "class Exchange {\n" +
        "    safeString(a, b) { return a; }\n" +
        "    main(item) {\n" +
        "        const fees = {};\n" +
        "        const code = this.safeString (item, 'code');\n" +
        "        return fees[code];\n" +
        "    }\n" +
        "}\n";
        const output = transpiler.transpileGo(input).content;
        // GetValue derefs a Safe*-boxed key and answers nil for a nil key; the guard
        // reproduces both around the very same map index
        expect(output).toContain("var code *string = this.SafeString(item, \"code\")");
        expect(output).toContain("return func() any {\n\t\tif code == nil {\n\t\t\treturn nil\n\t\t}\n\t\treturn fees[*code]\n\t}()");
        expect(output).not.toContain("GetValue(fees");
    });
    test('the nil-guarded read hands the later chain steps to the helper', () => {
        const input =
        "class Exchange {\n" +
        "    safeString(a, b) { return a; }\n" +
        "    main(item) {\n" +
        "        const fees = {};\n" +
        "        const code = this.safeString (item, 'code');\n" +
        "        return fees[code]['x'];\n" +
        "    }\n" +
        "}\n";
        const output = transpiler.transpileGo(input).content;
        expect(output).toContain("return GetValue(func() any {\n\t\tif code == nil {\n\t\t\treturn nil\n\t\t}\n\t\treturn fees[*code]\n\t}(), \"x\")");
    });
    test('a boxed key that is not a `*string` keeps GetValue', () => {
        const input =
        "class Exchange {\n" +
        "    safeInteger(a, b) { return a; }\n" +
        "    main(item) {\n" +
        "        const fees = {};\n" +
        "        const ts = this.safeInteger (item, 't');\n" +
        "        return fees[ts];\n" +
        "    }\n" +
        "}\n";
        const output = transpiler.transpileGo(input).content;
        expect(output).toContain("var ts *int64 = this.SafeInteger(item, \"t\")");
        expect(output).toContain("GetValue(fees, ts)");
    });
    test('a boxed string key on a receiver that stays `any` keeps GetValue', () => {
        const input =
        "class Exchange {\n" +
        "    safeString(a, b) { return a; }\n" +
        "    main(item, m) {\n" +
        "        const code = this.safeString (item, 'code');\n" +
        "        return m[code];\n" +
        "    }\n" +
        "}\n";
        const output = transpiler.transpileGo(input).content;
        expect(output).toContain("GetValue(m, code)");
    });
    test('a boxed string key on an assignment target keeps the element write', () => {
        const input =
        "class Exchange {\n" +
        "    safeString(a, b) { return a; }\n" +
        "    main(item) {\n" +
        "        const fees = {};\n" +
        "        const code = this.safeString (item, 'code');\n" +
        "        fees[code] = 1;\n" +
        "    }\n" +
        "}\n";
        const output = transpiler.transpileGo(input).content;
        // the boxed key is dereferenced only behind the helper's own nil test
        expect(output).toMatch(/if code != nil \{\s+fees\[\*code\] = 1\s+\}/);
        expect(output).not.toContain("AddElementToObject(fees");
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
        expect(output).toContain("var s string = this.Id + \" does not support \" + \"market\"");
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
        "    iso8601 (x: any): string { return ''; }\n" +
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
    test('Divide on a non-nil *int64 local prints the float64 division only under a box-blind consumer', () => {
        const input =
        "class T {\n" +
        "    parseToInt (n: any): number { return 1; }\n" +
        "    f (since: Int = undefined, until: Int = undefined, params = {}) {\n" +
        "        const request = {};\n" +
        "        if (since !== undefined) {\n" +
        "            request['a'] = Math.floor (since / 1000);\n" +
        "            request['b'] = this.parseToInt (since / 1000);\n" +
        "            request['c'] = since / 1000;\n" +
        "            request['d'] = Math.floor (since / 0);\n" +
        "        }\n" +
        "        request['e'] = this.parseToInt (until / 1000);\n" +
        "        return request;\n" +
        "    }\n" +
        "}\n"
        const output = transpiler.transpileGo(input).content;
        expect(output).toContain("MathFloor(float64(*since) / 1000)");
        expect(output).toContain("this.ParseToInt(float64(*since) / 1000)");
        expect(output).toContain("Divide(since, 1000)");
        expect(output).toContain("Divide(since, 0)");
        expect(output).toContain("this.ParseToInt(Divide(until, 1000))");
    });
    test('Subtract on a non-nil *int64 prints the native int64 subtraction', () => {
        const input =
        "class T {\n" +
        "    options = {};\n" +
        "    milliseconds (): number { return 1; }\n" +
        "    safeInteger (o: any, k: any, d: any = undefined): Int { return 1; }\n" +
        "    f (since: Int = undefined, until: Int = undefined, params = {}) {\n" +
        "        const request = {};\n" +
        "        const now = this.milliseconds ();\n" +
        "        if (since !== undefined) {\n" +
        "            request['a'] = Math.max (since - 1, 0);\n" +
        "            request['b'] = now - since;\n" +
        "            request['c'] = since - 1.5;\n" +
        "        }\n" +
        "        request['d'] = until - 1;\n" +
        "        request['e'] = this.milliseconds () - this.safeInteger (this.options, 'td', 0);\n" +
        "        request['f'] = this.milliseconds () - this.safeInteger (this.options, 'td');\n" +
        "        return request;\n" +
        "    }\n" +
        "}\n"
        const output = transpiler.transpileGo(input).content;
        expect(output).toContain("*since - 1, 0)");
        expect(output).toContain("= now - *since");
        expect(output).toContain("Subtract(since, 1.5)");
        expect(output).toContain("Subtract(until, 1)");
        expect(output).toContain("= this.Milliseconds() - *this.SafeInteger(this.Options, \"td\", 0)");
        expect(output).toContain("Subtract(this.Milliseconds(), this.SafeInteger(this.Options, \"td\"))");
    });
    test('Multiply on a non-nil *int64 prints the native int64 product', () => {
        const input =
        "class T {\n" +
        "    options = {};\n" +
        "    milliseconds (): number { return 1; }\n" +
        "    safeInteger (o: any, k: any, d: any = undefined): Int { return 1; }\n" +
        "    f (since: Int = undefined, limit: Int = undefined, params = {}) {\n" +
        "        const request = {};\n" +
        "        const duration = this.milliseconds ();\n" +
        "        const x: any = params['x'];\n" +
        "        if ((since !== undefined) && (limit !== undefined)) {\n" +
        "            request['a'] = since * 1000;\n" +
        "            request['b'] = limit * duration;\n" +
        "            request['c'] = (duration * limit) * 1000;\n" +
        "            request['d'] = since * 1.5;\n" +
        "            request['e'] = since * x;\n" +
        "        }\n" +
        "        request['f'] = limit * 2;\n" +
        "        request['g'] = this.safeInteger (this.options, 'm', 0) * 1000;\n" +
        "        return request;\n" +
        "    }\n" +
        "}\n"
        const output = transpiler.transpileGo(input).content;
        expect(output).toContain("= *since * 1000");
        expect(output).toContain("= *limit * duration");
        expect(output).toContain("= (duration * *limit) * 1000");
        expect(output).toContain("Multiply(since, 1.5)");
        expect(output).toContain("Multiply(since, x)");
        expect(output).toContain("Multiply(limit, 2)");
        expect(output).toContain("= *this.SafeInteger(this.Options, \"m\", 0) * 1000");
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
        expect(output).toContain("var q any = float64(this.Milliseconds()) / 2");
        expect(output).toContain("var z any = Divide(this.Milliseconds(), 0)");
    });
    test('Mod inlines an int64 value with a nonzero literal, a zero divisor or a float operand keeps the helper', () => {
        const input =
        "class T {\n" +
        "    milliseconds (): number { return 1; }\n" +
        "    f (value) {\n" +
        "        var r = this.milliseconds() % 2;\n" +
        "        var z = this.milliseconds() % 0;\n" +
        "        var float2 = Math.floor(value) % 2.5;\n" +
        "        return [r, z, float2];\n" +
        "    }\n" +
        "}\n"
        const output = transpiler.transpileGo(input).content;
        expect(output).toContain("var r any = this.Milliseconds() % 2");
        expect(output).toContain("var z any = Mod(this.Milliseconds(), 0)");
        expect(output).toContain("var float2 any = Mod(MathFloor(value), 2.5)");
    });
    test('Subtract on an int-typed helper result widens to int64 (the helper returns int64)', () => {
        const input =
        "class T {\n" +
        "    f (a: string[]) {\n" +
        "        var n = a.length - 1;\n" +
        "        return n;\n" +
        "    }\n" +
        "}\n"
        const output = transpiler.transpileGo(input).content;
        expect(output).toContain("var n any = int64(GetArrayLength(a)) - 1");
        expect(output).not.toContain("Subtract(");
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
    test('an inferred counter widens Subtract and Multiply to int64 (both helpers return int64)', () => {
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
        expect(output).toContain("int64(i) - 1");
        expect(output).toContain("int64(i) * 2");
        expect(output).not.toContain("var a any = i - 1");
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
    test('an int64 call plus an int counter widens the int side (Add boxes int64 for the mix)', () => {
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
        expect(output).toContain("this.Milliseconds() + int64(i)");
        expect(output).not.toContain("Add(");
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
        // the later string write converts at the write site, so the local stays *string
        expect(output).toContain("var timeInForce *string = this.SafeString(order, \"timeInForce\")");
        expect(output).toContain("timeInForce = SafeStringPtr(\"IOC\")");
        expect(output).toContain("var y bool = (timeInForce != nil && *timeInForce == \"PO\")");
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
    test('an object-typed parameter compares natively against nil', () => {
        const input =
        "type Strings = string[] | undefined;\n" +
        "type NullableDict = Dict | undefined;\n" +
        "interface Dict { [key: string]: any }\n" +
        "interface Market { symbol: string }\n" +
        "function f (symbols: Strings, market: Market, headers: NullableDict, params: object | undefined) {\n" +
        "    const a = symbols !== undefined;\n" +
        "    const b = market === undefined;\n" +
        "    const c = headers !== undefined;\n" +
        "    const d = params === undefined;\n" +
        "    return [ a, b, c, d ];\n" +
        "}\n"
        const output = transpiler.transpileGo(input).content;
        // a map/slice box holds a value or an untyped nil, never a typed pointer
        expect(output).toContain("var a bool = (symbols != nil)");
        expect(output).toContain("var b bool = (market == nil)");
        expect(output).toContain("var c bool = (headers != nil)");
        expect(output).toContain("var d bool = (params == nil)");
    });
    test('an optional object parameter bound by GetArg compares natively against nil', () => {
        const input =
        "type Strings = string[] | undefined;\n" +
        "class T {\n" +
        "    async fetchTickers (symbols: Strings = undefined, params = {}) {\n" +
        "        if (symbols === undefined) { return 1; }\n" +
        "        return 2;\n" +
        "    }\n" +
        "}\n"
        const output = transpiler.transpileGo(input).content;
        expect(output).toContain("symbols := GetArg(optionalArgs, 0, nil)");
        expect(output).toContain("if symbols == nil {");
    });
    test('object boxes that are not parameters keep the helper', () => {
        const input =
        "type Int = number | undefined;\n" +
        "type NullableDict = Dict | undefined;\n" +
        "interface Dict { [key: string]: any }\n" +
        "class T {\n" +
        "    safeDict (a, b) { return a; }\n" +
        "    f (since: Int = undefined, raw: any) {\n" +
        "        const localDict = this.safeDict (raw, 'precision');\n" +
        "        const a = localDict === undefined;\n" +
        "        const b = since === undefined;\n" +
        "        const c = raw === undefined;\n" +
        "        return [ a, b, c ];\n" +
        "    }\n" +
        "}\n"
        const output = transpiler.transpileGo(input).content;
        // a typed map local cannot box a *sync.Map: the nil test is the native one
        expect(output).toContain("var a bool = (localDict == nil)");
        // a defaulted `Int` parameter is bound by GetArg, which folds a typed nil pointer
        // into the untyped default, so the box is nil-comparable
        expect(output).toContain("var b bool = (since == nil)");
        // `any` and a parameter without a default keep the helper
        expect(output).toContain("var c bool = IsEqual(raw, nil)");
    });
    test('two object boxes do not compare with a native operator', () => {
        const input =
        "type Strings = string[] | undefined;\n" +
        "function k (a: Strings, b: Strings) {\n" +
        "    const x = a === b;\n" +
        "    return x;\n" +
        "}\n"
        const output = transpiler.transpileGo(input).content;
        // Go panics comparing two uncomparable values through `==`
        expect(output).toContain("var x bool = IsEqual(a, b)");
    });
    test('a class-typed parameter keeps the helper', () => {
        const input =
        "class Cache { x: number = 1; }\n" +
        "function h (cache: Cache, other: Cache | undefined) {\n" +
        "    const a = cache === undefined;\n" +
        "    const b = other === undefined;\n" +
        "    return [ a, b ];\n" +
        "}\n"
        const output = transpiler.transpileGo(input).content;
        // a class instance may be an identity-bearing pointer in Go
        expect(output).toContain("var a bool = IsEqual(cache, nil)");
        expect(output).toContain("var b bool = IsEqual(other, nil)");
    });
    test('a defaulted scalar parameter compares against nil natively', () => {
        const input =
        "type Int = number | undefined;\n" +
        "type Num = number | undefined;\n" +
        "type Str = string | undefined;\n" +
        "type Bool = boolean | undefined;\n" +
        "class T {\n" +
        "    f (since: Int = undefined, price: Num = undefined, symbol: Str = undefined, flag: Bool = undefined, params = {}) {\n" +
        "        const a = since === undefined;\n" +
        "        const b = price !== undefined;\n" +
        "        const c = symbol === undefined;\n" +
        "        const d = flag !== undefined;\n" +
        "        return [ a, b, c, d ];\n" +
        "    }\n" +
        "}\n"
        const output = transpiler.transpileGo(input).content;
        // a nil-defaulted scalar binds through its pointer twin, which stays nil-comparable
        expect(output).toContain("var since *int64 = GetArgInt64Ptr(optionalArgs, 0, nil)");
        expect(output).toContain("var a bool = (since == nil)");
        expect(output).toContain("var b bool = (price != nil)");
        expect(output).toContain("var c bool = (symbol == nil)");
        expect(output).toContain("var d bool = (flag != nil)");
    });
    test('a nil-defaulted pointer copied into a local keeps its twin', () => {
        const input =
        "type Int = number | undefined;\n" +
        "type Str = string | undefined;\n" +
        "class T {\n" +
        "    f (symbol: Str = undefined, limit: Int = undefined, since: Int = undefined, params = {}) {\n" +
        "        const request = {};\n" +
        "        const limitResolved = (limit === undefined) ? 100 : limit;\n" +
        "        let limitCopy: Int = since;\n" +
        "        if (since !== undefined) {\n" +
        "            limitCopy = since - 1;\n" +
        "        }\n" +
        "        if (limitCopy !== undefined) {\n" +
        "            request['limit'] = limitCopy;\n" +
        "        }\n" +
        "        const s = (symbol !== undefined) ? symbol : 'x';\n" +
        "        request['size'] = limitResolved;\n" +
        "        request['s'] = s;\n" +
        "        return request;\n" +
        "    }\n" +
        "}\n"
        const output = transpiler.transpileGo(input).content;
        expect(output).toContain("var limit *int64 = GetArgInt64Ptr(optionalArgs, 1, nil)");
        expect(output).toContain("var since *int64 = GetArgInt64Ptr(optionalArgs, 2, nil)");
        expect(output).toContain("var symbol *string = GetArgStringPtr(optionalArgs, 0, nil)");
        // the copy boxes the pointer: its nil test must go through the deref-aware helper
        expect(output).not.toContain("limitCopy != nil");
        expect(output).toContain("IsEqual(limitCopy, nil)");
    });
    test('a pointer copied into a local later written a Go string keeps the box', () => {
        const input =
        "type Str = string | undefined;\n" +
        "class T {\n" +
        "    f (flag = false, body: Str = undefined, params = {}) {\n" +
        "        let requestBody = body;\n" +
        "        if (flag) {\n" +
        "            requestBody = 'x';\n" +
        "        }\n" +
        "        return { 'body': requestBody };\n" +
        "    }\n" +
        "}\n"
        const output = transpiler.transpileGo(input).content;
        expect(output).not.toContain("GetArgStringPtr(");
    });
    test('a pointer copied into a local later written native arithmetic keeps the typed param', () => {
        const input =
        "type Int = number | undefined;\n" +
        "class T {\n" +
        "    milliseconds (): number { return 1; }\n" +
        "    f (since: Int = undefined, params = {}) {\n" +
        "        const now = this.milliseconds ();\n" +
        "        let s = since;\n" +
        "        if (s === undefined) {\n" +
        "            s = now - 1000 * 60;\n" +
        "        }\n" +
        "        return this.iso8601 (s);\n" +
        "    }\n" +
        "}\n"
        const go: any = transpiler.goTranspiler;
        const saved = go.CCXT_GO_GETARG_SAFE_CONSUMERS;
        go.CCXT_GO_GETARG_SAFE_CONSUMERS = { 'Iso8601': 'deref' };
        // a host classifier types the native arithmetic write int64
        go.goTypeOfInitializer = function (n: any, printed: string) {
            return Object.getPrototypeOf(this).goTypeOfInitializer.call(this, n, printed) ?? ((n?.kind === SyntaxKind.BinaryExpression) ? this.goNativeArithmeticType(n) : undefined);
        };
        const output = transpiler.transpileGo(input).content;
        delete go.goTypeOfInitializer;
        go.CCXT_GO_GETARG_SAFE_CONSUMERS = saved;
        expect(output).toContain("var since *int64 = GetArgInt64Ptr(optionalArgs, 0, nil)");
        expect(output).toContain("var s any = since");
    });
    test('a pointer copied into a local handed to an unknown callee keeps the box', () => {
        const input =
        "type Int = number | undefined;\n" +
        "class T {\n" +
        "    g (x) { return x; }\n" +
        "    f (limit: Int = undefined, params = {}) {\n" +
        "        const limitResolved = limit;\n" +
        "        return this.g (limitResolved);\n" +
        "    }\n" +
        "}\n"
        const output = transpiler.transpileGo(input).content;
        expect(output).not.toContain("GetArgInt64Ptr(");
    });
    test('a parameter without a default keeps the helper', () => {
        const input =
        "type Int = number | undefined;\n" +
        "class T {\n" +
        "    f (since: Int) {\n" +
        "        const b = since === undefined;\n" +
        "        return b;\n" +
        "    }\n" +
        "}\n"
        const output = transpiler.transpileGo(input).content;
        // no GetArg binding: another method may hand over this.SafeInteger(…), whose nil
        // *int64 is not `== nil`
        expect(output).toContain("IsEqual(since, nil)");
        expect(output).not.toContain("since == nil");
    });
    test('a later pointer write keeps the helper', () => {
        const input =
        "type Int = number | undefined;\n" +
        "class T {\n" +
        "    safeInteger (a, b, c): Int { return a; }\n" +
        "    f (since: Int = undefined, params: any = {}) {\n" +
        "        since = this.safeInteger (params, 'since');\n" +
        "        const a = since === undefined;\n" +
        "        return a;\n" +
        "    }\n" +
        "}\n"
        const output = transpiler.transpileGo(input).content;
        // the local is bound as *int64 by its GetArg twin, so the nil test is native
        expect(output).toContain("var since *int64 = GetArgInt64Ptr(");
        expect(output).toContain("(since == nil)");
    });
    test('a later pointer accessor outside the Go type table keeps the helper', () => {
        const input =
        "type Int = number | undefined;\n" +
        "class T {\n" +
        "    numberToString (a): Int { return a; }\n" +
        "    parse8601 (a): Int { return a; }\n" +
        "    f (since: Int = undefined, raw: any = {}) {\n" +
        "        since = this.numberToString (raw);\n" +
        "        const a = since === undefined;\n" +
        "        return a;\n" +
        "    }\n" +
        "    g (until: Int = undefined, raw: any = {}) {\n" +
        "        until = this.parse8601 (raw);\n" +
        "        const b = until === undefined;\n" +
        "        return b;\n" +
        "    }\n" +
        "}\n"
        const output = transpiler.transpileGo(input).content;
        // both print to a *string / *int64 the ccxt pass derefs: the box is still a pointer
        expect(output).toContain("IsEqual(since, nil)");
        expect(output).toContain("IsEqual(until, nil)");
        expect(output).not.toContain("since == nil");
        expect(output).not.toContain("until == nil");
    });
    test('an arrow function parameter keeps the helper (no GetArg binding)', () => {
        const input =
        "type Int = number | undefined;\n" +
        "class T {\n" +
        "    f (params: any = {}) {\n" +
        "        const g = (since: Int = undefined) => since === undefined;\n" +
        "        return g;\n" +
        "    }\n" +
        "}\n"
        const output = transpiler.transpileGo(input).content;
        expect(output).toContain("IsEqual(since, nil)");
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
        expect(output).toContain("} else if a != \"y\" {");
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
        expect(output).toContain("func() string {\n\t\tif x == \"delivery\" {\n\t\t\treturn \"yes\"\n\t\t}\n\t\treturn \"no\"\n\t}()");
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
    test('the section-break ratio uses go/printer log2ish/exp2ish, so exactly 2.5 breaks', () => {
        const input =
        "class T {\n" +
        "    f () {\n" +
        "        const x = {\n" +
        "            'Invalid InstrumentId': 1,\n" +
        "            'This endpoint requires 2FACode along with the payload': 2\n" +
        "        }\n" +
        "        return x;\n" +
        "    }\n" +
        "}\n"
        const output = transpiler.transpileGo(input).content;
        // 55 / exp2ish(log2ish(22)) is exactly 2.5 -> formfeed section break, no padding
        expect(output).toContain('"Invalid InstrumentId": 1,');
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
        expect(lines[7]).toBe(`${indent}var timeframe string = GetArgString(optionalArgs, 0, "1m")`);
        expect(lines[8]).toBe(`${indent}_ = timeframe`);
        expect(lines[9]).toBe(`${indent}var params map[string]any = GetArgMap(optionalArgs, 1, map[string]any{})`);
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
        expect(lines[3]).toBe(`${indent}var params map[string]any = GetArgMap(optionalArgs, 0, map[string]any{})`);
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
        // gofmt spacing rule itself, which is why the output is gofmt-checked
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
            "\t\t}(), func() string {\n");
        expect(output).toContain("\t\t\"side\": func() string {\n\t\t\tif EvalTruthy(isMaker) {\n\t\t\t\treturn \"buy\"\n\t\t\t}\n\t\t\treturn \"sell\"\n\t\t}(),\n\t\t\"z\": 1,\n");
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
        expect(output).toContain("auth = append(auth, this.Id+\"=\"+this.Id)");
        expect(output).toContain("[]any{\"a\", \"client-or\" + \"der-id\"}");
        expect(output).toContain("Slice(this.Id, idx+1, nil)");
    });
    const squashWs = (output: string) => output.replace(/\s+/g, ' ');
    test('indexOf on a printer-declared string receiver emits strings.Index', () => {
        const input =
        "class Exchange {\n" +
        "    main () {\n" +
        "        const symbol = 'BTC/USDT';\n" +
        "        if (symbol.indexOf ('/') > -1) { return symbol; }\n" +
        "        return '';\n" +
        "    }\n" +
        "}\n";
        const output = transpiler.transpileGo(input).content;
        // the file needs the stdlib package its native emission calls
        expect(output).toContain("import \"strings\"");
        expect(output).toContain("strings.Index(symbol, \"/\")");
        expect(output).not.toContain("GetIndexOf(symbol");
    });
    test('indexOf on a *string receiver emits the nil-guarded strings.Index literal', () => {
        const input =
        "class Exchange {\n" +
        "    safeString (a, b) { return a; }\n" +
        "    main (item) {\n" +
        "        const amount = this.safeString (item, 'amount');\n" +
        "        if (amount.indexOf ('-') >= 0) { return 'out'; }\n" +
        "        return 'in';\n" +
        "    }\n" +
        "}\n";
        const output = squashWs(transpiler.transpileGo(input).content);
        expect(output).toContain("import \"strings\"");
        // GetIndexOf derefScalar's a nil *string to -1; the literal repeats the identifier
        expect(output).toContain("func() int { if amount == nil { return -1 } return strings.Index(*amount, \"-\") }()");
        expect(output).not.toContain("GetIndexOf(amount");
    });
    test('indexOf on an asserted receiver and needle reads the operands\' own Go types', () => {
        const input =
        "class Exchange {\n" +
        "    safeString (a, b) { return a; }\n" +
        "    main (item) {\n" +
        "        const address = this.safeString (item, 'address');\n" +
        "        const sep = '?dt=';\n" +
        "        if ((address as string).indexOf ((sep as string)) >= 0) { return 'tag'; }\n" +
        "        return '';\n" +
        "    }\n" +
        "}\n";
        const output = squashWs(transpiler.transpileGo(input).content);
        // the `as string` on a nilable *string is the author's non-null promise: plain deref
        expect(output).toContain("strings.Index(*address, sep)");
        expect(output).not.toContain("func() int {");
        expect(output).not.toContain("GetIndexOf(");
    });
    test('indexOf on a receiver Go boxes as any keeps the helper', () => {
        const input =
        "class Exchange {\n" +
        "    main (params) {\n" +
        "        const marketId = this.safeString (params, 'marketId');\n" +
        "        return [ params.indexOf ('/'), marketId.indexOf ('-C'), this.getId ().indexOf ('x') ];\n" +
        "    }\n" +
        "    getId () { return 'x'; }\n" +
        "}\n";
        const output = transpiler.transpileGo(input).content;
        expect(output).not.toContain("import \"strings\"");
        expect(output).toContain("GetIndexOf(params, \"/\")");
    });
    test('indexOf on a slice receiver keeps the helper', () => {
        const input =
        "class Exchange {\n" +
        "    main () {\n" +
        "        const code = 'EAI_AGAIN';\n" +
        "        const codes = [ 'EAI_AGAIN', 'ETIMEDOUT' ];\n" +
        "        const parts = 'a-b'.split ('-');\n" +
        "        return [ codes.indexOf (code), parts.indexOf ('b') ];\n" +
        "    }\n" +
        "}\n";
        const output = transpiler.transpileGo(input).content;
        // the helper's type switch has no []any case (it answers -1), so a []any receiver
        // must not be inlined; its []string case scans the slice
        // `strings.Split` is native, so the import is present; the []any receiver still keeps the helper
        expect(output).toContain("GetIndexOf(codes, code)");
        expect(output).not.toContain("strings.Index(codes");
    });
    test('indexOf on a GetValue box keeps the helper', () => {
        const input =
        "class Exchange {\n" +
        "    main (transaction) {\n" +
        "        const ids = Object.keys (transaction);\n" +
        "        return GetValue (ids, 0).indexOf ('_');\n" +
        "    }\n" +
        "}\n";
        const output = transpiler.transpileGo(input).content;
        expect(output).not.toContain("import \"strings\"");
        expect(output).toContain("GetIndexOf(GetValue(ids, 0), \"_\")");
    });
});


// helper-family removal: `Add(Add(a, "lit"), b)` string chains print as the Go
// operator when every leaf is a non-nil string — a declared `string`, a literal, or a
// `*string` local the checker narrowed to a non-nilable string at that use site
describe('go string concat chains -> native +', () => {
    const squash = (output: string) => output.replace(/[\t ]+/g, ' ');
    test('a GetArgString-bound parameter is a concat leaf and the declaration is string', () => {
        const input =
        "class Exchange {\n" +
        "    sign (path: any, api = 'public', method = 'GET') {\n" +
        "        const auth = method + '\\n';\n" +
        "        return auth;\n" +
        "    }\n" +
        "}\n";
        const output = squash(transpiler.transpileGo(input).content);
        expect(output).toContain('var method string = GetArgString(optionalArgs, 1, "GET")');
        expect(output).toContain('var auth string = method + "\\n"');
        expect(output).not.toContain('Add(');
    });
    test('a chain over a native-concat string local declares string', () => {
        const input =
        "class Exchange {\n" +
        "    main (method = 'GET') {\n" +
        "        const nonce = 'n_' + method;\n" +
        "        const auth = '/u' + 'GET' + method + '' + nonce;\n" +
        "        return auth;\n" +
        "    }\n" +
        "}\n";
        const output = squash(transpiler.transpileGo(input).content);
        expect(output).toContain('var auth string = "/u" + "GET" + method + "" + nonce');
        expect(output).not.toContain('Add(');
    });
    test('a long concat chain prints in linear time', () => {
        const leaves = Array.from({ length: 40 }, (_, i) => `'p${i}'`).join(' + ');
        const input =
        "class Exchange {\n" +
        "    main (method = 'GET') {\n" +
        `        const auth = method + ${leaves};\n` +
        "        return auth;\n" +
        "    }\n" +
        "}\n";
        const started = Date.now();
        const output = squash(transpiler.transpileGo(input).content);
        const expected = Array.from({ length: 40 }, (_, i) => `"p${i}"`).join(' + ');
        expect(output).toContain(`var auth string = method + ${expected}`);
        expect(Date.now() - started).toBeLessThan(5000);
    });
    test('an any parameter or unproven *string leaf keeps the Add declaration any', () => {
        const input =
        "class Exchange {\n" +
        "    safeString (a: any, b: string): string | undefined { return a; }\n" +
        "    main (item: any, body: any, method = 'GET') {\n" +
        "        const q = this.safeString (item, 'q');\n" +
        "        const a = method + body;\n" +
        "        const b = method + q;\n" +
        "        return [a, b];\n" +
        "    }\n" +
        "}\n";
        const output = squash(transpiler.transpileGo(input).content);
        expect(output).toContain('var a any = Add(method, body)');
        expect(output).toContain('var b any = Add(method, q)');
    });
    test('a chain over two guard-narrowed *string locals prints as one Go expression', () => {
        const input =
        "class Exchange {\n" +
        "    safeString (a: any, b: string): string | undefined { return a; }\n" +
        "    main (item: any, other: any) {\n" +
        "        const fromId = this.safeString (item, 'from');\n" +
        "        const toId = this.safeString (item, 'to');\n" +
        "        if (fromId === undefined) { throw new Error ('missing from'); }\n" +
        "        if (toId === undefined) { throw new Error ('missing to'); }\n" +
        "        return fromId + '_' + toId;\n" +
        "    }\n" +
        "}\n";
        const output = squash(transpiler.transpileGo(input).content);
        expect(output).toContain('var fromId *string = this.SafeString(item, "from")');
        expect(output).toContain('return *fromId + "_" + *toId');
        expect(output).not.toContain('Add(');
    });
    test('a four-leaf chain leaves the literals bare and derefs both *string leaves', () => {
        const input =
        "class Exchange {\n" +
        "    safeString (a: any, b: string): string | undefined { return a; }\n" +
        "    main (parts: string[]) {\n" +
        "        const scheme = this.safeString (parts, 'scheme');\n" +
        "        if (scheme === undefined) { return undefined; }\n" +
        "        const domain = this.safeString (parts, 'domain');\n" +
        "        if (domain === undefined) { return undefined; }\n" +
        "        return scheme + '//' + domain + '/';\n" +
        "    }\n" +
        "}\n";
        const output = squash(transpiler.transpileGo(input).content);
        expect(output).toContain('var scheme *string = this.SafeString(parts, "scheme")');
        expect(output).toContain('return *scheme + "//" + *domain + "/"');
        expect(output).not.toContain('Add(');
    });
    test('a flat expression narrowed by an `if (x !== undefined)` block also goes native', () => {
        const input =
        "class Exchange {\n" +
        "    safeString (a: any, b: string): string | undefined { return a; }\n" +
        "    main (item: any) {\n" +
        "        const interval = this.safeString (item, 'interval');\n" +
        "        let intervalString: string | undefined = undefined;\n" +
        "        if (interval !== undefined) {\n" +
        "            intervalString = interval + 'h';\n" +
        "        }\n" +
        "        return intervalString;\n" +
        "    }\n" +
        "}\n";
        const output = squash(transpiler.transpileGo(input).content);
        expect(output).toContain('intervalString = *interval + "h"');
        expect(output).not.toContain('Add(');
    });
    test('a `=== "lit"` comparison narrows the *string leaf too', () => {
        const input =
        "class Exchange {\n" +
        "    safeString (a: any, b: string): string | undefined { return a; }\n" +
        "    main (item: any) {\n" +
        "        const side = this.safeString (item, 'side');\n" +
        "        if (side === 'buy') {\n" +
        "            return side + '_' + 'ok';\n" +
        "        }\n" +
        "        return side;\n" +
        "    }\n" +
        "}\n";
        const output = squash(transpiler.transpileGo(input).content);
        expect(output).toContain('return *side + "_" + "ok"');
        expect(output).not.toContain('Add(');
    });
    test('a *string leaf with no nil proof keeps the helper call', () => {
        const input =
        "class Exchange {\n" +
        "    safeString (a: any, b: string): string | undefined { return a; }\n" +
        "    main (item: any, other: any) {\n" +
        "        const fromId = this.safeString (item, 'from');\n" +
        "        const toId = this.safeString (item, 'to');\n" +
        "        return fromId + '_' + toId;\n" +
        "    }\n" +
        "}\n";
        const output = squash(transpiler.transpileGo(input).content);
        expect(output).toContain('return Add(Add(fromId, "_"), toId)');
    });
    test('an unproven leaf keeps the outer helper, the proven inner pair still inlines', () => {
        const input =
        "class Exchange {\n" +
        "    safeString (a: any, b: string): string | undefined { return a; }\n" +
        "    main (item: any, symbol: any) {\n" +
        "        const fromId = this.safeString (item, 'from');\n" +
        "        if (fromId === undefined) { throw new Error ('x'); }\n" +
        "        return fromId + '_' + symbol;\n" +
        "    }\n" +
        "}\n";
        const output = squash(transpiler.transpileGo(input).content);
        expect(output).toContain('return Add(*fromId+"_", symbol)');
    });
    test('a *string local reassigned a string literal converts the write and stays *string', () => {
        const input =
        "class Exchange {\n" +
        "    safeString (a: any, b: string): string | undefined { return a; }\n" +
        "    main (item: any) {\n" +
        "        let fromId = this.safeString (item, 'from');\n" +
        "        fromId = 'override';\n" +
        "        return fromId + '_';\n" +
        "    }\n" +
        "}\n";
        const output = squash(transpiler.transpileGo(input).content);
        expect(output).toContain('var fromId *string = this.SafeString(item, "from")');
        expect(output).toContain('fromId = SafeStringPtr("override")');
    });
    test('a pointer local written a nil keeps its pointer type; a non-string write still rejects', () => {
        const input =
        "class Exchange {\n" +
        "    safeString (a: any, b: string): string | undefined { return a; }\n" +
        "    safeInteger (a: any, b: string): number | undefined { return a; }\n" +
        "    main (item: any) {\n" +
        "        let ts = this.safeInteger (item, 'ts');\n" +
        "        ts = undefined;\n" +
        "        let side = this.safeString (item, 'side');\n" +
        "        side = 1;\n" +
        "        return [ts, side];\n" +
        "    }\n" +
        "}\n";
        const output = squash(transpiler.transpileGo(input).content);
        expect(output).toContain('var ts *int64 = this.SafeInteger(item, "ts")');
        expect(output).toContain('ts = nil');
        expect(output).toContain('var side any = this.SafeString(item, "side")');
    });
    test('a narrowed *int64 leaf adds natively (Add keeps int64 in, int64 out)', () => {
        const input =
        "class Exchange {\n" +
        "    safeInteger (a: any, b: string): number | undefined { return a; }\n" +
        "    main (item: any) {\n" +
        "        const expiry = this.safeInteger (item, 'expiry');\n" +
        "        if (expiry !== undefined) {\n" +
        "            return expiry + 1;\n" +
        "        }\n" +
        "        return expiry;\n" +
        "    }\n" +
        "}\n";
        const output = squash(transpiler.transpileGo(input).content);
        expect(output).toContain('return *expiry + 1');
    });
    test('a *int64 leaf without a non-nil proof keeps Add (the nil branch is reachable)', () => {
        const input =
        "class Exchange {\n" +
        "    safeInteger (a: any, b: string): number | undefined { return a; }\n" +
        "    main (item: any) {\n" +
        "        const expiry = this.safeInteger (item, 'expiry');\n" +
        "        const count = this.count (item);\n" +
        "        return [expiry + 1, count + 2];\n" +
        "    }\n" +
        "    count (item: any): number { return item; }\n" +
        "}\n";
        const output = squash(transpiler.transpileGo(input).content);
        expect(output).toContain('Add(expiry, 1)');
        expect(output).toContain('Add(count, 2)');
    });
    test('a *string local typed by a non-nilable overload needs no guard at all', () => {
        const input =
        "class Exchange {\n" +
        "    safeString2 (a: any, b: string, c: string): string { return c; }\n" +
        "    uuid (): string { return 'x'; }\n" +
        "    main (params: any, other: any) {\n" +
        "        const type = this.safeString2 (params, 'type', 'future');\n" +
        "        return type + '_' + this.uuid ();\n" +
        "    }\n" +
        "}\n";
        const output = squash(transpiler.transpileGo(input).content);
        expect(output).toContain('var typeVar *string = this.SafeString2(params, "type", "future")');
        expect(output).toContain('return *typeVar + "_" + this.Uuid()');
        expect(output).not.toContain('Add(');
    });
});

// helper-family removal: a hand-written BaseExchange field declared plain `string`
// (go/v4/exchange.go) is a non-nil Go string whatever its TypeScript annotation says,
// and a parameter the signature printer types with a Go scalar is that scalar at
// every use — both are operands the concat rule consumes.
describe('go string concat operands -> declared Go string', () => {
    const squash = (output: string) => output.replace(/[\t ]+/g, ' ');
    test('a `string | undefined` BaseExchange field prints as a non-nil Go string', () => {
        const input =
        "class Exchange {\n" +
        "    version: string | undefined = undefined;\n" +
        "    f () {\n" +
        "        const u = this.version + '/';\n" +
        "        return u;\n" +
        "    }\n" +
        "}\n";
        const output = squash(transpiler.transpileGo(input).content);
        expect(output).toContain('var u string = this.Version + "/"');
        expect(output).not.toContain('Add(');
    });
    test('every hand-written string field in the table concats natively', () => {
        const input =
        "class Exchange {\n" +
        "    name: string | undefined = undefined;\n" +
        "    hostname: string | undefined = undefined;\n" +
        "    userAgent: string | undefined = undefined;\n" +
        "    url: string | undefined = undefined;\n" +
        "    f () {\n" +
        "        return this.name + ':' + 'x' + this.hostname + this.userAgent + this.url;\n" +
        "    }\n" +
        "}\n";
        const output = squash(transpiler.transpileGo(input).content);
        expect(output).toContain('return this.Name + ":" + "x" + this.Hostname + this.UserAgent + this.Url');
        expect(output).not.toContain('Add(');
    });
    test('a field the Go struct declares `interface{}` keeps the helper', () => {
        const input =
        "class Exchange {\n" +
        "    token: string | undefined = undefined;\n" +
        "    f () {\n" +
        "        return this.token + ':';\n" +
        "    }\n" +
        "}\n";
        const output = squash(transpiler.transpileGo(input).content);
        expect(output).toContain('return Add(this.Token, ":")');
    });
    test('the credential fields gb09 declared `string` concat natively', () => {
        const input =
        "class Exchange {\n" +
        "    apiKey: string | undefined = undefined;\n" +
        "    secret: string | undefined = undefined;\n" +
        "    uid: string | undefined = undefined;\n" +
        "    password: string | undefined = undefined;\n" +
        "    accountId: string | undefined = undefined;\n" +
        "    privateKey: string | undefined = undefined;\n" +
        "    walletAddress: string | undefined = undefined;\n" +
        "    f () {\n" +
        "        return this.apiKey + ':' + this.secret + this.uid + this.password + this.accountId + this.privateKey + this.walletAddress;\n" +
        "    }\n" +
        "}\n";
        const output = squash(transpiler.transpileGo(input).content);
        expect(output).toContain('return this.ApiKey + ":" + this.Secret + this.Uid + this.Password + this.AccountId + this.PrivateKey + this.WalletAddress');
        expect(output).not.toContain('Add(');
    });
    test('a local initialised from a credential field keeps the field string', () => {
        const input =
        "class Exchange {\n" +
        "    apiKey: string | undefined = undefined;\n" +
        "    f () {\n" +
        "        const k = this.name;\n" +
        "        return k + this.apiKey;\n" +
        "    }\n" +
        "}\n";
        const output = squash(transpiler.transpileGo(input).content);
        expect(output).toContain('var k string = this.Name');
        expect(output).toContain('return k + this.ApiKey');
    });
    test('a parameter the signature printer types `string` is a concat operand', () => {
        const inst = new Transpiler({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 } } });
        // the typed-param families re-type selected params at the signature, which is
        // the same oracle the operand classifier reads back here
        const printer: any = inst.goTranspiler;
        const upstream = printer.printParameterType;
        printer.printParameterType = function (node) {
            return (node?.name?.text === 'symbol') ? 'string' : upstream.call(this, node);
        };
        const input =
        "class Exchange {\n" +
        "    f (symbol: any) {\n" +
        "        const id = symbol + '-';\n" +
        "        return id;\n" +
        "    }\n" +
        "}\n";
        const output = squash(inst.transpileGo(input).content);
        expect(output).toContain('func (this *Exchange) F(symbol string) any {');
        expect(output).toContain('var id string = symbol + "-"');
        expect(output).not.toContain('Add(');
    });
    test('an `any` parameter keeps the helper', () => {
        const input =
        "class Exchange {\n" +
        "    f (symbol: any) {\n" +
        "        const id = symbol + '-';\n" +
        "        return id;\n" +
        "    }\n" +
        "}\n";
        const output = squash(transpiler.transpileGo(input).content);
        expect(output).toContain('var id any = Add(symbol, "-")');
    });
    test('a hand-written string-returning helper call is a concat operand', () => {
        const input =
        "class Exchange {\n" +
        "    urlencodeNested (x: any): string { return ''; }\n" +
        "    f (params: any) {\n" +
        "        const u = '?' + this.urlencodeNested (params);\n" +
        "        return u;\n" +
        "    }\n" +
        "}\n";
        const output = squash(transpiler.transpileGo(input).content);
        expect(output).toContain('var u string = "?" + this.UrlencodeNested(params)');
        expect(output).not.toContain('Add(');
    });
});

// helper-family removal: the hand-written SafeString-family methods (go/v4/exchange_safe.go)
// return a fresh non-nil *string whenever the call passes a non-nil default (the value
// branch takes the found string's address, the default branch ToString(default)'s), so a
// local every write of which is such a call may be deref'd where the checker offers no
// narrowing. Any other write, a missing default or a non-literal default keeps Add.
describe('go string concat operands -> defaulted SafeString locals', () => {
    const squash = (output: string) => output.replace(/[\t ]+/g, ' ');
    const local = (input: string) =>
        "class Exchange {\n" +
        "    safeString (a: any, b: string, c: any): string | undefined { return a; }\n" +
        "    safeString2 (a: any, b: string, c: string, d: any): string | undefined { return a; }\n" +
        "    main (item: any, other: any) {\n" + input +
        "    }\n" +
        "}\n";
    test('a literal default makes the local derefable', () => {
        const output = squash(transpiler.transpileGo(local(
            "        const fromId = this.safeString (item, 'from', 'x');\n" +
            "        return fromId + '_' + 'ok';\n")).content);
        expect(output).toContain('var fromId string = *this.SafeString(item, "from", "x")');
        expect(output).toContain('return fromId + "_" + "ok"');
        expect(output).not.toContain('Add(');
    });
    test('a missing default keeps the helper call', () => {
        const output = squash(transpiler.transpileGo(local(
            "        const fromId = this.safeString (item, 'from');\n" +
            "        return fromId + '_' + 'ok';\n")).content);
        expect(output).toContain('return Add(Add(fromId, "_"), "ok")');
    });
    test('the default has to be a literal: an argument operand keeps the helper', () => {
        const output = squash(transpiler.transpileGo(local(
            "        const fromId = this.safeString (item, 'from', other);\n" +
            "        return fromId + '_' + 'ok';\n")).content);
        expect(output).toContain('return Add(Add(fromId, "_"), "ok")');
    });
    test('the default has to fit the arity: a three-argument safeString2 keeps the helper', () => {
        const output = squash(transpiler.transpileGo(local(
            "        const fromId = this.safeString2 (item, 'from', 'x');\n" +
            "        return fromId + '_' + 'ok';\n")).content);
        expect(output).toContain('return Add(Add(fromId, "_"), "ok")');
    });
    test('a reassignment to a non-defaulted call keeps the helper call', () => {
        const output = squash(transpiler.transpileGo(local(
            "        let fromId = this.safeString (item, 'from', 'x');\n" +
            "        fromId = this.safeString (item, 'other');\n" +
            "        return fromId + '_' + 'ok';\n")).content);
        expect(output).toContain('fromId = this.SafeString(item, "other")');
        expect(output).toContain('return Add(Add(fromId, "_"), "ok")');
    });
    test('a reassignment to another defaulted call stays derefable', () => {
        const output = squash(transpiler.transpileGo(local(
            "        let fromId = this.safeString (item, 'from', 'x');\n" +
            "        fromId = this.safeString (item, 'other', 'y');\n" +
            "        return fromId + '_' + 'ok';\n")).content);
        expect(output).toContain('fromId = *this.SafeString(item, "other", "y")');
        expect(output).toContain('return fromId + "_" + "ok"');
        expect(output).not.toContain('Add(');
    });
    test('two defaulted locals deref on both sides of the operator', () => {
        const output = squash(transpiler.transpileGo(local(
            "        const first = this.safeString (item, 'a', 'x');\n" +
            "        const second = this.safeString (other, 'b', 'y');\n" +
            "        return first + ':' + second;\n")).content);
        expect(output).toContain('return first + ":" + second');
        expect(output).not.toContain('Add(');
    });
    test('a defaulted call inline in the expression is derefable too', () => {
        const output = squash(transpiler.transpileGo(local(
            "        return this.safeString (item, 'from', 'x') + '_' + 'ok';\n")).content);
        expect(output).toContain('return *this.SafeString(item, "from", "x") + "_" + "ok"');
        expect(output).not.toContain('Add(');
    });
    test('an undefaulted call inline keeps the helper call', () => {
        const output = squash(transpiler.transpileGo(local(
            "        return this.safeString (item, 'from') + '_' + 'ok';\n")).content);
        expect(output).toContain('return Add(Add(this.SafeString(item, "from"), "_"), "ok")');
    });
});

describe('go ternary func literal typing', () => {
    // Ternary(c, a, b) prints as the lazy func literal; when both arms print as one and
    // the same Go scalar the literal names it (`func() string`), so the value leaves the
    // literal untyped-free instead of boxed in `any`. A pointer/`any`/mixed pair, or two
    // arms of a non-scalar type, keeps the `any` box.
    const inst = new Transpiler({ verbose: false, go: { parser: { NUM_LINES_END_FILE: 0 } } });
    const ternaryGo = (ts: string) => inst.transpileGo(ts).content;

    test('both arms string literals name the type on the literal and on the declaration', () => {
        const input =
        "function f (a: boolean) {\n" +
        "    const b = a ? 'x' : 'y';\n" +
        "    return b;\n" +
        "}\n";
        const output = ternaryGo(input);
        expect(output).toContain("\tvar b string = func() string {\n\t\tif EvalTruthy(a) {\n\t\t\treturn \"x\"\n\t\t}\n\t\treturn \"y\"\n\t}()");
        expect(output).not.toContain('Ternary(');
    });
    test('two arms of one declared local type stay typed', () => {
        const input =
        "function f (a: boolean) {\n" +
        "    let x: string = 'p';\n" +
        "    let y: string = 'q';\n" +
        "    const b = a ? x : y;\n" +
        "    return b;\n" +
        "}\n";
        const output = ternaryGo(input);
        expect(output).toContain("\tvar b string = func() string {\n\t\tif EvalTruthy(a) {\n\t\t\treturn x\n\t\t}\n\t\treturn y\n\t}()");
    });
    test('a bool pair prints func() bool', () => {
        const input =
        "function f (a: boolean, c: any) {\n" +
        "    const b = a ? true : (c === 1);\n" +
        "    return b;\n" +
        "}\n";
        const output = ternaryGo(input);
        expect(output).toContain("\tvar b bool = func() bool {\n\t\tif EvalTruthy(a) {\n\t\t\treturn true\n\t\t}\n\t\treturn (IsEqual(c, 1))\n\t}()");
    });
    test('an int64 pair from two typed calls prints func() int64', () => {
        const input =
        "class T {\n" +
        "    milliseconds (): number { return 1; }\n" +
        "    seconds (): number { return 2; }\n" +
        "    f (a: boolean) {\n" +
        "        const b = a ? this.milliseconds() : this.seconds();\n" +
        "        return b;\n" +
        "    }\n" +
        "}\n";
        const output = ternaryGo(input);
        expect(output).toContain("\tvar b int64 = func() int64 {\n\t\tif EvalTruthy(a) {\n\t\t\treturn this.Milliseconds()\n\t\t}\n\t\treturn this.Seconds()\n\t}()");
    });
    test('a nested literal is parenthesised and keeps its own type', () => {
        const input =
        "function f (a: boolean, c: boolean) {\n" +
        "    const b = a ? (c ? 'x' : 'y') : 'z';\n" +
        "    return b;\n" +
        "}\n";
        const output = ternaryGo(input);
        expect(output).toContain("\tvar b string = func() string {\n\t\tif EvalTruthy(a) {\n\t\t\treturn (func() string {");
        expect(output).not.toContain('Ternary(');
    });
    test('a call argument and a map value print the typed literal', () => {
        const call =
        "class T {\n" +
        "    f (a: boolean): any {\n" +
        "        return a ? 'x' : 'y';\n" +
        "    }\n" +
        "}\n";
        expect(ternaryGo(call)).toContain("\treturn func() string {\n\t\tif EvalTruthy(a) {\n\t\t\treturn \"x\"\n\t\t}\n\t\treturn \"y\"\n\t}()");
        const map =
        "function f (a: boolean) {\n" +
        "    return { 'k': a ? 'x' : 'y' };\n" +
        "}\n";
        expect(ternaryGo(map)).toContain("\t\t\"k\": func() string {");
    });
    test('arms of a non-scalar type keep the any box', () => {
        const input =
        "function f (a: boolean) {\n" +
        "    const b = a ? { 'k': 1 } : { 'k': 2 };\n" +
        "    return b;\n" +
        "}\n";
        const output = ternaryGo(input);
        expect(output).toContain("\tvar b any = func() any {\n\t\tif EvalTruthy(a) {\n\t\t\treturn map[string]any{");
        expect(output).not.toContain('func() map[string]any');
    });
    test('an arm the printer cannot type keeps the any box', () => {
        const input =
        "function f (a: boolean, c: any) {\n" +
        "    const b = a ? 'x' : c;\n" +
        "    return b;\n" +
        "}\n";
        const output = ternaryGo(input);
        expect(output).toContain("\tvar b any = func() any {\n\t\tif EvalTruthy(a) {\n\t\t\treturn \"x\"\n\t\t}\n\t\treturn c\n\t}()");
        expect(output).not.toContain('func() string');
    });
    test('an arm that is an any-returning helper call keeps the any box', () => {
        // `Subtract(now, year)` returns `any`: a classifier may know the box holds an
        // int64, but a `return` cannot carry that name — only the printer's own
        // signature table (ToUpper, this.Seconds, ParseInt, …) proves a static type
        const input =
        "class T {\n" +
        "    seconds (): number { return 1; }\n" +
        "    f (a: boolean) {\n" +
        "        const year = 31104000;\n" +
        "        const now = this.seconds();\n" +
        "        const start = a ? (now - year) : 1;\n" +
        "        return start;\n" +
        "    }\n" +
        "}\n";
        const output = ternaryGo(input);
        expect(output).toContain("var start any = func() any {");
        expect(output).toContain("return (Subtract(now, year))");
    });
    test('a later write of another type demotes the declaration back to any', () => {
        const input =
        "function f (a: boolean, c: any) {\n" +
        "    let b = a ? 'x' : 'y';\n" +
        "    b = c;\n" +
        "    return b;\n" +
        "}\n";
        const output = ternaryGo(input);
        expect(output).toContain("\tvar b any = func() string {");
        expect(output).toContain("\tb = c\n");
    });
});

describe('go IsEqual(x, nil) on an any local whose every write is a non-pointer source', () => {
    // an implicit-API endpoint: TS never implements the method, the endpoint generator
    // does, and its Go body is the `<-chan any` wrapper over callEndpointAsync
    const endpointInterface =
        "interface Test {\n" +
        "    publicGetTime (params?: {}): Promise<any>;\n" +
        "}\n";
    test('a local only ever assigned endpoint awaits and undefined compares natively', () => {
        const input = endpointInterface +
            "class Test {\n" +
            "    async f (params: any) {\n" +
            "        let response: any = undefined;\n" +
            "        if (params['type'] !== undefined) {\n" +
            "            response = await this.publicGetTime (params);\n" +
            "        }\n" +
            "        if (response === undefined) {\n" +
            "            return 1;\n" +
            "        }\n" +
            "        if (response !== undefined) {\n" +
            "            return response;\n" +
            "        }\n" +
            "        return 2;\n" +
            "    }\n" +
            "}";
        const output = transpiler.transpileGo(input).content;
        expect(output).toContain("if response == nil {");
        expect(output).toContain("if response != nil {");
        expect(output).not.toContain("IsEqual(response, nil)");
    });
    test('a local assigned a JSON parse and an object literal compares natively', () => {
        const input =
            "class Test {\n" +
            "    f (raw: any) {\n" +
            "        let fetchData: any = undefined;\n" +
            "        if (raw) {\n" +
            "            fetchData = { 'response': undefined };\n" +
            "            fetchData = this.parseJson (raw);\n" +
            "        }\n" +
            "        if (fetchData !== undefined) {\n" +
            "            return fetchData;\n" +
            "        }\n" +
            "        return 1;\n" +
            "    }\n" +
            "}";
        const output = transpiler.transpileGo(input).content;
        expect(output).toContain("if fetchData != nil {");
        expect(output).not.toContain("IsEqual(fetchData, nil)");
    });
    test('an await of a method TypeScript implements keeps the helper', () => {
        const input =
            "class Test {\n" +
            "    async fetchTime (params: any) {\n" +
            "        return this.safeInteger (params, 'serverTime');\n" +
            "    }\n" +
            "    async f (params: any) {\n" +
            "        let response: any = undefined;\n" +
            "        response = await this.fetchTime (params);\n" +
            "        if (response === undefined) {\n" +
            "            return 1;\n" +
            "        }\n" +
            "        return response;\n" +
            "    }\n" +
            "}";
        const output = transpiler.transpileGo(input).content;
        expect(output).toContain("IsEqual(response, nil)");
    });
    test('a destructuring write of an unproven call keeps the helper', () => {
        const input =
            "class Test {\n" +
            "    handleOptionAndParams (params: any, a: any, b: any) { return [ a, params ]; }\n" +
            "    f (params: any) {\n" +
            "        let value: any = undefined;\n" +
            "        [ value, params ] = this.handleOptionAndParams (params, 'a', 'b');\n" +
            "        if (value !== undefined) {\n" +
            "            return value;\n" +
            "        }\n" +
            "        return 1;\n" +
            "    }\n" +
            "}";
        const output = transpiler.transpileGo(input).content;
        expect(output).toContain("IsEqual(value, nil)");
    });
    test('a GetValue or SafeList write keeps the helper', () => {
        const input =
            "class Test {\n" +
            "    f (item: any, rows: any) {\n" +
            "        let response: any = undefined;\n" +
            "        response = GetValue (rows, 0);\n" +
            "        response = this.safeList (item, 'data', []);\n" +
            "        if (response !== undefined) {\n" +
            "            return response;\n" +
            "        }\n" +
            "        return 1;\n" +
            "    }\n" +
            "}";
        const output = transpiler.transpileGo(input).content;
        expect(output).toContain("IsEqual(response, nil)");
    });
    test('a parameter compared with undefined keeps the helper', () => {
        const input =
            "class Test {\n" +
            "    f (params: any, since: any) {\n" +
            "        if (since !== undefined) {\n" +
            "            params['startTime'] = since;\n" +
            "        }\n" +
            "        return params;\n" +
            "    }\n" +
            "}";
        const output = transpiler.transpileGo(input).content;
        expect(output).toContain("IsEqual(since, nil)");
    });
});

describe('go native element assignment on a hand-written container field', () => {
    // the printer indents nested call expressions; gofmt collapses that downstream
    const squash = (output: string) => output.replace(/ +/g, ' ');
    test('a map field assigns through a native index', () => {
        const input =
        "class Exchange {\n" +
        "    main() {\n" +
        "        this.has['a'] = 1;\n" +
        "        return this.has;\n" +
        "    }\n" +
        "}\n";
        const output = squash(transpiler.transpileGo(input).content);
        expect(output).toContain("this.Has[\"a\"] = 1");
        expect(output).not.toContain("AddElementToObject");
    });
    test('a sync.Map field assigns through Store', () => {
        const input =
        "class Exchange {\n" +
        "    main() {\n" +
        "        this.transactions['a'] = 1;\n" +
        "        return this.options;\n" +
        "    }\n" +
        "}\n";
        const output = squash(transpiler.transpileGo(input).content);
        expect(output).toContain("this.Transactions.Store(\"a\", 1)");
        expect(output).not.toContain("AddElementToObject");
    });
    test('a sync.Map field with a string-typed local key assigns through Store', () => {
        const input =
        "class Exchange {\n" +
        "    main() {\n" +
        "        const k = 'x';\n" +
        "        this.transactions[k] = 1;\n" +
        "        return this.transactions;\n" +
        "    }\n" +
        "}\n";
        const output = squash(transpiler.transpileGo(input).content);
        expect(output).toContain("var k string = \"x\"");
        expect(output).toContain("this.Transactions.Store(k, 1)");
        expect(output).not.toContain("AddElementToObject");
    });
    test('a sync.Map field with an unproven key stays on the helper', () => {
        const input =
        "class Exchange {\n" +
        "    main(key) {\n" +
        "        this.options[key] = 1;\n" +
        "        return this.options;\n" +
        "    }\n" +
        "}\n";
        const output = squash(transpiler.transpileGo(input).content);
        expect(output).toContain("AddElementToObject(this.Options, key, 1)");
    });
    test('a field declared any stays on the helper: Go cannot index an interface', () => {
        const input =
        "class Exchange {\n" +
        "    main() {\n" +
        "        this.urls['a'] = 1;\n" +
        "        this.balance['b'] = 2;\n" +
        "        return this.urls;\n" +
        "    }\n" +
        "}\n";
        const output = squash(transpiler.transpileGo(input).content);
        expect(output).toContain("AddElementToObject(this.Urls, \"a\", 1)");
        expect(output).toContain("AddElementToObject(this.Balance, \"b\", 2)");
    });
    test('a compound assignment on a sync.Map field stays on the helper', () => {
        const input =
        "class Exchange {\n" +
        "    main() {\n" +
        "        this.transactions['a'] += 1;\n" +
        "        return this.options;\n" +
        "    }\n" +
        "}\n";
        const output = squash(transpiler.transpileGo(input).content);
        expect(output).toContain("AddElementToObject(this.Transactions, \"a\", Add(GetValue(this.Transactions, \"a\"), 1))");
    });
    test('the field table never types a local of the same name', () => {
        const input =
        "class Exchange {\n" +
        "    main() {\n" +
        "        const options = {};\n" +
        "        options['a'] = 1;\n" +
        "        return options;\n" +
        "    }\n" +
        "}\n";
        const output = squash(transpiler.transpileGo(input).content);
        expect(output).toContain("var options map[string]any = map[string]any{}");
        expect(output).toContain("options[\"a\"] = 1");
        expect(output).not.toContain("options.Store(");
    });
});

// `x.push(v)` on a local the printer declared `[]any` prints the native
// `x = append(x, v)`; every other receiver keeps AppendToArray(&x, v), which needs the
// local to stay an `any` box (a *[]any does not fit the helper's *any parameter).
describe('go .push -> append on a declared []any local', () => {
    test('a statement push on an array-literal local appends natively', () => {
        const input =
        "class Test {\n" +
        "    f (a: any) {\n" +
        "        const x = []\n" +
        "        x.push (a)\n" +
        "        return x\n" +
        "    }\n" +
        "}";
        const output = transpiler.transpileGo(input).content;
        expect(output).toContain("var x []any = []any{}");
        expect(output).toContain("x = append(x, a)");
        expect(output).not.toContain("AppendToArray(");
    });
    test('a push feeding an awaited promiseAll local appends natively', () => {
        const input =
        "class Test {\n" +
        "    async fetchOne (s: string): Promise<any> { return {}; }\n" +
        "    async f (symbols: string[]) {\n" +
        "        const promises = [];\n" +
        "        for (let i = 0; i < symbols.length; i++) {\n" +
        "            promises.push (this.fetchOne (symbols[i]));\n" +
        "        }\n" +
        "        const results = await Promise.all (promises);\n" +
        "        return results;\n" +
        "    }\n" +
        "}";
        const output = transpiler.transpileGo(input).content;
        expect(output).toContain("var promises []any = []any{}");
        expect(output).toContain("promises = append(promises, this.FetchOne(GetValue(symbols, i)))");
        expect(output).toContain("results := (<-promiseAll(promises))");
    });
    test('a later write of a different type keeps the box and the helper', () => {
        const input =
        "class Test {\n" +
        "    f (a: any) {\n" +
        "        let x = []\n" +
        "        x.push (a)\n" +
        "        x = this.parseJson (a)\n" +
        "        return x\n" +
        "    }\n" +
        "}";
        const output = transpiler.transpileGo(input).content;
        expect(output).toContain("var x any = []any{}");
        expect(output).toContain("AppendToArray(&x, a)");
    });
    test('a push whose value is read keeps the box and the helper', () => {
        const input =
        "class Test {\n" +
        "    f (a: any) {\n" +
        "        const x = []\n" +
        "        const n = x.push (a)\n" +
        "        return n\n" +
        "    }\n" +
        "}";
        const output = transpiler.transpileGo(input).content;
        expect(output).toContain("var x any = []any{}");
        expect(output).toContain("AppendToArray(&x, a)");
    });
    test('a spread push keeps the box and the helper', () => {
        const input =
        "class Test {\n" +
        "    f (a: any) {\n" +
        "        const x = []\n" +
        "        x.push (a)\n" +
        "        x.push (...a)\n" +
        "        return x\n" +
        "    }\n" +
        "}";
        const output = transpiler.transpileGo(input).content;
        expect(output).toContain("var x any = []any{}");
        expect(output).toContain("AppendToArray(&x, a)");
    });
    test('a push onto a []string local appends natively', () => {
        const input =
        "class Test {\n" +
        "    f (market: string) {\n" +
        "        const parts = market.split ('/')\n" +
        "        parts.push ('x')\n" +
        "        return parts\n" +
        "    }\n" +
        "}";
        const output = transpiler.transpileGo(input).content;
        expect(output).toContain("var parts []string = Split(market, \"/\")");
        expect(output).toContain("parts = append(parts, \"x\")");
    });
    test('a push of a nilable string keeps the []string local boxed', () => {
        const input =
        "class Test {\n" +
        "    safeString (a, b) { return undefined; }\n" +
        "    f (market: string) {\n" +
        "        const parts = market.split ('/')\n" +
        "        const id = this.safeString (market, 'id')\n" +
        "        parts.push (id)\n" +
        "        return parts\n" +
        "    }\n" +
        "}";
        const output = transpiler.transpileGo(input).content;
        expect(output).toContain("var parts any = Split(market, \"/\")");
        expect(output).toContain("AppendToArray(&parts, id)");
    });
    test('a string[] literal built by push stays []string and appends natively', () => {
        const input =
        "class Test {\n" +
        "    f (row: any) {\n" +
        "        const ids: string[] = []\n" +
        "        for (let i = 0; i < 3; i++) {\n" +
        "            const id = 'id' + i.toString ()\n" +
        "            ids.push (id)\n" +
        "        }\n" +
        "        for (let i = 0; i < ids.length; i++) {\n" +
        "            if (ids[i] === 'id1') { return i; }\n" +
        "        }\n" +
        "        return -1\n" +
        "    }\n" +
        "}";
        const output = transpiler.transpileGo(input).content;
        expect(output).toContain("var ids []string = []string{}");
        expect(output).toContain("ids = append(ids, id)");
    });
    test('a push onto a parameter keeps the helper', () => {
        const input =
        "class Test {\n" +
        "    f (a: any) {\n" +
        "        a.push (1)\n" +
        "    }\n" +
        "}";
        const output = transpiler.transpileGo(input).content;
        expect(output).toContain("AppendToArray(&a, 1)");
    });
});

// ToString is the identity on a Go string (go/v4/exchange_helpers.go: derefScalar leaves a
// string alone and its `case string` returns it unchanged), so a receiver the printer
// declares `string` prints as itself; every other receiver keeps the helper.
describe('go ToString -> the receiver when it is a declared string', () => {
    test('a string-typed local prints bare', () => {
        const ts =
        "class Test {\n" +
        "    f () {\n" +
        "        const id = 'x';\n" +
        "        return id.toString ();\n" +
        "    }\n" +
        "}";
        const output = transpiler.transpileGo(ts).content;
        expect(output).toContain('var id string = "x"\n\treturn id\n}');
        expect(output).not.toContain('ToString(');
    });
    test('a local initialised from a string-returning helper prints bare', () => {
        const ts =
        "class Test {\n" +
        "    f (a: any) {\n" +
        "        const id = a.toUpperCase ();\n" +
        "        return id.toString ();\n" +
        "    }\n" +
        "}";
        const output = transpiler.transpileGo(ts).content;
        expect(output).toContain('var id string = ToUpper(a)\n\treturn id\n}');
        expect(output).not.toContain('ToString(');
    });
    test('a string literal receiver prints bare', () => {
        const ts =
        "class Test {\n" +
        "    f () {\n" +
        "        return 'x'.toString ();\n" +
        "    }\n" +
        "}";
        const output = transpiler.transpileGo(ts).content;
        expect(output).toContain('return "x"');
        expect(output).not.toContain('ToString(');
    });
    test('the inlined call still classifies its declaration as a string', () => {
        const ts =
        "class Test {\n" +
        "    f (a: any) {\n" +
        "        const id = 'x';\n" +
        "        const idString = id.toString ();\n" +
        "        return idString.length;\n" +
        "    }\n" +
        "}";
        const output = transpiler.transpileGo(ts).content;
        expect(output).toContain('var idString string = id');
        expect(output).not.toContain('ToString(');
    });
    test('an inlined call inside a concat chain keeps the chain native', () => {
        const ts =
        "class Test {\n" +
        "    f (a: any) {\n" +
        "        const id = 'x';\n" +
        "        return 'id: ' + id.toString ();\n" +
        "    }\n" +
        "}";
        const output = transpiler.transpileGo(ts).content;
        expect(output).toContain('return "id: " + id');
        expect(output).not.toContain('ToString(');
    });
    test('a chained helper receiver prints bare', () => {
        const ts =
        "class Test {\n" +
        "    f (a: any) {\n" +
        "        return a.toUpperCase ().toString ();\n" +
        "    }\n" +
        "}";
        const output = transpiler.transpileGo(ts).content;
        expect(output).toContain('return ToUpper(a)');
        expect(output).not.toContain('ToString(');
    });
    test('an any-typed local keeps the helper', () => {
        const ts =
        "class Test {\n" +
        "    f (a: any) {\n" +
        "        const id = GetValue (a, 0);\n" +
        "        return id.toString ();\n" +
        "    }\n" +
        "}";
        const output = transpiler.transpileGo(ts).content;
        expect(output).toContain('var id any = GetValue(a, 0)');
        expect(output).toContain('return ToString(id)');
    });
    test('an int-typed local prints strconv.Itoa', () => {
        const ts =
        "class Test {\n" +
        "    f (a: any) {\n" +
        "        const keys = Object.keys (a);\n" +
        "        const n = keys.length;\n" +
        "        return n.toString ();\n" +
        "    }\n" +
        "}";
        const output = transpiler.transpileGo(ts).content;
        expect(output).toContain('var n int = len(keys)');
        // the helper's `case int` arm is Sprintf("%d"), i.e. Itoa
        expect(output).toContain('return strconv.Itoa(n)');
        expect(output).toContain('import "strconv"');
    });
    test('an int64-typed local prints strconv.FormatInt', () => {
        const ts =
        "class Test {\n" +
        "    f (a: any) {\n" +
        "        const n = parseInt (a, 10);\n" +
        "        return n.toString ();\n" +
        "    }\n" +
        "}";
        const output = transpiler.transpileGo(ts).content;
        expect(output).toContain('var n int64 = ParseInt(a, 10)');
        expect(output).toContain('import "strconv"');
        expect(output).toContain('return strconv.FormatInt(n, 10)');
    });
    test('a float64-typed local keeps the helper', () => {
        const ts =
        "class Test {\n" +
        "    f (a: any) {\n" +
        "        const n = Math.floor (a);\n" +
        "        return n.toString ();\n" +
        "    }\n" +
        "}";
        const output = transpiler.transpileGo(ts).content;
        expect(output).toContain('var n float64 = MathFloor(a)');
        expect(output).toContain('return ToString(n)');
    });
    test('a local written a non-string value later keeps the helper (D2)', () => {
        const ts =
        "class Test {\n" +
        "    f (a: any) {\n" +
        "        let id = 'x';\n" +
        "        id = GetValue (a, 0);\n" +
        "        return id.toString ();\n" +
        "    }\n" +
        "}";
        const output = transpiler.transpileGo(ts).content;
        expect(output).toContain('var id any = "x"');
        expect(output).toContain('return ToString(id)');
    });
});

describe('go native arithmetic result rows (Divide/Multiply/Subtract/Mod)', () => {
    // the printer indents nested call expressions; gofmt collapses that downstream
    const squash = (output: string) => output.replace(/[\t\n ]+/g, ' ');
    const body = (input: string) => {
        const output = squash(transpiler.transpileGo(input).content);
        const match = /func \(this \*Exchange\) Main\([^)]*\) any \{ (.*?)\}/.exec(output);
        return match ? match[1] : output;
    };
    const main = (statements: string) =>
        "class Exchange {\n" +
        "    milliseconds() { return 1; }\n" +
        "    safeValue(a, b) { return a; }\n" +
        "    main(value, other, arr, days) {\n" +
        statements +
        "    }\n" +
        "}\n";
    test('Mod of an int64 value and a nonzero literal uses %', () => {
        expect(body(main("        const rest = this.milliseconds() % 1000;\n        return rest;\n")))
            .toContain("var rest any = this.Milliseconds() % 1000");
    });
    test('Subtract/Multiply of a Go int value and a literal drop the helper outside a declaration', () => {
        expect(body(main("        return this.safeValue(arr, arr.length - 1);\n")))
            .toContain("this.SafeValue(arr, GetArrayLength(arr)-1)");
        expect(body(main("        return this.safeValue(arr, arr.length - 1);\n")))
            .not.toContain("Subtract(");
    });
    test('literal-only integer expressions fold to the operator', () => {
        expect(body(main("        return { 'a': 10 * 1000, 'b': 1440 * 3, 'c': 10 / 3 };\n")))
            .toContain("\"a\": 10 * 1000, \"b\": 1440 * 3, \"c\": float64(10) / 3");
    });
    test('float64 operands next to a float literal use the float operator', () => {
        expect(body(main("        const floor = Math.floor(value);\n        const half = floor * 2.5;\n        const less = floor - 0.5;\n        const part = floor / 2.5;\n        return [half, less, part];\n")))
            .toContain("var floor float64 = MathFloor(value) var half any = floor * 2.5 var less any = floor - 0.5 var part any = floor / 2.5");
    });
    test('a Mod literal divisor is required: a variable divisor keeps the helper', () => {
        expect(body(main("        const rest = this.milliseconds() % other;\n        return rest;\n")))
            .toContain("var rest any = Mod(this.Milliseconds(), other)");
    });
    test('a zero literal divisor keeps the helper, the operator would panic', () => {
        expect(body(main("        const rest = this.milliseconds() % 0;\n        return rest;\n")))
            .toContain("var rest any = Mod(this.Milliseconds(), 0)");
        expect(body(main("        return { 'a': 1 / 0 };\n"))).toContain("\"a\": Divide(1, 0)");
        expect(body(main("        return this.milliseconds() / 0;\n"))).toContain("Divide(this.Milliseconds(), 0)");
    });
    test('a declaration position keeps the call for the declared-local table', () => {
        expect(body(main("        const last = arr.length - 1;\n        const rest = arr.length % 7;\n        return [last, rest];\n")))
            .toContain("var last any = int64(GetArrayLength(arr)) - 1 var rest any = int64(GetArrayLength(arr)) % 7");
        expect(body(main("        const scaled = 10 * 1000;\n        return scaled;\n")))
            .toContain("var scaled any = 10 * 1000");
    });
    test('an int literal next to a float64 operand keeps the helper; two literals fold natively', () => {
        expect(body(main("        const floor = Math.floor(value);\n        const scaled = floor * 1000;\n        return scaled;\n")))
            .toContain("var scaled any = Multiply(floor, 1000)");
        expect(body(main("        return { 'a': 100 * 1.1, 'b': 5 * 1.67 };\n")))
            .toContain("\"a\": 100 * 1.1, \"b\": 5 * 1.67");
    });
    test('a literal product folds natively (exact Go constant); literal Subtract keeps the helper', () => {
        expect(body(main("        return { 'a': 2.5 * 1.5, 'b': 2.5 - 1.5, 'c': 7 * 24 * 60 };\n")))
            .toContain("\"a\": 2.5 * 1.5, \"b\": Subtract(2.5, 1.5), \"c\": (7 * 24) * 60");
    });
    test('int / int divides as float64 like JS', () => {
        expect(body(main("        return { 'cost': 20 / 15, 'b': 2 / 3 };\n")))
            .toContain("\"cost\": float64(20) / 15, \"b\": float64(2) / 3");
        expect(body(main("        const now = this.milliseconds();\n        const days = now / 86400000;\n        return days;\n")))
            .toContain("float64(now) / 86400000");
        expect(body(main("        const a = this.milliseconds();\n        const b = this.milliseconds() + 1;\n        const r = a / (b * 2);\n        return r;\n")))
            .toContain("Divide(a, (Multiply(b, 2)))");
        expect(body(main("        const floor = Math.floor(value);\n        return floor / 2.5;\n")))
            .toContain("floor / 2.5");
    });
    test('a float64 local receives int / int', () => {
        expect(body(main("        const ratio = 20 / 15;\n        return ratio;\n")))
            .toMatch(/var ratio (any|float64) = float64\(20\) \/ 15/);
    });
    test('float64 modulo keeps the helper: Go has no float operator', () => {
        expect(body(main("        const floor = Math.floor(value);\n        const rest = floor % 2.5;\n        return rest;\n")))
            .toContain("var rest any = Mod(floor, 2.5)");
    });
    test('float64 division by a float64 value keeps the helper: a zero divisor returns nil', () => {
        expect(body(main("        const a = Math.floor(value);\n        const b = Math.floor(other);\n        return a / b;\n")))
            .toContain("Divide(a, b)");
    });
    test('`any` operands keep every helper', () => {
        expect(body(main("        return [value * other, value - other, value / other, value % other];\n")))
            .toContain("[]any{Multiply(value, other), Subtract(value, other), Divide(value, other), Mod(value, other)");
    });
    test('a constant product too large for an exact int keeps the helper', () => {
        expect(body(main("        return { 'a': 1000000000000 * 1000000000000 };\n")))
            .toContain("Multiply(1000000000000, 1000000000000)");
    });
    test('int64 operands keep their existing native rows', () => {
        expect(body(main("        return this.milliseconds() - 1000;\n")))
            .toContain("return this.Milliseconds() - 1000");
        expect(body(main("        return this.milliseconds() % 1000;\n")))
            .toContain("return this.Milliseconds() % 1000");
    });
    test('two float64 operands take the operator: the helper float path is float64 arithmetic', () => {
        expect(body(main("        const a = Math.floor(value);\n        const b = Math.floor(other);\n        return a + b;\n")))
            .toContain("var a float64 = MathFloor(value) var b float64 = MathFloor(other) return a + b");
    });
    test('a float64 operand next to a float literal uses the float operator', () => {
        expect(body(main("        const a = Math.floor(value);\n        return a + 0.5;\n")))
            .toContain("return a + 0.5");
    });
    test('an int literal next to a float64 operand keeps the helper (frontend int path)', () => {
        expect(body(main("        const a = Math.floor(value);\n        return a + 1;\n")))
            .toContain("return Add(a, 1)");
    });
    test('two float literals keep the helper: Go folds them exactly, the helper rounds', () => {
        expect(body(main("        return { 'a': 2.5 + 1.5 };\n")))
            .toContain("\"a\": Add(2.5, 1.5)");
    });
});

describe('go native string operations (strings.*)', () => {
    // the helper takes `any` and re-derives the same string at runtime, so a proven Go string
    // operand can go straight to the stdlib call; the file-level print declares the import
    const nativeCalls = (output: string) => output.match(/strings\.[A-Za-z]+\(/g) ?? [];
    test('a declared string local receiver emits strings.Split and declares the package once', () => {
        const input =
        "function f () {\n" +
        "    const s: string = 'a,b';\n" +
        "    const parts = s.split(',');\n" +
        "    const other = s.split(';');\n" +
        "    return [ parts, other ];\n" +
        "}\n";
        const output = transpiler.transpileGo(input).content;
        expect(output).toContain('import "strings"');
        expect(output).toContain('var s string = "a,b"');
        // the declared []string the printer gives a Split-initialised local still holds
        expect(output).toContain('var parts []string = strings.Split(s, ",")');
        expect(output).toContain('strings.Split(s, ";")');
        expect(output.match(/import "strings"/g)?.length).toBe(1);
        expect(output).not.toMatch(/(?<![.\w])Split\(/);
    });
    test('a string literal receiver emits the stdlib call too', () => {
        const input = "function f () { return 'a-b'.split('-'); }\n";
        const output = transpiler.transpileGo(input).content;
        expect(output).toContain('strings.Split("a-b", "-")');
        expect(output).not.toMatch(/(?<![.\w])Split\(/);
    });
    test('join, upper/lower and the prefix/suffix predicates go native on proven strings', () => {
        const input =
        "function f () {\n" +
        "    const s: string = 'a-b';\n" +
        "    const parts = s.split('-');\n" +
        "    const joined = parts.join('|');\n" +
        "    const u = s.toUpperCase();\n" +
        "    const l = u.toLowerCase();\n" +
        "    const pre = s.startsWith('a');\n" +
        "    const suf = s.endsWith('b');\n" +
        "    return [ parts, joined, u, l, pre, suf ];\n" +
        "}\n";
        const output = transpiler.transpileGo(input).content;
        // a []string local: the helper would ToString every element of a []any, this receiver is typed
        expect(output).toContain('var parts []string = strings.Split(s, "-")');
        expect(output).toContain('var joined string = strings.Join(parts, "|")');
        expect(output).toContain('var u string = strings.ToUpper(s)');
        expect(output).toContain('var l string = strings.ToLower(u)');
        expect(output).toContain('strings.HasPrefix(s, "a")');
        expect(output).toContain('strings.HasSuffix(s, "b")');
        expect(output).not.toMatch(/(?<![.\w])(Join|ToUpper|ToLower|StartsWith|EndsWith)\(/);
    });

    test('toUpperCase on an asserted string receiver goes native only when the operand is a Go string', () => {
        const input =
            "class Base {\n" +
            "    createOrder (symbol: string, side: string) { return undefined; }\n" +
            "}\n" +
            "class Test extends Base {\n" +
            "    requestBody (side: string, other) {\n" +
            "        const request = { 'side': (side as string).toUpperCase (), 'o': (other as string).toUpperCase () };\n" +
            "        return request;\n" +
            "    }\n" +
            "    use () {\n" +
            "        return this.requestBody ('buy', {});\n" +
            "    }\n" +
            "}\n";
        const output = transpiler.transpileGo(input).content;
        expect(output).toContain('RequestBody(side string, other any)');
        expect(output).toContain('"side": strings.ToUpper(side)');
        expect(output).toContain('ToUpper(other)');
        expect(output).not.toContain('strings.ToUpper(other)');
    });

    test('toLowerCase on an asserted string receiver goes native only when the operand is a Go string', () => {
        const input =
            "class Base {\n" +
            "    createOrder (symbol: string, side: string) { return undefined; }\n" +
            "}\n" +
            "class Test extends Base {\n" +
            "    requestBody (side: string, other) {\n" +
            "        const request = { 'side': (side as string).toLowerCase (), 'o': (other as string).toLowerCase () };\n" +
            "        return request;\n" +
            "    }\n" +
            "    use () {\n" +
            "        return this.requestBody ('buy', {});\n" +
            "    }\n" +
            "}\n";
        const output = transpiler.transpileGo(input).content;
        expect(output).toContain('RequestBody(side string, other any)');
        expect(output).toContain('"side": strings.ToLower(side)');
        expect(output).toContain('ToLower(other)');
        expect(output).not.toContain('strings.ToLower(other)');
    });
    test('replace keeps JS first-occurrence semantics, replaceAll every occurrence', () => {
        const input =
        "function f () {\n" +
        "    const s: string = 'a-b-c';\n" +
        "    const first = s.replace('-', '_');\n" +
        "    const every = s.replaceAll('-', '_');\n" +
        "    return [ first, every ];\n" +
        "}\n";
        const output = transpiler.transpileGo(input).content;
        // the boxed helper cannot tell the two apart (ReplaceAll for every argument), so the
        // native pair is also the only emission that reproduces the TS source exactly
        expect(output).toContain('strings.Replace(s, "-", "_", 1)');
        expect(output).toContain('strings.ReplaceAll(s, "-", "_")');
        expect(output).not.toMatch(/(?<![.\w])Replace\(/);
    });
    test('a receiver the printer cannot prove as a Go string keeps the helper', () => {
        const input =
        "class Exchange {\n" +
        "    main (symbol) {\n" +
        "        const parts = symbol.split('-');\n" +
        "        const upper = symbol.toUpperCase();\n" +
        "        const pre = symbol.startsWith('a');\n" +
        "        return [ parts, upper, pre ];\n" +
        "    }\n" +
        "}\n";
        const output = transpiler.transpileGo(input).content;
        // a Go method parameter is printed `any`, so the operand holds an interface, not a string
        expect(output).toContain("func (this *Exchange) Main(symbol any) any {");
        expect(output).toContain('var parts []string = Split(symbol, "-")');
        expect(output).toContain('var upper string = ToUpper(symbol)');
        expect(output).toContain('StartsWith(symbol, "a")');
        expect(output).not.toContain('import "strings"');
    });
    test('a nilable *string receiver without a non-null promise keeps the split/upper/lower helper', () => {
        const input =
            "class Exchange {\n" +
            "    safeString(a, b) { return a; }\n" +
            "    main (item) {\n" +
            "        const a = this.safeString (item, 'a');\n" +
            "        const parts = a.split ('-');\n" +
            "        const up = a.toUpperCase ();\n" +
            "        const low = a.toLowerCase ();\n" +
            "        return [ parts, up, low ];\n" +
            "    }\n" +
            "}\n";
        const output = transpiler.transpileGo(input).content;
        // the helper answers nil / "" for a nil operand; nothing here proves `a` non-nil
        expect(output).toContain('var parts []string = Split(a, "-")');
        expect(output).toContain('ToUpper(a)');
        expect(output).toContain('ToLower(a)');
        expect(output).not.toContain('import "strings"');
    });
    test('an `as string` receiver of a nilable *string reads its pointee natively', () => {
        const input =
            "class Exchange {\n" +
            "    safeString(a, b) { return a; }\n" +
            "    main (item) {\n" +
            "        const a = this.safeString (item, 'a');\n" +
            "        const parts = (a as string).split ('-');\n" +
            "        const up = (a as string).toUpperCase ();\n" +
            "        const low = (a as string).toLowerCase ();\n" +
            "        const idx = (a as string).indexOf ('-');\n" +
            "        return [ parts, up, low, idx ];\n" +
            "    }\n" +
            "}\n";
        const output = transpiler.transpileGo(input).content;
        // the assertion is the author's non-null promise: a plain deref, no IIFE guard
        expect(output).toContain('var parts []string = strings.Split(*a, "-")');
        expect(output).toContain('var up string = strings.ToUpper(*a)');
        expect(output).toContain('var low string = strings.ToLower(*a)');
        expect(output).toContain('var idx int = strings.Index(*a, "-")');
        expect(output).not.toContain('func() int {');
        expect(output).toContain('import "strings"');
    });

    test('an `as string` assertion is transparent for a Go string and keeps the helper on an any box', () => {
        const input =
            "class Exchange {\n" +
            "    main (box) {\n" +
            "        const s: string = 'a-b';\n" +
            "        const parts = (s as string).split ('-');\n" +
            "        const up = (s as string).toUpperCase ();\n" +
            "        const boxed = (box as string).split ('-');\n" +
            "        return [ parts, up, boxed ];\n" +
            "    }\n" +
            "}\n";
        const output = transpiler.transpileGo(input).content;
        expect(output).toContain('strings.Split(s, "-")');
        expect(output).toContain('strings.ToUpper(s)');
        // a `(box as string)` prints the box itself: the printer must not trust the assertion
        expect(output).toContain('Split(box, "-")');
    });
    test('a []any receiver and a regex pattern keep the helper', () => {
        const input =
        "function f (params) {\n" +
        "    const items = [ 'a', 'b' ];\n" +
        "    const joined = items.join('+');\n" +
        "    const replaced = 'a-b'.replace(/-/, '_');\n" +
        "    return [ joined, replaced ];\n" +
        "}\n";
        const output = transpiler.transpileGo(input).content;
        // the helper ToStrings every element of a []any; the native call needs a []string
        expect(output).toContain('var items []any = []any{"a", "b"}');
        expect(output).toContain('= Join(items, "+")');
        // a regex pattern is a pattern, never the Go string the helper's ToString would build
        expect(output).toMatch(/(?<![.\w])Replace\("a-b",/);
        expect(output).not.toContain('import "strings"');
    });
    test('the strings package is not declared when no native call was emitted', () => {
        const output = transpiler.transpileGo("function f () { return 1; }\n").content;
        expect(output).not.toContain('import "strings"');
        expect(nativeCalls(output).length).toBe(0);
    });
    test('a non-nil *string operand is dereferenced, a nilable one keeps the helper', () => {
        const input =
        "type Str = string | undefined;\n" +
        "class Base { safeString (a, b, c?): Str { return undefined; } }\n" +
        "class Test extends Base {\n" +
        "    main (d) {\n" +
        "        const a = this.safeString (d, 'a');\n" +
        "        const b = this.safeString (d, 'b', '');\n" +
        "        const p1 = a.split ('-');\n" +
        "        const p2 = b.split ('-');\n" +
        "        const u = b.toUpperCase ();\n" +
        "        const s = b.toString ();\n" +
        "        const r = b.replace ('a', 'b');\n" +
        "        if (a !== undefined) { const l = a.toLowerCase (); return [ l ]; }\n" +
        "        if (b.startsWith ('x') || a.endsWith ('y')) { return p1; }\n" +
        "        return [ p1, p2, u, s, r ];\n" +
        "    }\n" +
        "}\n";
        const output = transpiler.transpileGo(input).content;
        // `a` can be nil (the helper answers nil / "" / false there): helper kept
        expect(output).toContain('var p1 []string = Split(a, "-")');
        expect(output).toContain('EndsWith(a, "y")');
        // a literal default makes SafeString's nil return unreachable: `b` is a plain string
        expect(output).toContain('var p2 []string = strings.Split(b, "-")');
        expect(output).toContain('var u string = strings.ToUpper(b)');
        expect(output).toContain('var s string = b');
        expect(output).toContain('var r string = strings.Replace(b, "a", "b", 1)');
        expect(output).toContain('strings.HasPrefix(b, "x")');
        // the checker narrowed `a` inside the guard
        expect(output).toContain('var l string = strings.ToLower(*a)');
    });
});

describe('native parameter types (B-02)', () => {
    // every snippet needs a base class: a root class is the generated tree's abstract
    // base and is public surface, so its methods are never retyped
    const baseWithAccessors =
        "class Base {\n" +
        "    safeString (a, b, c?) { return undefined; }\n" +
        "    safeValue (a, b, c?) { return undefined; }\n" +
        "}\n";

    test('an internal parse method prints its proved Str parameter as *string', () => {
        const input = baseWithAccessors +
            "class Test extends Base {\n" +
            "    parseStatus (status: string | undefined) {\n" +
            "        if (status !== undefined) {\n" +
            "            return this.safeString (this.statuses, status, status);\n" +
            "        }\n" +
            "        return status;\n" +
            "    }\n" +
            "    use () {\n" +
            "        return this.parseStatus (this.safeString (this.order, 'status'));\n" +
            "    }\n" +
            "}\n";
        const output = transpiler.transpileGo(input).content;
        expect(output).toContain('func (this *Test) ParseStatus(status *string) any {');
        // the declared parameter is the pointer the readers already deref
        expect(output).toContain('if status != nil {');
        expect(output).toContain('return this.ParseStatus(this.SafeString(this.Order, "status"))');
    });

    test('a call site argument the printer cannot type keeps the box', () => {
        const input = baseWithAccessors +
            "class Test extends Base {\n" +
            "    parseStatus (status: string | undefined) {\n" +
            "        return status;\n" +
            "    }\n" +
            "    use () {\n" +
            "        const v = this.safeValue (this.order, 'status');\n" +
            "        return this.parseStatus (v);\n" +
            "    }\n" +
            "}\n";
        const output = transpiler.transpileGo(input).content;
        expect(output).toContain('func (this *Test) ParseStatus(status any) any {');
    });

    test('an override keeps the base signature', () => {
        const input = baseWithAccessors +
            "class Outer extends Base {\n" +
            "    parseStatus (status: string | undefined) {\n" +
            "        return status;\n" +
            "    }\n" +
            "}\n" +
            "class Test extends Outer {\n" +
            "    override parseStatus (status: string | undefined) {\n" +
            "        return status;\n" +
            "    }\n" +
            "    use () {\n" +
            "        return this.parseStatus (this.safeString (this.order, 'status'));\n" +
            "    }\n" +
            "}\n";
        const output = transpiler.transpileGo(input).content;
        expect(output).toContain('func (this *Test) ParseStatus(status any) any {');
    });

    test('a method the parent class already declares keeps the base signature', () => {
        const input = baseWithAccessors +
            "class Outer extends Base {\n" +
            "    parseStatus (status: string | undefined) {\n" +
            "        return status;\n" +
            "    }\n" +
            "}\n" +
            "class Test extends Outer {\n" +
            "    parseStatus (status: string | undefined) {\n" +
            "        return status;\n" +
            "    }\n" +
            "    use () {\n" +
            "        return this.parseStatus (this.safeString (this.order, 'status'));\n" +
            "    }\n" +
            "}\n";
        const output = transpiler.transpileGo(input).content;
        expect(output).toContain('func (this *Test) ParseStatus(status any) any {');
    });

    test('a body that writes the parameter another printed type keeps the box (D2)', () => {
        const input = baseWithAccessors +
            "class Test extends Base {\n" +
            "    parseStatus (status: string | undefined) {\n" +
            "        status = this.safeValue (this.order, 'status');\n" +
            "        return status;\n" +
            "    }\n" +
            "    use () {\n" +
            "        return this.parseStatus (this.safeString (this.order, 'status'));\n" +
            "    }\n" +
            "}\n";
        const output = transpiler.transpileGo(input).content;
        expect(output).toContain('func (this *Test) ParseStatus(status any) any {');
    });

    test('an async method is public surface and keeps the box', () => {
        const input = baseWithAccessors +
            "class Test extends Base {\n" +
            "    async parseStatus (status: string | undefined) {\n" +
            "        return status;\n" +
            "    }\n" +
            "    use () {\n" +
            "        return this.parseStatus (this.safeString (this.order, 'status'));\n" +
            "    }\n" +
            "}\n";
        const output = transpiler.transpileGo(input).content;
        expect(output).toContain('func (this *Test) ParseStatus(status any) <-chan any {');
    });

    test('a method outside the parse* family with a proven caller prints *string', () => {
        const input = baseWithAccessors +
            "class Test extends Base {\n" +
            "    statusOf (status: string | undefined) {\n" +
            "        return status;\n" +
            "    }\n" +
            "    use () {\n" +
            "        return this.statusOf (this.safeString (this.order, 'status'));\n" +
            "    }\n" +
            "}\n";
        const output = transpiler.transpileGo(input).content;
        expect(output).toContain('func (this *Test) StatusOf(status *string) any {');
    });
});

describe('required string parameters of exchange-local methods', () => {
    const base =
        "class Base {\n" +
        "    safeString (a, b, c?) { return undefined; }\n" +
        "    createOrder (symbol: string, type: string) { return undefined; }\n" +
        "}\n";

    test('a string parameter every caller passes a literal or a proven param prints string and == goes native', () => {
        const input = base +
            "class Test extends Base {\n" +
            "    async createSpotOrder (symbol: string, type: string) {\n" +
            "        if (type === 'limit') {\n" +
            "            return 1;\n" +
            "        }\n" +
            "        return this.requestType (type);\n" +
            "    }\n" +
            "    requestType (type: string) {\n" +
            "        return (type === 'market');\n" +
            "    }\n" +
            "    async use () {\n" +
            "        return await this.createSpotOrder ('BTC/USDT', 'limit');\n" +
            "    }\n" +
            "}\n";
        const output = transpiler.transpileGo(input).content;
        expect(output).toContain('func (this *Test) createSpotOrderBody(ch chan any, symbol string, typeVar string) any {');
        expect(output).toContain('func (this *Test) RequestType(typeVar string) any {');
        expect(output).toContain('typeVar == "limit"');
        expect(output).not.toContain('IsEqual(typeVar, "limit")');
    });

    test('an inherited method, a nullable or nil-compared parameter, or an unproven caller keeps the box', () => {
        const input = base +
            "class Test extends Base {\n" +
            "    createOrder (symbol: string, type: string) { return type === 'limit'; }\n" +
            "    a (x: string | undefined) { return x === 'y'; }\n" +
            "    b (x: string) { return x === undefined; }\n" +
            "    c (x: string) { return x === 'y'; }\n" +
            "    use (o) {\n" +
            "        this.a ('y'); this.b ('y');\n" +
            "        return this.c (this.safeString (o, 'k'));\n" +
            "    }\n" +
            "}\n";
        const output = transpiler.transpileGo(input).content;
        expect(output).toContain('func (this *Test) CreateOrder(symbol any, typeVar any) any {');
        // a Str parameter every caller passes a literal is a Go string
        expect(output).toContain('func (this *Test) A(x string) any {');
        expect(output).toContain('func (this *Test) B(x any) any {');
        // a SafeString caller proves the nil-guarded *string, never a bare string
        expect(output).toContain('func (this *Test) C(x *string) any {');
    });
});

describe('required params of exchange-local methods typed from every caller', () => {
    const base =
        "type Dict = { [key: string]: any };\n" +
        "type List = any[];\n" +
        "type Str = string | undefined;\n" +
        "class Base {\n" +
        "    safeString (a, b, c?) { return undefined; }\n" +
        "    safeValue (a, b, c?) { return undefined; }\n" +
        "    safeDict (a, b, c?): Dict { return {}; }\n" +
        "}\n";

    test('Str / Dict / List parameters proven by every caller go native, and so do their reads', () => {
        const input = base +
            "class Test extends Base {\n" +
            "    orderRequest (type: Str, side: string, market: Dict, items: List) {\n" +
            "        const isLimit = type === 'limit';\n" +
            "        const id = market['id'];\n" +
            "        return [ isLimit, side + '-x', id, items.length ];\n" +
            "    }\n" +
            "    use (o) {\n" +
            "        return this.orderRequest ('limit', 'buy', { 'id': o }, [ 1 ]);\n" +
            "    }\n" +
            "}\n";
        const output = transpiler.transpileGo(input).content;
        expect(output).toContain('func (this *Test) OrderRequest(typeVar string, side string, market map[string]any, items []any) any {');
        expect(output).not.toContain('IsEqual(typeVar, \"limit\")');
        expect(output).not.toContain('GetValue(market, \"id\")');
        expect(output).not.toContain('GetArrayLength(items)');
    });

    // the async arm types from its callers (aBody x string); the four proofs below
    // still keep the box of a sync method
    test('a ?? default, a nil test, a mixed caller or a GetArg-bound optional keeps the box', () => {
        const input = base +
            "class Test extends Base {\n" +
            "    async a (x: Str) { return x === 'y'; }\n" +
            "    b (x: Str) { const v = x ?? 'd'; return v; }\n" +
            "    c (x: Str) { return x === undefined; }\n" +
            "    d (x: Str) { return x === 'y'; }\n" +
            "    e (x: Str = undefined) { return x === 'y'; }\n" +
            "    async use (o) {\n" +
            "        await this.a ('y');\n" +
            "        this.b ('y'); this.c ('y'); this.e ('y');\n" +
            "        this.d ('y'); this.d (this.safeValue (o, 'k'));\n" +
            "        return 1;\n" +
            "    }\n" +
            "}\n";
        const output = transpiler.transpileGo(input).content;
        expect(output).toContain('func (this *Test) aBody(ch chan any, x string) any {');
        expect(output).toContain('func (this *Test) B(x any) any {');
        expect(output).toContain('func (this *Test) C(x any) any {');
        expect(output).toContain('func (this *Test) D(x any) any {');
        expect(output).toContain('func (this *Test) E(optionalArgs ...any) any {');
    });
});

describe('numeric required params typed from every caller', () => {
    const base =
        "type Dict = { [key: string]: any };\n" +
        "type Int = number | undefined;\n" +
        "type Num = number | undefined;\n" +
        "class Base {\n" +
        "    safeInteger (a, b, c?): Int { return undefined; }\n" +
        "    safeNumber (a, b, c?): Num { return undefined; }\n" +
        "    safeValue (a, b, c?) { return undefined; }\n" +
        "    milliseconds (): number { return 0; }\n" +
        "}\n";

    test('Int / Num parameters every caller passes as the same pointer go native', () => {
        const input = base +
            "class Test extends Base {\n" +
            "    closest (limit: Int, step: number) {\n" +
            "        if (limit === undefined) { return step; }\n" +
            "        return [ limit, step ];\n" +
            "    }\n" +
            "    use (o) {\n" +
            "        const l = this.safeInteger (o, 'l');\n" +
            "        const s = this.milliseconds ();\n" +
            "        return this.closest (l, s);\n" +
            "    }\n" +
            "}\n";
        const output = transpiler.transpileGo(input).content;
        expect(output).toContain('func (this *Test) Closest(limit *int64, step int64) any {');
    });

    // the async arm types only the value type its call sites pass, so a `*int64`
    // producer keeps the box too; mixed and any callers and a `??` default keep the box
    test('a mixed or any caller or a ?? default keeps the box', () => {
        const input = base +
            "class Test extends Base {\n" +
            "    a (limit: Int) { return limit; }\n" +
            "    b (limit: Int) { return limit; }\n" +
            "    async c (limit: Int) { return limit; }\n" +
            "    d (n: number) { const v = n ?? 1; return v; }\n" +
            "    async use (o) {\n" +
            "        const l = this.safeInteger (o, 'l');\n" +
            "        this.a (l); this.a (this.safeValue (o, 'x'));\n" +
            "        this.b (this.safeValue (o, 'x'));\n" +
            "        await this.c (l);\n" +
            "        this.d (this.safeValue (o, 'x'));\n" +
            "        return 1;\n" +
            "    }\n" +
            "}\n";
        const output = transpiler.transpileGo(input).content;
        expect(output).toContain('func (this *Test) A(limit any) any {');
        expect(output).toContain('func (this *Test) B(limit any) any {');
        expect(output).toContain('func (this *Test) cBody(ch chan any, limit any) any {');
        expect(output).toContain('func (this *Test) D(n any) any {');
    });
});

describe('native parameter types across the ts/src tree (B-02)', () => {
    // a scoped run's program holds one file, so the sibling files of the same ts/src
    // tree (pro/ and the derived exchanges) are only provable textually: the fixture
    // writes a real tree so both halves of the proof are exercised
    const BASE_FIXTURE =
        "export class Exchange {\n" +
        "    safeString (a, b, c?) { return undefined; }\n" +
        "    safeValue (a, b, c?) { return undefined; }\n" +
        "}\n";
    const EX_FIXTURE =
        "import { Exchange } from './base/Exchange';\n" +
        "type Str = string | undefined;\n" +
        "export class ex extends Exchange {\n" +
        "    parseStatus (status: Str) {\n" +
        "        return status;\n" +
        "    }\n" +
        "}\n";

    const treeFor = (name: string, proCall: string) => {
        const src = nodepath.join(__dirname, 'files', name, 'ts', 'src');
        nodefs.mkdirSync(nodepath.join(src, 'base'), { recursive: true });
        nodefs.mkdirSync(nodepath.join(src, 'pro'), { recursive: true });
        nodefs.writeFileSync(nodepath.join(src, 'base', 'Exchange.ts'), BASE_FIXTURE);
        nodefs.writeFileSync(nodepath.join(src, 'ex.ts'), EX_FIXTURE);
        nodefs.writeFileSync(nodepath.join(src, 'pro', 'ex.ts'),
            "import { ex } from '../ex';\n" +
            "export class expro extends ex {\n" +
            "    use () {\n" +
            "        return " + proCall + ";\n" +
            "    }\n" +
            "}\n");
        return nodepath.join(src, 'ex.ts');
    };

    afterAll(() => {
        nodefs.rmSync(nodepath.join(__dirname, 'files', 'tmp-b02-tree'), { recursive: true, force: true });
        nodefs.rmSync(nodepath.join(__dirname, 'files', 'tmp-b02-tree-neg'), { recursive: true, force: true });
    });

    test('a proven sibling call site types the parameter', () => {
        const file = treeFor('tmp-b02-tree', "this.parseStatus (this.safeString (this.order, 'status'))");
        const output = new Transpiler({ verbose: false, go: {} }).transpileGoByPath(file).content;
        expect(output).toContain('func (this *ex) ParseStatus(status *string) any {');
    });

    test('a sibling call site whose argument is not provable keeps the box', () => {
        const file = treeFor('tmp-b02-tree-neg', "this.parseStatus (this.safeValue (this.order, 'status'))");
        const output = new Transpiler({ verbose: false, go: {} }).transpileGoByPath(file).content;
        expect(output).toContain('func (this *ex) ParseStatus(status any) any {');
    });

    test('a sibling caller passing its own any parameter keeps a local string parameter any on the relative driver path', () => {
        const name = 'tmp-b02-tree-anyarg';
        const src = nodepath.join(__dirname, 'files', name, 'ts', 'src');
        nodefs.mkdirSync(nodepath.join(src, 'base'), { recursive: true });
        nodefs.mkdirSync(nodepath.join(src, 'pro'), { recursive: true });
        nodefs.writeFileSync(nodepath.join(src, 'base', 'Exchange.ts'), BASE_FIXTURE);
        nodefs.writeFileSync(nodepath.join(src, 'ex.ts'),
            "import { Exchange } from './base/Exchange';\n" +
            "export class ex extends Exchange {\n" +
            "    async createOrder (symbol: string, side: string) {\n" +
            "        return await this.orderRequest (symbol, 'buy');\n" +
            "    }\n" +
            "    async orderRequest (symbol: string, side: string) {\n" +
            "        return symbol + side;\n" +
            "    }\n" +
            "}\n");
        nodefs.writeFileSync(nodepath.join(src, 'pro', 'ex.ts'),
            "import { ex } from '../ex';\n" +
            "export class expro extends ex {\n" +
            "    async createOrderWs (symbol: string, side: string) {\n" +
            "        return await this.orderRequest (symbol, side);\n" +
            "    }\n" +
            "}\n");
        const cwd = process.cwd();
        let output;
        try {
            process.chdir(nodepath.join(__dirname, 'files', name));
            output = new Transpiler({ verbose: false, go: {} }).transpileGoByPath('ts/src/ex.ts').content;
        } finally {
            process.chdir(cwd);
            nodefs.rmSync(nodepath.join(__dirname, 'files', name), { recursive: true, force: true });
        }
        expect(output).toMatch(/func \(this \*ex\) OrderRequest\(symbol any, side any\)/);
    });
});

describe('native parameter types, Dict/List (D-01)', () => {
    const baseWithAccessors =
        "type Dict = { [key: string]: any };\n" +
        "type List = any[];\n" +
        "type Strings = string[];\n" +
        "class Base {\n" +
        "    safeString (a, b, c?) { return undefined; }\n" +
        "    safeValue (a, b, c?) { return undefined; }\n" +
        "    extend (a, b) { return undefined; }\n" +
        "}\n";

    test('a Dict parameter proved by every call site prints map[string]any and its reads go native', () => {
        const input = baseWithAccessors +
            "class Test extends Base {\n" +
            "    parseData (data: Dict) {\n" +
            "        const a = data['a'];\n" +
            "        const b = data['b']['c'];\n" +
            "        const hasC = 'c' in data;\n" +
            "        return this.safeValue (data, 'c', [ a, b, hasC ]);\n" +
            "    }\n" +
            "    use () {\n" +
            "        this.parseData ({ 'a': 1 });\n" +
            "        this.parseData (this.extend (this.order, {}));\n" +
            "        return 1;\n" +
            "    }\n" +
            "}\n";
        const output = transpiler.transpileGo(input).content;
        expect(output).toContain('func (this *Test) ParseData(data map[string]any) any {');
        expect(output).toContain('var a any = data["a"]');
        expect(output).toContain('var b any = GetValue(data["b"], "c")');
        expect(output).toContain('_, ok := data["c"]');
        // the argument expressions are unchanged: the call sites already produced maps
        expect(output).toContain('this.ParseData(this.Extend(this.Order, map[string]any{');
    });

    test('a List parameter proved by every call site prints []any and .length inlines', () => {
        const input = baseWithAccessors +
            "class Test extends Base {\n" +
            "    parseRows (rows: List) {\n" +
            "        const n = rows.length;\n" +
            "        rows.push (this.safeValue (rows, 0));\n" +
            "        return n;\n" +
            "    }\n" +
            "    use () {\n" +
            "        this.parseRows ([ 1, 2 ]);\n" +
            "        return 1;\n" +
            "    }\n" +
            "}\n";
        const output = transpiler.transpileGo(input).content;
        expect(output).toContain('func (this *Test) ParseRows(rows []any) any {');
        expect(output).toContain('var n int = len(rows)');
        expect(output).toContain('rows = append(rows, this.SafeValue(rows, 0))');
    });

    test('a parameter a caller passes as an any box keeps the box', () => {
        const input = baseWithAccessors +
            "class Test extends Base {\n" +
            "    parseData (data: Dict) {\n" +
            "        return GetValue (data, 'a');\n" +
            "    }\n" +
            "    use () {\n" +
            "        const v = this.safeValue (this.order, 'data');\n" +
            "        return this.parseData (v);\n" +
            "    }\n" +
            "}\n";
        const output = transpiler.transpileGo(input).content;
        expect(output).toContain('func (this *Test) ParseData(data any) any {');
        expect(output).toContain('return GetValue(data, "a")');
    });

    test('an override keeps the base signature', () => {
        const input = baseWithAccessors +
            "class Outer extends Base {\n" +
            "    parseData (data: Dict) {\n" +
            "        return data['a'];\n" +
            "    }\n" +
            "}\n" +
            "class Test extends Outer {\n" +
            "    override parseData (data: Dict) {\n" +
            "        return data['a'];\n" +
            "    }\n" +
            "    use () {\n" +
            "        return this.parseData ({ 'a': 1 });\n" +
            "    }\n" +
            "}\n";
        const output = transpiler.transpileGo(input).content;
        expect(output).toContain('func (this *Test) ParseData(data any) any {');
    });

    test('a body that writes the parameter another type keeps the box (D2)', () => {
        const input = baseWithAccessors +
            "class Test extends Base {\n" +
            "    parseData (data: Dict) {\n" +
            "        data = this.safeValue (this.order, 'data');\n" +
            "        return data['a'];\n" +
            "    }\n" +
            "    use () {\n" +
            "        return this.parseData ({ 'a': 1 });\n" +
            "    }\n" +
            "}\n";
        const output = transpiler.transpileGo(input).content;
        expect(output).toContain('func (this *Test) ParseData(data any) any {');
    });

    test('a nil compare on a Dict parameter still types: a Go map holds nil', () => {
        const input = baseWithAccessors +
            "class Test extends Base {\n" +
            "    parseData (data: Dict | undefined) {\n" +
            "        if (data === undefined) {\n" +
            "            return 1;\n" +
            "        }\n" +
            "        return data['a'];\n" +
            "    }\n" +
            "    use () {\n" +
            "        return this.parseData ({ 'a': 1 });\n" +
            "    }\n" +
            "}\n";
        const output = transpiler.transpileGo(input).content;
        expect(output).toContain('func (this *Test) ParseData(data map[string]any) any {');
        expect(output).toContain('if data == nil {');
        expect(output).toContain('return data["a"]');
    });

    test('a nil-tested string[] parameter still types: a Go []string holds nil', () => {
        const output = new Transpiler({ verbose: false }).transpileGo(
            "type Dict = { [key: string]: any };\n" +
            "class Base { ok (a: any): any { return a; } }\n" +
            "class T extends Base {\n" +
            "    idsCount (ids: string[]): number {\n" +
            "        if (ids === undefined) { return 0; }\n" +
            "        return ids.length;\n" +
            "    }\n" +
            "    go (ids: string[]): number { return this.idsCount (ids); }\n" +
            "}\n").content;
        expect(output).toContain('IdsCount(ids []string)');
        expect(output).toContain('if ids == nil {');
        expect(output).not.toContain('IsEqual(ids, nil)');
    });

    test('a nil-tested Dict[] parameter whose element is read keeps the box', () => {
        const output = new Transpiler({ verbose: false }).transpileGo(
            "type Dict = { [key: string]: any };\n" +
            "class Base { ok (a: any): any { return a; } }\n" +
            "class T extends Base {\n" +
            "    firstRow (rows: Dict[]): any {\n" +
            "        if (rows === undefined) { return 1; }\n" +
            "        const row = rows[0];\n" +
            "        return row;\n" +
            "    }\n" +
            "    go (rows: Dict[]): any { return this.firstRow (rows); }\n" +
            "}\n").content;
        expect(output).toContain('FirstRow(rows any)');
        expect(output).not.toContain('func() any {');
    });

    test('a nil-tested List parameter keeps the box: a []any read prints the guarded closure', () => {
        const input = baseWithAccessors +
            "class Test extends Base {\n" +
            "    parseRows (rows: List | undefined) {\n" +
            "        if (rows === undefined) {\n" +
            "            return 1;\n" +
            "        }\n" +
            "        return this.safeValue (rows, 0);\n" +
            "    }\n" +
            "    use () {\n" +
            "        return this.parseRows ([ 1, 2 ]);\n" +
            "    }\n" +
            "}\n";
        const output = transpiler.transpileGo(input).content;
        expect(output).toContain('func (this *Test) ParseRows(rows any) any {');
        expect(output).not.toContain('DerefScalar');
    });

    test('a nil compare on a value-typed parameter keeps the box: Go has no nil string/bool', () => {
        const input = baseWithAccessors +
            "type Bool = boolean | undefined;\n" +
            "class Test extends Base {\n" +
            "    parseFlag (flag: Bool) {\n" +
            "        if (flag === undefined) {\n" +
            "            return 1;\n" +
            "        }\n" +
            "        return 2;\n" +
            "    }\n" +
            "    use () {\n" +
            "        return this.parseFlag (true);\n" +
            "    }\n" +
            "}\n";
        const output = transpiler.transpileGo(input).content;
        expect(output).toContain('func (this *Test) ParseFlag(flag any) any {');
    });

    // the typed slice-argument rule scopes the typed array-literal rule to the slice table's own slots, so this
    // pre-existing negative case keeps its box: a venue-local string-list parameter is proved by
    // slice-typed call-site values, never by a bare `[]any{..}` literal.
    test('a non-any element []-typed parameter keeps the box', () => {
        const input = baseWithAccessors +
            "class Test extends Base {\n" +
            "    parseSymbols (symbols: Strings) {\n" +
            "        return symbols;\n" +
            "    }\n" +
            "    use () {\n" +
            "        return this.parseSymbols ([ 'a' ]);\n" +
            "    }\n" +
            "}\n";
        const output = transpiler.transpileGo(input).content;
        expect(output).toContain('func (this *Test) ParseSymbols(symbols any) any {');
        expect(output).toContain('[]any{"a"}');
    });

    test('a class-typed parameter keeps the box', () => {
        const input = baseWithAccessors +
            "class Book {}\n" +
            "class Test extends Base {\n" +
            "    parseBook (book: Book) {\n" +
            "        return book;\n" +
            "    }\n" +
            "    use () {\n" +
            "        return this.parseBook (new Book ());\n" +
            "    }\n" +
            "}\n";
        const output = transpiler.transpileGo(input).content;
        expect(output).toContain('func (this *Test) ParseBook(book any) any {');
    });

    test('a proven parameter types a caller that forwards its own proven parameter', () => {
        const input = baseWithAccessors +
            "class Test extends Base {\n" +
            "    parseInner (data: Dict) {\n" +
            "        return data['a'];\n" +
            "    }\n" +
            "    parseOuter (data: Dict) {\n" +
            "        return this.parseInner (data);\n" +
            "    }\n" +
            "    use () {\n" +
            "        return this.parseOuter ({ 'a': 1 });\n" +
            "    }\n" +
            "}\n";
        const output = transpiler.transpileGo(input).content;
        expect(output).toContain('func (this *Test) ParseInner(data map[string]any) any {');
        expect(output).toContain('func (this *Test) ParseOuter(data map[string]any) any {');
        expect(output).toContain('return this.ParseInner(data)');
    });
});

describe('native parameter types, Dict/List across the ts/src tree (D-01)', () => {
    const BASE_FIXTURE =
        "export class Exchange {\n" +
        "    safeString (a, b, c?) { return undefined; }\n" +
        "    safeValue (a, b, c?) { return undefined; }\n" +
        "}\n";
    const EX_FIXTURE =
        "import { Exchange } from './base/Exchange';\n" +
        "type Dict = { [key: string]: any };\n" +
        "export class ex extends Exchange {\n" +
        "    parseData (data: Dict) {\n" +
        "        return data['a'];\n" +
        "    }\n" +
        "}\n";

    const treeFor = (name: string, proCall: string) => {
        const src = nodepath.join(__dirname, 'files', name, 'ts', 'src');
        nodefs.mkdirSync(nodepath.join(src, 'base'), { recursive: true });
        nodefs.mkdirSync(nodepath.join(src, 'pro'), { recursive: true });
        nodefs.writeFileSync(nodepath.join(src, 'base', 'Exchange.ts'), BASE_FIXTURE);
        nodefs.writeFileSync(nodepath.join(src, 'ex.ts'), EX_FIXTURE);
        nodefs.writeFileSync(nodepath.join(src, 'pro', 'ex.ts'),
            "import { ex } from '../ex';\n" +
            "export class expro extends ex {\n" +
            "    use () {\n" +
            "        return " + proCall + ";\n" +
            "    }\n" +
            "}\n");
        return nodepath.join(src, 'ex.ts');
    };

    afterAll(() => {
        nodefs.rmSync(nodepath.join(__dirname, 'files', 'tmp-d01-tree'), { recursive: true, force: true });
        nodefs.rmSync(nodepath.join(__dirname, 'files', 'tmp-d01-tree-neg'), { recursive: true, force: true });
    });

    test('a sibling call site passing an object literal proves the parameter', () => {
        const file = treeFor('tmp-d01-tree', "this.parseData ({ 'a': 1 })");
        const output = new Transpiler({ verbose: false, go: {} }).transpileGoByPath(file).content;
        expect(output).toContain('func (this *ex) ParseData(data map[string]any) any {');
    });

    test('a sibling call site passing an unproven local keeps the box', () => {
        const file = treeFor('tmp-d01-tree-neg', "this.parseData (this.safeValue (this.order, 'data'))");
        const output = new Transpiler({ verbose: false, go: {} }).transpileGoByPath(file).content;
        expect(output).toContain('func (this *ex) ParseData(data any) any {');
    });

    test('a file under ts/src/base keeps the box on the relative path a driver passes', () => {
        // the prediction base (ts/src/base/PredictionExchange.ts) extends a class, so it
        // passes the root-class test; the scoped driver hands the transpiler a source name
        // WITHOUT a leading `./`, which a `/ts/src/base/` substring test misses — and the
        // base signature then disagrees with every prediction caller that passes `any`
        const name = 'tmp-d01-base';
        const src = nodepath.join(__dirname, 'files', name, 'ts', 'src');
        nodefs.mkdirSync(nodepath.join(src, 'base'), { recursive: true });
        nodefs.writeFileSync(nodepath.join(src, 'base', 'Exchange.ts'), BASE_FIXTURE);
        nodefs.writeFileSync(nodepath.join(src, 'base', 'PredictionExchange.ts'),
            "import { Exchange } from './Exchange';\n" +
            "type Dict = { [key: string]: any };\n" +
            "export default class PredictionExchange extends Exchange {\n" +
            "    parseData (data: Dict) {\n" +
            "        return data['a'];\n" +
            "    }\n" +
            "    use () {\n" +
            "        return this.parseData ({ 'a': 1 });\n" +
            "    }\n" +
            "}\n");
        const cwd = process.cwd();
        let output;
        try {
            process.chdir(nodepath.join(__dirname, 'files', name));
            output = new Transpiler({ verbose: false, go: {} }).transpileGoByPath('ts/src/base/PredictionExchange.ts').content;
        } finally {
            process.chdir(cwd);
            nodefs.rmSync(nodepath.join(__dirname, 'files', name), { recursive: true, force: true });
        }
        expect(output).toContain('func (this *PredictionExchange) ParseData(data any) any {');
        expect(output).toContain('return GetValue(data, "a")');
    });

    test('a sibling call site passing a same-named local declared elsewhere keeps the box', () => {
        // measured prediction-tier source: the argument is a caller-local `orders`, but the
        // file also declares `const orders = [];` inside an unrelated method — a scope-less
        // declaration scan matched that literal and typed a parameter every real caller
        // passes as an `any` box (farm job 1053, buildGO)
        const name = 'tmp-d01-tree-shadow';
        const src = nodepath.join(__dirname, 'files', name, 'ts', 'src');
        nodefs.mkdirSync(nodepath.join(src, 'base'), { recursive: true });
        nodefs.mkdirSync(nodepath.join(src, 'pro'), { recursive: true });
        nodefs.writeFileSync(nodepath.join(src, 'base', 'Exchange.ts'), BASE_FIXTURE);
        nodefs.writeFileSync(nodepath.join(src, 'ex.ts'), EX_FIXTURE);
        nodefs.writeFileSync(nodepath.join(src, 'pro', 'ex.ts'),
            "import { ex } from '../ex';\n" +
            "export class expro extends ex {\n" +
            "    other () {\n" +
            "        const data = [];\n" +
            "        return data;\n" +
            "    }\n" +
            "    use (raw) {\n" +
            "        return this.parseData (data);\n" +
            "    }\n" +
            "}\n");
        const output = new Transpiler({ verbose: false, go: {} }).transpileGoByPath(nodepath.join(src, 'ex.ts')).content;
        expect(output).toContain('func (this *ex) ParseData(data any) any {');
        nodefs.rmSync(nodepath.join(__dirname, 'files', name), { recursive: true, force: true });
    });
});

// D-06: an element read on a receiver whose printed Go declaration is a `[]any` slice
// (a slice literal, a `[]any`-returning accessor, the SafeList unbox) prints the guarded
// native index instead of GetValue(x, key) — the guard reproduces the helper's answer for
// an absent index (nil) while the native index cannot panic.
describe('a list read bounded by its own counting loop is the plain index', () => {
    // the prediction tier (prediction/*.go) takes the same bounded-loop rule
    const predictionRead = (file: string): string => {
        const dir = nodefs.mkdtempSync(nodepath.join(nodeos.tmpdir(), 'a-list-read-bounded-by-'));
        try {
            const target = nodepath.join(dir, file);
            nodefs.mkdirSync(nodepath.dirname(target), { recursive: true });
            nodefs.writeFileSync(target,
                "export class Test {\n" +
                "    safeList (a, b, c?) { return undefined; }\n" +
                "    f (a: any) {\n" +
                "        const rows = [ a ];\n" +
                "        for (let i = 0; i < rows.length; i++) {\n            const v = rows[i];\n            a += v;\n        }\n" +
                "        return a;\n    }\n}\n");
            return new Transpiler({ verbose: false, go: {} }).transpileGoByPath(target).content.replace(/[\t\n ]+/g, ' ');
        } finally {
            nodefs.rmSync(dir, { recursive: true, force: true });
        }
    };

    test('a bounded-loop read in ts/src/prediction loses the dead guard; the same read in ts/src/test keeps it', () => {
        const prediction = predictionRead('ts/src/prediction/venue.ts');
        expect(prediction).not.toContain('func() any');
        expect(prediction).toContain('var v any = DerefScalar(rows[i])');
        expect(predictionRead('ts/src/test/venue.ts')).toContain('func() any');
    });

    const squash = (output: string) => output.replace(/[\t\n ]+/g, ' ');
    const transpile = (ts: string) => squash(transpiler.transpileGo(ts).content);
    const fixture = (loop: string, body: string, decl = "const list = this.safeList (a, 'rows', []);\n        ") =>
        "class Test {\n" +
        "    safeList (a, b, c?) { return undefined; }\n" +
        "    f (a: any) {\n" +
        "        " + decl +
        "        " + loop + " {\n" +
        "            " + body + "\n" +
        "        }\n" +
        "        return a;\n" +
        "    }\n" +
        "}\n";

    test('x[i] under i < x.length with i and x unwritten drops the guard; a SafeList element drops DerefScalar too', () => {
        const output = transpile(fixture("for (let i = 0; i < list.length; i++)", "const v = list[i]; a += v;"));
        expect(output).toContain('var v any = list[i]');
        expect(output).not.toContain('func() any');
    });

    test('a hoisted length bound that reads this list counts', () => {
        const output = transpile(fixture("for (let i = 0; i < n; i++)", "const v = list[i]; a += v;", "const list = this.safeList (a, 'rows', []);\n        const n = list.length;\n        "));
        expect(output).toContain('var v any = list[i]');
        expect(output).not.toContain('func() any');
    });

    test('an element of an unproven list keeps DerefScalar but loses the dead guard', () => {
        const output = transpile(fixture("for (let i = 0; i < list.length; i++)", "const v = list[i]; a += v;", "const list = [ a ];\n        "));
        expect(output).toContain('var v any = DerefScalar(list[i])');
        expect(output).not.toContain('func() any');
    });

    test('a list proven pointer-free through an endpoint response, arrayConcat of lists, Object.values and a pointer-free list element drops DerefScalar', () => {
        const hooked = new Transpiler({ verbose: false, go: {} });
        installCcxtGoHooks(hooked.goTranspiler);
        const transpile = (ts: string) => squash(hooked.transpileGo(ts).content);
        const cls = (body: string) =>
            "class Test {\n    safeList (a, b, c?) { return undefined; }\n    arrayConcat (a, b) { return a; }\n    publicGetRows (p) { return undefined; }\n    async f (a: any) {\n" + body + "        return a;\n    }\n}\n";
        const endpoint = transpile(cls(
            "        const response = await this.publicGetRows (a);\n        let rows = [];\n        if (Array.isArray (response)) {\n            rows = response;\n        }\n" +
            "        for (let i = 0; i < rows.length; i++) {\n            const v = rows[i];\n            a += v;\n        }\n"));
        expect(endpoint).toContain('var v any = rows[i]');
        expect(endpoint).not.toContain('DerefScalar(rows[i])');
        const concat = transpile(cls(
            "        let rows = [];\n        const data = this.safeList (a, 'd', []);\n        rows = this.arrayConcat (rows, data);\n" +
            "        for (let i = 0; i < rows.length; i++) {\n            const v = rows[i];\n            a += v;\n        }\n"));
        expect(concat).toContain('var v any = rows[i]');
        const values = transpile(cls(
            "        const rows = Object.values (a);\n        for (let i = 0; i < rows.length; i++) {\n            const v = rows[i];\n            a += v;\n        }\n"));
        expect(values).toContain('var v any = rows[i]');
        const element = transpile(cls(
            "        const all = this.safeList (a, 'd', []);\n        const ids = [];\n        for (let i = 0; i < all.length; i++) {\n            ids.push (all[i]);\n        }\n" +
            "        for (let j = 0; j < ids.length; j++) {\n            const v = ids[j];\n            a += v;\n        }\n"));
        expect(element).toContain('var v any = ids[j]');
        // negative: a list also fed a scalar from a Safe* accessor keeps DerefScalar
        const mixed = transpile(cls(
            "        const ids = [];\n        ids.push (this.safeList (a, 'd', []));\n        ids.push (this.safeString (a, 'x'));\n" +
            "        for (let j = 0; j < ids.length; j++) {\n            const v = ids[j];\n            a += v;\n        }\n").replace('safeList (a, b, c?)', 'safeString (a, b) { return undefined; }\n    safeList (a, b, c?)'));
        expect(mixed).not.toContain('var v any = ids[j]');
    });

    test('negative controls keep the guard closure', () => {
        // a counter that moves in the body
        expect(transpile(fixture("for (let i = 0; i < list.length; i++)", "i = i + 1; const v = list[i]; a += v;"))).toContain('if i >= 0 && i < len(list)');
        // a list pushed to in the body
        expect(transpile(fixture("for (let i = 0; i < list.length; i++)", "list.push (a); const v = list[i]; a += v;"))).toContain('if i >= 0 && i < len(list)');
        // a list reassigned in the body stays boxed: no native index at all
        const reassigned = transpile(fixture("for (let i = 0; i < list.length; i++)", "list = []; const v = list[i]; a += v;"));
        expect(reassigned).toContain('GetValue(list, i)');
        expect(reassigned).not.toContain('list[i]');
        // a loop not bounded by the list
        expect(transpile(fixture("for (let i = 0; i < 3; i++)", "const v = list[i]; a += v;"))).toContain('if i >= 0 && i < len(list)');
        // a read after the loop closed
        const after =
            "class Test {\n    safeList (a, b, c?) { return undefined; }\n    f (a: any) {\n" +
            "        const list = this.safeList (a, 'rows', []);\n        let i = 0;\n" +
            "        for (i = 0; i < list.length; i++) {\n            a += 1;\n        }\n" +
            "        const v = list[i];\n        return v;\n    }\n}\n";
        expect(transpile(after)).not.toContain('list[i]');
        // a read inside a closure may run after the loop
        expect(transpile(fixture("for (let i = 0; i < list.length; i++)", "const g = () => list[i]; a += g ();"))).not.toContain('var g any = list[i]');
    });
});

describe('go GetValue(x, key) -> guarded native index on a declared []any', () => {
    const squash = (output: string) => output.replace(/[\t\n ]+/g, ' ');
    const transpile = (ts: string) => squash(transpiler.transpileGo(ts).content);

    test('a loop read on a local declared []any prints the guarded native index', () => {
        const ts =
        "class Test {\n" +
        "    f (a: any) {\n" +
        "        const list = [];\n" +
        "        for (let i = 0; i < list.length; i++) {\n" +
        "            const v = list[i];\n" +
        "            a += v;\n" +
        "        }\n" +
        "        return a;\n" +
        "    }\n" +
        "}\n";
        const output = transpile(ts);
        expect(output).toContain('var list []any = []any{}');
        expect(output).toContain('for i := 0; i < len(list); i++');
        // the loop bounds the read, so the guard closure is gone
        expect(output).toContain('var v any = list[i]');
        expect(output).not.toContain('func() any');
        expect(output).not.toContain('GetValue(list');
    });

    test('a literal index on a local declared []any prints the guarded native index', () => {
        const ts =
        "class Test {\n" +
        "    f (a: any) {\n" +
        "        const list = [];\n" +
        "        return list[0];\n" +
        "    }\n" +
        "}\n";
        const output = transpile(ts);
        expect(output).toContain('if 0 >= 0 && 0 < len(list) { return DerefScalar(list[0]) } return nil }()');
        expect(output).not.toContain('GetValue(list');
    });

    test('an int arithmetic key prints the guarded native index', () => {
        const ts =
        "class Test {\n" +
        "    f (a: any) {\n" +
        "        const list = [];\n" +
        "        for (let i = 0; i < 3; i++) {\n" +
        "            const v = list[i + 1];\n" +
        "            a += v;\n" +
        "        }\n" +
        "        return a;\n" +
        "    }\n" +
        "}\n";
        const output = transpile(ts);
        expect(output).toContain('if i+1 >= 0 && i+1 < len(list) { return DerefScalar(list[i+1]) } return nil }()');
        expect(output).not.toContain('GetValue(list');
    });

    test('only the first step of a nested read goes native; the rest keeps the helper', () => {
        const ts =
        "class Test {\n" +
        "    f (a: any) {\n" +
        "        const list = [];\n" +
        "        for (let i = 0; i < list.length; i++) {\n" +
        "            const v = list[i]['k'];\n" +
        "            a += v;\n" +
        "        }\n" +
        "        return a;\n" +
        "    }\n" +
        "}\n";
        const output = transpile(ts);
        expect(output).toContain('GetValue(func() any { if i >= 0 && i < len(list) { return DerefScalar(list[i]) } return nil }(), "k")');
    });

    test('a key the printer cannot prove an int keeps the helper', () => {
        const ts =
        "class Test {\n" +
        "    f (a: any) {\n" +
        "        const list = [];\n" +
        "        const k = 'x';\n" +
        "        return list[k];\n" +
        "    }\n" +
        "}\n";
        const output = transpile(ts);
        expect(output).toContain('GetValue(list, k)');
        expect(output).not.toContain('DerefScalar(list[');
    });

    test('a call key keeps the helper', () => {
        const ts =
        "class Test {\n" +
        "    g (a: any) { return 1; }\n" +
        "    f (a: any) {\n" +
        "        const list = [];\n" +
        "        return list[this.g(a)];\n" +
        "    }\n" +
        "}\n";
        const output = transpile(ts);
        expect(output).toContain('GetValue(list, this.G(a))');
        expect(output).not.toContain('DerefScalar(list[');
    });

    test('an any box keeps the helper', () => {
        const ts =
        "class Test {\n" +
        "    f (a: any) {\n" +
        "        const box = this.safeValue(a, 'k');\n" +
        "        return box[0];\n" +
        "    }\n" +
        "}\n";
        const output = transpile(ts);
        expect(output).toContain('GetValue(box, 0)');
    });

    test('a non-[]any slice keeps the helper', () => {
        const ts =
        "class Test {\n" +
        "    f (a: any) {\n" +
        "        const parts = a.split(',');\n" +
        "        return parts[0];\n" +
        "    }\n" +
        "}\n";
        const output = transpile(ts);
        expect(output).toContain('GetValue(parts, 0)');
    });

    test('a local written a value of another printed type is declared any and keeps the helper', () => {
        const ts =
        "class Test {\n" +
        "    f (a: any) {\n" +
        "        let list = [];\n" +
        "        list = a;\n" +
        "        return list[0];\n" +
        "    }\n" +
        "}\n";
        const output = transpile(ts);
        expect(output).toContain('var list any = []any{}');
        expect(output).toContain('GetValue(list, 0)');
    });

    test('an element write on a []any local keeps the helper write', () => {
        const ts =
        "class Test {\n" +
        "    f (a: any) {\n" +
        "        const list = [];\n" +
        "        for (let i = 0; i < 3; i++) {\n" +
        "            list[i] = a;\n" +
        "        }\n" +
        "        return list;\n" +
        "    }\n" +
        "}\n";
        const output = transpile(ts);
        expect(output).toContain('AddElementToObject(list, i, a)');
        expect(output).not.toContain('DerefScalar(list[');
    });
});

describe('pro handler frame parameters (D-03)', () => {
    // the declaring method must live in a pro-tree file, and the fixture needs a real
    // ts/src tree: transpileGoByPath registers the path the ws stage uses (ts/src/pro/x.ts)
    const BASE_FIXTURE =
        "export class Exchange {\n" +
        "    safeDict (a, b, c?) { return undefined; }\n" +
        "    safeString (a, b, c?) { return undefined; }\n" +
        "    safeValue (a, b, c?) { return undefined; }\n" +
        "    handleMessage (client, message) {}\n" +
        "}\n";
    const CLIENT_FIXTURE =
        "export class Client { receive () { return undefined; } }\n";
    const TYPES_FIXTURE =
        "export type Dict = {[key: string]: any};\n";
    const PRO_HEADER =
        "import { Exchange } from '../base/Exchange';\n" +
        "import { Client } from '../base/ws/Client';\n" +
        "import type { Dict } from '../base/types';\n";

    const treeFor = (name: string, pro: string, sibling?: string, base = true) => {
        const src = nodepath.join(__dirname, 'files', name, 'ts', 'src');
        nodefs.mkdirSync(nodepath.join(src, 'base', 'ws'), { recursive: true });
        nodefs.mkdirSync(nodepath.join(src, 'pro'), { recursive: true });
        nodefs.writeFileSync(nodepath.join(src, 'base', 'Exchange.ts'), BASE_FIXTURE);
        nodefs.writeFileSync(nodepath.join(src, 'base', 'ws', 'Client.ts'), CLIENT_FIXTURE);
        nodefs.writeFileSync(nodepath.join(src, 'base', 'types.ts'), TYPES_FIXTURE);
        if (base) {
            nodefs.writeFileSync(nodepath.join(src, 'pro', 'ex.ts'), PRO_HEADER + pro);
        } else {
            nodefs.writeFileSync(nodepath.join(src, 'ex.ts'), pro);
        }
        if (sibling !== undefined) {
            nodefs.writeFileSync(nodepath.join(src, 'pro', 'derived.ts'), sibling);
        }
        return base ? nodepath.join(src, 'pro', 'ex.ts') : nodepath.join(src, 'ex.ts');
    };

    afterAll(() => {
        const files = nodefs.readdirSync(nodepath.join(__dirname, 'files'));
        for (const entry of files) {
            if (entry.startsWith('tmp-d03-')) {
                nodefs.rmSync(nodepath.join(__dirname, 'files', entry), { recursive: true, force: true });
            }
        }
    });

    test('a pro handler frame parameter prints map[string]any and its reads go native', () => {
        const file = treeFor('tmp-d03-pro-tree',
            "export class ex extends Exchange {\n" +
            "    handleTicker (client: Client, message: Dict) {\n" +
            "        const data = message['data'];\n" +
            "        return data;\n" +
            "    }\n" +
            "}\n");
        const output = new Transpiler({ verbose: false, go: {} }).transpileGoByPath(file).content;
        expect(output).toContain('func (this *ex) HandleTicker(client any, message map[string]any) any {');
        expect(output).toContain('var data any = message["data"]');
    });

    test('a handler called by a typed handler is typed too', () => {
        const file = treeFor('tmp-d03-pro-tree-chain',
            "export class ex extends Exchange {\n" +
            "    handleOrder (client: Client, message: Dict) {\n" +
            "        return this.safeValue (message, 'order');\n" +
            "    }\n" +
            "    handleBook (client: Client, message: Dict) {\n" +
            "        this.handleOrder (client, message);\n" +
            "        return undefined;\n" +
            "    }\n" +
            "}\n");
        const output = new Transpiler({ verbose: false, go: {} }).transpileGoByPath(file).content;
        expect(output).toContain('func (this *ex) HandleBook(client any, message map[string]any) any {');
        expect(output).toContain('func (this *ex) HandleOrder(client any, message map[string]any) any {');
    });

    test('a handler called with a boxed frame keeps the box', () => {
        const file = treeFor('tmp-d03-pro-tree-boxed',
            "export class ex extends Exchange {\n" +
            "    handleTicker (client: Client, message: Dict) {\n" +
            "        return this.safeValue (message, 'data');\n" +
            "    }\n" +
            "    handleMeta (client: Client, message: any) {\n" +
            "        this.handleTicker (client, message);\n" +
            "        return undefined;\n" +
            "    }\n" +
            "}\n");
        const output = new Transpiler({ verbose: false, go: {} }).transpileGoByPath(file).content;
        expect(output).toContain('func (this *ex) HandleMeta(client any, message any) any {');
        expect(output).toContain('func (this *ex) HandleTicker(client any, message any) any {');
    });

    test('the base stub override carries the dict frame (typed ws frame)', () => {
        // the ws frame is typed: the Go dispatch asserts the decoded object once, so an
        // object-framed venue's override does not print the box
        const file = treeFor('tmp-d03-pro-tree-override',
            "export class ex extends Exchange {\n" +
            "    override handleMessage (client: Client, message: Dict) {\n" +
            "        return this.safeValue (message, 'event');\n" +
            "    }\n" +
            "}\n");
        const output = new Transpiler({ verbose: false, go: {} }).transpileGoByPath(file).content;
        expect(output).toContain('func (this *ex) HandleMessage(client any, message map[string]any) any {');
    });

    test('a non-handler pro method keeps the box', () => {
        const file = treeFor('tmp-d03-pro-tree-nonhandler',
            "export class ex extends Exchange {\n" +
            "    normalizeFrame (message: Dict) {\n" +
            "        return this.safeValue (message, 'event');\n" +
            "    }\n" +
            "}\n");
        const output = new Transpiler({ verbose: false, go: {} }).transpileGoByPath(file).content;
        expect(output).toContain('func (this *ex) NormalizeFrame(message any) any {');
    });

    test('a handle* method outside the pro tree keeps the box', () => {
        const file = treeFor('tmp-d03-rest-tree',
            "export class ex extends Exchange {\n" +
            "    handleTicker (client: any, message: any) {\n" +
            "        return this.safeValue (message, 'data');\n" +
            "    }\n" +
            "}\n", undefined, false);
        const output = new Transpiler({ verbose: false, go: {} }).transpileGoByPath(file).content;
        expect(output).toContain('func (this *ex) HandleTicker(client any, message any) any {');
    });

    test('a class-typed parameter keeps the box', () => {
        const file = treeFor('tmp-d03-pro-tree-class',
            "export class ex extends Exchange {\n" +
            "    handleConnection (client: Client, subscriber: Client) {\n" +
            "        return subscriber.receive ();\n" +
            "    }\n" +
            "}\n");
        const output = new Transpiler({ verbose: false, go: {} }).transpileGoByPath(file).content;
        expect(output).toContain('func (this *ex) HandleConnection(client any, subscriber any) any {');
    });

    test('a body that writes the frame another printed type keeps the box (D2)', () => {
        const file = treeFor('tmp-d03-pro-tree-write',
            "export class ex extends Exchange {\n" +
            "    handleTicker (client: Client, message: Dict) {\n" +
            "        message = this.safeValue (message, 'data');\n" +
            "        return message;\n" +
            "    }\n" +
            "}\n");
        const output = new Transpiler({ verbose: false, go: {} }).transpileGoByPath(file).content;
        expect(output).toContain('func (this *ex) HandleTicker(client any, message any) any {');
    });

    test('a sibling pro file passing a boxed frame keeps the box', () => {
        const file = treeFor('tmp-d03-pro-tree-sibling',
            "export class ex extends Exchange {\n" +
            "    handleTicker (client: Client, message: Dict) {\n" +
            "        return this.safeValue (message, 'data');\n" +
            "    }\n" +
            "}\n",
            PRO_HEADER +
            "import { ex } from './ex';\n" +
            "export class derived extends ex {\n" +
            "    use (client: Client, message: any) {\n" +
            "        this.handleTicker (client, message);\n" +
            "    }\n" +
            "}\n");
        const output = new Transpiler({ verbose: false, go: {} }).transpileGoByPath(file).content;
        expect(output).toContain('func (this *ex) HandleTicker(client any, message any) any {');
    });
});

describe('go native numeric equality', () => {
    const body = (src: string) => transpiler.transpileGo(`class X {\n    options: any;\n    f (arr, x) {\n${src}\n        return 0;\n    }\n}`).content;
    test('an int local against an integer constant prints ==', () => {
        const go = body("        const k = arr.length;\n        if (k === 0) { return 1; }\n        if (k !== 7) { return 2; }");
        expect(go).toContain('if k == 0 {');
        expect(go).toContain('if k != 7 {');
        expect(go).not.toContain('IsEqual(k');
    });
    test('two int locals print ==', () => {
        const go = body("        const k = arr.length;\n        const n = this.options['x'].length;\n        if (k === n) { return 1; }");
        expect(go).toContain('if k == n {');
    });
    test('a fractional constant against an int local keeps IsEqual', () => {
        const go = body("        const k = arr.length;\n        if (k === 1.5) { return 1; }");
        expect(go).toContain('IsEqual(k, 1.5)');
    });
    test('an any operand keeps IsEqual', () => {
        const go = body("        if (x === 1) { return 1; }");
        expect(go).toContain('IsEqual(x, 1)');
    });
});

describe('go long + chains', () => {
    test('a 25-term chain of typed operands prints in linear time', () => {
        const terms: string[] = [];
        for (let i = 0; i < 25; i++) {
            terms.push((i % 2) ? "'-'" : ('a' + i));
        }
        const params = terms.filter((t) => t[0] === 'a').map((t) => t + ': string').join(', ');
        const input = 'class T {\n    f (' + params + '): string {\n        let r = \'\';\n        r = ' + terms.join(' + ') + ';\n        return r;\n    }\n}\n';
        const start = Date.now();
        const output = new Transpiler({ verbose: false }).transpileGo(input).content;
        expect(Date.now() - start).toBeLessThan(5000);
        expect(output).toContain('r = ');
    });
});

describe('unified string parameters (unifiedStringParams)', () => {
    const unified = new Transpiler({ verbose: false, go: { unifiedStringParams: { 'createOrder': [ 1, 2 ], 'createMarketOrder': [ 1 ] } } });
    const base =
        "class Base {\n" +
        "    capitalize (s: string): string { return s; }\n" +
        "    async createOrder (symbol: string, type: string, side: string, amount: number) { return undefined; }\n" +
        "}\n";

    test('the base and overrides print string, literal/proven callers pass through and any callers go through StringArg', () => {
        const input = base +
            "class Test extends Base {\n" +
            "    async createOrder (symbol: string, type: string, side: string, amount: number) {\n" +
            "        type = type.toUpperCase ();\n" +
            "        side = (side === 'buy') ? 'sell' : 'buy';\n" +
            "        if (type === 'LIMIT') {\n" +
            "            return 1;\n" +
            "        }\n" +
            "        return this.capitalize (type);\n" +
            "    }\n" +
            "    async closePosition (symbol: string, side = undefined) {\n" +
            "        return await this.createOrder (symbol, 'market', side, 0);\n" +
            "    }\n" +
            "    async createMarketOrder (symbol: string, side: string, amount: number) {\n" +
            "        return await this.createOrder (symbol, 'market', side, amount);\n" +
            "    }\n" +
            "}\n";
        const output = unified.transpileGo(input).content;
        expect(output).toContain('func (this *Test) createOrderBody(ch chan any, symbol any, typeVar string, side string, amount any) any {');
        expect(output).toContain('typeVar == "LIMIT"');
        expect(output).toContain('this.CreateOrder(symbol, "market", StringArg(side), 0)');
        expect(output).toContain('this.CreateOrder(symbol, "market", side, amount)');
        expect(output).toContain('createMarketOrderBody(ch chan any, symbol any, side string, amount any) any {');
    });

    test('a nil-compared table parameter fails the transpile', () => {
        const input = base +
            "class Test extends Base {\n" +
            "    async createOrder (symbol: string, type: string, side: string, amount: number) {\n" +
            "        return (side === undefined);\n" +
            "    }\n" +
            "}\n";
        expect(() => unified.transpileGo(input)).toThrow(/unifiedStringParams/);
    });
});

describe('go nil-initialised string accumulators', () => {
    const run = (body: string) => new Transpiler({ verbose: false }).transpileGo(
        'type Str = string | undefined;\nclass T {\n    safeString (o, k, d?): Str { return o[k]; }\n    f (method = \'GET\', o): Str {\n' + body + '    }\n}\n').content;
    test('a nil-initialised accumulator whose writes are strings prints var x string', () => {
        const output = run("        let arrStr: Str = undefined;\n        for (let j = 0; j < 2; j++) {\n            if (j > 0) {\n                arrStr += ',' + method;\n            } else {\n                arrStr = method;\n            }\n        }\n        return '[' + arrStr + ']';\n");
        expect(output).toContain('var arrStr string');
        expect(output).toMatch(/arrStr \+= ","\s*\+\s*method/);
        expect(output).toMatch(/return "\[" \+ arrStr \+ "\]"/);
        expect(output).not.toContain('Add(');
        expect(output).not.toContain('arrStr any');
    });
    test('a nil test on the local keeps the box and the helper', () => {
        const output = run("        let x: Str = undefined;\n        x = method + 'z';\n        if (x === undefined) { return 'none'; }\n        return x;\n");
        expect(output).toContain('var x any = nil');
        expect(output).toContain('if x == nil {');
    });
    test('a read before any write keeps the box (the nil is observable)', () => {
        const output = run("        const c1 = this.safeString (o, 'a', '');\n        const c2 = this.safeString (o, 'b', '');\n        let marketId: Str = undefined;\n        if (c1 !== undefined && c2 !== undefined) {\n            marketId = c1 + '-' + c2;\n        }\n        return this.safeString (o, marketId);\n");
        expect(output).toContain('var marketId any = nil');
        expect(output).toContain('marketId = *c1 + "-" + *c2');
    });
    test('a write from a nilable producer keeps the box', () => {
        const output = run("        let h: Str = undefined;\n        const settle = this.safeString (o, 's');\n        h = method + ':' + settle;\n        return this.safeString (o, h);\n");
        expect(output).toContain('var h any = nil');
    });
    test('a declaration with an initializer keeps the box (only nil-init locals are accumulators)', () => {
        const output = run("        const raw = this.safeString (o, 'r');\n        const joined = 'unsubscribe:' + raw;\n        return this.safeString (o, joined);\n");
        expect(output).toContain('var joined any = Add("unsubscribe:", raw)');
        expect(output).not.toContain('var joined string');
    });
    test('a single write is left to the nil-declared join passes', () => {
        const output = run("        let v: Str = undefined;\n        v = method;\n        const raw = this.safeString (o, 'r', '');\n        return raw + v;\n");
        expect(output).toContain('var v any = nil');
        const twice = run("        let w: Str = undefined;\n        w = method;\n        w += 'x';\n        return 'a' + w;\n");
        expect(twice).toContain('var w string');
    });
});

describe('this.privateKey call sites prove a string parameter', () => {
    test('signMessage(privateKey: string) takes string and slices natively', () => {
        const input =
            "class Base {\n    privateKey: string;\n}\n" +
            "class Test extends Base {\n" +
            "    signMessage (message: any, privateKey: string): string {\n" +
            "        return privateKey.slice (-64);\n" +
            "    }\n" +
            "    run (msg) {\n" +
            "        return this.signMessage (msg, this.privateKey);\n" +
            "    }\n" +
            "}\n";
        const output = new Transpiler({ verbose: false, go: {} }).transpileGo(input).content;
        expect(output).toContain('SignMessage(message any, privateKey string)');
        expect(output).toContain('privateKey[max(len(privateKey)');
    });
});

describe('go string locals rewritten by self-concatenation', () => {
    const run = (body: string) => new Transpiler({ verbose: false }).transpileGo(
        'type Str = string | undefined;\nclass T {\n    safeString (o, k): Str { return o[k]; }\n    f (q: string, o): string {\n' + body + '    }\n}\n').content;
    test('x = x + proven strings keeps the local a Go string and prints native +', () => {
        const output = run("        const q2 = 'z';\n        let p = '';\n        if (q.length > 0) { p = p + '&' + q2; }\n        p += 'x';\n        return p;\n");
        expect(output).toContain('var p string = ""');
        expect(output).toContain('p = p + "&" + q2');
        expect(output).toContain('p += "x"');
    });
    test('a nilable or boxed operand keeps the local any and the helper', () => {
        const output = run("        let a = '';\n        a = a + this.safeString (o, 'k');\n        let b = '';\n        b = b + o['k'];\n        return a + b;\n");
        expect(output).toContain('var a any = ""');
        expect(output).toContain('a = Add(a, this.SafeString(o, "k"))');
        expect(output).toContain('var b any = ""');
    });
    test('a defaulted SafeString write or += of a *string keeps the local any', () => {
        const output = run("        let c = '';\n        c = c + 'x';\n        c = this.safeString (o, 'k', 'd');\n        let d = '';\n        d += this.safeString (o, 'k', 'd');\n        return c + d;\n");
        expect(output).toContain('var c any = ""');
        expect(output).toContain('var d any = ""');
    });
});

describe('go GetValue on GetArgMap-bound parameters', () => {
    const run = (body: string) => {
        const inst = new Transpiler({ verbose: false });
        (inst as any).goTranspiler.CCXT_GO_GETARG_DECLARED_TYPES = { 'Dict': 'map[string]any' };
        return inst.transpileGo(
            'type Dict = { [key: string]: any };\nclass T {\n    safeString (a, b) { return a; }\n    f (d: any, params: Dict = {}) {\n' + body + '    }\n}\n').content;
    };
    test('a literal-key read handed to a safe* accessor indexes the map', () => {
        const output = run("        return this.safeString (params['x'], 'z');\n");
        expect(output).toContain('var params map[string]any = GetArgMap(optionalArgs, 0, map[string]any{})');
        expect(output).toContain('this.SafeString(params["x"], "z")');
    });
    test('a nested element read indexes the first step', () => {
        const output = run("        return params['x']['y'];\n");
        expect(output).toContain('GetValue(params["x"], "y")');
    });
    test('a bare read keeps GetValue once a write can store a *T value (it would lose its deref)', () => {
        const output = run("        params['w'] = this.safeString (params, 'q');\n        const a = params['x'];\n        return [ a, this.safeString (params, 'z') ];\n");
        expect(output).toContain('GetValue(params, "x")');
    });
    test('a bare read of a never-written (pointer-free) map parameter indexes natively', () => {
        const output = run("        const a = params['x'];\n        return [ a, this.safeString (params, 'z') ];\n");
        expect(output).toContain('var a any = params["x"]');
    });
    test('a compared element keeps the helper deref', () => {
        const output = run("        if (this.safeString (params['y'], 'k') === undefined) { return 1; }\n        if (params['y'] === undefined) { return 1; }\n        return 0;\n");
        expect(output).toContain('IsEqual(GetValue(params, "y"), nil)');
        expect(output).toContain('this.SafeString(params["y"], "k")');
    });
    test('a non-literal key keeps GetValue', () => {
        const output = run("        return this.safeString (params[d], 'z');\n");
        expect(output).toContain('GetValue(params, d)');
    });
    test('a parameter without a map binding keeps GetValue', () => {
        const output = new Transpiler({ verbose: false }).transpileGo(
            'class T {\n    safeString (a, b) { return a; }\n    f (d: any, params = undefined) {\n        return this.safeString (params[\'x\'], \'z\');\n    }\n}\n').content;
        expect(output).toContain('GetValue(params, "x")');
    });
});
describe('`key in dict` as a native two-value map read', () => {
    const getArg = () => {
        const inst = new Transpiler({ verbose: false });
        (inst as any).goTranspiler.CCXT_GO_GETARG_DECLARED_TYPES = { 'Dict': 'map[string]any' };
        return inst;
    };
    test('a GetArgMap-bound parameter is a comma-ok read', () => {
        const output = getArg().transpileGo('type Dict = { [key: string]: any };\nclass T {\n    f (params: Dict = {}) {\n        if (\'coin\' in params) {\n            return 1;\n        }\n        return 0;\n    }\n}\n').content;
        expect(output).toContain('if _, ok := params["coin"]; ok {');
        expect(output).not.toContain('InOp(params');
    });
    test('a hand-written map field is a comma-ok read', () => {
        const output = new Transpiler({ verbose: false }).transpileGo('class T {\n    trades = {};\n    f () {\n        if (\'tick\' in this.trades) {\n            return 1;\n        }\n        return 0;\n    }\n}\n').content;
        expect(output).toContain('if _, ok := this.Trades["tick"]; ok {');
        expect(output).not.toContain('InOp(');
    });
    test('Orderbooks keeps InOp: the book-local pass proves the stored book from that guard', () => {
        const output = new Transpiler({ verbose: false }).transpileGo('class T {\n    orderbooks = {};\n    f () {\n        if (\'tick\' in this.orderbooks) {\n            return 1;\n        }\n        return 0;\n    }\n}\n').content;
        expect(output).toContain('InOp(this.Orderbooks, "tick")');
        expect(output).not.toContain('this.Orderbooks["tick"]');
    });
    test('an unproven receiver and an unlisted field keep the helper', () => {
        const output = new Transpiler({ verbose: false }).transpileGo('class T {\n    positions = {};\n    f (trade) {\n        if (\'side\' in trade) {\n            return 1;\n        }\n        if (\'total\' in this.positions) {\n            return 2;\n        }\n        return 0;\n    }\n}\n').content;
        expect(output).toContain('InOp(trade, "side")');
        expect(output).toContain('InOp(this.Positions, "total")');
    });
    test('Balance and Timeframes are hand-written maps: a comma-ok read', () => {
        const output = new Transpiler({ verbose: false }).transpileGo('class T {\n    balance = {};\n    timeframes = {};\n    f () {\n        if (\'total\' in this.balance) {\n            return 1;\n        }\n        if (!(\'1m\' in this.timeframes)) {\n            return 2;\n        }\n        return 0;\n    }\n}\n').content;
        expect(output).toContain('if _, ok := this.Balance["total"]; ok {');
        expect(output).toContain('if _, ok := this.Timeframes["1m"]; !ok {');
        expect(output).not.toContain('InOp(this.Balance');
        expect(output).not.toContain('InOp(this.Timeframes');
    });
    test('Urls and HttpExceptions are hand-written maps: a comma-ok read', () => {
        const output = new Transpiler({ verbose: false }).transpileGo('class T {\n    urls = {};\n    httpExceptions = {};\n    f (code: number) {\n        const codeAsString = \'x\';\n        if (\'test\' in this.urls) {\n            return 1;\n        }\n        if ((code < 400) || !(codeAsString in this.httpExceptions)) {\n            return 2;\n        }\n        return 0;\n    }\n}\n').content;
        expect(output).toContain('if _, ok := this.Urls["test"]; ok {');
        expect(output).toContain('this.HttpExceptions[codeAsString]; ');
        expect(output).not.toContain('InOp(this.Urls');
        expect(output).not.toContain('InOp(this.HttpExceptions');
    });
    test('a string GetArg parameter indexes a base map field natively', () => {
        const transpiler: any = new Transpiler({ verbose: false });
        installCcxtGoHooks(transpiler.goTranspiler);
        const output = transpiler.transpileGo('class T {\n    timeframes = {};\n    f (symbol: string, timeframe = \'1m\') {\n        return { \'interval\': this.timeframes[timeframe] };\n    }\n}\n').content;
        expect(output).toContain('"interval": this.Timeframes[timeframe],');
        expect(output).not.toContain('GetValue(this.Timeframes');
    });
    test('a Balance entry compares natively against undefined', () => {
        const output = new Transpiler({ verbose: false }).transpileGo('class Exchange {\n    balance = {};\n    options = {};\n    f () {\n        const k = \'spot\';\n        if (this.balance[k] === undefined) {\n            this.balance[k] = {};\n        }\n        return (this.balance[k] !== undefined) && (this.options[k] === undefined);\n    }\n}\n').content;
        expect(output).toContain('if this.Balance[k] == nil {');
        expect(output).toContain('(this.Balance[k] != nil)');
        expect(output).not.toContain('IsEqual(this.Balance[k]');
    });
});

describe('go GetValue on GetArgMap-bound parameters: element-write values', () => {
    test('the value of an element write keeps GetValue for the write pass', () => {
        const inst = new Transpiler({ verbose: false });
        (inst as any).goTranspiler.CCXT_GO_GETARG_DECLARED_TYPES = { 'Dict': 'map[string]any' };
        const output = inst.transpileGo('type Dict = { [key: string]: any };\nclass T {\n    safeString (a, b) { return a; }\n    f (d: any, params: Dict = {}) {\n        const r = {};\n        params[\'w\'] = this.safeString (params, \'q\');\n        r[d] = params[\'x\'];\n        return r;\n    }\n}\n').content;
        expect(output).toContain('GetValue(params, "x")');
    });
});

describe('IsEqual(x, nil) on any locals fed by base safeValue / ws caches', () => {
    const root = nodepath.join(__dirname, 'files', 'tmp-isequal-x-nil-on-any', 'ts', 'src');
    const BASE = "export class Exchange {\n" +
        "    options: any = {};\n" +
        "    safeValue (o: any, k: any, d: any = undefined): any { return d; }\n" +
        "    safeValue2 (o: any, k1: any, k2: any, d: any = undefined): any { return d; }\n" +
        "    safeString (o: any, k: any, d: any = undefined): string { return d; }\n" +
        "}\n";
    const write = (body: string, extra = ''): string => {
        nodefs.mkdirSync(nodepath.join(root, 'base'), { recursive: true });
        nodefs.writeFileSync(nodepath.join(root, 'base', 'Exchange.ts'), BASE);
        const file = nodepath.join(root, 'ex.ts');
        nodefs.writeFileSync(file, "import { Exchange } from './base/Exchange';\n" +
            "class ArrayCache { constructor (n: any) {} }\n" +
            "export class ex extends Exchange {\n" + extra +
            "    f (p: any) {\n" + body + "        return 0;\n    }\n}\n");
        return new Transpiler({ verbose: false, go: {} }).transpileGoByPath(file).content;
    };
    afterAll(() => nodefs.rmSync(nodepath.join(__dirname, 'files', 'tmp-isequal-x-nil-on-any'), { recursive: true, force: true }));

    test('a base safeValue local compares natively', () => {
        const out = write("        const v = this.safeValue (p, 'a');\n        if (v === undefined) { return 1; }\n        if (v !== undefined) { return 2; }\n");
        expect(out).toContain('if v == nil {');
        expect(out).toContain('if v != nil {');
        expect(out).not.toContain('IsEqual(v, nil)');
    });
    test('the base class transpiled from text compares natively', () => {
        const base = "export class Exchange {\n" +
            "    safeValue (o: any, k: any, d: any = undefined): any { return d; }\n" +
            "    safeLedgerEntry (entry: any) {\n" +
            "        const fee = this.safeValue (entry, 'fee');\n" +
            "        if (fee !== undefined) { return fee; }\n" +
            "        return entry;\n" +
            "    }\n" +
            "}\n";
        const out = new Transpiler({ verbose: false, go: {} }).transpileGo(base).content;
        expect(out).toContain('if !IsEqual(fee, nil) {');
    });
    test('a class that declares the same accessor itself keeps the helper', () => {
        const out = new Transpiler({ verbose: false, go: {} }).transpileGo("export class ex {\n" +
            "    safeValue (o: any, k: any, d: any = undefined): any { return o; }\n" +
            "    f (p: any) {\n" +
            "        const v = this.safeValue (p, 'a');\n" +
            "        if (v === undefined) { return 1; }\n" +
            "        return 0;\n" +
            "    }\n" +
            "}\n").content;
        expect(out).toContain('IsEqual(v, nil)');
    });
    test('safeValue2 with a literal default and a ws cache write compare natively', () => {
        const out = write("        let v = this.safeValue2 (p, 'a', 'b', {});\n        if (v === undefined) { v = new ArrayCache (5); }\n        if (v === undefined) { return 1; }\n");
        expect(out).not.toContain('IsEqual(v, nil)');
    });
    test('a non-literal default keeps the helper', () => {
        const out = write("        const v = this.safeValue (p, 'a', this.options);\n        if (v === undefined) { return 1; }\n");
        expect(out).toContain('IsEqual(v, nil)');
    });
    test('an exchange override of safeValue keeps the helper', () => {
        const out = write("        const v = this.safeValue (p, 'a');\n        if (v === undefined) { return 1; }\n",
            "    safeValue (o: any, k: any, d: any = undefined): any { return this.safeString (o, k); }\n");
        expect(out).toContain('IsEqual(v, nil)');
    });
    test('a later pointer write keeps the helper', () => {
        const out = write("        let v = this.safeValue (p, 'a');\n        if (p) { v = this.safeString (p, 'b'); }\n        if (v === undefined) { return 1; }\n");
        expect(out).toContain('IsEqual(v, nil)');
    });
});

// int/int64 widening and string-literal-union concat leaves
describe('go int/int64 widening and literal-union concat', () => {
    const squash = (output: string) => output.replace(/[\t ]+/g, ' ');
    test('int64 minus an int local widens the int side', () => {
        const input =
        "class Exchange {\n" +
        "    milliseconds (): number { return 1; }\n" +
        "    main (rows: string[]) {\n" +
        "        const n = rows.length;\n" +
        "        let now = this.milliseconds ();\n" +
        "        let x = undefined;\n" +
        "        x = now - n;\n" +
        "        return x;\n" +
        "    }\n" +
        "}\n";
        const output = squash(transpiler.transpileGo(input).content);
        expect(output).toContain('x = now - int64(n)');
        expect(output).not.toContain('Subtract(');
    });
    test('an int local times an int64 call widens the int side', () => {
        const input =
        "class Exchange {\n" +
        "    milliseconds (): number { return 1; }\n" +
        "    main (rows: string[]) {\n" +
        "        const n = rows.length;\n" +
        "        let x = undefined;\n" +
        "        x = n * this.milliseconds ();\n" +
        "        return x;\n" +
        "    }\n" +
        "}\n";
        const output = squash(transpiler.transpileGo(input).content);
        expect(output).toContain('x = int64(n) * this.Milliseconds()');
    });
    test('mixed-width Divide and Mod keep the helper (nil / NaN on a zero divisor)', () => {
        const input =
        "class Exchange {\n" +
        "    milliseconds (): number { return 1; }\n" +
        "    main (rows: string[]) {\n" +
        "        const n = rows.length;\n" +
        "        const now = this.milliseconds ();\n" +
        "        let x = undefined;\n" +
        "        x = now / n;\n" +
        "        let y = undefined;\n" +
        "        y = now % n;\n" +
        "        return [x, y];\n" +
        "    }\n" +
        "}\n";
        const output = squash(transpiler.transpileGo(input).content);
        expect(output).toContain('Divide(now, n)');
        expect(output).toContain('Mod(now, n)');
    });
    test('an any operand keeps Subtract', () => {
        const input =
        "class Exchange {\n" +
        "    main (a: any, rows: string[]) {\n" +
        "        const n = rows.length;\n" +
        "        let x = undefined;\n" +
        "        x = a - n;\n" +
        "        return x;\n" +
        "    }\n" +
        "}\n";
        const output = squash(transpiler.transpileGo(input).content);
        expect(output).toContain('Subtract(a, n)');
    });
    test('a *string narrowed to a string-literal union is a concat leaf', () => {
        const input =
        "class Exchange {\n" +
        "    safeStringUpper (a: any, b: string): string | undefined { return a; }\n" +
        "    main (order: any) {\n" +
        "        const type = this.safeStringUpper (order, 'type');\n" +
        "        if (type === 'STOP_MARKET' || type === 'STOP_LIMIT') {\n" +
        "            throw new Error ('Invalid order type: ' + type + '.');\n" +
        "        }\n" +
        "        return 'x' + type;\n" +
        "    }\n" +
        "}\n";
        const output = squash(transpiler.transpileGo(input).content);
        expect(output).toContain('Error(\"Invalid order type: \" + *typeVar + \".\")');
        // outside the guard the local may be nil: the helper stays
        expect(output).toContain('Add(\"x\", typeVar)');
    });
});

describe('go length / indexOf on proven non-nil *string', () => {
    const sq = (s: string) => s.replace(/\s+/g, ' ');
    test('a narrowed *string length and indexOf deref natively', () => {
        const input =
        "class Exchange {\n" +
        "    safeString (a, b, c = undefined): string | undefined { return a; }\n" +
        "    main (item) {\n" +
        "        const side = this.safeString (item, 'side');\n" +
        "        if (side !== undefined) {\n" +
        "            if (side.length < 1) { return 'a'; }\n" +
        "            if (side.indexOf ('-') >= 0) { return 'b'; }\n" +
        "        }\n" +
        "        return 'c';\n" +
        "    }\n" +
        "}\n";
        const output = sq(transpiler.transpileGo(input).content);
        expect(output).toContain('len(*side) < 1');
        expect(output).toContain('strings.Index(*side, "-")');
        expect(output).not.toContain('GetLength(side)');
        expect(output).not.toContain('GetIndexOf(side');
    });
    test('a defaulted SafeString local derefs; an un-narrowed nilable one keeps the helpers', () => {
        const input =
        "class Exchange {\n" +
        "    safeString (a, b, c = undefined): string | undefined { return a; }\n" +
        "    main (item) {\n" +
        "        const tag = this.safeString (item, 'tag', '');\n" +
        "        const raw = this.safeString (item, 'raw');\n" +
        "        const n = tag.length;\n" +
        "        return [ n, raw.length, raw.indexOf ('x'), tag.indexOf (raw) ];\n" +
        "    }\n" +
        "}\n";
        const output = sq(transpiler.transpileGo(input).content);
        expect(output).toContain('len(tag)');
        expect(output).toMatch(/Get(Array)?Length\(raw\)/);
        expect(output).not.toContain('len(*raw)');
        expect(output).toContain('if raw == nil { return -1 }'); // pre-existing guarded literal
        expect(output).not.toContain('strings.Index(*tag, raw');
    });
});

// typed local reads
describe('go string helpers on a *string narrowed to string literals', () => {
    test('a literal-union narrowed *string is dereferenced, a nilable or mixed one keeps the helper', () => {
        const input =
        "type Str = string | undefined;\n" +
        "class Base { safeString (a, b, c?): Str { return undefined; } }\n" +
        "class Test extends Base {\n" +
        "    main (d, n: number) {\n" +
        "        const x = this.safeString (d, 'a');\n" +
        "        const y = this.safeString (d, 'b');\n" +
        "        const z = this.safeString (d, 'c');\n" +
        "        const r = [];\n" +
        "        if ((x === 'TAKER') || (x === 'MAKER')) {\n" +
        "            r.push (x.toLowerCase ());\n" +
        "            r.push (x.split ('A'));\n" +
        "            r.push (x.toString ());\n" +
        "        }\n" +
        "        if ((y === 'Q') || (n === 1)) {\n" +
        "            r.push (y.toUpperCase ());\n" +
        "        }\n" +
        "        r.push (z.toLowerCase ());\n" +
        "        return r;\n" +
        "    }\n" +
        "}\n";
        const output = transpiler.transpileGo(input).content;
        expect(output).toContain('strings.ToLower(*x)');
        expect(output).toContain('strings.Split(*x, "A")');
        expect(output).toContain('r = append(r, *x)');
        // `y` is not narrowed when `n === 1` holds: helper kept
        expect(output).toContain('ToUpper(y)');
        expect(output).not.toContain('strings.ToUpper(*y)');
        // `z` is never tested: nil reaches the helper's "" branch
        expect(output).toContain('ToLower(z)');
        expect(output).not.toContain('strings.ToLower(*z)');
    });
});

// currency rows (Currency()/SafeCurrency() return CurrencyTyped rows) read bare
describe('go GetValue on currency rows', () => {
    const run = (body: string) => {
        const inst: any = new Transpiler({ verbose: false });
        const g = inst.goTranspiler;
        const upstream = g.goIndexableTypeOf;
        // stands in for the ccxt printed-declaration table: `c` is declared map[string]any
        g.goIndexableTypeOf = function (node, printed) {
            const known = upstream.call(this, node, printed);
            if ((known !== undefined) || (node?.text !== 'c')) {
                return known;
            }
            const access = node.parent;
            return ((access?.expression === node) && (this['goMapParam' + 'ReadOk'](node, access) !== 'map[string]any')) ? undefined : 'map[string]any';
        };
        return inst.transpileGo("interface CurrencyInterface { id: string; code: string; }\ntype Currency = CurrencyInterface | undefined;\n" +
            "class T {\n    currency (code: string): CurrencyInterface { return undefined; }\n    safeCurrency (id: string): CurrencyInterface { return undefined; }\n" +
            "    safeDict (a, b) { return a; }\n    f (code: string) {\n        let c: Currency = undefined;\n" + body + "    }\n}\n").content;
    };
    test('a local written only by this.currency reads bare', () => {
        const out = run("        if (code) { c = this.currency (code); }\n        const b = c['id'];\n        return b;\n");
        expect(out).toContain('var b any = c["id"]');
    });
    test('a local written by this.safeCurrency reads bare', () => {
        const out = run("        c = this.safeCurrency (code);\n        return c['code'];\n");
        expect(out).toContain('return c["code"]');
    });
    test('another write keeps GetValue', () => {
        const out = run("        c = this.currency (code);\n        c = this.safeDict (code, 'x');\n        return c['id'];\n");
        expect(out).toContain('GetValue(c, "id")');
    });
    test('a compared read keeps GetValue', () => {
        const out = run("        c = this.currency (code);\n        if (c['id'] === 'x') { return 1; }\n        return 0;\n");
        expect(out).not.toContain('c["id"] ==');
    });
});

describe('go container locals from the checker type', () => {
    const squash = (output: string) => output.replace(/[\t\n ]+/g, ' ').trim();
    const dictPrefix = "type Dict = { [key: string]: any };\n";
    const transpile = (input: string) => squash(transpiler.transpileGo(dictPrefix + input).content);

    test('a Dict local written from a helper call keeps the box (no conversion helper)', () => {
        const out = transpile(
            "class Exchange {\n" +
            "    helper (a: any): any { return a; }\n" +
            "    main (params: Dict) {\n" +
            "        let selected: Dict;\n" +
            "        if (params['a'] === undefined) {\n" +
            "            selected = this.helper (params['b']) as Dict;\n" +
            "        } else {\n" +
            "            selected = params['c'];\n" +
            "        }\n" +
            "        return selected['info'];\n" +
            "    }\n" +
            "}");
        expect(out).toContain('var selected any = nil');
        expect(out).not.toContain('MapTyped(');
        expect(out).toContain('GetValue(selected, "info")');
    });
    test('a Dict local handed on as a value keeps the box', () => {
        const out = transpile(
            "class Exchange {\n" +
            "    helper (a: any): any { return a; }\n" +
            "    main (params: Dict) {\n" +
            "        let selected: Dict;\n" +
            "        selected = this.helper (params) as Dict;\n" +
            "        return this.helper (selected);\n" +
            "    }\n" +
            "}");
        expect(out).toContain('var selected any = nil');
        expect(out).toContain('selected = this.Helper(params)');
    });
    test('a string[] literal local prints []string', () => {
        const out = transpile(
            "class Exchange {\n" +
            "    main (items: any) {\n" +
            "        const fields: string[] = [ 'free', 'used', 'total' ];\n" +
            "        return fields.length;\n" +
            "    }\n" +
            "}");
        expect(out).toContain('var fields []string = []string{"free", "used", "total"}');
        expect(out).toContain('len(fields)');
    });
    test('a string[] local written back from a safe list accessor keeps the box', () => {
        const out = transpile(
            "class Exchange {\n" +
            "    safeList (a, b, c) { return c; }\n" +
            "    main (items: any) {\n" +
            "        let types: string[] = [ 'spot' ];\n" +
            "        types = this.safeList (items, 'types', types);\n" +
            "        return types.length;\n" +
            "    }\n" +
            "}");
        expect(out).toContain('var types any = []any{"spot"}');
    });
    test('a Dict local written from a list accessor keeps the box', () => {
        const out = transpile(
            "class Exchange {\n" +
            "    safeList (a, b, c): any[] { return c; }\n" +
            "    main (params: Dict) {\n" +
            "        let data: Dict;\n" +
            "        data = this.safeList (params, 'data', []);\n" +
            "        return data['id'];\n" +
            "    }\n" +
            "}");
        expect(out).toContain('var data any = nil');
        expect(out).not.toContain('MapTyped(this.SafeList');
    });
    test('a string[] local that is pushed keeps the box', () => {
        const out = transpile(
            "class Exchange {\n" +
            "    main (items: any) {\n" +
            "        const fields: string[] = [ 'free' ];\n" +
            "        fields.push (items);\n" +
            "        return fields.length;\n" +
            "    }\n" +
            "}");
        expect(out).not.toContain('[]string{');
    });
});

describe('typed tuple slots from the producer', () => {
    const run = (body: string) => new Transpiler({ verbose: false }).transpileGo(
        "type Dict = { [key: string]: any };\n" +
        "type Str = string | undefined;\n" +
        "class T {\n" +
        "    resolve (a: any, p: Dict): [Str, Dict] { return [ undefined, p ]; }\n" +
        "    pick (a: any, p: Dict): [any, Dict] { return [ a, p ]; }\n" +
        "    listy (a: any, p: Dict): [any[], Dict] { return [ [], p ]; }\n" +
        "    handleOptionStringAndParams (a: any, b: any, c: any, d: any): [Str, Dict] { return [ undefined, d ]; }\n" +
        "    f (params: Dict = {}) {\n" + body + "    }\n" +
        "}\n").content;
    test('a Str slot reads SafeStringPtr; a container slot stays boxed', () => {
        const out = run("        const [ a, b ] = this.resolve ('x', params);\n        return [ a, b ];\n");
        expect(out).toContain('var a *string = SafeStringPtr(abVariable[0])');
        expect(out).toContain('GetValue(abVariable, 1)');
    });
    test('a list slot keeps GetValue', () => {
        const out = run("        const [ a, b ] = this.listy ('x', params);\n        return [ a, b ];\n");
        expect(out).toContain('a := GetValue(abVariable, 0)');
    });
    test('an any slot keeps GetValue', () => {
        const out = run("        const [ a, b ] = this.pick ('x', params);\n        return [ a, b ];\n");
        expect(out).toContain('a := GetValue(abVariable, 0)');
    });
    test('a slot that is written later keeps GetValue', () => {
        const out = run("        let [ a, b ] = this.resolve ('x', params);\n        a = this.safeString (params, 'y');\n        return [ a, b ];\n");
        expect(out).toContain('a := GetValue(abVariable, 0)');
    });
    test('a slot read through an index keeps GetValue', () => {
        const out = run("        const [ b, c ] = this.resolve ('x', params);\n        return params[b];\n");
        expect(out).toContain('b := GetValue(bcVariable, 0)');
    });
    test('a producer the build layer binds natively keeps the printed slots', () => {
        const out = run("        const [ a, b ] = this.handleOptionStringAndParams (params, 'm', 'k', undefined);\n        return [ a, b ];\n");
        expect(out).toContain('a := GetValue(abVariable, 0)');
    });
});

describe('slice parameters typed from their array annotation', () => {
    const run = (body: string) => new Transpiler({ verbose: false }).transpileGo(
        "type Dict = { [key: string]: any };\n" +
        "class Base { ok (a: any): any { return a; } }\n" +
        "class T extends Base {\n" + body + "}\n").content;
    test('a string[] parameter every caller passes as a string[] prints []string', () => {
        const out = run(
            "    idsCount (ids: string[]): number { return ids.length; }\n" +
            "    go (ids: string[]): number { return this.idsCount (ids); }\n");
        expect(out).toContain('IdsCount(ids []string)');
        expect(out).toContain('len(ids)');
        expect(out).not.toContain('GetArrayLength(ids)');
    });
    test('a Dict[] parameter every caller passes as a list prints []any', () => {
        const out = run(
            "    settlements (rows: Dict[]): number { return rows.length; }\n" +
            "    go (rows: Dict[]): number { return this.settlements (rows); }\n");
        expect(out).toContain('Settlements(rows []any)');
        expect(out).toContain('len(rows)');
    });
    test('a caller the printer cannot prove keeps the parameter boxed', () => {
        const out = run(
            "    idsCount (ids: string[]): number { return ids.length; }\n" +
            "    go (raw: any): number { return this.idsCount (raw); }\n");
        expect(out).toContain('IdsCount(ids any)');
        expect(out).toContain('GetArrayLength(ids)');
    });
    test('a []any parameter whose element is read keeps the boxed helper read', () => {
        const out = run(
            "    firstRow (rows: Dict[]): any { const row = rows[0]; return row; }\n" +
            "    go (rows: Dict[]): any { return this.firstRow (rows); }\n");
        expect(out).toContain('FirstRow(rows any)');
        expect(out).not.toContain('func() any {');
    });
});

describe('`x := y` aliases carry the source local printed type', () => {
    const run = (body: string) => new Transpiler({ verbose: false }).transpileGo(
        "type Dict = { [key: string]: any };\n" +
        "class Base { safeString (a: any, k: any, d: any = undefined): any { return d; } safeDict (a: any, k: any, d: any = undefined): any { return d; } }\n" +
        "class T extends Base {\n" + body + "}\n").content;
    test('an alias of a pointer local prints the pointer and compares natively', () => {
        const out = run(
            "    go (params: Dict): any {\n" +
            "        const s = this.safeString(params, 's');\n" +
            "        const t = s;\n" +
            "        return t === 'x';\n" +
            "    }\n");
        expect(out).toContain('var t *string = s');
        expect(out).toContain('t != nil && *t == \"x\"');
        expect(out).not.toContain('IsEqual(t');
    });
    test('an alias of an untyped producer local keeps the box', () => {
        const out = run(
            "    go (params: Dict): any {\n" +
            "        const opts = this.safeDict(params, 'opts');\n" +
            "        const alias = opts;\n" +
            "        return GetValue(alias, 'x');\n" +
            "    }\n");
        expect(out).toContain('var opts any = this.SafeDict(params, \"opts\")');
        expect(out).toContain('var alias any = opts');
        expect(out).toContain('GetValue(alias, \"x\")');
    });
    test('a chained read whose intermediate is untyped keeps the helper', () => {
        const out = run(
            "    go (a: Dict): any {\n" +
            "        return a['x']['y'];\n" +
            "    }\n");
        expect(out).toContain('GetValue(GetValue(a, \"x\"), \"y\")');
    });
});

describe('PredictionExchange cache fields declared map[string]any print natively', () => {
    const FIELDS = ['Outcomes', 'Outcomes_by_id', 'Events', 'Events_by_slug'];
    const HEAD =
        "type Dictionary<T> = { [key: string]: T };\n" +
        "type Dict = Dictionary<any>;\n" +
        "class BaseExchange {\n" +
        "    events: any = undefined;\n" +
        "    safeString (a: any, k: any, d: any = undefined): string { return d; }\n" +
        "    safeValue (a: any, k: any, d: any = undefined): any { return d; }\n" +
        "    safeString2 (a: any, k1: any, k2: any, d: any = undefined): string { return d; }\n" +
        "}\n" +
        "class PredictionExchange extends BaseExchange {\n" +
        "    outcomes: Dictionary<any> | undefined = undefined;\n" +
        "    outcomes_by_id: Dictionary<any> | undefined = undefined;\n" +
        "    events: Dictionary<any> | undefined = undefined;\n" +
        "    events_by_slug: Dictionary<any> | undefined = undefined;\n";
    const run = (body: string, fields: string[] = FIELDS) => new Transpiler({ verbose: false, go: { predictionMapFields: fields } }).transpileGo(
        HEAD + body + "}\n").content;
    const SET =
        "    setEvents (events: any[]): Dictionary<any> {\n" +
        "        if (this.events === undefined) {\n" +
        "            this.events = {};\n" +
        "        }\n" +
        "        for (let i = 0; i < events.length; i++) {\n" +
        "            const event = this.safeValue (events, i);\n" +
        "            const id = this.safeString (event, 'id');\n" +
        "            if (id !== undefined) {\n" +
        "                this.events[id] = event;\n" +
        "            }\n" +
        "        }\n" +
        "        return this.events;\n" +
        "    }\n";
    test('nil tests, the nil-guarded pointer-key write and the map return print natively', () => {
        const out = run(SET);
        expect(out).toContain('if this.Events == nil {');
        expect(out).toContain('this.Events[*id] = event');
        expect(out).not.toContain('AddElementToObject(this.Events');
        expect(out).not.toContain('IsEqual(this.Events');
    });
    test('a field the table does not declare a map keeps the helper calls', () => {
        const out = run(SET, ['Outcomes']);
        expect(out).toContain('IsEqual(this.Events, nil)');
        expect(out).toContain('AddElementToObject(this.Events, id, event)');
    });
    test('a write with no initialising store before it, or under no key guard, keeps AddElementToObject', () => {
        const bare = run(
            "    put (id: Str, event: any): void {\n" +
            "        if (id !== undefined) {\n" +
            "            this.events[id] = event;\n" +
            "        }\n" +
            "    }\n");
        expect(bare).toContain('AddElementToObject(this.Events, id, event)');
        const unguarded = run(
            "    put (event: any): void {\n" +
            "        if (this.events === undefined) {\n" +
            "            this.events = {};\n" +
            "        }\n" +
            "        const id = this.safeString (event, 'id');\n" +
            "        this.events[id] = event;\n" +
            "    }\n");
        expect(unguarded).toContain('AddElementToObject(this.Events, id, event)');
    });
    test('a value that can hold a pointer box keeps AddElementToObject (it derefs)', () => {
        const out = run(
            "    put (event: any): void {\n" +
            "        if (this.events === undefined) {\n" +
            "            this.events = {};\n" +
            "        }\n" +
            "        const id = this.safeString (event, 'id');\n" +
            "        const name = this.safeString (event, 'name');\n" +
            "        if (id !== undefined) {\n" +
            "            this.events[id] = name;\n" +
            "        }\n" +
            "    }\n");
        expect(out).toContain('AddElementToObject(this.Events, id, name)');
    });
    test('string-key reads and the key range go native; an any key keeps GetValue', () => {
        const out = run(
            "    each (k: any): any[] {\n" +
            "        const result: Dict[] = [];\n" +
            "        const keys = Object.keys (this.events);\n" +
            "        for (let i = 0; i < keys.length; i++) {\n" +
            "            const event: Dict = this.events[keys[i]];\n" +
            "            const identity = this.safeString2 (event, 'id', 'event', keys[i]);\n" +
            "            result.push (event);\n" +
            "        }\n" +
            "        const lit = this.events['lit'];\n" +
            "        const dyn = this.events[k];\n" +
            "        return result;\n" +
            "    }\n");
        expect(out).toContain('var keys []string = nil');
        expect(out).toContain('for objectKey := range this.Events {');
        expect(out).not.toContain('ObjectKeys(this.Events)');
        expect(out).toContain('this.Events[keys[i]]');
        expect(out).toContain('"event", keys[i])');
        expect(out).toContain('this.Events["lit"]');
        expect(out).toContain('GetValue(this.Events, k)');
    });
    test('a duplicated nil test collapses to one and loses its parentheses under &&', () => {
        const out = run(
            "    cached (): any {\n" +
            "        const reload = false;\n" +
            "        if (!reload && (this.events !== undefined && this.events !== null)) {\n" +
            "            return this.events;\n" +
            "        }\n" +
            "        return undefined;\n" +
            "    }\n");
        expect(out).toContain('!reload && this.Events != nil {');
        expect(out).not.toContain('this.Events != nil && this.Events != nil');
    });
    test('a local or parameter named like a cache field is not the cache', () => {
        const out = run(
            "    other (events: any): any {\n" +
            "        if (events === undefined) {\n" +
            "            return undefined;\n" +
            "        }\n" +
            "        return events['a'];\n" +
            "    }\n");
        expect(out).not.toContain('events == nil');
        expect(out).not.toContain('events["a"]');
    });
});

// FM-A9F L1: the ws caches BaseExchange owns (orderbooks / ohlcvs / trades / fundingRates) are plain Go
// map fields, so a reset through createSafeDictionary prints the map literal, never the sync.Map-backed
// dictionary a map field cannot hold. Keyed on the checker declaration (a property of the base exchange
// class), not on the printed field name.
describe('go ws cache field init (FM-A9F L1)', () => {
    const squash = (output: string) => output.replace(/[\t ]+/g, ' ');
    test('the four cache fields reset to a map literal', () => {
        const input =
        "class Exchange {\n" +
        "    orderbooks: any = {};\n" +
        "    ohlcvs: any;\n" +
        "    trades: any;\n" +
        "    fundingRates: any = {};\n" +
        "    cleanWsData () {\n" +
        "        this.orderbooks = this.createSafeDictionary (true);\n" +
        "        this.ohlcvs = this.createSafeDictionary (true);\n" +
        "        this.trades = this.createSafeDictionary ();\n" +
        "        this.fundingRates = this.createSafeDictionary (true);\n" +
        "    }\n" +
        "}\n";
        const output = squash(transpiler.transpileGo(input).content);
        expect(output).toContain('this.Orderbooks = map[string]any{}');
        expect(output).toContain('this.Ohlcvs = map[string]map[string]any{}');
        expect(output).toContain('this.Trades = map[string]any{}');
        expect(output).toContain('this.FundingRates = map[string]any{}');
        expect(output).not.toContain('CreateSafeDictionary');
    });
    test('a field of another class or another dictionary keeps the call', () => {
        const input =
        "class Exchange {\n" +
        "    balance: any = {};\n" +
        "    createSafeDictionary (isWs = false) { return {}; }\n" +
        "    cleanWsData () {\n" +
        "        this.balance = this.createSafeDictionary (true);\n" +
        "    }\n" +
        "}\n" +
        "class Other {\n" +
        "    orderbooks: any = {};\n" +
        "    createSafeDictionary (isWs = false) { return {}; }\n" +
        "    f () {\n" +
        "        this.orderbooks = this.createSafeDictionary (true);\n" +
        "    }\n" +
        "}\n";
        const output = squash(transpiler.transpileGo(input).content);
        expect(output).toContain('this.Balance = map[string]any{}');
        expect(output).toContain('this.Orderbooks = this.CreateSafeDictionary(true)');
    });
});

describe('go literal-defaulted safeString locals are strings', () => {
    const squash = (output: string) => output.replace(/[\t ]+/g, ' ');
    const body = (input: string) => squash(transpiler.transpileGo(
        "class Exchange {\n" +
        "    safeString (a: any, b: string, c: any): string | undefined { return a; }\n" +
        "    f (x: any): any { return x; }\n" +
        "    main (p: any, q: any) {\n" + input +
        "    }\n" +
        "}\n").content);
    test('literal comparisons, concat operands and string methods read the string', () => {
        const output = body(
            "        const m = this.safeString (p, 'k', 'd');\n" +
            "        if (m === 'a') { return 1; }\n" +
            "        return [ m + 'x', m.split ('-'), m.length ];\n");
        expect(output).toContain('var m string = *this.SafeString(p, "k", "d")');
        expect(output).toContain('if m == "a" {');
        expect(output).toContain('strings.Split(m, "-")');
        expect(output).not.toContain('*m');
    });
    test('literal and defaulted-call writes keep the string', () => {
        const output = body(
            "        let m = this.safeString (p, 'k', 'd');\n" +
            "        m = 'z';\n" +
            "        m = this.safeString (q, 'j', m);\n" +
            "        return m + 'x';\n");
        expect(output).toContain('var m string = *this.SafeString(p, "k", "d")');
        expect(output).toContain('m = "z"');
        expect(output).toContain('m = *this.SafeString(q, "j", m)');
        expect(output).toContain('return m + "x"');
    });
    test('a nil test, a return, a call argument, an object value or a nilable write keeps the pointer', () => {
        for (const use of [ "if (m !== undefined) { return 1; }\n        return m + 'x';", 'return m;', 'this.f (m);\n        return 1;',
            "return { 'k': m };", "m = this.safeString (q, 'j');\n        return m + 'x';" ]) {
            const output = body("        let m = this.safeString (p, 'k', 'd');\n        " + use + "\n");
            expect(output).toContain('var m *string = this.SafeString(p, "k", "d")');
        }
    });
    test('an `in` key and padStart reads keep the string', () => {
        const output = squash(transpiler.transpileGo(
            "class Exchange {\n" +
            "    safeString (a: any, b: string, c: any): string | undefined { return a; }\n" +
            "    main (p: any, q: any) {\n" +
            "        const m = this.safeString (p, 'k', 'd');\n" +
            "        return [ m.padStart (64, '0'), (m in this.markets) ];\n" +
            "    }\n" +
            "}\n").content);
        expect(output).toContain('var m string = *this.SafeString(p, "k", "d")');
        expect(output).toContain('InOp(this.Markets, m)');
        expect(output).not.toContain('*m');
    });
    test('an argument for a string-typed parameter stays the string, an any parameter keeps the pointer', () => {
        const src = (call: string) =>
            "class Exchange {\n" +
            "    safeString (a: any, b: string, c: any): string | undefined { return a; }\n" +
            "    g (x: any, y: string): string { return y; }\n" +
            "    h (x: any, y: any): any { return y; }\n" +
            "    main (p: any, q: any) {\n" +
            "        const m = this.safeString (p, 'k', 'd');\n" +
            "        return " + call + ";\n" +
            "    }\n" +
            "}\n";
        const typed = squash(transpiler.transpileGo(src('this.g (q, m)')).content);
        expect(typed).toContain('var m string = *this.SafeString(p, "k", "d")');
        expect(typed).not.toContain('*m');
        const boxed = squash(transpiler.transpileGo(src('this.h (q, m)')).content);
        expect(boxed).toContain('var m *string = this.SafeString(p, "k", "d")');
    });
    test('an `as string` initializer and a Str annotation take the same string', () => {
        const output = squash(transpiler.transpileGo(
            "type Str = string | undefined;\n" +
            "class Exchange {\n" +
            "    safeString (a: any, b: string, c: any): string | undefined { return a; }\n" +
            "    main (p: any) {\n" +
            "        const m = this.safeString (p, 'k', '') as string;\n" +
            "        const n: Str = this.safeString (p, 'j', 'd');\n" +
            "        return [ m.length, n + 'x' ];\n" +
            "    }\n" +
            "}\n").content);
        expect(output).toContain('var m string = *this.SafeString(p, "k", "")');
        expect(output).toContain('var n string = *this.SafeString(p, "j", "d")');
        expect(output).not.toContain('*m');
        expect(output).not.toContain('*n');
    });
    test('a default that is not a literal keeps the pointer', () => {
        const output = body("        const m = this.safeString (p, 'k', q);\n        return m + 'x';\n");
        expect(output).toContain('var m *string = this.SafeString(p, "k", q)');
    });
});

describe('FM-A9F L3: negated lookups hoisted out of an || chain, indexed ws book receivers', () => {
    const head = 'type Str = string | undefined;\nclass T {\n    markets_by_id = {};\n    ohlcvs = {};\n    clients = {};\n    safeString (o, k, d = undefined): Str { return o[k]; }\n    safeDict (o, k, d = undefined) { return o[k]; }\n';
    const go = (body: string) => new Transpiler({ verbose: false }).transpileGo(head + body + '}\n').content;
    // the market tables are BaseExchange fields: their nil test is keyed on that declaration
    const goBase = (body: string) => {
        const t = new Transpiler({ verbose: false });
        installFmGo5G04(t.goTranspiler);
        return t.transpileGo(head.replace('class T {', 'class BaseExchange {') + body + '}\n').content;
    };
    test('a negated base-map lookup under || hoists the comma-ok behind the key nil test', () => {
        const output = goBase("    f (rows: any) {\n        for (let i = 0; i < rows.length; i++) {\n            const entryId = this.safeString (rows[i], 'symbol');\n            if ((entryId === undefined) || (this.markets_by_id === undefined) || !(entryId in this.markets_by_id)) {\n                continue;\n            }\n        }\n    }\n");
        expect(output).toContain('\t\tvar entryIdKnown bool\n\t\tif entryId != nil {\n\t\t\t_, entryIdKnown = this.Markets_by_id[*entryId]\n\t\t}\n\t\tif (entryId == nil) || (this.Markets_by_id == nil) || !entryIdKnown {');
        expect(output).not.toContain('InOp(');
    });
    test('a negated lookup on a map local alone hoists too', () => {
        const output = go("    g (rows: any) {\n        const result = {};\n        for (let i = 0; i < rows.length; i++) {\n            const code = this.safeString (rows[i], 'base');\n            if (!((code as string) in result)) {\n                result[code] = 1;\n            }\n        }\n    }\n");
        expect(output).toContain('\t\t_, codeKnown = result[*code]\n');
        expect(output).toContain('if !codeKnown {');
    });
    test('an impure term, a second lookup, an any key and a taken flag name keep the helper', () => {
        const impure = go("    f (o: any) {\n        const k = this.safeString (o, 'k');\n        if (this.safeString (o, 'x') === undefined || !(k in this.markets_by_id)) {\n            return 1;\n        }\n        return 0;\n    }\n");
        expect(impure).toContain('InOp(this.Markets_by_id, k)');
        expect(impure).not.toContain('kKnown');
        const two = go("    f (o: any) {\n        const k = this.safeString (o, 'k');\n        if (!(k in this.markets_by_id) || !(k in this.ohlcvs)) {\n            return 1;\n        }\n        return 0;\n    }\n");
        expect(two).not.toContain('kKnown');
        const anyKey = go("    f (o: any, k: any) {\n        if ((k === undefined) || !(k in this.markets_by_id)) {\n            return 1;\n        }\n        return 0;\n    }\n");
        expect(anyKey).not.toContain('kKnown');
        const taken = go("    f (o: any) {\n        const k = this.safeString (o, 'k');\n        const kKnown = 1;\n        if ((k === undefined) || !(k in this.markets_by_id)) {\n            return kKnown;\n        }\n        return 0;\n    }\n");
        expect(taken).toContain('InOp(this.Markets_by_id, k)');
        expect(taken).not.toContain('_, kKnown =');
    });
    test('a key the source proves non-nil (literal default, exit guard) needs no flag', () => {
        const dflt = go("    f (rows: any) {\n        for (let i = 0; i < rows.length; i++) {\n            const id = this.safeString (rows[i], 'symbol', '');\n            if ((this.markets_by_id === undefined) || !(id in this.markets_by_id)) {\n                continue;\n            }\n        }\n    }\n");
        expect(dflt).not.toContain('idKnown');
        const exit = go("    f (rows: any) {\n        for (let i = 0; i < rows.length; i++) {\n            const id = this.safeString (rows[i], 'symbol');\n            if (id === undefined) {\n                continue;\n            }\n            if ((this.markets_by_id === undefined) || !(id in this.markets_by_id)) {\n                continue;\n            }\n        }\n    }\n");
        expect(exit).not.toContain('idKnown');
    });
    test('a safeDict local with a literal default over this.options backs the hoist and is a typed map', () => {
        const output = go("    h (o: any, fetch: boolean) {\n        const key = this.safeString (o, 'k');\n        const loaded = this.safeDict (this.options, 'loaded', {});\n        if (fetch && !(key in loaded)) {\n            loaded[key] = true;\n        }\n    }\n");
        expect(output).toContain('var loaded map[string]any = this.SafeDictMap(this.Options, "loaded", map[string]any{})');
        expect(output).toContain('_, keyKnown = loaded[*key]');
        expect(output).toContain('EvalTruthy(fetch) && !keyKnown');
    });
    test('a book entry of this.ohlcvs is a native comma-ok behind its nil guard', () => {
        const output = go("    k (o: any) {\n        const symbol = 'BTC/USDT';\n        const timeframe = this.safeString (o, 'tf');\n        if (symbol in this.ohlcvs) {\n            if ((timeframe !== undefined) && (timeframe in this.ohlcvs[symbol])) {\n                delete this.ohlcvs[symbol][timeframe];\n            }\n        }\n    }\n");
        expect(output).toContain('if _, ok := this.Ohlcvs[symbol]; ok {');
        expect(output).toContain('if _, ok := this.Ohlcvs[symbol][*timeframe]; ok {');
        expect(output).not.toContain('InOp(');
    });
    test('an unguarded *string key into a book entry keeps the helper', () => {
        const output = go("    k (o: any) {\n        const symbol = 'BTC/USDT';\n        const timeframe = this.safeString (o, 'tf');\n        if (timeframe in this.ohlcvs[symbol]) {\n            return 1;\n        }\n        return 0;\n    }\n");
        expect(output).not.toContain('this.Ohlcvs[symbol][*timeframe]');
        expect(output).toContain('InOp(');
    });
    test('a literal-default *string book index is a plain string at the read', () => {
        const output = go("    k (o: any) {\n        const symbol = this.safeString (o, 's', '');\n        const timeframe = this.safeString (o, 'tf');\n        if (timeframe === undefined) {\n            return 0;\n        }\n        if (timeframe in this.ohlcvs[symbol]) {\n            return 1;\n        }\n        return 0;\n    }\n");
        // queue r5 union with the safestring-default-local rule: a literal-defaulted safeString local is a plain Go string,
        // so the book index reads `symbol` without the deref the *string typing of the A9F-L3 branch needed
        expect(output).toContain('if _, ok := this.Ohlcvs[symbol][*timeframe]; ok {');
        expect(output).not.toContain('this.Ohlcvs[*symbol]');
    });
    test('a ws client registry lookup is a comma-ok read', () => {
        const output = go("    n (o: any) {\n        const url = this.safeString (o, 'url');\n        if (url === undefined) {\n            return;\n        }\n        if ((this.clients !== undefined) && (url in this.clients)) {\n            return;\n        }\n    }\n");
        expect(output).toContain('if _, ok := this.Clients[*url]; ok {');
    });
});

describe('go JSON-origin list element reads', () => {
    const endpoint =
        "type Dict = {[key: string]: any};\n" +
        "interface Test {\n" +
        "    publicGetThing (params?: {}): Promise<any>;\n" +
        "}\n";
    const head =
        "    safeList(a, b, c?) { return a; }\n" +
        "    safeDict(a, b, c?) { return a; }\n" +
        "    safeString(a, b) { return a; }\n";
    const loop = (extra = '') =>
        "        const out = [];\n" +
        "        for (let i = 0; i < data.length; i++) {\n" +
        "            const entry = data[i];\n" +
        "            out.push (this.safeString (entry, 'id'));\n" +
        "        }\n" + extra +
        "        return out;\n";
    const run = (body: string, owner = "    async f (params = {}) {\n") =>
        transpiler.transpileGo(endpoint + "class Test {\n" + head + owner + body + "    }\n}\n").content;
    test('a counting-loop read of a list unboxed from an endpoint response is the slice index', () => {
        const output = run(
            "        const response = await this.publicGetThing (params);\n" +
            "        const data = this.safeList (response, 'data', []);\n" + loop());
        expect(output).toContain("var entry any = data[i]\n");
        expect(output).not.toContain("DerefScalar(data[i])");
    });
    test('an endpoint stub of an abstract class (return this.request) counts as the endpoint', () => {
        const output = transpiler.transpileGo(
            "type Dict = {[key: string]: any};\n" +
            "class Base {\n" +
            "    request (path: string, api: any, method: string, params: any) { return params; }\n" +
            "}\n" +
            "class Abstract extends Base {\n" +
            "    publicGetThing (params = {}): Promise<Dict> {\n" +
            "        return this.request ('thing', [ 'public' ], 'GET', params);\n" +
            "    }\n" +
            "}\n" +
            "class Test extends Abstract {\n" + head +
            "    async f (params = {}) {\n" +
            "        const response = await this.publicGetThing (params);\n" +
            "        const data = this.safeList (response, 'data', []);\n" + loop() +
            "    }\n}\n").content;
        expect(output).toContain("var entry any = data[i]\n");
    });
    test('a list unboxed from a safeDict of an endpoint response is the slice index', () => {
        const output = run(
            "        const response = await this.publicGetThing (params);\n" +
            "        const inner = this.safeDict (response, 'result', {});\n" +
            "        const data = this.safeList (inner, 'data', []);\n" + loop());
        expect(output).toContain("var entry any = data[i]\n");
        expect(output).not.toContain("DerefScalar(data[i])");
    });
    test('a response that escapes, is written or is not an endpoint keeps the guarded read', () => {
        const escapes = run(
            "        const response = await this.publicGetThing (params);\n" +
            "        const data = this.safeList (response, 'data', []);\n" + loop("        this.safeString (response, 'x');\n") +
            "        return response;\n");
        expect(escapes).toContain("DerefScalar(data[i])");
        const written = run(
            "        const response = await this.publicGetThing (params);\n" +
            "        const data = this.safeList (response, 'data', []);\n" + loop("        response['x'] = 1;\n"));
        expect(written).toContain("DerefScalar(data[i])");
        const own = transpiler.transpileGo(
            "class Test {\n" + head +
            "    async other (params = {}) { return this.safeDict (params, 'a', {}); }\n" +
            "    async f (params = {}) {\n" +
            "        const response = await this.other (params);\n" +
            "        const data = this.safeList (response, 'data', []);\n" + loop() + "    }\n}\n").content;
        expect(own).toContain("DerefScalar(data[i])");
    });
    test('a list that is rebound, written through or handed out keeps the guarded read', () => {
        const base =
            "        const response = await this.publicGetThing (params);\n" +
            "        const data = this.safeList (response, 'data', []);\n";
        // the write / escape re-boxes the local: no typed slice, so no native element read
        expect(run(base + loop("        data[0] = 1;\n"))).not.toContain("var entry any = data[i]\n");
        expect(run(base + loop("        this.safeString (data, 'x');\n"))).not.toContain("var entry any = data[i]\n");
        // an append keeps the typed slice but the list is no longer the decoded document
        const pushed = run(base + loop("        data.push (1);\n"));
        expect(pushed).toContain("DerefScalar(data[i])");
        expect(pushed).not.toContain("var entry any = data[i]\n");
    });
    test('a list of an unproven container keeps the guarded read', () => {
        const output = run(
            "        const response = this.safeDict (params, 'a', {});\n" +
            "        const data = this.safeList (response, 'data', []);\n" + loop());
        expect(output).toContain("DerefScalar(data[i])");
    });
});

describe('element reads of map locals the printer types through an awaited receive', () => {
    const fs = require('fs');
    const os = require('os');
    const path = require('path');
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'element-reads-of-map-locals-'));
    afterAll(() => {
        fs.rmSync(tmp, { 'recursive': true, 'force': true });
    });
    const run = (body: string): string => {
        const dir = path.join(tmp, 'ts', 'src', 'pro');
        fs.mkdirSync(dir, { 'recursive': true });
        const file = path.join(dir, 'venue.ts');
        fs.writeFileSync(file, 'type Dict = { [key: string]: any };\nclass Exchange {\n    async watchTicker (symbol: string, params: Dict = {}): Promise<Dict> { return {}; }\n    parseWsOrder (order: Dict): Dict { return order; }\n}\n'
            + 'class venue extends Exchange {\n    async run (symbol: string) {\n' + body + '    }\n}\n');
        const inst: any = new Transpiler({ verbose: false, go: { parser: { NUM_LINES_END_FILE: 0 }, asyncMethodSuffix: 'Async' } });
        installCcxtGoHooks(inst.goTranspiler);
        return inst.transpileGoByPath(file).content;
    };
    test('a local map tested against undefined indexes natively (IsEqual derefs its operand)', () => {
        const output = run("        const order: Dict = this.parseWsOrder ({});\n        if (order['x'] !== undefined) { return 1; }\n        return 0;\n");
        expect(output).toContain('var order map[string]any = this.ParseWsOrder(');
        expect(output).toContain('IsEqual(order["x"], nil)');
    });
    test('a local map compared with a non-nil operand keeps the helper deref', () => {
        const output = run("        const order: Dict = this.parseWsOrder ({});\n        if (order['x'] === true) { return 1; }\n        return 0;\n");
        expect(output).toContain('var order map[string]any = this.ParseWsOrder(');
        expect(output).toContain('GetValue(order, "x")');
    });
    test('a bare element read of the awaited map local indexes natively', () => {
        const output = run("        const order = await this.watchTicker (symbol);\n        return order['x'];\n");
        expect(output).toContain('order["x"]');
        expect(output).not.toContain('GetValue(order, "x")');
    });
});

describe('the base pair twins bind natively at every call site', () => {
    const fs = require('fs');
    const os = require('os');
    const path = require('path');
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'the-base-pair-twins-bind-'));
    afterAll(() => {
        fs.rmSync(tmp, { 'recursive': true, 'force': true });
    });
    const base =
        'type Dict = { [key: string]: any };\ntype Str = string | undefined;\n'
        + 'export class BaseExchange {\n'
        + '    handleParamString (params: object, paramName: string, defaultValue: Str = undefined): [Str, Dict] {\n'
        + '        const value = this.safeString (params, paramName, defaultValue);\n'
        + '        let paramsOmitted = params;\n'
        + '        if (value !== undefined) {\n            paramsOmitted = this.omit (params, paramName);\n        }\n'
        + '        return [ value, paramsOmitted ];\n    }\n'
        + '    handleOptionAndParams (params: object, methodName: Str, optionName: string, defaultValue: any = undefined): [any, Dict] {\n'
        + '        const [ callerMethodName, paramsCallerMethodName ] = this.handleParamString (params, \'callerMethodName\', methodName);\n'
        + '        return [ callerMethodName, paramsCallerMethodName ];\n    }\n'
        + '    safeString (a: any, b: any, c: any = undefined): Str { return a; }\n'
        + '    omit (a: any, b: any): Dict { return a; }\n'
        + '    checkAddress (a: any, b: any = undefined, c: any = undefined): void {}\n}\n';
    const run = (body: string, own = false): string => {
        const dir = path.join(tmp, 'ts', 'src', 'base');
        fs.mkdirSync(dir, { 'recursive': true });
        const file = path.join(dir, 'Exchange.ts');
        fs.writeFileSync(file, base + 'export default class Exchange extends BaseExchange {\n    run (params: Dict = {}) {\n' + body + '    }\n}\n');
        const inst: any = new Transpiler({ verbose: false, go: { parser: { NUM_LINES_END_FILE: 0 }, asyncMethodSuffix: 'Async' } });
        installCcxtGoHooks(inst.goTranspiler);
        return inst.transpileGoByPath(file).content;
    };
    test('a destructuring joins into one pair bind', () => {
        const output = run("        const [ tag, paramsTag ] = this.handleParamString (params, 'tag');\n        this.checkAddress (tag);\n        return paramsTag;\n");
        expect(output).toContain('tag, paramsTag := this.HandleParamString(params, "tag")');
        expect(output).not.toContain('TupleSlice');
        expect(output).not.toContain('GetValue(');
    });
    test('the twin prints the Go pair signature and return', () => {
        const output = run('');
        expect(output).toContain('HandleParamString(params any, paramName any, optionalArgs ...any) (*string, map[string]any)');
        expect(output).toContain('return value, MapTyped(paramsOmitted)');
    });
    test('a holder whose reads are all literal slot indexes binds the pair into two locals', () => {
        const output = run("        const tagAndParams = this.handleParamString (params, 'tag');\n        const tag: Str = tagAndParams[0];\n        const rest: Dict = tagAndParams[1];\n        this.checkAddress (tag);\n        return rest;\n");
        expect(output).toContain('tagAndParamsSlot0, tagAndParamsSlot1 := this.HandleParamString(params, "tag")');
        expect(output).toContain('var tag *string = tagAndParamsSlot0');
        expect(output).toContain('rest := tagAndParamsSlot1');
        expect(output).not.toContain('TupleSlice');
    });
    test('a holder that escapes or is written keeps the []any holder', () => {
        const escaped = run("        const tagAndParams = this.handleParamString (params, 'tag');\n        const tag: Str = tagAndParams[0];\n        this.checkAddress (tagAndParams);\n        return tag;\n");
        expect(escaped).toContain('TupleSlice(this.HandleParamString(params, "tag"))');
        const written = run("        const tagAndParams = this.handleParamString (params, 'tag');\n        tagAndParams[1] = {};\n        return tagAndParams[0];\n");
        expect(written).toContain('TupleSlice(this.HandleParamString(params, "tag"))');
    });
    test('the params slot of a base handleOptionAndParams holder reads by index', () => {
        const output = run("        const [ value, paramsOption1 ] = this.handleOptionAndParams (params, 'run', 'o1');\n        if (value !== undefined) {\n            const paramsOmitted = this.omit (paramsOption1, 'o2');\n            return [ value, paramsOmitted ];\n        }\n        return this.handleOptionAndParams (paramsOption1, 'run', 'o2');\n");
        expect(output).toContain('valueparamsOption1Variable[1]');
        expect(output).not.toContain('GetValue(valueparamsOption1Variable, 1)');
    });
    test('the base callerMethodName probe reads inline and map free', () => {
        const output = run('');
        expect(output).toContain('var callerMethodName *string = this.SafeString(params, "callerMethodName", methodName)');
        expect(output).toContain('paramsCallerMethodName := params');
        expect(output).toContain('paramsCallerMethodName = this.Omit(params, "callerMethodName")');
        expect(output).not.toContain('this.HandleParamString(params, "callerMethodName"');
    });
});

describe ('goMarketsAccessorInOp', () => {
    let transpiler: Transpiler;

    beforeAll(() => {
        transpiler = new Transpiler({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 } } });
    });

    const PRELUDE = 'type Str = string | undefined;\n' +
        'type Dict = {[key: string]: any};\n' +
        'class Base {\n' +
        '    markets: Dict = undefined;\n' +
        '    markets_by_id: Dict = undefined;\n' +
        '    currencies: Dict = undefined;\n' +
        '    safeString (a: any, b: any, c?: string): Str { return undefined; }\n' +
        '}\n';

    function go(body: string): string {
        return transpiler.transpileGo(PRELUDE + 'class Test extends Base {\n' + body + '}\n').content;
    }

    describe('a9j InOp on the market and currency book accessors', () => {
        test('a string-typed key reads the accessor map with comma-ok', () => {
            const out = go('    main () {\n' +
                '        const id = "BTC/USDT";\n' +
                '        if (id in this.markets_by_id) {\n' +
                '            return 1;\n' +
                '        }\n' +
                '        return 0;\n' +
                '    }\n');
            expect(out).toContain('_, ok := this.Markets_by_id[');
            expect(out).not.toContain('InOp(');
        });
        test('an any key keeps the helper', () => {
            const out = go('    main (key: any) {\n' +
                '        if (key in this.markets) {\n' +
                '            return 1;\n' +
                '        }\n' +
                '        return 0;\n' +
                '    }\n');
            expect(out).toContain('InOp(');
        });
    });
});

describe ('goWsCaches', () => {
    // FM-CACHE: the ws list caches. A BaseExchange field declared `ArrayCache` is the Go WsArrayCache field and
    // `Dictionary<ArrayCache>` the TradesCache; locals, closures and parameters that provably hold them are typed
    // WsArrayCache, `.append` on such a receiver is the plain interface method (the Appender assertion otherwise),
    // and the cache's own Get / Has / Store and nil compares print instead of the dictionary helpers.
    const BASE_FIXTURE = [
        'export class ArrayCache { append (x: any) {} }',
        'export class ArrayCacheBySymbolById extends ArrayCache {}',
        'export class ArrayCacheByTimestamp { append (x: any) {} }',
        'export class Exchange {',
        '    orders: ArrayCache | undefined = undefined;',
        '    triggerOrders!: ArrayCache;',
        '    liquidations: ArrayCache | undefined = undefined;',
        '    myLiquidations: ArrayCache | undefined = undefined;',
        '    myTrades: ArrayCache | undefined;',
        '    positions: any;',
        '    trades: Dictionary<ArrayCache>;',
        '    ohlcvs: Dictionary<Dictionary<ArrayCacheByTimestamp>>;',
        '    safeValue (a, b, c?) { return undefined; }',
        '    getValue (a, b) { return undefined; }',
        '    safeInteger (a, b, c) { return 1; }',
        '    safeString (a, b, c?) { return \'\'; }',
        '    safeSymbol (a) { return \'\'; }',
        '    createSafeDictionary () { return {}; }',
        '    parseTrade (a) { return {}; }',
        '    toArray (a) { return []; }',
        '    options: Dict = {};',
        '    handleMessage (client, message) {}',
        '}',
        '',
    ].join ('\n');
    const HEADER = [
        'import { Exchange, ArrayCache, ArrayCacheBySymbolById, ArrayCacheByTimestamp } from \'../base/Exchange\';',
        'type Dict = {[key: string]: any};',
        'type Dictionary<T> = {[key: string]: T};',
        '',
    ].join ('\n');

    function print (name: string, pro: string): string {
        const src = nodepath.join (__dirname, 'files', name, 'ts', 'src');
        nodefs.mkdirSync (nodepath.join (src, 'base'), { recursive: true });
        nodefs.mkdirSync (nodepath.join (src, 'pro'), { recursive: true });
        nodefs.writeFileSync (nodepath.join (src, 'base', 'Exchange.ts'), BASE_FIXTURE);
        nodefs.writeFileSync (nodepath.join (src, 'pro', 'ex.ts'), HEADER + pro);
        const t = new Transpiler ({ verbose: false, go: {} });
        installCcxtGoHooks (t.goTranspiler);
        return t.transpileGoByPath (nodepath.join (src, 'pro', 'ex.ts')).content;
    }

    afterAll (() => {
        const dir = nodepath.join (__dirname, 'files');
        for (const entry of nodefs.readdirSync (dir)) {
            if (entry.startsWith ('tmp-fmcache-')) {
                nodefs.rmSync (nodepath.join (dir, entry), { recursive: true, force: true });
            }
        }
    });

    const TRADES_AND_ORDERS = [
        "export class ex extends Exchange {",
        "    handleTrades (client: any, message: any) {",
        "        const symbol = this.safeSymbol (this.safeString (message, 'S'));",
        "        let stored = this.safeValue (this.trades, symbol);",
        "        if (stored === undefined) {",
        "            const limit = this.safeInteger (this.options, 'tradesLimit', 1000);",
        "            stored = new ArrayCache (limit);",
        "            this.trades[symbol] = stored;",
        "        }",
        "        const parsed = this.parseTrade (message);",
        "        stored.append (parsed);",
        "        client.resolve (stored, 'x');",
        "    }",
        "    handleTrades2 (client: any, message: any, symbol: string) {",
        "        if (!(symbol in this.trades)) {",
        "            const cache = new ArrayCache (10);",
        "            this.trades[symbol] = cache;",
        "        }",
        "        let trades;",
        "        if (symbol !== undefined) {",
        "            trades = this.trades[symbol];",
        "        }",
        "        trades.append (message);",
        "        const t2 = this.trades[symbol];",
        "        t2.append (message);",
        "        const k = new ArrayCacheBySymbolById (5);",
        "        k.append (message);",
        "        const z = this.safeValue (this.trades, symbol);",
        "        if (z === undefined) {",
        "            this.trades[symbol] = new ArrayCache (3);",
        "        }",
        "        delete this.trades[symbol];",
        "        return this.safeValue (this.trades, symbol);",
        "    }",
        "    initT () {",
        "        if (this.trades === undefined) {",
        "            this.trades = {};",
        "        }",
        "        this.trades = this.createSafeDictionary ();",
        "        if (this.safeValue (this.trades, 'a') === undefined) {",
        "            this.trades['a'] = new ArrayCache (3);",
        "        }",
        "    }",
        "    handleOrder (client: any, order: any, isTrigger: boolean) {",
        "        if (this.orders === undefined) {",
        "            this.orders = new ArrayCacheBySymbolById (10);",
        "        }",
        "        const orders = this.orders;",
        "        orders.append (order);",
        "        this.orders.append (order);",
        "        let myTrades = this.myTrades;",
        "        if (myTrades === undefined) {",
        "            myTrades = new ArrayCacheBySymbolById (10);",
        "        }",
        "        myTrades.append (order);",
        "        this.myTrades.append (order);",
        "        const stored = isTrigger ? this.triggerOrders : this.orders;",
        "        stored.append (order);",
        "        const liq = this.liquidations;",
        "        if (liq === undefined) {",
        "            return;",
        "        }",
        "        this.liquidations.append (order);",
        "        this.positions.append (order);",
        "        const cache: ArrayCache = this.positions;",
        "        cache.append (order);",
        "        const ohlcv = this.safeValue (this.ohlcvs, 'x');",
        "        ohlcv.append (order);",
        "        const ob = new ArrayCacheByTimestamp (3);",
        "        ob.append (order);",
        "        this.myLiquidations = undefined;",
        "    }",
        "    pruneCachedBySymbols (newCache: ArrayCacheBySymbolById, cache: ArrayCache, symbols: string[]): ArrayCache {",
        "        const entries = this.toArray (cache);",
        "        newCache.append (entries[0]);",
        "        return newCache;",
        "    }",
        "}",
    ].join("\n");

    const PRUNE_AND_NILS = [
        "export class ex extends Exchange {",
        "    cleanIt (topic: string, symbols: string[]) {",
        "        if (topic === 'orders' && this.orders !== undefined) {",
        "            const freshOrdersCache = new ArrayCacheBySymbolById (10);",
        "            this.orders = this.pruneCachedBySymbols (freshOrdersCache, this.orders, symbols);",
        "        } else if (topic === 'myTrades' && this.myTrades !== undefined) {",
        "            const freshTradesCache = new ArrayCacheBySymbolById (10);",
        "            this.myTrades = this.pruneCachedBySymbols (freshTradesCache, this.myTrades, symbols);",
        "        }",
        "    }",
        "    pruneCachedBySymbols (newCache: ArrayCacheBySymbolById, cache: ArrayCache, symbols: string[]): ArrayCache {",
        "        const entries = this.toArray (cache);",
        "        for (let i = 0; i < entries.length; i++) {",
        "            const entry = entries[i];",
        "            newCache.append (entry);",
        "        }",
        "        return newCache;",
        "    }",
        "    handleTradesNilOnly (message: any, symbol: string) {",
        "        let trades;",
        "        if (symbol !== undefined) {",
        "            trades = this.trades[symbol];",
        "        }",
        "        trades.append (message);",
        "        let other;",
        "        other = message;",
        "        other = this.trades[symbol];",
        "        other.append (message);",
        "        const asMap = this.trades;",
        "        asMap[symbol] = other;",
        "    }",
        "    handleRef (message: any, symbol: string) {",
        "        let weird;",
        "        weird = this.trades[symbol];",
        "        weird = message;",
        "        weird.append (message);",
        "    }",
        "}",
    ].join("\n");

    const NIL_ARM_TERNARY = [
        "export class ex extends Exchange {",
        "    handleP (client: any, message: any) {",
        "        const symbol = this.safeSymbol (this.safeString (message, 'S'));",
        "        let tradesArray = (symbol === undefined) ? undefined : this.safeValue (this.trades, symbol);",
        "        if (tradesArray === undefined) {",
        "            const tradesLimit = this.safeInteger (this.options, 'tradesLimit', 1000);",
        "            tradesArray = new ArrayCache (tradesLimit);",
        "            if (symbol !== undefined) {",
        "                this.trades[symbol] = tradesArray;",
        "            }",
        "        }",
        "        tradesArray.append (message);",
        "        client.resolve (tradesArray, 'x');",
        "    }",
        "}",
    ].join("\n");

    const CAST_AND_FIELD_NIL = [
        "export class ex extends Exchange {",
        "    handleU (messageHash: string, isSnapshot: boolean) {",
        "        const cache = this.orders as Dict;",
        "        if (this.orders !== undefined) {",
        "            const keys = Object.keys (cache);",
        "            delete cache[keys[0]];",
        "        }",
        "        if (isSnapshot || (this.myLiquidations === undefined)) {",
        "            this.myLiquidations = new ArrayCache (5);",
        "        }",
        "    }",
        "}",
    ].join ("\n");

    describe ('go ws list caches (FM-CACHE)', () => {
        const out = print ('tmp-fmcache-a', TRADES_AND_ORDERS);
        const pruned = print ('tmp-fmcache-b', PRUNE_AND_NILS);
        test ('base cache fields type their locals and nil compares are plain', () => {
            for (const want of [
                'var orders WsArrayCache = this.Orders', 'var myTrades WsArrayCache = this.MyTrades', 'if myTrades == nil {',
                'var liq WsArrayCache = this.Liquidations', 'if liq == nil {',
                'var stored WsArrayCache = func() WsArrayCache {',
            ]) {
                expect (out).toContain (want);
            }
            expect (out).not.toContain ('IsEqual(liq, nil)');
            expect (out).not.toContain ('IsEqual(myTrades, nil)');
        });
        test ('append is the plain method on a cache, the assertion elsewhere', () => {
            for (const want of [ '\torders.Append(order)', '\tthis.Orders.Append(order)', '\tthis.Liquidations.Append(order)', '\tk.Append(message)', '\tstored.Append(parsed)' ]) {
                expect (out).toContain (want);
            }
            for (const want of [ 'this.Positions.(Appender).Append(order)', 'cache.(Appender).Append(order)', 'ohlcv.(Appender).Append(order)' ]) {
                expect (out).toContain (want);
            }
        });
        test ('the trades cache prints native map reads, stores, membership and the typed locals', () => {
            for (const want of [
                'var stored WsArrayCache = this.Trades[*symbol]', 'this.Trades[*symbol] = stored', 'if !(symbol != nil && this.Trades[*symbol] != nil) {',
                'var trades WsArrayCache\n', 'trades = this.Trades[*symbol]', 'var t2 WsArrayCache = this.Trades[*symbol]',
                'if z == nil {', 'this.Trades = map[string]WsArrayCache{}', 'if this.Trades == nil {', 'if this.Trades["a"] == nil {',
            ]) {
                expect (out).toContain (want);
            }
            expect (out).not.toContain ('GetValue(this.Trades');
            expect (out).not.toContain ('InOp(this.Trades');
            expect (out).not.toContain ('AddElementToObject(this.Trades');
            expect (out).not.toContain ('map[string]any{}');
        });
        test ('a method returning only caches takes and answers WsArrayCache', () => {
            expect (pruned).toContain ('PruneCachedBySymbols(newCache WsArrayCache, cache WsArrayCache, symbols []string) WsArrayCache {');
            expect (pruned).toContain ('\tnewCache.Append(entry)');
        });
        test ('a local that is rebound to a foreign value keeps the box and the assertion', () => {
            expect (pruned).toContain ('var weird any = nil');
            expect (pruned).toContain ('weird.(Appender).Append(message)');
            expect (pruned).toContain ('var other any = nil');
            expect (pruned).toContain ('other.(Appender).Append(message)');
            expect (pruned).toContain ('var asMap any = this.Trades');
        });
        test ('a nil arm joins a cache arm of a ternary', () => {
            const nil = print ('tmp-fmcache-c', NIL_ARM_TERNARY);
            expect (nil).toContain ('var tradesArray WsArrayCache = func() WsArrayCache {');
            expect (nil).toContain ('\ttradesArray.Append(message)');
            expect (nil).toContain ('this.Trades[*symbol] = tradesArray');
        });
        test ('a cast of a cache field keeps the cache type and a field nil test is plain', () => {
            const cast = print ('tmp-fmcache-d', CAST_AND_FIELD_NIL);
            expect (cast).toContain ('var cache WsArrayCache = this.Orders');
            expect (cast).toContain ('(this.MyLiquidations == nil)');
            expect (cast).not.toContain ('IsEqual(this.MyLiquidations, nil)');
        });
    });
});

describe ('goMapKeysValuesRange', () => {
    // `const xs = Object.keys/values(m)` on a declared map[string]any prints the nil-preserving
    // range collection.

    let transpiler: Transpiler;
    beforeAll(() => {
        transpiler = new Transpiler({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 } } });
    });

    const go = (body: string) => transpiler.transpileGo(
        'class E {\n    groupBy(a, b): any { return a; }\n    safeDict(a, b): any { return a; }\n    keep(a): any { return a; }\n'
        + '    m(symbol: string, params = {}) {\n' + body + '\n    }\n}').content;

    describe('go Object.keys / Object.values on a declared map', () => {
        test('values on a map local collect by range', () => {
            const out = go("const g = this.groupBy(params, 'x'); const vs = Object.values (g); return this.keep (vs);");
            expect(out).toContain('var vs []any = nil\n');
            expect(out).toContain('if g != nil {');
            expect(out).toContain('vs = make([]any, 0, len(g))');
            expect(out).toContain('for _, objectValue := range g {');
            expect(out).toContain('vs = append(vs, objectValue)');
            expect(out).not.toContain('ObjectValues(');
        });
        test('keys on a map local collect by range', () => {
            const out = go("const g = {}; const ks = Object.keys (g); return this.keep (ks);");
            expect(out).toContain('var ks []string = nil\n');
            expect(out).toContain('ks = make([]string, 0, len(g))');
            expect(out).toContain('for objectKey := range g {');
            expect(out).not.toContain('ObjectKeys(');
        });
        test('the GetArg params bag is a declared map too', () => {
            const out = go('const ks = Object.keys (params); return this.keep (ks);');
            expect(out).toContain('for objectKey := range params {');
        });
        test('an any-boxed receiver keeps the helper', () => {
            const out = go("const g = this.safeDict(params, 'x'); const vs = Object.values (g); const ks = Object.keys (g); return [vs, ks];");
            expect(out).toContain('ObjectValues(g)');
            expect(out).toContain('ObjectKeys(g)');
            expect(out).not.toContain('range g');
        });
        test('a receiver that is rebound keeps the helper', () => {
            const out = go("let g = {}; g = this.groupBy(params, 'x'); const vs = Object.values (g); return this.keep (vs);");
            expect(out).toContain('ObjectValues(g)');
        });
        test('a values local the body nil-tests keeps the helper (the box is never nil)', () => {
            const out = go("const g = {}; const vs = Object.values (g); if (vs === undefined) { return 1; } return this.keep (vs);");
            expect(out).toContain('ObjectValues(g)');
        });
        test('a second collection reusing the loop variable name keeps the helper', () => {
            const out = go("const g = {}; const ks = Object.keys (g); const objectKey = 1; return [ks, objectKey];");
            expect(out).toContain('ObjectKeys(g)');
        });
        test('a call-expression receiver keeps the helper', () => {
            const out = go("const ks = Object.keys (this.groupBy(params, 'x')); return this.keep (ks);");
            expect(out).toContain('ObjectKeys(this.GroupBy(');
        });
    });

    describe('go Object.keys range keeps the loop-bounded element read native', () => {
        const loop = (body: string) => transpiler.transpileGo(
            'class E {\n    groupBy(a, b): any { return a; }\n    keep(a): any { return a; }\n'
            + '    m(symbol: string, params = {}) {\n' + body + '\n    }\n}').content;
        test('a string element of the collected keys reads as the slice index', () => {
            const out = loop("const g = {}; const ks = Object.keys (g); const out = {}; for (let i = 0; i < ks.length; i++) { const k = ks[i]; out[k] = this.keep (k); } return out;");
            expect(out).toContain('for objectKey := range g {');
            expect(out).toContain('var k string = ks[i]');
            expect(out).not.toContain('GetValue(ks, i)');
        });
    });
});

describe ('goClientSubscriptions', () => {
    // the ws client's subscriptions table (a map owned by one goroutine) hands every operation to
    // the owner, keyed on the checker-resolved `Client.subscriptions` declaration (no regex over printed Go).
    const t = (install = true) => {
        const x = new Transpiler ({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 } } });
        installCcxtGoLocalTypes (x.goTranspiler);
        if (install) { installFmGo5G01 (x.goTranspiler); }
        return x;
    };
    const SRC = [
        'type Dict = { [key: string]: any };',
        'class Client {',
        '    subscriptions: Record<string, any> = {};',
        '}',
        'class Other {',
        '    subscriptions: Record<string, any> = {};',
        '}',
        'class Ex {',
        '    safeString (a: any, b: any, c: any = undefined) { return undefined; }',
        '    safeValue (a: any, b: any, c: any = undefined) { return undefined; }',
        '    safeDict (a: any, b: any, c: any = undefined) { return undefined; }',
        '    m (client: Client, other: Other, h: string, v: any) {',
        '        if (h in client.subscriptions) {',
        '            delete client.subscriptions[h];',
        '        }',
        '        client.subscriptions[h] = v;',
        '        const keys = Object.keys (client.subscriptions);',
        '        const values = Object.values (client.subscriptions);',
        '        const s = this.safeString (client.subscriptions[h], \'id\');',
        '        const snap = this.safeString (client.subscriptions, h);',
        '        const nested = client.subscriptions[h][\'x\'];',
        '        const known = client.subscriptions[h];',
        '        const d = this.safeDict (client.subscriptions, h);',
        '        if (d === undefined) { return undefined; }',
        '        client.subscriptions[h][\'checksum\'] = true;',
        '        const typed = this.safeDict (client.subscriptions, h, {}) as Dict;',
        '        const u = other.subscriptions[h];',
        '        delete other.subscriptions[h];',
        '        return [ keys, values, s, snap, nested, known, u ];',
        '    }',
        '}',
        '',
    ].join ('\n');

    describe('go ws client subscriptions hand-off', () => {
        test('every access on Client.subscriptions calls the owner', () => {
            const out = t ().transpileGo (SRC).content;
            expect (out).toContain ('client.SubscriptionHas(h)');
            expect (out).toContain ('client.SubscriptionDel(h)');
            expect (out).toContain ('client.SubscriptionSet(h, v)');
            expect (out).toContain ('var keys []string = client.SubscriptionKeys()');
            expect (out).toContain ('var values []any = client.SubscriptionValues()');
            expect (out).toContain ('this.SafeString(client.SubscriptionGet(h), "id")');
            expect (out).toContain ('this.SafeString(client.SubscriptionsSnapshot(), h)');
            expect (out).toContain ('GetValue(client.SubscriptionGet(h), "x")');
            expect (out).toContain ('AddElementToObject(client.SubscriptionGet(h), "checksum", true)');
            expect (out).toContain ('var typed map[string]any = client.SubscriptionDict(h)');
        });
        test('an any-typed local keeps the dereferencing base read of the snapshot', () => {
            const out = t ().transpileGo (SRC).content;
            expect (out).toContain ('var known any = GetValue(client.SubscriptionsSnapshot(), h)');
        });
        test('fails without the hook (base printer keeps the helpers)', () => {
            const out = t (false).transpileGo (SRC).content;
            expect (out).not.toContain ('SubscriptionHas');
            expect (out).toContain ('InOp(client.Subscriptions, h)');
        });
        test('the same field name on another class is untouched', () => {
            const out = t ().transpileGo (SRC).content;
            expect (out).toContain ('GetValue(other.Subscriptions, h)');
            expect (out).toContain ('Remove(other.Subscriptions, h)');
        });
    });
});

describe ('goTypedIsEqualNil', () => {
    // nil tests of base fields and pointer-vs-negative-literal compares print native Go, keyed on the
    // checker-resolved declaration (no printed-text pass in ccxt).
    const t = (install = true) => {
        const x = new Transpiler ({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 } } });
        if (install) { installFmGo5G04 (x.goTranspiler); }
        return x;
    };
    const SRC = [
        'class BaseExchange {',
        '    features: any = undefined;',
        '    proxyUrl: any = undefined;',
        '    other: any = undefined;',
        '    safeInteger (o: any, k: string): number | undefined { return undefined; }',
        '    m (x: any) {',
        '        if (this.features === undefined) { return 1; }',
        '        if (this.proxyUrl !== undefined) { return 2; }',
        '        if (this.other === undefined) { return 3; }',
        '        const maker = this.safeInteger (x, "m");',
        '        if (maker === -1) { return 4; }',
        '        if (maker !== -1) { return 5; }',
        '        return 0;',
        '    }',
        '}',
        '',
    ].join ('\n');

    describe('go typed IsEqual nil / negative literal', () => {
        test('base fields and *int64 locals compare natively', () => {
            const out = t ().transpileGo (SRC).content;
            expect (out).toContain ('if this.Features == nil {');
            expect (out).toContain ('if this.ProxyUrl != nil {');
            expect (out).toContain ('IsEqual(this.Other, nil)');
            expect (out).toContain ('maker != nil && *maker == int64(-1)');
            expect (out).toContain ('maker == nil || *maker != int64(-1)');
        });
        test('fails without the hook', () => {
            const out = t (false).transpileGo (SRC).content;
            expect (out).toContain ('IsEqual(this.Features, nil)');
            expect (out).not.toContain ('*maker == int64(-1)');
        });
        test('same field names on an unrelated class are untouched', () => {
            const src = 'class Other {\n    features: any;\n    m () {\n        if (this.features === undefined) { return 1; }\n        return 0;\n    }\n}\n';
            const out = t ().transpileGo (src).content;
            expect (out).not.toContain ('this.Features == nil');
        });
    });
});

describe ('goTupleFirstResultBinds', () => {
    // a first-result read of the base-class `(T, map[string]any)` tuple helpers binds natively; keyed on the
    // checker-resolved declaring class (an override keeps the boxed read), no per-exchange name list in ccxt.
    const BASE = [
        'type Dict = { [key: string]: any };',
        'type Str = string | undefined;',
        'type Bool = boolean | undefined;',
        'class BaseExchange {',
        '    options: Dict = {};',
        '    handleMarketTypeAndParams (methodName: string, market: any = undefined, params: Dict = {}, defaultValue: Str = undefined): [Str, Dict] { return [ undefined, params ]; }',
        '    handleOptionBoolAndParams (params: Dict, methodName: Str, optionName: string, defaultValue: Bool = undefined): [Bool, Dict] { return [ true, params ]; }',
        '    handleUntilOption (key: string, request: Dict, params: Dict, multiplier: number = 1): [Dict, Dict] { return [ request, params ]; }',
        '}',
    ].join ('\n');
    const SRC = BASE + '\n' + [
        'class Ex extends BaseExchange {',
        '    f (params: Dict, market: any) {',
        '        const typeVar = this.handleMarketTypeAndParams ("fetchX", market, params)[0];',
        '        const filterClosed = this.handleOptionBoolAndParams (params, "fetchX", "filterClosed", false)[0];',
        '        const values = this.handleOptionBoolAndParams (params, "watchX", "uta", false);',
        '        const uta: Bool = values[0];',
        '        const requestUntil = this.handleUntilOption ("end", {}, params)[0];',
        '        return [ typeVar, filterClosed, uta, requestUntil ];',
        '    }',
        '}',
        '',
    ].join ('\n');
    const OVERRIDE = BASE + '\n' + [
        'class Ex extends BaseExchange {',
        '    handleMarketTypeAndParams (methodName: string, market: any = undefined, params: Dict = {}, defaultValue: Str = undefined): [Str, Dict] { return [ "x", params ]; }',
        '    f (params: Dict, market: any) {',
        '        const typeVar = this.handleMarketTypeAndParams ("fetchX", market, params)[0];',
        '        return typeVar;',
        '    }',
        '}',
        '',
    ].join ('\n');
    const STP = BASE + '\n' + [
        'class Ex extends BaseExchange {',
        '    handleOptionStringAndParams (params: Dict, methodName: Str, optionName: string, defaultValue: Str = undefined): [Str, Dict] { return [ undefined, params ]; }',
        '    f (params: Dict) {',
        '        let stp: Str = undefined;',
        '        [ stp, params ] = this.handleOptionStringAndParams (params, "createOrder", "stp");',
        '        if (stp !== undefined) {',
        '            this.options["k"] = stp.toUpperCase () + stp.toLowerCase ();',
        '        }',
        '        return params;',
        '    }',
        '}',
        '',
    ].join ('\n');
    const print = (src: string, install = true): string => {
        const x = new Transpiler ({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 } } });
        installCcxtGoLocalTypes (x.goTranspiler);
        if (install) { installFmGo5GP08 (x.goTranspiler); }
        const out = x.transpileGo (src).content;
        return out.slice (out.indexOf ('func (this *Ex)'));
    };

    describe ('go tuple first-result binds', () => {
        test('direct and held first-result reads bind natively', () => {
            const out = print (SRC);
            expect (out).toContain ('typeVar, _ := this.HandleMarketTypeAndParams("fetchX", market, params)');
            expect (out).toContain ('filterClosedValue, _ := this.HandleOptionBoolAndParams(params, "fetchX", "filterClosed", false)');
            expect (out).toContain ('filterClosed := &filterClosedValue');
            expect (out).toContain ('utaValue, _ := this.HandleOptionBoolAndParams(params, "watchX", "uta", false)');
            expect (out).toContain ('requestUntil, _ := this.HandleUntilOption("end", map[string]any{}, params)');
            expect (out).not.toContain ('TupleSlice');
            expect (out).not.toContain ('values');
        });
        test('fails without the hook (base printer keeps TupleSlice)', () => {
            expect (print (SRC, false)).toContain ('TupleSlice(this.HandleMarketTypeAndParams(');
        });
        test('an override of the helper keeps the boxed read', () => {
            const out = print (OVERRIDE);
            expect (out).toContain ('TupleSlice(this.HandleMarketTypeAndParams(');
            expect (out).not.toContain ('typeVar, _ :=');
        });
        test('a nil-declared local read through toUpperCase/toLowerCase is the pair\'s *string', () => {
            const out = print (STP);
            expect (out).toContain ('var stp *string = nil');
            expect (out).toContain ('stp, params = this.HandleOptionStringAndParams(params, "createOrder", "stp")');
            expect (out).not.toContain ('TupleSlice');
        });
    });
});

describe ('goRequestBook', () => {
    // request id / nonce counters and the last-response fields are owned by the request book; every rule is
    // keyed on the checker-resolved declaration (a member of the base `BaseExchange` class), not on printed text.
    const t = (install = true) => {
        const x = new Transpiler ({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 } } });
        if (install) { installFmGo5OG02 (x.goTranspiler); }
        return x;
    };
    const BASE = [
        'class BaseExchange {',
        '    options: any = {};',
        '    last_http_response: string | undefined = undefined;',
        '    last_response_headers: any = undefined;',
        '    last_request_headers: any = undefined;',
        '    sum (a: any, b: any) { return a + b; }',
        '    safeInteger (d: any, k: string, dflt: any = undefined) { return d[k] ?? dflt; }',
        '    lockId () { return undefined; }',
        '    unlockId () { return undefined; }',
        '    lockLastNonce () { return undefined; }',
        '    unlockLastNonce () { return undefined; }',
        '    nonce (): number { return 1; }',
        '    cleanRestData () {',
        '        this.last_http_response = undefined;',
        '        // this.last_json_response = undefined; // not unified prop',
        '        this.last_response_headers = undefined;',
        '        this.last_request_headers = undefined;',
        '    }',
        '    incrementingNonce (): number {',
        '        const currentNonce = this.nonce ();',
        '        this.lockLastNonce ();',
        '        const lastNonce = this.safeInteger (this.options, \'lastNonce\', 0);',
        '        const result = (currentNonce > lastNonce) ? currentNonce : lastNonce + 1;',
        '        this.options[\'lastNonce\'] = result;',
        '        this.unlockLastNonce ();',
        '        return result;',
        '    }',
        '}',
        '',
    ].join ('\n');
    const venue = (body: string, other = '') => BASE + 'class venue extends BaseExchange {\n' + body + other + '}\n';
    const DIRECT = '    requestId (): number {\n        this.lockId ();\n        const requestId = this.sum (this.safeInteger (this.options, \'requestId\', 0), 1);\n        this.options[\'requestId\'] = requestId;\n        this.unlockId ();\n        return requestId;\n    }\n';
    const CHAINED = '    requestId (): number {\n        this.lockId ();\n        const previous = this.safeInteger (this.options, \'reqid\', 0);\n        const next = this.sum (previous, 1);\n        this.options[\'reqid\'] = next;\n        this.unlockId ();\n        return next;\n    }\n';

    describe('go request book', () => {
        test('a direct counter span hands the increment to the owner', () => {
            const out = t ().transpileGo (venue (DIRECT)).content;
            expect (out).toContain ('var requestId int64 = this.NextRequestId("requestId")');
            expect (out).not.toContain ('this.LockId()');
            expect (out).not.toContain ('this.UnlockId()');
            expect (out).not.toContain ('this.Options["requestId"] =');
        });
        test('a seeded counter span drops the seed local', () => {
            const out = t ().transpileGo (venue (CHAINED)).content;
            expect (out).toContain ('var next int64 = this.NextRequestId("reqid")');
            expect (out).not.toContain ('previous');
            expect (out).not.toContain ('this.LockId()');
        });
        test('an unproven span keeps its lock pair', () => {
            const out = t ().transpileGo (venue ('    other (): number {\n        this.lockId ();\n        const x = this.sum (1, 2);\n        this.unlockId ();\n        return x;\n    }\n')).content;
            expect (out).toContain ('this.LockId()');
            expect (out).not.toContain ('NextRequestId');
        });
        test('a lock pair on a foreign class is untouched', () => {
            const src = 'class Other {\n    options: any = {};\n    lockId () {}\n    unlockId () {}\n    sum (a: any, b: any) { return a + b; }\n    safeInteger (d: any, k: string, f: any) { return f; }\n' + DIRECT + '}\n';
            const out = t ().transpileGo (src).content;
            expect (out).toContain ('this.LockId()');
            expect (out).not.toContain ('NextRequestId');
        });
        test('the base incrementingNonce hands its compare to the owner as int64', () => {
            const out = t ().transpileGo (BASE).content;
            expect (out).toContain ('func (this *BaseExchange) IncrementingNonce() int64 {\n\tvar currentNonce int64 = this.Nonce()\n\tvar result int64 = this.nextNonce(currentNonce)\n\treturn result\n}');
            expect (out).not.toContain ('this.LockLastNonce()');
            expect (out).not.toContain ('"lastNonce"');
        });
        test('cleanRestData resets the last-response fields through the owner', () => {
            const out = t ().transpileGo (BASE).content;
            expect (out).toContain ('\tthis.handOffRequestBook(requestBookOp{kind: requestBookReset})\n\t// this.last_json_response = undefined; // not unified prop\n}');
            expect (out).not.toContain ('this.Last_response_headers = nil');
            expect (out).not.toContain ('this.Last_request_headers = nil');
            expect (out).not.toContain ('this.Last_http_response = nil');
        });
        test('a read of last_http_response through this is the snapshot accessor', () => {
            const out = t ().transpileGo (venue ('    m (): any {\n        if ((this.last_http_response !== undefined) && (this.last_http_response !== \'\')) {\n            return this.last_http_response.indexOf (\'x\');\n        }\n        return undefined;\n    }\n')).content;
            expect (out).toContain ('this.GetLast_http_response()');
            expect (out).not.toContain ('this.Last_http_response');
        });
        test('the same field name on an unrelated class is untouched', () => {
            const out = t ().transpileGo ('class Other {\n    last_http_response: any = undefined;\n    m () {\n        return this.last_http_response;\n    }\n}\n').content;
            expect (out).toContain ('this.Last_http_response');
            expect (out).not.toContain ('GetLast_http_response');
        });
        test('fails without the hook (the printer keeps the lock pair and the field writes)', () => {
            const out = t (false).transpileGo (venue (DIRECT)).content;
            expect (out).toContain ('this.LockId()');
            expect (out).not.toContain ('NextRequestId');
            const base = t (false).transpileGo (BASE).content;
            expect (base).toContain ('this.Last_http_response = nil');
            expect (base).toContain ('this.LockLastNonce()');
        });
    });
});

describe ('goNonceInt64', () => {
    // Nonce () / IncrementingNonce () are int64 end to end.
    // The rule is keyed on the checker: a method named nonce () of a class chain ending in BaseExchange.nonce
    // prints int64 when every return is a provable int64 operand; a local fed by nonce () is an int64.

    let transpiler: Transpiler;
    beforeAll(() => {
        transpiler = new Transpiler({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 } } });
    });

    const BASE = 'type int = number;\ntype Int = number | undefined;\ntype Str = string | undefined;\n'
        + 'class BaseExchange {\n'
        + '    options: any;\n'
        + '    sum = sum;\n'
        + '    milliseconds (): int { return 1; }\n'
        + '    seconds (): int { return 1; }\n'
        + '    microseconds (): int { return 1; }\n'
        + '    safeInteger (o: any, k: string, d?: int): Int { return 1; }\n'
        + '    safeString (o: any, k: string, d?: string): Str { return d; }\n'
        + '    nonce (): int { return this.seconds (); }\n'
        + '    incrementingNonce (): int { return this.nonce (); }\n'
        + '}\n'
        + 'function sum (...xs: any[]): any { return 1; }\n';

    const go = (derived: string) => transpiler.transpileGo(BASE + 'class Venue extends BaseExchange {\n' + derived + '\n}\n').content;
    const venueNonce = (out: string) => out.substring(out.indexOf('func (this *Venue) Nonce()'));

    describe('go nonce is int64', () => {
        test('base nonce () prints int64', () => {
            expect(go('')).toContain('func (this *BaseExchange) Nonce() int64 {');
        });
        test('a clock override prints int64', () => {
            expect(go('override nonce (): int { return this.milliseconds (); }')).toContain('func (this *Venue) Nonce() int64 {');
        });
        test('a literal-default safeInteger difference prints int64', () => {
            const out = go("override nonce (): int { return this.milliseconds () - this.safeInteger (this.options, 'timeDifference', 0); }");
            expect(out).toContain('func (this *Venue) Nonce() int64 {');
            expect(out).toContain('return this.Milliseconds() - *this.SafeInteger(this.Options, "timeDifference", 0)');
        });
        test('a narrowed *int64 local difference prints int64', () => {
            const out = go("override nonce (): int { const d = this.safeInteger (this.options, 'td'); if (d === undefined) { throw new Error ('x'); } return this.milliseconds () - d; }");
            expect(out).toContain('func (this *Venue) Nonce() int64 {');
            expect(out).toContain('return this.Milliseconds() - *d');
        });
        test('two arms returning clocks print int64', () => {
            const out = go("override nonce (): int { const m = this.safeString (this.options, 'n', 'milliseconds'); if (m === 'milliseconds') { return this.milliseconds (); } return this.seconds (); }");
            expect(out).toContain('func (this *Venue) Nonce() int64 {');
        });
        test('this.sum of two int64 operands prints the native +', () => {
            const out = go('override nonce (): int { const t = this.seconds (); return this.sum (this.microseconds () * 1000, t); }');
            expect(out).toContain('func (this *Venue) Nonce() int64 {');
            expect(out).toContain('return this.Microseconds()*1000 + t');
            expect(venueNonce(out)).not.toContain('this.Sum(');
        });
        test('negative: this.sum with an unproven operand throws', () => {
            expect(() => go('override nonce (): int { const d: any = 1; return this.sum (this.seconds (), d); }')).toThrow(/nonce returns unproven/);
        });
        test('a local fed by nonce () / incrementingNonce () is an int64', () => {
            const out = go('f (): any { const n = this.nonce (); const m = this.incrementingNonce (); return [ n, m ]; }');
            expect(out).toContain('var n int64 = this.Nonce()');
            expect(out).toContain('var m int64 = this.IncrementingNonce()');
        });
        test('negative: a local rewritten with another value keeps its box', () => {
            const out = go('f (): any { let n = this.nonce (); n = this.safeString ({}, "k"); return n; }');
            expect(out).not.toContain('var n int64 = this.Nonce()');
        });
        test('negative: an unproven return throws instead of printing a wrong signature', () => {
            expect(() => go('override nonce (): int { const d: any = 1; return d; }')).toThrow(/nonce returns unproven/);
            expect(() => go('override nonce (): int { return this.milliseconds () - this.safeInteger (this.options, "k"); }')).toThrow(/nonce returns unproven/);
            expect(() => go('override nonce (): int { return this.milliseconds () / 2; }')).toThrow(/nonce returns unproven/);
        });
        test('negative: a nonce method of a class that is not a BaseExchange descendant is untouched', () => {
            const out = transpiler.transpileGo('class Other {\n    nonce (): any { return 1; }\n}\n').content;
            expect(out).toContain('func (this *Other) Nonce() any {');
        });
        test('negative: another method of a venue is untouched', () => {
            const out = go('override nonce (): int { return this.milliseconds (); }\n    other (): any { return 1; }');
            expect(out).toContain('func (this *Venue) Other() any {');
        });
    });
});

describe ('goWsCacheFields', () => {
    // element write, delete and `in` over the symbol-keyed ws map fields of BaseExchange
    const HEAD = 'type Dict = { [key: string]: any };\n'
        + 'class Exchange {\n'
        + '    ohlcvs: Dict = {};\n'
        + '    fundingRates: Dict = {};\n'
        + '    trades: Dict = {};\n'
        + '    safeString (d: any, k: any, def: any = undefined): string | undefined { return d; }\n'
        + '    safeSymbol (m: any): string | undefined { return m; }\n';
    const print = (body: string): string => {
        const t = new Transpiler ({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 } } });
        return t.transpileGo (HEAD + '    handle (message: Dict) {\n' + body + '\n    }\n}\n').content;
    };

    describe('go ws cache fields', () => {
        test('a map literal store behind a nil test is a native store (fails on the base printer)', () => {
            const out = print ("const symbol = this.safeString (message, 's'); this.ohlcvs[symbol] = {};");
            expect (out).toContain ('if symbol != nil {\n\t\tthis.Ohlcvs[*symbol] = map[string]any{}\n\t}');
            expect (out).not.toContain ('AddElementToObject(this.Ohlcvs');
        });
        test('an enclosing nil guard stores through the deref without a second guard', () => {
            const out = print ("const symbol = this.safeString (message, 's'); if (symbol !== undefined) { this.ohlcvs[symbol] = {}; }");
            expect (out).toContain ('this.Ohlcvs[*symbol] = map[string]any{}');
            expect (out).not.toContain ('if symbol != nil {\n\t\tif symbol != nil');
        });
        test('a pointer value keeps the helper', () => {
            const out = print ("const symbol = this.safeString (message, 's'); const rate = this.safeString (message, 'r'); this.fundingRates[symbol] = rate;");
            expect (out).toContain ('AddElementToObject(this.FundingRates');
        });
        test('an any-typed key keeps the helper', () => {
            const out = print ("this.ohlcvs[message['s']] = {};");
            expect (out).toContain ('AddElementToObject(this.Ohlcvs');
        });
        test('delete over a map field is native, behind the nil test of a pointer key', () => {
            const out = print ("const symbol = this.safeString (message, 's'); delete this.fundingRates[symbol];");
            expect (out).toContain ('if symbol != nil {\n\t\tdelete(this.FundingRates, *symbol)\n\t}');
            expect (out).not.toContain ('Remove(this.FundingRates');
        });
        test('delete over an untyped trades field keeps the helper', () => {
            const out = print ("const symbol = this.safeString (message, 's'); delete this.trades[symbol];");
            expect (out).toContain ('Remove(this.Trades, symbol)');
        });
        test('a delete used as an expression keeps the helper', () => {
            const out = print ("const symbol = this.safeString (message, 's'); const gone = delete this.fundingRates[symbol];");
            expect (out).not.toContain ('delete(this.FundingRates');
        });
        test('`in` over a ws map field with a guarded pointer key reads the comma-ok', () => {
            const out = print ("const symbol = this.safeString (message, 's'); if (symbol !== undefined) { if (symbol in this.fundingRates) { this.fundingRates[symbol] = {}; } }");
            expect (out).toContain ('_, ok := this.FundingRates[*symbol]; ok');
        });
    });
});

describe ('goPrintedMapLocalStores', () => {
    const installCcxtGoHooks = installCcxtGoHooksFromGoModule;
    // a native `m[k] = v` store on a map local the printer declares itself,
    // behind the nil test the helper applied; `(k as string)` keys; Trade / TransferEntry rows boxed to their map;
    // the params slot of a base tuple helper.
    const BASE =
        'export type Dict = { [key: string]: any };\n' +
        'type NullableDict = Dict | undefined;\n' +
        'type Str = string | undefined;\n' +
        'export interface Trade { id: string }\n' +
        'export interface TransferEntry { id: string }\n' +
        'export default class Exchange {\n' +
        '    safeDict (a: any, k: any, d: any = undefined): Dict { return a; }\n' +
        '    safeString (a: any, k: any, d: any = undefined): Str { return a; }\n' +
        '    parseTrade (t: any): Trade { return t; }\n' +
        '    parseTransfer (t: any): TransferEntry { return t; }\n' +
        '    handlePostOnly (a: any, b: any, p: Dict = {}): [ boolean, Dict ] { return [ false, p ]; }\n' +
        '    omit (a: any, b: any): Dict { return a; }\n';

    const run = (members: string, dir = 'ts/src', derived = false): string => {
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'f3g03-'));
        try {
            const src = path.join(tmp, dir);
            fs.mkdirSync(path.join(tmp, 'ts/src/base'), { recursive: true });
            fs.mkdirSync(src, { recursive: true });
            fs.writeFileSync(path.join(tmp, 'ts/src/base/Exchange.ts'), BASE + '}\n');
            const file = path.join(src, 'x.ts');
            fs.writeFileSync(file, (derived ? "import Exchange, { Dict, Trade, TransferEntry } from './base/Exchange.js';\nclass X extends Exchange {\n" : BASE) + members + '}\n');
            const t = new Transpiler({ verbose: false, go: { parser: { NUM_LINES_END_FILE: 0 } } });
            installCcxtGoHooks(t.goTranspiler);
            return t.transpileGoByPath(file).content;
        } finally {
            fs.rmSync(tmp, { recursive: true, force: true });
        }
    };
    const flat = (s: string) => s.replace(/\s+/g, ' ');

    describe('native stores on printed map locals', () => {
        test('a no-default safeDict local: the store sits behind the nil test the helper applied', () => {
            const out = run(
                '    f (orders: Dict, id: string, fee: Dict): any {\n' +
                '        const order = this.safeDict (orders, id);\n' +
                '        if (order !== undefined) {\n' +
                "            order['fee'] = fee;\n" +
                '            order[\'n\'] = 1;\n' +
                '        }\n' +
                '        return this.safeString (order, \'x\');\n' +
                '    }\n');
            expect(out).toContain('var order map[string]any = this.SafeDictMap(orders, id)');
            expect(flat(out)).toContain('if order != nil { order["n"] = 1 }');
            expect(out).not.toContain('AddElementToObject(order, "n"');
        });
        test('a never-nil safeDict default needs no nil test, and a pointer value keeps the helper', () => {
            const out = run(
                '    f (o: Dict, id: string): any {\n' +
                "        const d = this.safeDict (o, id, {});\n" +
                "        d['a'] = 1;\n" +
                "        d['b'] = this.safeString (o, 'b');\n" +
                '        return d;\n' +
                '    }\n');
            expect(out).toContain('d["a"] = 1');
        });
        test('an `as string` key is read through to the *string local it asserts', () => {
            const out = run(
                '    f (entries: any[]): any {\n' +
                '        const result: Dict = {};\n' +
                '        for (let i = 0; i < entries.length; i++) {\n' +
                "            const code = this.safeString (entries[i], 'c');\n" +
                "            result[code as string] = { 'a': 1 };\n" +
                '        }\n' +
                '        return result;\n' +
                '    }\n');
            expect(flat(out)).toContain('if code != nil { result[*code] = map[string]any{ "a": 1, } }');
            expect(out).not.toContain('AddElementToObject(result, code');
        });
        test('a nil-initialised NullableDict: the store keeps the nil test, the returned literal keeps the local typed', () => {
            const out = run(
                '    sign (hasKey: boolean): any {\n' +
                '        let requestHeaders: NullableDict = undefined;\n' +
                '        if (hasKey) {\n' +
                "            requestHeaders = { 'K': 'v' };\n" +
                "            requestHeaders['Content-Type'] = 'application/json';\n" +
                '        }\n' +
                "        return { 'headers': requestHeaders };\n" +
                '    }\n');
            expect(out).toContain('var requestHeaders map[string]any = nil');
            expect(flat(out)).toContain('if requestHeaders != nil { requestHeaders["Content-Type"] = "application/json" }');
        });
        test('a parsed Trade row is boxed where it is declared, and its stores are native', () => {
            const out = run(
                '    parseTrade (t: any): Trade {\n' +
                '        const parsed = super.parseTrade (t);\n' +
                "        parsed['takerOrMaker'] = 'maker';\n" +
                '        return parsed;\n' +
                '    }\n', 'ts/src/pro', true);
            expect(out).toContain('var parsed map[string]any = TradeToMap(base.ParseTrade(t))');
            expect(flat(out)).toContain('if parsed != nil { parsed["takerOrMaker"] = "maker" }');
        });
        test('a nil-initialised TransferEntry local boxes its writes and takes native stores', () => {
            const out = run(
                '    f (t: any, from: string): any {\n' +
                '        let transfer: TransferEntry | undefined = undefined;\n' +
                '        transfer = this.parseTransfer (t);\n' +
                "        if (this.safeString (transfer, 'from') === undefined) {\n" +
                "            transfer['from'] = 'spot';\n" +
                '        }\n' +
                '        return transfer;\n' +
                '    }\n', 'ts/src', true);
            expect(out).toContain('var transfer map[string]any = nil');
            expect(out).toContain('transfer = TransferEntryToMap(this.ParseTransfer(t))');
            expect(out).not.toContain('AddElementToObject(transfer,');
        });
        test('the params slot of a base tuple helper takes the guarded native store', () => {
            const out = run(
                '    f (p: Dict = {}): any {\n' +
                '        const [ postOnly, paramsPostOnly ] = this.handlePostOnly (false, false, p);\n' +
                "        paramsPostOnly['postOnly'] = true;\n" +
                '        return paramsPostOnly;\n' +
                '    }\n', 'ts/src', true);
            expect(flat(out)).toContain('if paramsPostOnly != nil { paramsPostOnly["postOnly"] = true }');
        });
        test('a receiver the printer does not type keeps the helper', () => {
            const out = run(
                '    f (o: any, id: string): any {\n' +
                "        o[id] = 1;\n" +
                '        const q = this.parseTrade (o);\n' +
                "        q['a'] = 1;\n" +
                '        return q;\n' +
                '    }\n', 'ts/src', true);
            expect(out).toContain('AddElementToObject(o, id, 1)');
        });
    });
});

describe ('goOrderbooksCache', () => {
    // BaseExchange.orderbooks is the typed OrderBookCache. Its reads, stores, membership tests and deletes
    // print the cache's own methods, book locals are typed OrderBookInterface, and the member assertion is only printed on a box.

    const BOOK = {
        'classes': [ 'OrderBook', 'WsOrderBook' ],
        'constructors': [ 'orderBook', 'indexedOrderBook', 'countedOrderBook' ],
        'cacheReaders': [ 'safeValue' ],
        'type': 'OrderBookInterface',
        'sideType': 'IOrderBookSide',
        'unbox': 'OrderBookTyped',
        'sides': { 'asks': 'GetAsks', 'bids': 'GetBids' },
        'setters': {
            'timestamp': { 'method': 'SetTimestamp', 'value': '^this\\.(?:Parse8601|SafeInteger)\\(', 'type': '*int64' },
        },
    };

    const HEAD = 'type Dict = { [key: string]: any };\n'
        + 'class Side { store (p: number, a: number) { return p + a; } }\n'
        + 'class WsOrderBook { asks: Side; bids: Side; cache: any[]; timestamp: number; reset (x: Dict = {}) { return x; } limit () { return this; } }\n'
        + 'class Exchange {\n'
        + '    orderbooks: Dictionary<WsOrderBook> = {};\n'
        + '    orderBook (snapshot = {}): WsOrderBook { return new WsOrderBook (); }\n'
        + '    safeValue (o: any, k: string, d: any = undefined): any { return o[k]; }\n'
        + '    safeDict (o: any, k: string, d: any = undefined): any { return o[k]; }\n'
        + '    safeInteger (o: any, k: string): number | undefined { return o[k]; }\n';

    const print = (body: string, book: any = BOOK): string => {
        const dir = fs.mkdtempSync (path.join (os.tmpdir (), 'goorderbookscache-'));
        try {
            fs.mkdirSync (path.join (dir, 'ts', 'src', 'base'), { 'recursive': true });
            fs.mkdirSync (path.join (dir, 'ts', 'src', 'pro'), { 'recursive': true });
            const file = path.join (dir, 'ts', 'src', 'pro', 'x.ts');
            const base = path.join (dir, 'ts', 'src', 'base', 'Exchange.ts');
            fs.writeFileSync (base, 'type Dictionary<T> = { [key: string]: T };\n' + HEAD + '}\nexport default Exchange;\n');
            fs.writeFileSync (file, 'import Exchange from \'../base/Exchange.js\';\n' + body);
            const config: any = { 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 } } };
            if (book !== null) {
                config.go.orderBook = book;
            }
            return new Transpiler (config).transpileGoByPath (file).content;
        } finally {
            fs.rmSync (dir, { 'recursive': true, 'force': true });
        }
    };

    const HANDLER = 'class x extends Exchange {\n'
        + '    handle (symbol: string, snapshot: Dict) {\n'
        + '        if (!(symbol in this.orderbooks)) {\n'
        + '            this.orderbooks[symbol] = this.orderBook ();\n'
        + '        }\n'
        + '        const orderbook = this.orderbooks[symbol];\n'
        + '        orderbook.reset (snapshot);\n'
        + '        orderbook.cache.push (snapshot);\n'
        + '        orderbook.cache = [];\n'
        + '        const stored = this.safeValue (this.orderbooks, symbol, this.orderBook ());\n'
        + '        stored.limit ();\n'
        + '        delete this.orderbooks[symbol];\n'
        + '    }\n'
        + '}\n';

    describe('native ws cache maps (tickers / bidsasks / trades / orderbooks are plain Go maps)', () => {
        const KEYS = 'type Dictionary<T> = { [key: string]: T };\n'
            + 'class Ticker { symbol: string; }\n'
            + 'class ArrayCache { append (x: any) {} }\n'
            + 'class Exchange {\n'
            + '    tickers: Dictionary<Ticker> = {};\n'
            + '    bidsasks: Dictionary<Ticker> = {};\n'
            + '    trades: Dictionary<ArrayCache>;\n'
            + '    safeString (o: any, k: string, d: any = undefined): string | undefined { return o[k]; }\n'
            + '    safeValue (o: any, k: string, d: any = undefined): any { return o[k]; }\n'
            + '    parseTicker (t: any): Ticker { return t; }\n'
            + '}\n';
        const printBase = (body: string): string => {
            const dir = fs.mkdtempSync (path.join (os.tmpdir (), 'nativecache-'));
            try {
                fs.mkdirSync (path.join (dir, 'ts', 'src', 'base'), { 'recursive': true });
                fs.mkdirSync (path.join (dir, 'ts', 'src', 'pro'), { 'recursive': true });
                const file = path.join (dir, 'ts', 'src', 'pro', 'x.ts');
                const base = path.join (dir, 'ts', 'src', 'base', 'Exchange.ts');
                fs.writeFileSync (base, 'type Dictionary<T> = { [key: string]: T };\n' + KEYS.replace ('type Dictionary<T> = { [key: string]: T };\n', '') + '\nexport default Exchange;\n');
                fs.writeFileSync (file, 'import Exchange from \'../base/Exchange.js\';\n' + body);
                return new Transpiler ({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 } } }).transpileGoByPath (file).content;
            } finally {
                fs.rmSync (dir, { 'recursive': true, 'force': true });
            }
        };
        const HANDLER = 'class x extends Exchange {\n    handle (message: any, ticker: any) {\n'
            + '        const symbol = this.safeString (message, \'s\');\n'
            + '        if (symbol !== undefined) {\n'
            + '            this.tickers[symbol] = ticker;\n'
            + '            this.bidsasks[symbol] = ticker;\n'
            + '            const last = this.tickers[symbol];\n'
            + '            delete this.tickers[symbol];\n'
            + '            delete this.bidsasks[symbol];\n'
            + '            if (symbol in this.tickers) {\n'
            + '                return last;\n'
            + '            }\n'
            + '        }\n'
            + '        const keys = Object.keys (this.tickers);\n'
            + '        return keys;\n'
            + '    }\n}\n';
        test('tickers and bidsasks print the map index, delete and membership with no cache method', () => {
            const out = printBase (HANDLER);
            expect (out).toContain ('this.Tickers[*symbol] = TickerFromMap(ticker)');
            expect (out).toContain ('this.Bidsasks[*symbol] = TickerFromMap(ticker)');
            expect (out).toContain ('var last any = TickerToMap(this.Tickers[*symbol])');
            expect (out).toContain ('delete(this.Tickers, *symbol)');
            expect (out).toContain ('delete(this.Bidsasks, *symbol)');
            expect (out).toContain ('if _, ok := this.Tickers[*symbol]; ok {');
            expect (out).toContain ('slices.Collect(maps.Keys(this.Tickers))');
            expect (out).toContain ('import "maps"');
            for (const gone of [ '.Store(', '.Delete(', '.Has(', '.ToMap(', 'Tickers.Keys(', 'AddElementToObject(this.Tickers', 'Remove(this.Tickers', 'InOp(this.Tickers', 'ObjectKeys(this.Tickers' ]) {
                expect (out).not.toContain (gone);
            }
        });
        test('an any-typed key stores and deletes behind a comma-ok string assertion, never a panicking one', () => {
            const out = printBase ('class x extends Exchange {\n    handle (market: any, ticker: any) {\n        this.tickers[market[\'symbol\']] = ticker;\n        delete this.tickers[market[\'symbol\']];\n    }\n}\n');
            expect (out).toContain ('if wsKey, ok := (GetValue(market, \"symbol\")).(string); ok {\n\t\tthis.Tickers[wsKey] = TickerFromMap(ticker)\n\t}');
            expect (out).toContain ('if wsKey, ok := (GetValue(market, \"symbol\")).(string); ok {\n\t\tdelete(this.Tickers, wsKey)\n\t}');
        });
        test('an owned field name on another class keeps the helper', () => {
            const out = printBase ('class Other {\n    tickers: any = {};\n    f (k: string) {\n        this.tickers[k] = 1;\n    }\n}\n');
            expect (out).not.toContain ('this.Tickers[');
        });
    });

    describe('go order book cache', () => {
        test('cache reads, stores, membership and deletes print the cache methods (fails on the base printer)', () => {
            const out = print (HANDLER);
            expect (out).toContain ('if !(this.Orderbooks[symbol.(string)] != nil) {');
            expect (out).toContain ('if wsKey, ok := symbol.(string); ok {\n\t\t\tthis.Orderbooks[wsKey] = this.OrderBook()\n\t\t}');
            expect (out).toContain ('var stored OrderBookInterface = this.Orderbooks[symbol.(string)]\n\tif stored == nil {\n\t\tstored = this.OrderBook()\n\t}');
            expect (out).toContain ('if wsKey, ok := symbol.(string); ok {\n\t\tdelete(this.Orderbooks, wsKey)\n\t}');
            expect (out).not.toContain ('InOp(this.Orderbooks');
            expect (out).not.toContain ('AddElementToObject(this.Orderbooks');
            const base = print (HANDLER, null);
            expect (base).toContain ('InOp(this.Orderbooks');
            expect (base).not.toContain ('this.Orderbooks[');
        });
        test('a local whose writes are cache reads is the interface and its members need no assertion', () => {
            const out = print (HANDLER);
            expect (out).toContain ('var orderbook OrderBookInterface = this.Orderbooks[symbol.(string)]');
            expect (out).toContain ('orderbook.Reset(snapshot)');
            expect (out).toContain ('orderbook.SetCache([]any{})');
            expect (out).not.toContain ('.(OrderBookInterface)');
        });
        test('a box local keeps the assertion at the member access', () => {
            const out = print ('class x extends Exchange {\n    handle (symbol: string, box: any) {\n        box.reset ({});\n        box.limit ();\n    }\n}\n');
            expect (out).toContain ('box.(OrderBookInterface).Reset(');
            expect (out).toContain ('box.(OrderBookInterface).Limit()');
        });
        test('a nil-declared book local written by a constructor and a cache read is typed', () => {
            const out = print ('class x extends Exchange {\n    handle (symbol: string) {\n        let orderbook: WsOrderBook | undefined = undefined;\n'
                + '        if (symbol === \'a\') {\n            orderbook = this.orderBook ();\n        } else {\n            orderbook = this.orderbooks[symbol];\n        }\n        orderbook.limit ();\n    }\n}\n');
            expect (out).toContain ('var orderbook OrderBookInterface');
            expect (out).not.toContain ('var orderbook any');
        });
        test('the setter prints on a constructor-built book and keeps the helper on a box', () => {
            const out = print ('class x extends Exchange {\n    handle (symbol: string, data: Dict, box: any) {\n        const orderbook = this.orderBook ();\n'
                + '        orderbook.limit ();\n        orderbook[\'timestamp\'] = this.safeInteger (data, \'ts\');\n        box[\'timestamp\'] = this.safeInteger (data, \'ts\');\n    }\n}\n');
            expect (out).toContain ('orderbook.SetTimestamp(this.SafeInteger(data, "ts"))');
            expect (out).toContain ('AddElementToObject(box, "timestamp"');
        });
        test('negative: a local also written with a foreign value stays a box', () => {
            const out = print ('class x extends Exchange {\n    handle (symbol: string, other: any) {\n        let orderbook: any = this.orderbooks[symbol];\n        orderbook = other;\n        orderbook.limit ();\n    }\n}\n');
            expect (out).not.toContain ('var orderbook OrderBookInterface');
        });
        test('negative: without the config nothing changes', () => {
            expect (print (HANDLER, null)).not.toContain ('this.Orderbooks[');
        });
    });
});

describe ('goOhlcvsBook', () => {
    // the ws ohlcv book. `this.ohlcvs` is BaseExchange's Dictionary<Dictionary<ArrayCacheByTimestamp>> (Go: one
    // map[string]map[string]any), so every helper call around a book is the native map operation behind the nil tests the helper applied.
    const HEAD = 'type Dict = { [key: string]: any };\ntype Str = string | undefined;\n'
        + 'class ArrayCacheByTimestamp { constructor (limit: any) {} append (x: any) {} }\n'
        + 'class BaseExchange {\n'
        + '    ohlcvs: { [key: string]: { [key: string]: ArrayCacheByTimestamp } } = {};\n'
        + '    options: Dict = {};\n'
        + '    safeString (d: any, k: any, def: any = undefined): Str { return d; }\n'
        + '    safeValue (d: any, k: any, def: any = undefined): any { return d; }\n'
        + '    safeDict (d: any, k: any, def: any = undefined): Dict { return d; }\n'
        + '    safeInteger (d: any, k: any, def: any = undefined): any { return d; }\n';
    const print = (body: string, head = HEAD): string => {
        const t = new Transpiler ({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 } } });
        installCcxtGoLocalTypes (t.goTranspiler);
        return t.transpileGo (head + '    handle (message: Dict) {\n' + body + '\n    }\n}\n').content;
    };
    // the book-local rule keys on the source tree (rf6aSourceKind: ts/src/pro), so it reads a real file
    const printPro = (body: string): string => {
        const tmp = fs.mkdtempSync (path.join (os.tmpdir (), 'goohlcvsbook-'));
        try {
            const dir = path.join (tmp, 'ts', 'src', 'pro');
            fs.mkdirSync (dir, { recursive: true });
            const file = path.join (dir, 'venue.ts');
            fs.writeFileSync (file, HEAD + '    handle (message: Dict) {\n' + body + '\n    }\n}\n');
            const t = new Transpiler ({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 } } });
            installCcxtGoLocalTypes (t.goTranspiler);
            return t.transpileGoByPath (file).content;
        } finally {
            fs.rmSync (tmp, { recursive: true, force: true });
        }
    };
    const HANDLER = [
        "const symbol = this.safeString (message, 's');",
        "const timeframe = this.safeString (message, 't');",
        'this.ohlcvs[symbol] = this.safeDict (this.ohlcvs, symbol, {});',
        'let stored = this.safeValue (this.safeDict (this.ohlcvs, symbol), timeframe);',
        'if (stored === undefined) {',
        '    stored = new ArrayCacheByTimestamp (10);',
        '    this.ohlcvs[symbol][timeframe] = stored;',
        '}',
    ].join ('\n');

    describe('go ohlcv book', () => {
        test('ensure, entry read and entry write are native behind the nil tests (fail on the base printer)', () => {
            const out = print (HANDLER);  // plain `*string` keys, so every test is spelled out
            expect (out).toContain ('if symbol != nil && this.Ohlcvs[*symbol] == nil {\n\t\tthis.Ohlcvs[*symbol] = map[string]any{}\n\t}');
            expect (out).toContain ('var stored any\n\tif symbol != nil && timeframe != nil {\n\t\tstored = this.Ohlcvs[*symbol][*timeframe]\n\t}');
            expect (out).toContain ('if symbol != nil && timeframe != nil && this.Ohlcvs[*symbol] != nil {\n\t\t\tthis.Ohlcvs[*symbol][*timeframe] = stored\n\t\t}');
            expect (out).not.toContain ('AddElementToObject');
            expect (out).not.toContain ('GetValue(');
            expect (out).not.toContain ('SafeValue(this.SafeDict(this.Ohlcvs');
        });
        test('a key under an enclosing nil guard needs no extra test', () => {
            const out = print ("const symbol = this.safeString (message, 's'); if (symbol !== undefined) { this.ohlcvs[symbol] = this.safeDict (this.ohlcvs, symbol, {}); }");
            expect (out).toContain ('if this.Ohlcvs[*symbol] == nil {\n\t\t\tthis.Ohlcvs[*symbol] = map[string]any{}\n\t\t}');
        });
        test('an entry-level `in` is the comma-ok read', () => {
            const out = print ("const symbol = this.safeString (message, 's', ''); const timeframe = this.safeString (message, 't', ''); if (!(timeframe in this.ohlcvs[symbol])) { delete this.ohlcvs[symbol][timeframe]; }");
            expect (out).toContain ('_, ok := this.Ohlcvs[symbol][timeframe]; !ok');
            expect (out).not.toContain ('InOp(');
        });
        test('an `in` over a key that may be nil keeps the helper', () => {
            const out = print ("const symbol = this.safeString (message, 's', ''); const timeframe = this.safeString (message, 't'); if (timeframe in this.ohlcvs[symbol]) { delete this.ohlcvs[symbol][timeframe]; }");
            expect (out).toContain ('InOp(');
        });
        test('a book local is a map[string]any stored back, written into and read', () => {
            const out = printPro ([
                "const symbol = this.safeString (message, 's', '');",
                "const timeframe = this.safeString (message, 't');",
                'const book = this.safeDict (this.ohlcvs, symbol, {});',
                'this.ohlcvs[symbol] = book;',
                'let stored = this.safeValue (book, timeframe);',
                'if (stored === undefined) {',
                '    stored = new ArrayCacheByTimestamp (10);',
                '    book[timeframe] = stored;',
                '}',
            ].join ('\n'));
            expect (out).toContain ('var book map[string]any = this.SafeDictMap(this.Ohlcvs, symbol, map[string]any{})');
            expect (out).toContain ('this.Ohlcvs[symbol] = book');
            expect (out).toContain ('stored = book[*timeframe]');
            expect (out).toContain ('book[*timeframe] = stored');
            expect (out).not.toContain ('AddElementToObject');
        });
        test('a flat cache (no timeframe level) lives under the one timeframe key', () => {
            const out = print ([
                "const symbol = this.safeString (message, 's');",
                'let stored = this.safeValue (this.ohlcvs, symbol);',
                'if (stored === undefined) {',
                '    stored = new ArrayCacheByTimestamp (10);',
                '    this.ohlcvs[symbol] = stored;',
                '}',
            ].join ('\n'));
            expect (out).toContain ('stored = this.Ohlcvs[*symbol]["1m"]');
            expect (out).toContain ('this.Ohlcvs[*symbol]["1m"] = stored');
            expect (out).not.toContain ('AddElementToObject');
        });
        test('a value that is not a cache keeps the helper', () => {
            const out = print ("const symbol = this.safeString (message, 's'); const timeframe = this.safeString (message, 't'); this.ohlcvs[symbol][timeframe] = message['x'];");
            expect (out).toContain ('AddElementToObject(');
        });
        test('an any-typed key keeps the helper', () => {
            const out = print ("this.ohlcvs[message['s']][message['t']] = new ArrayCacheByTimestamp (10);");
            expect (out).toContain ('AddElementToObject(');
        });
        test('an any-typed cache key stores through the typed book slot, not GetValue of the field', () => {
            const out = print ([
                "const symbol = this.safeString (message, 's');",
                "const timeframe = this.safeString (message, 't', '');",
                "let cacheKey: Str = undefined;",
                "if (timeframe === 'x') { cacheKey = timeframe; } else { cacheKey = timeframe + ':y'; }",
                "this.ohlcvs[symbol as string] = this.safeDict (this.ohlcvs, symbol, {});",
                "let stored = this.safeValue (this.ohlcvs[symbol as string], cacheKey);",
                'if (stored === undefined) {',
                '    stored = new ArrayCacheByTimestamp (10);',
                '    this.ohlcvs[symbol as string][cacheKey as string] = stored;',
                '}',
            ].join ('\n'));
            expect (out).toContain ('AddElementToObject(this.Ohlcvs[*symbol], cacheKey, stored)');
            expect (out).not.toContain ('GetValue(');
        });
        test('a nil symbol key keeps the no-op behind a nil test', () => {
            const out = print ("const symbol = this.safeString (message, 's'); const key: any = message['k']; this.ohlcvs[symbol][key] = new ArrayCacheByTimestamp (10);");
            expect (out).toContain ('if symbol != nil {');
            expect (out).not.toContain ('GetValue(this.Ohlcvs');
        });
        test('delete of an entry whose key is asserted a string is the native delete', () => {
            const out = print ("const symbol = this.safeString (message, 's', ''); const timeframe = this.safeString (message, 't'); if (symbol in this.ohlcvs) { delete this.ohlcvs[symbol][(timeframe as string)]; }");
            expect (out).toContain ('delete(this.Ohlcvs[symbol], *timeframe)');
            expect (out).not.toContain ('Remove(');
        });
        test('delete of an entry whose key may be nil keeps the helper', () => {
            const out = print ("const symbol = this.safeString (message, 's', ''); const timeframe = this.safeString (message, 't'); delete this.ohlcvs[symbol][timeframe];");
            expect (out).toContain ('Remove(');
        });
        test('a `ohlcvs` field of another class is not the book', () => {
            const other = HEAD.replace ('class BaseExchange {', 'class Other {');
            const out = print ("const symbol = this.safeString (message, 's'); this.ohlcvs[symbol] = this.safeDict (this.ohlcvs, symbol, {});", other);
            expect (out).not.toContain ('this.Ohlcvs[*symbol] = map[string]any{}');
        });
    });
});

describe ('goRequiredMarketParams', () => {
    let transpiler: Transpiler;

    beforeAll(() => {
        const config = { 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 } } };
        transpiler = new Transpiler(config);
    });

    function go(ts: string): string {
        return transpiler.transpileGo(ts).content;
    }

    const PRELUDE = 'interface MarketInterface { id: string; symbol: string; url: string; }\n' +
        'type Market = MarketInterface | undefined;\n' +
        'type Dict = { [key: string]: any };\n' +
        'type Str = string | undefined;\n' +
        'class Base {}\n';

    describe('go required market parameters', () => {
        test('an untyped market parameter whose callers all pass the accessor row prints the map', () => {
            const ts = PRELUDE +
                'class Test extends Base {\n' +
                '    market (symbol: Str): Market { return undefined; }\n' +
                '    requestBody (market: any): any {\n' +
                '        return market[\'id\'];\n' +
                '    }\n' +
                '    main (symbol: string): any {\n' +
                '        const market = this.market (symbol);\n' +
                '        return this.requestBody (market);\n' +
                '    }\n' +
                '}\n';
            const out = go(ts);
            expect(out).toContain('func (this *Test) RequestBody(market map[string]any) any {');
            expect(out).toContain('return market["id"]');
        });

        test('one caller passing an absent value keeps the box', () => {
            const ts = PRELUDE +
                'class Test extends Base {\n' +
                '    market (symbol: Str): Market { return undefined; }\n' +
                '    requestBody (market: any): any {\n' +
                '        return market[\'id\'];\n' +
                '    }\n' +
                '    main (symbol: string): any {\n' +
                '        const market = this.market (symbol);\n' +
                '        return [ this.requestBody (market), this.requestBody (undefined) ];\n' +
                '    }\n' +
                '}\n';
            const out = go(ts);
            expect(out).toContain('func (this *Test) RequestBody(market any) any {');
            expect(out).toContain('GetValue(market, "id")');
        });

        test('a body that nil-tests a map parameter compares it natively', () => {
            const ts = PRELUDE +
                'class Test extends Base {\n' +
                '    market (symbol: Str): Market { return undefined; }\n' +
                '    requestBody (market: any): any {\n' +
                '        if (market === undefined) { return undefined; }\n' +
                '        return market[\'id\'];\n' +
                '    }\n' +
                '    main (symbol: string): any {\n' +
                '        const market = this.market (symbol);\n' +
                '        return this.requestBody (market);\n' +
                '    }\n' +
                '}\n';
            const out = go(ts);
            expect(out).toContain('func (this *Test) RequestBody(market map[string]any) any {');
            expect(out).toContain('if market == nil {');
            expect(out).not.toContain('IsEqual(market, nil)');
        });

        test('a parameter the caller does not prove stays the box', () => {
            const ts = PRELUDE +
                'class Test extends Base {\n' +
                '    requestBody (market: any): any {\n' +
                '        return market[\'id\'];\n' +
                '    }\n' +
                '    main (raw: any): any {\n' +
                '        return this.requestBody (raw);\n' +
                '    }\n' +
                '}\n';
            const out = go(ts);
            expect(out).toContain('func (this *Test) RequestBody(market any) any {');
        });

        test('a Market-typed required parameter still takes the map', () => {
            const ts = PRELUDE +
                'class Test extends Base {\n' +
                '    market (symbol: Str): Market { return undefined; }\n' +
                '    requestBody (market: Market): any {\n' +
                '        return market[\'id\'];\n' +
                '    }\n' +
                '    main (symbol: string): any {\n' +
                '        const market = this.market (symbol);\n' +
                '        return this.requestBody (market);\n' +
                '    }\n' +
                '}\n';
            const out = go(ts);
            expect(out).toContain('func (this *Test) RequestBody(market map[string]any) any {');
            expect(out).toContain('return market["id"]');
        });
    });
});

describe ('goArrayLengthLocalSinks', () => {
    jest.mock('module', () => ({
        __esModule: true,
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

    const transpile = (ts: string) => transpiler.transpileGo(ts).content;

    // GetArrayLength(x) -> len(x) on a local the printer itself declares as a slice.
    // The declaration only takes []any when every later use reads the list the member already was;
    // a nil test, an any-parameter helper and a copy into another any/[]any local all qualify.
    describe('go .length on a list local from safeList', () => {
        test('a nil test on a defaultless read does not keep the box', () => {
            const ts =
            "class Test {\n" +
            "    safeList (a: any, b: any, c: any) { return a; }\n" +
            "    safeValue (a: any, b: any) { return a; }\n" +
            "    parseTrades (a: any, b: any, c: any, d: any) { return a; }\n" +
            "    f (response: any) {\n" +
            "        const rows = this.safeList(response, 'rows')\n" +
            "        if (rows !== undefined) {\n" +
            "            const n = rows.length\n" +
            "            return n\n" +
            "        }\n" +
            "        return 0\n" +
            "    }\n" +
            "}";
            const output = transpile(ts);
            expect(output).toContain('var rows []any = SafeListTyped(response, "rows")');
            expect(output).toContain('len(rows)');
            expect(output).not.toContain('GetArrayLength(rows)');
        });

        test('a copy into another local does not keep the box', () => {
            const ts =
            "class Test {\n" +
            "    safeList (a: any, b: any, c: any) { return a; }\n" +
            "    safeValue (a: any, b: any) { return a; }\n" +
            "    parseTrades (a: any, b: any, c: any, d: any) { return a; }\n" +
            "    f (response: any) {\n" +
            "        let assets: any = []\n" +
            "        const src = this.safeList(response, 'assets')\n" +
            "        assets = src\n" +
            "        const n = src.length\n" +
            "        return [assets, n]\n" +
            "    }\n" +
            "}";
            const output = transpile(ts);
            expect(output).toContain('var src []any = SafeListTyped(response, "assets")');
            expect(output).toContain('assets = src');
            expect(output).toContain('len(src)');
            expect(output).not.toContain('GetArrayLength(src)');
        });

        test('a read carrying a default keeps the box', () => {
            const ts =
            "class Test {\n" +
            "    safeList (a: any, b: any, c: any) { return a; }\n" +
            "    f (response: any) {\n" +
            "        const rows = this.safeList(response, 'rows', [])\n" +
            "        if (rows !== undefined) {\n" +
            "            return rows.length\n" +
            "        }\n" +
            "        return 0\n" +
            "    }\n" +
            "}";
            const output = transpile(ts);
            expect(output).toContain('var rows any = this.SafeList(response, "rows", []any{})');
            expect(output).toContain('GetArrayLength(rows)');
        });

        test('a hand-written any sink reads the list', () => {
            const ts =
            "class Test {\n" +
            "    safeList (a: any, b: any, c: any) { return a; }\n" +
            "    safeValue (a: any, b: any) { return a; }\n" +
            "    parseTrades (a: any, b: any, c: any, d: any) { return a; }\n" +
            "    f (response: any) {\n" +
            "        const rows = this.safeList(response, 'rows', [])\n" +
            "        const first = this.safeValue(rows, 0)\n" +
            "        const n = rows.length\n" +
            "        return n\n" +
            "    }\n" +
            "}";
            const output = transpile(ts);
            expect(output).toContain('var rows []any = SafeListTyped(response, "rows")');
            expect(output).toContain('len(rows)');
        });

        test('a generated callee keeps the box', () => {
            const ts =
            "class Test {\n" +
            "    safeList (a: any, b: any, c: any) { return a; }\n" +
            "    safeValue (a: any, b: any) { return a; }\n" +
            "    parseTrades (a: any, b: any, c: any, d: any) { return a; }\n" +
            "    f (response: any) {\n" +
            "        const rows = this.safeList(response, 'rows', [])\n" +
            "        const parsed = this.parseTrades(rows, undefined, undefined, undefined)\n" +
            "        const n = rows.length\n" +
            "        return parsed\n" +
            "    }\n" +
            "}";
            const output = transpile(ts);
            expect(output).toContain('var rows any = this.SafeList(response, "rows", []any{})');
            expect(output).toContain('GetArrayLength(rows)');
        });
    });
});

describe ('goMarketTableFields', () => {
    // The four market/currency tables of BaseExchange are plain map fields in Go: reads are native
    // field reads, a write assigns a whole map or goes through the copy-on-write Add*Entry method.
    const t = () => {
        const x = new Transpiler ({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 } } });
        installFmGo5G04 (x.goTranspiler);
        return x;
    };
    const PRELUDE = [
        'type Dict = {[key: string]: any};',
        'class BaseExchange {',
        '    markets: Dict | undefined = undefined;',
        '    markets_by_id: Dict | undefined = undefined;',
        '    currencies: Dict = {};',
        '    currencies_by_id: Dict | undefined = undefined;',
        '    createSafeDictionary (): Dict { return {}; }',
        '    mapToSafeMap (d: Dict): Dict { return d; }',
        '    indexBySafe (a: any, k: string): Dict { return {}; }',
        '    indexBy (a: any, k: string): Dict { return {}; }',
        '}',
        '',
    ].join ('\n');
    const go = (body: string) => t ().transpileGo (PRELUDE + 'class venue extends BaseExchange {\n' + body + '}\n').content;

    describe ('go market tables are plain map fields', () => {
        test ('whole-map writes assign the field', () => {
            const out = go ([
                '    reset () {',
                '        this.markets = undefined;',
                '        this.markets_by_id = this.mapToSafeMap (this.indexBy ([], \'id\'));',
                '        this.currencies = this.createSafeDictionary ();',
                '        this.currencies_by_id = this.indexBySafe (this.currencies, \'id\');',
                '    }',
            ].join ('\n') + '\n');
            expect (out).toContain ('this.Markets = nil');
            expect (out).toContain ('this.Markets_by_id = this.IndexBy([]any{}, "id")');
            expect (out).toContain ('this.Currencies = map[string]any{}');
            expect (out).toContain ('this.Currencies_by_id = this.IndexBy(this.Currencies, "id")');
            expect (out).not.toMatch (/= .*MapToSafeMap\(/);
            expect (out).not.toMatch (/= .*IndexBySafe\(/);
            expect (out).not.toContain ('Publish');
        });
        test ('an element write copies instead of mutating the published map', () => {
            const out = go ('    add (k: string, m: any) {\n        this.markets[k] = m;\n        this.markets_by_id[k] = [ m ];\n    }\n');
            expect (out).toContain ('this.AddMarketsEntry(k, m)');
            expect (out).toContain ('this.AddMarketsByIdEntry(k, []any{m})');
            expect (out).not.toContain ('this.Markets[k] =');
            expect (out).not.toContain ('AddElementToObject');
        });
        test ('a compound write also copies', () => {
            const out = go ('    bump (k: string) {\n        this.markets[k] += 1;\n    }\n');
            expect (out).toContain ('this.AddMarketsEntry(k, Add(GetValue(this.Markets, k), 1))');
            expect (out).not.toContain ('AddElementToObject');
        });
        test ('reads are native field reads', () => {
            const out = go ('    read () {\n        const k = \'BTC/USDT\';\n        if (this.markets === undefined) {\n            return undefined;\n        }\n        if (k in this.markets_by_id) {\n            return this.markets[k];\n        }\n        return 1;\n    }\n');
            expect (out).toContain ('this.Markets == nil');
            expect (out).toContain ('_, ok := this.Markets_by_id[k]');
            expect (out).toContain ('return this.Markets[k]');
            expect (out).not.toMatch (/\b(Markets|Markets_by_id|Currencies|Currencies_by_id)\(\)/);
        });
        test ('sharing another exchange\'s table assigns the field without a conversion', () => {
            const out = go ('    share (source: any) {\n        this.markets = source.markets;\n        this.currencies = source.currencies;\n    }\n');
            expect (out).toContain ('this.Markets = source.Markets');
            expect (out).toContain ('this.Currencies = source.Currencies');
            expect (out).not.toContain ('MapTyped');
        });
        test ('a slice element key printed as GetValue keeps the helper read', () => {
            const out = go ('    pick () {\n        const keys: string[] = Object.keys (this.markets);\n        return this.markets[keys[0]];\n    }\n');
            expect (out).toContain ('GetValue(this.Markets, ');
            expect (out).not.toMatch (/this\.Markets\[GetValue/);
        });
        test ('a write through a const local aliasing this.markets copies like the field write', () => {
            const out = go ('    add (k: string, m: any) {\n        const markets = this.markets;\n        markets[k] = m;\n        const byId = this.markets_by_id;\n        byId[k] = [ m ];\n    }\n');
            expect (out).toContain ('this.AddMarketsEntry(k, m)');
            expect (out).toContain ('this.AddMarketsByIdEntry(k, []any{m})');
            expect (out).not.toMatch (/\b(markets|byId)\[k\] =/);
            expect (out).not.toContain ('AddElementToObject');
        });
        test ('a compound write through the alias copies too', () => {
            const out = go ('    bump (k: string) {\n        const markets = this.markets;\n        markets[k] += 1;\n    }\n');
            expect (out).toContain ('this.AddMarketsEntry(k, Add(GetValue(markets, k), 1))');
        });
        test ('a local that is not an alias of a market table keeps its own write', () => {
            const out = go ('    other (k: string, m: any) {\n        const local = this.createSafeDictionary ();\n        local[k] = m;\n        let moved = this.markets;\n        moved = {};\n        moved[k] = m;\n    }\n');
            expect (out).not.toContain ('AddMarketsEntry');
        });
        test ('a same-named member of another class is not a market table', () => {
            const out = t ().transpileGo ('class Other {\n    markets: any = {};\n    f (k: string) {\n        this.markets[k] = 1;\n    }\n}\n').content;
            expect (out).not.toContain ('AddMarketsEntry');
        });
    });
});

describe ('goMapWriteOnProvenLocal', () => {
    let transpiler: Transpiler;

    beforeAll(() => {
        const config = { 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 } } };
        transpiler = new Transpiler(config);
    });

    function go(ts: string): string {
        return transpiler.transpileGo(ts).content;
    }

    const PRELUDE = 'type Dict = { [key: string]: any };\n' +
        'type Strings = string[] | undefined;\n' +
        'class Base {}\n';

    function flat(output: string): string {
        return output.replace(/\s+/g, ' ');
    }

    function cls(body: string): string {
        return PRELUDE + 'class Test extends Base {\n' + body + '}\n';
    }

    const SAFE = '    safeString (a: any, b: any): string { return ""; }\n' +
        '    safeDict (a: any, b: any): any { return a; }\n';

    describe('go native map writes on proven locals', () => {
        test('a Dict parameter with a {} default is the GetArgMap map: a literal key is a plain store', () => {
            const out = go(cls('    make (symbol: string, cost: number, params: Dict = {}): any {\n' +
                "        params['quoteOrderQty'] = cost;\n" +
                '        return params;\n' +
                '    }\n'));
            expect(out).toContain('var params map[string]any = GetArgMap(optionalArgs, 0, map[string]any{})');
            expect(out).toContain('params["quoteOrderQty"] = cost');
            expect(out).not.toContain('AddElementToObject(params,');
        });

        test('a nullable *string key gets the helper guard and a dereferenced store', () => {
            const out = go(cls('    make (symbols: Strings): any {\n' +
                '        const result: Dict = {};\n' +
                '        for (let i = 0; i < symbols.length; i++) {\n' +
                '            const symbol = this.safeString (symbols, i);\n' +
                '            result[symbol] = 1;\n' +
                '        }\n' +
                '        return result;\n' +
                '    }\n' + SAFE));
            expect(out).toContain('var symbol *string = this.SafeString(symbols, i)');
            expect(flat(out)).toContain('if symbol != nil { result[*symbol] = 1 }');
            expect(out).not.toContain('AddElementToObject(result, symbol,');
        });

        test('a boolean literal value takes the same guard store', () => {
            const out = go(cls('    make (symbols: Strings): any {\n' +
                '        const result: Dict = {};\n' +
                '        const symbol = this.safeString (symbols, 0);\n' +
                '        result[symbol] = true;\n' +
                '        return result;\n' +
                '    }\n' + SAFE));
            expect(flat(out)).toContain('if symbol != nil { result[*symbol] = true }');
        });

        test('a shared map local keeps the helper: another holder could write it', () => {
            const out = go(cls('    make (symbols: Strings, shared: Dict): any {\n' +
                '        const result = shared;\n' +
                '        const symbol = this.safeString (symbols, 0);\n' +
                '        result[symbol] = 1;\n' +
                '        return result;\n' +
                '    }\n' + SAFE));
            expect(out).toContain('AddElementToObject(result, symbol, 1)');
        });

        test('a nullable *string key on the GetArgMap local takes the same guard', () => {
            const out = go(cls('    make (params: Dict = {}): any {\n' +
                '        const code = this.safeString (params, "code");\n' +
                '        params[code] = true;\n' +
                '        return params;\n' +
                '    }\n' + SAFE));
            expect(flat(out)).toContain('if code != nil { params[*code] = true }');
        });

        test('a pointer value keeps the helper: its deref is what the helper stores', () => {
            const out = go(cls('    make (symbols: Strings, params: Dict = {}): any {\n' +
                '        const result: Dict = {};\n' +
                '        const symbol = this.safeString (symbols, 0);\n' +
                "        result[symbol] = this.safeString (params, 'value');\n" +
                '        return result;\n' +
                '    }\n' + SAFE));
            expect(out).toContain('AddElementToObject(result, symbol,');
        });

        test('an any-boxed value keeps the helper: the box may hold a pointer', () => {
            const out = go(cls('    make (tickers: Dict, symbols: Strings): any {\n' +
                '        const result: Dict = {};\n' +
                '        for (let i = 0; i < symbols.length; i++) {\n' +
                '            const symbol = this.safeString (symbols, i);\n' +
                '            const ticker = this.safeDict (tickers, symbol);\n' +
                '            result[symbol] = ticker;\n' +
                '        }\n' +
                '        return result;\n' +
                '    }\n' + SAFE));
            expect(out).toContain('AddElementToObject(result, symbol, ticker)');
        });

        test('element writes on the parameter do not block the store', () => {
            const out = go(cls('    make (other: Dict, params: Dict = {}): any {\n' +
                '        let request = params;\n' +
                "        request['a'] = 1;\n" +
                "        params['b'] = 2;\n" +
                '        return params;\n' +
                '    }\n'));
            expect(out).toContain('AddElementToObject(request, "a", 1)');
            expect(out).toContain('params["b"] = 2');
        });

        test('a rebound parameter keeps the helper', () => {
            const out = go(cls('    make (other: Dict, params: Dict = {}): any {\n' +
                "        params['a'] = 1;\n" +
                '        params = other;\n' +
                "        params['b'] = 2;\n" +
                '        return params;\n' +
                '    }\n'));
            expect(out).toContain('AddElementToObject(params, "a", 1)');
            expect(out).toContain('AddElementToObject(params, "b", 2)');
        });

        test('a parameter without a map default stays the box', () => {
            const out = go(cls('    make (params: any): any {\n' +
                "        params['a'] = 1;\n" +
                '        return params;\n' +
                '    }\n'));
            expect(out).toContain('AddElementToObject(params, "a", 1)');
        });

        test('a multi-line object literal value sits one level deeper inside the nil-key guard', () => {
            const out = go(cls('    make (symbols: Strings): any {\n' +
                '        const result: Dict = {};\n' +
                '        const symbol = this.safeString (symbols, 0);\n' +
                "        result[symbol] = { 'min': 1, 'max': 2 };\n" +
                '        return result;\n' +
                '    }\n' + SAFE));
            expect(out).toContain('\tif symbol != nil {\n\t\tresult[*symbol] = map[string]any{\n\t\t\t"min": 1,\n\t\t\t"max": 2,\n\t\t}\n\t}');
            expect(out).not.toContain('AddElementToObject(result, symbol,');
        });

        test('a numeric literal under a *string key is a guarded store; an `in` read of the map does not share it', () => {
            const out = go(cls('    make (entries: any): any {\n' +
                '        const seen: Dict = {};\n' +
                '        const id = this.safeString (entries, 0);\n' +
                '        if (!(id in seen)) {\n' +
                '            seen[id] = 1;\n' +
                '        }\n' +
                '        return seen;\n' +
                '    }\n' + SAFE));
            expect(flat(out)).toContain('if id != nil { seen[*id] = 1 }');
            expect(out).not.toContain('AddElementToObject(seen, id,');
        });

        test('a map handed to a call before the write keeps the helper', () => {
            const out = go(cls('    make (entries: any): any {\n' +
                '        const seen: Dict = {};\n' +
                '        const id = this.safeString (entries, 0);\n' +
                '        this.keep (seen);\n' +
                "        seen[id] = { 'a': 1, 'b': 2 };\n" +
                '        return seen;\n' +
                '    }\n' + SAFE + '    keep (a: any): void {}\n'));
            expect(out).toContain('AddElementToObject(seen, id,');
        });
    });
});

describe ('goNilInitPointer', () => {
    let transpiler: Transpiler;

    beforeAll(() => {
        const config = { 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 } } };
        transpiler = new Transpiler(config);
    });

    function go(ts: string): string {
        return transpiler.transpileGo(ts).content;
    }

    const PRELUDE = 'type Dict = { [key: string]: any };\n' +
        'type Str = string | undefined;\n' +
        'type Int = number | undefined;\n' +
        'type Bool = boolean | undefined;\n' +
        'class Base {}\n';

    describe('go nil-initialised locals', () => {
        test('a Str local the body only writes one accessor into holds that pointer', () => {
            const ts = PRELUDE +
                'class Test extends Base {\n' +
                '    safeString (d: any, k: any): string { return \'\'; }\n' +
                '    main (m: any): any {\n' +
                '        let currentType: Str = undefined;\n' +
                '        currentType = this.safeString (m, \'type\');\n' +
                '        if (currentType === undefined) { return \'a\'; }\n' +
                '        if (currentType !== \'spot\') { return \'b\'; }\n' +
                '        return \'d\';\n' +
                '    }\n' +
                '}\n';
            const out = go(ts);
            expect(out).toContain('var currentType *string = nil');
            expect(out).toContain('if currentType == nil {');
            expect(out).not.toContain('IsEqual(currentType');
        });

        test('an Int local the body only writes one accessor into holds that pointer', () => {
            const ts = PRELUDE +
                'class Test extends Base {\n' +
                '    safeInteger (d: any, k: any): number { return 0; }\n' +
                '    main (m: any): any {\n' +
                '        let limit: Int = undefined;\n' +
                '        limit = this.safeInteger (m, \'limit\');\n' +
                '        if (limit === undefined) { return 0; }\n' +
                '        if (limit > 10) { return 1; }\n' +
                '        return 2;\n' +
                '    }\n' +
                '}\n';
            const out = go(ts);
            expect(out).toContain('var limit *int64 = nil');
            expect(out).toContain('if limit == nil {');
            expect(out).not.toContain('IsEqual(limit');
        });

        test('a literal write keeps the box (a pointer literal would need a wrapping call)', () => {
            const ts = PRELUDE +
                'class Test extends Base {\n' +
                '    safeString (d: any, k: any): string { return \'\'; }\n' +
                '    main (m: any): any {\n' +
                '        let type: Str = undefined;\n' +
                '        if (m[\'a\'] === 1) { type = \'spot\'; } else { type = this.safeString (m, \'type\'); }\n' +
                '        if (type === undefined) { return \'none\'; }\n' +
                '        return \'some\';\n' +
                '    }\n' +
                '}\n';
            const out = go(ts);
            expect(out).toContain('var typeVar any = nil');
            expect(out).not.toContain('SafeStringPtr("spot")');
        });

        test('a helper-call argument keeps the pointer (every runtime accessor derefs)', () => {
            const ts = PRELUDE +
                'class Test extends Base {\n' +
                '    safeInteger (d: any, k: any): number { return 0; }\n' +
                '    iso8601 (t: any): string { return \'\'; }\n' +
                '    main (m: any): any {\n' +
                '        let ts: Int = undefined;\n' +
                '        ts = this.safeInteger (m, \'ts\');\n' +
                '        if (ts === undefined) { return undefined; }\n' +
                '        return this.iso8601 (ts);\n' +
                '    }\n' +
                '}\n';
            const out = go(ts);
            expect(out).toContain('var ts *int64 = nil');
            expect(out).toContain('if ts == nil {');
        });

        test('a read as a value keeps the box', () => {
            const ts = PRELUDE +
                'class Test extends Base {\n' +
                '    safeString (d: any, k: any): string { return \'\'; }\n' +
                '    sink (x: string): any { return x; }\n' +
                '    main (m: any): any {\n' +
                '        let currentType: Str = undefined;\n' +
                '        currentType = this.safeString (m, \'type\');\n' +
                '        if (currentType === undefined) { return undefined; }\n' +
                '        return this.sink (currentType);\n' +
                '    }\n' +
                '}\n';
            const out = go(ts);
            expect(out).toContain('var currentType any = nil');
            expect(out).toContain('IsEqual(currentType, nil)');
        });

        test('a returned local keeps the box', () => {
            const ts = PRELUDE +
                'class Test extends Base {\n' +
                '    safeString (d: any, k: any): string { return \'\'; }\n' +
                '    main (m: any): any {\n' +
                '        let currentType: Str = undefined;\n' +
                '        currentType = this.safeString (m, \'type\');\n' +
                '        return currentType;\n' +
                '    }\n' +
                '}\n';
            const out = go(ts);
            expect(out).toContain('var currentType any = nil');
        });

        test('two written types keep the box', () => {
            const ts = PRELUDE +
                'class Test extends Base {\n' +
                '    safeString (d: any, k: any): string { return \'\'; }\n' +
                '    main (m: any): any {\n' +
                '        let v: Str = undefined;\n' +
                '        if (m[\'a\'] === 1) { v = this.safeString (m, \'x\'); } else { v = 5; }\n' +
                '        return v === undefined;\n' +
                '    }\n' +
                '}\n';
            const out = go(ts);
            expect(out).toContain('var v any = nil');
            expect(out).toContain('IsEqual(v, nil)');
        });

        test('a local never written keeps the box', () => {
            const ts = PRELUDE +
                'class Test extends Base {\n' +
                '    main (m: any): any {\n' +
                '        let v: Str = undefined;\n' +
                '        if (v === undefined) { return 1; }\n' +
                '        return 0;\n' +
                '    }\n' +
                '}\n';
            const out = go(ts);
            expect(out).toContain('var v any = nil');
        });
    });
});

describe ('goWsFrameParam', () => {
    // the ws frame parameter of `override handleMessage (client, message: Dict)`.
    // The frame is only provable with the real ts/src tree: the Go ws dispatch asserts the decoded
    // object once, and a handler the frame is passed to inherits the type through its call site.
    const BASE_FIXTURE =
        "export class Exchange {\n" +
        "    safeDict (a, b, c?) { return undefined; }\n" +
        "    safeString (a, b, c?) { return undefined; }\n" +
        "    safeValue (a, b, c?) { return undefined; }\n" +
        "    handleMessage (client, message) {}\n" +
        "}\n";
    const CLIENT_FIXTURE =
        "export class Client { receive () { return undefined; } }\n";
    const TYPES_FIXTURE =
        "export type Dict = {[key: string]: any};\n";
    const PRO_HEADER =
        "import { Exchange } from '../base/Exchange';\n" +
        "import { Client } from '../base/ws/Client';\n" +
        "import type { Dict } from '../base/types';\n";

    function treeFor (name: string, pro: string): string {
        const src = nodepath.join (__dirname, 'files', name, 'ts', 'src');
        nodefs.mkdirSync (nodepath.join (src, 'base', 'ws'), { recursive: true });
        nodefs.mkdirSync (nodepath.join (src, 'pro'), { recursive: true });
        nodefs.writeFileSync (nodepath.join (src, 'base', 'Exchange.ts'), BASE_FIXTURE);
        nodefs.writeFileSync (nodepath.join (src, 'base', 'ws', 'Client.ts'), CLIENT_FIXTURE);
        nodefs.writeFileSync (nodepath.join (src, 'base', 'types.ts'), TYPES_FIXTURE);
        nodefs.writeFileSync (nodepath.join (src, 'pro', 'ex.ts'), PRO_HEADER + pro);
        return nodepath.join (src, 'pro', 'ex.ts');
    }

    function goPath (name: string, pro: string): string {
        return new Transpiler ({ verbose: false, go: {} }).transpileGoByPath (treeFor (name, pro)).content;
    }

    afterAll (() => {
        const dir = nodepath.join (__dirname, 'files');
        for (const entry of nodefs.readdirSync (dir)) {
            if (entry.startsWith ('tmp-gowsframeparam-')) {
                nodefs.rmSync (nodepath.join (dir, entry), { recursive: true, force: true });
            }
        }
    });

    describe ('go ws frame parameter', () => {
        test ('a Dict-annotated override frame prints map[string]any and its reads go native', () => {
            const output = goPath ('tmp-gowsframeparam-frame',
                "export class ex extends Exchange {\n" +
                "    override handleMessage (client: Client, message: Dict) {\n" +
                "        const event = message['e'];\n" +
                "        return event;\n" +
                "    }\n" +
                "}\n");
            expect (output).toContain ('func (this *ex) HandleMessage(client any, message map[string]any) any {');
            expect (output).toContain ('var event any = message["e"]');
            expect (output).not.toContain ('GetValue(message, "e")');
        });

        test ('a handler the frame is passed to inherits the map type', () => {
            const output = goPath ('tmp-gowsframeparam-chain',
                "export class ex extends Exchange {\n" +
                "    handleOrderBook (client: Client, message: Dict) {\n" +
                "        return message['asks'];\n" +
                "    }\n" +
                "    override handleMessage (client: Client, message: Dict) {\n" +
                "        this.handleOrderBook (client, message);\n" +
                "        return undefined;\n" +
                "    }\n" +
                "}\n");
            expect (output).toContain ('func (this *ex) HandleMessage(client any, message map[string]any) any {');
            expect (output).toContain ('func (this *ex) HandleOrderBook(client any, message map[string]any) any {');
            expect (output).toContain ('return message["asks"]');
            expect (output).not.toContain ('GetValue(message, "asks")');
        });

        test ('an any-annotated override frame keeps the box', () => {
            const output = goPath ('tmp-gowsframeparam-any',
                "export class ex extends Exchange {\n" +
                "    override handleMessage (client: Client, message: any) {\n" +
                "        return this.safeValue (message, 'event');\n" +
                "    }\n" +
                "}\n");
            expect (output).toContain ('func (this *ex) HandleMessage(client any, message any) any {');
            expect (output).toContain ('this.SafeValue(message, "event")');
        });

        test ('an array-framed venue keeps the box even with the Dict annotation', () => {
            const output = goPath ('tmp-gowsframeparam-array',
                "export class Phemex extends Exchange {\n" +
                "    override handleMessage (client: Client, message: Dict) {\n" +
                "        return this.safeValue (message, 'event');\n" +
                "    }\n" +
                "}\n");
            expect (output).toContain ('func (this *Phemex) HandleMessage(client any, message any) any {');
            expect (output).toContain ('this.SafeValue(message, "event")');
        });

        test ('a frame the body reassigns to another type keeps the box', () => {
            const output = goPath ('tmp-gowsframeparam-write',
                "export class ex extends Exchange {\n" +
                "    override handleMessage (client: Client, message: Dict) {\n" +
                "        message = 'text';\n" +
                "        return this.safeValue (message, 'event');\n" +
                "    }\n" +
                "}\n");
            expect (output).toContain ('func (this *ex) HandleMessage(client any, message any) any {');
        });

        test ('a nil test on the frame compares the map natively', () => {
            const output = goPath ('tmp-gowsframeparam-nil',
                "export class ex extends Exchange {\n" +
                "    override handleMessage (client: Client, message: Dict) {\n" +
                "        if (message === undefined) {\n" +
                "            return undefined;\n" +
                "        }\n" +
                "        return this.safeValue (message, 'event');\n" +
                "    }\n" +
                "}\n");
            expect (output).toContain ('func (this *ex) HandleMessage(client any, message map[string]any) any {');
            expect (output).toContain ('if message == nil {');
        });

        test ('an in-read inside an if condition prints the native init clause', () => {
            const output = goPath ('tmp-gowsframeparam-inop-if',
                "export class ex extends Exchange {\n" +
                "    override handleMessage (client: Client, message: Dict) {\n" +
                "        if (('result' in message) && (message['id'] !== undefined)) {\n" +
                "            return message;\n" +
                "        }\n" +
                "        return undefined;\n" +
                "    }\n" +
                "}\n");
            expect (output).toContain ('if _, ok := message["result"];');
            expect (output).not.toContain ('func() bool');
        });

        test ('an in-read outside an if condition keeps the box (no closure body)', () => {
            const output = goPath ('tmp-gowsframeparam-inop-value',
                "export class ex extends Exchange {\n" +
                "    override handleMessage (client: Client, message: Dict) {\n" +
                "        const hasResult = 'result' in message;\n" +
                "        return hasResult;\n" +
                "    }\n" +
                "}\n");
            expect (output).toContain ('func (this *ex) HandleMessage(client any, message any) any {');
        });

        test ('a non-handleMessage override keeps the box', () => {
            const output = goPath ('tmp-gowsframeparam-other',
                "export class ex extends Exchange {\n" +
                "    override onMessage (client: Client, message: Dict) {\n" +
                "        return this.safeValue (message, 'event');\n" +
                "    }\n" +
                "    override handleMessage (client: Client, message: any) {\n" +
                "        this.onMessage (client, message);\n" +
                "        return undefined;\n" +
                "    }\n" +
                "}\n");
            expect (output).toContain ('func (this *ex) OnMessage(client any, message any) any {');
        });
    });
});

describe ('goNilProvenStringArg', () => {
    let transpiler: Transpiler;

    beforeAll(() => {
        transpiler = new Transpiler({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 } } });
    });

    function go(ts: string): string {
        return transpiler.transpileGo(ts).content;
    }

    const PRELUDE = 'type Str = string | undefined;\n' +
        'type Dict = {[key: string]: any};\n' +
        'class Base {\n' +
        '    safeString (a: any, b: any, c?: string): Str { return undefined; }\n' +
        '}\n';

    describe('go *string argument into a venue string parameter', () => {
        test('a dominating guard dereferences the pointer and the parameter prints string', () => {
            const ts = PRELUDE +
                'class Test extends Base {\n' +
                '    main (message: Dict) {\n' +
                '        const messageHash = this.safeString (message, \'messageHash\');\n' +
                '        if (messageHash !== undefined) {\n' +
                '            this.cleanFlag (messageHash);\n' +
                '        }\n' +
                '    }\n' +
                '    cleanFlag (hash: string) {\n' +
                '        return hash.indexOf (\'trade:\') === 0;\n' +
                '    }\n' +
                '}\n';
            const out = go(ts);
            expect(out).toContain('func (this *Test) CleanFlag(hash string) any {');
            expect(out).toContain('this.CleanFlag(*messageHash)');
            expect(out).toContain('strings.Index(hash, "trade:")');
        });

        test('an unguarded nullable call site keeps the pointer on both sides', () => {
            const ts = PRELUDE +
                'class Test extends Base {\n' +
                '    main (message: Dict) {\n' +
                '        const messageHash = this.safeString (message, \'messageHash\');\n' +
                '        this.cleanFlag (messageHash);\n' +
                '    }\n' +
                '    cleanFlag (hash: string) {\n' +
                '        return hash.indexOf (\'trade:\') === 0;\n' +
                '    }\n' +
                '}\n';
            const out = go(ts);
            expect(out).toContain('func (this *Test) CleanFlag(hash *string) any {');
            expect(out).not.toContain('this.CleanFlag(*');
        });

        test('every pointer-shaped argument of one call keeps its own dereference', () => {
            const ts = PRELUDE +
                'class Test extends Base {\n' +
                '    main (message: Dict) {\n' +
                '        const symbol = this.safeString (message, \'symbol\');\n' +
                '        const type = this.safeStringUpper (message, \'type\');\n' +
                '        if ((symbol !== undefined) && (type !== undefined)) {\n' +
                '            return this.build (symbol, type);\n' +
                '        }\n' +
                '    }\n' +
                '    safeStringUpper (a: any, b: any): Str { return undefined; }\n' +
                '    build (symbol: string, type: Str) {\n' +
                '        return symbol.indexOf (\'/\') === 0;\n' +
                '    }\n' +
                '}\n';
            const out = go(ts);
            expect(out).toContain('func (this *Test) Build(symbol string, typeVar string) any {');
            expect(out).toContain('return this.Build(*symbol, *typeVar)');
        });

        test('a trailing default parameter does not hide the dereference', () => {
            const ts = PRELUDE +
                'class Test extends Base {\n' +
                '    main (message: Dict) {\n' +
                '        const amountString = this.safeString (message, \'amount\');\n' +
                '        if (amountString !== undefined) {\n' +
                '            return this.toUnits (amountString);\n' +
                '        }\n' +
                '    }\n' +
                '    toUnits (num: string, dec: string = \'1000000000000000000\') {\n' +
                '        return num.indexOf (dec) === 0;\n' +
                '    }\n' +
                '}\n';
            const out = go(ts);
            expect(out).toContain('func (this *Test) ToUnits(num string, optionalArgs ...any) any {');
            expect(out).toContain('return this.ToUnits(*amountString)');
        });

        test('an exiting nil guard earlier in the block proves the pointer', () => {
            const ts = PRELUDE +
                'class Test extends Base {\n' +
                '    main (message: Dict) {\n' +
                '        const amountString = this.safeString (message, \'amount\');\n' +
                '        if (amountString === undefined) {\n' +
                '            throw new Error (\'amount required\');\n' +
                '        }\n' +
                '        return this.toUnits (amountString);\n' +
                '    }\n' +
                '    toUnits (num: string) {\n' +
                '        return num.indexOf (\'/\') === 0;\n' +
                '    }\n' +
                '}\n';
            const out = go(ts);
            expect(out).toContain('func (this *Test) ToUnits(num string) any {');
            expect(out).toContain('return this.ToUnits(*amountString)');
        });

        test('an exiting guard on another local proves nothing', () => {
            const ts = PRELUDE +
                'class Test extends Base {\n' +
                '    main (message: Dict) {\n' +
                '        const amountString = this.safeString (message, \'amount\');\n' +
                '        const other = this.safeString (message, \'other\');\n' +
                '        if (other === undefined) {\n' +
                '            return;\n' +
                '        }\n' +
                '        return this.toUnits (amountString);\n' +
                '    }\n' +
                '    toUnits (num: string) {\n' +
                '        return num.indexOf (\'/\') === 0;\n' +
                '    }\n' +
                '}\n';
            const out = go(ts);
            expect(out).toContain('func (this *Test) ToUnits(num *string) any {');
            expect(out).not.toContain('this.ToUnits(*');
        });

        test('a pointer argument into a pointer parameter keeps the pointer', () => {
            const ts = PRELUDE +
                'class Test extends Base {\n' +
                '    main (message: Dict) {\n' +
                '        const messageHash = this.safeString (message, \'messageHash\');\n' +
                '        if (messageHash !== undefined) {\n' +
                '            this.cleanFlag (messageHash);\n' +
                '        }\n' +
                '    }\n' +
                '    cleanFlag (hash: Str) {\n' +
                '        if (hash === undefined) {\n' +
                '            return;\n' +
                '        }\n' +
                '        return hash;\n' +
                '    }\n' +
                '}\n';
            const out = go(ts);
            expect(out).toContain('func (this *Test) CleanFlag(hash *string) any {');
            expect(out).toContain('this.CleanFlag(messageHash)');
            expect(out).not.toContain('this.CleanFlag(*');
        });

        // the base file is a dependency, never transpiled: its accessor overloads can declare the
        // three-argument form as a non-nilable `string`, the way ts/src/base/Exchange.ts does
        const BASE_FIXTURE = 'type Str = string | undefined;\n' +
        'export class Exchange {\n' +
        '    safeDict (a, b) { return undefined; }\n' +
        '    safeString (a, b): Str;\n' +
        '    safeString (a, b, c: string): string;\n' +
        '    safeString (a, b, c?) { return undefined; }\n' +
        '    handleMessage (client, message) {}\n' +
        '}\n';
        const PRO_HEADER = "import { Exchange } from '../base/Exchange';\n" +
            "import { Client } from '../base/ws/Client';\n" +
            "import type { Dict } from '../base/types';\n";

        const treeFor = (name: string, pro: string) => {
            const src = nodepath.join(__dirname, 'files', name, 'ts', 'src');
            nodefs.mkdirSync(nodepath.join(src, 'base', 'ws'), { recursive: true });
            nodefs.mkdirSync(nodepath.join(src, 'pro'), { recursive: true });
            nodefs.writeFileSync(nodepath.join(src, 'base', 'Exchange.ts'), BASE_FIXTURE);
            nodefs.writeFileSync(nodepath.join(src, 'base', 'ws', 'Client.ts'), 'export class Client { receive () { return undefined; } }\n');
            nodefs.writeFileSync(nodepath.join(src, 'base', 'types.ts'), 'export type Dict = {[key: string]: any};\n');
            nodefs.writeFileSync(nodepath.join(src, 'pro', 'ex.ts'), PRO_HEADER + pro);
            return nodepath.join(src, 'pro', 'ex.ts');
        };

        afterAll(() => {
            for (const entry of nodefs.readdirSync(nodepath.join(__dirname, 'files'))) {
                if (entry.startsWith('tmp-derefStringArg-')) {
                    nodefs.rmSync(nodepath.join(__dirname, 'files', entry), { recursive: true, force: true });
                }
            }
        });

        test('a Safe* accessor with a non-nil default dereferences in place', () => {
            const file = treeFor('tmp-derefStringArg-default',
                "export class ex extends Exchange {\n" +
                "    main (message: Dict) {\n" +
                "        this.cleanFlag (this.safeString (message, 'id', ''));\n" +
                "    }\n" +
                "    cleanFlag (hash: string) {\n" +
                "        return hash.indexOf ('trade:') === 0;\n" +
                "    }\n" +
                "}\n");
            const out = new Transpiler({ verbose: false, go: {} }).transpileGoByPath(file).content;
            expect(out).toContain('func (this *ex) CleanFlag(hash string) any {');
            expect(out).toContain('this.CleanFlag(*this.SafeString(message, "id", ""))');
        });

        test('a pro handle* method types its string parameter, the frame keeps its box', () => {
            const file = treeFor('tmp-derefStringArg-pro',
                "export class ex extends Exchange {\n" +
                "    handleUnsubscription (client: Client, message: Dict) {\n" +
                "        const messageHash = this.safeString (message, 'messageHash');\n" +
                "        if (messageHash !== undefined) {\n" +
                "            this.handleUnsubscriptionCache (messageHash);\n" +
                "        }\n" +
                "    }\n" +
                "    handleUnsubscriptionCache (messageHash: string) {\n" +
                "        return messageHash.indexOf ('trade:') === 0;\n" +
                "    }\n" +
                "}\n");
            const out = new Transpiler({ verbose: false, go: {} }).transpileGoByPath(file).content;
            expect(out).toContain('func (this *ex) HandleUnsubscriptionCache(messageHash string) any {');
            expect(out).toContain('this.HandleUnsubscriptionCache(*messageHash)');
            expect(out).toContain('func (this *ex) HandleUnsubscription(client any, message map[string]any) {');
        });

        test('a pro handle* Str parameter takes the pointer when the body nil-tests it', () => {
            const file = treeFor('tmp-derefStringArg-pro-str',
                "type Str = string | undefined;\n" +
                "export class ex extends Exchange {\n" +
                "    handleUnsubscription (client: Client, message: Dict) {\n" +
                "        const messageHash = this.safeString (message, 'messageHash');\n" +
                "        if (messageHash !== undefined) {\n" +
                "            this.handleUnsubscriptionCache (messageHash);\n" +
                "        }\n" +
                "    }\n" +
                "    handleUnsubscriptionCache (messageHash: Str) {\n" +
                "        if (messageHash === undefined) {\n" +
                "            return;\n" +
                "        }\n" +
                "        return messageHash.indexOf ('trade:') === 0;\n" +
                "    }\n" +
                "}\n");
            const out = new Transpiler({ verbose: false, go: {} }).transpileGoByPath(file).content;
            expect(out).toContain('func (this *ex) HandleUnsubscriptionCache(messageHash *string) any {');
            expect(out).toContain('if messageHash == nil {');
            expect(out).toContain('strings.Index(*messageHash, "trade:")');
        });

        test('a pro handle* string parameter the body never nil-tests keeps the box', () => {
            const file = treeFor('tmp-derefStringArg-pro-unguarded',
                "export class ex extends Exchange {\n" +
                "    handleUnsubscription (client: Client, message: Dict) {\n" +
                "        this.handleUnsubscriptionCache (this.safeString (message, 'symbol'));\n" +
                "    }\n" +
                "    handleUnsubscriptionCache (symbol: string) {\n" +
                "        return symbol.indexOf ('trade:') === 0;\n" +
                "    }\n" +
                "}\n");
            const out = new Transpiler({ verbose: false, go: {} }).transpileGoByPath(file).content;
            expect(out).toContain('func (this *ex) HandleUnsubscriptionCache(symbol any) any {');
            expect(out).toContain('GetIndexOf(symbol, "trade:")');
        });
    });
});

describe ('goToStringNativeArms', () => {
    const fs = fs__goToStringNativeArms;
    const os = os__goToStringNativeArms;
    const path = path__goToStringNativeArms;
    // `x.toString()` prints the native op when the receiver's Go type is one the
    // helper reproduces exactly — int (Itoa), int64 and a non-nil `*int64` (FormatInt), bool
    // (FormatBool), []string (bracket-join) — and the helper call otherwise. The generated
    // base-class files take the same arms only once a writer installs the stdlib import seam.

    const PRELUDE =
        'type Dict = { [key: string]: any };\n' +
        'type Int = number | undefined;\n' +
        'class Exchange {\n' +
        '    take (x: any): any { return x; }\n' +
        '    safeInteger (o: Dict, k: string, d: Int = undefined): Int { return undefined; }\n' +
        '}\n';

    const config = () => ({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 } } });

    function go (body: string): string {
        const ts = PRELUDE + 'class ex extends Exchange {\n' + body + '}\n';
        return new Transpiler(config()).transpileGo(ts).content;
    }

    describe('go printToStringCall native arms', () => {
        test('an int local prints strconv.Itoa', () => {
            const out = go(
                '    run (a: any): string {\n' +
                '        const keys = Object.keys (a);\n' +
                '        const n = keys.length;\n' +
                '        return n.toString ();\n' +
                '    }\n');
            expect(out).toContain('var n int = len(keys)');
            expect(out).toContain('return strconv.Itoa(n)');
            expect(out).toContain('import "strconv"');
        });

        test('a nil-guarded *int64 local prints FormatInt of the pointee', () => {
            const out = go(
                '    run (o: Dict): string {\n' +
                '        const id = this.safeInteger (o, "id");\n' +
                '        if (id !== undefined) {\n' +
                '            return id.toString ();\n' +
                '        }\n' +
                '        return "";\n' +
                '    }\n');
            expect(out).toContain('var id *int64 = this.SafeInteger(o, "id")');
            expect(out).toContain('return strconv.FormatInt(*id, 10)');
        });

        test('an unguarded *int64 keeps the helper', () => {
            const out = go(
                '    run (o: Dict): string {\n' +
                '        const id = this.safeInteger (o, "id");\n' +
                '        return id.toString ();\n' +
                '    }\n');
            expect(out).toContain('return ToString(id)');
            expect(out).not.toContain('FormatInt');
        });

        test('a bool local prints FormatBool', () => {
            const ts =
                'function f (x: string): string {\n' +
                '    const b = x === "y";\n' +
                '    return b.toString ();\n' +
                '}\n';
            const out = new Transpiler(config()).transpileGo(ts).content;
            expect(out).toContain('var b bool = (x == "y")');
            expect(out).toContain('return strconv.FormatBool(b)');
        });

        test('a []string local prints the bracket-join form', () => {
            const out = go(
                '    run (a: any): string {\n' +
                '        const s: string = "a-b";\n' +
                '        const parts = s.split ("-");\n' +
                '        return parts.toString ();\n' +
                '    }\n');
            expect(out).toContain('var parts []string = strings.Split(s, "-")');
            expect(out).toContain('return "[" + strings.Join(parts, ", ") + "]"');
            expect(out).toContain('import "strings"');
        });

        test('an any or float64 receiver keeps the helper', () => {
            const anyOut = go(
                '    run (o: Dict): string {\n' +
                '        const x = this.take (o);\n' +
                '        return x.toString ();\n' +
                '    }\n');
            expect(anyOut).toContain('ToString(x)');
            const floatOut = go(
                '    run (a: any): string {\n' +
                '        const x = Math.floor (a);\n' +
                '        return x.toString ();\n' +
                '    }\n');
            expect(floatOut).toContain('ToString(x)');
        });

        test('a string receiver stays the identity and a proven *string derefs', () => {
            const out = go(
                '    run (a: any): string {\n' +
                '        const s = "x";\n' +
                '        const t = this.take (a);\n' +
                '        const x = s.toString ();\n' +
                '        return x;\n' +
                '    }\n');
            expect(out).toContain('var x string = s');
            expect(out).not.toContain('ToString(');
        });

        // The base-class writers splice the transpiled body into a file they assemble themselves,
        // so the printer may only emit a stdlib call there once that writer declares the import.
        test('a generated base file emits the native arm only under the import seam', () => {
            const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'a-generated-base-file-emits-'));
            try {
                const src = path.join(tmp, 'ts', 'src');
                fs.mkdirSync(path.join(src, 'base'), { recursive: true });
                const file = path.join(src, 'base', 'Exchange.ts');
                fs.writeFileSync(file,
                    'type Dict = { [key: string]: any };\n' +
                    'export class Exchange {\n' +
                    '    total (xs: any[]): string {\n' +
                    '        const n = xs.length;\n' +
                    '        return n.toString ();\n' +
                    '    }\n' +
                    '}\n');
                const plain = new Transpiler(config()).transpileGoByPath(file).content;
                expect(plain).toContain('ToString(n)');
                expect(plain).not.toContain('import "strconv"');
                const seamed = new Transpiler(config());
                seamed.goTranspiler.goBaseFileStdlibImportSeamPaths = /base\/Exchange\.ts$/;
                const out = seamed.transpileGoByPath(file).content;
                expect(out).toContain('return strconv.Itoa(n)');
                expect(out).toContain('import "strconv"');
            } finally {
                fs.rmSync(tmp, { recursive: true, force: true });
            }
        });

        // the seam is a path predicate: a sliced writer's source (the ws cache tests) keeps the helper
        test('a source outside the seam paths keeps the helper', () => {
            const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'a-generated-base-file-emits-cache-'));
            try {
                const src = path.join(tmp, 'ts', 'src');
                fs.mkdirSync(path.join(src, 'base'), { recursive: true });
                const file = path.join(src, 'base', 'test.cache.ts');
                fs.writeFileSync(file,
                    'type Dict = { [key: string]: any };\n' +
                    'export class TestCache {\n' +
                    '    total (xs: any[]): string {\n' +
                    '        const n = xs.length;\n' +
                    '        return n.toString ();\n' +
                    '    }\n' +
                    '}\n');
                const seamed = new Transpiler(config());
                seamed.goTranspiler.goBaseFileStdlibImportSeamPaths = /base\/Exchange\.ts$/;
                const out = seamed.transpileGoByPath(file).content;
                expect(out).toContain('ToString(n)');
                expect(out).not.toContain('strconv.Itoa');
            } finally {
                fs.rmSync(tmp, { recursive: true, force: true });
            }
        });
    });

    // the printer answers which stdlib packages a file's native emissions call, so a
    // writer that splices the printed body into a file it assembles declares exactly those
    // (ITranspiledFile.stdlibImports), and a span the writer cuts out never records an import.
    describe('go stdlib imports the printer recorded', () => {
        const SRC =
            'type Dict = { [key: string]: any };\n' +
            'export class Exchange {\n' +
            '    total (xs: any[]): string {\n' +
            '        const n = xs.length;\n' +
            '        const s: string = \'a-b\';\n' +
            '        const ids = s.split (\'-\');\n' +
            '        const text = ids.join (\',\');\n' +
            '        // @SKIP_START_GO\n' +
            '        const m = xs.length;\n' +
            '        const skipped = m.toString ();\n' +
            '        // @SKIP_END_GO\n' +
            '        const rest = xs.length;\n' +
            '        return n.toString () + text + rest.toString ();\n' +
            '    }\n' +
            '}\n';
        const run = (config: any) => {
            const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'go-stdlib-imports-the-printer-'));
            try {
                const src = path.join(tmp, 'ts', 'src', 'base');
                fs.mkdirSync(src, { recursive: true });
                const file = path.join(src, 'Exchange.ts');
                fs.writeFileSync(file, SRC);
                return new Transpiler({ 'verbose': false, 'go': Object.assign({ 'parser': { 'NUM_LINES_END_FILE': 0 } }, config) }).transpileGoByPath(file);
            } finally {
                fs.rmSync(tmp, { recursive: true, force: true });
            }
        };

        test('the transpiled file lists the packages its native calls need, sorted', () => {
            const res = run({ 'baseFileStdlibImportSeamPaths': 'base/Exchange\\.ts$' });
            expect(res.stdlibImports).toEqual(['strconv', 'strings']);
            expect(res.content).toContain('strconv.Itoa(n)');
            expect(res.content).toContain('strings.Join(ids, ",")');
        });

        test('a file the writer does not declare imports for lists none and keeps the helper', () => {
            const res = run({});
            expect(res.stdlibImports).toEqual([]);
            expect(res.content).toContain('ToString(n)');
        });

        test('a statement inside a cut span keeps the helper call and records no import for it', () => {
            const markers = run({ 'baseFileStdlibImportSeamPaths': 'base/Exchange\\.ts$', 'excisedSpanMarkers': ['@SKIP_START_GO', '@SKIP_END_GO'] });
            expect(markers.content).toContain('ToString(m)');
            expect(markers.content).not.toContain('strconv.Itoa(m)');
            expect(markers.content).toContain('strconv.Itoa(rest)');
            const plain = run({ 'baseFileStdlibImportSeamPaths': 'base/Exchange\\.ts$' });
            expect(plain.content).toContain('strconv.Itoa(m)');
        });
    });
});

describe ('goTupleSlotReads', () => {
    // a destructured tuple slot reads natively when the
    // producer's own `return [ .. ]` paths prove what the slot holds.

    const BASE = 'type Dict = any; type Bool = boolean | undefined;\n'
        + 'class Exchange {\n'
        + '    omit (o: any, k: any): any { return o; }\n'
        + '    safeDict (o: any, k: string): any { return undefined; }\n'
        + '    popOnly (isMarket: boolean, params: Dict = {}): [any, Dict] {\n'
        + '        if (isMarket) { return [ true, this.omit (params, [ \'k\' ]) ]; }\n'
        + '        return [ false, params ];\n'
        + '    }\n'
        + '    nilable (params: Dict = {}): [any, Dict] {\n'
        + '        return [ true, this.safeDict (params, \'k\') ];\n'
        + '    }\n'
        + '    flag (params: Dict = {}): [any, Dict] {\n'
        + '        let f: any = undefined;\n'
        + '        return [ f, params ];\n'
        + '    }\n'
        + '    twice (params: Dict = {}): [any, Dict] {\n'
        + '        return [ true, params ];\n'
        + '    }\n';

    const go = (body: string, hooked = true): string => {
        const t = new Transpiler ({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 } } });
        if (hooked) { installCcxtGoHooks ((t as any).goTranspiler); }
        return t.transpileGo (BASE + body + '}\n').content;
    };

    const USE = '    use (params = {}) {\n'
        + '        const [ po, paramsPo ] = this.popOnly (false, params);\n'
        + '        return [ po, paramsPo ];\n'
        + '    }\n';

    describe('go tuple slot reads', () => {
        test('a plain bool slot and a map slot read natively', () => {
            const out = go (USE);
            expect (out).toContain ('po := poparamsPoVariable[0]');
            expect (out).toContain ('paramsPo := poparamsPoVariable[1]');
        });
        test('the base printer keeps GetValue for the same source', () => {
            const base = go (USE, false);
            expect (base).toContain ('po := GetValue(poparamsPoVariable, 0)');
            expect (base).toContain ('paramsPo := GetValue(poparamsPoVariable, 1)');
        });
        test('a producer slot that may hold a typed nil keeps the helper', () => {
            const out = go ('    use (params = {}) {\n        const [ a, p ] = this.nilable (params);\n        return [ a, p ];\n    }\n');
            expect (out).toContain ('a := apVariable[0]');
            expect (out).toContain ('p := GetValue(apVariable, 1)');
        });
        test('a slot the producer leaves undefined keeps the helper', () => {
            const out = go ('    use (params = {}) {\n        const [ f, p ] = this.flag (params);\n        return [ f, p ];\n    }\n');
            expect (out).toContain ('f := GetValue(fpVariable, 0)');
        });
        test('a holder name printed by two destructurings keeps the helper', () => {
            const out = go ('    use (params = {}) {\n        const [ a, p ] = this.twice (params);\n        if (a) {\n            const [ a1, p1 ] = this.twice (params);\n        }\n        [ a, p ] = this.twice (params);\n        return [ a, p ];\n    }\n');
            expect (out).toContain ('GetValue(apVariable, 1)');
        });
    });
});

describe ('goRedundantMapTyped', () => {
    let transpiler: Transpiler;

    beforeAll(() => {
        const config = { 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 } } };
        transpiler = new Transpiler(config);
    });

    function go(ts: string): string {
        return transpiler.transpileGo(ts).content;
    }

    // `getMarketFromSymbols` is declared as an overload pair in ts/src/base/Exchange.ts, so the body
    // proof cannot resolve its body-carrying declaration from a venue call site while the base-file
    // print still proves it (exchange_generated.go declares `map[string]any`). The snippet models the
    // caller's side: a producer whose body the proof cannot resolve.
    const PRELUDE = 'interface MarketInterface { id: string; symbol: string; }\n' +
        'type Market = MarketInterface | undefined;\n' +
        'type Strings = string[] | undefined;\n' +
        'type Str = string | undefined;\n' +
        'class Base {\n' +
        '    market (symbol: Str): Market { return undefined; }\n' +
        '    raw (x: any): any { return x; }\n' +
        '    getMarketFromSymbols (symbols: Strings): MarketInterface {\n' +
        '        return this.raw (symbols);\n' +
        '    }\n' +
        '}\n';

    describe('go redundant MapTyped on an overloaded base producer', () => {
        test('a table-named base producer types the caller local without MapTyped', () => {
            const ts = PRELUDE +
                'class Test extends Base {\n' +
                '    main (symbols: string[]): any {\n' +
                '        const market = this.getMarketFromSymbols (symbols);\n' +
                '        return market[\'id\'];\n' +
                '    }\n' +
                '}\n';
            const out = go(ts);
            expect(out).toContain('var market map[string]any = this.GetMarketFromSymbols(symbols)');
            expect(out).toContain('return market["id"]');
            expect(out).not.toContain('MapTyped(this.GetMarketFromSymbols');
        });

        test('a producer outside the table keeps the conversion', () => {
            const ts = PRELUDE +
                'class Test extends Base {\n' +
                '    buildRow (symbols: Strings): MarketInterface { return this.raw (symbols); }\n' +
                '    main (symbols: string[]): any {\n' +
                '        const market = this.buildRow (symbols);\n' +
                '        return market[\'id\'];\n' +
                '    }\n' +
                '}\n';
            const out = go(ts);
            expect(out).toContain('MapTyped(this.BuildRow(symbols))');
        });

        test('a local written as a map is typed (the callee prints the map); a literal store is native', () => {
            const ts = PRELUDE +
                'class Test extends Base {\n' +
                '    main (symbols: string[]): any {\n' +
                '        const market = this.getMarketFromSymbols (symbols);\n' +
                '        market[\'id\'] = \'x\';\n' +
                '        return market;\n' +
                '    }\n' +
                '}\n';
            const out = go(ts);
            expect(out).toContain('var market map[string]any = this.GetMarketFromSymbols(symbols)');
            expect(out).toContain('market["id"] = "x"');
        });

        test('a pointer value stored into the typed local keeps the deref helper', () => {
            const ts = PRELUDE +
                'class Test extends Base {\n' +
                '    safeInteger (o: any, k: string): number | undefined { return undefined; }\n' +
                '    main (symbols: string[], o: any): any {\n' +
                '        const market = this.getMarketFromSymbols (symbols);\n' +
                '        market[\'ts\'] = this.safeInteger (o, \'ts\');\n' +
                '        return market;\n' +
                '    }\n' +
                '}\n';
            const out = go(ts);
            expect(out).toContain('var market map[string]any = this.GetMarketFromSymbols(symbols)');
            expect(out).toContain('AddElementToObject(market, "ts", this.SafeInteger(o, "ts"))');
        });
    });
});

describe ('goTypedSliceArgs', () => {
    const fs = fs__goTypedSliceArgs;
    const os = os__goTypedSliceArgs;
    const path = path__goTypedSliceArgs;
    // typed array-literal call arguments plus the slice mirror of the string table.
    // `[ sym ]` at a `string[]` slot must print `[]string{sym}` (and `len(symbols)` for its length)
    // instead of a `[]any{...}` box, and the table may only type a method whose declarations and
    // call sites all agree — every other shape keeps the box.

    const PRELUDE =
        'type Dict = { [key: string]: any };\n' +
        'type Int = number | undefined;\n' +
        'type Str = string | undefined;\n' +
        'class Exchange {\n' +
        '    async unWatchTradesForSymbols (symbols: string[], params: Dict = {}): Promise<any> {\n' +
        '        return symbols.length;\n' +
        '    }\n' +
        '    async watchOHLCVForSymbols (symbolsAndTimeframes: string[][], since: Int = undefined, params: Dict = {}): Promise<any> {\n' +
        '        return symbolsAndTimeframes.length;\n' +
        '    }\n' +
        '    async unWatchOrderBookForSymbols (symbols: string[], params: Dict = {}): Promise<any> {\n' +
        '        return symbols.length;\n' +
        '    }\n' +
        '}\n';

    const TABLE = {
        'unWatchTradesForSymbols': { 0: '[]string' },
        'watchOHLCVForSymbols': { 0: '[][]string' },
    };

    const config = (sliceTable: any = {}, stringTable: any = {}) => ({
        'verbose': false,
        'go': {
            'parser': { 'NUM_LINES_END_FILE': 0 },
            'unifiedSliceParams': sliceTable,
            'unifiedStringParams': stringTable,
        },
    });

    function go (ts: string, sliceTable: any = TABLE): string {
        const transpiler = new Transpiler(config(sliceTable));
        return transpiler.transpileGo(ts).content;
    }

    describe('go typed slice arguments and the slice table', () => {
        test('a proven literal at a table slot prints the slice and the native length', () => {
            const ts = PRELUDE +
                'class ex extends Exchange {\n' +
                '    wrapper () {\n' +
                "        const s = 'BTC/USDT';\n" +
                '        return this.unWatchTradesForSymbols ([ s ], {});\n' +
                '    }\n' +
                '}\n';
            const out = go(ts);
            expect(out).toContain('func (this *Exchange) UnWatchTradesForSymbols(symbols []string');
            expect(out).toContain('unWatchTradesForSymbolsBody(ch chan any, symbols []string');
            expect(out).toContain('ch <- len(symbols)');
            expect(out).not.toContain('unWatchTradesForSymbolsBody(ch chan any, symbols any');
            expect(out).toContain('[]string{s}');
            expect(out).not.toContain('[]any{s}');
        });

        test('a two-dimensional slot prints the nested slice', () => {
            const ts = PRELUDE +
                'class ex extends Exchange {\n' +
                '    wrapper () {\n' +
                "        return this.watchOHLCVForSymbols ([ [ 'BTC/USDT', '1m' ] ], undefined, {});\n" +
                '    }\n' +
                '}\n';
            const out = go(ts);
            expect(out).toContain('symbolsAndTimeframes [][]string');
            expect(out).toContain('ch <- len(symbolsAndTimeframes)');
            expect(out).toContain('[][]string{[]string{"BTC/USDT", "1m"}}');
        });

        test('a method outside the table keeps the box and the helper', () => {
            const ts = PRELUDE +
                'class ex extends Exchange {\n' +
                '    wrapper () {\n' +
                "        const s = 'BTC/USDT';\n" +
                '        return this.unWatchOrderBookForSymbols ([ s ], {});\n' +
                '    }\n' +
                '}\n';
            const out = go(ts);
            expect(out).toContain('UnWatchOrderBookForSymbols(symbols any');
            expect(out).toContain('GetArrayLength(symbols)');
            expect(out).not.toContain('[]string{s}');
        });

        test('an unproven literal keeps the whole method boxed', () => {
            const ts = PRELUDE +
                'class ex extends Exchange {\n' +
                '    wrapper (symbol: Str) {\n' +
                '        return this.unWatchTradesForSymbols ([ symbol ], {});\n' +
                '    }\n' +
                '}\n';
            const out = go(ts);
            expect(out).toContain('UnWatchTradesForSymbols(symbols any');
            expect(out).toContain('[]any{symbol}');
        });

        test('a body that writes another type keeps the box', () => {
            const ts =
                'type Dict = { [key: string]: any };\n' +
                'class Exchange {\n' +
                '    async unWatchTradesForSymbols (symbols: string[], params: Dict = {}): Promise<any> {\n' +
                "        symbols = params['symbols'];\n" +
                '        return symbols.length;\n' +
                '    }\n' +
                '}\n' +
                'class ex extends Exchange {\n' +
                '    wrapper () {\n' +
                "        const s = 'BTC/USDT';\n" +
                '        return this.unWatchTradesForSymbols ([ s ], {});\n' +
                '    }\n' +
                '}\n';
            const out = go(ts);
            expect(out).toContain('UnWatchTradesForSymbols(symbols any');
            expect(out).toContain('[]any{s}');
        });

        // The literal rule is scoped to the table's slots: a venue-local `string[]` parameter keeps
        // the printer's own proof (slice-typed call-site values), so no existing `[]any` slot changes
        // shape and the woo `[]string`-into-`[]any` static response tests keep their box.
        test('a venue-local string[] parameter keeps the printer own proof', () => {
            const ts =
                'type Dict = { [key: string]: any };\n' +
                'class Base {\n' +
                '    raw (x: any): any { return x; }\n' +
                '}\n' +
                'class Test extends Base {\n' +
                '    takeSymbols (symbols: string[]): string[] {\n' +
                '        return symbols;\n' +
                '    }\n' +
                '    run () {\n' +
                "        const s = 'BTC/USDT';\n" +
                '        return this.takeSymbols ([ s ]).length;\n' +
                '    }\n' +
                '}\n';
            const out = go(ts, {});
            expect(out).toContain('TakeSymbols(symbols any)');
            expect(out).toContain('[]any{s}');
        });

        test('the sibling-file proof types the base and prints the caller literal', () => {
            const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'the-sibling-file-proof-types-'));
            try {
                const src = path.join(tmp, 'ts', 'src');
                fs.mkdirSync(path.join(src, 'base'), { recursive: true });
                fs.writeFileSync(path.join(src, 'base', 'Exchange.ts'),
                    'type Dict = { [key: string]: any };\n' +
                    'export class Exchange {\n' +
                    '    async unWatchTradesForSymbols (symbols: string[], params: Dict = {}): Promise<any> {\n' +
                    '        return symbols.length;\n' +
                    '    }\n' +
                    '}\n');
                fs.writeFileSync(path.join(src, 'ex.ts'),
                    "import { Exchange, Dict } from './base/Exchange';\n" +
                    'export class ex extends Exchange {\n' +
                    '    async unWatchTrades (symbol: string, params: Dict = {}) {\n' +
                    '        return await this.unWatchTradesForSymbols ([ symbol ], params);\n' +
                    '    }\n' +
                    '}\n');
                const transpiler = new Transpiler(config(TABLE, { 'unWatchTrades': [ 0 ] }));
                const base = transpiler.transpileGoByPath(path.join(src, 'base', 'Exchange.ts')).content;
                const venue = transpiler.transpileGoByPath(path.join(src, 'ex.ts')).content;
                expect(base).toContain('UnWatchTradesForSymbols(symbols []string');
                expect(base).toContain('ch <- len(symbols)');
                expect(venue).toContain('[]string{symbol}');
            } finally {
                fs.rmSync(tmp, { recursive: true, force: true });
            }
        });

        test('a Str argument keeps the base boxed even when the file names a string parameter', () => {
            const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'the-sibling-file-proof-types-str-'));
            try {
                const src = path.join(tmp, 'ts', 'src');
                fs.mkdirSync(path.join(src, 'base'), { recursive: true });
                fs.writeFileSync(path.join(src, 'base', 'Exchange.ts'),
                    'type Dict = { [key: string]: any };\n' +
                    'type Str = string | undefined;\n' +
                    'export class Exchange {\n' +
                    '    async unWatchTradesForSymbols (symbols: string[], params: Dict = {}): Promise<any> {\n' +
                    '        return symbols.length;\n' +
                    '    }\n' +
                    '}\n');
                // `symbol` is a nullable parameter here; the same file also carries an unrelated
                // `symbol: string` parameter, which must not prove this argument
                fs.writeFileSync(path.join(src, 'ex.ts'),
                    "import { Exchange, Dict } from './base/Exchange';\n" +
                    'export class ex extends Exchange {\n' +
                    '    async other (symbol: string, params: Dict = {}) {\n' +
                    '        return symbol;\n' +
                    '    }\n' +
                    '    async unWatchTrades (symbol: Str, params: Dict = {}) {\n' +
                    '        return await this.unWatchTradesForSymbols ([ symbol ], params);\n' +
                    '    }\n' +
                    '}\n');
                const transpiler = new Transpiler(config(TABLE));
                const base = transpiler.transpileGoByPath(path.join(src, 'base', 'Exchange.ts')).content;
                const venue = transpiler.transpileGoByPath(path.join(src, 'ex.ts')).content;
                expect(base).toContain('UnWatchTradesForSymbols(symbols any');
                expect(venue).toContain('[]any{symbol}');
            } finally {
                fs.rmSync(tmp, { recursive: true, force: true });
            }
        });

        test('a defaulted string parameter proves its element', () => {
            const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'the-sibling-file-proof-types-def-'));
            try {
                const src = path.join(tmp, 'ts', 'src');
                fs.mkdirSync(path.join(src, 'base'), { recursive: true });
                fs.writeFileSync(path.join(src, 'base', 'Exchange.ts'),
                    'type Dict = { [key: string]: any };\n' +
                    'export class Exchange {\n' +
                    '    async watchOHLCVForSymbols (symbolsAndTimeframes: string[][], params: Dict = {}): Promise<any> {\n' +
                    '        return symbolsAndTimeframes.length;\n' +
                    '    }\n' +
                    '}\n');
                fs.writeFileSync(path.join(src, 'ex.ts'),
                    "import { Exchange, Dict } from './base/Exchange';\n" +
                    'export class ex extends Exchange {\n' +
                    '    async watchOHLCV (symbol: string, timeframe = \'1m\', params: Dict = {}) {\n' +
                    '        return await this.watchOHLCVForSymbols ([ [ symbol, timeframe ] ], params);\n' +
                    '    }\n' +
                    '}\n');
                const transpiler = new Transpiler(config(TABLE, { 'watchOHLCV': [ 0 ] }));
                const base = transpiler.transpileGoByPath(path.join(src, 'base', 'Exchange.ts')).content;
                const venue = transpiler.transpileGoByPath(path.join(src, 'ex.ts')).content;
                expect(base).toContain('symbolsAndTimeframes [][]string');
                expect(base).toContain('ch <- len(symbolsAndTimeframes)');
                expect(venue).toContain('[][]string{[]string{symbol, timeframe}}');
            } finally {
                fs.rmSync(tmp, { recursive: true, force: true });
            }
        });
    });
});

describe ('goAsyncVenueParams', () => {
    let transpiler: Transpiler;

    beforeAll(() => {
        const config = { 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 } } };
        transpiler = new Transpiler(config);
    });

    function go(ts: string): string {
        return transpiler.transpileGo(ts).content;
    }

    // the trampoline and its Body half both have to carry the parameter type
    function signature(out: string, name: string): string {
        return out.split('\nfunc ').find((f) => f.startsWith('(this *Test) ' + name + '(')) ?? '';
    }

    const PRELUDE = 'interface MarketInterface { id: string; symbol: string; url: string; }\n' +
        'type Market = MarketInterface | undefined;\n' +
        'type Dict = { [key: string]: any };\n' +
        'type Str = string | undefined;\n' +
        'class Base {}\n';

    describe('go async venue-only parameters', () => {
        test('an untyped parameter whose every caller passes the market row prints the map in both halves', () => {
            const ts = PRELUDE +
                'class Test extends Base {\n' +
                '    market (symbol: Str): Market { return undefined; }\n' +
                '    async watchPublic (body: any): Promise<any> {\n' +
                '        return body[\'id\'];\n' +
                '    }\n' +
                '    main (symbol: string): any {\n' +
                '        const body = this.market (symbol);\n' +
                '        return this.watchPublic (body);\n' +
                '    }\n' +
                '}\n';
            const out = go(ts);
            expect(signature(out, 'WatchPublic')).toContain('(body map[string]any)');
            expect(signature(out, 'watchPublicBody')).toContain(', body map[string]any)');
            expect(out).toContain('ch <- body["id"]');
            expect(out).not.toContain('GetValue(body');
        });

        test('an untyped parameter whose every caller passes one string prints the string', () => {
            const ts = PRELUDE +
                'class Test extends Base {\n' +
                '    async watchCrumb (topicID: any): Promise<any> {\n' +
                '        return topicID;\n' +
                '    }\n' +
                '    main (): any {\n' +
                '        this.watchCrumb (\'7\');\n' +
                '        return this.watchCrumb (\'11\');\n' +
                '    }\n' +
                '}\n';
            const out = go(ts);
            expect(signature(out, 'WatchCrumb')).toContain('(topicID string)');
            expect(signature(out, 'watchCrumbBody')).toContain(', topicID string)');
        });

        test('one caller passing an absent value keeps the box', () => {
            const ts = PRELUDE +
                'class Test extends Base {\n' +
                '    async watchPublic (body: any): Promise<any> {\n' +
                '        return body[\'id\'];\n' +
                '    }\n' +
                '    main (): any {\n' +
                '        this.watchPublic ({ \'id\': 1 });\n' +
                '        return this.watchPublic (undefined);\n' +
                '    }\n' +
                '}\n';
            const out = go(ts);
            expect(signature(out, 'WatchPublic')).toContain('(body any)');
            expect(out).toContain('GetValue(body, "id")');
        });

        test('a body that nil-tests a map parameter compares it natively', () => {
            const ts = PRELUDE +
                'class Test extends Base {\n' +
                '    async watchPublic (body: any): Promise<any> {\n' +
                '        if (body === undefined) { return 0; }\n' +
                '        return body[\'id\'];\n' +
                '    }\n' +
                '    main (): any {\n' +
                '        return this.watchPublic ({ \'id\': 1 });\n' +
                '    }\n' +
                '}\n';
            const out = go(ts);
            expect(signature(out, 'WatchPublic')).toContain('(body map[string]any)');
            expect(out).not.toContain('IsEqual(body, nil)');
        });

        test('a body that writes another type keeps the box', () => {
            const ts = PRELUDE +
                'class Test extends Base {\n' +
                '    async watchPublic (body: any): Promise<any> {\n' +
                '        body = 1;\n' +
                '        return body;\n' +
                '    }\n' +
                '    main (): any {\n' +
                '        return this.watchPublic ({ \'id\': 1 });\n' +
                '    }\n' +
                '}\n';
            const out = go(ts);
            expect(signature(out, 'WatchPublic')).toContain('(body any)');
        });

        test('a dynamically named call site keeps the box', () => {
            const ts = PRELUDE +
                'class Test extends Base {\n' +
                '    async watchPublic (body: any): Promise<any> {\n' +
                '        return body[\'id\'];\n' +
                '    }\n' +
                '    main (raw: any): any {\n' +
                '        this.watchPublic ({ \'id\': 1 });\n' +
                '        return this[\'watchPublic\'](raw);\n' +
                '    }\n' +
                '}\n';
            const out = go(ts);
            expect(signature(out, 'WatchPublic')).toContain('(body any)');
            expect(out).toContain('GetValue(body, "id")');
        });

        test('a pointer-typed call site keeps the box, so the call site needs no conversion', () => {
            const ts = PRELUDE +
                'class Test extends Base {\n' +
                '    str (): Str { return undefined; }\n' +
                '    async watchCrumb (code: any): Promise<any> {\n' +
                '        return code;\n' +
                '    }\n' +
                '    main (): any {\n' +
                '        const code = this.str ();\n' +
                '        return this.watchCrumb (code);\n' +
                '    }\n' +
                '}\n';
            const out = go(ts);
            expect(signature(out, 'WatchCrumb')).toContain('(code any)');
        });

        // a `string` body value handed to a `Str`-annotated parameter is re-wrapped there (SafeStringPtr)
        test('a string parameter the body feeds into a nullable slot keeps the box', () => {
            const ts = PRELUDE +
                'class Test extends Base {\n' +
                '    inner (code: Str): any { return code; }\n' +
                '    async watchCrumb (topicID: any): Promise<any> {\n' +
                '        return this.inner (topicID);\n' +
                '    }\n' +
                '    main (): any {\n' +
                '        return this.watchCrumb (\'7\');\n' +
                '    }\n' +
                '}\n';
            const out = go(ts);
            expect(signature(out, 'WatchCrumb')).toContain('(topicID any)');
        });

        test('a `??` default keeps the box', () => {
            const ts = PRELUDE +
                'class Test extends Base {\n' +
                '    async watchCrumb (topicID: any): Promise<any> {\n' +
                '        return topicID ?? \'1\';\n' +
                '    }\n' +
                '    main (): any {\n' +
                '        return this.watchCrumb (\'7\');\n' +
                '    }\n' +
                '}\n';
            const out = go(ts);
            expect(signature(out, 'WatchCrumb')).toContain('(topicID any)');
        });
    });

    describe('go wrapper records', () => {
        // the generated public wrapper is built from these records (ccxt createWrapper), so a
        // positional parameter has to carry the type its core prints
        const record = (out: any, name: string): any => (out.methodsTypes ?? []).find((m: any) => m.name === name);

        test('an async positional parameter carries the printed Go type', () => {
            const ts = PRELUDE +
                'class Test extends Base {\n' +
                '    market (symbol: Str): Market { return undefined; }\n' +
                '    async fetchBody (body: any): Promise<any> {\n' +
                '        return body[\'id\'];\n' +
                '    }\n' +
                '    main (symbol: string): any {\n' +
                '        const body = this.market (symbol);\n' +
                '        return this.fetchBody (body);\n' +
                '    }\n' +
                '}\n';
            const out = transpiler.transpileGo(ts);
            expect(record(out, 'fetchBody').parameters[0].goType).toBe('map[string]any');
        });

        test('an optional parameter or a sync method carries no Go type', () => {
            const ts = PRELUDE +
                'class Test extends Base {\n' +
                '    market (symbol: Str): Market { return undefined; }\n' +
                '    async fetchBody (body?: any): Promise<any> {\n' +
                '        return body[\'id\'];\n' +
                '    }\n' +
                '    syncBody (body: any): any {\n' +
                '        return body[\'id\'];\n' +
                '    }\n' +
                '    main (symbol: string): any {\n' +
                '        const body = this.market (symbol);\n' +
                '        this.syncBody (body);\n' +
                '        return this.fetchBody (body);\n' +
                '    }\n' +
                '}\n';
            const out = transpiler.transpileGo(ts);
            expect(record(out, 'fetchBody').parameters[0].goType).toBeUndefined();
            expect(record(out, 'syncBody').parameters[0].goType).toBeUndefined();
        });
    });
});

describe ('goPrinterHooks', () => {
    // ccxt's Go printer hooks live in src/go and are installed from the package entry.

    const SIGN = 'type Dict = { [key: string]: any };\n'
        + 'class Exchange {\n'
        + '    sign (path: string, api: string[] = [ \'public\', \'private\' ], method = \'GET\', params = {}): any {\n'
        + '        const apiName = api[0];\n'
        + '        if (apiName === \'public\') { return api[1]; }\n'
        + '        return undefined;\n'
        + '    }\n'
        + '    other (path: string, api: string[] = [ \'public\' ]): any {\n'
        + '        return api[0];\n'
        + '    }\n'
        + '}\n';

    const print = (install: boolean, source = SIGN): string => {
        const t = new Transpiler ({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 } } });
        if (install) { installCcxtGoSignTyping (t.goTranspiler); }
        return t.transpileGo (source).content;
    };

    describe('go printer hooks installed from the package entry', () => {
        test('sign typing: api binds as []string and api[0] indexes natively (fails on the base printer)', () => {
            const base = print (false);
            const hooked = print (true);
            expect (base).not.toContain ('api[0]');
            expect (hooked).toContain ('api[0]');
            expect (hooked).toContain ('[]string');
        });
        test('sign typing negative: a method that is not sign/fetch2/request stays untouched', () => {
            const hooked = print (true);
            const other = hooked.split (/\nfunc /).find ((f) => f.indexOf ('Other(') >= 0) ?? '';
            expect (other).not.toContain ('api[0]');
        });
        test('installCcxtGoHooks installs every hook once (idempotent)', () => {
            const t = new Transpiler ({ 'verbose': false, 'go': {} });
            installCcxtGoHooks (t.goTranspiler);
            const once = t.goTranspiler.goNativeParameterType;
            installCcxtGoHooks (t.goTranspiler);
            expect (typeof once).toBe ('function');
            expect (t.transpileGo (SIGN).content).toContain ('api[0]');
        });
        test.each ([
            [ 'G06', goNilJoinTypeSelfTest ], [ 'G08', goDynamicCallParamsCheck ], [ 'GB01', goDictParamTypesSelfTest ],
            [ 'GB05', goParseFrameParamTypesSelfTest ], [ 'GB11', goHandleErrorsCodeSelfTest ],
        ])('%s self-check (base vs hooked printer) reports no problems', (_name, check) => {
            expect ((check as () => string[]) ()).toEqual ([]);
        });
    });

    describe('go unifiedBoolParams', () => {
        const SRC = 'class Exchange {\n    setMode (hedged: boolean, symbol: string = undefined): any {\n        if (hedged) { return 1; }\n        return 2;\n    }\n}\n';
        const print = (table: any): string => new Transpiler ({ 'verbose': false, 'go': { 'unifiedBoolParams': table, 'parser': { 'NUM_LINES_END_FILE': 0 } } }).transpileGo (SRC).content;
        test('a tabled required boolean param prints bool and a native if', () => {
            const out = print ({ 'setMode': [ 0 ] });
            expect (out).toContain ('hedged bool');
            expect (out).not.toContain ('EvalTruthy');
        });
        test('an absent table keeps the boxed any param', () => {
            expect (print ({})).toContain ('hedged any');
        });
    });
});

describe ('goGeneralParamRules', () => {
    // createOrders `[]any` slot, Client.url / bound-parameter call-site proofs, uncalled-method table.

    const PRELUDE =
        'type Dict = { [key: string]: any };\n' +
        'interface OrderRequest { symbol: string }\n' +
        'class Client { url: string; }\n' +
        'class Exchange {\n' +
        '    async createOrders (orders: OrderRequest[], params = {}): Promise<any> {\n' +
        '        return orders.length;\n' +
        '    }\n' +
        '    createOrder (symbol: string, type: string, side: string): any {\n' +
        '        return symbol;\n' +
        '    }\n' +
        '}\n';

    const config = (go: any) => ({ 'verbose': false, 'go': Object.assign({ 'parser': { 'NUM_LINES_END_FILE': 0 } }, go) });
    const go = (ts: string, extra: any = {}) => new Transpiler(config(extra)).transpileGo(ts).content;

    describe('go general parameter rules', () => {
        test('a table-listed []any slot prints orders []any and the native length', () => {
            const out = go(PRELUDE, { 'unifiedSliceParams': { 'createOrders': { 0: '[]any' } } });
            expect(out).toContain('orders []any');
            expect(out).toContain('len(orders)');
        });
        test('without the table slot orders stays boxed', () => {
            const out = go(PRELUDE);
            expect(out).not.toContain('orders []any');
        });
        test('an element read of the slot keeps GetValue', () => {
            const ts = PRELUDE.replace('return orders.length;', 'return orders[0];');
            const out = go(ts, { 'unifiedSliceParams': { 'createOrders': { 0: '[]any' } } });
            expect(out).toContain('GetValue(orders, 0)');
        });
        test('a Client.url call site proves a string parameter', () => {
            const ts = 'class Client { url: string; }\n' +
                'class Exchange {}\n' +
                'class ex extends Exchange {\n' +
                '    getType (url: string): string {\n        return url.toUpperCase ();\n    }\n' +
                '    run (client: Client): string {\n        return this.getType (client.url);\n    }\n' +
                '}\n';
            const out = go(ts);
            expect(out).toContain('GetType(url string)');
        });
        test('a sibling passthrough of a unified-string parameter proves a builder parameter only when the pattern names it', () => {
            const dir = nodepath.join(__dirname, 'files', 'tmp-rf-go-7', 'ts', 'src');
            nodefs.mkdirSync(nodepath.join(dir, 'pro'), { recursive: true });
            nodefs.writeFileSync(nodepath.join(dir, 'ex.ts'),
                'class Exchange {}\nexport class ex extends Exchange {\n    buildRequest (symbol: string): string {\n        return symbol.toUpperCase ();\n    }\n    plain (symbol: string): string {\n        return symbol.toUpperCase ();\n    }\n}\n');
            nodefs.writeFileSync(nodepath.join(dir, 'pro', 'ex.ts'),
                "import ex from '../ex.js';\nexport default class exs extends ex {\n    async createOrderWs (symbol: string, type: string) {\n        const a = this.buildRequest (symbol);\n        const b = this.plain (symbol);\n        return [ a, b ];\n    }\n}\n");
            const run = (extra: any) => new Transpiler(config(Object.assign({ 'unifiedStringParams': { 'createOrderWs': [ 0, 1 ] } }, extra))).transpileGoByPath(nodepath.join(dir, 'ex.ts')).content;
            const on = run({ 'siblingStringPassthroughPattern': '^build\\w*Request$' });
            expect(on).toContain('BuildRequest(symbol string)');
            expect(on).toContain('Plain(symbol any)');
            expect(run({})).toContain('BuildRequest(symbol any)');
        });
        afterAll(() => nodefs.rmSync(nodepath.join(__dirname, 'files', 'tmp-rf-go-7'), { recursive: true, force: true }));
        test('an uncalled table method types its required string params; a stranger stays boxed', () => {
            const ts = 'class Exchange {}\n' +
                'class ex extends Exchange {\n' +
                '    convertIt (code: string, fromNetwork: string): string {\n        return fromNetwork.toUpperCase ();\n    }\n' +
                '    other (code: string, fromNetwork: string): string {\n        return fromNetwork.toUpperCase ();\n    }\n' +
                '}\n';
            const out = go(ts, { 'uncalledStringParams': { 'ex.convertIt': [ 1 ] } });
            expect(out).toContain('ConvertIt(code any, fromNetwork string)');
            expect(out).toContain('Other(code any, fromNetwork any)');
        });
    });
});

describe ('goStringCallPointerLocal', () => {
    // a `this.<m>(..)` call whose checker
    // type is exactly TS `string` and whose Go signature returns `string` is not boxed with SafeStringPtr
    // when it is stored in a *string slot; its value is kept in a typed local and the pointer takes the
    // local's address (`jsonText := this.Json(x)` + `name = &jsonText`).

    const PRELUDE = 'type Dict = { [key: string]: any };\n'
        + 'type Str = string | undefined;\n'
        + 'class Exchange {\n'
        + '    json (data: any, params = {}): string { return \'\'; }\n'
        + '    hmac (data: any): string { return \'\'; }\n'
        + '    safeString (o: any, k: string): string | undefined { return undefined; }\n'
        + '}\n';

    const print = (body: string, hooks = true): string => {
        const t = new Transpiler ({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 } } });
        if (hooks) { installCcxtGoHooks (t.goTranspiler); }
        return t.transpileGo (PRELUDE + 'class Foo extends Exchange {\n' + body + '}\n').content;
    };

    describe('go string-returning call stored in a *string slot', () => {
        test('statement assignment keeps the string in a typed local (fails on the boxed form)', () => {
            const out = print (
                '    sign (params: Dict, method: string): any {\n'
                + '        let bodyJson = undefined;\n'
                + '        if (method !== \'GET\') {\n'
                + '            bodyJson = this.json (params);\n'
                + '        }\n'
                + '        return { \'b\': bodyJson };\n'
                + '    }\n');
            expect (out).toContain ('var bodyJson *string = nil');
            expect (out).toContain ('\t\tjsonText := this.Json(params)\n\t\tbodyJson = &jsonText\n');
            expect (out).not.toContain ('SafeStringPtr(this.Json');
        });
        test('ternary arm returns the address of a numbered local; names count in source order per function', () => {
            const out = print (
                '    sign (params: Dict, query: Dict, method: string): any {\n'
                + '        let a = undefined;\n'
                + '        if (method !== \'GET\') {\n'
                + '            a = this.json (params);\n'
                + '        }\n'
                + '        const b = (method === \'POST\') ? this.json (query) : undefined;\n'
                + '        return { \'a\': a, \'b\': b };\n'
                + '    }\n');
            expect (out).toContain ('\t\tjsonText := this.Json(params)\n\t\ta = &jsonText\n');
            expect (out).toContain ('\t\t\tjsonText2 := this.Json(query)\n\t\t\treturn &jsonText2\n');
            expect (out).not.toContain ('SafeStringPtr(this.Json');
        });
        test('keyed on the callee type, not the name: hmac gets its own hmacText local', () => {
            const out = print (
                '    sign (params: Dict): any {\n'
                + '        let h = undefined;\n'
                + '        if (params) {\n'
                + '            h = this.json (params);\n'
                + '        }\n'
                + '        return { \'h\': h };\n'
                + '    }\n'
                + '    other (data: any): any {\n'
                + '        let s = undefined;\n'
                + '        if (data) {\n'
                + '            s = this.hmac (data);\n'
                + '        }\n'
                + '        return { \'s\': s };\n'
                + '    }\n');
            expect (out).toContain ('\t\tjsonText := this.Json(params)\n\t\th = &jsonText\n');
            expect (out).toContain ('\t\thmacText := this.Hmac(data)\n\t\ts = &hmacText\n');
            expect (out).not.toContain ('SafeStringPtr(');
        });
        test('a call typed string | undefined keeps the SafeStringPtr box', () => {
            const out = print (
                '    sign (o: Dict): any {\n'
                + '        let s = undefined;\n'
                + '        if (o) {\n'
                + '            s = this.safeString (o, \'k\');\n'
                + '        }\n'
                + '        return { \'s\': s };\n'
                + '    }\n');
            expect (out).not.toContain ('Text :=');
        });
        test('a local already spelled jsonText keeps the box', () => {
            const out = print (
                '    sign (params: Dict): any {\n'
                + '        const jsonText = 1;\n'
                + '        let b = undefined;\n'
                + '        if (params) {\n'
                + '            b = this.json (params);\n'
                + '        }\n'
                + '        return { \'b\': b, \'t\': jsonText };\n'
                + '    }\n');
            expect (out).not.toContain ('jsonText := this.Json');
            expect (out).not.toContain ('&jsonText');
        });
        test('a wider expression around the call keeps the box', () => {
            const out = print (
                '    sign (params: Dict): any {\n'
                + '        let b = undefined;\n'
                + '        if (params) {\n'
                + '            b = this.json (params) + \'x\';\n'
                + '        }\n'
                + '        return { \'b\': b };\n'
                + '    }\n');
            expect (out).not.toContain ('jsonText');
        });
    });
});

describe ('goPointerHelperTupleSlots', () => {
    const PRELUDE = 'type Dict = { [key: string]: any };\n'
        + 'type Str = string | undefined;\ntype Int = number | undefined;\ntype Bool = boolean | undefined;\n'
        + 'class Base {\n'
        + '    handleParamString (params: Dict, name: string, d?: string): [Str, Dict] { return [ undefined, params ]; }\n'
        + '    handleParamBool (params: Dict, name: string, d?: boolean): [Bool, Dict] { return [ undefined, params ]; }\n'
        + '    handleParamInteger (params: Dict, name: string, d?: number): [Int, Dict] { return [ undefined, params ]; }\n'
        + '    handleOptionBoolAndParams (params: Dict, m: string, o: string, d?: boolean): [Bool, Dict] { return [ undefined, params ]; }\n'
        + '    handleOptionIntegerAndParams (params: Dict, m: string, o: string, d?: number): [Int, Dict] { return [ undefined, params ]; }\n'
        + '    checkAddress (a: any, c?: any, t?: any): any { return a; }\n'
        + '    other (a: any): any { return a; }\n'
        + '}\n';

    const TABLED = { 'goTupleSlotTypes': { 'HandleOptionIntegerAndParams': [ '*int64' ] } };

    const go = (body: string, tables: object = {}): string => new Transpiler({ 'verbose': false, 'go': Object.assign({ 'parser': { 'NUM_LINES_END_FILE': 0 } }, tables) })
        .transpileGo(PRELUDE + 'class V extends Base {\n' + body + '}\n').content;

    const fn = (decl: string, uses: string, tables: object = {}): string => go('    f (address: string, params: Dict = {}): any {\n        const request: Dict = {};\n'
        + decl + uses + '        return request;\n    }\n', tables);

    const TAG = "        const [ tag, paramsTag ] = this.handleParamString (params, 'tag');\n";

    describe('tuple slot 0 of the pointer helpers is the typed pointer', () => {
        test('nil test, guarded map store, literal compare and a deref-ing callee keep the pointer', () => {
            const out = fn(TAG, "        this.checkAddress (address, 'c', tag);\n        if (tag !== undefined) {\n            request['memo'] = tag;\n        }\n        if (tag === 'x') {\n            request['y'] = 1;\n        }\n");
            expect(out).toContain('var tag *string = SafeStringPtr(tagparamsTagVariable[0])');
            expect(out).toContain('request["memo"] = *tag');
            expect(out).toContain('tag != nil && *tag == "x"');
            expect(out).not.toContain('tag := GetValue(');
        });
        test('an exiting nil guard proves the store', () => {
            const out = fn(TAG, "        if (tag === undefined) {\n            return undefined;\n        }\n        request['memo'] = tag;\n");
            expect(out).toContain('request["memo"] = *tag');
        });
        test('an int64 pair slot is the pointer', () => {
            const out = fn("        const [ limit, paramsLimit ] = this.handleParamInteger (params, 'limit');\n",
                "        if (limit !== undefined) {\n            request['n'] = limit;\n        }\n");
            expect(out).toContain('var limit *int64 = nil');
            expect(out).toContain('.(*int64); ok { limit = p }');
            expect(out).toContain('request["n"] = *limit');
        });
        test('the assignment form of a nil-initialised bool local is the pointer', () => {
            const out = fn("        let hedged: Bool = undefined;\n        [ hedged, params ] = this.handleParamBool (params, 'hedged', false);\n",
                "        if ((hedged === true) || request['a']) {\n            request['h'] = 1;\n        }\n");
            expect(out).toContain('var hedged *bool = nil');
            expect(out).toContain('hedged = SafeBoolPtr(hedgedparamsVariable[0])');
            expect(out).toContain('hedged != nil && *hedged == true');
            expect(out).not.toContain('hedged = GetValue(');
        });
        test('a local initialised to a value (not nil) keeps the pair assignment', () => {
            const out = fn("        let hedged: Bool = false;\n        [ hedged, params ] = this.handleParamBool (params, 'hedged', false);\n",
                "        if (hedged === true) {\n            request['h'] = 1;\n        }\n");
            expect(out).not.toContain('var hedged *bool');
            expect(out).not.toContain('SafeBoolPtr(hedgedparamsVariable[0])');
        });
        test('a nil-initialised local stores through its nil guard', () => {
            const out = fn("        let flag: Bool = undefined;\n        [ flag, params ] = this.handleParamBool (params, 'flag');\n",
                "        if (flag !== undefined) {\n            request['f'] = flag;\n        }\n");
            expect(out).toContain('var flag *bool = nil');
            expect(out).toContain('request["f"] = *flag');
        });
        test('a store without a nil proof keeps the box', () => {
            const out = fn(TAG, "        request['memo'] = tag;\n");
            expect(out).toContain('tag := GetValue(tagparamsTagVariable, 0)');
            expect(out).not.toContain('var tag *string');
        });
        test('an object literal value, a return and a foreign callee keep the box', () => {
            for (const use of [ "        request['o'] = { 'k': tag };\n", '        return tag;\n', '        this.other (tag);\n' ]) {
                const out = fn(TAG, use);
                expect(out).toContain('tag := GetValue(tagparamsTagVariable, 0)');
            }
        });
        test('a later write keeps the box', () => {
            const out = fn(TAG, "        tag = 'z';\n        this.checkAddress (address, 'c', tag);\n");
            expect(out).not.toContain('var tag *string');
        });
        test('a literal default selects the native pair twin: no pointer slot', () => {
            const out = fn("        const [ flag, paramsFlag ] = this.handleOptionBoolAndParams (params, 'f', 'flag', false);\n",
                "        if (flag === true) {\n            request['x'] = 1;\n        }\n");
            expect(out).not.toContain('var flag *bool');
        });
    });

    describe('option helpers keep the typed assertion read', () => {
        test('a variable default selects the Nullable twin: the slot reads through the typed assertion', () => {
            const out = fn("        const dflt = true;\n        const [ stock, paramsStock ] = this.handleOptionBoolAndParams (params, 'f', 'stock', dflt);\n",
                "        if (stock === true) {\n            request['s'] = 1;\n        }\n");
            expect(out).toContain('var stock *bool = nil');
            expect(out).toContain('.(*bool); ok { stock = p }');
        });
    });

    describe('tabled integer option slots', () => {
        const decl = "        const [ calls, paramsCalls ] = this.handleOptionIntegerAndParams (params, 'f', 'calls', address);\n";
        const uses = "        const n = this.other (calls);\n        request['n'] = this.checkAddress (calls);\n";
        test('a slot the embedder tables as *int64 is the pointer when a deref-ing callee reads it', () => {
            const out = fn(decl, "        request['n'] = this.checkAddress (address, 'c', calls);\n", TABLED);
            expect(out).toContain('var calls *int64 = nil');
            expect(out).toContain('.(*int64); ok { calls = p }');
        });
        test('without the table nothing changes', () => {
            const out = fn(decl, "        request['n'] = this.checkAddress (address, 'c', calls);\n");
            expect(out).not.toContain('var calls *int64');
        });
        test('a foreign callee keeps the box even when tabled', () => {
            expect(fn(decl, uses, TABLED)).not.toContain('var calls *int64');
        });
    });
});

describe ('goOptionDictReceivers', () => {
    let transpiler: Transpiler;

    beforeAll(() => {
        transpiler = new Transpiler({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 } } });
    });

    function go(ts: string): string {
        return transpiler.transpileGo(ts).content;
    }

    const PRELUDE = 'type Dict = { [key: string]: any };\nclass Base {\n    options: Dict;\n    has: Dict;\n    fees: Dict;\n    limits: Dict;\n' +
        '    extend (...a: any[]): any { return a; }\n    safeString (a: any, b: any, c: any = undefined): string { return ""; }\n' +
        '    safeInteger (a: any, b: any, c: any = undefined): number { return 0; }\n    safeDict (a: any, b: any, c: any = undefined): any { return a; }\n' +
        '    getMarketType (a: any, b: any): any { return a; }\n}\n';

    function cls(body: string): string {
        return PRELUDE + 'class Test extends Base {\n' + body + '}\n';
    }

    function flat(output: string): string {
        return output.replace(/\s+/g, ' ');
    }

    describe('go option dict field receivers', () => {
        test('a string-typed key stores natively behind the nil-map guard', () => {
            const out = go(cls('    a (marketType: string = "margin") {\n' +
                '        const options = this.safeDict (this.options, marketType, {});\n' +
                '        this.options[marketType] = this.extend (options, { "x": 1 });\n' +
                '    }\n'));
            expect(flat(out)).toContain('if this.Options != nil { this.Options[marketType] = this.Extend(options, map[string]any{ "x": 1, }) }');
            expect(out).not.toContain('AddElementToObject(this.Options');
        });

        test('a *string key adds its nil guard and a *string value stores dereferenced', () => {
            const out = go(cls('    a (params: Dict = {}) {\n' +
                '        const typeVar = this.safeString (params, "type", "margin");\n' +
                '        const id = this.safeString (params, "id");\n' +
                '        this.fees[typeVar] = id;\n' +
                '    }\n'));
            expect(flat(out)).toContain('var typeVar string = *this.SafeString(params, "type", "margin") var id *string = this.SafeString(params, "id") this.Fees[typeVar] = id');
        });

        test('an any-typed key or value keeps the helper', () => {
            const out = go(cls('    a (params: Dict = {}) {\n' +
                '        const typeVar = this.getMarketType ("a", params);\n' +
                '        this.options[typeVar] = this.extend ({}, {});\n' +
                '        this.fees["k"] = this.safeInteger (params, "v");\n' +
                '    }\n'));
            expect(out).toContain('AddElementToObject(this.Options, typeVar,');
            expect(out).toContain('this.Fees["k"] = this.SafeInteger(params, "v")');
        });

        test('key in an option dict binds the comma-ok read in the if init clause', () => {
            const out = go(cls('    a (reload = false) {\n' +
                '        if (reload || !(\'k\' in this.options)) {\n' +
                '            this.options["k"] = 1;\n' +
                '        }\n' +
                '        if (!(\'k\' in this.fees)) {\n' +
                '            this.limits["k"] = 1;\n' +
                '        }\n' +
                '    }\n'));
            expect(out).toContain('if _, ok := this.Options["k"]; (reload == true) || !ok {');
            expect(out).toContain('if _, ok := this.Fees["k"]; !ok {');
            expect(out).not.toContain('InOp(this.');
        });
    });
});

describe ('goWatchTickersRow', () => {
    // `const tickers = await this.watchTickers ([ k ]); return tickers[k]`
    // in an async method answering Promise<Ticker> reads one row of the typed `map[string]Ticker`, keyed on the checker
    // (the awaited method is tabled as a ticker-map channel; no printed-text pass in ccxt).
    const SRC = (body: string, params = 'symbol: string, params = {}') => [
        'interface Ticker { symbol: string }',
        'type Tickers = { [key: string]: Ticker };',
        'class Exchange {',
        '    safeSymbol (s: string): string { return s; }',
        '    async watchTickers (symbols: string[] = undefined, params = {}): Promise<Tickers> { return {}; }',
        '    async watchTicker (' + params + '): Promise<Ticker> {',
        body,
        '    }',
        '}',
        '',
    ].join ('\n');
    const print = (body: string, tabled = true, params?: string, hooks = false) => {
        const t = new Transpiler ({ 'verbose': false, 'go': { 'asyncMethodSuffix': 'Async', 'unifiedStringParams': (params === undefined) ? { 'watchTicker': [ 0 ] } : {},
            'asyncTickerMapCallees': tabled ? [ 'WatchTickers' ] : [], 'parser': { 'NUM_LINES_END_FILE': 0 } } });
        if (hooks) { installCcxtGoLocalTypes (t.goTranspiler); }
        return t.transpileGo (SRC (body, params)).content;
    };
    const STRING_KEY = '        const tickers = await this.watchTickers ([ symbol ], params);\n        return tickers[symbol];';

    describe('go typed ticker row', () => {
        test('a string key indexes the typed ticker map (fails without the table)', () => {
            const out = print (STRING_KEY);
            expect (out).toContain ('var tickers map[string]Ticker = PanicOnError(');
            expect (out).toContain ('ch <- TickerToMap(tickers[symbol])');
            expect (out).not.toContain ('GetValue(tickers');
            const base = print (STRING_KEY, false);
            expect (base).toContain ('GetValue(tickers, symbol)');
            expect (base).not.toContain ('map[string]Ticker');
        });
        test('a non-string key keeps GetValue', () => {
            const out = print ('        const tickers = await this.watchTickers ([ symbol ], params);\n        return tickers[symbol];', true, 'symbol: any, params = {}');
            expect (out).not.toContain ('map[string]Ticker');
        });
        test('a map read twice or rebound keeps GetValue', () => {
            const twice = print ('        const tickers = await this.watchTickers ([ symbol ], params);\n        const other = tickers[symbol];\n        return tickers[symbol];');
            expect (twice).not.toContain ('map[string]Ticker');
            const rebound = print ('        let key = symbol;\n        const tickers = await this.watchTickers ([ key ], params);\n        key = \'x\';\n        return tickers[key];');
            expect (rebound).not.toContain ('map[string]Ticker');
        });
        test('another awaited method keeps GetValue', () => {
            expect (print (STRING_KEY.replace ('watchTickers', 'watchOther'))).not.toContain ('map[string]Ticker');
        });
        test('a *string key is guarded (a nil key reads the zero Ticker)', () => {
            const body = '        const key = this.safeSymbol (symbol);\n        const tickers = await this.watchTickers ([ key ], params);\n        return tickers[key];';
            const out = print (body, true, undefined, true);
            if (out.includes ('var key *string')) {
                expect (out).toContain ('var tickerRow Ticker\n\tif key != nil {\n\t\ttickerRow = tickers[*key]\n\t}');
                expect (out).toContain ('ch <- TickerToMap(tickerRow)');
            } else {
                expect (out).not.toContain ('tickers[key]');
            }
            expect (print (body, false, undefined, true)).not.toContain ('map[string]Ticker');
        });
    });
});

describe ('goAnySliceToList', () => {
    const fs = fs__goAnySliceToList;
    const os = os__goAnySliceToList;
    const path = path__goAnySliceToList;
    // An awaited list local that the printer declares `[]any` (goAwaitReceiveUnbox) reads its rows as xs[i]:
    // a `this.xs` field or `{ xs: v }` key of the same name is not a use of the local, and a callee whose
    // channel carries `[]map[string]any` has map rows, never a scalar box.

    const PRELUDE =
        'type Dict = { [key: string]: any };\n' +
        'interface Position { symbol: string }\n' +
        'class Exchange {\n' +
        '    positions: any = undefined;\n' +
        '    parseRow (row: any): any { return row; }\n' +
        '    async fetchPositions (symbols: string[] = undefined, params: Dict = {}): Promise<Position[]> { return []; }\n' +
        '    async fetchRawMarketsPaged (extra: Dict = {}): Promise<any[]> { return []; }\n' +
        '}\n';

    const tmp = fs.mkdtempSync (path.join (os.tmpdir (), 'bg-anyslice-'));

    function go (body: string, callees: string[] = []): string {
        const dir = path.join (tmp, 'ts', 'src', 'pro');
        fs.mkdirSync (dir, { 'recursive': true });
        const file = path.join (dir, 'venue.ts');
        fs.writeFileSync (file, PRELUDE + 'class venue extends Exchange {\n    async run (type: string) {\n' + body + '\n    }\n}\n');
        const transpiler: any = new Transpiler ({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 }, 'asyncMethodSuffix': 'Async', 'asyncMapRowListCallees': callees } });
        installCcxtGoLocalTypes (transpiler.goTranspiler);
        return transpiler.transpileGoByPath (file).content;
    }

    describe('awaited list locals read natively', () => {
        afterAll(() => {
            fs.rmSync (tmp, { 'recursive': true, 'force': true });
        });

        test('a same-named this.field does not keep the local boxed', () => {
            const out = go (
                '        const positions = await this.fetchPositions (undefined, { type });\n' +
                '        this.positions = new Array ();\n' +
                '        for (let i = 0; i < positions.length; i++) {\n' +
                '            const position = positions[i];\n' +
                '            this.parseRow (position);\n' +
                '        }');
            expect (out).toContain ('var positions []any = ListTyped(');
            expect (out).toContain ('var position any = positions[i]');
            expect (out).not.toContain ('GetValue(positions, i)');
        });

        test('an object-literal key of the same name does not keep the local boxed', () => {
            const out = go (
                '        const positions = await this.fetchPositions ();\n' +
                '        const request = { \'positions\': 1 };\n' +
                '        for (let i = 0; i < positions.length; i++) {\n' +
                '            this.parseRow (positions[i]);\n' +
                '        }');
            expect (out).toContain ('var positions []any = ListTyped(');
            expect (out).not.toContain ('GetValue(positions, i)');
        });

        test('a read of the local that is not a list read keeps the box', () => {
            const out = go (
                '        const positions = await this.fetchPositions ();\n' +
                '        const other = positions;\n' +
                '        this.parseRow (other);\n' +
                '        for (let i = 0; i < positions.length; i++) {\n' +
                '            this.parseRow (positions[i]);\n' +
                '        }');
            expect (out).not.toContain ('var positions []any');
            expect (out).toContain ('GetValue(positions, i)');
        });

        test('a callee the host tables as []map[string]any has map rows', () => {
            const body =
                '        const rows = await this.fetchRawMarketsPaged ({});\n' +
                '        const n = rows.length;\n' +
                '        for (let i = 0; i < rows.length; i++) {\n' +
                '            this.parseRow (rows[i]);\n' +
                '        }';
            const tabled = go (body, [ 'FetchRawMarketsPaged' ]);
            expect (tabled).toContain ('var rows []any = ListTyped(');
            expect (tabled).toContain ('this.ParseRow(rows[i])');
            expect (tabled).not.toContain ('GetValue(rows, i)');
            const untabled = go (body);
            expect (untabled).toContain ('GetValue(rows, i)');
        });

        test('a loop not bounded by the list keeps GetValue', () => {
            const out = go (
                '        const positions = await this.fetchPositions ();\n' +
                '        this.positions = 1;\n' +
                '        for (let i = 0; i < 3; i++) {\n' +
                '            this.parseRow (positions[i]);\n' +
                '        }');
            expect (out).toContain ('GetValue(positions, i)');
        });
    });
});

describe ('goPostPrintRules', () => {
    // Go printer rules for async boolean parameters and the Options field.
    let transpiler: Transpiler;
    beforeAll(() => {
        transpiler = new Transpiler({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 } } });
    });
    const go = (ts: string): string => transpiler.transpileGo(ts).content;
    const signature = (out: string, name: string): string => out.split('\nfunc ').find((f) => f.startsWith('(this *Test) ' + name + '(')) ?? '';

    describe('go async boolean parameter', () => {
        const body = (call: string, use = 'if (flag) { return 1; } return 2;') => 'class Base {}\nclass Test extends Base {\n'
            + '    async load (flag: boolean): Promise<any> { ' + use + ' }\n'
            + '    async main (): Promise<any> { ' + call + ' }\n}\n';
        test('every call site passes a bool literal: the parameter prints bool', () => {
            const out = go(body('await this.load (true); return await this.load (false);'));
            expect(signature(out, 'Load')).toContain('(flag bool)');
        });
        test('a call site passing a non-literal keeps any', () => {
            const out = go(body('const x: any = 1; return await this.load (x);'));
            expect(signature(out, 'Load')).not.toContain('flag bool');
        });
        test('a body that nil-tests the parameter keeps any', () => {
            const out = go(body('return await this.load (true);', 'if (flag === undefined) { return 1; } return 2;'));
            expect(signature(out, 'Load')).not.toContain('flag bool');
        });
    });

    const OPTIONS = 'type Dict = { [key: string]: any };\nclass Base { options: Dict = {}; safeString (d: Dict, k: string): string | undefined { return undefined; } safeDict (d: Dict, k: string): Dict { return {}; } }\n';
    describe('go Options is a plain map[string]any field', () => {
        const run = (stmts: string, params = '') => go(OPTIONS + 'class Test extends Base {\n    f (' + params + '): any { ' + stmts + ' }\n}\n');
        test('literal-key store and read are native', () => {
            const out = run("this.options['k'] = 1; return this.options['k'];");
            expect(out).toContain('this.Options["k"] = 1');
            expect(out).not.toContain('AddElementToObject(this.Options');
            expect(out).not.toContain('Options.Store');
        });
        test('string-typed key is native, any key keeps the helper', () => {
            const typed = run("const k: string = 'a'; this.options[k] = 1;");
            expect(typed).toContain('this.Options[k] = 1');
            const boxed = run("this.options[k] = 1;", 'k: any');
            expect(boxed).toContain('AddElementToObject(this.Options, k, 1)');
        });
        test('a safeString (typed pointer) value is stored through DerefScalar', () => {
            const out = run("this.options['k'] = this.safeString ({}, 'a');");
            expect(out).toMatch(/this\.Options\["k"\] = DerefScalar\(this\.SafeString\(/);
        });
        test('a pointer value stored into another map field is not wrapped (only the plain-valued Options field is)', () => {
            const out = go(OPTIONS + "class Test extends Base {\n    features: Dict = {};\n    f (): any { this.features['k'] = this.safeString ({}, 'a'); return 1; }\n}\n");
            expect(out).toMatch(/this\.Features\["k"\] = this\.SafeString\(/);
            expect(out).not.toContain('DerefScalar(this.SafeString');
        });
    });
});

describe ('goEndpointReceiveTypedView', () => {
    const fs = fs__goEndpointReceiveTypedView;
    const os = os__goEndpointReceiveTypedView;
    const path = path__goEndpointReceiveTypedView;
    // a receive from an implicit endpoint whose declared type is the stub's EndpointResult
    // element reads the carrier's typed view (`.Checked()`, hoisted by ccxt's go-err pass to `rN.Value`)
    // instead of converting `.Raw` through MapTyped/ListTyped. The element comes from the receiver's own
    // generated `<id>_api.go`; another receiver's stub of the same name, or a stub of the other shape,
    // keeps the conversion.

    const ABSTRACT =
        "import { Dict, List } from '../base/types.js';\n" +
        "import { Exchange as _Exchange } from '../base/Exchange.js';\n" +
        'abstract class Exchange extends _Exchange {\n' +
        '    privateGetOrdersId (params = {}): Promise<Dict> {\n        return this.request ("orders", [ "private" ], "GET", params);\n    }\n\n' +
        '    privateGetRows (params = {}): Promise<List> {\n        return this.request ("rows", [ "private" ], "GET", params);\n    }\n}\n' +
        'export default Exchange;\n';

    const TYPES = 'export type Dict = { [key: string]: any };\nexport type List = any[];\n';
    const BASE =
        "import { Dict } from './types.js';\n" +
        'export class Exchange {\n    request (path: string, api: string[], method: string, params: Dict = {}): Promise<any> {\n        return undefined;\n    }\n' +
        '    extend (a: Dict, b: Dict): Dict {\n        return a;\n    }\n' +
        '    safeString (o: any, k: string): string {\n        return k;\n    }\n' +
        '    indexBy (o: any, k: string): Dict {\n        return {};\n    }\n}\n';

    const VENUE =
        "import Exchange from './abstract/ex.js';\n" +
        "import { Dict } from './base/types.js';\n" +
        'export default class ex extends Exchange {\n' +
        '    async fetchThing (params = {}) {\n' +
        '        const response = await this.privateGetOrdersId (params);\n' +
        "        return this.safeString (response, 'id');\n" +
        '    }\n' +
        '    async fetchRows (params = {}) {\n' +
        '        const rows = await this.privateGetRows (this.extend ({\n' +
        "            'a': 1,\n" +
        "            'b': 2,\n" +
        '        }, params));\n' +
        "        return this.indexBy (rows, 'id');\n" +
        '    }\n' +
        '}\n';

    function stubs (mapElement: string, listElement: string): string {
        return 'package ccxt\n\n' +
            '// PrivateGetOrdersId returns a channel that yields a JSON object.\n' +
            'func (this *Ex) PrivateGetOrdersId(args ...any) <-chan EndpointResult[' + mapElement + '] {\n\treturn nil\n}\n' +
            '// PrivateGetRows returns a channel that yields a JSON array.\n' +
            'func (this *Ex) PrivateGetRows(args ...any) <-chan EndpointResult[' + listElement + '] {\n\treturn nil\n}\n';
    }

    function print (apiGo: string | undefined, install = true, venue: string = VENUE): string {
        const tmp = fs.mkdtempSync (path.join (os.tmpdir (), 'rfm-g1-gp18-'));
        try {
            const src = path.join (tmp, 'ts', 'src');
            fs.mkdirSync (path.join (src, 'base'), { 'recursive': true });
            fs.mkdirSync (path.join (src, 'abstract'), { 'recursive': true });
            fs.writeFileSync (path.join (src, 'base', 'types.ts'), TYPES);
            fs.writeFileSync (path.join (src, 'base', 'Exchange.ts'), BASE);
            fs.writeFileSync (path.join (src, 'abstract', 'ex.ts'), ABSTRACT);
            fs.writeFileSync (path.join (src, 'ex.ts'), venue);
            if (apiGo !== undefined) {
                fs.mkdirSync (path.join (tmp, 'go', 'v4'), { 'recursive': true });
                fs.writeFileSync (path.join (tmp, 'go', 'v4', 'ex_api.go'), apiGo);
            }
            const t = new Transpiler ({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 }, 'asyncMethodSuffix': 'Async', 'asyncSuffixExemptPaths': [ '(^|/)ts/src/abstract/' ] } });
            if (install) {
                installCcxtGoHooks (t.goTranspiler);
            }
            return t.transpileGoByPath (path.join (src, 'ex.ts')).content;
        } finally {
            fs.rmSync (tmp, { 'recursive': true, 'force': true });
        }
    }

    describe('go endpoint receive reads the typed view', () => {
        test('a map stub receive prints the checked typed view, not MapTyped(Raw)', () => {
            const out = print (stubs ('map[string]any', '[]any'));
            expect (out).toContain ('var response map[string]any = (<-this.PrivateGetOrdersId(params)).Checked()');
            expect (out).not.toContain ('MapTyped(PanicOnError((<-this.PrivateGetOrdersId');
        });
        test('a multi-line []any stub receive prints the checked typed view', () => {
            const out = print (stubs ('map[string]any', '[]any'));
            expect (out).toContain ('var rows []any = (<-this.PrivateGetRows(');
            expect (out).toContain ('.Checked()');
            expect (out).not.toContain ('ListTyped(PanicOnError((<-this.PrivateGetRows');
        });
        test('without the receiver stub table the shipped conversion stays', () => {
            const out = print (undefined);
            expect (out).not.toContain ('.Checked()');
        });
        test('a stub whose element disagrees with the declared Promise<T> is refused, never retyped', () => {
            expect (() => print (stubs ('string', '[]any'))).toThrow ();
        });
    });

    describe('a one-line []any endpoint receive is bound to a holder named after its target', () => {
        const venueWith = (body: string): string =>
            "import Exchange from './abstract/ex.js';\n" +
            "import { Dict } from './base/types.js';\n" +
            'export default class ex extends Exchange {\n' + body + '}\n';
        const holders = (out: string): string[] => [ ...out.matchAll (/(\w+) := \(<-this\.PrivateGetRows\(/g) ].map ((m) => m[1]);

        test('the declaration form reads <name>Recv.Raw then .Value', () => {
            const out = print (stubs ('map[string]any', '[]any'), true, venueWith (
                '    async fetchRows (params = {}) {\n        const data = await this.privateGetRows (params);\n        return this.indexBy (data, \'id\');\n    }\n'));
            expect (out).toContain ('dataRecv := (<-this.PrivateGetRows(params))\n');
            expect (out).toContain ('PanicOnError(dataRecv.Raw)\n');
            expect (out).toContain ('var data []any = dataRecv.Value');
            expect (out).not.toContain ('ListTyped(PanicOnError((<-this.PrivateGetRows');
            expect (out).not.toMatch (/listEp|listRecv/);
        });
        test('the assignment form names the holder after the assigned local', () => {
            const out = print (stubs ('map[string]any', '[]any'), true, venueWith (
                '    async fetchRows (params = {}) {\n        let response = undefined;\n        if (params) {\n            response = await this.privateGetRows (params);\n        } else {\n            response = await this.privateGetRows ({});\n        }\n        return this.indexBy (response, \'id\');\n    }\n'));
            expect (holders (out)).toEqual ([ 'responseRecv', 'responseRecv' ]);
            expect (out).toContain ('response = responseRecv.Value');
        });
        test('the name does not move when lines are added above', () => {
            const body = '    async fetchRows (params = {}) {\n        const data = await this.privateGetRows (params);\n        return this.indexBy (data, \'id\');\n    }\n';
            const shifted = '    // a\n    // b\n    // c\n' + body;
            expect (holders (print (stubs ('map[string]any', '[]any'), true, venueWith (body)))).toEqual ([ 'dataRecv' ]);
            expect (holders (print (stubs ('map[string]any', '[]any'), true, venueWith (shifted)))).toEqual ([ 'dataRecv' ]);
        });
        test('a second receive into the same local in one scope takes a numeric suffix', () => {
            const out = print (stubs ('map[string]any', '[]any'), true, venueWith (
                '    async fetchRows (params = {}) {\n        let response = undefined;\n        response = await this.privateGetRows (params);\n        response = await this.privateGetRows (params);\n        response = await this.privateGetRows (params);\n        return this.indexBy (response, \'id\');\n    }\n'));
            expect (holders (out)).toEqual ([ 'responseRecv', 'responseRecv2', 'responseRecv3' ]);
        });
        test('a name already used in the function gets the suffix', () => {
            const out = print (stubs ('map[string]any', '[]any'), true, venueWith (
                '    async fetchRows (params = {}) {\n        const dataRecv = 1;\n        const data = await this.privateGetRows (params);\n        return this.indexBy (data, \'id\') && dataRecv;\n    }\n'));
            expect (holders (out)).toEqual ([ 'dataRecv2' ]);
        });
        test('a receive that stays boxed (no stub table) binds no holder', () => {
            const out = print (undefined, true, venueWith (
                '    async fetchRows (params = {}) {\n        const data = await this.privateGetRows (params);\n        return this.indexBy (data, \'id\');\n    }\n'));
            expect (out).not.toContain ('dataRecv');
        });
    });
});

describe ('goBaseMapLocals', () => {
    const fs = fs__goBaseMapLocals;
    const os = os__goBaseMapLocals;
    const path = path__goBaseMapLocals;
    // `var x any = this.<M>(..)` where <M> is a BaseExchange method whose Go signature
    // (base, every override, IDerivedExchange) is `map[string]any` prints `var x map[string]any`. The callee
    // already hands back that map boxed into `any` (a nil map stays a typed nil in the box), so only the
    // static type narrows: nil compares (`IsEqual(x, nil)` -> `x == nil`) and pushing the local into a list
    // keep their meaning. The prediction tree keeps its box.

    const PRELUDE =
        'type Dict = { [key: string]: any };\n' +
        'type MarketInterface = { id: string };\n' +
        'type Market = MarketInterface | undefined;\n' +
        'class Exchange {\n' +
        '    parseMarket (market: Dict): Market { return undefined; }\n' +
        '    parseBalance (response: Dict): Dict { return {}; }\n' +
        '    parseWsTrade (trade: Dict, market: Market = undefined): Dict { return {}; }\n' +
        '    parseTicker (ticker: Dict): Dict { return {}; }\n' +
        '    parseOther (ticker: Dict): Dict { return {}; }\n' +
        '    describe (): Dict { return {}; }\n' +
        '    parseTickers (r: Dict): Dict { return {}; }\n' +
        '    parseFundingRates (r: Dict): Dict { return {}; }\n' +
        '    sign (path: string): Dict { return {}; }\n' +
        '    handleRouteAndParams (name: string, params: Dict): Dict { return {}; }\n' +
        '    getMarketFromSymbols (symbols: string[]): Market { return undefined; }\n' +
        '    markets: Dict = undefined;\n' +
        '    %BODY%\n' +
        '}\n';

    const config = () => ({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 } } });

    function go (body: string, hooks = true): string {
        const t = new Transpiler (config ());
        if (hooks) {
            installCcxtGoHooks (t.goTranspiler);
        }
        return t.transpileGo (PRELUDE.replace ('%BODY%', body)).content;
    }

    function goAt (relative: string, body: string): string {
        const tmp = fs.mkdtempSync (path.join (os.tmpdir (), 'go-at-'));
        try {
            const file = path.join (tmp, relative);
            fs.mkdirSync (path.dirname (file), { recursive: true });
            fs.writeFileSync (file, PRELUDE.replace ('%BODY%', body).replace ('class Exchange', 'export class Exchange'));
            const t = new Transpiler (config ());
            installCcxtGoHooks (t.goTranspiler);
            return t.transpileGoByPath (file).content;
        } finally {
            fs.rmSync (tmp, { recursive: true, force: true });
        }
    }

    const NIL_AND_PUSH =
        '    run (rows: Dict[]): any {\n' +
        '        const result = [];\n' +
        '        for (let i = 0; i < rows.length; i++) {\n' +
        '            const parsed = this.parseMarket (rows[i]);\n' +
        '            if (parsed !== undefined) {\n' +
        '                result.push (parsed);\n' +
        '            }\n' +
        '        }\n' +
        '        return result;\n' +
        '    }\n';

    describe ('go base map-returning callee locals', () => {
        test ('a nil-tested local that is pushed into a list is typed and the nil test goes native', () => {
            const out = go (NIL_AND_PUSH);
            expect (out).toContain ('var parsed map[string]any = this.ParseMarket(');
            expect (out).toContain ('if parsed != nil {');
            expect (out).not.toContain ('IsEqual(parsed, nil)');
            expect (out).toContain ('append(result, parsed)');
        });

        test ('the typed local reads natively', () => {
            const out = go (
                '    run (m: Dict): any {\n' +
                '        const parsed = this.parseMarket (m);\n' +
                '        if (parsed === undefined) { return undefined; }\n' +
                '        return parsed[\'id\'];\n' +
                '    }\n');
            expect (out).toContain ('var parsed map[string]any = this.ParseMarket(');
            expect (out).toContain ('parsed["id"]');
        });

        test ('getMarketFromSymbols, parseBalance, parseWsTrade and describe are in the family', () => {
            const out = go (
                '    run (symbols: string[], m: Dict): any {\n' +
                '        const first = this.getMarketFromSymbols (symbols);\n' +
                '        const balance = this.parseBalance (m);\n' +
                '        const trade = this.parseWsTrade (m);\n' +
                '        const description = this.describe ();\n' +
                '        return [ first, balance, trade, description ];\n' +
                '    }\n');
            expect (out).toContain ('var first map[string]any = this.GetMarketFromSymbols(symbols)');
            expect (out).toContain ('var balance map[string]any = this.ParseBalance(m)');
            expect (out).toMatch (/var trade map\[string\]any = (MapTyped\()?this\.ParseWsTrade\(m\)/);
            expect (out).toContain ('var description map[string]any = this.Describe()');
        });

        test ('generated dict producers (tickers, sign, route params, rates) type their local', () => {
            const out = go (
                '    run (m: Dict): any {\n' +
                '        const tickers = this.parseTickers (m);\n' +
                '        const rates = this.parseFundingRates (m);\n' +
                '        const request = this.sign (\'p\');\n' +
                '        const routed = this.handleRouteAndParams (\'watch\', m);\n' +
                '        return [ tickers[\'a\'], rates[\'a\'], request[\'url\'], routed[\'a\'] ];\n' +
                '    }\n');
            expect (out).toContain ('var tickers map[string]any = this.ParseTickers(m)');
            expect (out).toContain ('var rates map[string]any = this.ParseFundingRates(m)');
            expect (out).toContain ('var request map[string]any = this.Sign(');
            expect (out).toContain ('var routed map[string]any = this.HandleRouteAndParams(');
        });

        test ('a base book accessor local (this.markets) is typed and its nil test goes native', () => {
            const body =
                '    run (): any {\n' +
                '        const markets = this.markets;\n' +
                '        if (markets === undefined) { return 1; }\n' +
                '        return 0;\n' +
                '    }\n';
            const out = goAt ('ts/src/base/Exchange.ts', body);
            expect (out).toContain ('var markets map[string]any = this.Markets');
            expect (out).toContain ('if markets == nil {');
            // a same-named member outside the base Exchange is not the book getter
            expect (go (body)).toContain ('var markets any = this.Markets');
        });

        test ('a callee outside the family keeps the box', () => {
            const out = go (
                '    run (m: Dict): any {\n' +
                '        const t = this.parseOther (m);\n' +
                '        return t;\n' +
                '    }\n');
            expect (out).not.toContain ('var t map[string]any = this.ParseOther(');
        });

        test ('a local rebound to another type keeps the box', () => {
            const out = go (
                '    run (m: Dict): any {\n' +
                '        let parsed: any = this.parseMarket (m);\n' +
                '        parsed = 5;\n' +
                '        return parsed;\n' +
                '    }\n');
            expect (out).not.toContain ('var parsed map[string]any');
        });

        test ('a local that is the receiver of push keeps the box', () => {
            const out = go (
                '    run (m: Dict): any {\n' +
                '        const parsed: any = this.parseMarket (m);\n' +
                '        parsed.push (1);\n' +
                '        return parsed;\n' +
                '    }\n');
            expect (out).not.toContain ('var parsed map[string]any');
        });

        test ('the prediction tree keeps its box, the REST tree does not', () => {
            const body = NIL_AND_PUSH;
            expect (goAt ('ts/src/prediction/kalshi.ts', body)).toContain ('var parsed any = this.ParseMarket(');
            expect (goAt ('ts/src/kalshi.ts', body)).toContain ('var parsed map[string]any = this.ParseMarket(');
        });
    });
});

describe ('goDeleteStatement', () => {
    let transpiler: Transpiler;
    beforeAll(() => {
        transpiler = new Transpiler({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 } } });
    });

    const go = (body: string) => transpiler.transpileGo(
        'class E {\n    ohlcvs: any;\n    safeString(a, b, c?): string | undefined { return a; }\n    m(symbol: string, id: string | undefined) {\n' + body + '\n    }\n}').content;

    describe('go delete statement', () => {
        test('a map local with a string key and an ohlcvs book delete natively', () => {
            const out = go("const s = 'BTC'; const m = {}; delete m[s]; delete this.ohlcvs[s]['1m'];");
            expect(out).toContain('delete(m, s)');
            expect(out).toContain('delete(this.Ohlcvs[s], "1m")');
            expect(out).not.toContain('Remove(');
        });
        test('a narrowed *string key derefs, an unproven one keeps the helper', () => {
            const narrowed = go("const k = this.safeString({}, 'k'); const m = {}; if (k !== undefined) { delete m[k]; }");
            expect(narrowed).toContain('delete(m, *k)');
            const unproven = go("const k = this.safeString({}, 'k'); const m = {}; delete m[k];");
            expect(unproven).toContain('Remove(m, k)');
        });
        test('any receivers, any keys and delete in expression position keep the helper', () => {
            expect(go('delete this.ohlcvs[id];')).toContain('Remove(');
            expect(go('const m = this.safeString({}, "x"); delete m[symbol];')).toContain('Remove(m, symbol)');
            expect(go('const m = {}; delete m[symbol + "x"];')).toContain('Remove(');
            expect(go('const m = {}; const ok = delete m[symbol];')).toContain('Remove(m, symbol)');
        });
    });
});

describe ('goBookDeltaParam', () => {
    // handleBookDelta / handleBookDeltas declare `orderbook: WsOrderBook`: the base and every override print the book
    // interface, and the side reads on that parameter print its accessors. A forwarding pro handler follows its callee.

    const BOOK = {
        'classes': [ 'OrderBook' ],
        'constructors': [ 'orderBook' ],
        'cacheReaders': [ 'safeValue' ],
        'type': 'OrderBookInterface',
        'sideType': 'IOrderBookSide',
        'unbox': 'OrderBookTyped',
        'sides': { 'asks': 'GetAsks', 'bids': 'GetBids' },
    };

    const HEAD = 'type Dict = { [key: string]: any };\n'
        + 'class Side { store (p: number, a: number) { return p + a; } }\n'
        + 'class OrderBook { asks: Side; bids: Side; reset (x: Dict) { return x; } }\n'
        + 'type WsOrderBook = OrderBook;\n';

    const BASE = HEAD
        + 'class Exchange {\n'
        + '    orderBook (snapshot = {}): OrderBook { return new OrderBook (); }\n'
        + '    safeValue (o: any, k: string): any { return o[k]; }\n'
        + '    handleBookDeltas (orderbook: WsOrderBook, deltas: any[]) {\n'
        + '        for (let i = 0; i < deltas.length; i++) {\n'
        + '            this.handleBookDelta (orderbook, this.safeValue (deltas, String (i)));\n'
        + '        }\n'
        + '    }\n'
        + '    handleBookDelta (orderbook: WsOrderBook, delta: any) {\n'
        + '        throw new Error (\'not supported\');\n'
        + '    }\n'
        + '}\n';

    const print = (relative: string, source: string, book: any = BOOK): string => {
        const dir = fs.mkdtempSync (path.join (os.tmpdir (), 'bookdelta-'));
        try {
            const file = path.join (dir, 'ts', 'src', relative);
            fs.mkdirSync (path.dirname (file), { 'recursive': true });
            fs.writeFileSync (file, source);
            const config: any = { 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 } } };
            if (book !== null) {
                config.go.orderBook = book;
            }
            return new Transpiler (config).transpileGoByPath (file).content;
        } finally {
            fs.rmSync (dir, { 'recursive': true, 'force': true });
        }
    };

    const PRO = HEAD
        + 'class Exchange {\n'
        + '    orderbooks: { [key: string]: OrderBook } = {};\n'
        + '    orderBook (snapshot = {}): OrderBook { return new OrderBook (); }\n'
        + '    safeValue (o: any, k: string): any { return o[k]; }\n'
        + '    handleBookDelta (orderbook: WsOrderBook, delta: any) {}\n'
        + '}\n'
        + 'class ex extends Exchange {\n'
        + '    override handleBookDelta (orderbook: WsOrderBook, delta: any) {\n'
        + '        const bids = orderbook[\'bids\'];\n'
        + '        const asks = orderbook[\'asks\'];\n'
        + '        bids.store (1, 2);\n'
        + '        asks.store (1, 2);\n'
        + '    }\n'
        + '    handleOrderBookMessage (client: any, message: Dict, orderbook: WsOrderBook) {\n'
        + '        this.handleBookDelta (orderbook, message);\n'
        + '    }\n'
        + '    fromCache (symbol: string) {\n'
        + '        const book: WsOrderBook = this.safeValue (this.orderbooks, symbol);\n'
        + '        this.handleBookDelta (book, 1);\n'
        + '    }\n'
        + '    handleTyped (client: any, message: Dict) {\n'
        + '        const book = this.orderBook ();\n'
        + '        this.handleOrderBookMessage (client, message, book);\n'
        + '    }\n'
        + '}\n';

    describe('handleBookDelta book parameter', () => {
        test('the base methods print the book interface (fails on the base printer)', () => {
            const out = print ('base/Exchange.ts', BASE);
            expect (out).toContain ('HandleBookDeltas(orderbook OrderBookInterface, deltas any)');
            expect (out).toContain ('HandleBookDelta(orderbook OrderBookInterface, delta any)');
        });

        test('an override prints the book interface and its side reads the accessors (fails on the base printer)', () => {
            const out = print ('pro/ex.ts', PRO);
            expect (out).toContain ('HandleBookDelta(orderbook OrderBookInterface, delta any)');
            expect (out).toContain ('orderbook.GetBids()');
            expect (out).toContain ('orderbook.GetAsks()');
            expect (out).not.toContain ('GetValue(orderbook, "bids")');
        });

        test('a handler that forwards its book follows the callee when every caller passes a book', () => {
            const out = print ('pro/ex.ts', PRO);
            expect (out).toContain ('HandleOrderBookMessage(client any, message map[string]any, orderbook OrderBookInterface)');
        });

        test('a handler with a caller that does not pass a book keeps the box', () => {
            const out = print ('pro/ex.ts', PRO.replace ('this.handleOrderBookMessage (client, message, book);', 'this.handleOrderBookMessage (client, message, message);'));
            expect (out).toContain ('HandleOrderBookMessage(client any, message map[string]any, orderbook any)');
            expect (out).toContain ('HandleBookDelta(orderbook OrderBookInterface, delta any)');
        });

        test('a book parameter written with a foreign value keeps the box', () => {
            const out = print ('pro/ex.ts', PRO.replace ('const bids = orderbook[\'bids\'];', 'orderbook = undefined;\n        const bids = orderbook[\'bids\'];'));
            expect (out).toContain ('func (this *ex) HandleBookDelta(orderbook OrderBookInterface, delta any)');
            expect (out).toContain ('orderbook = nil');
        });

        test('without the book config nothing changes', () => {
            const out = print ('base/Exchange.ts', BASE, null);
            expect (out).toContain ('HandleBookDelta(orderbook any, delta any)');
            expect (out).not.toContain ('OrderBookInterface');
        });
    });
});

describe ('goNilStringLocalDerefArg', () => {
    let transpiler: Transpiler;
    beforeAll(() => {
        transpiler = new Transpiler({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 } } });
    });

    const go = (body: string) => transpiler.transpileGo(
        'class B {\n    safeString(a, b, c?): string | undefined { return a; }\n}\nclass E extends B {\n    take(s: string): string { return s; }\n    m(x: string | undefined) {\n' + body + '\n    }\n}').content;

    describe('go *string local passed to a string parameter', () => {
        test('a checker-narrowed local derefs at the call', () => {
            const out = go("const k = this.safeString({}, 'k'); if (k !== undefined) { this.take(k); }");
            expect(out).toContain('this.Take(*k)');
        });
        test('an unnarrowed local keeps the pointer', () => {
            const out = go("const k = this.safeString({}, 'k'); this.take(k);");
            expect(out).not.toContain('this.Take(*k)');
        });
    });
});

describe ('goDictReturningCalls', () => {
    const BASE =
        'type Dict = { [key: string]: any };\n' +
        'export class Exchange {\n' +
        '    safeDict (a, b, c?) { return undefined; }\n' +
        '    mergeBalanceAccount (result: Dict, code: string, account: Dict): Dict {\n' +
        '        result[code] = account;\n' +
        '        return result;\n' +
        '    }\n' +
        '}\n';

    const venue = (helperSignature: string) =>
        "import { Exchange } from './base/Exchange';\n" +
        'type Dict = { [key: string]: any };\n' +
        'export class ex extends Exchange {\n' +
        '    ' + helperSignature + ' {\n' +
        '        return entry;\n' +
        '    }\n' +
        '    run (base: Dict) {\n' +
        '        let result: Dict = {};\n' +
        "        result = this.mergeBalanceAccount (result, 'BTC', this.parseBalanceHelper (base));\n" +
        '        return result;\n' +
        '    }\n' +
        '}\n';

    const baseSignature = (name: string): string => {
        const dir = nodepath.join(__dirname, 'files', name, 'ts', 'src');
        nodefs.mkdirSync(nodepath.join(dir, 'base'), { recursive: true });
        nodefs.writeFileSync(nodepath.join(dir, 'base', 'Exchange.ts'), BASE);
        return dir;
    };

    const printBase = (name: string, helperSignature: string): string => {
        const dir = baseSignature(name);
        nodefs.writeFileSync(nodepath.join(dir, 'ex.ts'), venue(helperSignature));
        const t = new Transpiler({ verbose: false, go: {} });
        installCcxtGoDictParams(t.goTranspiler);
        return t.transpileGoByPath(nodepath.join(dir, 'base', 'Exchange.ts')).content;
    };

    describe('calls to same-tree methods declared : Dict', () => {
        afterAll(() => {
            nodefs.rmSync(nodepath.join(__dirname, 'files', 'tmp-calls-to-same-tree-methods-dict'), { recursive: true, force: true });
            nodefs.rmSync(nodepath.join(__dirname, 'files', 'tmp-calls-to-same-tree-methods-any'), { recursive: true, force: true });
        });

        test('a call to a method declared : Dict proves the tabled map parameters', () => {
            const out = printBase('tmp-calls-to-same-tree-methods-dict', 'parseBalanceHelper (entry: Dict): Dict');
            expect(out).toContain('MergeBalanceAccount(result map[string]any, code any, account any)');
        });

        test('a call to a method without a Dict return type keeps the box', () => {
            const out = printBase('tmp-calls-to-same-tree-methods-any', 'parseBalanceHelper (entry: Dict)');
            expect(out).toContain('MergeBalanceAccount(result map[string]any, code any, account any)');
        });
    });
});

describe ('goMapTypedIdentity', () => {
    // a MapTyped wrap around an operand that is already map[string]any by declaration is the identity,
    // so the printer does not emit it.
    const BASE = [
        'type Dict = { [key: string]: any };',
        'type Str = string | undefined;',
        'class BaseExchange {',
        '    parsePosition (position: Dict, market: any = undefined): Dict { return position; }',
        '    handleMarginModeAndParams (methodName: string, params: Dict = {}, defaultValue: Str = undefined): [Str, Dict] { return [ defaultValue, params ]; }',
        '}',
    ].join ('\n');
    const print = (body: string, install = true): string => {
        const x = new Transpiler ({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 } } });
        if (install) { installCcxtGoLocalTypes (x.goTranspiler); }
        const out = x.transpileGo (BASE + '\n' + body).content;
        return out.slice (out.indexOf ('func (this *Ex)'));
    };

    describe ('go MapTyped identity wraps are not printed', () => {
        test('a local from a callee that prints map[string]any is declared without the wrap', () => {
            const out = print ([
                'class Ex extends BaseExchange {',
                '    f (first: Dict, market: any) {',
                '        const position = this.parsePosition (first, market);',
                '        position[\'timestamp\'] = 1;',
                '        return position;',
                '    }',
                '}',
            ].join ('\n'));
            expect (out).toContain ('var position map[string]any = this.ParsePosition(first, market)');
            expect (out).not.toContain ('MapTyped(');
        });
        test('the params element of a joined pair returns as the map it is', () => {
            const out = print ([
                'class Ex extends BaseExchange {',
                '    handleMarginModeAndParams (methodName: string, params: Dict = {}, defaultValue: Str = undefined) {',
                '        const [ marginMode, paramsMarginMode ] = super.handleMarginModeAndParams (methodName, params, defaultValue);',
                '        if (marginMode === undefined) {',
                '            return [ \'cross\', paramsMarginMode ];',
                '        }',
                '        return [ marginMode, paramsMarginMode ];',
                '    }',
                '}',
            ].join ('\n'));
            expect (out).toContain ('return SafeStringPtr(marginMode), paramsMarginMode');
            expect (out).not.toContain ('MapTyped(');
        });
        test('a params element that is rebound keeps the wrap', () => {
            const out = print ([
                'class Ex extends BaseExchange {',
                '    handleMarginModeAndParams (methodName: string, params: Dict = {}, defaultValue: Str = undefined) {',
                '        let [ marginMode, paramsMarginMode ] = super.handleMarginModeAndParams (methodName, params, defaultValue);',
                '        paramsMarginMode = params;',
                '        return [ marginMode, paramsMarginMode ];',
                '    }',
                '}',
            ].join ('\n'));
            expect (out).not.toContain ('return SafeStringPtr(marginMode), paramsMarginMode');
        });
    });
});

describe ('goTypeKeyedMapLocals', () => {
    // type-keyed Go map-local rules (a Dict local seeded from safeDict is a map[string]any read with the
    // typed twin; an element read on a map[string]any receiver with a Go string key is the native index).
    const PRELUDE =
        'type Dict = { [key: string]: any };\n' +
        'type Str = string | undefined;\n' +
        'export class Exchange {\n' +
        '    options: Dict;\n' +
        '    fees: Dict;\n' +
        '    markets: Dict;\n' +
        '    safeDict (a: any, k: any, d: any = undefined): Dict { return a; }\n' +
        '    safeDict2 (a: any, k: any, k2: any, d: any = undefined): Dict { return a; }\n' +
        '    safeString (a: any, k: any, d: any = undefined): Str { return a; }\n' +
        '    safeValue (a: any, k: any, d: any = undefined): any { return a; }\n' +
        '    extend (a: any, b: any): Dict { return a; }\n';

    const run = (members: string, dir = 'ts/src'): string => {
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rf6a-'));
        try {
            const src = path.join(tmp, dir);
            fs.mkdirSync(src, { recursive: true });
            const file = path.join(src, 'x.ts');
            fs.writeFileSync(file, PRELUDE + members + '}\n');
            const t = new Transpiler({ verbose: false, go: { parser: { NUM_LINES_END_FILE: 0 } } });
            return t.transpileGoByPath(file).content;
        } finally {
            fs.rmSync(tmp, { recursive: true, force: true });
        }
    };

    describe('safeDict-seeded Dict locals', () => {
        test('a never-nil default types the local and reads through SafeDictMap', () => {
            const out = run(
                '    f (p: Dict): any {\n' +
                '        const d = this.safeDict (p, "data", {});\n' +
                '        d["a"] = 1;\n' +
                '        const x = this.safeString (d, "k");\n' +
                '        return this.extend (d, {});\n' +
                '    }\n');
            expect(out).toContain('var d map[string]any = this.SafeDictMap(p, "data", map[string]any{})');
        });
        test('safeDict2 and a nested never-nil default', () => {
            const out = run(
                '    f (p: Dict): any {\n' +
                '        const a = this.safeDict2 (p, "a", "b", {});\n' +
                '        const b = this.safeDict (p, "data", this.safeDict (p, 0, {}));\n' +
                '        return [ a, b ];\n' +
                '    }\n');
            expect(out).toContain('var a map[string]any = this.SafeDict2Map(p, "a", "b", map[string]any{})');
            expect(out).toContain('var b map[string]any = this.SafeDictMap(p, "data", this.SafeDict(p, 0, map[string]any{}))');
        });
        test('a rebinding to another never-nil safeDict keeps one map type', () => {
            const out = run(
                '    f (p: Dict, c: boolean): any {\n' +
                '        let d = this.safeDict (this.fees, "a", {});\n' +
                '        if (c) {\n' +
                '            d = this.safeDict (this.fees, "b", {});\n' +
                '        }\n' +
                '        return this.safeString (d, "k");\n' +
                '    }\n');
            expect(out).toContain('var d map[string]any = this.SafeDictMap(this.Fees, "a", map[string]any{})');
            expect(out).toContain('d = this.SafeDictMap(this.Fees, "b", map[string]any{})');
        });
        test('a rebinding to anything else, an assertion-like use, an address or a non-nil compare keep the box', () => {
            for (const body of [
                'd = this.extend (d, {});\n return 1;',
                'const q = d.foo; return q;',
                'if (d === p) { return 1; }\n return 2;',
                'const q = typeof d; return q;',
                'return Array.isArray (d);',
            ]) {
                const out = run('    f (p: Dict): any {\n        let d = this.safeDict (p, "data", {});\n ' + body + '\n    }\n');
                expect(out).not.toContain('SafeDictMap');
            }
        });
        test('a computed default or a non-Dict-field container keeps the box', () => {
            expect(run('    f (p: Dict): any {\n        const d = this.safeDict (p, "data", this.fees);\n        return d;\n    }\n')).not.toContain('SafeDictMap');
            expect(run('    f (p: Dict): any {\n        const d = this.safeDict (this.markets, "data", {});\n        return d;\n    }\n')).not.toContain('SafeDictMap');
        });
        test('no default: a nil test, a safe read and a guarded block type the local, a bare use does not', () => {
            const typed = run(
                '    f (p: Dict): any {\n' +
                '        const d = this.safeDict (p, "data");\n' +
                '        if (d !== undefined) {\n' +
                '            d["a"] = 1;\n' +
                '            return this.safeString (d, "k");\n' +
                '        }\n' +
                '        return undefined;\n' +
                '    }\n');
            expect(typed).toContain('var d map[string]any = this.SafeDictMap(p, "data")');
            const bare = run('    f (p: Dict): any {\n        const d = this.safeDict (p, "data");\n        return d;\n    }\n');
            expect(bare).not.toContain('SafeDictMap');
            const write = run('    f (p: Dict): any {\n        const d = this.safeDict (p, "data");\n        d["a"] = 1;\n        return 1;\n    }\n');
            expect(write).not.toContain('SafeDictMap');
        });
        test('ws sources type a Dict field of this and a decoded-message receiver, and a .length read keeps the map', () => {
            const body = '    f (message: Dict): any {\n        const o = this.safeDict (this.options, "ws", {});\n        const d = this.safeDict (message, "data", {});\n        return [ o, d["x"], d.length ];\n    }\n';
            const out = run(body, 'ts/src/pro');
            expect(out).toContain('var o map[string]any = this.SafeDictMap(this.Options, "ws", map[string]any{})');
            expect(out).toContain('var d map[string]any = this.SafeDictMap(message, "data", map[string]any{})');
            const member = run('    f (message: Dict): any {\n        const d = this.safeDict (message, "data", {});\n        return d.foo;\n    }\n', 'ts/src/pro');
            expect(member).not.toContain('SafeDictMap');
        });
        test('prediction and base sources keep the box', () => {
            const body = '    f (p: Dict): any {\n        const d = this.safeDict (p, "data", {});\n        return this.extend (d, {});\n    }\n';
            expect(run(body, 'ts/src/prediction')).not.toContain('SafeDictMap');
            expect(run(body, 'ts/src')).toContain('SafeDictMap');
        });
    });

    describe('element reads on map[string]any receivers', () => {
        test('a defaulted Dict parameter read with a literal key is the native index', () => {
            const out = run(
                '    f (symbol: string, config: Dict = {}): any {\n' +
                '        return config["noCoin"];\n' +
                '    }\n');
            expect(out).toContain('return config["noCoin"]');
            expect(out).not.toContain('GetValue(config');
        });
        test('a map local with only pointer-free writes reads natively with a string-typed key', () => {
            const out = run(
                '    f (response: Dict): any {\n' +
                '        const balances = {};\n' +
                '        const id = "a";\n' +
                '        balances[id] = 1;\n' +
                '        return balances[id];\n' +
                '    }\n');
            expect(out).toContain('return balances[id]');
        });
        test('a pointer-valued write, a rebinding or a delete keeps the helper', () => {
            const ptr = run('    f (p: Dict, m: Dict = {}): any {\n        m["a"] = this.safeString (p, "a");\n        return m["b"];\n    }\n');
            expect(ptr).toContain('GetValue(m, "b")');
            const rebind = run('    f (p: Dict, m: Dict = {}): any {\n        m = this.extend (p, {});\n        return m["b"];\n    }\n');
            expect(rebind).toContain('GetValue(m, "b")');
            const del = run('    f (p: Dict, m: Dict = {}): any {\n        delete m["a"];\n        return m["b"];\n    }\n');
            expect(del).toContain('GetValue(m, "b")');
            const plain = run('    f (p: Dict, m: Dict = {}): any {\n        m["a"] = 1;\n        return m["b"];\n    }\n');
            expect(plain).toContain('return m["b"]');
        });
        test('a compared element, an untyped key and a non-map receiver keep the helper', () => {
            const compared = run('    f (c: Dict = {}): any {\n        if (c["a"] === true) {\n            return 1;\n        }\n        return 2;\n    }\n');
            expect(compared).toContain('GetValue(c, "a")');
            const anyKey = run('    f (k: any, c: Dict = {}): any {\n        return c[k];\n    }\n');
            expect(anyKey).toContain('GetValue(c, k)');
            const list = run('    f (p: Dict): any {\n        const l = [ 1, 2 ];\n        return l[0];\n    }\n');
            expect(list).not.toContain('l["0"]');
        });
    });
});

describe ('goOwnedBaseTables', () => {
    // base-class tables owned by one goroutine print publisher/accessor calls, keyed on the checker-resolved
    // declaring class (no per-exchange name list in ccxt).
    const t = (install = true) => {
        const x = new Transpiler ({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 } } });
        if (install) { installRfGo5OwnedTables (x.goTranspiler); }
        return x;
    };
    const SRC = [
        'class BaseExchange {',
        '    baseCurrencies: any = undefined;',
        '    transactions: any = {};',
        '    other: any = undefined;',
        '    mapToSafeMap (d: any) { return d; }',
        '    createSafeDictionary () { return {}; }',
        '    m (x: any, src: BaseExchange, anyOther: any) {',
        '        this.baseCurrencies = this.mapToSafeMap (x);',
        '        this.transactions = this.createSafeDictionary ();',
        '        this.baseCurrencies = src.baseCurrencies;',
        '        this.baseCurrencies = anyOther.baseCurrencies;',
        '        this.other = src.other;',
        '        const y = this.baseCurrencies;',
        '        return y;',
        '    }',
        '}',
        '',
    ].join ('\n');

    describe('go owned base tables', () => {
        test('writes publish, reads use the accessor; other fields untouched', () => {
            const out = t ().transpileGo (SRC).content;
            expect (out).toContain ('this.PublishBaseCurrencies(x)');
            expect (out).toContain ('this.PublishTransactions(map[string]any{})');
            expect (out).toContain ('this.PublishBaseCurrencies(src.BaseCurrenciesTable())');
            expect (out).toContain ('this.PublishBaseCurrencies(anyOther.BaseCurrenciesTable())');
            expect (out).toContain ('var y any = this.BaseCurrenciesTable()');
            expect (out).toContain ('this.Other = src.Other');
        });
        test('fails without the hook (base printer keeps the field writes)', () => {
            const out = t (false).transpileGo (SRC).content;
            expect (out).not.toContain ('Publish');
            expect (out).toContain ('this.BaseCurrencies = this.MapToSafeMap(x)');
        });
        test('same field name on an unrelated class is untouched', () => {
            const src = 'class Other {\n    baseCurrencies: any;\n    m (x: any) {\n        this.baseCurrencies = x;\n    }\n}\n';
            const out = t ().transpileGo (src).content;
            expect (out).toContain ('this.BaseCurrencies = x');
            expect (out).not.toContain ('Publish');
        });
    });
});

describe ('goNativeStoreFields', () => {
    // element write on a hand-written BaseExchange map field (type table passed by the embedder)
    const TABLE = {
        'balance': {
            'type': 'map[string]any',
            'freshMapCalls': [ 'extend', 'createSafeDictionary' ],
            'selfCalls': [ 'safeBalance' ],
            'plainCalls': [ 'iso8601' ],
            'emptyDefaultCalls': [ 'safeDict', 'safeList' ],
            'userPathMethods': '^(?:setBalanceCache|cleanWsData)$',
        },
    };
    const HEAD = 'type Dict = { [key: string]: any };\n'
        + 'class Exchange {\n'
        + '    balance: Dict = {};\n'
        + '    iso8601 (x: any): string | undefined { return undefined; }\n'
        + '    safeString (d: any, k: any, def: any = undefined): string | undefined { return d; }\n'
        + '    safeCurrencyCode (c: any): string | undefined { return c; }\n'
        + '    safeDict (d: any, k: any, def: any = undefined): Dict | undefined { return d; }\n'
        + '    safeList (d: any, k: any, def: any = undefined): any[] | undefined { return d; }\n'
        + '    safeBalance (b: any): any { return b; }\n'
        + '    extend (a: any, b: any): Dict { return a; }\n'
        + '    spawn (f: any, ...a: any[]): void {}\n'
        + '    async fetchSomething (): Promise<any> { return {}; }\n'
        + '    reset (): void { this.balance = {}; this.balance = this.safeBalance (this.balance); }\n';
    const print = (body: string, table: any = TABLE, extra = ''): string => {
        const t = new Transpiler ({ 'verbose': false, 'go': { 'nativeStoreFields': table, 'parser': { 'NUM_LINES_END_FILE': 0 } } });
        return t.transpileGo (HEAD + extra + '    handle (message: Dict, timestamp: number) {\n' + body + '\n    }\n}\n').content;
    };

    describe('go native store on a tabled map field', () => {
        test('a literal key and a plain value store natively (fails on the base printer: no table)', () => {
            const withTable = print ("this.balance['info'] = { 'a': 1 }; this.balance['datetime'] = 'x';");
            expect (withTable).toContain ('this.Balance["datetime"] = "x"');
            expect (print ("this.balance['datetime'] = 'x';", {})).toContain ('AddElementToObject(this.Balance, "datetime", "x")');
        });
        test('a pointer value and an unproven any value keep the helper', () => {
            expect (print ("this.balance['datetime'] = this.safeString (message, 'd');")).toContain ('AddElementToObject(this.Balance, "datetime"');
            expect (print ("const ts = this.safeString (message, 'd'); this.balance['datetime'] = ts;")).toContain ('AddElementToObject(this.Balance, "datetime"');
        });
        test('an empty-default accessor call is a plain value', () => {
            expect (print ("this.balance['info'] = this.safeList (message, 'data', []);")).toContain ('this.Balance["info"] = this.SafeList(message, "data", []any{})');
            expect (print ("this.balance['info'] = this.safeList (message, 'data');")).toContain ('AddElementToObject(this.Balance, "info"');
        });
        test('a *string key writes [*k] behind its nil guard, born expanded when unguarded', () => {
            const guarded = print ("const code = this.safeString (message, 'c'); if (code !== undefined) { this.balance[code] = {}; }");
            expect (guarded).toContain ('this.Balance[*code] = map[string]any{}');
            expect (guarded).not.toContain ('if code != nil {\n\t\tif code != nil');
            const open = print ("const code = this.safeString (message, 'c'); this.balance[code] = {};");
            expect (open).toContain ('if code != nil {\n\t\tthis.Balance[*code] = map[string]any{}\n\t}');
        });
        test('a field written with a non-fresh value anywhere in the file keeps the helper', () => {
            const out = print ("this.balance['info'] = message;", TABLE, '    other (b: any) { this.balance = b; }\n');
            expect (out).toContain ('AddElementToObject(this.Balance, "info", message)');
        });
        test('user-path methods, spawners and async bodies store into the plain map too', () => {
            const user = print ('', TABLE, "    setBalanceCache (message: Dict) { this.balance['info'] = message; }\n");
            expect (user).toContain ('this.Balance["info"] = message');
            const spawner = print ('', TABLE, "    loader (message: Dict) { this.balance['info'] = message; this.spawn (this.fetchSomething); }\n");
            expect (spawner).toContain ('this.Balance["info"] = message');
            const asyncBody = print ('', TABLE, "    async loadIt (message: Dict) { this.balance['info'] = message; }\n");
            expect (asyncBody).toContain ('this.Balance["info"] = message');
        });
        test('an entry store writes through the entry map; a pointer value keeps the helper', () => {
            const entry = print ("const t = this.safeString (message, 't', 'spot'); this.balance[t]['info'] = message;");
            expect (entry).toMatch (/if entry, ok := this\.Balance\[\*?t\]\.\(map\[string\]any\); ok && \(entry != nil\) \{\n\t*entry\["info"\] = message/);
            expect (print ("this.balance['spot']['datetime'] = this.safeString (message, 'd');")).not.toContain ('entry["datetime"]');
        });
        test('delete of a literal key is the map delete', () => {
            expect (print ("delete this.balance['spot'];")).toContain ('delete(this.Balance, "spot")');
        });
        test('a whole GetValue value stores natively; a guarded *string key reads the plain index', () => {
            const stored = print ("const k = 'a'; this.balance[k] = message[k];");
            expect (stored).toContain ('this.Balance[k] = ');
            expect (stored).not.toContain ('AddElementToObject(this.Balance');
            const read = print ("const t = this.safeString (message, 't'); if (t === undefined) { return; } const b = this.balance[t];");
            expect (read).toContain ('this.Balance[*t]');
            expect (read).not.toContain ('func() any');
        });
        test('a spawn/delay site counts as a call of the referenced method, with the arguments after it', () => {
            const t: any = new Transpiler ({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 } } });
            const go: any = t.goTranspiler;
            let seen: any[] = [];
            const original = go.goSameFileCallsOf;
            go.goSameFileCallsOf = function (fn, name) {
                const calls = original.call (this, fn, name);
                if (name === 'loadIt') { seen = calls.map ((c) => c.arguments.map ((a) => a.getText ())); }
                return calls;
            };
            const hook = go.goNativeParameterTypeOf;
            go.goNativeParameterTypeOf = function (param) {
                if (param.parent?.name?.text === 'loadIt') { this.goSameFileCallsOf (param.parent, 'loadIt'); }
                return hook.call (this, param);
            };
            t.transpileGo ('class Exchange {\n    spawn (f: any, ...a: any[]): void {}\n    delay (ms: any, f: any, ...a: any[]): void {}\n'
                + '    go1 () { this.spawn (this.loadIt, \'spot\'); this.delay (5, this.loadIt, \'swap\'); }\n'
                + '    async loadIt (type: string) { return type; }\n}\n');
            expect (seen).toEqual ([ [ "'spot'" ], [ "'swap'" ] ]);
        });
        test('delete of a client url from the registry is the map delete', () => {
            const t = new Transpiler ({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 } } });
            const out = t.transpileGo ('class Client { url: string; }\nclass Exchange {\n    clients: any = {};\n'
                + '    client (u: string): Client { return new Client (); }\n'
                + '    drop (u: string) { const client = this.client (u); delete this.clients[client.url]; }\n'
                + '    dropAny (u: any) { delete this.clients[u]; }\n}\n').content;
            expect (out).toContain ('delete(this.Clients, client.Url)');
            expect (out).toContain ('Remove(this.Clients, u)');
        });
        test('an untabled field and an entry store keep the helper', () => {
            const other = print ("this.balance['info'] = message;", { 'positions': TABLE['balance'] });
            expect (other).toContain ('AddElementToObject(this.Balance, "info", message)');
            const entry = print ("this.balance['spot']['info'] = message;");
            expect (entry).not.toContain ('this.Balance["spot"]["info"] =');
        });
    });
});

describe ('goProvenListReads', () => {
    // Go native reads on proven list receivers
    const SRC = 'type Trade = { id: string };\n'
        + 'class Exchange {\n'
        + '    parseTrades (trades: any[], market: any = undefined): Trade[] { return []; }\n'
        + '    parseThing (x: any): any { return x; }\n'
        + '    safeList (o: any, k: any, d: any = undefined): any[] { return d; }\n'
        + '    f (p: any): any {\n'
        + '        const trades = this.parseTrades (p);\n'
        + '        const n = trades.length;\n'
        + '        const thing = this.parseThing (p);\n'
        + '        const m = thing.length;\n'
        + '        return n + m;\n'
        + '    }\n'
        + '    g (p: any): any {\n'
        + '        const keys: string[] = Object.keys (p);\n'
        + '        let out = \'\';\n'
        + '        for (let i = 0; i < keys.length; i++) {\n'
        + '            out = keys[i];\n'
        + '        }\n'
        + '        return out;\n'
        + '    }\n'
        + '    h (p: any): any {\n'
        + '        const keys: string[] = Object.keys (p);\n'
        + '        let out = \'\';\n'
        + '        for (let i = 0; i < keys.length; i++) {\n'
        + '            i = i + 1;\n'
        + '            out = keys[i];\n'
        + '        }\n'
        + '        for (let j = 0; j < keys.length; j++) {\n'
        + '            keys.push (\'x\');\n'
        + '            out = keys[j];\n'
        + '        }\n'
        + '        for (let k = 0; k < 10; k++) {\n'
        + '            out = keys[k];\n'
        + '        }\n'
        + '        return out;\n'
        + '    }\n'
        + '    k (p: any): any {\n'
        + '        const syms = Object.keys (p) as string[];\n'
        + '        const n = syms.length;\n'
        + '        let out = \'\';\n'
        + '        for (let i = 0; i < n; i++) {\n'
        + '            out = syms[i];\n'
        + '        }\n'
        + '        return out;\n'
        + '    }\n'
        + '    m (p: any): any {\n'
        + '        let symbols: string[] = undefined;\n'
        + '        if (p !== undefined) {\n'
        + '            symbols = [ p ];\n'
        + '        }\n'
        + '        return this.parseThing (symbols);\n'
        + '    }\n'
        + '    n (p: any): any {\n'
        + '        let symbols: string[] = undefined;\n'
        + '        if (p !== undefined) {\n'
        + '            symbols = [ p ];\n'
        + '        }\n'
        + '        if (symbols === undefined) {\n'
        + '            return 0;\n'
        + '        }\n'
        + '        return this.parseThing (symbols);\n'
        + '    }\n'
        + '    q (p: any): any {\n'
        + '        let a: any[] = undefined;\n'
        + '        a = [ p ];\n'
        + '        if (a === undefined) {\n'
        + '            return 0;\n'
        + '        }\n'
        + '        const b = a;\n'
        + '        return b.length;\n'
        + '    }\n'
        + '    r1 (p: any): any {\n'
        + '        const trades = this.parseTrades (p);\n'
        + '        let out: any = undefined;\n'
        + '        for (let i = 0; i < trades.length; i++) {\n'
        + '            const trade = trades[i];\n'
        + '            out = trade;\n'
        + '        }\n'
        + '        return out;\n'
        + '    }\n'
        + '    r2 (p: any): any {\n'
        + '        const rows = this.safeList (p, \'rows\', []);\n'
        + '        let out: any = undefined;\n'
        + '        for (let i = 0; i < rows.length; i++) {\n'
        + '            out = rows[i];\n'
        + '        }\n'
        + '        return out;\n'
        + '    }\n'
        + '    r3 (p: any): any {\n'
        + '        const trades = this.parseTrades (p);\n'
        + '        let out: any = undefined;\n'
        + '        for (let i = 0; i < trades.length; i++) {\n'
        + '            trades.push (p);\n'
        + '            out = trades[i];\n'
        + '        }\n'
        + '        return out;\n'
        + '    }\n'
        + '}\n';

    const print = (callees: string[]): string => new Transpiler ({ 'verbose': false, 'go': { 'generatedListCallees': callees, 'parser': { 'NUM_LINES_END_FILE': 0 } } }).transpileGo (SRC).content;
    const fn = (out: string, name: string): string => out.split (/\nfunc /).find ((f) => f.indexOf (name + '(') >= 0) ?? '';

    describe('go list reads', () => {
        test('a tabled callee whose TS result is an array types its local []any and .length goes native (fails on the base printer)', () => {
            const withTable = fn (print ([ 'ParseTrades' ]), 'F');
            expect (withTable).toContain ('var trades []any = this.ParseTrades(');
            expect (withTable).toContain ('len(trades)');
            const base = fn (print ([]), 'F');
            expect (base).not.toContain ('var trades []any');
        });
        test('a tabled callee whose TS result is not an array type stays boxed', () => {
            const out = fn (print ([ 'ParseThing' ]), 'F');
            expect (out).not.toContain ('var thing []any');
        });
        test('a loop-bounded read of a []string local is the slice index (fails on the base printer)', () => {
            expect (fn (print ([]), 'G')).toContain ('out = keys[i]');
        });
        test('negatives: counter written, receiver mutated, unbounded counter keep the helper', () => {
            const h = fn (print ([]), 'H');
            expect (h).toContain ('GetValue(keys, i)');
            expect (h).toContain ('GetValue(keys, j)');
            expect (h).toContain ('GetValue(keys, k)');
            expect (h).not.toContain ('keys[i]');
        });
        test('a const length local and an `as string[]` cast keep the proof', () => {
            expect (fn (print ([]), 'K')).toContain ('out = syms[i]');
        });
        test('a nil-initialised local whose every write is a list prints []any; a nil compare keeps the box', () => {
            expect (fn (print ([]), 'M')).toContain ('var symbols []any = nil');
            expect (fn (print ([]), 'N')).not.toContain ('var symbols []any');
        });
        test('a loop-bounded read of an object-element []any local is the slice index, no guard closure, no DerefScalar', () => {
            const r1 = fn (print ([ 'ParseTrades' ]), 'R1');
            expect (r1).toContain ('var trade any = trades[i]');
            expect (r1).not.toContain ('DerefScalar');
            expect (r1).not.toContain ('func() any');
        });
        test('an object-element read keeps the guard when the element type is not provably an object, or the list is mutated', () => {
            // a safeList of a parameter is a decoded-JSON list, so its bounded read is the bare index
            const r2 = fn (print ([ 'SafeList' ]), 'R2');
            expect (r2).toContain ('out = rows[i]');
            const r3 = fn (print ([ 'ParseTrades' ]), 'R3');
            expect (r3).toContain ('return DerefScalar(trades[i])');
        });
        test('an alias of a nil-join list local carries its slice type', () => {
            const t: any = new Transpiler ({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 } } });
            installCcxtGoLocalTypes (t.goTranspiler);
            const q = fn (t.transpileGo (SRC).content, 'Q');
            expect (q).toContain ('var a []any = nil');
            expect (q).toContain ('var b []any = a');
        });
    });
});

describe ('goOrderBookSideReads', () => {
    // an order-book side read `book['asks']` prints as the port's accessor when the checker type of the
    // receiver is the book class and the Go local is retyped at its declaration (no nil can reach the read).

    const BOOK = {
        'classes': [ 'OrderBook' ],
        'constructors': [ 'orderBook' ],
        'cacheReaders': [ 'safeValue' ],
        'type': 'OrderBookInterface',
        'sideType': 'IOrderBookSide',
        'unbox': 'OrderBookTyped',
        'sides': { 'asks': 'GetAsks', 'bids': 'GetBids' },
    };

    const HEAD = 'type Dict = { [key: string]: any };\n'
        + 'class Side { store (p: number, a: number) { return p + a; } }\n'
        + 'class OrderBook { asks: Side; bids: Side; reset (x: Dict) { return x; } }\n'
        + 'class Exchange {\n'
        + '    orderbooks: { [key: string]: OrderBook } = {};\n'
        + '    orderBook (snapshot = {}): OrderBook { return new OrderBook (); }\n'
        + '    safeValue (o: any, k: string): any { return o[k]; }\n'
        + '    handleDeltas (side: any, deltas: any) { return side; }\n';

    const print = (body: string, book: any = BOOK): string => {
        const dir = fs.mkdtempSync (path.join (os.tmpdir (), 'rfgo6d-'));
        try {
            fs.mkdirSync (path.join (dir, 'ts', 'src', 'pro'), { 'recursive': true });
            const file = path.join (dir, 'ts', 'src', 'pro', 'x.ts');
            fs.writeFileSync (file, HEAD + body + '}\n');
            const config: any = { 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 } } };
            if (book !== null) {
                config.go.orderBook = book;
            }
            return new Transpiler (config).transpileGoByPath (file).content;
        } finally {
            fs.rmSync (dir, { 'recursive': true, 'force': true });
        }
    };

    const GUARDED = '    handle (symbol: string) {\n'
        + '        if (!(symbol in this.orderbooks)) {\n'
        + '            this.orderbooks[symbol] = this.orderBook ();\n'
        + '        }\n'
        + '        const orderbook = this.orderbooks[symbol];\n'
        + '        this.handleDeltas (orderbook[\'asks\'], []);\n'
        + '        this.handleDeltas (orderbook[\'bids\'], []);\n'
        + '    }\n';

    describe('go order book side reads', () => {
        test('a cache read behind its create-if-absent guard is typed and its sides print the accessors (fails on the base printer)', () => {
            const out = print (GUARDED);
            expect (out).toContain ('var orderbook OrderBookInterface = ');
            expect (out).toContain ('orderbook.GetAsks()');
            expect (out).toContain ('orderbook.GetBids()');
            expect (out).not.toContain ('GetValue(orderbook, "asks")');
            const base = print (GUARDED, null);
            expect (base).toContain ('GetValue(orderbook, "asks")');
            expect (base).not.toContain ('GetAsks()');
        });
        test('the proven entry unboxes with Go\'s own assertion, the nil-tolerant unboxer is kept when a repair guard follows', () => {
            expect (print (GUARDED)).toContain ('.(OrderBookInterface)');
            const repaired = print ('    handle (symbol: string) {\n'
                + '        let orderbook = this.safeValue (this.orderbooks, symbol);\n'
                + '        if (orderbook === undefined) {\n'
                + '            orderbook = this.orderBook ();\n'
                + '        }\n'
                + '        this.handleDeltas (orderbook[\'asks\'], []);\n'
                + '        this.orderbooks[symbol] = orderbook;\n'
                + '    }\n');
            expect (repaired).toContain ('OrderBookTyped(');
            expect (repaired).toContain ('orderbook.GetAsks()');
        });
        test('an early exit on `safeValue (cache, key) === undefined` proves the entry (fails on the base printer)', () => {
            const body = '    handle (keys: string[]) {\n'
                + '        for (let i = 0; i < keys.length; i++) {\n'
                + '            const symbol = keys[i];\n'
                + '            if (this.safeValue (this.orderbooks, symbol) === undefined) {\n                continue;\n            }\n'
                + '            const orderbook = this.orderbooks[symbol];\n'
                + '            this.handleDeltas (orderbook[\'asks\'], []);\n'
                + '        }\n    }\n';
            expect (print (body)).toContain ('orderbook.GetAsks()');
            expect (print (body, null)).not.toContain ('GetAsks()');
        });
        test('a constructor local needs no guard', () => {
            const out = print ('    handle () {\n        const orderbook = this.orderBook ();\n        this.handleDeltas (orderbook[\'asks\'], []);\n    }\n');
            expect (out).toContain ('orderbook.GetAsks()');
        });
        test('negative: an unguarded cache read can be nil, so the box and the helper stay', () => {
            const out = print ('    handle (symbol: string) {\n        const orderbook = this.orderbooks[symbol];\n        this.handleDeltas (orderbook[\'asks\'], []);\n    }\n');
            expect (out).not.toContain ('GetAsks()');
            expect (out).toContain ('GetValue(orderbook, "asks")');
        });
        test('negative: a local also written with a foreign value keeps the box', () => {
            const out = print ('    handle (symbol: string, other: any) {\n'
                + '        if (!(symbol in this.orderbooks)) {\n            this.orderbooks[symbol] = this.orderBook ();\n        }\n'
                + '        let orderbook = this.orderbooks[symbol];\n'
                + '        orderbook = other;\n'
                + '        this.handleDeltas (orderbook[\'asks\'], []);\n    }\n');
            expect (out).not.toContain ('GetAsks()');
        });
        test('negative: a key that is not a side stays a helper read', () => {
            const out = print ('    handle () {\n        const orderbook = this.orderBook ();\n        this.handleDeltas (orderbook[\'nonce\'], []);\n    }\n');
            expect (out).toContain ('GetValue(orderbook, "nonce")');
            expect (out).not.toContain ('GetAsks()');
            expect (out).not.toContain ('GetBids()');
        });
        test('a book handed to a handler parameter retypes it when every call site passes a typed book', () => {
            const out = print ('    handleBook (client: any, message: Dict, orderbook: OrderBook) {\n        this.handleDeltas (orderbook[\'asks\'], []);\n    }\n'
                + '    handleOther (client: any, symbol: string) {\n'
                + '        const book = this.orderBook ();\n'
                + '        this.handleBook (client, {}, book);\n'
                + '    }\n');
            expect (out).toContain ('orderbook OrderBookInterface');
            expect (out).toContain ('orderbook.GetAsks()');
        });
        test('negative: a book parameter with an unproven call site keeps the box', () => {
            const out = print ('    handleBook (client: any, message: Dict, orderbook: OrderBook) {\n        this.handleDeltas (orderbook[\'asks\'], []);\n    }\n'
                + '    handleOther (client: any, other: any) {\n'
                + '        this.handleBook (client, {}, other);\n'
                + '    }\n');
            expect (out).not.toContain ('GetAsks()');
        });
        test('a side read bound to a local types the local as the side interface', () => {
            const out = print ('    handle () {\n        const orderbook = this.orderBook ();\n        const asks = orderbook[\'asks\'];\n        this.handleDeltas (asks, []);\n    }\n');
            expect (out).toContain ('var asks IOrderBookSide = orderbook.GetAsks()');
        });
        test('without the config nothing changes', () => {
            expect (print (GUARDED, null)).not.toContain ('OrderBookInterface');
        });
    });
});

describe ('goInt64TupleSlot', () => {
    // a destructured tuple slot whose producer's Go slot type is *int64 is a native *int64 local.

    const SRC = `
    type Dict = { [key: string]: any };
    class Exchange {
        json (o: any): string { return ''; }
        hmac (o: any): string { return ''; }
        omit (a: any, b: any): any { return a; }
        handleOptionIntegerAndParams (params: Dict, m: string, o: string, d?: number): [ number, Dict ] { return [ 1, params ]; }
        sign (method = 'GET', params = {}) {
            let requestBody: string = undefined;
            let other: string = undefined;
            if (method === 'POST') {
                requestBody = this.json (params);
                other = this.hmac (params);
            }
            const bodyJson = (method === 'POST') ? this.json (params) : undefined;
            return { 'body': requestBody, 'b2': bodyJson, 'o': other };
        }
        async fetchX (symbol: string, params = {}) {
            const [ until, paramsUntil ] = this.handleOptionIntegerAndParams (params, 'fetchX', 'until');
            const request = {};
            if (until !== undefined) {
                request['t'] = until;
                request['u'] = this.parseToInt (until / 1000);
            }
            return request;
        }
        async fetchY (symbol: string, params = {}) {
            const [ until, paramsUntil ] = this.handleOptionIntegerAndParams (params, 'fetchY', 'until');
            const request = { 'u': until };
            return request;
        }
        async fetchZ (symbol: string, params = {}) {
            const [ until, paramsUntil ] = this.handleOptionIntegerAndParams (params, 'fetchZ', 'until', 5);
            if (until !== undefined) {
                return 1;
            }
            return 2;
        }
        async fetchG (symbol: string, params = {}) {
            const [ until, paramsUntil ] = this.handleOptionIntegerAndParams (params, 'fetchG', 'until');
            if (until === undefined) {
                throw new Error ('until is required');
            }
            const request = {};
            request['endTime'] = until;
            return request;
        }
        async fetchL (method: string, params = {}) {
            const [ calls, paramsCalls ] = this.handleOptionIntegerAndParams (params, method, 'paginationCalls');
            let n = 0;
            for (let i = 0; i < calls; i++) {
                n = n + 1;
            }
            return n;
        }
        parseToInt (a: any): number { return 1; }
    }
    `;

    const TABLES = {
        'goTupleSlotTypes': { 'HandleOptionIntegerAndParams': [ '*int64' ] },
        'goTupleValueDefaultArg': { 'HandleOptionIntegerAndParams': 3 },
    };

    const print = (tables: any): string => {
        const t = new Transpiler ({ 'verbose': false, 'go': Object.assign ({ 'parser': { 'NUM_LINES_END_FILE': 0 } }, tables) });
        installCcxtGoHooks (t.goTranspiler);
        return t.transpileGo (SRC).content;
    };

    describe('*int64 tuple slot', () => {
        test('a *int64 tuple slot read by nil tests and guarded reads is a native *int64 local (fails on the base printer)', () => {
            const base = print ({});
            const out = print (TABLES);
            expect (base).toContain ('until := GetValue(untilparamsUntilVariable, 0)');
            expect (out).toContain ('var until *int64 = nil\n\tif p, ok := untilparamsUntilVariable[0].(*int64); ok {\n\t\tuntil = p\n\t}');
            expect (out).toContain ('if until != nil {');
            expect (out).toContain ('request[\"t\"] = *until');
            expect (out).toContain ('float64(*until) / 1000');
        });
        test('an unguarded read of the slot keeps the boxed local', () => {
            const out = print (TABLES);
            const fetchY = out.split ('func (this *Exchange) fetchYBody')[1].split ('\nfunc ')[0];
            expect (fetchY).toContain ('until := GetValue(untilparamsUntilVariable, 0)');
            expect (fetchY).not.toContain ('var until *int64');
        });
        test('an integer-literal default selects the value form and is not a pointer slot', () => {
            const out = print (TABLES);
            const fetchZ = out.split ('func (this *Exchange) fetchZBody')[1].split ('\nfunc ')[0];
            expect (fetchZ).not.toContain ('var until *int64');
        });
        test('a slot behind an exiting nil guard is stored by value, never as the pointer', () => {
            const out = print (TABLES);
            const fetchG = out.split ('func (this *Exchange) fetchGBody')[1].split ('\nfunc ')[0];
            expect (fetchG).toContain ('var until *int64 = nil');
            expect (fetchG).toContain ('request[\"endTime\"] = *until');
        });
        test('a slot used as the bound of an ordered comparison is a native *int64 local', () => {
            const out = print (TABLES);
            const fetchL = out.split ('func (this *Exchange) fetchLBody')[1].split ('\nfunc ')[0];
            expect (fetchL).toContain ('var calls *int64 = nil');
            expect (fetchL).toContain ('calls != nil && int64(i) < *calls');
        });
        test('no tables, no change', () => {
            const out = print ({});
            expect (out).not.toContain ('var until *int64');
        });
    });
});

describe ('goUrlsViews', () => {
    // urls views. The TS base declares `urls: { api: Dict; ... }`, and
    // go/v4/exchange.go keeps `urls` a map[string]any plus two views re-derived by RefreshUrlsViews after every write:
    // UrlsApi (urls["api"]) and UrlsApiSections (its dictionary entries). A read keyed on that declared type prints as
    // the view's own map index; a write of urls is followed by the refresh.
    let transpiler: Transpiler;
    beforeAll(() => {
        transpiler = new Transpiler({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 } } });
    });
    const go = (ts: string, hooked = true): string => {
        if (hooked) { installCcxtGoHooks(transpiler.goTranspiler); }
        return transpiler.transpileGo(ts).content;
    };

    const BASE = 'type Dict = { [key: string]: any };\n'
        + 'class Base {\n'
        + '    urls!: { logo?: string; api: Dict; test: Dict; [key: string]: any };\n'
        + '    safeString (d: any, k: any, def?: string): string | undefined { return undefined; }\n'
        + '    clone (x: any): any { return x; }\n'
        + '}\n';
    const run = (stmts: string, params = ''): string => go(BASE + 'class Test extends Base {\n    f (' + params + '): any { ' + stmts + ' }\n}\n');

    describe('go urls views', () => {
        test('a literal key on urls["api"] reads UrlsApi', () => {
            const out = run("return this.safeString (this.urls['api']['ws'], 'spot');");
            expect(out).toContain('this.SafeString(this.UrlsApi["ws"], "spot")');
            expect(out).not.toContain('GetValue(');
        });
        test('the second level reads UrlsApiSections', () => {
            const out = run("return this.urls['api']['ws']['public'];");
            expect(out).toContain('return this.UrlsApiSections["ws"]["public"]');
        });
        test('deeper levels keep the helper for the steps below the second', () => {
            const out = run("return this.urls['api']['ws']['ws-api']['spot'];");
            expect(out).toContain('GetValue(this.UrlsApiSections["ws"]["ws-api"], "spot")');
        });
        test('a string-typed key is a valid index, an any key keeps the helper', () => {
            expect(run("const section: string = 'ws'; return this.urls['api'][section];")).toContain('this.UrlsApi[section]');
            const boxed = run("return this.urls['api'][section];", 'section: any');
            expect(boxed).toContain('GetValue(this.Urls["api"], section)');
            expect(boxed).not.toContain('UrlsApi[');
        });
        test('an `as Dict` assertion prints as its operand; a bare parenthesis keeps the helper', () => {
            expect(run("return (this.urls['api'] as Dict)['ws']['privateV2'];")).toContain('this.UrlsApiSections["ws"]["privateV2"]');
            const bare = run("return (this.urls['api'])['ws']['public'];");
            expect(bare).not.toContain('UrlsApi');
        });
        test('a non-literal top key is not a view', () => {
            const out = run("const urlKey: string = 'api'; return this.urls[urlKey]['ws'];");
            expect(out).not.toContain('UrlsApi');
        });
        test('an entry the base does not declare a Dict keeps the helper', () => {
            const out = run("return this.urls['test']['ws'];");
            expect(out).not.toContain('UrlsApi');
        });
        test('other fields are untouched', () => {
            const out = run("return this.options['ws'];");
            expect(out).not.toContain('UrlsApi');
        });
        test('every write of urls or one of its entries refreshes the views, once', () => {
            const out = run("this.urls['api'] = this.urls['test']; this.urls = u; const n = 1; return n;", 'u: any');
            expect(out).toContain('this.Urls["api"] = this.Urls["test"]\n\tthis.RefreshUrlsViews()');
            expect(out).toContain('this.Urls = u\n\tthis.RefreshUrlsViews()');
            expect(out.split('RefreshUrlsViews').length - 1).toBe(2);
        });
        test('a comparison and a write of another field are not urls writes', () => {
            const out = run("if (this.urls['api'] === u) { this.options['x'] = 1; } return 1;", 'u: any');
            expect(out).not.toContain('RefreshUrlsViews');
        });
    });
});

describe ('goPredictionAwaitedListReads', () => {
    const fs = fs__rfmG4G21;
    const os = os__rfmG4G21;
    const path = path__rfmG4G21;
    // a prediction-tier `list[i]` inside
    // `for (let i = 0; i < list.length; i++)` where `list` is `const list = await this.fetchX (..)`
    // (the printer declares it `[]any` from the receive) and the awaited TS type is an array of
    // objects prints the bare element, not GetValue(list, i). Anything the AST does not prove keeps GetValue.

    const PRELUDE =
        'type Dict = { [key: string]: any };\n' +
        'interface Row { id: string }\n' +
        'class Exchange {\n' +
        '    parseRow (row: any): any { return row; }\n' +
        '    async fetchOrders (outcome: string = undefined, params: Dict = {}): Promise<Row[]> { return []; }\n' +
        '    async fetchMyTrades (): Promise<string[]> { return []; }\n' +
        '    async fetchRawEventsList (params: Dict = {}): Promise<Dict[]> { return []; }\n' +
        '}\n';

    const tmp = fs.mkdtempSync (path.join (os.tmpdir (), 'gopredictionawaitedlistreads-'));

    function go (body: string, tier = 'prediction'): string {
        const dir = path.join (tmp, 'ts', 'src', tier);
        fs.mkdirSync (dir, { 'recursive': true });
        const file = path.join (dir, 'venue.ts');
        fs.writeFileSync (file, PRELUDE + 'class venue extends Exchange {\n    async run (response: Dict) {\n' + body + '\n    }\n}\n');
        const transpiler: any = new Transpiler ({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 }, 'asyncMethodSuffix': 'Async' } });
        installCcxtGoLocalTypes (transpiler.goTranspiler);
        return transpiler.transpileGoByPath (file).content;
    }

    const READ = 'GetValue(rows, i)';

    describe('go bounded reads of awaited object lists in the prediction tier', () => {
        afterAll(() => {
            fs.rmSync (tmp, { 'recursive': true, 'force': true });
        });

        test('an awaited array of objects read under `i < rows.length` is the bare element', () => {
            const out = go (
                '        const rows = await this.fetchOrders ();\n' +
                '        for (let i = 0; i < rows.length; i++) {\n' +
                '            const row = rows[i];\n' +
                '            this.parseRow (row);\n' +
                '        }');
            expect (out).toContain ('var rows []any = ListTyped(');
            expect (out).toContain ('var row any = rows[i]');
            expect (out).not.toContain (READ);
        });

        test('a Dict[] receive qualifies the same way', () => {
            const out = go (
                '        const rows = await this.fetchRawEventsList ({});\n' +
                '        for (let i = 0; i < rows.length; i++) {\n' +
                '            const row = rows[i];\n' +
                '            this.parseRow (row);\n' +
                '        }');
            expect (out).toContain ('var row any = rows[i]');
            expect (out).not.toContain (READ);
        });

        test('a loop not bounded by the list keeps GetValue', () => {
            const out = go (
                '        const rows = await this.fetchOrders ();\n' +
                '        for (let i = 0; i < 3; i++) {\n' +
                '            const row = rows[i];\n' +
                '            this.parseRow (row);\n' +
                '        }');
            expect (out).toContain (READ);
        });

        test('a rebound list keeps GetValue', () => {
            const out = go (
                '        let rows = await this.fetchOrders ();\n' +
                '        for (let i = 0; i < rows.length; i++) {\n' +
                '            rows = [];\n' +
                '            const row = rows[i];\n' +
                '            this.parseRow (row);\n' +
                '        }');
            expect (out).not.toContain ('var row any = rows[i]');
        });

        test('an awaited list of scalars keeps GetValue', () => {
            const out = go (
                '        const rows = await this.fetchMyTrades ();\n' +
                '        for (let i = 0; i < rows.length; i++) {\n' +
                '            const row = rows[i];\n' +
                '            this.parseRow (row);\n' +
                '        }');
            expect (out).toContain ('var rows []any = ListTyped(');
            expect (out).toContain (READ);
        });

        test('outside the prediction tier only the loop-bounded rule reads natively', () => {
            const bounded = go (
                '        const rows = await this.fetchOrders ();\n' +
                '        for (let i = 0; i < rows.length; i++) {\n' +
                '            const row = rows[i];\n' +
                '            this.parseRow (row);\n' +
                '        }', 'pro');
            expect (bounded).toContain ('var row any = rows[i]');
            const unbounded = go (
                '        const rows = await this.fetchOrders ();\n' +
                '        const row = rows[1];\n' +
                '        this.parseRow (row);', 'pro');
            expect (unbounded).not.toContain ('var row any = rows[1]');
        });
    });
});

describe ('goPredictionBoundedListReads', () => {
    const fs = fs__rfmG4GB08;
    const os = os__rfmG4GB08;
    const path = path__rfmG4GB08;
    // a prediction-tier `list[i]` inside `for (let i = 0; i < list.length; i++)` can never
    // leave the slice, so the guard closure (`func() any { if i >= 0 && i < len(list) { return
    // DerefScalar(list[i]) } return nil }()`) prints as the element itself, or as DerefScalar(list[i])
    // when the elements are not provably dictionaries. Anything the AST does not prove keeps the guard.

    const PRELUDE =
        'type Dict = { [key: string]: any };\n' +
        'class Exchange {\n' +
        '    safeList (d: any, k: string, def: any = undefined): any[] { return d[k] ?? def; }\n' +
        '    parseRow (row: any): any { return row; }\n' +
        '    rebuild (): any[] { return []; }\n' +
        '}\n';

    const tmp = fs.mkdtempSync (path.join (os.tmpdir (), 'gopredictionboundedlistreads-'));

    function go (body: string, tier = 'prediction'): string {
        const dir = path.join (tmp, 'ts', 'src', tier);
        fs.mkdirSync (dir, { 'recursive': true });
        const file = path.join (dir, 'venue.ts');
        fs.writeFileSync (file, PRELUDE + 'class venue extends Exchange {\n    run (response: Dict) {\n' + body + '\n    }\n}\n');
        return new Transpiler ({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 } } }).transpileGoByPath (file).content;
    }

    const GUARD = 'func() any {';

    describe('go bounded list reads in the prediction tier', () => {
        afterAll(() => {
            fs.rmSync (tmp, { 'recursive': true, 'force': true });
        });

        test('a read under `i < list.length` on a SafeList unbox is the bare element', () => {
            const out = go (
                "        const rows = this.safeList (response, 'rows', []);\n" +
                '        for (let i = 0; i < rows.length; i++) {\n' +
                '            const row = rows[i];\n' +
                '            this.parseRow (row);\n' +
                '        }');
            expect (out).toContain ('var row any = rows[i]');
            expect (out).not.toContain (GUARD);
            expect (out).not.toContain ('DerefScalar(rows[i])');
        });

        test('a hoisted `const n = list.length` bound proves the read too', () => {
            const out = go (
                "        const rows = this.safeList (response, 'rows', []);\n" +
                '        const rowsLength = rows.length;\n' +
                '        for (let i = 0; i < rowsLength; i++) {\n' +
                '            const row = rows[i];\n' +
                '            this.parseRow (row);\n' +
                '        }');
            expect (out).toContain ('var row any = rows[i]');
            expect (out).not.toContain (GUARD);
        });

        test('elements that are not provably dictionaries keep the DerefScalar but lose the guard', () => {
            const out = go (
                '        const rows: any[] = [];\n' +
                "        rows.push (this.parseRow (response['x']));\n" +
                "        rows.push ('plain');\n" +
                '        for (let i = 0; i < rows.length; i++) {\n' +
                '            const row = rows[i];\n' +
                '            this.parseRow (row);\n' +
                '        }');
            expect (out).toContain ('DerefScalar(rows[i])');
            expect (out).not.toContain (GUARD);
        });

        test('a loop not bounded by the list keeps the guard', () => {
            const out = go (
                "        const rows = this.safeList (response, 'rows', []);\n" +
                '        for (let i = 0; i < 3; i++) {\n' +
                '            const row = rows[i];\n' +
                '            this.parseRow (row);\n' +
                '        }');
            expect (out).toContain (GUARD);
        });

        test('a counter that moves in the body keeps the guard', () => {
            const out = go (
                "        const rows = this.safeList (response, 'rows', []);\n" +
                '        for (let i = 0; i < rows.length; i++) {\n' +
                '            i += 2;\n' +
                '            const row = rows[i];\n' +
                '            this.parseRow (row);\n' +
                '        }');
            expect (out).toContain (GUARD);
        });

        test('a rebound list keeps the guard', () => {
            const out = go (
                "        let rows = this.safeList (response, 'rows', []);\n" +
                '        for (let i = 0; i < rows.length; i++) {\n' +
                '            rows = this.rebuild ();\n' +
                '            const row = rows[i];\n' +
                '            this.parseRow (row);\n' +
                '        }');
            expect (out).not.toContain ('rows[i]'); // no native read: the list is not proven a slice either
        });

        test('a list that shrinks inside the loop keeps the guard', () => {
            const out = go (
                "        const rows = this.safeList (response, 'rows', []);\n" +
                '        for (let i = 0; i < rows.length; i++) {\n' +
                '            rows.pop ();\n' +
                '            const row = rows[i];\n' +
                '            this.parseRow (row);\n' +
                '        }');
            expect (out).not.toContain ('rows[i]'); // no native read: the list is not proven a slice either
        });

        // the bounded-loop rule covers the venue and pro tiers too; only ts/src/test stays out
        test('a file of the test tree is out of this rule', () => {
            const out = go (
                "        const rows = this.safeList (response, 'rows', []);\n" +
                '        for (let i = 0; i < rows.length; i++) {\n' +
                '            const row = rows[i];\n' +
                '            this.parseRow (row);\n' +
                '        }', 'test');
            expect (out).toContain (GUARD);
        });
    });
});

describe ('go async receive at the root tree', () => {
    // a receive from a same-class async producer whose every return is nil or a []any is bound to a holder
    // named after its target: `<target>Recv, _ := PanicOnError((<-this.MAsync(..))).([]any)` + `var <target> []any = <target>Recv`
    // (the comma-ok assertion answers what ListTyped did); a numeric suffix is added only on a name collision.
    const BASE = 'export class Exchange {\n    safeString (o: any, k: string): string {\n        return k;\n    }\n}\n';
    const PRODUCERS =
        '    async handleAccountIndex (params = {}) {\n        if (params) {\n            return [ 1, params ];\n        }\n        return [ 2, params ];\n    }\n' +
        '    async isUnifiedEnabled (params = {}) {\n        return undefined;\n    }\n' +
        '    async handleLoose (params: any = {}) {\n        return params;\n    }\n';
    function print (body: string): string {
        const tmp = fs.mkdtempSync (path.join (os.tmpdir (), 'print-async-recv-'));
        try {
            const src = path.join (tmp, 'ts', 'src');
            fs.mkdirSync (path.join (src, 'base'), { 'recursive': true });
            fs.writeFileSync (path.join (src, 'base', 'Exchange.ts'), BASE);
            fs.writeFileSync (path.join (src, 'ex.ts'), "import { Exchange } from './base/Exchange.js';\nexport default class ex extends Exchange {\n" + PRODUCERS + body + '}\n');
            const t = new Transpiler ({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 }, 'asyncMethodSuffix': 'Async' } });
            installCcxtGoHooks (t.goTranspiler);
            return t.transpileGoByPath (path.join (src, 'ex.ts')).content;
        } finally {
            fs.rmSync (tmp, { 'recursive': true, 'force': true });
        }
    }
    const holders = (out: string): string[] => [ ...out.matchAll (/(\w+), _ := PanicOnError\(\(<-this\.\w+Async\(/g) ].map ((m) => m[1]);

    test ('a declaration receive is bound to <name>Recv', () => {
        const out = print ('    async fetchA (params = {}) {\n        const pair = await this.handleAccountIndex (params);\n        return pair[0];\n    }\n');
        expect (out).toContain ('\tpairRecv, _ := PanicOnError((<-this.HandleAccountIndexAsync(params))).([]any)\n\tvar pair []any = pairRecv\n');
        expect (out).not.toMatch (/listRecv|ListTyped\(PanicOnError\(\(<-this\.HandleAccountIndexAsync/);
    });
    test ('a destructuring receive and its assignment form name the holder after the synthetic binding', () => {
        const out = print ('    async fetchA (params = {}) {\n        const [ a, rest ] = await this.handleAccountIndex (params);\n        let b = undefined;\n        let c = undefined;\n' +
            '        if (rest) {\n            [ b, c ] = await this.handleAccountIndex (rest);\n        }\n        return [ a, b, c ];\n    }\n');
        expect (out).toContain ('\tarestVariableRecv, _ := PanicOnError((<-this.HandleAccountIndexAsync(params))).([]any)\n\tvar arestVariable []any = arestVariableRecv\n');
        expect (out).toContain ('\t\tbcVariableRecv, _ := PanicOnError((<-this.HandleAccountIndexAsync(rest))).([]any)\n\t\tvar bcVariable []any = bcVariableRecv\n');
    });
    test ('a nil-only producer and a forwarded return are bound too', () => {
        const out = print ('    async fetchA (params = {}) {\n        const u = await this.isUnifiedEnabled ();\n        return u[0];\n    }\n' +
            '    async fetchB (params = {}) {\n        return await this.handleAccountIndex (params);\n    }\n');
        expect (out).toContain ('\tuRecv, _ := PanicOnError((<-this.IsUnifiedEnabledAsync())).([]any)\n\tvar u []any = uRecv\n');
        expect (out).toMatch (/\t(retRes\d+)Recv, _ := PanicOnError\(\(<-this\.HandleAccountIndexAsync\(params\)\)\)\.\(\[\]any\)\n\tvar \1 \[\]any = \1Recv\n/);
    });
    test ('the name does not move when lines are added above', () => {
        const body = '    async fetchA (params = {}) {\n        const pair = await this.handleAccountIndex (params);\n        return pair[0];\n    }\n';
        expect (holders (print (body))).toEqual ([ 'pairRecv' ]);
        expect (holders (print ('    // a\n    // b\n\n' + body))).toEqual ([ 'pairRecv' ]);
    });
    test ('a taken name or a second visible receive into the same target takes a numeric suffix', () => {
        const out = print ('    async fetchA (params = {}) {\n        const pairRecv = 1;\n        const pair = await this.handleAccountIndex (params);\n        return [ pair[0], pairRecv ];\n    }\n' +
            '    async fetchB (params = {}) {\n        let b = undefined;\n        let c = undefined;\n        [ b, c ] = await this.handleAccountIndex (params);\n        [ b, c ] = await this.handleAccountIndex (c);\n        return b;\n    }\n');
        expect (holders (out)).toEqual ([ 'pairRecv2', 'bcVariableRecv', 'bcVariableRecv2' ]);
    });
    test ('an unproven producer keeps ListTyped', () => {
        const out = print ('    async fetchA (params = {}) {\n        const [ a, b ] = await this.handleLoose (params);\n        return [ a, b ];\n    }\n');
        expect (out).not.toContain ('Recv, _ :=');
    });
});
