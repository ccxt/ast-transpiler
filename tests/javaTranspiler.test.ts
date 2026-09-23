import { Transpiler } from '../src/transpiler';
import fs from 'fs';
import path from 'path';

jest.mock('module',()=>({
    __esModule: true,
    default: jest.fn()
}));

let transpiler: Transpiler;

beforeAll(() => {
    const config = {
        'verbose': false,
        'java': {
            'parser': {
                'NUM_LINES_END_FILE': 0,
            }
        }
    }
    transpiler = new Transpiler(config);
})

describe('java transpiling tests', () => {
    test('basic variable declaration', () => {
        const input = "const x = 1;"
        const expected = "Object x = 1;"
        const output = transpiler.transpileJava(input).content;
        expect(output).toBe(expected);
    });

    test('basic method declaration', () => {
        const input =
        "class T {\n" +
        "    test(): string {\n" +
        "        return \"hello\";\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("Object test(");
        expect(output).toContain('return "hello"');
    });

    test('async void method returns CompletableFuture<Object> not <Void>', () => {
        const input =
        "class T {\n" +
        "    async doSomething(): Promise<void> {\n" +
        "        const x = 1;\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("java.util.concurrent.CompletableFuture<Object> doSomething(");
        expect(output).not.toContain("CompletableFuture<Void>");
    });

    test('async method with typed return also uses CompletableFuture<Object> (no per-type generics)', () => {
        const input =
        "class T {\n" +
        "    async fetchData(): Promise<string> {\n" +
        "        return \"data\";\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        // The Java transpiler does not map TS return types to Java generics —
        // all async methods use CompletableFuture<Object> regardless of the
        // declared Promise<T> type. This is intentional: the runtime casts
        // happen on the consumer side.
        expect(output).toContain("CompletableFuture<Object> fetchData(");
        expect(output).not.toContain("CompletableFuture<Void>");
    });

    test('async method body gets return null at end when no explicit return', () => {
        const input =
        "class T {\n" +
        "    async doSomething(): Promise<void> {\n" +
        "        const x = 1;\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        // supplyAsync lambda should end with return null before closing
        expect(output).toContain("return null;");
        expect(output).toContain("supplyAsync");
    });

    test('async method body does not add return null when last stmt is return', () => {
        const input =
        "class T {\n" +
        "    async fetchData(): Promise<string> {\n" +
        "        return \"data\";\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        const lines = output.split('\n');
        // Should not have a stray "return null;" — only the actual return "data"
        const returnNullCount = lines.filter(l => l.trim() === 'return null;').length;
        expect(returnNullCount).toBe(0);
    });

    test('bare return in async method becomes return null', () => {
        const input =
        "class T {\n" +
        "    async handleMessage(msg: any): Promise<void> {\n" +
        "        if (msg === undefined) {\n" +
        "            return;\n" +
        "        }\n" +
        "        const x = msg;\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        // The bare return; inside the if should become return null;
        // since it's inside an async method (supplyAsync lambda)
        expect(output).not.toMatch(/\breturn;\s*$/m);
        expect(output).toContain("return null;");
    });

    test('bare return in sync void method stays as return', () => {
        const input =
        "class T {\n" +
        "    handleMessage(msg: any): void {\n" +
        "        if (msg === undefined) {\n" +
        "            return;\n" +
        "        }\n" +
        "        const x = msg;\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        // Sync void method should keep bare return;
        expect(output).toMatch(/\breturn;\s*$/m);
        expect(output).not.toContain("supplyAsync");
    });

    test('bare return in sync method is not affected by async methods in the same class', () => {
        // Test sync method in isolation to verify bare return; is preserved
        const syncInput =
        "class T {\n" +
        "    handleMessage(msg: any): void {\n" +
        "        if (msg === undefined) {\n" +
        "            return;\n" +
        "        }\n" +
        "        const x = msg;\n" +
        "    }\n" +
        "}"
        const syncOutput = transpiler.transpileJava(syncInput).content;
        expect(syncOutput).toMatch(/\breturn;\s*$/m);

        // Test async method in isolation to verify bare return; becomes return null;
        const asyncInput =
        "class T {\n" +
        "    async handleMessage(msg: any): Promise<void> {\n" +
        "        if (msg === undefined) {\n" +
        "            return;\n" +
        "        }\n" +
        "        const x = msg;\n" +
        "    }\n" +
        "}"
        const asyncOutput = transpiler.transpileJava(asyncInput).content;
        expect(asyncOutput).not.toMatch(/\breturn;\s*$/m);
        expect(asyncOutput).toContain("return null;");
    });

    test('async method with multiple returns does not add extra return null', () => {
        const input =
        "class T {\n" +
        "    async fetchData(x: any): Promise<string> {\n" +
        "        if (x) {\n" +
        "            return \"a\";\n" +
        "        }\n" +
        "        return \"b\";\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        // Last statement is a return, so no return null should be added
        const returnNullCount = output.split('\n').filter(l => l.trim() === 'return null;').length;
        expect(returnNullCount).toBe(0);
    });

    test('return null has correct spacing (no double space)', () => {
        const input =
        "class T {\n" +
        "    async handleMessage(msg: any): Promise<void> {\n" +
        "        if (msg === undefined) {\n" +
        "            return;\n" +
        "        }\n" +
        "        const x = msg;\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        // Should be "return null;" with single space, not "return  null;"
        expect(output).not.toContain("return  null;");
        expect(output).toContain("return null;");
    });

    test('async method with if/else both returning does not add return null', () => {
        const input =
        "class T {\n" +
        "    async fetchData(condition: boolean): Promise<string> {\n" +
        "        if (condition) {\n" +
        "            return await this.methodA();\n" +
        "        } else {\n" +
        "            return await this.methodB();\n" +
        "        }\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        const returnNullCount = output.split('\n').filter(l => l.trim() === 'return null;').length;
        expect(returnNullCount).toBe(0);
    });

    test('async method with if/else-if (no final else) still adds return null', () => {
        const input =
        "class T {\n" +
        "    async fetchData(x: number): Promise<string> {\n" +
        "        if (x === 1) {\n" +
        "            return \"a\";\n" +
        "        } else if (x === 2) {\n" +
        "            return \"b\";\n" +
        "        }\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        // else-if without final else: fallthrough possible, return null needed
        expect(output).toContain("return null;");
    });

    test('async method with if/else-if/else all returning does not add return null', () => {
        const input =
        "class T {\n" +
        "    async fetchOHLCV(uta: boolean, market: any): Promise<any> {\n" +
        "        if (uta) {\n" +
        "            return await this.fetchUTAOHLCV();\n" +
        "        } else if (market['contract']) {\n" +
        "            return await this.fetchContractOHLCV();\n" +
        "        } else {\n" +
        "            return await this.fetchSpotOHLCV();\n" +
        "        }\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        const returnNullCount = output.split('\n').filter(l => l.trim() === 'return null;').length;
        expect(returnNullCount).toBe(0);
    });

    test('async method with deeply nested if/else-if/else-if/else all returning does not add return null', () => {
        const input =
        "class T {\n" +
        "    async fetch(x: number): Promise<string> {\n" +
        "        if (x === 1) {\n" +
        "            return \"a\";\n" +
        "        } else if (x === 2) {\n" +
        "            return \"b\";\n" +
        "        } else if (x === 3) {\n" +
        "            return \"c\";\n" +
        "        } else {\n" +
        "            return \"d\";\n" +
        "        }\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        const returnNullCount = output.split('\n').filter(l => l.trim() === 'return null;').length;
        expect(returnNullCount).toBe(0);
    });

    test('async method with if/else-if/else where middle branch missing return still works', () => {
        const input =
        "class T {\n" +
        "    async fetch(x: number): Promise<any> {\n" +
        "        if (x === 1) {\n" +
        "            return \"a\";\n" +
        "        } else if (x === 2) {\n" +
        "            const y = x;\n" +
        "        } else {\n" +
        "            return \"c\";\n" +
        "        }\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        // middle branch doesn't return, so return null is needed
        expect(output).toContain("return null;");
    });

    test('async method with if/else where both throw does not add return null', () => {
        const input =
        "class T {\n" +
        "    async fetchData(condition: boolean): Promise<string> {\n" +
        "        if (condition) {\n" +
        "            throw new Error(\"a\");\n" +
        "        } else {\n" +
        "            throw new Error(\"b\");\n" +
        "        }\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        const returnNullCount = output.split('\n').filter(l => l.trim() === 'return null;').length;
        expect(returnNullCount).toBe(0);
    });

    test('async method with if (no else) still adds return null', () => {
        const input =
        "class T {\n" +
        "    async fetchData(condition: boolean): Promise<string> {\n" +
        "        if (condition) {\n" +
        "            return \"a\";\n" +
        "        }\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("return null;");
    });

    test('async method with multi-statement if/else both ending in return does not add return null', () => {
        const input =
        "class T {\n" +
        "    async fetchData(condition: boolean): Promise<any> {\n" +
        "        if (condition) {\n" +
        "            const response = await this.publicGetFoo();\n" +
        "            const data = this.safeDict(response, 'data', {});\n" +
        "            return this.parseTicker(data);\n" +
        "        } else {\n" +
        "            const response = await this.publicGetBar();\n" +
        "            const data = this.safeDict(response, 'data', {});\n" +
        "            return this.parseSpotTicker(data);\n" +
        "        }\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        const returnNullCount = output.split('\n').filter(l => l.trim() === 'return null;').length;
        expect(returnNullCount).toBe(0);
    });

    test('async method ending with assignment still adds return null', () => {
        const input =
        "class T {\n" +
        "    async process(x: any): Promise<void> {\n" +
        "        const result = await this.fetch(x);\n" +
        "        this.data = result;\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("return null;");
    });

    test('async method ending with function call still adds return null', () => {
        const input =
        "class T {\n" +
        "    async process(x: any): Promise<void> {\n" +
        "        await this.doSomething(x);\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("return null;");
    });

    test('object literal capturing a reassigned local prints Helpers.newMap, no final copy', () => {
        const input =
        "class T {\n" +
        "    f(p: boolean): any {\n" +
        "        let x = 'a';\n" +
        "        if (p) {\n" +
        "            x = 'b';\n" +
        "        }\n" +
        "        const req = { 'k': x, 'n': { 'm': x, 'id': this.id }, 'c': 1 };\n" +
        "        return this.g({ 'k': x });\n" +
        "    }\n" +
        "    g(a: any) { return a; }\n" +
        "}";
        const output = transpiler.transpileJava(input).content;
        expect(output).not.toMatch(/final \w+ final\w+ =/);
        expect(output).toContain('Object req = Helpers.newMap(');
        expect(output).toMatch(/"k", x,\n\s*"n", Helpers\.newMap\(\n\s*"m", x,\n\s*"id", this\.id\n\s*\),\n\s*"c", 1\n\s*\);/);
        expect(output).toMatch(/return this\.g\(Helpers\.newMap\(\n\s*"k", x\n\s*\)\);/);
        expect(output).not.toContain('T.this');
    });

    test('object literal capturing only effectively-final values keeps the double-brace form', () => {
        const input =
        "class T {\n" +
        "    f(y: string): any {\n" +
        "        const z = 1;\n" +
        "        return { 'y': y, 'z': z, 'id': this.id };\n" +
        "    }\n" +
        "}";
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain('new java.util.HashMap<String, Object>() {{');
        expect(output).toContain('put( "id", T.this.id );');
        expect(output).not.toContain('Helpers.newMap(');
    });

    test('loop counter and forward-reassigned locals in literals print the builder', () => {
        const input =
        "class T {\n" +
        "    f(ids: any[]): void {\n" +
        "        const out = [];\n" +
        "        for (let i = 0; i < ids.length; i++) {\n" +
        "            out.push({ 'i': i });\n" +
        "        }\n" +
        "        let a = 1;\n" +
        "        const r = { 'a': a };\n" +
        "        a = 2;\n" +
        "    }\n" +
        "}";
        const output = transpiler.transpileJava(input).content;
        expect(output).not.toMatch(/final \w+ final\w+ =/);
        expect(output).toMatch(/\.add\(Helpers\.newMap\(\n\s*"i", i\n\s*\)\)/);
        expect(output).toMatch(/Object r = Helpers\.newMap\(\n\s*"a", a\n\s*\);/);
    });

    test('async method ending with for loop still adds return null', () => {
        const input =
        "class T {\n" +
        "    async process(items: any[]): Promise<void> {\n" +
        "        for (let i = 0; i < items.length; i++) {\n" +
        "            await this.handle(items[i]);\n" +
        "        }\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("return null;");
    });

    test('basic while loop', () => {
        const input =
        "while (true) {\n" +
        "    const x = 1;\n" +
        "    break;\n" +
        "}"
        const expected =
        "while (true)\n{\n" +
        "    Object x = 1;\n" +
        "    break;\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toBe(expected);
    });

    // --- Bug 2: duplicate final variable declarations ---





    // --- Bug 1: final var detection in nested call arguments ---






    // --- Regression: sequential transpileJava calls must not leak state ---




    // --- Bug: finalXxx declared inside if-block but referenced outside it ---




    // --- Bug: over-aggressive hoisting of loop-local variables ---




    // --- Loop variable final declarations must stay inside the loop ---










    // --- Bug: ternary/ConditionalExpression not handled for final var replacement ---


    // --- Bug: PrefixUnaryExpression not handled for final var replacement ---



    // --- Bug: hoisted final var captured pre-reassignment value (bybit.setMarginMode) ---








    // --- Object-literal substitution coverage gaps ---
    // The anonymous inner-class HashMap requires every captured variable to be
    // effectively final. Each of these expression shapes used to leave the
    // reassigned identifier raw inside the inner class, producing invalid Java.










    // --- Async method param wrapper: keyword-remapped names must round-trip ---
    // The async-method wrapper hoists each reassigned param into a final snapshot
    // outside the supplyAsync lambda and re-binds the original name inside it.
    // For keyword-remapped params (e.g. `params` -> `parameters`) the wrapper
    // names must be derived from the remapped Java identifier; otherwise the
    // outside snapshot RHS references an undeclared variable.

    test('async-wrapper: reassigned keyword-remapped param (params) — sig/snap/local round-trip on `parameters`', () => {
        // Use a fresh transpiler to avoid cross-call ReassignedVars leakage
        const fresh = new Transpiler();
        const input =
        "class T {\n" +
        "  async handleAccountIndex(params: object, methodName1: string): Promise<any> {\n" +
        "    let accountIndex = undefined;\n" +
        "    [accountIndex, params] = this.handleOptionAndParams2(params, methodName1);\n" +
        "    return accountIndex;\n" +
        "  }\n" +
        "  handleOptionAndParams2(p: object, m: string) { return [1, p]; }\n" +
        "}";
        const output = fresh.transpileJava(input).content;
        // Signature: param is remapped + suffixed (Object parameters2)
        expect(output).toMatch(/handleAccountIndex\s*\(\s*Object parameters2\b/);
        // Outside snapshot: RHS = sig name (parameters2), LHS = parameters3
        expect(output).toContain('final Object parameters3 = parameters2;');
        // Inside lambda: local rebinds the post-keyword-remap name
        expect(output).toContain('Object parameters = parameters3;');
        // Must NOT emit the broken pre-fix output (`params2`/`params3` referenced anywhere)
        expect(output).not.toMatch(/\bparams2\b/);
        expect(output).not.toMatch(/\bparams3\b/);
    });

    test('async-wrapper: reassigned non-remapped param (body) — preserves existing body2/body3 shape', () => {
        const fresh = new Transpiler();
        const input =
        "class T {\n" +
        "  async f(body: string): Promise<any> {\n" +
        "    body = 'x';\n" +
        "    return body;\n" +
        "  }\n" +
        "}";
        const output = fresh.transpileJava(input).content;
        expect(output).toMatch(/f\s*\(\s*Object body2\b/);
        expect(output).toContain('final Object body3 = body2;');
        expect(output).toContain('Object body = body3;');
    });

    test('async-wrapper: other keyword-remapped params (internal, event) get correct wrappers', () => {
        const fresh = new Transpiler();
        // `internal` -> `intern`, `event` -> `eventVar`
        const input =
        "class T {\n" +
        "  async f(internal: string, event: string): Promise<any> {\n" +
        "    internal = 'x';\n" +
        "    event = 'y';\n" +
        "    return internal;\n" +
        "  }\n" +
        "}";
        const output = fresh.transpileJava(input).content;
        expect(output).toMatch(/f\s*\(\s*Object intern2,\s*Object eventVar2\b/);
        expect(output).toContain('final Object intern3 = intern2;');
        expect(output).toContain('final Object eventVar3 = eventVar2;');
        expect(output).toContain('Object intern = intern3;');
        expect(output).toContain('Object eventVar = eventVar3;');
        // Pre-fix bug would emit `internal2`/`event2` on RHS — must not appear.
        expect(output).not.toMatch(/\binternal2\b/);
        expect(output).not.toMatch(/\bevent2\b/);
    });

    test('async-wrapper: mixed remapped + non-remapped reassigned params coexist', () => {
        const fresh = new Transpiler();
        const input =
        "class T {\n" +
        "  async f(params: object, body: string): Promise<any> {\n" +
        "    params = {};\n" +
        "    body = 'x';\n" +
        "    return body;\n" +
        "  }\n" +
        "}";
        const output = fresh.transpileJava(input).content;
        expect(output).toMatch(/f\s*\(\s*Object parameters2,\s*Object body2\b/);
        expect(output).toContain('final Object parameters3 = parameters2;');
        expect(output).toContain('final Object body3 = body2;');
        expect(output).toContain('Object parameters = parameters3;');
        expect(output).toContain('Object body = body3;');
    });

    // --- Integration: realistic exchange pattern combining all features ---






    // Negative regression: a var that is truly never reassigned and only read
    // outside any BinaryExpression context must NOT get a snapshot in the
    // captured literal. Catches accidental over-eager versioning from the
    // pass-1 broadening (mirror of printCustomBinaryExpressionIfAny).
    test('object literal: truly read-only var captured in if/else — NO snapshot emitted', () => {
        const fresh = new Transpiler();
        const input =
        "class T {\n" +
        "    async f(type) {\n" +
        "        const x = 'const';\n" +
        "        let r = undefined;\n" +
        "        if (type === 'a') {\n" +
        "            r = { 'v': x };\n" +
        "        } else {\n" +
        "            r = { 'v': x };\n" +
        "        }\n" +
        "        return r;\n" +
        "    }\n" +
        "}";
        const output = fresh.transpileJava(input).content;
        // x appears only as a read inside literals; never on the left of any
        // BinaryExpression and never reassigned. No finalX snapshot expected.
        expect(output).not.toMatch(/final Object finalX\b/);
        expect(output).toMatch(/put\(\s*"v",\s*x\s*\)/);
    });


    // Regression (real CCXT bitmart/bingx authenticate shape): a var was marked in
    // ReassignedVars by a PRIOR transpile call and then read back while transpiling
    // a different file where the same class+method+var name is `const`. That
    // cross-call leak produced spurious `finalXxx` snapshots whose presence depended
    // on emit order, so re-emitting the same file gave different Java.
    //
    // ReassignedVars is now reset per source file, so the priming call below cannot
    // reach the target: `timestamp` is `const` here and must be captured directly.
    test('object literal: prior transpile does not leak ReassignedVars into the next file', () => {
        const fresh = new Transpiler();
        // Would previously prime ReassignedVars with T-authenticate-timestamp.
        const priming =
        "class T {\n" +
        "    async authenticate(type, params = {}) {\n" +
        "        let timestamp = '0';\n" +
        "        timestamp = timestamp + '!';\n" +
        "        return timestamp;\n" +
        "    }\n" +
        "}";
        fresh.transpileJava(priming);
        // Target: same class+method shape but timestamp is now `const`.
        const target =
        "class T {\n" +
        "    async authenticate(type, params = {}) {\n" +
        "        if (true) {\n" +
        "            const timestamp = '123';\n" +
        "            const signature = 'sig';\n" +
        "            let request = null;\n" +
        "            if (type === 'spot') {\n" +
        "                request = { 'args': [ timestamp, signature ] };\n" +
        "            } else {\n" +
        "                request = { 'args': [ timestamp, signature, 'web' ] };\n" +
        "            }\n" +
        "        }\n" +
        "    }\n" +
        "}";
        const output = fresh.transpileJava(target).content;
        // `timestamp` is effectively final in the target — no snapshot is needed, and
        // none may be invented from the previous call's state.
        expect(output).not.toMatch(/final Object finalTimestamp\b/);
        expect(output).toMatch(/Arrays\.asList\(\s*timestamp,\s*signature\s*\)/);
        expect(output).toMatch(/Arrays\.asList\(\s*timestamp,\s*signature,\s*"web"\s*\)/);
        // No undeclared finalXxx anywhere.
        const allRefs = [...output.matchAll(/\b(final[A-Z]\w+)\b/g)].map(m => m[1]);
        const allDecls = new Set([...output.matchAll(/final Object (final\w+)\s*=/g)].map(m => m[1]));
        const undeclared = [...new Set(allRefs)].filter(r => !allDecls.has(r));
        expect(undeclared).toEqual([]);
        // Transpiling the target standalone must give exactly the same Java.
        const standalone = new Transpiler().transpileJava(target).content;
        expect(output).toEqual(standalone);
    });






    // --- Helpers.* indirection for Object.keys / Object.values / Array.isArray ---
    //
    // The Java emit routes most TS built-ins through a consumer-provided `Helpers`
    // class (Helpers.add, Helpers.isEqual, Helpers.GetValue, Helpers.json, ...).
    // Object.keys/values and Array.isArray were the outliers — they inlined raw
    // stdlib calls (`new ArrayList<>(((Map<String,Object>)x).keySet())` etc.).
    // Routing them through Helpers gives consumers a single place to choose
    // semantics (thread-safety, null-handling, type coercion) and removes the
    // need for downstream regex post-processing that misses non-trivial
    // argument shapes (e.g. `this.x`, `obj[k].y`, nested calls).

    test('Object.keys(x) emits Helpers.objectKeys(x) — bare identifier', () => {
        const fresh = new Transpiler();
        const input =
        "class T {\n" +
        "    f(obj) {\n" +
        "        return Object.keys(obj);\n" +
        "    }\n" +
        "}";
        const output = fresh.transpileJava(input).content;
        expect(output).toMatch(/Helpers\.objectKeys\(\s*obj\s*\)/);
        expect(output).not.toMatch(/\.keySet\(\)/);
    });

    test('Object.keys(this.tickers) emits Helpers.objectKeys(this.tickers) — property access', () => {
        const fresh = new Transpiler();
        const input =
        "class T {\n" +
        "    tickers = {};\n" +
        "    f() {\n" +
        "        return Object.keys(this.tickers);\n" +
        "    }\n" +
        "}";
        const output = fresh.transpileJava(input).content;
        // The 13 sites CCXT's regex post-processor missed all had this.x as the
        // argument. AST-level emit must handle this shape correctly.
        expect(output).toMatch(/Helpers\.objectKeys\(\s*this\.tickers\s*\)/);
        expect(output).not.toMatch(/\.keySet\(\)/);
    });

    test('Object.keys(obj[k]) emits Helpers.objectKeys for ElementAccess argument', () => {
        const fresh = new Transpiler();
        const input =
        "class T {\n" +
        "    f(obj, k) {\n" +
        "        return Object.keys(obj[k]);\n" +
        "    }\n" +
        "}";
        const output = fresh.transpileJava(input).content;
        // Argument is an ElementAccessExpression; emit must wrap whatever the
        // arg parses to.
        expect(output).toMatch(/Helpers\.objectKeys\(/);
        expect(output).not.toMatch(/\.keySet\(\)/);
    });

    // --- objectKeys native emission (checker-proven dict argument) ---
    //
    // The helper keeps its `instanceof Map` fallback and its synchronized
    // snapshot for shared field maps; a checker-proven dict target is a Map on
    // every print and run path, so the key copy prints native.

    test('Object.keys(dict-typed identifier) emits the native key copy', () => {
        const fresh = new Transpiler();
        const input =
        "class T {\n" +
        "    f(dict: { [key: string]: any }) {\n" +
        "        return Object.keys(dict);\n" +
        "    }\n" +
        "}";
        const output = fresh.transpileJava(input).content;
        expect(output).toMatch(/new java\.util\.ArrayList<Object>\(\(\(java\.util\.Map<String, Object>\)dict\)\.keySet\(\)\)/);
        expect(output).not.toMatch(/Helpers\.objectKeys\(/);
    });

    test('Object.keys of a dict-returning call emits the native key copy', () => {
        const fresh = new Transpiler();
        const input =
        "class T {\n" +
        "    g(): { [key: string]: any } {\n" +
        "        return {};\n" +
        "    }\n" +
        "    f() {\n" +
        "        return Object.keys(this.g());\n" +
        "    }\n" +
        "}";
        const output = fresh.transpileJava(input).content;
        expect(output).toMatch(/new java\.util\.ArrayList<Object>\(\(\(java\.util\.Map<String, Object>\)this\.g\(\)\)\.keySet\(\)\)/);
    });

    test('Object.keys of a dict narrowed by Array.isArray (else branch) emits the native key copy', () => {
        const fresh = new Transpiler();
        const input =
        "class T {\n" +
        "    f(orders: { [key: string]: any } | any[]) {\n" +
        "        if (Array.isArray(orders)) {\n" +
        "            return orders.length;\n" +
        "        } else {\n" +
        "            return Object.keys(orders);\n" +
        "        }\n" +
        "    }\n" +
        "}";
        const output = fresh.transpileJava(input).content;
        expect(output).toMatch(/new java\.util\.ArrayList<Object>\(\(\(java\.util\.Map<String, Object>\)orders\)\.keySet\(\)\)/);
    });

    test('Object.keys(this.<dict field>) keeps the helper (shared field map)', () => {
        const fresh = new Transpiler();
        const input =
        "class T {\n" +
        "    dict: { [key: string]: any } = {};\n" +
        "    f() {\n" +
        "        return Object.keys(this.dict);\n" +
        "    }\n" +
        "}";
        const output = fresh.transpileJava(input).content;
        // Field maps are shared with other threads and the helper's synchronized
        // snapshot is the port's documented map-read invariant.
        expect(output).toMatch(/Helpers\.objectKeys\(\s*this\.dict\s*\)/);
        expect(output).not.toMatch(/\.keySet\(\)/);
    });

    test('Object.keys of a nullable dict / an array keeps the helper', () => {
        const fresh = new Transpiler();
        const nullable =
        "class T {\n" +
        "    f(dict: { [key: string]: any } | undefined) {\n" +
        "        return Object.keys(dict);\n" +
        "    }\n" +
        "}";
        const nullableOutput = fresh.transpileJava(nullable).content;
        expect(nullableOutput).toMatch(/Helpers\.objectKeys\(/);
        expect(nullableOutput).not.toMatch(/\.keySet\(\)/);
        const array =
        "class T {\n" +
        "    f(list: any[]) {\n" +
        "        return Object.keys(list);\n" +
        "    }\n" +
        "}";
        const arrayOutput = fresh.transpileJava(array).content;
        expect(arrayOutput).toMatch(/Helpers\.objectKeys\(/);
        expect(arrayOutput).not.toMatch(/\.keySet\(\)/);
    });

    test('Object.values(x) emits Helpers.objectValues(x) — bare identifier', () => {
        const fresh = new Transpiler();
        const input =
        "class T {\n" +
        "    f(obj) {\n" +
        "        return Object.values(obj);\n" +
        "    }\n" +
        "}";
        const output = fresh.transpileJava(input).content;
        expect(output).toMatch(/Helpers\.objectValues\(\s*obj\s*\)/);
        expect(output).not.toMatch(/\.values\(\)/);
    });

    test('Object.values(this.x) emits Helpers.objectValues(this.x) — property access', () => {
        const fresh = new Transpiler();
        const input =
        "class T {\n" +
        "    cache = {};\n" +
        "    f() {\n" +
        "        return Object.values(this.cache);\n" +
        "    }\n" +
        "}";
        const output = fresh.transpileJava(input).content;
        expect(output).toMatch(/Helpers\.objectValues\(\s*this\.cache\s*\)/);
        expect(output).not.toMatch(/\.values\(\)/);
    });

    test('Array.isArray(x) emits (x instanceof java.util.List) — bare identifier', () => {
        const fresh = new Transpiler();
        const input =
        "class T {\n" +
        "    f(arg) {\n" +
        "        return Array.isArray(arg);\n" +
        "    }\n" +
        "}";
        const output = fresh.transpileJava(input).content;
        // Object operand: the helper's null/List answer is the same instanceof answer
        expect(output).toContain("return (arg instanceof java.util.List);");
        expect(output).not.toMatch(/Helpers\.isArray\(/);
    });

    test('Array.isArray(this.x) emits (this.x instanceof java.util.List) — property access', () => {
        const fresh = new Transpiler();
        const input =
        "class T {\n" +
        "    items = [];\n" +
        "    f() {\n" +
        "        return Array.isArray(this.items);\n" +
        "    }\n" +
        "}";
        const output = fresh.transpileJava(input).content;
        expect(output).toContain("return (this.items instanceof java.util.List);");
        expect(output).not.toMatch(/Helpers\.isArray\(/);
    });

    test('non-async Promise-returning delegator transpiles like async return await', () => {
        // a method without `async` that returns a Promise (e.g. WS delegators
        // like `watchTicker(...) { return this.watchTickerInner(...); }`)
        // must produce the exact same Java as its `async`/`return await` twin:
        // CompletableFuture signature + supplyAsync wrapper + `.join()` on the
        // inner future (instead of returning the raw CompletableFuture, which
        // would make the outer future resolve to a future).
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
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("java.util.concurrent.CompletableFuture<Object> watchTicker(");
        expect(output).toContain("return (this.watchTickerInner(symbol)).join();");
        // the delegator must be wrapped in supplyAsync like any async method
        expect((output.match(/supplyAsync/g) || []).length).toBe(3);
        // delegator body must be identical to the classic async/return await version
        const getBody = (name: string) => {
            const start = output.indexOf(`CompletableFuture<Object> ${name}(`);
            const end = output.indexOf('});', start);
            return output.slice(output.indexOf('{', start), end);
        };
        expect(getBody('watchTicker')).toBe(getBody('watchTickerClassic'));
    });

    // Idempotency: the Java emit must not be able to tell whether it is the first
    // or the tenth for the same input. The parsed SourceFile is cached and reused
    // across transpile calls, so the in-place `x` -> `finalX` identifier rewrite and
    // the ReassignedVars / object-literal caches all have to be unwound per file.
    // Before the fix, emit #2 dropped most `final Object finalX = x;` hoists while
    // keeping their usages (javac: cannot find symbol) or degenerated them into
    // `final Object finalX = finalX;` (javac: illegal self reference).
    test('java emit is idempotent — repeated emits of the same source are byte-identical', () => {
        const input =
        "class T {\n" +
        "    async fetchThing(symbol, params = {}) {\n" +
        "        let request = { 'symbol': symbol };\n" +
        "        request = this.extend(request, params);\n" +
        "        const timestamp = this.milliseconds();\n" +
        "        const payload = { 'ts': timestamp, 'req': request };\n" +
        "        return payload;\n" +
        "    }\n" +
        "}";
        const shared = new Transpiler();
        const emit1 = shared.transpileJava(input).content;
        const emit2 = shared.transpileJava(input).content;
        const emit3 = shared.transpileJava(input).content;
        expect(emit2).toEqual(emit1);
        expect(emit3).toEqual(emit1);
        // A reused instance must agree with a pristine one.
        expect(emit1).toEqual(new Transpiler().transpileJava(input).content);
        // Every finalXxx reference is declared, and no declaration is self-referential.
        for (const output of [ emit1, emit2, emit3 ]) {
            const refs = [...output.matchAll(/\b(final[A-Z]\w+)\b/g)].map(m => m[1]);
            const decls = new Set([...output.matchAll(/final Object (final\w+)\s*=/g)].map(m => m[1]));
            expect([...new Set(refs)].filter(r => !decls.has(r))).toEqual([]);
            expect(output).not.toMatch(/final Object (final\w+)\s*=\s*\1\s*;/);
        }
    });

    // Interleaving two files through one transpiler must not let either contaminate
    // the other: each file's Java has to match what it produces on its own.
    test('java emit is order-independent across files', () => {
        const fileA =
        "class A {\n" +
        "    async run(params = {}) {\n" +
        "        let request = 'a';\n" +
        "        request = request + '!';\n" +
        "        return { 'r': request };\n" +
        "    }\n" +
        "}";
        const fileB =
        "class A {\n" +
        "    async run(params = {}) {\n" +
        "        const request = 'b';\n" +
        "        return { 'r': request };\n" +
        "    }\n" +
        "}";
        const soloA = new Transpiler().transpileJava(fileA).content;
        const soloB = new Transpiler().transpileJava(fileB).content;
        const shared = new Transpiler();
        expect(shared.transpileJava(fileA).content).toEqual(soloA);
        expect(shared.transpileJava(fileB).content).toEqual(soloB);
        expect(shared.transpileJava(fileA).content).toEqual(soloA);
        // fileB's `request` is const — it must never acquire a snapshot from fileA.
        expect(soloB).not.toMatch(/final Object finalRequest/);
    });
});

describe('trailing null/undefined omission on this-calls (varargs ambiguity)', () => {
    // the generated java surface is uniformly varargs - a trailing bare null
    // triggers javac's "non-varargs call of varargs method" warning; the
    // transpiler drops exactly one trailing null/undefined on this.-calls
    const classWrap = (body: string) =>
        "class T {\n" +
        "    safeString2(o, k1, k2, d = undefined) { return undefined; }\n" +
        "    safeValue(o, k, d = undefined) { return undefined; }\n" +
        "    parseOrders(orders, market = undefined, since = undefined, limit = undefined) { return undefined; }\n" +
        "    handleParamString2(p, n1, n2, d = undefined) { return undefined; }\n" +
        "    method(a, b = undefined) { return undefined; }\n" +
        body +
        "}";

    test('drops trailing undefined on safe-family and parse helpers', () => {
        const input = classWrap(
            "    test() {\n" +
            "        const a = this.safeString2({}, 'x', 'y', undefined);\n" +
            "        const b = this.safeValue({}, 'x', undefined);\n" +
            "        const c = this.parseOrders([], undefined);\n" +
            "        const d = this.handleParamString2({}, 'x', 'y', undefined);\n" +
            "    }\n");
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain('this.safeString2(new java.util.HashMap<String, Object>() {{}}, "x", "y")');
        expect(output).not.toContain('safeString2(new java.util.HashMap<String, Object>() {{}}, "x", "y", null)');
        expect(output).toContain('this.safeValue(new java.util.HashMap<String, Object>() {{}}, "x")');
        expect(output).toContain('this.parseOrders(new java.util.ArrayList<Object>(java.util.Arrays.asList()))');
        expect(output).toContain('this.handleParamString2(new java.util.HashMap<String, Object>() {{}}, "x", "y")');
    });

    test('drops only one trailing nullish and leaves interior nulls intact', () => {
        const input = classWrap(
            "    test() {\n" +
            "        this.method(undefined, undefined);\n" +
            "    }\n");
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain('this.method(null)');
        expect(output).not.toContain('this.method(null, null)');
    });

    test('non-this calls keep trailing null', () => {
        const input =
            "function f(a, b = undefined) { return a; }\n" +
            "class T {\n" +
            "    test() {\n" +
            "        f('x', undefined);\n" +
            "    }\n" +
            "}";
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain('f("x", null)');
    });
});

describe('trailing undefined into a REQUIRED positional parameter is kept', () => {
    test('six required params, sixth passed as undefined - arity preserved', () => {
        const input =
        "class T {\n" +
        "    signDydxTx(pk, orderRequest, sub, chainName, account, authenticators) { return undefined; }\n" +
        "    test() {\n" +
        "        const signedTx = this.signDydxTx('pk', {}, '', 'chain', {}, undefined);\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain('this.signDydxTx("pk", new java.util.HashMap<String, Object>() {{}}, "", "chain", new java.util.HashMap<String, Object>() {{}}, null)');
    });

    test('optional tail still gets dropped', () => {
        const input =
        "class T {\n" +
        "    safeString2(o, k1, k2, d = undefined) { return undefined; }\n" +
        "    test() {\n" +
        "        const a = this.safeString2({}, 'x', 'y', undefined);\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain('this.safeString2(new java.util.HashMap<String, Object>() {{}}, "x", "y")');
    });
});

describe('java asyncExecutor option', () => {
    test('asyncExecutor: default emits the single-argument supplyAsync form', () => {
        const input =
        "class T {\n" +
        "    async fetchData(x: any): Promise<any> {\n" +
        "        const y = await this.other(x);\n" +
        "        return y;\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("supplyAsync(() -> {");
        expect(output).toContain("        });\n");
        expect(output).not.toMatch(/\}, [^)]+\);/);
    });

    test('asyncExecutor: option appends the executor as second supplyAsync argument', () => {
        const withExecutor = new Transpiler({
            'verbose': false,
            'java': {
                'parser': { 'NUM_LINES_END_FILE': 0 },
                'asyncExecutor': 'io.github.ccxt.BaseExchange.VIRTUAL_EXECUTOR',
            }
        });
        const input =
        "class T {\n" +
        "    async fetchData(x: any): Promise<any> {\n" +
        "        const y = await this.other(x);\n" +
        "        return y;\n" +
        "    }\n" +
        "    async noReturn(): Promise<void> {\n" +
        "        const x = 1;\n" +
        "    }\n" +
        "}"
        const output = withExecutor.transpileJava(input).content;
        const plain = transpiler.transpileJava(input).content;
        expect((output.match(/\}, io\.github\.ccxt\.BaseExchange\.VIRTUAL_EXECUTOR\);/g) || []).length).toBe(2);
        expect(output).toContain("            return null;\n        }, io.github.ccxt.BaseExchange.VIRTUAL_EXECUTOR);");
        // the option only appends the executor argument; everything else is identical
        expect(output.replace(/, io\.github\.ccxt\.BaseExchange\.VIRTUAL_EXECUTOR\);/g, ');')).toBe(plain);
    });
});

describe('java asyncSupplier option', () => {
    test('asyncSupplier: replaces CompletableFuture.supplyAsync and emits no executor argument', () => {
        const withSupplier = new Transpiler({
            'verbose': false,
            'java': {
                'parser': { 'NUM_LINES_END_FILE': 0 },
                'asyncSupplier': 'io.github.ccxt.BaseExchange.supplyAsync',
                'asyncExecutor': 'io.github.ccxt.BaseExchange.VIRTUAL_EXECUTOR',
            }
        });
        const input =
        "class T {\n" +
        "    async fetchData(x: any): Promise<any> {\n" +
        "        const y = await this.other(x);\n" +
        "        return y;\n" +
        "    }\n" +
        "    async noReturn(): Promise<void> {\n" +
        "        const x = 1;\n" +
        "    }\n" +
        "}"
        const output = withSupplier.transpileJava(input).content;
        expect(output).toContain("return io.github.ccxt.BaseExchange.supplyAsync(() -> {");
        expect(output).not.toContain("CompletableFuture.supplyAsync");
        expect(output).not.toContain("VIRTUAL_EXECUTOR");
        expect(output).toContain("return null;");
        expect((output.match(/^        \}\);$/gm) || []).length).toBe(2);
    });
});

describe('java boolean conditions emitted without the Helpers.isTrue wrapper', () => {
    const conditionOf = (body: string, signature = 'test(x: any): void') => {
        const input =
        "class T {\n" +
        "    " + signature + " {\n" +
        body +
        "    }\n" +
        "}"
        return transpiler.transpileJava(input).content;
    };

    test('comparison conditions print the comparison helper alone', () => {
        expect(conditionOf("        if (x === 1) { return; }\n")).toContain("if (Helpers.isEqual(x, 1))");
        // the null literal is native equality (d2): Objects.equals(x, null) is the identity test
        // Helpers.isEqual(x, null) performs, and the boolean needs no isTrue wrapper (d1)
        const notNull = conditionOf("        if (x !== null) { return; }\n");
        expect(notNull).toContain("if (!java.util.Objects.equals(x, null))");
        expect(notNull).not.toContain("Helpers.isTrue(");
        expect(conditionOf("        if (x == 1) { return; }\n")).toContain("if (Helpers.isEqual(x, 1))");
        expect(conditionOf("        if (x != null) { return; }\n"))
            .toContain("if (!java.util.Objects.equals(x, null))");
    });

    test('relational conditions print the comparison helper alone', () => {
        expect(conditionOf("        if (x > 1) { return; }\n")).toContain("if (Helpers.isGreaterThan(x, 1))");
        expect(conditionOf("        if (x >= 1) { return; }\n")).toContain("if (Helpers.isGreaterThanOrEqual(x, 1))");
        expect(conditionOf("        if (x < 1) { return; }\n")).toContain("if (Helpers.isLessThan(x, 1))");
        expect(conditionOf("        if (x <= 1) { return; }\n")).toContain("if (Helpers.isLessThanOrEqual(x, 1))");
    });

    test('while and ternary conditions are unwrapped too', () => {
        const loop = conditionOf("        while (x > 1) { x = 2; }\n");
        expect(loop).toContain("while (Helpers.isGreaterThan(x, 1))");
        const ternary = conditionOf("        return (x === 1) ? \"y\" : \"n\";\n", 'test(x: any): string');
        expect(ternary).toContain("(Helpers.isEqual(x, 1))");
        expect(ternary).not.toContain("Helpers.isTrue(");
    });

    test('typeof guards and instanceof print native/helper checks without the wrapper', () => {
        const typeofGuard = conditionOf("        if (typeof x === 'string') { return; }\n");
        expect(typeofGuard).toContain("if ((x instanceof String))");
        expect(typeofGuard).not.toContain("Helpers.isTrue(");
        const instance = conditionOf("        if (x instanceof Error) { return; }\n");
        expect(instance).toContain("if (Helpers.isInstance(x, Error.class))");
    });

    test('the `in` operator condition prints Helpers.inOp without the wrapper', () => {
        const output = conditionOf("        if (x in this.options) { return; }\n");
        expect(output).toContain("if (Helpers.inOp(this.options, x))");
        expect(output).not.toContain("Helpers.isTrue(");
    });

    test('logical operators of boolean conditions print native, no wrapper anywhere', () => {
        const and = conditionOf("        if (x === 1 && x !== 2) { return; }\n");
        expect(and).toContain("if (Helpers.isEqual(x, 1) && !Helpers.isEqual(x, 2))");
        expect(and).not.toContain("Helpers.isTrue(");
        const or = conditionOf("        if (x === 1 || x !== 2) { return; }\n");
        expect(or).toContain("if (Helpers.isEqual(x, 1) || !Helpers.isEqual(x, 2))");
        expect(or).not.toContain("Helpers.isTrue(");
    });

    test('negated boolean conditions drop the wrapper but keep the operator', () => {
        const output = conditionOf("        if (!(x === 1)) { return; }\n");
        expect(output).toContain("if (!(Helpers.isEqual(x, 1)))");
        expect(output).not.toContain("Helpers.isTrue(");
    });

    test('non-boolean conditions keep the falsy helper', () => {
        // a string / any condition still needs the runtime truthiness test
        expect(conditionOf("        if (x) { return; }\n", 'test(x: string): void'))
            .toContain("if (Helpers.isTrue(x))");
        expect(conditionOf("        if (x) { return; }\n")).toContain("if (Helpers.isTrue(x))");
        // `boolean | undefined` is not proven boolean - the helper must stay
        expect(conditionOf("        if (x) { return; }\n", 'test(x: boolean | undefined): void'))
            .toContain("if (Helpers.isTrue(x))");
        // negation of a non-boolean keeps the helper inside the `!`
        expect(conditionOf("        if (!x) { return; }\n", 'test(x: string): void'))
            .toContain("if (!Helpers.isTrue(x))");
    });

    test('logical operators over non-boolean operands keep the wrapper', () => {
        const output = conditionOf("        if (x && x) { return; }\n", 'test(x: string): void');
        expect(output).toContain("if (Helpers.isTrue(Helpers.isTrue(x) && Helpers.isTrue(x)))");
    });

    test('comparison operands inside a logical expression are unwrapped individually', () => {
        const output = conditionOf("        if (x && x === 1) { return; }\n", 'test(x: string): void');
        // the string operand prints native equality (d2); the comparison is still unwrapped on
        // its own - only the non-boolean `x` operand keeps an isTrue inside the &&
        expect(output).toContain("Helpers.isTrue(x) && java.util.Objects.equals(x, 1)");
        expect(output).not.toContain("Helpers.isTrue(java.util.Objects.equals(");
    });
});

describe('java isTrue around Precise relational statics (proven boolean)', () => {
    // the base class' relational statics are declared `public static boolean` in Precise.java;
    // the String-returning statics and a same-named method elsewhere keep the helper
    const conditionOf = (classBody: string, body: string, signature = 'test(a: any, b: any): void') => {
        const input =
        "class Precise {\n" +
        classBody +
        "}\n" +
        "class T {\n" +
        "    " + signature + " {\n" +
        body +
        "    }\n" +
        "}\n"
        return transpiler.transpileJava(input).content;
    };
    const boolStatics =
        "    static stringEq (a: any, b: any): boolean { return false; }\n" +
        "    static stringEquals (a: any, b: any): boolean { return false; }\n" +
        "    static stringGt (a: any, b: any): boolean { return false; }\n" +
        "    static stringGe (a: any, b: any): boolean { return false; }\n" +
        "    static stringLt (a: any, b: any): boolean { return false; }\n" +
        "    static stringLe (a: any, b: any): boolean { return false; }\n";

    test('a relational Precise static condition prints without the wrapper', () => {
        const output = conditionOf(boolStatics, "        if (Precise.stringLt(a, b)) { return; }\n");
        expect(output).toContain("if (Precise.stringLt(a, b))");
        expect(output).not.toContain("Helpers.isTrue(");
    });

    test('every relational static is unwrapped, parenthesised and negated too', () => {
        for (const name of ['stringEq', 'stringEquals', 'stringGt', 'stringGe', 'stringLt', 'stringLe']) {
            const plain = conditionOf(boolStatics, `        if (Precise.${name}(a, b)) { return; }\n`);
            expect(plain).toContain(`if (Precise.${name}(a, b))`);
            const negated = conditionOf(boolStatics, `        if (!Precise.${name}(a, b)) { return; }\n`);
            expect(negated).toContain(`if (!Precise.${name}(a, b))`);
            const parenthesised = conditionOf(boolStatics, `        if ((Precise.${name}(a, b))) { return; }\n`);
            expect(parenthesised).not.toContain("Helpers.isTrue(");
        }
    });

    test('while and ternary conditions drop the wrapper as well', () => {
        const loop = conditionOf(boolStatics, "        while (Precise.stringGe(a, b)) { a = 1; }\n");
        expect(loop).toContain("while (Precise.stringGe(a, b))");
        const ternary = conditionOf(boolStatics, "        return Precise.stringEquals(a, b) ? \"y\" : \"n\";\n", 'test(a: any, b: any): string');
        expect(ternary).toContain("(Precise.stringEquals(a, b))");
        expect(ternary).not.toContain("Helpers.isTrue(");
    });

    test('a Precise call inside a logical expression is unwrapped on its own', () => {
        const output = conditionOf(boolStatics, "        if (a && Precise.stringEq(a, b)) { return; }\n", 'test(a: string, b: any): void');
        // the non-boolean `a` operand keeps its isTrue; the Precise call does not
        expect(output).toContain("Helpers.isTrue(a) && Precise.stringEq(a, b)");
        expect(output).not.toContain("Helpers.isTrue(Precise");
    });

    test('a negated Precise call is boolean as well (real okx shape)', () => {
        const output = conditionOf(boolStatics, "        if ((a !== null) && (!Precise.stringEq(a, \"0\"))) { return; }\n");
        expect(output).toContain('&& (!Precise.stringEq(a, "0"))');
        expect(output).not.toContain("Helpers.isTrue(Precise");
    });

    test('non-boolean Precise statics and unproven receivers keep the helper', () => {
        const stringStatic =
            "    static stringAdd (a: any, b: any): string { return \"\"; }\n" +
            "    static stringLt (a: any, b: any): boolean | undefined { return undefined; }\n";
        expect(conditionOf(stringStatic, "        if (Precise.stringAdd(a, b)) { return; }\n"))
            .toContain("if (Helpers.isTrue(Precise.stringAdd(a, b)))");
        // `boolean | undefined` is not proven boolean - the union keeps the runtime truthiness test
        expect(conditionOf(stringStatic, "        if (Precise.stringLt(a, b)) { return; }\n"))
            .toContain("Helpers.isTrue(Precise.stringLt(a, b))");
        // another class with the same static name is not the base Precise
        const otherClass =
            "class Other {\n" +
            "    static stringLt (a: any, b: any): boolean { return false; }\n" +
            "}\n";
        const output = transpiler.transpileJava(otherClass + "class T {\n    test(a: any, b: any): void {\n        if (Other.stringLt(a, b)) { return; }\n    }\n}\n").content;
        expect(output).toContain("Helpers.isTrue(Other.stringLt(a, b))");
        // an unresolved `Precise` prints the same text but proves nothing
        const unresolved = transpiler.transpileJava("class T {\n    test(a: any, b: any): void {\n        if (Precise.stringLt(a, b)) { return; }\n    }\n}\n").content;
        expect(unresolved).toContain("Helpers.isTrue(Precise.stringLt(a, b))");
    });
});

describe('java boolean-returning `this.<name>(...)` conditions drop the Helpers.isTrue wrapper', () => {
    // the Java base declares these methods with a concrete boolean return (BaseExchange.java,
    // above the transpile delimiter), so the condition wrapper only re-tests the boolean the
    // printed call already produced
    const inputOf = (body: string) => `
class T {
    inArray(elem: any, list: any): boolean { return true; }
    isArray(a: any): boolean { return true; }
    isEmpty(a: any): boolean { return true; }
    valueIsDefined(value: any): value is Object { return true; }
    isBinaryMessage(msg: any) { return msg instanceof Uint8Array; }
    safeBool(d: any, k: any, defaultValue: boolean | undefined = undefined): boolean | undefined { return true; }
    safeBool2(d: any, k1: any, k2: any, defaultValue: boolean | undefined = undefined): boolean | undefined { return true; }
    other(x: any): any { return x; }
    test(x: any, y: any): void {
${body}
    }
}
`;

    const conditionOf = (body: string) => transpiler.transpileJava(inputOf(body)).content;

    test('primitive-boolean base calls print bare', () => {
        expect(conditionOf('if (this.inArray(x, [])) { return; }'))
            .toContain('if (this.inArray(x, new java.util.ArrayList<Object>(java.util.Arrays.asList())))');
        expect(conditionOf('if (this.isEmpty(x)) { return; }')).toContain('if (this.isEmpty(x))');
        expect(conditionOf('if (this.isArray(x)) { return; }')).toContain('if (this.isArray(x))');
        // a type predicate and an inferred return are both a plain boolean to the checker
        expect(conditionOf('if (this.valueIsDefined(x)) { return; }')).toContain('if (this.valueIsDefined(x))');
        expect(conditionOf('if (this.isBinaryMessage(x)) { return; }')).toContain('if (this.isBinaryMessage(x))');
        expect(conditionOf('if (this.inArray(x, [])) { return; }')).not.toContain('Helpers.isTrue(this.');
    });

    test('negated, logical and value-context calls stay native', () => {
        const negated = conditionOf('if (!this.isEmpty(x) && this.inArray(x, [])) { return; }');
        expect(negated).toContain('if (!this.isEmpty(x) && this.inArray(x,');
        expect(negated).not.toContain('Helpers.isTrue(this.');
        // the && operands of a value expression print through printCondition too
        const value = conditionOf('const z = this.isEmpty(x) && !this.inArray(x, []);');
        expect(value).toContain('Object z = this.isEmpty(x) && !this.inArray(x,');
        expect(value).not.toContain('Helpers.isTrue(this.');
    });

    test('safeBool boxes print Boolean.TRUE.equals', () => {
        expect(conditionOf("if (this.safeBool(x, 'k', false)) { return; }"))
            .toContain('if (Boolean.TRUE.equals(this.safeBool(x, "k", false)))');
        expect(conditionOf("if (this.safeBool2(x, 'a', 'b', true)) { return; }"))
            .toContain('if (Boolean.TRUE.equals(this.safeBool2(x, "a", "b", true)))');
        // absent default: the accessor hands back null, which is what TRUE.equals tests
        expect(conditionOf("if (this.safeBool(x, 'k')) { return; }"))
            .toContain('if (Boolean.TRUE.equals(this.safeBool(x, "k")))');
        expect(conditionOf("if (this.safeBool(x, 'k', false)) { return; }")).not.toContain('Helpers.isTrue(this.');
    });

    test('an unprovable default argument keeps the wrapper', () => {
        // safeBool hands the caller's default back untouched when the found value is not a
        // Boolean, so anything but a boolean/nullish literal keeps the box arbitrary
        expect(conditionOf("if (this.safeBool(x, 'k', y)) { return; }"))
            .toContain('if (Helpers.isTrue(this.safeBool(x, "k", y)))');
    });

    test('non-boolean and unresolvable callees keep the wrapper', () => {
        expect(conditionOf('if (this.other(x)) { return; }')).toContain('if (Helpers.isTrue(this.other(x)))');
        // a name the checker cannot resolve prints the dynamic-call wrapper, whose return is Object
        expect(conditionOf('if (this.unknownBaseCall(x)) { return; }'))
            .toContain('Helpers.isTrue(Helpers.callDynamically(this, "unknownBaseCall"');
    });
});

describe('java nullable-boolean locals (Bool) drop the Helpers.isTrue wrapper (b14)', () => {
    // a `let x: boolean | undefined` local whose every write is a Java boolean value or a
    // proven Boolean-or-null box prints `Boolean.TRUE.equals(x)`: on such a box that is
    // exactly the helper's answer (null/FALSE test false, TRUE tests true)
    const inputOf = (body: string) => `
class T {
    safeBool(d: any, k: any, defaultValue: boolean | undefined = undefined): boolean | undefined { return true; }
    safeBoolN(d: any, k: any): boolean | undefined { return true; }
    handleParamBool(params: object, name: string, defaultValue: boolean | undefined = undefined): [boolean | undefined, object] { return [ undefined, params ]; }
    handleOptionAndParams(params: object, name: string, option: string, defaultValue: any = undefined): [any, object] { return [ undefined, params ]; }
    safeString(d: any, k: any, defaultValue: any = undefined): string | undefined { return undefined; }
    other(x: any): any { return x; }
    test(params: object): void {
${body}
    }
}
`;
    const outputOf = (body: string) => transpiler.transpileJava(inputOf(body)).content;

    test('a nullable local written only booleans prints Boolean.TRUE.equals', () => {
        const output = outputOf("let x: boolean | undefined = undefined;\n        x = false;\n        if (x) { return; }");
        expect(output).toContain('if (Boolean.TRUE.equals(x))');
        expect(output).not.toContain('Helpers.isTrue(x)');
    });

    test('a safeBool-family initializer is a Boolean-or-null box', () => {
        expect(outputOf("let x: boolean | undefined = this.safeBool(params, 'x');\n        if (x) { return; }"))
            .toContain('if (Boolean.TRUE.equals(x))');
        expect(outputOf("let x: boolean | undefined = this.safeBoolN(params, 'x');\n        if (x) { return; }"))
            .toContain('if (Boolean.TRUE.equals(x))');
    });

    test('a handle*Bool tuple element is a Boolean-or-null box', () => {
        const output = outputOf("let x: boolean | undefined = undefined;\n        [ x, params ] = this.handleParamBool(params, 'x', false);\n        if (x) { return; }");
        expect(output).toContain('if (Boolean.TRUE.equals(x))');
        expect(output).not.toContain('Helpers.isTrue(x)');
    });

    test('a handleOptionAndParams element keeps the helper (raw dictionary member)', () => {
        // handleOptionAndParams returns the raw param value, so the box may be a Long/String
        // the helper tests with its runtime truthiness
        const output = outputOf("let x: boolean | undefined = undefined;\n        [ x, params ] = this.handleOptionAndParams(params, 'm', 'x', false);\n        if (x) { return; }");
        expect(output).toContain('if (Helpers.isTrue(x))');
    });

    test('non-boolean writes keep the helper', () => {
        expect(outputOf("let x: boolean | undefined = undefined;\n        x = this.safeString(params, 'k');\n        if (x) { return; }"))
            .toContain('if (Helpers.isTrue(x))');
        expect(outputOf("let x: boolean | undefined = this.other(params);\n        if (x) { return; }"))
            .toContain('if (Helpers.isTrue(x))');
        // an await write resolves to a box the printer cannot prove boolean
        expect(outputOf("let x: boolean | undefined = undefined;\n        x = await this.other(params);\n        if (x) { return; }").replace(/\s+/g, ' '))
            .toContain('Helpers.isTrue(x)');
    });

    test('the declared local type from the ccxt chain is consumed', () => {
        // javaDeclaredLocalTypeResolver is installed by build/java-local-types.js: `Boolean`
        // prints the nullable box, `boolean` the primitive the condition already is
        const printer: any = (transpiler as any).javaTranspiler;
        const original = printer.javaDeclaredLocalTypeResolver;
        try {
            printer.javaDeclaredLocalTypeResolver = (declaration: any) => {
                const name = declaration?.name?.escapedText;
                if (name === 'boxed') { return 'Boolean'; }
                if (name === 'primitive') { return 'boolean'; }
                return undefined;
            };
            const body = "let boxed: boolean | undefined = undefined;\n        if (boxed) { return; }\n        let primitive = false;\n        if (primitive) { return; }";
            const output = transpiler.transpileJava(inputOf(body)).content;
            expect(output).toContain('if (Boolean.TRUE.equals(boxed))');
            expect(output).toContain('if (primitive)');
            expect(output).not.toContain('Helpers.isTrue(boxed)');
            expect(output).not.toContain('Helpers.isTrue(primitive)');
        } finally {
            printer.javaDeclaredLocalTypeResolver = original;
        }
    });
});

describe('java boolean-returning generated methods: isTrue -> Boolean.TRUE.equals (b14)', () => {
    // a `this.<name>(...)` whose resolved body returns a boolean value on every path hands back
    // a Boolean-or-null box, so the wrapper becomes the null-safe TRUE test - the same proof the
    // hand-written base table (JAVA_THIS_BOOLEAN_METHODS) gives its own methods
    const inputOf = (body: string, methods = '') => `
class T {
    isBool(): boolean { return true; }
    isCompared(a: any): boolean { return (a === 1) || !!(a > 2); }
    isFromLocal(a: any): boolean { return a; }
    isFromString(a: any): string { return ''; }
    isNullable(a: any): boolean | undefined { return undefined; }
${methods}
    test(a: any): void {
${body}
    }
}
`;
    const outputOf = (body: string, methods = '') => transpiler.transpileJava(inputOf(body, methods)).content;

    test('a method whose body returns booleans prints Boolean.TRUE.equals', () => {
        const output = outputOf('if (this.isBool()) { return; }');
        expect(output).toContain('if (Boolean.TRUE.equals(this.isBool()))');
        expect(output).not.toContain('Helpers.isTrue(this.isBool())');
        expect(outputOf('if (this.isCompared(a)) { return; }'))
            .toContain('if (Boolean.TRUE.equals(this.isCompared(a)))');
        expect(outputOf('if (!this.isBool()) { return; }')).toContain('if (!Boolean.TRUE.equals(this.isBool()))');
    });

    test('a body returning an unproven value keeps the helper', () => {
        // a local of unproven box (a parameter here) could hold a Long/String the helper tests
        expect(outputOf('if (this.isFromLocal(a)) { return; }'))
            .toContain('Helpers.isTrue(this.isFromLocal(a))');
        // a non-boolean TS return type
        expect(outputOf('if (this.isFromString(a)) { return; }'))
            .toContain('Helpers.isTrue(this.isFromString(a))');
    });

    test('a foreign class receiver keeps the helper', () => {
        expect(outputOf('if (Other.isBool()) { return; }').replace(/\s+/g, ' '))
            .toContain('Helpers.isTrue(');
    });
});

describe('java isTrue: locals bound to boolean-returning calls / awaits (d13)', () => {
    // the box of a local is proven from every write: a `this.<name>(...)` whose resolved body
    // returns a boolean value on every path, the awaited value of such an async method, both
    // branches of a `cond ? a : b`, and a hand-written relational Precise static
    const inputOf = (body: string) => `
class T {
    isBool(): boolean { return true; }
    isCompared(a: any): boolean { return (a === 1) || !!(a > 2); }
    isFromLocal(a: any): boolean { return a; }
    isFromString(a: any): string { return ''; }
    async isBoolAsync(): Promise<boolean> { return this.isBool(); }
    async isFromStringAsync(a: any): Promise<string> { return ''; }
    handleOptionAndParams(p: any, m: string, k: string, d: any = undefined): [any, any] { return [ d, p ]; }
    handleParamBool(p: any, k: string, d: any = undefined): [any, any] { return [ d, p ]; }
    test(x: any, params: any): void {
${body}
    }
}
`;
    const outputOf = (body: string) => transpiler.transpileJava(inputOf(body)).content;

    test('a call whose body returns booleans on every path proves the bound local', () => {
        const output = outputOf("        const aggressive = this.isBool();\n        if (aggressive) { return; }\n");
        expect(output).toContain('if (Boolean.TRUE.equals(aggressive))');
        expect(output).not.toContain('Helpers.isTrue(aggressive)');
        const compared = outputOf("        const ok = this.isCompared(x);\n        if (!ok) { return; }\n");
        expect(compared).toContain('if (!Boolean.TRUE.equals(ok))');
        // a body returning an unproven value (a bare parameter) keeps the helper
        expect(outputOf("        const box = this.isFromLocal(x);\n        if (box) { return; }\n"))
            .toContain('if (Helpers.isTrue(box))');
        // a non-boolean TS return type keeps the helper
        expect(outputOf("        const box = this.isFromString(x);\n        if (box) { return; }\n"))
            .toContain('if (Helpers.isTrue(box))');
    });

    test('an await-written local keeps the helper (no sound sites today)', () => {
        // audited: every `Helpers.isTrue(x)` site whose x is written from `await this.<m>()`
        // also carries a `[ x, params ] = this.handleOptionAndParams(...)` raw-member write
        // (35 whole-tree), so the awaited-box proof has no sound site at this base
        const output = outputOf("        let uta: boolean | undefined = undefined;\n"
            + "        uta = await this.isBoolAsync();\n        if (uta) { return; }\n");
        expect(output).toContain('if (Helpers.isTrue(uta))');
        expect(outputOf("        let uta: boolean | undefined = undefined;\n"
            + "        uta = await this.isFromStringAsync(x);\n        if (uta) { return; }\n"))
            .toContain('if (Helpers.isTrue(uta))');
    });

    test('a conditional whose branches both print boolean values proves the local', () => {
        const output = outputOf("        const deduction = this.isFromString(x) === '' ? true : false;\n"
            + "        if (deduction) { return; }\n");
        expect(output).toContain('if (Boolean.TRUE.equals(deduction))');
        expect(output).not.toContain('Helpers.isTrue(deduction)');
        // a non-boolean branch keeps the helper
        expect(outputOf("        const box = this.isBool() ? 1 : 0;\n        if (box) { return; }\n"))
            .toContain('if (Helpers.isTrue(box))');
    });

    test('a relational Precise static bound to a local proves it', () => {
        const input = `
class Precise {
    static stringLt (a: any, b: any): boolean { return false; }
}
class T {
    test(a: any): void {
        const isAmountNeg = Precise.stringLt(a, "0");
        if (isAmountNeg) { return; }
    }
}
`;
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain('if (Boolean.TRUE.equals(isAmountNeg))');
        expect(output).not.toContain('Helpers.isTrue(isAmountNeg)');
    });

    test('a parameter the printer declares Boolean prints Boolean.TRUE.equals (d13)', () => {
        const printer: any = (transpiler as any).javaTranspiler;
        const original = printer.javaNativeParameterType;
        try {
            printer.javaNativeParameterType = (node: any) => {
                const name = node?.name?.escapedText;
                if (name === 'trigger') { return 'Boolean'; }
                if (name === 'enabled') { return 'boolean'; }
                if (name === 'parameters') { return 'java.util.Map<String, Object>'; }
                return original.call(printer, node);
            };
            const input = `
class T {
    test(trigger: any, enabled: any, parameters: any, x: any): void {
        if (trigger) { return; }
        if (!trigger) { return; }
        if (enabled) { return; }
        if ('k' in parameters) { return; }
        if (x) { return; }
    }
}
`;
            const output = transpiler.transpileJava(input).content;
            expect(output).toContain('if (Boolean.TRUE.equals(trigger))');
            expect(output).toContain('if (!Boolean.TRUE.equals(trigger))');
            expect(output).toContain('if (enabled)');
            expect(output).toContain('parameters.containsKey("k")');
            expect(output).toContain('if (Helpers.isTrue(x))');
        } finally {
            printer.javaNativeParameterType = original;
        }
    });
});

describe('java native equality (Helpers.isEqual -> Objects.equals)', () => {
    test('string operands compare with java.util.Objects.equals, negation keeps the !', () => {
        const input =
        "function f (x: string, s: string | undefined, o: any) {\n" +
        "    const a = x === 'delivery';\n" +
        "    const b = x !== 'delivery';\n" +
        "    const c = s === x;\n" +
        "    const d = o === 'delivery';\n" +
        "    const e = o !== 'delivery';\n" +
        "    return [ a, b, c, d, e ];\n" +
        "}\n"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain('java.util.Objects.equals(x, "delivery")');
        expect(output).toContain('!java.util.Objects.equals(x, "delivery")');
        // string | undefined folds into the string family
        expect(output).toContain("java.util.Objects.equals(s, x)");
        // an untyped operand still compares natively once the other side is a string
        expect(output).toContain('java.util.Objects.equals(o, "delivery")');
        expect(output).toContain('!java.util.Objects.equals(o, "delivery")');
        expect(output).not.toContain("Helpers.isEqual");
    });

    test('undefined/null literals compare natively against any operand type', () => {
        const input =
        "function f (o: any, n: number) {\n" +
        "    const a = o === undefined;\n" +
        "    const b = o !== undefined;\n" +
        "    const c = n === undefined;\n" +
        "    const d = o === null;\n" +
        "    return [ a, b, c, d ];\n" +
        "}\n"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("java.util.Objects.equals(o, null)");
        expect(output).toContain("!java.util.Objects.equals(o, null)");
        expect(output).toContain("java.util.Objects.equals(n, null)");
        expect(output).not.toContain("Helpers.isEqual");
    });

    test('boolean operands compare natively', () => {
        const input =
        "function f (b: boolean, o: any) {\n" +
        "    const a = b === true;\n" +
        "    const c = o === true;\n" +
        "    const d = b !== o;\n" +
        "    return [ a, c, d ];\n" +
        "}\n"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("java.util.Objects.equals(b, true)");
        expect(output).toContain("java.util.Objects.equals(o, true)");
        expect(output).toContain("!java.util.Objects.equals(b, o)");
        expect(output).not.toContain("Helpers.isEqual");
    });

    test('numeric and unproven pairs keep Helpers.isEqual', () => {
        const input =
        "function f (n: number, o: any) {\n" +
        "    const a = n === 1;\n" +
        "    const b = n === n;\n" +
        "    const e = o === o;\n" +
        "    const g = 1 === 2;\n" +
        "    return [ a, b, e, g ];\n" +
        "}\n"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("Helpers.isEqual(n, 1)");
        expect(output).toContain("Helpers.isEqual(n, n)");
        expect(output).toContain("Helpers.isEqual(o, o)");
        // two int literals print two Java primitives, so the constant pair is native (java-15)
        expect(output).toContain("(1 == 2)");
        expect(output).not.toContain("java.util.Objects.equals");
    });
});

describe('java numeric equality (Helpers.isEqual -> native compare, java-15)', () => {
    // Helpers.isEqual compares two numeric operands by value, so a pair whose printed Java
    // operands are primitives of one numeric kind prints the native operator, and a pair of
    // equal-kind boxes prints Objects.equals (whose class the kind pins down).
    test('a checker-proven string/List length compares with the native operator', () => {
        const input =
        "function f (s: string, xs: number[]) {\n" +
        "    const a = s.length === 0;\n" +
        "    const b = xs.length === 1;\n" +
        "    const c = xs.length !== 2;\n" +
        "    return [ a, b, c ];\n" +
        "}\n"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("(((String)s).length() == 0)");
        expect(output).toContain("(((java.util.List<?>)xs).size() == 1)");
        expect(output).toContain("(((java.util.List<?>)xs).size() != 2)");
        expect(output).not.toContain("Helpers.isEqual");
    });

    test('a length-typed local compares with Objects.equals (its box is an Integer)', () => {
        const input =
        "function f (xs: number[]) {\n" +
        "    const n = xs.length;\n" +
        "    return n === 0;\n" +
        "}\n"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("Object n = ((java.util.List<?>)xs).size();");
        expect(output).toContain("java.util.Objects.equals(n, 0)");
        expect(output).not.toContain("Helpers.isEqual");
    });

    test('a local re-assigned a different numeric kind keeps the helper (D2 scan)', () => {
        const input =
        "function f (xs: number[]) {\n" +
        "    let n = xs.length;\n" +
        "    if (n === 0) { n = 0.5; }\n" +
        "    return n === 0;\n" +
        "}\n"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("Helpers.isEqual(n, 0)");
    });

    test('a local re-assigned the same kind still compares natively', () => {
        const input =
        "function f (xs: number[], ys: number[]) {\n" +
        "    let n = xs.length;\n" +
        "    n = ys.length;\n" +
        "    return n === 0;\n" +
        "}\n"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("java.util.Objects.equals(n, 0)");
    });

    test('a for-loop counter compares with the native operator', () => {
        const input =
        "function f (xs: number[]) {\n" +
        "    for (let i = 0; i < xs.length; i++) {\n" +
        "        if (i === 0) { return i; }\n" +
        "    }\n" +
        "    return 0;\n" +
        "}\n"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("(i == 0)");
        expect(output).not.toContain("Helpers.isEqual");
    });

    test('a boxed double keeps the helper (-0.0/0.0), a literal pair compares natively', () => {
        const input =
        "function f (xs: number[]) {\n" +
        "    const rate = 0.5;\n" +
        "    const n = xs.length;\n" +
        "    const a = rate === 0.5;\n" +
        "    const b = 1.5 === 0.5;\n" +
        "    const c = n === 0.5;\n" +
        "    return [ a, b, c ];\n" +
        "}\n"
        const output = transpiler.transpileJava(input).content;
        // Double.equals separates -0.0 from 0.0 while the helper's toDouble compare does not
        expect(output).toContain("Helpers.isEqual(rate, 0.5)");
        expect(output).toContain("(1.5 == 0.5)");
        // a mixed int/double pair keeps the helper (the box classes differ)
        expect(output).toContain("Helpers.isEqual(n, 0.5)");
    });

    test('operands the checker does not prove a plain number keep the helper', () => {
        const input =
        "function f (xs: number[], o: any, n: number | undefined) {\n" +
        "    const d: Dict = { 'k': xs.length };\n" +
        "    const a = xs['length'] === 0;\n" +
        "    const b = o === 0;\n" +
        "    const c = n === 0;\n" +
        "    const e = (xs as any).length === 0;\n" +
        "    return [ d, a, b, c, e ];\n" +
        "}\n"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("Helpers.isEqual(o, 0)");
        expect(output).toContain("Helpers.isEqual(n, 0)");
        expect(output).not.toContain("Helpers.isEqual(xs, 0)");
    });
});

describe('checker-typed element access: Helpers.GetValue -> native Map/List access', () => {
    // the Java runtime holds every dict-shaped value as a Map<String, Object> (raw HashMap or a
    // types.TypedMap view) and every tuple as List<Object>, so a read the checker proves to be a
    // dict/tuple with a literal key prints the native accessor instead of the helper. `any`,
    // unions, strings, nullable values, non-tuple arrays and non-literal keys keep the helper.
    test('dict-typed container with a string literal key goes native', () => {
        const input =
        "type D = { [key: string]: any };\n" +
        "class T {\n" +
        "    test(d: D): void {\n" +
        "        const a = d['k'];\n" +
        "        const b = d['price'];\n" +
        "        this.something(a, b);\n" +
        "    }\n" +
        "    something(...args: any[]): void {}\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain('((java.util.Map<String, Object>)d).get("k")');
        expect(output).toContain('((java.util.Map<String, Object>)d).get("price")');
        expect(output).not.toContain('Helpers.GetValue(d,');
    });

    test('non-literal keys keep the helper', () => {
        const input =
        "type D = { [key: string]: any };\n" +
        "class T {\n" +
        "    test(d: D, k: string): void {\n" +
        "        const a = d[k];\n" +
        "        this.something(a);\n" +
        "    }\n" +
        "    something(...args: any[]): void {}\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("Helpers.GetValue(d, k)");
        expect(output).not.toContain("((java.util.Map<String, Object>)d).get(k)");
    });

    test('any-typed containers keep the helper (nothing is proven)', () => {
        const input =
        "class T {\n" +
        "    test(p: any): void {\n" +
        "        const a = p['k'];\n" +
        "        const b = p[0];\n" +
        "        this.something(a, b);\n" +
        "    }\n" +
        "    something(...args: any[]): void {}\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain('Helpers.GetValue(p, "k")');
        expect(output).toContain("Helpers.GetValue(p, 0)");
    });

    test('string containers keep the helper (index access yields a char)', () => {
        const input =
        "class T {\n" +
        "    test(s: string): void {\n" +
        "        const a = s['abc'];\n" +
        "        this.something(a);\n" +
        "    }\n" +
        "    something(...args: any[]): void {}\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain('Helpers.GetValue(s, "abc")');
    });

    test('nullable containers keep the helper (a null container must stay null)', () => {
        const input =
        "type D = { [key: string]: any };\n" +
        "class T {\n" +
        "    test(d: D | undefined): void {\n" +
        "        const a = d['k'];\n" +
        "        this.something(a);\n" +
        "    }\n" +
        "    something(...args: any[]): void {}\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain('Helpers.GetValue(d, "k")');
    });

    test('tuple reads go native inside the required elements and keep the helper outside', () => {
        const input =
        "type D = { [key: string]: any };\n" +
        "class T {\n" +
        "    test(tup: [any, D]): void {\n" +
        "        const a = tup[1];\n" +
        "        const b = tup[4];\n" +
        "        this.something(a, b);\n" +
        "    }\n" +
        "    something(...args: any[]): void {}\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("((java.util.List<Object>)tup).get(1)");
        expect(output).toContain("Helpers.GetValue(tup, 4)");
    });

    test('non-tuple array reads go native behind the null / off-range guard', () => {
        const input =
        "class T {\n" +
        "    test(arr: number[], symbols: string[]): void {\n" +
        "        const a = arr[0];\n" +
        "        const b = symbols[1];\n" +
        "        this.something(a, b);\n" +
        "    }\n" +
        "    something(...args: any[]): void {}\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("(arr == null || 0 >= ((java.util.List<?>)arr).size() ? null : ((java.util.List<?>)arr).get(0))");
        expect(output).toContain("(symbols == null || 1 >= ((java.util.List<?>)symbols).size() ? null : ((java.util.List<?>)symbols).get(1))");
        expect(output).not.toContain("Helpers.GetValue(arr, 0)");
        expect(output).not.toContain("Helpers.GetValue(symbols, 1)");
    });

    test('the guard keeps both helper outcomes: a null receiver and an off-range index still yield null', () => {
        const input =
        "class T {\n" +
        "    test(arr: number[]): void {\n" +
        "        const a = arr[0];\n" +
        "        this.something(a);\n" +
        "    }\n" +
        "    something(...args: any[]): void {}\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        // a bare get() throws on both paths the helper turns into null
        expect(output).not.toContain("(arr).get(0)");
        expect(output).toContain("arr == null");
        expect(output).toContain("((java.util.List<?>)arr).size()");
    });

    test('a receiver with side effects keeps the helper (single evaluation)', () => {
        const input =
        "class T {\n" +
        "    test(): void {\n" +
        "        const a = this.list()[0];\n" +
        "        this.something(a);\n" +
        "    }\n" +
        "    list(): number[] {\n" +
        "        return [];\n" +
        "    }\n" +
        "    something(...args: any[]): void {}\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("Helpers.GetValue(this.list(), 0)");
    });

    test('a split-produced receiver keeps the helper (the ccxt post-pass types the local from it)', () => {
        const input =
        "class T {\n" +
        "    test(name: string): void {\n" +
        "        const parts = name.split('.');\n" +
        "        const root = parts[0];\n" +
        "        this.something(root);\n" +
        "    }\n" +
        "    something(...args: any[]): void {}\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("Helpers.GetValue(parts, 0)");
    });

    test('a non-literal index on a proven array keeps the helper', () => {
        const input =
        "class T {\n" +
        "    test(arr: number[], i: number): void {\n" +
        "        const a = arr[i];\n" +
        "        this.something(a);\n" +
        "    }\n" +
        "    something(...args: any[]): void {}\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("Helpers.GetValue(arr, i)");
    });

    test('the out-of-range tuple index still keeps the helper', () => {
        const input =
        "type D = { [key: string]: any };\n" +
        "class T {\n" +
        "    test(tup: [any, D]): void {\n" +
        "        const b = tup[4];\n" +
        "        this.something(b);\n" +
        "    }\n" +
        "    something(...args: any[]): void {}\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("Helpers.GetValue(tup, 4)");
    });

    test('element writes keep the base emission (only reads go native)', () => {
        const input =
        "type D = { [key: string]: any };\n" +
        "class T {\n" +
        "    test(d: D, arr: number[]): void {\n" +
        "        d['x'] = 1;\n" +
        "        d['x'] += 1;\n" +
        "        arr[0] = 5;\n" +
        "        this.something(d, arr);\n" +
        "    }\n" +
        "    something(...args: any[]): void {}\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        // d6: a string-literal write into a checker-proven dictionary is a native Map.put
        expect(output).toContain('((java.util.Map<String, Object>)d).put("x", 1)');
        expect(output).not.toContain('Helpers.addElementToObject(d, "x"');
        // the array target keeps the helper (index append-at-size is not provable)
        expect(output).toContain("Helpers.addElementToObject(arr, 0, 5)");
        expect(output).toContain('((java.util.HashMap<String, Object>)d).get("x") = Helpers.add(');
    });

    test('comparison operators are reads, not writes (regression: !== is not an assignment)', () => {
        const input =
        "type D = { [key: string]: any };\n" +
        "class T {\n" +
        "    test(d: D): void {\n" +
        "        if (d['k'] !== undefined && d['k'] !== false) {\n" +
        "            this.something(d);\n" +
        "        }\n" +
        "    }\n" +
        "    something(...args: any[]): void {}\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        // both the read (d3) and the comparison on literal operands (d2) are native now; the
        // comparison must stay a comparison - nothing here is a write
        expect(output).toContain('!java.util.Objects.equals(((java.util.Map<String, Object>)d).get("k"), null)');
        expect(output).not.toContain('.put(');
        expect(output).not.toContain('!Helpers.isEqual(Helpers.GetValue(d, "k"), null)');
    });
});

describe('hand-written base map fields: Helpers.GetValue(this.<field>, k) -> native map read', () => {
    // `this.ohlcvs / balance / orderbooks / options / markets` are fields of the hand-written
    // BaseExchange.java whose every value is a java.util.Map (JAVA_FIELD_TYPES), so a read with
    // any key prints the native accessor. A field that can be null keeps the helper's null
    // answer behind a receiver guard, and a key that is not provably a String gets the same
    // guard: the helper answers null for a null key, ConcurrentHashMap.get throws.
    const fields =
        "type D = { [key: string]: any };\n" +
        "class T {\n" +
        "    ohlcvs: D = {};\n" +
        "    orderbooks: D = {};\n" +
        "    balance: any = {};\n" +
        "    options: D = {};\n" +
        "    markets: D | undefined = undefined;\n" +
        "    other: any = {};\n";

    test('a never-null field reads natively with no guard', () => {
        const input = fields +
        "    test(symbol: string): void {\n" +
        "        const a = this.ohlcvs[symbol];\n" +
        "        const b = this.orderbooks[symbol];\n" +
        "        this.something(a, b);\n" +
        "    }\n" +
        "    something(...args: any[]): void {}\n" +
        "}";
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("((java.util.Map<?, ?>)this.ohlcvs).get(symbol)");
        expect(output).toContain("((java.util.Map<?, ?>)this.orderbooks).get(symbol)");
        expect(output).not.toContain("Helpers.GetValue(this.ohlcvs,");
        expect(output).not.toContain("Helpers.GetValue(this.orderbooks,");
    });

    test('a field that can be null keeps the helper answer behind a receiver guard', () => {
        const input = fields +
        "    test(symbol: string, k: any): void {\n" +
        "        const a = this.balance[symbol];\n" +
        "        const b = this.options[symbol];\n" +
        "        const c = this.markets[k];\n" +
        "        this.something(a, b, c);\n" +
        "    }\n" +
        "    something(...args: any[]): void {}\n" +
        "}";
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("(this.balance == null ? null : ((java.util.Map<?, ?>)this.balance).get(symbol))");
        expect(output).toContain("(this.options == null ? null : ((java.util.Map<?, ?>)this.options).get(symbol))");
        // `k` is not provably a String, so that read carries both guards
        expect(output).toContain("(k == null ? null : this.markets == null ? null : ((java.util.Map<?, ?>)this.markets).get(k))");
        expect(output).not.toContain("Helpers.GetValue(this.balance,");
        expect(output).not.toContain("Helpers.GetValue(this.markets,");
    });

    test('a non-repeatable key keeps the helper (the guard would run it twice)', () => {
        const input = fields +
        "    test(): void {\n" +
        "        const a = this.ohlcvs[this.key()];\n" +
        "        this.something(a);\n" +
        "    }\n" +
        "    key(): any {\n" +
        "        return 'k';\n" +
        "    }\n" +
        "    something(...args: any[]): void {}\n" +
        "}";
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("Helpers.GetValue(this.ohlcvs, this.key())");
    });

    test('a receiver that is not a table field keeps the helper', () => {
        const input = fields +
        "    test(symbol: string): void {\n" +
        "        const a = this.other[symbol];\n" +
        "        this.something(a);\n" +
        "    }\n" +
        "    something(...args: any[]): void {}\n" +
        "}";
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("Helpers.GetValue(this.other, symbol)");
    });

    test('a literal key on a field the checker does not type still reads natively', () => {
        const input = fields +
        "    test(): void {\n" +
        "        const a = this.balance['cash'];\n" +
        "        this.something(a);\n" +
        "    }\n" +
        "    something(...args: any[]): void {}\n" +
        "}";
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("(this.balance == null ? null : ((java.util.Map<?, ?>)this.balance).get(\"cash\"))");
        expect(output).not.toContain("Helpers.GetValue(this.balance,");
    });

    test('the bottom read of a chained write goes native, the steps above it keep the helper', () => {
        const input = fields +
        "    test(symbol: string, timeframe: string, stored: any): void {\n" +
        "        this.ohlcvs[symbol][timeframe] = stored;\n" +
        "    }\n" +
        "}";
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("Helpers.addElementToObject(((java.util.Map<?, ?>)this.ohlcvs).get(symbol), timeframe, stored)");
        expect(output).not.toContain("GetValue(this.ohlcvs,");
    });
});

describe('declared-map element reads: Helpers.GetValue(x, "lit") -> x.get("lit")', () => {
    // the checker-typed rule above needs a dict-shaped TS type. The local-typing passes
    // (build/java-local-types.js) retype declarations the checker leaves boxed, and they
    // hand the emitted declaration type to the printer; a read of such a local prints the
    // accessor with no cast, because the declaration already carries the type. Without a
    // consumer the resolver is absent and every read keeps the helper byte-identically.
    const MAP_TYPE = 'java.util.Map<String, Object>';
    const withResolver = (resolver: any, body: () => void) => {
        const printer: any = (transpiler as any).javaTranspiler;
        const previous = printer.javaDeclaredLocalTypeResolver;
        printer.javaDeclaredLocalTypeResolver = resolver;
        try {
            body();
        } finally {
            printer.javaDeclaredLocalTypeResolver = previous;
        }
    };

    test('declared map receiver reads native with no cast', () => {
        const input =
        "class T {\\n" +
        "    test(x: any): void {\\n" +
        "        const a = x['k'];\\n" +
        "        this.something(a);\\n" +
        "    }\\n" +
        "    something(...args: any[]): void {}\\n" +
        "}"
        withResolver(() => MAP_TYPE, () => {
            const output = transpiler.transpileJava(input).content;
            expect(output).toContain('Object a = x.get("k");');
            expect(output).not.toContain('Helpers.GetValue(x, "k")');
            expect(output).not.toContain('((java.util.Map<String, Object>)x).get');
        });
    });

    test('no consumer installed: the helper stays', () => {
        const input =
        "class T {\\n" +
        "    test(x: any): void {\\n" +
        "        const a = x['k'];\\n" +
        "        this.something(a);\\n" +
        "    }\\n" +
        "    something(...args: any[]): void {}\\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain('Helpers.GetValue(x, "k")');
        expect(output).not.toContain('x.get("k")');
    });

    test('a non-map declared type keeps the helper', () => {
        const input =
        "class T {\\n" +
        "    test(x: any): void {\\n" +
        "        const a = x['k'];\\n" +
        "        this.something(a);\\n" +
        "    }\\n" +
        "    something(...args: any[]): void {}\\n" +
        "}"
        for (const type of [ 'Object', 'java.util.List<Object>', 'String' ]) {
            withResolver(() => type, () => {
                const output = transpiler.transpileJava(input).content;
                expect(output).toContain('Helpers.GetValue(x, "k")');
            });
        }
        // the HashMap spelling is the same box: the accessor binds with no cast
        withResolver(() => 'HashMap<String, Object>', () => {
            const output = transpiler.transpileJava(input).content;
            expect(output).toContain('Object a = x.get("k");');
        });
    });

    test('a non-literal key on a declared map reads native, a field receiver keeps the helper', () => {
        const keys =
        "class T {\\n" +
        "    test(x: any, k: string): void {\\n" +
        "        const a = x[k];\\n" +
        "        this.something(a);\\n" +
        "    }\\n" +
        "    something(...args: any[]): void {}\\n" +
        "}"
        const field =
        "class T {\\n" +
        "    foo: any;\\n" +
        "    test(): void {\\n" +
        "        const a = this.foo['k'];\\n" +
        "        this.something(a);\\n" +
        "    }\\n" +
        "    something(...args: any[]): void {}\\n" +
        "}"
        withResolver(() => MAP_TYPE, () => {
            expect(transpiler.transpileJava(keys).content).toContain('(x == null || k == null ? null : x.get(k))');
            expect(transpiler.transpileJava(field).content).toContain('Helpers.GetValue(this.foo, "k")');
        });
    });


    test('the container of a nested write indexes natively, the steps above it keep the helper', () => {
        const input =
        "class T {\\n" +
        "    test(x: any, v: number): void {\\n" +
        "        x['a']['b'] = v;\\n" +
        "        x['c']['d']['e'] = v;\\n" +
        "        x['f'] = v;\\n" +
        "        this.something(x);\\n" +
        "    }\\n" +
        "    something(...args: any[]): void {}\\n" +
        "}"
        withResolver(() => MAP_TYPE, () => {
            const output = transpiler.transpileJava(input).content;
            // first step of each chain is a read of the declared map
            expect(output).toContain('Helpers.addElementToObject(x.get("a"), "b", v);');
            expect(output).toContain('Helpers.addElementToObject(Helpers.GetValue(x.get("c"), "d"), "e", v);');
            // a single-key write is not a chain: java-12's family, untouched here
            expect(output).toContain('Helpers.addElementToObject(x, "f", v);');
        });
        // without a consumer every step is the helper again
        const baseline = transpiler.transpileJava(input).content;
        expect(baseline).toContain('Helpers.addElementToObject(Helpers.GetValue(x, "a"), "b", v);');
        expect(baseline).toContain('Helpers.addElementToObject(Helpers.GetValue(Helpers.GetValue(x, "c"), "d"), "e", v);');
    });
});

describe('declared-list element reads: Helpers.GetValue(x, i) -> x.get(i)', () => {
    // a `List<Object>` declaration (from the list-producer / collection slices) with a `var`
    // int loop counter prints the native element read. GetValue answers null for a null
    // receiver and for an index outside [0, size) where List.get throws on both, so the
    // emission keeps the helper's own tests; every unproven index or receiver keeps the helper.
    const LIST_TYPE = 'java.util.List<Object>';
    const withResolver = (resolver: any, body: () => void) => {
        const printer: any = (transpiler as any).javaTranspiler;
        const previous = printer.javaDeclaredLocalTypeResolver;
        printer.javaDeclaredLocalTypeResolver = resolver;
        try {
            body();
        } finally {
            printer.javaDeclaredLocalTypeResolver = previous;
        }
    };
    const counterLoop =
        "class T {\n" +
        "    test(x: any): void {\n" +
        "        for (let i = 0; i < 3; i++) {\n" +
        "            const a = x[i];\n" +
        "            this.something(a);\n" +
        "        }\n" +
        "    }\n" +
        "    something(...args: any[]): void {}\n" +
        "}";

    test('a declared List with a for-counter index reads native behind the null / range guard', () => {
        withResolver(() => LIST_TYPE, () => {
            const output = transpiler.transpileJava(counterLoop).content;
            expect(output).toContain('(x == null || i < 0 || i >= x.size() ? null : x.get(i))');
            expect(output).not.toContain('Helpers.GetValue(x, i)');
        });
    });

    test('a declared List with a numeric literal index reads native too', () => {
        const input =
        "class T {\n" +
        "    test(x: any): void {\n" +
        "        const a = x[0];\n" +
        "        this.something(a);\n" +
        "    }\n" +
        "    something(...args: any[]): void {}\n" +
        "}";
        withResolver(() => LIST_TYPE, () => {
            const output = transpiler.transpileJava(input).content;
            expect(output).toContain('(x == null || 0 >= x.size() ? null : x.get(0))');
            expect(output).not.toContain('Helpers.GetValue(x, 0)');
        });
    });

    test('no consumer installed: the counter read keeps the helper', () => {
        const output = transpiler.transpileJava(counterLoop).content;
        expect(output).toContain('Helpers.GetValue(x, i)');
        expect(output).not.toContain('x.get(i)');
    });

    test('a non-counter identifier index keeps the helper', () => {
        const input =
        "class T {\n" +
        "    test(x: any, i: number): void {\n" +
        "        const a = x[i];\n" +
        "        this.something(a);\n" +
        "    }\n" +
        "    something(...args: any[]): void {}\n" +
        "}";
        withResolver(() => LIST_TYPE, () => {
            const output = transpiler.transpileJava(input).content;
            expect(output).toContain('Helpers.GetValue(x, i)');
            expect(output).not.toContain('x.get(i)');
        });
    });

    test('a declared type that is not a List keeps the helper', () => {
        for (const type of [ 'Object', 'java.util.Map<String, Object>', 'String', 'java.util.List' ]) {
            withResolver(() => type, () => {
                const output = transpiler.transpileJava(counterLoop).content;
                expect(output).toContain('Helpers.GetValue(x, i)');
                expect(output).not.toContain('x.get(i)');
            });
        }
    });

    test('a split-produced receiver keeps the helper (its consumers are typed from the call)', () => {
        const input =
        "class T {\n" +
        "    test(name: string): void {\n" +
        "        const parts = name.split('.');\n" +
        "        for (let i = 0; i < 3; i++) {\n" +
        "            const root = parts[i];\n" +
        "            this.something(root);\n" +
        "        }\n" +
        "    }\n" +
        "    something(...args: any[]): void {}\n" +
        "}";
        withResolver(() => 'java.util.List<Object>', () => {
            const output = transpiler.transpileJava(input).content;
            expect(output).toContain('Helpers.GetValue(parts, i)');
            expect(output).not.toContain('parts.get(i)');
        });
    });

    // the param is declared `Object` in the Java signature: the checker proof carries the
    // wildcard cast, which a `List<String>` declaration would not accept
    test('a checker-proven array parameter reads natively behind the wildcard cast and the guard', () => {
        const input =
        "class T {\n" +
        "    test(xs: string[]): void {\n" +
        "        for (let i = 0; i < xs.length; i++) {\n" +
        "            const a = xs[i];\n" +
        "            this.something(a);\n" +
        "        }\n" +
        "    }\n" +
        "    something(...args: any[]): void {}\n" +
        "}";
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain('(xs == null || i < 0 || i >= ((java.util.List<?>)xs).size() ? null : ((java.util.List<?>)xs).get(i))');
        expect(output).not.toContain('Helpers.GetValue(xs, i)');
    });

    test('the same parameter without a `var` counter index keeps the helper', () => {
        const input =
        "class T {\n" +
        "    test(xs: string[], i: number): void {\n" +
        "        const a = xs[i];\n" +
        "        this.something(a);\n" +
        "    }\n" +
        "    something(...args: any[]): void {}\n" +
        "}";
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain('Helpers.GetValue(xs, i)');
        expect(output).not.toContain('((java.util.List<?>)xs).get(i)');
    });

    test('a call receiver keeps the helper (the guards would evaluate it twice)', () => {
        const input =
        "class T {\n" +
        "    test(): void {\n" +
        "        for (let i = 0; i < 3; i++) {\n" +
        "            const a = this.list()[i];\n" +
        "            this.something(a);\n" +
        "        }\n" +
        "    }\n" +
        "    list(): any[] { return []; }\n" +
        "    something(...args: any[]): void {}\n" +
        "}";
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain('Helpers.GetValue(this.list(), i)');
    });

    test('a varargs receiver keeps the helper (a Java array, not a List)', () => {
        const input =
        "class T {\n" +
        "    test(...args: any[]): void {\n" +
        "        for (let i = 0; i < args.length; i++) {\n" +
        "            const a = args[i];\n" +
        "            this.something(a);\n" +
        "        }\n" +
        "    }\n" +
        "    something(...args: any[]): void {}\n" +
        "}";
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain('Helpers.GetValue(args, i)');
        expect(output).not.toContain('((java.util.List<?>)args).get(i)');
    });


    test('a read in statement position keeps the helper (a bare conditional is not a statement)', () => {
        const input =
        "class T {\n" +
        "    test(x: any): void {\n" +
        "        for (let i = 0; i < 3; i++) {\n" +
        "            x[i];\n" +
        "        }\n" +
        "    }\n" +
        "}";
        withResolver(() => LIST_TYPE, () => {
            const output = transpiler.transpileJava(input).content;
            expect(output).toContain('Helpers.GetValue(x, i);');
            expect(output).not.toContain('x.get(i)');
        });
    });
});

describe('declared-map element reads: Helpers.GetValue(m, k) -> guarded m.get(k)', () => {
    // a `Map<String, Object>` declaration (the B-11/B-15 local table, or a param the printer
    // retypes per B-09/D-10) with a key the printer cannot fold into a literal prints the
    // native map accessor. GetValue's Map branch answers null for a null receiver, a null
    // key and a key that is not a String, so the emission carries the same tests; every
    // unproven receiver or key keeps the helper.
    const MAP_TYPE = 'Map<String, Object>';
    const withResolver = (resolver: any, body: () => void) => {
        const printer: any = (transpiler as any).javaTranspiler;
        const previous = printer.javaDeclaredLocalTypeResolver;
        printer.javaDeclaredLocalTypeResolver = resolver;
        try {
            body();
        } finally {
            printer.javaDeclaredLocalTypeResolver = previous;
        }
    };

    test('a declared Map with a plain string key reads native behind the null guards', () => {
        const input =
        "class T {\n" +
        "    test(x: any, key: string): void {\n" +
        "        const a = x[key];\n" +
        "        this.something(a);\n" +
        "    }\n" +
        "    something(...args: any[]): void {}\n" +
        "}";
        withResolver(() => MAP_TYPE, () => {
            const output = transpiler.transpileJava(input).content;
            expect(output).toContain('(x == null || key == null ? null : x.get(key))');
            expect(output).not.toContain('Helpers.GetValue(x, key)');
        });
    });

    test('a key the checker does not prove a string carries the not-a-String test', () => {
        const input =
        "class T {\n" +
        "    test(x: any, k: any): void {\n" +
        "        const a = x[k];\n" +
        "        this.something(a);\n" +
        "    }\n" +
        "    something(...args: any[]): void {}\n" +
        "}";
        withResolver(() => MAP_TYPE, () => {
            const output = transpiler.transpileJava(input).content;
            expect(output).toContain('(x == null || !(k instanceof String) ? null : x.get(k))');
            expect(output).not.toContain('Helpers.GetValue(x, k)');
        });
    });

    test('no consumer installed: the read keeps the helper', () => {
        const input =
        "class T {\n" +
        "    test(x: any, key: string): void {\n" +
        "        const a = x[key];\n" +
        "        this.something(a);\n" +
        "    }\n" +
        "    something(...args: any[]): void {}\n" +
        "}";
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain('Helpers.GetValue(x, key)');
        expect(output).not.toContain('x.get(key)');
    });

    test('a declared type that is not a Map keeps the helper', () => {
        for (const type of [ 'Object', 'String', 'java.util.List<Object>', 'List<String>' ]) {
            withResolver(() => type, () => {
                const input =
                "class T {\n" +
                "    test(x: any, key: string): void {\n" +
                "        const a = x[key];\n" +
                "        this.something(a);\n" +
                "    }\n" +
                "    something(...args: any[]): void {}\n" +
                "}";
                const output = transpiler.transpileJava(input).content;
                expect(output).toContain('Helpers.GetValue(x, key)');
                expect(output).not.toContain('x.get(key)');
            });
        }
    });

    test('a counter index on a declared Map keeps the helper', () => {
        const input =
        "class T {\n" +
        "    test(x: any): void {\n" +
        "        for (let i = 0; i < 3; i++) {\n" +
        "            const a = x[i];\n" +
        "            this.something(a);\n" +
        "        }\n" +
        "    }\n" +
        "    something(...args: any[]): void {}\n" +
        "}";
        withResolver(() => MAP_TYPE, () => {
            const output = transpiler.transpileJava(input).content;
            expect(output).toContain('Helpers.GetValue(x, i)');
            expect(output).not.toContain('x.get(i)');
        });
    });

    test('a numeric literal key on a declared Map keeps the helper', () => {
        const input =
        "class T {\n" +
        "    test(x: any): void {\n" +
        "        const a = x[0];\n" +
        "        this.something(a);\n" +
        "    }\n" +
        "    something(...args: any[]): void {}\n" +
        "}";
        withResolver(() => MAP_TYPE, () => {
            const output = transpiler.transpileJava(input).content;
            expect(output).toContain('Helpers.GetValue(x, 0)');
            expect(output).not.toContain('x.get(0)');
        });
    });

    test('a key that is not a repeatable operand keeps the helper', () => {
        const input =
        "class T {\n" +
        "    test(x: any): void {\n" +
        "        const a = x[this.key()];\n" +
        "        this.something(a);\n" +
        "    }\n" +
        "    key(): string { return 'k'; }\n" +
        "    something(...args: any[]): void {}\n" +
        "}";
        withResolver(() => MAP_TYPE, () => {
            const output = transpiler.transpileJava(input).content;
            expect(output).toContain('Helpers.GetValue(x, this.key())');
            expect(output).not.toContain('x.get(this.key())');
        });
    });

    test('a write target keeps the helper', () => {
        const input =
        "class T {\n" +
        "    test(x: any, key: string, v: any): void {\n" +
        "        x[key] = v;\n" +
        "    }\n" +
        "}";
        withResolver(() => MAP_TYPE, () => {
            const output = transpiler.transpileJava(input).content;
            expect(output).toContain('Helpers.addElementToObject(x, key, v)');
            expect(output).not.toContain('x.get(key)');
        });
    });

});

describe('OrderType/OrderSide parameters print String', () => {
    const TMP = path.join(__dirname, 'files', 'tmp-order-type-params');
    const TYPES_FIXTURE = path.join(TMP, 'ts', 'src', 'base', 'types.ts');
    const VENUE_FIXTURE = path.join(TMP, 'ts', 'src', 'probe.ts');
    let out: string;

    beforeAll(() => {
        fs.mkdirSync(path.dirname(TYPES_FIXTURE), { recursive: true });
        fs.writeFileSync(TYPES_FIXTURE,
            "export type OrderSide = 'buy' | 'sell' | string | undefined;\n" +
            "export type OrderType = 'limit' | 'market' | string;\n");
        fs.writeFileSync(VENUE_FIXTURE,
            "import type { OrderType, OrderSide } from './base/types';\n" +
            "class Venue {\n" +
            "    place (type: OrderType, side: OrderSide): void {\n" +
            "    }\n" +
            "    later (id: string, type: OrderType = undefined, side: OrderSide = undefined): void {\n" +
            "    }\n" +
            "    caller (req: any): void {\n" +
            "        const t = req['t'];\n" +
            "        this.place (t, 'buy');\n" +
            "    }\n" +
            "}\n");
        const byPath = new Transpiler({ 'verbose': false, 'java': { 'parser': { 'NUM_LINES_END_FILE': 0 } } });
        out = byPath.transpileJavaByPath(VENUE_FIXTURE).content;
    });

    afterAll(() => {
        fs.rmSync(TMP, { recursive: true, force: true });
    });

    test('fixed and optional positions print String; an Object argument is cast', () => {
        expect(out).toContain('public void place(String type, String side)');
        expect(out).toContain('public void later(Object id, String type, String side)');
        expect(out).toContain('this.place((String) (t), "buy")');
    });
});

describe('declared-map element reads (d-11): a retyped Dict parameter consumes the read', () => {
    // the headline shape of D-11: the receiver is a parameter B-09/D-10 print as a Java Map,
    // so the read binds natively exactly as it does for a typed local.
    const TMP = path.join(__dirname, 'files', 'tmp-d11-map-params');
    const TYPES_FIXTURE = path.join(TMP, 'ts', 'src', 'base', 'types.ts');
    const VENUE_FIXTURE = path.join(TMP, 'ts', 'src', 'probe.ts');

    let venueOutput: string;

    beforeAll(() => {
        fs.mkdirSync(path.dirname(TYPES_FIXTURE), { recursive: true });
        fs.writeFileSync(TYPES_FIXTURE,
            "export interface Dictionary<T> {\n    [key: string]: T;\n}\n" +
            "export type Dict = Dictionary<any>;\n" +
            "export type Str = string | undefined;\n");
        fs.writeFileSync(VENUE_FIXTURE,
            "import type { Dict } from './base/types';\n" +
            "class Venue {\n" +
            "    parseAccounts (data: Dict, code: string): void {\n" +
            "        const id = data[code];\n" +
            "    }\n" +
            "    parseAny (data: Dict, code: any): void {\n" +
            "        const id = data[code];\n" +
            "    }\n" +
            "    parseKey (data: Dict, code: string): void {\n" +
            "        const id = data['id'];\n" +
            "    }\n" +
            "}\n");
        const byPath = new Transpiler({ 'verbose': false, 'java': { 'parser': { 'NUM_LINES_END_FILE': 0 } } });
        venueOutput = byPath.transpileJavaByPath(VENUE_FIXTURE).content;
    });

    afterAll(() => {
        fs.rmSync(TMP, { recursive: true, force: true });
    });

    test('the Dict parameter prints the native Java type', () => {
        expect(venueOutput).toContain('public void parseAccounts(java.util.Map<String, Object> data, Object code)');
        expect(venueOutput).toContain('public void parseAny(java.util.Map<String, Object> data, Object code)');
    });

    test('a non-literal key on the retyped parameter reads native', () => {
        expect(venueOutput).toContain('(data == null || code == null ? null : data.get(code))');
        expect(venueOutput).not.toContain('Helpers.GetValue(data, code)');
    });

    test('a key the checker does not prove a string carries the not-a-String test', () => {
        expect(venueOutput).toContain('(data == null || !(code instanceof String) ? null : data.get(code))');
    });

    test('the literal-key read on the same parameter still prints the B-09 shape', () => {
        expect(venueOutput).toContain('((java.util.Map<String, Object>)data).get("id")');
    });
});

describe('java helper-family inlining (+ - * / += -=)', () => {
    test('string + string with one statically-String operand prints a native concat', () => {
        const input =
        "class T {\n" +
        "    f(b: string): void {\n" +
        "        const x = \"a\" + b;\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain('String x = ("a" + b);');
        expect(output).not.toContain('Helpers.add(');
    });

    test('nested concat chain inlines every link', () => {
        const input =
        "class T {\n" +
        "    f(b: string): void {\n" +
        "        const x = (\"a\" + b) + \"c\";\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain('String x = ((("a" + b)) + "c");');
        expect(output).not.toContain('Helpers.add(');
    });

    test('+= with a string literal prints a native concat assignment', () => {
        const input =
        "class T {\n" +
        "    f(): void {\n" +
        "        let s = \"x\";\n" +
        "        s += \"y\";\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain('s = (s + "y");');
        expect(output).not.toContain('Helpers.add(');
    });

    test('integer literals print native long arithmetic, / prints double division', () => {
        const input =
        "class T {\n" +
        "    f(): void {\n" +
        "        const x = 2 * 3;\n" +
        "        const w = 7 + 1;\n" +
        "        const y = 10 / 4;\n" +
        "        const q = (2 * 3) * 4;\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain('Long x = (2L * 3L);');
        expect(output).toContain('Long w = (7L + 1L);');
        expect(output).toContain('Double y = (((double) 10) / ((double) 4));');
        expect(output).toContain('Long q = (((2L * 3L)) * 4L);');
        expect(output).not.toContain('Helpers.multiply(');
        expect(output).not.toContain('Helpers.divide(');
    });

    test('mixed literal kinds and non-literal numbers keep the helper', () => {
        const input =
        "class T {\n" +
        "    f(a: number, b: number): void {\n" +
        "        const z = 1.5 * 2;\n" +
        "        const x = a + b;\n" +
        "        const y = a * 3;\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain('Object z = Helpers.multiply(1.5, 2);');
        expect(output).toContain('Object x = Helpers.add(a, b);');
        expect(output).toContain('Object y = Helpers.multiply(a, 3);');
    });

    test('string-typed call operands do not anchor a concat (Java declares them Object)', () => {
        const input =
        "class T {\n" +
        "    host(path: string): string { return path; }\n" +
        "    f(a: string): void {\n" +
        "        const x = this.host(a) + this.host(a);\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain('Helpers.add(this.host(a), this.host(a))');
    });

    test('nullable aliases keep the helper', () => {
        const input =
        "class T {\n" +
        "    f(a: Str, b: Str, n: Num): void {\n" +
        "        const x = a + b;\n" +
        "        const y = n + 1;\n" +
        "    }\n" +
        "}\n"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain('Object x = Helpers.add(a, b);');
        expect(output).toContain('Object y = Helpers.add(n, 1);');
    });
});
describe('java string-concat chains anchored by a declared String', () => {
    // the printer names only literals and its own native concats itself; locals whose
    // emitted Java declaration is `String x = ` (the embedding build layer's retyping)
    // and calls to hand-written `public String` runtime methods come back through
    // javaExpressionTypeResolver — these tests stub that resolver with a name map
    const withStrings = (strings, input) => {
        transpiler.javaTranspiler.javaExpressionTypeResolver = (node) => strings[node?.escapedText];
        try {
            return transpiler.transpileJava(input).content;
        } finally {
            transpiler.javaTranspiler.javaExpressionTypeResolver = undefined;
        }
    };
    test('two checker-typed string locals chain natively when one is a declared String', () => {
        const input =
        "class T {\n" +
        "    f(a: string, b: string): void {\n" +
        "        const x = a + b;\n" +
        "        const y = a + b + a;\n" +
        "    }\n" +
        "}"
        const output = withStrings({ 'a': 'String' }, input);
        expect(output).toContain('String x = (a + b);');
        expect(output).toContain('String y = ((a + b) + a);');
        expect(output).not.toContain('Helpers.add(');
    });
    test('a String anchor on the right side is enough', () => {
        const input =
        "class T {\n" +
        "    f(a: string, b: string): void {\n" +
        "        const x = a + b;\n" +
        "    }\n" +
        "}"
        const output = withStrings({ 'b': 'String' }, input);
        expect(output).toContain('String x = (a + b);');
        expect(output).not.toContain('Helpers.add(');
    });
    test('no resolver verdict keeps the helper', () => {
        const input =
        "class T {\n" +
        "    f(a: string, b: string): void {\n" +
        "        const x = a + b;\n" +
        "    }\n" +
        "}"
        expect(withStrings({}, input)).toContain('Object x = Helpers.add(a, b);');
        expect(transpiler.transpileJava(input).content).toContain('Object x = Helpers.add(a, b);');
    });
    test('a resolver verdict of another Java type keeps the helper', () => {
        const input =
        "class T {\n" +
        "    f(a: string, b: string): void {\n" +
        "        const x = a + b;\n" +
        "    }\n" +
        "}"
        expect(withStrings({ 'a': 'Long' }, input)).toContain('Object x = Helpers.add(a, b);');
    });
    test('a nullable alias leaf chains natively off a declared String anchor (B-13)', () => {
        const input =
        "class T {\n" +
        "    f(a: Str, b: string): void {\n" +
        "        const x = a + b;\n" +
        "    }\n" +
        "}"
        const output = withStrings({ 'a': 'String', 'b': 'String' }, input);
        expect(output).toContain('Object x = (a + b);');
        expect(output).not.toContain('Helpers.add(');
    });
    test('a declared String local chains with a call operand natively', () => {
        const input =
        "class T {\n" +
        "    tag(): string { return \"x\"; }\n" +
        "    f(name: string): void {\n" +
        "        const x = name + this.tag();\n" +
        "    }\n" +
        "}"
        const output = withStrings({ 'name': 'String' }, input);
        expect(output).toContain('String x = (name + this.tag());');
        expect(output).not.toContain('Helpers.add(');
    });
});

describe('java literal-anchored concat (`a + "lit"` whatever the other operand is)', () => {
    const withStrings = (strings, input) => {
        transpiler.javaTranspiler.javaExpressionTypeResolver = (node) => strings[node?.escapedText];
        try {
            return transpiler.transpileJava(input).content;
        } finally {
            transpiler.javaTranspiler.javaExpressionTypeResolver = undefined;
        }
    };

    test('a nullable alias operand concatenates natively against a literal', () => {
        const input =
        "type Str = string | undefined;\n" +
        "class T {\n" +
        "    f(a: Str): void {\n" +
        "        const x = a + \"lit\";\n" +
        "        const y = \"pre\" + a;\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain('Object x = (a + "lit");');
        expect(output).toContain('Object y = ("pre" + a);');
        expect(output).not.toContain('Helpers.add(');
    });

    test('a string-literal-union element read concatenates natively against a literal', () => {
        const input =
        "class T {\n" +
        "    f(m: { t: 'a' | 'b' }): void {\n" +
        "        const x = m['t'] + \" orders\";\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain('+ " orders");');
        expect(output).not.toContain('Helpers.add(');
    });

    test('an any-valued dict read keeps the helper (the value can be a Double)', () => {
        const input =
        "type Dict = { [key: string]: any };\n" +
        "class T {\n" +
        "    f(d: Dict): void {\n" +
        "        const x = d[\"type\"] + \" orders\";\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain('Helpers.add(');
    });

    test('a boolean operand concatenates natively against a literal', () => {
        const input =
        "class T {\n" +
        "    f(b: boolean): void {\n" +
        "        const x = b + \"!\";\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain('Object x = (b + "!");');
    });

    test('an integer-literal operand concatenates natively', () => {
        const input =
        "class T {\n" +
        "    f(): void {\n" +
        "        const x = 2 + \" items\";\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).not.toContain('Helpers.add(');
    });

    test('a number operand keeps the helper (a boxed Double is added, not concatenated)', () => {
        const input =
        "class T {\n" +
        "    f(n: number, a: any): void {\n" +
        "        const x = n + \"s\";\n" +
        "        const y = a + \"s\";\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain('Helpers.add(n, "s")');
        expect(output).toContain('Helpers.add(a, "s")');
    });

    test('a ternary operand keeps the helper (the `+` would re-parse inside it)', () => {
        const input =
        "class T {\n" +
        "    f(a: Str, c: boolean): void {\n" +
        "        const x = (c ? a : \"b\") + \"s\";\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain('Helpers.add(');
    });

    test('an optional-chain operand keeps the helper', () => {
        const input =
        "class T {\n" +
        "    f(d: any): void {\n" +
        "        const x = d?.type + \"s\";\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain('Helpers.add(');
    });

    test('+= against a literal on a nullable alias prints the native concat assignment', () => {
        const input =
        "type Str = string | undefined;\n" +
        "class T {\n" +
        "    f(a: Str): void {\n" +
        "        let s: Str = undefined;\n" +
        "        s += \"lit\";\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain('s = (s + "lit");');
        expect(output).not.toContain('Helpers.add(');
    });

    test('a declared String anchor concatenates a nullable alias operand natively', () => {
        const input =
        "class T {\n" +
        "    f(a: Str, b: string): void {\n" +
        "        const x = a + b;\n" +
        "    }\n" +
        "}"
        const output = withStrings({ 'a': 'String' }, input);
        expect(output).toContain('Object x = (a + b);');
        expect(output).not.toContain('Helpers.add(');
    });
});


describe('java widened native add (numeric `+` on provably non-null operands)', () => {
    test('primitive int for-counter widens explicitly to a native long add', () => {
        const input =
        "class T {\n" +
        "    f(n: number): void {\n" +
        "        for (let i = 0; i < n; i++) {\n" +
        "            const x = i + 1;\n" +
        "        }\n" +
        "    }\n" +
        "}\n"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain('Object x = (((long) i) + 1L);');
        expect(output).not.toContain('Helpers.add(i, 1)');
    });

    test('two int counters widen both operands (an int sum would wrap and box Integer)', () => {
        const input =
        "class T {\n" +
        "    f(n: number): void {\n" +
        "        for (let i = 0; i < n; i++) {\n" +
        "            for (let j = 0; j < n; j++) {\n" +
        "                const x = i + j;\n" +
        "            }\n" +
        "        }\n" +
        "    }\n" +
        "}\n"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain('Object x = (((long) i) + ((long) j));');
        expect(output).not.toContain('Helpers.add(');
    });

    test('String length read widens to a native long add', () => {
        const input =
        "class T {\n" +
        "    f(s: string): void {\n" +
        "        const x = s.length + 1;\n" +
        "    }\n" +
        "}\n"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain('Object x = (((long) ((String)s).length()) + 1L);');
        expect(output).not.toContain('Helpers.add(');
    });

    test('List size read widens to a native long add', () => {
        const input =
        "class T {\n" +
        "    f(a: number[]): void {\n" +
        "        const x = a.length + 1;\n" +
        "    }\n" +
        "}\n"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain('Object x = (((long) ((java.util.List<?>)a).size()) + 1L);');
        expect(output).not.toContain('Helpers.add(');
    });

    test('a double-valued int operand needs no widening (int promotes natively)', () => {
        const input =
        "class T {\n" +
        "    f(n: number): void {\n" +
        "        for (let i = 0; i < n; i++) {\n" +
        "            const x = i + 1.5;\n" +
        "        }\n" +
        "    }\n" +
        "}\n"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain('Object x = (i + 1.5);');
        expect(output).not.toContain('Helpers.add(');
    });

    test('a counter with any assignment write keeps the helper', () => {
        const input =
        "class T {\n" +
        "    f(n: number): void {\n" +
        "        for (let i = 0; i < n; i++) {\n" +
        "            const x = i + 1;\n" +
        "            i += 1;\n" +
        "        }\n" +
        "    }\n" +
        "}\n"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain('Object x = Helpers.add(i, 1);');
        expect(output).not.toContain('((long) i)');
    });

    test('a boxed local (Object in Java) keeps the helper even with a numeric TS type', () => {
        const input =
        "class T {\n" +
        "    f(): void {\n" +
        "        const i = 0;\n" +
        "        const x = i + 1;\n" +
        "    }\n" +
        "}\n"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain('Object x = Helpers.add(i, 1);');
    });

    test('an unresolved this.milliseconds() (printed as callDynamically) keeps the helper', () => {
        const input =
        "class T {\n" +
        "    f(): void {\n" +
        "        const x = this.milliseconds() + 10000;\n" +
        "    }\n" +
        "}\n"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain('Helpers.callDynamically(this, "milliseconds"');
        expect(output).toContain('Helpers.add(');
        expect(output).not.toContain('+ 10000L');
    });

    test('a class-local override of milliseconds keeps the helper', () => {
        const input =
        "class T {\n" +
        "    milliseconds(): string { return \"x\"; }\n" +
        "    f(): void {\n" +
        "        const x = this.milliseconds() + 1;\n" +
        "    }\n" +
        "}\n"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain('Object x = Helpers.add(this.milliseconds(), 1);');
    });

    test('- and * keep their own literal rule (the counters stay on the helper)', () => {
        const input =
        "class T {\n" +
        "    f(n: number): void {\n" +
        "        for (let i = 0; i < n; i++) {\n" +
        "            const x = i - 1;\n" +
        "            const y = i * 2;\n" +
        "        }\n" +
        "    }\n" +
        "}\n"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain('Object x = Helpers.subtract(i, 1);');
        expect(output).toContain('Object y = Helpers.multiply(i, 2);');
    });
});

// java-19: `this.milliseconds()` is a hand-written BaseExchange method declared
// `public Long milliseconds()` (java/lib/.../BaseExchange.java), so a call to it is a
// provable Java long operand. The base-tier path below is what makes the call resolve
// to that declaration - the real run prints ts/src/base/Exchange.ts, a venue override
// prints its own class file and must keep the helper.
describe('java hand-written return-type arithmetic (java-19)', () => {
    const TMP = path.join(__dirname, 'files', 'tmp-java19');
    const BASE_FIXTURE = path.join(TMP, 'ts', 'src', 'base', 'Exchange.ts');
    const VENUE_FIXTURE = path.join(TMP, 'exchanges', 'bitfake.ts');

    const baseSource =
    "class T {\n" +
    "    milliseconds(): number { return 1; }\n" +
    "    f1(since): void {\n" +
    "        since = this.milliseconds() - 2592000000;\n" +
    "    }\n" +
    "    f2(since): void {\n" +
    "        since = this.milliseconds() - 86400000 * 30;\n" +
    "    }\n" +
    "    f3(a: any, b: any): void {\n" +
    "        a = this.milliseconds() - b;\n" +
    "    }\n" +
    "    f4(a: any): void {\n" +
    "        a = this.milliseconds() - 1000.5;\n" +
    "    }\n" +
    "    f5(a: any): void {\n" +
    "        a = 1000 - this.milliseconds();\n" +
    "    }\n" +
    "    f6(a: any): void {\n" +
    "        a = this.milliseconds() * 1000;\n" +
    "    }\n" +
    "}";

    let baseOutput: string;
    let venueOutput: string;

    beforeAll(() => {
        fs.mkdirSync(path.dirname(BASE_FIXTURE), { recursive: true });
        fs.mkdirSync(path.dirname(VENUE_FIXTURE), { recursive: true });
        fs.writeFileSync(BASE_FIXTURE, baseSource);
        fs.writeFileSync(VENUE_FIXTURE, baseSource);
        const byPath = new Transpiler({ 'verbose': false, 'java': { 'parser': { 'NUM_LINES_END_FILE': 0 } } });
        baseOutput = byPath.transpileJavaByPath(BASE_FIXTURE).content;
        venueOutput = byPath.transpileJavaByPath(VENUE_FIXTURE).content;
    });

    afterAll(() => {
        fs.rmSync(TMP, { recursive: true, force: true });
    });

    test('subtract anchored on the hand-written milliseconds() prints native long arithmetic', () => {
        expect(baseOutput).toContain('since = (this.milliseconds() - 2592000000L);');
        expect(baseOutput).not.toContain('Helpers.subtract(this.milliseconds(), 2592000000L)');
    });

    test('a nested literal product prints as a native long right operand', () => {
        expect(baseOutput).toContain('since = (this.milliseconds() - (86400000L * 30L));');
        expect(baseOutput).not.toContain('Helpers.subtract(this.milliseconds(), (86400000L * 30L))');
    });

    test('an unprovable right operand keeps the subtract helper', () => {
        expect(baseOutput).toContain('a = Helpers.subtract(this.milliseconds(), b);');
    });

    test('a double right operand keeps the subtract helper (the rule is long-only)', () => {
        expect(baseOutput).toContain('a = Helpers.subtract(this.milliseconds(), 1000.5);');
    });

    test('the anchor must be the left operand of the subtraction', () => {
        expect(baseOutput).toContain('a = Helpers.subtract(1000, this.milliseconds());');
    });

    test('sibling arithmetic operators are untouched by this rule', () => {
        expect(baseOutput).toContain('a = Helpers.multiply(this.milliseconds(), 1000);');
    });

    test('a venue declaring its own milliseconds() keeps the helper', () => {
        expect(venueOutput).toContain('since = Helpers.subtract(this.milliseconds(), 2592000000L);');
    });
});

describe('java optional parameter unpacking', () => {
    test('literal defaults unpack natively from optionalArgs (no Helpers.getArg)', () => {
        const input =
        "class T {\n" +
        "    m(arg, symbol = undefined) {\n" +
        "        return symbol;\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("public Object m(Object arg, Object symbol)");
        expect(output).toContain("public Object m(Object arg, Object... optionalArgs)");
        expect(output).toContain("return this.m(arg, optionalArgs != null && optionalArgs.length > 0 ? optionalArgs[0] : null);");
        expect(output).not.toContain("Object symbol = optionalArgs");
        expect(output).not.toContain("Helpers.getArg");
    });

    test('every literal default shape keeps its index and its default value', () => {
        const input =
        "class T {\n" +
        "    m(arg, a = 1, b = true, c = 'x', d = {}, e = []) {\n" +
        "        return a;\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("public Object m(Object arg, Object a, Object b, Object c, Object d, Object e)");
        expect(output).toContain("optionalArgs != null && optionalArgs.length > 0 ? optionalArgs[0] : 1, ");
        expect(output).toContain("optionalArgs != null && optionalArgs.length > 1 ? optionalArgs[1] : true, ");
        expect(output).toContain("optionalArgs != null && optionalArgs.length > 2 ? optionalArgs[2] : \"x\", ");
        expect(output).toContain("optionalArgs != null && optionalArgs.length > 3 ? optionalArgs[3] : new java.util.HashMap<String, Object>() {{}}, ");
        expect(output).toContain("optionalArgs != null && optionalArgs.length > 4 ? optionalArgs[4] : new java.util.ArrayList<Object>(java.util.Arrays.asList()));");
        expect(output).not.toContain("Helpers.getArg");
    });

    test('every native unpack is null-guarded, like the helper it replaces', () => {
        const input =
        "class T {\n" +
        "    m(arg, params = {}) {\n" +
        "        return params;\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        // a caller passing a bare trailing null supplies a null varargs array; the
        // guard keeps that reading like an empty one instead of throwing NPE
        expect(output).not.toMatch(/= optionalArgs\.length/);
        expect(output).toContain("optionalArgs != null && optionalArgs.length > 0");
    });

    test('defaults that are not pure literals keep Helpers.getArg', () => {
        const input =
        "class T {\n" +
        "    m(arg, params = this.something(arg), other = someVar) {\n" +
        "        return params;\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("Helpers.getArg(optionalArgs, 0, Helpers.callDynamically(this, \"something\", new Object[] { arg })), ");
        expect(output).toContain("Helpers.getArg(optionalArgs, 1, someVar));");
        expect(output).not.toContain("optionalArgs.length >");
    });

    test('async method takes the default as a core parameter; the front unpacks it', () => {
        const input =
        "class T {\n" +
        "    async m(arg, params = {}) {\n" +
        "        return this.something(params);\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("public java.util.concurrent.CompletableFuture<Object> m(Object arg, Object parameters)");
        expect(output).toContain("return this.m(arg, optionalArgs != null && optionalArgs.length > 0 ? optionalArgs[0] : new java.util.HashMap<String, Object>() {{}});");
        expect(output).not.toContain("Helpers.getArg");
    });

    test('constructor optional parameters unpack natively', () => {
        const input =
        "class T {\n" +
        "    constructor(a, b = 1) {\n" +
        "        this.b = b;\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("T(Object a, Object... optionalArgs)");
        expect(output).toContain("Object b = optionalArgs != null && optionalArgs.length > 0 ? optionalArgs[0] : 1;");
        expect(output).not.toContain("Helpers.getArg");
    });
});

// `obj[key] = value` prints the runtime helper by default; the native Map.put is
// printed only when the checker proves the target is a TS dictionary, the key is a
// string literal and the receiver is not a shared field map.
describe('java element-access write: native Map.put for proven dictionaries', () => {
    const put = '((java.util.Map<String, Object>)request).put("symbol", "BTC/USDT")';

    test('dictionary-typed local with a string-literal key prints Map.put', () => {
        const input =
        "class T {\n" +
        "    test(): void {\n" +
        "        const request: { [key: string]: any } = {};\n" +
        "        request[\"symbol\"] = \"BTC/USDT\";\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain(put);
        expect(output).not.toContain("addElementToObject");
    });

    test('dictionary-typed parameter with a string-literal key prints Map.put', () => {
        const input =
        "class T {\n" +
        "    test(request: { [key: string]: any }): void {\n" +
        "        request[\"symbol\"] = \"BTC/USDT\";\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain(put);
        expect(output).not.toContain("addElementToObject");
    });

    test('shared field map keeps the helper (ConcurrentHashMap null-removal + monitor)', () => {
        const input =
        "class T {\n" +
        "    test(): void {\n" +
        "        this.options[\"sandboxMode\"] = true;\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain('Helpers.addElementToObject(this.options, "sandboxMode", true)');
        expect(output).not.toContain(".put(");
    });

    test('string-typed key prints the typed put with the (String) cast', () => {
        const input =
        "class T {\n" +
        "    test(code: string): void {\n" +
        "        const request: { [key: string]: any } = {};\n" +
        "        request[code] = 1;\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain('((java.util.Map<String, Object>)request).put((String)code, 1)');
        expect(output).not.toContain("addElementToObject");
    });

    test('element read as key keeps the helper (GetValue returns Object)', () => {
        const input =
        "class T {\n" +
        "    test(market: { [key: string]: any }): void {\n" +
        "        const request: { [key: string]: any } = {};\n" +
        "        request[market[\"id\"]] = 1;\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        // the key is a plain read, so the d3 rule rewrites it; the write stays the helper
        // because the key is not a string literal
        expect(output).toContain('Helpers.addElementToObject(request, ((java.util.Map<String, Object>)market).get("id"), 1)');
        expect(output).not.toContain("Helpers.GetValue(");
    });

    test('array target keeps the helper (index append-at-size is not provable)', () => {
        const input =
        "class T {\n" +
        "    test(): void {\n" +
        "        const arr: any[] = [];\n" +
        "        arr[0] = 1;\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("Helpers.addElementToObject(arr, 0, 1)");
        expect(output).not.toContain(".set(");
    });

    test('object-literal local keeps the native put even when its type is any', () => {
        const input =
        "class T {\n" +
        "    test(): void {\n" +
        "        const x: any = {};\n" +
        "        x[\"k\"] = 1;\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        // the initializer is the object literal the printer turns into `new HashMap`, so the
        // receiver is a HashMap on every path the local takes
        expect(output).toContain('((java.util.Map<String, Object>)x).put("k", 1)');
        expect(output).not.toContain("addElementToObject");
    });

    test('interface-typed local with an object-literal initializer prints Map.put', () => {
        const input =
        "interface Foo { a: number; }\n" +
        "class T {\n" +
        "    test(): void {\n" +
        "        const x: Foo = { a: 1 };\n" +
        "        x[\"a\"] = 2;\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain('((java.util.Map<String, Object>)x).put("a", 2)');
        expect(output).not.toContain("addElementToObject");
    });

    test('a local reassigned after the object literal keeps the helper (D2)', () => {
        const input =
        "class T {\n" +
        "    test(foo: Foo, other: any): void {\n" +
        "        let x: Foo = { a: 1 };\n" +
        "        x = other;\n" +
        "        x[\"a\"] = 2;\n" +
        "    }\n" +
        "}\n" +
        "interface Foo { a: number; }"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("Helpers.addElementToObject(x, \"a\", 2)");
    });

    test('numeric key on a dictionary keeps the helper (Map.put takes a String key)', () => {
        const input =
        "class T {\n" +
        "    test(): void {\n" +
        "        const request: { [key: string]: any } = {};\n" +
        "        request[0] = 1;\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("Helpers.addElementToObject(request, 0, 1)");
    });

    test('nested dictionary write prints the native put on the inner map', () => {
        const input =
        "class T {\n" +
        "    test(): void {\n" +
        "        const features: { [key: string]: { [key: string]: any } } = {};\n" +
        "        features[\"spot\"][\"limit\"] = 1;\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain('((java.util.Map<String, Object>)Helpers.GetValue(features, "spot")).put("limit", 1)');
    });
});

// phase 2 of the element-write rule: keys proven String by the checker reach
// Map.put through a (String) cast, and receivers whose initializer is an object
// literal (or a call that only ever returns one) are plain HashMaps at runtime.
describe('java element-access write: proven-String keys and HashMap receivers', () => {
    test('string-literal-union key prints the typed put with the (String) cast', () => {
        const input =
        "class T {\n" +
        "    test(flag: boolean): void {\n" +
        "        const request: { [key: string]: any } = {};\n" +
        "        const key = flag ? \"orderId\" : \"strategyId\";\n" +
        "        request[key] = 1;\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain('((java.util.Map<String, Object>)request).put((String)key, 1)');
        expect(output).not.toContain("addElementToObject");
    });

    test('a call whose body returns object literals only prints Map.put', () => {
        const input =
        "interface BalanceAccount { free: any; used: any; total: any; }\n" +
        "class T {\n" +
        "    account(): BalanceAccount {\n" +
        "        return { \"free\": undefined, \"used\": undefined, \"total\": undefined };\n" +
        "    }\n" +
        "    test(): void {\n" +
        "        const account = this.account();\n" +
        "        account[\"used\"] = 1;\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain('((java.util.Map<String, Object>)account).put("used", 1)');
        expect(output).not.toContain("addElementToObject");
    });

    test('a call that can return something else keeps the helper', () => {
        const input =
        "interface Foo { a: number; }\n" +
        "class T {\n" +
        "    pick(x: Foo): Foo {\n" +
        "        if (x.a === 1) {\n" +
        "            return { a: 1 };\n" +
        "        }\n" +
        "        return x;\n" +
        "    }\n" +
        "    test(x: Foo): void {\n" +
        "        const y = this.pick(x);\n" +
        "        y[\"a\"] = 2;\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("Helpers.addElementToObject(y, \"a\", 2)");
    });

    test('a call returning a class instance keeps the helper (reflection branch)', () => {
        const input =
        "class Holder { a = 0; }\n" +
        "class T {\n" +
        "    make(): Holder {\n" +
        "        return { a: 1 } as any;\n" +
        "    }\n" +
        "    test(): void {\n" +
        "        const holder = this.make();\n" +
        "        holder[\"a\"] = 2;\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("Helpers.addElementToObject(holder, \"a\", 2)");
    });

    test('a call returning an array keeps the helper (append branch)', () => {
        const input =
        "class T {\n" +
        "    make(): number[] {\n" +
        "        return [1];\n" +
        "    }\n" +
        "    test(): void {\n" +
        "        const xs = this.make();\n" +
        "        xs[0] = 2;\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("Helpers.addElementToObject(xs, 0, 2)");
    });

    test('a parameter receiver without a dictionary type keeps the helper', () => {
        const input =
        "class T {\n" +
        "    test(fee: any): void {\n" +
        "        fee[\"cost\"] = 1;\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain('Helpers.addElementToObject(fee, "cost", 1)');
    });

    test('a nested write on a proven HashMap local keeps the helper (the read is untyped)', () => {
        const input =
        "class T {\n" +
        "    test(): void {\n" +
        "        const x = { a: {} };\n" +
        "        x[\"a\"][\"b\"] = 1;\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain('Helpers.addElementToObject(Helpers.GetValue(x, "a"), "b", 1)');
    });

    test('a string-typed key on a proven HashMap local prints the typed put', () => {
        const input =
        "class T {\n" +
        "    test(code: string): void {\n" +
        "        const result = { \"a\": 1 };\n" +
        "        result[code] = 2;\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain('((java.util.Map<String, Object>)result).put((String)code, 2)');
        expect(output).not.toContain("addElementToObject");
    });

    test('an any-typed key on a dictionary receiver keeps the helper', () => {
        const input =
        "class T {\n" +
        "    test(code: any): void {\n" +
        "        const result: { [key: string]: any } = {};\n" +
        "        result[code] = 2;\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("Helpers.addElementToObject(result, code, 2)");
    });

    test('a number-typed key on a proven HashMap local keeps the helper', () => {
        const input =
        "class T {\n" +
        "    test(i: number): void {\n" +
        "        const result = { \"a\": 1 };\n" +
        "        result[i] = 2;\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("Helpers.addElementToObject(result, i, 2)");
    });
});

describe('helper removal: native comparison / containsKey / size', () => {
    test('checker-proven array length prints List.size() instead of the runtime helper', () => {
        const input =
        "class T {\n" +
        "    f(xs: number[]): void {\n" +
        "        const n = xs.length;\n" +
        "        return;\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("((java.util.List<?>)xs).size()");
        expect(output).not.toContain("Helpers.getArrayLength");
    });

    test('unproven (any) receiver keeps the length helper', () => {
        const input =
        "class T {\n" +
        "    f(x: any): void {\n" +
        "        const n = x.length;\n" +
        "        return;\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("Helpers.getArrayLength(x)");
    });

    test('rest parameter (varargs array, not a List) keeps the length helper', () => {
        const input =
        "class T {\n" +
        "    f(...args: any[]): void {\n" +
        "        const n = args.length;\n" +
        "        return;\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("Helpers.getArrayLength(args)");
    });

    // a local the embedding pass declared a java.util.List (a typed list return bound to a
    // local, a split/list-producer local, a list parameter the pass retyped): the `.length`
    // read is the same int the helper computes, and the null arm keeps its 0
    test('a declared List receiver prints x.size() behind the helper\'s zero-for-null guard', () => {
        const input =
        "class T {\n" +
        "    f(): void {\n" +
        "        const xs = this.getList();\n" +
        "        const n = xs.length;\n" +
        "        this.something(n);\n" +
        "    }\n" +
        "    getList(): any { return []; }\n" +
        "    something(...args: any[]): void {}\n" +
        "}";
        const printer: any = (transpiler as any).javaTranspiler;
        const previous = printer.javaDeclaredLocalTypeResolver;
        printer.javaDeclaredLocalTypeResolver = () => 'java.util.List<Object>';
        try {
            const output = transpiler.transpileJava(input).content;
            expect(output).toContain('(xs == null ? 0 : xs.size())');
            expect(output).not.toContain('Helpers.getArrayLength(xs)');
        } finally {
            printer.javaDeclaredLocalTypeResolver = previous;
        }
        // without a consumer the read keeps the helper
        const baseline = transpiler.transpileJava(input).content;
        expect(baseline).toContain('Helpers.getArrayLength(xs)');
    });

    test('a declared List<Object> parameter prints the size without a cast', () => {
        const input =
        "class T {\n" +
        "    f(xs: any): void {\n" +
        "        for (let i = 0; i < xs.length; i++) {\n" +
        "            return;\n" +
        "        }\n" +
        "    }\n" +
        "}";
        const printer: any = (transpiler as any).javaTranspiler;
        const previous = printer.javaDeclaredLocalTypeResolver;
        printer.javaDeclaredLocalTypeResolver = () => 'java.util.List<Object>';
        try {
            const output = transpiler.transpileJava(input).content;
            expect(output).toContain('for (var i = 0; i < (xs == null ? 0 : xs.size()); i++)');
            expect(output).not.toContain('Helpers.getArrayLength(xs)');
        } finally {
            printer.javaDeclaredLocalTypeResolver = previous;
        }
    });

    test('a declared non-List type keeps the length helper', () => {
        for (const type of [ 'java.util.Map<String, Object>', 'String', 'Long', 'var' ]) {
            const input =
            "class T {\n" +
            "    f(): void {\n" +
            "        const xs = this.getList();\n" +
            "        const n = xs.length;\n" +
            "        this.something(n);\n" +
            "    }\n" +
            "    getList(): any { return []; }\n" +
            "    something(...args: any[]): void {}\n" +
            "}";
            const printer: any = (transpiler as any).javaTranspiler;
            const previous = printer.javaDeclaredLocalTypeResolver;
            printer.javaDeclaredLocalTypeResolver = () => type;
            try {
                const output = transpiler.transpileJava(input).content;
                expect(output).toContain('Helpers.getArrayLength(xs)');
                expect(output).not.toContain('xs.size()');
            } finally {
                printer.javaDeclaredLocalTypeResolver = previous;
            }
        }
    });

    test('for-loop counter with an integer-literal initializer compares natively', () => {
        const input =
        "class T {\n" +
        "    f(xs: number[]): void {\n" +
        "        for (let i = 0; i < xs.length; i++) {\n" +
        "            return;\n" +
        "        }\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("for (var i = 0; i < ((java.util.List<?>)xs).size(); i++)");
        expect(output).not.toContain("Helpers.isLessThan");
    });

    test('while-loop counter (Object-typed local, not a for-counter) keeps the comparison helper', () => {
        const input =
        "class T {\n" +
        "    f(xs: number[]): void {\n" +
        "        let i = 0;\n" +
        "        while (i < xs.length) {\n" +
        "            i++;\n" +
        "        }\n" +
        "        return;\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("while (Helpers.isLessThan(i, ((java.util.List<?>)xs).size()))");
    });

    test('Object operands keep the comparison helper', () => {
        const input =
        "class T {\n" +
        "    f(a: number, b: number): void {\n" +
        "        if (a < b) {\n" +
        "            return;\n" +
        "        }\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("Helpers.isLessThan(a, b)");
    });

    test('string length stays a native int inside a comparison', () => {
        const input =
        "class T {\n" +
        "    f(s: string): void {\n" +
        "        if (s.length > 3) {\n" +
        "            return;\n" +
        "        }\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("((String)s).length() > 3");
        expect(output).not.toContain("Helpers.isGreaterThan");
    });

    test('checker-proven object receiver prints Map.containsKey', () => {
        const input =
        "interface Cfg { [key: string]: number; }\n" +
        "class T {\n" +
        "    f(c: Cfg, k: string): void {\n" +
        "        if (k in c) {\n" +
        "            return;\n" +
        "        }\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("((java.util.Map<?, ?>)c).containsKey(k)");
        expect(output).not.toContain("Helpers.inOp");
    });

    test('string-literal-union key prints Map.containsKey', () => {
        const input =
        "interface Cfg { [key: string]: number; }\n" +
        "class T {\n" +
        "    f(c: Cfg, k: 'a' | 'b'): void {\n" +
        "        if (k in c) {\n" +
        "            return;\n" +
        "        }\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("((java.util.Map<?, ?>)c).containsKey(k)");
    });

    test('array receiver of `in` keeps the membership helper', () => {
        const input =
        "class T {\n" +
        "    f(arr: number[], k: string): void {\n" +
        "        if (k in arr) {\n" +
        "            return;\n" +
        "        }\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("Helpers.inOp(arr, k)");
    });

    test('any-typed receiver of `in` keeps the membership helper', () => {
        const input =
        "class T {\n" +
        "    f(c: any, k: string): void {\n" +
        "        if (k in c) {\n" +
        "            return;\n" +
        "        }\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("Helpers.inOp(c, k)");
    });

    test('unproven nested receiver keeps the membership helper', () => {
        const input =
        "interface Cfg { [key: string]: number; }\n" +
        "interface Outer { [key: string]: Cfg; }\n" +
        "class T {\n" +
        "    f(o: Outer, k: string, j: string): void {\n" +
        "        if (j in o[k]) {\n" +
        "            return;\n" +
        "        }\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("((java.util.Map<?, ?>)Helpers.GetValue(o, k)).containsKey(j)");
    });

    // ---- java-17: printed-primitive comparison operands -------------------
    // `.length`, `.indexOf`/`.search`, Math.round and Math.floor/ceil/pow all print
    // through emitters whose Java text is a primitive, so the ordered comparison no
    // longer round-trips through the Object-taking helper.

    test('unproven length receiver compares natively through the int-returning helper', () => {
        const input =
        "class T {\\n" +
        "    f(o: any): boolean {\\n" +
        "        return o.length > 0;\\n" +
        "    }\\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("Helpers.getArrayLength(o) > 0");
        expect(output).not.toContain("Helpers.isGreaterThan");
    });

    test('indexOf result compares natively (int) instead of through the comparison helper', () => {
        const input =
        "class T {\\n" +
        "    f(s: any, needle: any): boolean {\\n" +
        "        return s.indexOf(needle) >= 0;\\n" +
        "    }\\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("Helpers.getIndexOf(s, needle) >= 0");
        expect(output).not.toContain("Helpers.isGreaterThanOrEqual");
    });

    test('zero-argument indexOf (no printed helper route) keeps the comparison helper', () => {
        const input =
        "class T {\\n" +
        "    f(s: any): boolean {\\n" +
        "        return s.indexOf() >= 0;\\n" +
        "    }\\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("Helpers.isGreaterThanOrEqual(s.indexOf(), 0)");
    });

    test('search result (String.indexOf, int) compares natively', () => {
        const input =
        "class T {\\n" +
        "    f(s: any, needle: any): boolean {\\n" +
        "        return s.search(needle) >= 0;\\n" +
        "    }\\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain('((String)s).indexOf(needle) >= 0');
        expect(output).not.toContain("Helpers.isGreaterThanOrEqual");
    });

    test('Math.round result (long, never NaN) compares natively under <', () => {
        const input =
        "class T {\\n" +
        "    f(x: number): boolean {\\n" +
        "        return Math.round(x) < 5;\\n" +
        "    }\\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("Math.round(Double.parseDouble(Helpers.toString(x))) < 5");
        expect(output).not.toContain("Helpers.isLessThan");
    });

    test('Math.floor result (double) keeps `<=` (NaN ordering) and goes native under `>`', () => {
        const lessEqual =
        "class T {\\n" +
        "    f(x: number): boolean {\\n" +
        "        return Math.floor(x) <= 5;\\n" +
        "    }\\n" +
        "}"
        const lessEqualOutput = transpiler.transpileJava(lessEqual).content;
        expect(lessEqualOutput).toContain("Helpers.isLessThanOrEqual((Math.floor(Double.parseDouble(Helpers.toString(x)))), 5)");
        const greater =
        "class T {\\n" +
        "    f(x: number): boolean {\\n" +
        "        return Math.floor(x) > 5;\\n" +
        "    }\\n" +
        "}"
        const greaterOutput = transpiler.transpileJava(greater).content;
        expect(greaterOutput).toContain("(Math.floor(Double.parseDouble(Helpers.toString(x)))) > 5");
        expect(greaterOutput).not.toContain("Helpers.isGreaterThan");
    });

    test('Math.pow result (double) goes native under `>` and keeps `>=`', () => {
        const greater =
        "class T {\\n" +
        "    f(x: number, y: number): boolean {\\n" +
        "        return Math.pow(x, y) > 5;\\n" +
        "    }\\n" +
        "}"
        const greaterOutput = transpiler.transpileJava(greater).content;
        expect(greaterOutput).toContain("Math.pow(Double.parseDouble(Helpers.toString(x)), Double.parseDouble(Helpers.toString(y))) > 5");
        expect(greaterOutput).not.toContain("Helpers.isGreaterThan");
        const greaterEqual =
        "class T {\\n" +
        "    f(x: number, y: number): boolean {\\n" +
        "        return Math.pow(x, y) >= 5;\\n" +
        "    }\\n" +
        "}"
        const greaterEqualOutput = transpiler.transpileJava(greaterEqual).content;
        expect(greaterEqualOutput).toContain("Helpers.isGreaterThanOrEqual(Math.pow(Double.parseDouble(Helpers.toString(x)), Double.parseDouble(Helpers.toString(y))), 5)");
    });

    test('two numeric literals compare natively, a fractional literal one-sidedly', () => {
        const input =
        "class T {\\n" +
        "    f(): boolean {\\n" +
        "        return 1.5 > 1;\\n" +
        "    }\\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("return 1.5 > 1;");
        expect(output).not.toContain("Helpers.isGreaterThan");
    });

    test('a NaN-capable double operand keeps `<` against a primitively-printed side', () => {
        const input =
        "class T {\\n" +
        "    f(x: number): boolean {\\n" +
        "        return Math.floor(x) < 0.5;\\n" +
        "    }\\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("Helpers.isLessThan((Math.floor(Double.parseDouble(Helpers.toString(x)))), 0.5)");
    });

    test('a double value keeps `>=` (isEqual is not exact for ±Infinity / 2^63 saturation)', () => {
        const input =
        "class T {\\n" +
        "    f(x: number): boolean {\\n" +
        "        return Math.floor(x) >= 5;\\n" +
        "    }\\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("Helpers.isGreaterThanOrEqual((Math.floor(Double.parseDouble(Helpers.toString(x)))), 5)");
    });

    test('a small finite double literal compares natively under `<`', () => {
        const input =
        "class T {\\n" +
        "    f(s: any): boolean {\\n" +
        "        return s.search(\"x\") < 1.5;\\n" +
        "    }\\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain('((String)s).indexOf("x") < 1.5');
        expect(output).not.toContain("Helpers.isLessThan");
    });

    test('a long literal above 2^53 keeps the helper once a double is involved', () => {
        const input =
        "class T {\\n" +
        "    f(): boolean {\\n" +
        "        return 9007199254740994 <= 1.5;\\n" +
        "    }\\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("Helpers.isLessThanOrEqual(9007199254740994L, 1.5)");
    });

    test('Object-typed side keeps the comparison helper even when the other side prints a primitive', () => {
        const input =
        "class T {\\n" +
        "    f(a: number, o: any): boolean {\\n" +
        "        return a < o.length;\\n" +
        "    }\\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("Helpers.isLessThan(a, Helpers.getArrayLength(o))");
    });
});

describe('java inOp -> containsKey: declared Map receivers and nullable dicts', () => {
    // the consumer-side hook build/java-local-types.js installs: declaration -> declared
    // Java type, for the names its slices retyped
    const declared = new Map<string, string>();
    const install = (entries: Array<[string, string]>) => {
        declared.clear();
        entries.forEach(([name, type]) => declared.set(name, type));
        (transpiler as any).javaTranspiler.javaDeclaredLocalTypeResolver =
            (declaration: any) => declared.get(String(declaration?.name?.escapedText));
    };
    afterEach(() => {
        (transpiler as any).javaTranspiler.javaDeclaredLocalTypeResolver = undefined;
    });

    test('a receiver declared Map prints containsKey with no cast', () => {
        install([['x', 'java.util.Map<String, Object>']]);
        const input =
        "class T {\n" +
        "    f(x: any, k: string): void {\n" +
        "        if (k in x) {\n" +
        "            return;\n" +
        "        }\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("if (x.containsKey(k))");
        expect(output).not.toContain("Helpers.inOp");
        expect(output).not.toContain("((java.util.Map<?, ?>)x)");
    });

    test('the same receiver with no declared type keeps the helper', () => {
        install([]);
        const input =
        "class T {\n" +
        "    f(x: any, k: string): void {\n" +
        "        if (k in x) {\n" +
        "            return;\n" +
        "        }\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("Helpers.inOp(x, k)");
    });

    test('a declared Map local whose declaration the consumer left Object keeps the helper', () => {
        install([['x', 'Object']]);
        const input =
        "class T {\n" +
        "    f(x: any, k: string): void {\n" +
        "        if (k in x) {\n" +
        "            return;\n" +
        "        }\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("Helpers.inOp(x, k)");
    });

    test('a declared String key unlocks the lookup on an any-typed key', () => {
        install([['x', 'java.util.Map<String, Object>'], ['raw', 'String']]);
        const input =
        "class T {\n" +
        "    f(x: any, raw: any): void {\n" +
        "        if (raw in x) {\n" +
        "            return;\n" +
        "        }\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("if (x.containsKey(raw))");
        expect(output).not.toContain("Helpers.inOp");
    });

    test('a nullable dict receiver prints the guarded containsKey', () => {
        install([]);
        const input =
        "interface D { [key: string]: any; }\n" +
        "class T {\n" +
        "    f(x: D | undefined, k: string): void {\n" +
        "        if (k in x) {\n" +
        "            return;\n" +
        "        }\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("(x != null && ((java.util.Map<?, ?>)x).containsKey(k))");
        expect(output).not.toContain("Helpers.inOp");
    });

    test('a null member joins the same guard', () => {
        install([]);
        const input =
        "interface D { [key: string]: any; }\n" +
        "class T {\n" +
        "    f(x: D | null | undefined, k: string): void {\n" +
        "        if (k in x) {\n" +
        "            return;\n" +
        "        }\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("(x != null && ((java.util.Map<?, ?>)x).containsKey(k))");
        expect(output).not.toContain("Helpers.inOp");
    });

    test('a nullable dict receiver that is a call keeps the helper (single evaluation)', () => {
        install([]);
        const input =
        "interface D { [key: string]: any; }\n" +
        "class T {\n" +
        "    safe(x: any): D | undefined {\n" +
        "        return undefined;\n" +
        "    }\n" +
        "    f(k: string): void {\n" +
        "        if (k in this.safe(1)) {\n" +
        "            return;\n" +
        "        }\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("Helpers.inOp(this.safe(1), k)");
    });

    test('a nullable non-dict union keeps the helper', () => {
        install([]);
        const input =
        "class T {\n" +
        "    f(x: number[] | undefined, k: string): void {\n" +
        "        if (k in x) {\n" +
        "            return;\n" +
        "        }\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("Helpers.inOp(x, k)");
    });

    test('a declared Map field receiver keeps the helper (only names resolve)', () => {
        install([['x', 'java.util.Map<String, Object>']]);
        const input =
        "class T {\n" +
        "    m: any;\n" +
        "    f(k: string): void {\n" +
        "        if (k in this.m) {\n" +
        "            return;\n" +
        "        }\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("Helpers.inOp(this.m, k)");
    });
});

describe('java replaceAll native emission', () => {
    // Literal pattern and replacement on a side-effect-free receiver: the helper's null /
    // empty-pattern guards cannot fire, so the call is emitted as a native String.replace
    // with a null-safe receiver read.
    test('literal pattern and replacement emit String.replace with a null guard', () => {
        const input =
        "class T {\n" +
        "    test(): void {\n" +
        "        const x = \"a-b-c\";\n" +
        "        const y = x.replaceAll(\"-\", \"+\");\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("(x == null ? null : ((String)x).replace(\"-\", \"+\"))");
        expect(output).not.toContain("Helpers.replaceAll");
    });

    test('a property receiver stays native (no call in the read)', () => {
        const input =
        "class T {\n" +
        "    m = \"a-b\";\n" +
        "    test(): void {\n" +
        "        const y = this.m.replaceAll(\"-\", \"+\");\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("(this.m == null ? null : ((String)this.m).replace(\"-\", \"+\"))");
    });

    // Fallbacks: every shape the native rule cannot prove keeps the runtime helper.
    test('a non-literal pattern keeps the helper', () => {
        const input =
        "class T {\n" +
        "    test(p: string): void {\n" +
        "        const x = \"a-b-c\";\n" +
        "        const y = x.replaceAll(p, \"+\");\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("Helpers.replaceAll((String)x, (String)p, (String)\"+\")");
    });

    test('the empty literal pattern keeps the helper (helper is a no-op there)', () => {
        const input =
        "class T {\n" +
        "    test(): void {\n" +
        "        const x = \"a-b-c\";\n" +
        "        const y = x.replaceAll(\"\", \"+\");\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("Helpers.replaceAll((String)x, (String)\"\", (String)\"+\")");
    });

    test('a call receiver keeps the helper (single evaluation of the receiver)', () => {
        const input =
        "class T {\n" +
        "    test(): void {\n" +
        "        const x = \"a-b-c\";\n" +
        "        const y = x.toLowerCase().replaceAll(\"-\", \"+\");\n" +
        "    }\n" +
        "}\n"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("Helpers.replaceAll((String)((String)x).toLowerCase()");
    });

    // java-18: `-`/`*`/`/` on a local the embedding layer declares `Long`/`Double` print
    // natively; the embedding layer (build/java-local-types.js) installs the resolver, so
    // the tests below fake it with a name table.
    const withNumericLocals = (javaTypes: any, body: () => void) => {
        const printer: any = (transpiler as any).javaTranspiler;
        const previous = printer.javaExpressionTypeResolver;
        printer.javaExpressionTypeResolver = (node: any) => javaTypes[node.escapedText];
        try {
            body();
        } finally {
            printer.javaExpressionTypeResolver = previous;
        }
    };

    test('a Long-declared local subtracts an integer literal natively', () => {
        withNumericLocals({ now: 'Long' }, () => {
            const input =
            "class T {\n" +
            "    f(): void {\n" +
            "        const now: number = this.milliseconds();\n" +
            "        const x = now - 7776000000;\n" +
            "    }\n" +
            "}"
            const output = transpiler.transpileJava(input).content;
            expect(output).toContain('Long x = (now - 7776000000L);');
            expect(output).not.toContain('Helpers.subtract(');
        });
    });

    test('two Long-declared locals multiply natively', () => {
        withNumericLocals({ a: 'Long', b: 'Long' }, () => {
            const input =
            "class T {\n" +
            "    f(): void {\n" +
            "        const a: number = this.milliseconds();\n" +
            "        const b: number = this.milliseconds();\n" +
            "        const x = a * b;\n" +
            "    }\n" +
            "}"
            const output = transpiler.transpileJava(input).content;
            expect(output).toContain('Long x = (a * b);');
            expect(output).not.toContain('Helpers.multiply(');
        });
    });

    test('a Double-declared local divides natively as a double division', () => {
        withNumericLocals({ ratio: 'Double' }, () => {
            const input =
            "class T {\n" +
            "    f(): void {\n" +
            "        const ratio: number = this.milliseconds();\n" +
            "        const x = ratio / 1000;\n" +
            "    }\n" +
            "}"
            const output = transpiler.transpileJava(input).content;
            expect(output).toContain('Double x = (((double) ratio) / ((double) 1000));');
            expect(output).not.toContain('Helpers.divide(');
        });
    });

    test('a nullable local keeps the subtract helper (a null box would NPE)', () => {
        withNumericLocals({ until: 'Long' }, () => {
            const input =
            "class T {\n" +
            "    f(): void {\n" +
            "        let until: number | undefined = undefined;\n" +
            "        const x = until - 1;\n" +
            "    }\n" +
            "}"
            const output = transpiler.transpileJava(input).content;
            expect(output).toContain('Helpers.subtract(until, 1);');
        });
    });

    test('a Double-declared local keeps multiply (an integral double product re-boxes as Long)', () => {
        withNumericLocals({ ratio: 'Double' }, () => {
            const input =
            "class T {\n" +
            "    f(): void {\n" +
            "        const ratio: number = this.milliseconds();\n" +
            "        const x = ratio * 2;\n" +
            "    }\n" +
            "}"
            const output = transpiler.transpileJava(input).content;
            expect(output).toContain('Object x = Helpers.multiply(ratio, 2);');
        });
    });

    test('a declared Long local adds an integer literal natively (D-14 widened add)', () => {
        withNumericLocals({ now: 'Long' }, () => {
            const input =
            "class T {\n" +
            "    f(): void {\n" +
            "        const now: number = this.milliseconds();\n" +
            "        const x = now + 1;\n" +
            "    }\n" +
            "}"
            const output = transpiler.transpileJava(input).content;
            expect(output).toContain('Object x = (now + 1L);');
            expect(output).not.toContain('Helpers.add(now, 1)');
        });
    });

    // D-14: the production proof source is the embedding layer's declared-local table
    // (build/java-local-types.js#installJavaDeclaredLocalTypes records the printed type of
    // every declaration the local-typing chain wrote); the tests fake that table.
    const withDeclaredLocalTypes = (javaTypes: any, body: () => void) => {
        const printer: any = (transpiler as any).javaTranspiler;
        const previous = printer.javaDeclaredLocalTypeResolver;
        printer.javaDeclaredLocalTypeResolver = (declaration: any) => javaTypes[declaration?.name?.escapedText];
        try {
            body();
        } finally {
            printer.javaDeclaredLocalTypeResolver = previous;
        }
    };

    test('two Integer-declared locals multiply with an explicit long widening', () => {
        withDeclaredLocalTypes({ maxDistance: 'Integer', msInDay: 'Integer' }, () => {
            const input =
            "class T {\n" +
            "    f(): void {\n" +
            "        const maxDistance = 20;\n" +
            "        const msInDay = 86400000;\n" +
            "        const x = maxDistance * msInDay;\n" +
            "    }\n" +
            "}"
            const output = transpiler.transpileJava(input).content;
            expect(output).toContain('Long x = (((long) maxDistance) * ((long) msInDay));');
            expect(output).not.toContain('Helpers.multiply(');
        });
    });

    test('a literal-typed Integer local subtracts a declared Long local natively', () => {
        withDeclaredLocalTypes({ msInDay: 'Integer', now: 'Long' }, () => {
            const input =
            "class T {\n" +
            "    f(): void {\n" +
            "        const msInDay = 86400000;\n" +
            "        const now = 1;\n" +
            "        const x = now - msInDay;\n" +
            "    }\n" +
            "}"
            const output = transpiler.transpileJava(input).content;
            expect(output).toContain('Long x = (now - ((long) msInDay));');
            expect(output).not.toContain('Helpers.subtract(');
        });
    });

    test('an Object-declared local keeps the subtract helper (the box may hold null)', () => {
        withDeclaredLocalTypes({ since: 'Object' }, () => {
            const input =
            "class T {\n" +
            "    f(): void {\n" +
            "        const since: number = 1;\n" +
            "        const x = since - 1;\n" +
            "    }\n" +
            "}"
            const output = transpiler.transpileJava(input).content;
            expect(output).toContain('Object x = Helpers.subtract(since, 1);');
        });
    });

    test('an int-declared local divides natively as a double division', () => {
        withDeclaredLocalTypes({ timeframeMs: 'int' }, () => {
            const input =
            "class T {\n" +
            "    f(): void {\n" +
            "        const timeframeMs: number = 1000;\n" +
            "        const x = timeframeMs / 1000;\n" +
            "    }\n" +
            "}"
            const output = transpiler.transpileJava(input).content;
            expect(output).toContain('Double x = (((double) timeframeMs) / ((double) 1000));');
            expect(output).not.toContain('Helpers.divide(');
        });
    });

    test('a nullable declared numeric keeps the add helper (a null box would NPE)', () => {
        withNumericLocals({ until: 'Long' }, () => {
            const input =
            "class T {\n" +
            "    f(): void {\n" +
            "        const until: number | undefined = undefined;\n" +
            "        const x = until + 1;\n" +
            "    }\n" +
            "}"
            const output = transpiler.transpileJava(input).content;
            expect(output).toContain('Helpers.add(until, 1)');
        });
    });

    test('a cast operand keeps the helper', () => {
        withNumericLocals({ now: 'Long' }, () => {
            const input =
            "class T {\n" +
            "    f(): void {\n" +
            "        const now: number = this.milliseconds();\n" +
            "        const x = (now as number) - 1;\n" +
            "    }\n" +
            "}"
            const output = transpiler.transpileJava(input).content;
            expect(output).toContain('Helpers.subtract(now, 1);');
        });
    });


    test('without the embedding layer table a numeric local keeps the helper', () => {
        const input =
        "class T {\n" +
        "    f(): void {\n" +
        "        const now: number = this.milliseconds();\n" +
        "        const x = now - 1;\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain('Object x = Helpers.subtract(now, 1);');
    });
});

describe('falsy-wrapper removal: boolean identifiers and Array.isArray', () => {
    const wrapped = (body: string, extra = '', signature = 'test(x: any): void') => {
        const input =
        "class T {\n" +
        "    newUpdates: boolean = true;\n" +
        "    secret: string = '';\n" +
        "    verbose: boolean = false;\n" +
        "    other: object = {};\n" +
        "    isBool (): boolean { return true; }\n" +
        "    valueIsDefined (v: any): boolean { return true; }\n" +
        "    isBoolNamed (v: any): string { return ''; }\n" +
        "    newUpdatesString (): string { return ''; }\n" +
        "    " + signature + " {\n" +
        body +
        "    }\n" +
        extra +
        "}\n"
        return transpiler.transpileJava(input).content;
    };

    test('a boolean field read drops the wrapper and keeps the native Java boolean', () => {
        const output = wrapped("        if (this.newUpdates) { return; }\n" +
            "        if (!this.verbose) { return; }\n");
        expect(output).toContain("if (this.newUpdates)");
        expect(output).toContain("if (!this.verbose)");
        expect(output).not.toContain("Helpers.isTrue(");
    });

    test('a non-boolean field read keeps the helper', () => {
        // secret is a String field, other is an object: their truthiness is the helper's job
        const output = wrapped("        if (this.secret) { return; }\n" +
            "        if (this.other) { return; }\n");
        expect(output).toContain("if (Helpers.isTrue(this.secret))");
        expect(output).toContain("if (Helpers.isTrue(this.other))");
    });

    test('a field the checker does not type boolean keeps the helper even when named like a bool field', () => {
        const output = wrapped("        if (this.newUpdatesString()) { return; }\n");
        expect(output).toContain("Helpers.isTrue(this.newUpdatesString())");
        const shadowed = wrapped("        if (this.newUpdates) { return; }\n", '', 'test(x: any): void');
        expect(shadowed).toContain("if (this.newUpdates)");
    });

    test('a local holding a Boolean box prints Boolean.TRUE.equals', () => {
        const output = wrapped("        const ok: boolean = true;\n" +
            "        if (ok) { return; }\n" +
            "        if (!ok) { return; }\n");
        expect(output).toContain("if (Boolean.TRUE.equals(ok))");
        expect(output).toContain("if (!Boolean.TRUE.equals(ok))");
        expect(output).not.toContain("Helpers.isTrue(ok)");
    });

    test('comparison / logical / literal / hand-written boolean initialisers are all proven', () => {
        const output = wrapped("        const a: boolean = (x === 1);\n" +
            "        const b: boolean = (a && x !== 2);\n" +
            "        const c: boolean = !(x in this.options);\n" +
            "        const d: boolean = this.valueIsDefined(x);\n" +
            "        if (a && b) { return; }\n" +
            "        if (c) { return; }\n" +
            "        if (d) { return; }\n");
        expect(output).toContain("if (Boolean.TRUE.equals(a) && Boolean.TRUE.equals(b))");
        expect(output).toContain("if (Boolean.TRUE.equals(c))");
        expect(output).toContain("if (Boolean.TRUE.equals(d))");
    });

    test('a local bound to a generated boolean-returning method prints Boolean.TRUE.equals (d13)', () => {
        // the box is the call's own proven box: every return of the resolved body prints a
        // Java boolean value, so the local can never hold anything else
        const output = wrapped("        const a: boolean = this.isBool();\n" +
            "        if (a) { return; }");
        expect(output).toContain("if (Boolean.TRUE.equals(a))");
        expect(output).not.toContain("Helpers.isTrue(a)");
        // an unproven callee body (string return / a bare local) keeps the helper
        const unproven = wrapped("        const b: boolean = this.isBoolNamed(x);\n" +
            "        if (b) { return; }");
        expect(unproven).toContain("if (Helpers.isTrue(b))");
    });

    test('a later non-boolean write keeps the box (D2 scan)', () => {
        const output = wrapped("        let a: boolean = false;\n" +
            "        a = x;\n" +
            "        if (a) { return; }\n");
        expect(output).toContain("if (Helpers.isTrue(a))");
    });

    test('a later boolean write keeps the rewrite', () => {
        const output = wrapped("        let a: boolean = false;\n" +
            "        a = (x === 1);\n" +
            "        if (a) { return; }\n");
        expect(output).toContain("if (Boolean.TRUE.equals(a))");
    });

    test('nullable, any and parameter identifiers keep the helper', () => {
        const output = wrapped("        if (maybe) { return; }\n", '', 'test(x: any, maybe: boolean | undefined): void');
        expect(output).toContain("if (Helpers.isTrue(maybe))");
        const implicitAny = wrapped("        let a;\n        if (a) { return; }\n");
        expect(implicitAny).toContain("if (Helpers.isTrue(a))");
        const parameter = wrapped("        if (flag) { return; }\n", '', 'test(x: any, flag: boolean): void');
        expect(parameter).toContain("if (Helpers.isTrue(flag))");
    });

    test('a destructured binding element keeps the helper', () => {
        // a binding element is fed by the container, so its box is not proven boolean here
        const output = wrapped("        const [a, b] = x;\n" +
            "        if (b) { return; }\n");
        expect(output).toContain("if (Helpers.isTrue(b))");
    });

    test('Array.isArray prints instanceof List, negated and inside a logical expression too', () => {
        const output = wrapped("        if (Array.isArray(x)) { return; }\n" +
            "        if (!Array.isArray(x)) { return; }\n" +
            "        if (Array.isArray(x) && this.newUpdates) { return; }\n");
        expect(output).toContain("if ((x instanceof java.util.List))");
        expect(output).toContain("if (!(x instanceof java.util.List))");
        expect(output).toContain("if ((x instanceof java.util.List) && this.newUpdates)");
        expect(output).not.toContain("Helpers.isArray(");
        expect(output).not.toContain("Helpers.isTrue(");
    });

    test('a ternary condition and a while condition unwrap the same way', () => {
        const output = wrapped("        while (this.newUpdates) { x = 1; }\n" +
            "        return (this.verbose) ? 1 : 2;\n", '', 'test(x: any)');
        expect(output).toContain("while (this.newUpdates)");
        expect(output).toContain("((this.verbose)) ? 1 : 2");
        expect(output).not.toContain("Helpers.isTrue(");
    });
});

describe('java native indexOf (Helpers.getIndexOf -> String/List.indexOf)', () => {
    // a receiver the checker types as a plain string: String.indexOf(target) is the same
    // call the helper performs for that receiver, with -1 for a missing target on both paths
    test('checker-proven string receiver with a literal target prints String.indexOf', () => {
        const input =
        "class T {\n" +
        "    test(s: string): void {\n" +
        "        const i = s.indexOf(\".\");\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("((String)s).indexOf(\".\")");
        expect(output).not.toContain("Helpers.getIndexOf");
    });

    test('string receiver with a string-typed identifier target casts the target too', () => {
        const input =
        "class T {\n" +
        "    test(s: string, t: string): void {\n" +
        "        const i = s.indexOf(t);\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("((String)s).indexOf(((String)t))");
        expect(output).not.toContain("Helpers.getIndexOf");
    });

    // a List receiver: List.indexOf(target) is literally the call Helpers.getIndexOf makes
    // for that receiver, and List.indexOf takes any Object target
    test('checker-proven list receiver prints List.indexOf and keeps an untyped target', () => {
        const input =
        "class T {\n" +
        "    test(xs: string[], y: any): void {\n" +
        "        const i = xs.indexOf(y);\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("((java.util.List<?>)xs).indexOf(y)");
        expect(output).not.toContain("Helpers.getIndexOf");
    });

    // fallbacks: every shape without the proof keeps the runtime helper
    test('an any receiver keeps the helper', () => {
        const input =
        "class T {\n" +
        "    test(x: any): void {\n" +
        "        const i = x.indexOf(\"a\");\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("Helpers.getIndexOf(x, \"a\")");
    });

    test('a nullable/nullable-union receiver keeps the helper', () => {
        const input =
        "class T {\n" +
        "    test(s: string | undefined): void {\n" +
        "        const i = s.indexOf(\"a\");\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("Helpers.getIndexOf(s, \"a\")");
    });

    test('a string receiver with an untyped target keeps the helper', () => {
        const input =
        "class T {\n" +
        "    test(s: string, t: any): void {\n" +
        "        const i = s.indexOf(t);\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("Helpers.getIndexOf(s, t)");
    });

    test('a rest parameter (varargs array, not a List) keeps the helper', () => {
        const input =
        "class T {\n" +
        "    test(...xs: string[]): void {\n" +
        "        const i = xs.indexOf(\"a\");\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("Helpers.getIndexOf(xs, \"a\")");
    });
});

describe('java native split (Helpers.split -> Arrays.asList(String.split(Pattern.quote)))', () => {
    // a receiver the checker types as a plain string with a literal separator: the emitted
    // text is Helpers.split's own body without its String.valueOf/String branch, which is
    // unreachable for a plain string, and with the separator quoted exactly as the helper
    // quotes it (Pattern.quote), so a regex metacharacter stays a literal separator
    test('checker-proven string receiver with a literal separator prints the native split', () => {
        const input =
        "class T {\n" +
        "    test(s: string): void {\n" +
        "        const parts = s.split(',');\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("new java.util.ArrayList<Object>(java.util.Arrays.asList(((String)s).split(java.util.regex.Pattern.quote(\",\"))))");
        expect(output).not.toContain("Helpers.split");
    });

    test('a regex metacharacter separator is quoted, not passed as a pattern', () => {
        const input =
        "class T {\n" +
        "    test(s: string): void {\n" +
        "        const parts = s.split('?dt=');\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("java.util.regex.Pattern.quote(\"?dt=\")");
        expect(output).not.toContain("Helpers.split");
    });

    test('a string-literal receiver prints the native split', () => {
        const input =
        "class T {\n" +
        "    test(): void {\n" +
        "        const parts = 'a,b'.split(',');\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("new java.util.ArrayList<Object>(java.util.Arrays.asList(((String)\"a,b\").split(java.util.regex.Pattern.quote(\",\"))))");
        expect(output).not.toContain("Helpers.split");
    });

    test('an element read from a string array is a plain string and prints the native split', () => {
        const input =
        "class T {\n" +
        "    test(xs: string[]): void {\n" +
        "        const s = xs[0];\n" +
        "        const parts = s.split('/');\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("new java.util.ArrayList<Object>(java.util.Arrays.asList(((String)s).split(java.util.regex.Pattern.quote(\"/\"))))");
        expect(output).not.toContain("Helpers.split");
    });

    // fallbacks: every shape without the proof keeps the runtime helper
    test('an any receiver keeps the helper', () => {
        const input =
        "class T {\n" +
        "    test(x: any): void {\n" +
        "        const parts = x.split(',');\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("Helpers.split(x, \",\")");
    });

    test('a nullable alias receiver keeps the helper', () => {
        const input =
        "class T {\n" +
        "    test(s: Str): void {\n" +
        "        const parts = s.split(',');\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("Helpers.split(s, \",\")");
    });

    test('a nullable-union receiver keeps the helper', () => {
        const input =
        "class T {\n" +
        "    test(s: string | undefined): void {\n" +
        "        const parts = s.split(',');\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("Helpers.split(s, \",\")");
    });

    test('a non-literal separator keeps the helper', () => {
        const input =
        "class T {\n" +
        "    test(s: string, sep: string): void {\n" +
        "        const parts = s.split(sep);\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("Helpers.split(s, sep)");
    });

    test('a two-argument split keeps the helper (the printed call drops no limit)', () => {
        const input =
        "class T {\n" +
        "    test(s: string): void {\n" +
        "        const parts = s.split(',', 2);\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("Helpers.split(s, \",\")");
    });

    test('a conditional receiver keeps the helper (no added line carries a `?`)', () => {
        const input =
        "class T {\n" +
        "    test(c: boolean, a: string, b: string): void {\n" +
        "        const parts = (c ? a : b).split(',');\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("Helpers.split(");
        expect(output).toContain("? a : b");
    });
});

describe('java Math.min/Math.max native emission', () => {
    // Helpers.mathMin/mathMax take Object and hand the ORIGINAL operand box back (null when
    // either operand is null); java.lang.Math.min/max take primitives, so the native call is
    // emitted only when BOTH operands print as primitives of one numeric family: int/long
    // literals, `.length`/`.size()` and native long arithmetic are integral, a double literal
    // is the only NaN-free double.
    test('an integer literal and a proved integer .length emit Math.max', () => {
        const input =
        "class T {\n" +
        "    test(s: string, list: any[]): void {\n" +
        "        const a = Math.max (5, s.length);\n" +
        "        const b = Math.min (3, list.length);\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("Object a = Math.max(5, ((String)s).length());");
        expect(output).toContain("Object b = Math.min(3, ((java.util.List<?>)list).size());");
        expect(output).not.toContain("Helpers.mathMax(");
        expect(output).not.toContain("Helpers.mathMin(");
    });

    test('two double literals emit Math.min (a computed double can be NaN and keeps the helper)', () => {
        const input =
        "class T {\n" +
        "    test(a: number, b: number): void {\n" +
        "        const x = Math.min (1.5, 2.5);\n" +
        "        const y = Math.min (a / 100, b);\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("Object x = Math.min(1.5, 2.5);");
        expect(output).toContain("Helpers.mathMin(");
    });

    test('native long arithmetic of literals emits Math.min', () => {
        const input =
        "class T {\n" +
        "    test(): void {\n" +
        "        const x = Math.min (1 + 2, 4);\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("Object x = Math.min((1L + 2L), 4);");
    });

    // Fallbacks: every shape the native rule cannot prove keeps the runtime helper.
    test('an Object local operand keeps the helper', () => {
        const input =
        "class T {\n" +
        "    test(list: any[], params: any): void {\n" +
        "        const x = Math.min (10, params['limit']);\n" +
        "        const y = Math.min (list.length, params['limit']);\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("Helpers.mathMin(10, Helpers.GetValue(parameters, \"limit\"))");
        expect(output).toContain("Helpers.mathMin(");
        expect(output).not.toContain("Math.min(");
    });

    test('mixed int and double literal operands keep the helper (box kind would change)', () => {
        const input =
        "class T {\n" +
        "    test(): void {\n" +
        "        const x = Math.min (5, 1.5);\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("Helpers.mathMin(5, 1.5)");
    });

    test('an `as number` operand keeps the helper', () => {
        const input =
        "class T {\n" +
        "    test(limit: any): void {\n" +
        "        const x = Math.min ((limit as number), 100);\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("Helpers.mathMin(limit, 100)");
    });

    test('a receiver position keeps the helper (a primitive has no members)', () => {
        const input =
        "class T {\n" +
        "    test(s: string): void {\n" +
        "        const x = Math.min (5, s.length).toString ();\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("String.valueOf(Helpers.mathMin(5, ((String)s).length()))");
        expect(output).not.toContain("Math.min(");
    });
});

describe('java slice native emission (Helpers.slice -> substring / subList)', () => {
    // Literal bounds on a checker-proven String/List receiver: JS clamps both bounds into
    // [0, length], which the native call reproduces with Math.min / Math.max over the
    // receiver length behind the helper's null -> null guard.
    test('two literal bounds emit substring with min-clamped start and end', () => {
        const input =
        "class T {\n" +
        "    f(s: string): void {\n" +
        "        const y = s.slice(0, 2);\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("(s == null ? null : ((String)s).substring(0, Math.min(2, ((String)s).length())))");
        expect(output).not.toContain("Helpers.slice");
    });

    test('a negative start counts from the end and clamps at zero', () => {
        const input =
        "class T {\n" +
        "    f(s: string): void {\n" +
        "        const y = s.slice(-64);\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("(s == null ? null : ((String)s).substring(Math.max(((String)s).length() - 64, 0)))");
    });

    test('a single positive bound keeps the open end', () => {
        const input =
        "class T {\n" +
        "    f(s: string): void {\n" +
        "        const y = s.slice(18);\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("(s == null ? null : ((String)s).substring(Math.min(18, ((String)s).length())))");
    });

    test('a negative end clamps from the end', () => {
        const input =
        "class T {\n" +
        "    f(s: string): void {\n" +
        "        const y = s.slice(0, -1);\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("(s == null ? null : ((String)s).substring(0, Math.max(((String)s).length() - 1, 0)))");
    });

    test('two ordered negative bounds are both measured from the end', () => {
        const input =
        "class T {\n" +
        "    f(s: string): void {\n" +
        "        const y = s.slice(-5, -1);\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("substring(Math.max(((String)s).length() - 5, 0), Math.max(((String)s).length() - 1, 0))");
    });

    // A bound pair whose order is not provable for every length keeps substring valid by
    // taking the smaller of the two as the start: an inverted pair is the empty slice.
    test('an unprovably ordered pair guards the start with Math.min', () => {
        const input =
        "class T {\n" +
        "    f(s: string): void {\n" +
        "        const y = s.slice(-8, 5);\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("substring(Math.min(Math.max(((String)s).length() - 8, 0), Math.min(5, ((String)s).length())), Math.min(5, ((String)s).length()))");
    });

    test('a proven List receiver emits subList with size-clamped bounds', () => {
        const input =
        "class T {\n" +
        "    f(xs: string[]): void {\n" +
        "        const y = xs.slice(0, 2);\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("(xs == null ? null : ((java.util.List<Object>)xs).subList(0, Math.min(2, ((java.util.List<Object>)xs).size())))");
        expect(output).not.toContain("Helpers.slice");
    });

    // Fallbacks: every shape the native rule cannot prove keeps the runtime helper.
    test('a non-literal bound keeps the helper', () => {
        const input =
        "class T {\n" +
        "    f(s: string, a: number): void {\n" +
        "        const y = s.slice(a, 2);\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("Helpers.slice(s, a, 2)");
    });

    test('an unproven (any) receiver keeps the helper', () => {
        const input =
        "class T {\n" +
        "    f(s: any): void {\n" +
        "        const y = s.slice(0, 2);\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("Helpers.slice(s, 0, 2)");
    });

    test('a nullable string receiver keeps the helper', () => {
        const input =
        "class T {\n" +
        "    f(s: string | undefined): void {\n" +
        "        const y = s.slice(0, 2);\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("Helpers.slice(s, 0, 2)");
    });

    test('a call receiver keeps the helper (single evaluation of the receiver)', () => {
        const input =
        "class T {\n" +
        "    f(s: string): void {\n" +
        "        const y = s.trim().slice(0, 2);\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("Helpers.slice(((String)s).trim(), 0, 2)");
    });

    test('a varargs array receiver keeps the helper (it is an array, not a List)', () => {
        const input =
        "class T {\n" +
        "    f(...xs: any[]): void {\n" +
        "        const y = xs.slice(0, 2);\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("Helpers.slice(xs, 0, 2)");
    });

    test('a non-integer bound keeps the helper', () => {
        const input =
        "class T {\n" +
        "    f(s: string): void {\n" +
        "        const y = s.slice(0.5, 2);\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("Helpers.slice(s, 0.5, 2)");
    });

    test('a bound outside the Java int range keeps the helper', () => {
        const input =
        "class T {\n" +
        "    f(s: string): void {\n" +
        "        const y = s.slice(0, 9007199254740993);\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("Helpers.slice(s, 0, 9007199254740992L)");
    });
});

describe('java parseInt/parseFloat/toString/padStart native emission', () => {
    test('parseInt/parseFloat of a string literal the native parser accepts print the native parse', () => {
        const input =
        "class T {\n" +
        "    f(): void {\n" +
        "        const a = parseInt(\"8\");\n" +
        "        const b = parseInt(\"+7\");\n" +
        "        const c = parseInt(\"-3\");\n" +
        "        const d = parseFloat(\"1.5\");\n" +
        "        const e = parseFloat(\"1e3\");\n" +
        "        const g = parseFloat(\"NaN\");\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain('Object a = Long.parseLong("8");');
        expect(output).toContain('Object b = Long.parseLong("+7");');
        expect(output).toContain('Object c = Long.parseLong("-3");');
        expect(output).toContain('Object d = Double.parseDouble("1.5");');
        expect(output).toContain('Object e = Double.parseDouble("1e3");');
        expect(output).toContain('Object g = Double.parseDouble("NaN");');
        expect(output).not.toContain("Helpers.parseInt(");
        expect(output).not.toContain("Helpers.parseFloat(");
    });

    test('parseInt/parseFloat of a literal the native parser rejects keep the helper', () => {
        // the helper catches the NumberFormatException (null / 0.0); the native call throws
        const input =
        "class T {\n" +
        "    f(): void {\n" +
        "        const a = parseInt(\"1.5\");\n" +
        "        const b = parseInt(\" 8\");\n" +
        "        const c = parseInt(\"0x10\");\n" +
        "        const d = parseInt(\"99999999999999999999\");\n" +
        "        const e = parseFloat(\"abc\");\n" +
        "        const g = parseFloat(\" 1.5\");\n" +
        "        const h = parseFloat(\"1.5f\");\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain('Object a = Helpers.parseInt("1.5");');
        expect(output).toContain('Object b = Helpers.parseInt(" 8");');
        expect(output).toContain('Object c = Helpers.parseInt("0x10");');
        expect(output).toContain('Object d = Helpers.parseInt("99999999999999999999");');
        expect(output).toContain('Object e = Helpers.parseFloat("abc");');
        expect(output).toContain('Object g = Helpers.parseFloat(" 1.5");');
        expect(output).toContain('Object h = Helpers.parseFloat("1.5f");');
        expect(output).not.toContain("Long.parseLong(");
        expect(output).not.toContain("Double.parseDouble(");
    });

    test('parseInt/parseFloat of a non-literal keep the helper', () => {
        const input =
        "class T {\n" +
        "    f(s: string): void {\n" +
        "        const a = parseInt(s);\n" +
        "        const b = parseFloat(s);\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("Object a = Helpers.parseInt(s);");
        expect(output).toContain("Object b = Helpers.parseFloat(s);");
    });

    test('Math.* Helpers.toString -> String.valueOf when the argument cannot be null', () => {
        const input =
        "class T {\n" +
        "    f(): void {\n" +
        "        const a = Math.floor(10);\n" +
        "        const b = Math.round(1.5);\n" +
        "        const c = Math.ceil((2 * 3) * 4);\n" +
        "        const d = Math.pow(2, 8);\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("(Math.floor(Double.parseDouble(String.valueOf(10))))");
        expect(output).toContain("Math.round(Double.parseDouble(String.valueOf(1.5)))");
        expect(output).toContain("Math.ceil(Double.parseDouble(String.valueOf((((2L * 3L)) * 4L))))");
        expect(output).toContain("Math.pow(Double.parseDouble(String.valueOf(2)), Double.parseDouble(String.valueOf(8)))");
        expect(output).not.toContain("Helpers.toString(");
    });

    test('Math.* Helpers.toString stays when the argument is not provably non-null', () => {
        const input =
        "class T {\n" +
        "    f(o: any): void {\n" +
        "        const a = Math.floor(o);\n" +
        "        const b = Math.pow(10, o);\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("(Math.floor(Double.parseDouble(Helpers.toString(o))))");
        expect(output).toContain("Math.pow(Double.parseDouble(String.valueOf(10)), Double.parseDouble(Helpers.toString(o)))");
        expect(output).not.toContain("String.valueOf(o)");
    });

    test('padStart with a literal length and pad prints the native pad+truncate form', () => {
        const input =
        "class T {\n" +
        "    f(value: string): void {\n" +
        "        const a = value.padStart(8, '0');\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("((String)value).length() >= 8 ? ((String)value).substring(((String)value).length() - 8)");
        expect(output).toContain('String.format("%" + (8 - ((String)value).length()) + "s", "").replace(\' \', \'0\') + ((String)value)');
        expect(output).not.toContain("Helpers.padStart(");
    });

    test('padStart keeps the helper without a literal length, literal pad, or proven String receiver', () => {
        const input =
        "class T {\n" +
        "    f(value: string, n: number, pad: string, o: any): void {\n" +
        "        const a = value.padStart(n, '0');\n" +
        "        const b = value.padStart(8, pad);\n" +
        "        const c = o.padStart(8, '0');\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("Helpers.padStart((String)value, ((Number)n).intValue(), ((String)\"0\").charAt(0))");
        expect(output).toContain("Helpers.padStart((String)value, ((Number)8).intValue(), ((String)pad).charAt(0))");
        expect(output).toContain("Helpers.padStart((String)o, ((Number)8).intValue(), ((String)\"0\").charAt(0))");
        expect(output).not.toContain("String.format(");
    });

    test('padStart keeps the helper for a receiver that is a call (evaluate once)', () => {
        const input =
        "class T {\n" +
        "    g(): string { return \"x\"; }\n" +
        "    f(): void {\n" +
        "        const a = this.g().padStart(4, '0');\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("Helpers.padStart((String)this.g(), ((Number)4).intValue(), ((String)\"0\").charAt(0))");
        expect(output).not.toContain("String.format(");
    });

    // Helper-removal (java-28): `Promise.all ([...])` whose every element is
    // checker-typed `Promise<...>` prints CompletableFuture.allOf instead of the
    // reflective Helpers.promiseAll loop; anything unproven keeps the helper.
    const promiseAllSnippet = (body: string) =>
        "class T {\n" +
        "    async fetchA (): Promise<number> {\n" +
        "        return 1;\n" +
        "    }\n" +
        "    async fetchB (): Promise<string> {\n" +
        "        return 'x';\n" +
        "    }\n" +
        body +
        "}\n";

    test('a discarded Promise.all of typed futures prints CompletableFuture.allOf', () => {
        const input = promiseAllSnippet(
            "    async discarded (): Promise<void> {\n" +
            "        await Promise.all ([ this.fetchA (), this.fetchB () ]);\n" +
            "    }\n");
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain('(java.util.concurrent.CompletableFuture.allOf(((java.util.concurrent.CompletableFuture<?>) this.fetchA()), ((java.util.concurrent.CompletableFuture<?>) this.fetchB()))).join();');
        expect(output).not.toContain('Helpers.promiseAll');
    });

    test('a used Promise.all of const-bound typed futures collects the values natively', () => {
        const input = promiseAllSnippet(
            "    async destructured (): Promise<void> {\n" +
            "        const a = this.fetchA ();\n" +
            "        const b = this.fetchB ();\n" +
            "        const [ x, y ] = await Promise.all ([ a, b ]);\n" +
            "    }\n");
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain('java.util.concurrent.CompletableFuture.allOf(((java.util.concurrent.CompletableFuture<?>) a), ((java.util.concurrent.CompletableFuture<?>) b)).thenApply(promiseAllValue -> new java.util.ArrayList<Object>(java.util.Arrays.asList(((java.util.concurrent.CompletableFuture<?>) a).join(), ((java.util.concurrent.CompletableFuture<?>) b).join())))');
        expect(output).not.toContain('Helpers.promiseAll');
    });

    test('a consumed Promise.all whose element is not const-bound keeps the helper', () => {
        const input = promiseAllSnippet(
            "    async test (): Promise<void> {\n" +
            "        const a = this.fetchA ();\n" +
            "        let b = this.fetchB ();\n" +
            "        const results = await Promise.all ([ a, b ]);\n" +
            "    }\n");
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain('Helpers.promiseAll(new java.util.ArrayList<Object>(java.util.Arrays.asList(a, b)))');
    });

    test('a consumed Promise.all with a call element keeps the helper (single evaluation)', () => {
        const input = promiseAllSnippet(
            "    async test (): Promise<void> {\n" +
            "        const results = await Promise.all ([ this.fetchA (), this.fetchB () ]);\n" +
            "    }\n");
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain('Helpers.promiseAll(new java.util.ArrayList<Object>(java.util.Arrays.asList(this.fetchA(), this.fetchB())))');
    });

    test('a Promise.all over a list variable keeps the helper (element types unknown)', () => {
        const input = promiseAllSnippet(
            "    async test (): Promise<void> {\n" +
            "        const tasks: Promise<any>[] = [ this.fetchA () ];\n" +
            "        const results = await Promise.all (tasks);\n" +
            "    }\n");
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain('Helpers.promiseAll(tasks)');
    });

    test('a Promise.all with non-promise elements keeps the helper', () => {
        const input = promiseAllSnippet(
            "    async test (): Promise<void> {\n" +
            "        await Promise.all ([ 1, 2 ]);\n" +
            "    }\n");
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain('Helpers.promiseAll(new java.util.ArrayList<Object>(java.util.Arrays.asList(1, 2)))');
    });
});

describe('java native-arithmetic locals (java-31)', () => {
    test('a native concat initializer declares the local String', () => {
        const input =
        "class T {\n" +
        "    f(symbol: string, settle: string): void {\n" +
        "        const futuresSymbol = symbol + ':' + settle;\n" +
        "        this.g(futuresSymbol);\n" +
        "    }\n" +
        "    g(...args: any[]): void {}\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain('String futuresSymbol = ((symbol + ":") + settle);');
        expect(output).not.toContain('Object futuresSymbol');
    });

    test('a native long initializer declares the local Long', () => {
        const input =
        "class T {\n" +
        "    f(): void {\n" +
        "        const oneWeek = 7 * 24 * 60 * 60 * 1000;\n" +
        "        this.g(oneWeek);\n" +
        "    }\n" +
        "    g(...args: any[]): void {}\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain('Long oneWeek = ((((7L * 24L) * 60L) * 60L) * 1000L);');
    });

    test('a native double initializer declares the local Double', () => {
        const input =
        "class T {\n" +
        "    f(): void {\n" +
        "        const ratio = 10 / 4;\n" +
        "        this.g(ratio);\n" +
        "    }\n" +
        "    g(...args: any[]): void {}\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain('Double ratio = (((double) 10) / ((double) 4));');
    });

    test('an initializer that keeps the helper also keeps the Object declaration', () => {
        const input =
        "class T {\n" +
        "    f(a: Str, b: Str): void {\n" +
        "        const x = a + b;\n" +
        "        this.g(x);\n" +
        "    }\n" +
        "    g(...args: any[]): void {}\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain('Object x = Helpers.add(a, b);');
    });

    test('a later write of a helper result keeps the box (D2)', () => {
        const input =
        "class T {\n" +
        "    f(symbol: string, settle: string): void {\n" +
        "        let futuresSymbol = symbol + ':' + settle;\n" +
        "        futuresSymbol = this.safeDict(this.options, 'x');\n" +
        "        this.g(futuresSymbol);\n" +
        "    }\n" +
        "    safeDict(a: any, b: any): any { return undefined; }\n" +
        "    g(...args: any[]): void {}\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain('Object futuresSymbol = ((symbol + ":") + settle);');
        expect(output).not.toContain('String futuresSymbol');
    });

    test('a later write of the same native type keeps the narrowed declaration', () => {
        const input =
        "class T {\n" +
        "    f(symbol: string, settle: string): void {\n" +
        "        let futuresSymbol = symbol + ':' + settle;\n" +
        "        futuresSymbol = symbol + '/' + settle;\n" +
        "        this.g(futuresSymbol);\n" +
        "    }\n" +
        "    g(...args: any[]): void {}\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain('String futuresSymbol = ((symbol + ":") + settle);');
        expect(output).toContain('futuresSymbol = ((symbol + "/") + settle);');
    });

    test('a compound numeric assignment keeps the box', () => {
        const input =
        "class T {\n" +
        "    f(): void {\n" +
        "        let oneWeek = 7 * 24 * 60 * 60 * 1000;\n" +
        "        oneWeek += 1;\n" +
        "        this.g(oneWeek);\n" +
        "    }\n" +
        "    g(...args: any[]): void {}\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain('Object oneWeek = ((((7L * 24L) * 60L) * 60L) * 1000L);');
    });

    test('sibling blocks may each declare their own type for the same name', () => {
        const input =
        "class T {\n" +
        "    f(symbol: string, settle: string, b: any, s: string): void {\n" +
        "        if (s === 'a') {\n" +
        "            const futuresSymbol = symbol + ':' + settle;\n" +
        "            this.g(futuresSymbol);\n" +
        "        } else {\n" +
        "            const futuresSymbol = b + ':' + settle;\n" +
        "            this.g(futuresSymbol);\n" +
        "        }\n" +
        "    }\n" +
        "    g(...args: any[]): void {}\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain('String futuresSymbol = ((symbol + ":") + settle);');
        expect(output).toContain('Object futuresSymbol = Helpers.add(Helpers.add(b, ":"), settle);');
    });

    test('a String local as the left of a helper add keeps the box (overload trap)', () => {
        const input =
        "class T {\n" +
        "    f(symbol: string, x: string): void {\n" +
        "        const y = symbol + ':';\n" +
        "        this.g(y + x);\n" +
        "    }\n" +
        "    g(...args: any[]): void {}\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain('Object y = (symbol + ":");');
    });

    test('typeof, length and string casts stay valid on a String local', () => {
        const input =
        "class T {\n" +
        "    f(symbol: string, x: string): void {\n" +
        "        const y = symbol + ':';\n" +
        "        if (typeof y === 'string') {\n" +
        "            this.g(y.length, (y as string).toUpperCase());\n" +
        "        }\n" +
        "    }\n" +
        "    g(...args: any[]): void {}\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain('String y = (symbol + ":");');
        expect(output).toContain('((String)y).length()');
    });

    test('a numeric local in a conditional keeps the box (unboxing risk)', () => {
        const input =
        "class T {\n" +
        "    f(c: boolean): void {\n" +
        "        const oneWeek = 7 * 24 * 60 * 60 * 1000;\n" +
        "        this.g(c ? oneWeek : 0);\n" +
        "    }\n" +
        "    g(...args: any[]): void {}\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain('Object oneWeek = ((((7L * 24L) * 60L) * 60L) * 1000L);');
    });

    test('a numeric local as an argument of its own arithmetic stays boxed', () => {
        const input =
        "class T {\n" +
        "    f(): void {\n" +
        "        const oneWeek = 7 * 24 * 60 * 60 * 1000;\n" +
        "        this.g(oneWeek + 1);\n" +
        "    }\n" +
        "    g(...args: any[]): void {}\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        // the printed helper keeps the Object parameter, so the local is still typed
        expect(output).toContain('Long oneWeek = ((((7L * 24L) * 60L) * 60L) * 1000L);');
        expect(output).toContain('this.g(Helpers.add(oneWeek, 1));');
    });
});

describe('java unary minus inlining (opNeg)', () => {
    // Literals are primitives: Helpers.opNeg would return exactly the same box the
    // plain operator produces, so the printer drops the helper.
    test('an integer literal negates natively', () => {
        const input = "const x = -1;"
        const output = transpiler.transpileJava(input).content;
        expect(output).toBe("Object x = -1;");
    });

    test('a fractional literal negates natively', () => {
        const input = "const x = -1.5;"
        const output = transpiler.transpileJava(input).content;
        expect(output).toBe("Object x = -1.5;");
    });

    test('an exponent literal negates natively', () => {
        const input = "const x = -1e-7;"
        const output = transpiler.transpileJava(input).content;
        expect(output).toBe("Object x = -1e-7;");
    });

    // a > int-max literal already prints with the long suffix; the negation keeps it
    test('a long literal negates natively with its suffix', () => {
        const input = "const x = -3000000000;"
        const output = transpiler.transpileJava(input).content;
        expect(output).toBe("Object x = -3000000000L;");
    });

    // a nested `+` this rule prints natively is a primitive too
    test('a nested native arithmetic operand negates natively', () => {
        const input = "const x = -(1 + 2);"
        const output = transpiler.transpileJava(input).content;
        expect(output).toBe("Object x = -((1L + 2L));");
    });

    // a `.length` read on a String receiver is a Java int
    test('a String .length read negates natively', () => {
        const input =
        "class T {\n" +
        "    test(s: string): void {\n" +
        "        const x = -s.length;\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("Object x = -((String)s).length();");
    });

    // the counter of `for (var i = <literal>; ...)` is a Java int
    test('a for-statement counter negates natively', () => {
        const input =
        "class T {\n" +
        "    test(): void {\n" +
        "        for (let i = 0; -i > -10; i++) {\n" +
        "            const y = i;\n" +
        "        }\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("Helpers.isGreaterThan(-i, -10)");
    });

    // Boxed values keep the helper: it alone maps null -> null and returns the box it
    // was given, which `-x` on a Java Object cannot do (and would not compile on).
    test('a boxed local keeps the helper', () => {
        const input =
        "class T {\n" +
        "    test(): void {\n" +
        "        const y = 1;\n" +
        "        const x = -y;\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("Object x = Helpers.opNeg(y);");
    });

    test('a parameter keeps the helper', () => {
        const input =
        "class T {\n" +
        "    test(a: number): void {\n" +
        "        const x = -a;\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("Object x = Helpers.opNeg(a);");
    });

    // the printer's numeric literal text is already the decimal value (TS normalizes
    // 0x10 to 16), so a hex literal arrives as plain decimal text and negates natively
    test('a hex literal negates natively through its decimal print', () => {
        const input = "const x = -0x10;"
        const output = transpiler.transpileJava(input).content;
        expect(output).toBe("Object x = -16;");
    });

    test('a hex literal above int-max keeps the long suffix', () => {
        const input = "const x = -0xFFFFFFFF;"
        const output = transpiler.transpileJava(input).content;
        expect(output).toBe("Object x = -4294967295L;");
    });

    test('a non-numeric operand keeps the helper', () => {
        const input = "const x = -\"a\";"
        const output = transpiler.transpileJava(input).content;
        expect(output).toBe("Object x = Helpers.opNeg(\"a\");");
    });
});

describe('helper removal: Array.isArray -> native instanceof java.util.List', () => {
    // `Helpers.isArray(x)` answers false for null and true for a List, which is exactly what
    // `x instanceof java.util.List` answers for every operand the printer types as an object.
    // It stays where the operand prints as a Java array (rest parameters: the helper's
    // getClass().isArray() branch is true there) or as a final Java class (String/Long/Double/
    // Boolean: `instanceof` is not convertible), and where the operand's print has lower
    // precedence than `instanceof`.

    test('Object operand emits (operand instanceof java.util.List)', () => {
        const input =
        "class T {\n" +
        "    f(arg) {\n" +
        "        return Array.isArray(arg);\n" +
        "    }\n" +
        "}\n"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("return (arg instanceof java.util.List);");
        expect(output).not.toContain("Helpers.isArray(");
    });

    test('a declared List operand keeps the null test — never the constant true', () => {
        // a Java List reference is null-capable (safeList/parseJson/`any` callers): JS
        // Array.isArray(null) is false, so a literal `true` would flip that path
        const input =
        "class T {\n" +
        "    f(x: string[]) {\n" +
        "        return Array.isArray(x);\n" +
        "    }\n" +
        "}\n"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("return (x instanceof java.util.List);");
        expect(output).not.toContain("return true");
    });

    test('element-access operand emits the native instanceof', () => {
        const input =
        "class T {\n" +
        "    f(ticker) {\n" +
        "        return Array.isArray(ticker['bid']);\n" +
        "    }\n" +
        "}\n"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("return (Helpers.GetValue(ticker, \"bid\") instanceof java.util.List);");
    });

    test('a call operand keeps its single evaluation inside the instanceof', () => {
        const input =
        "class T {\n" +
        "    getItems(): any[] {\n" +
        "        return [];\n" +
        "    }\n" +
        "    f() {\n" +
        "        return Array.isArray(this.getItems());\n" +
        "    }\n" +
        "}\n"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("return (this.getItems() instanceof java.util.List);");
    });

    test('a side-effect-free array literal is the constant true', () => {
        const input =
        "class T {\n" +
        "    f() {\n" +
        "        return Array.isArray([1, 2]);\n" +
        "    }\n" +
        "}\n"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("return true;");
        expect(output).not.toContain("Helpers.isArray(");
    });

    test('an array literal with an evaluated element keeps the helper', () => {
        const input =
        "class T {\n" +
        "    getItems(): any[] {\n" +
        "        return [];\n" +
        "    }\n" +
        "    f() {\n" +
        "        return Array.isArray([this.getItems()]);\n" +
        "    }\n" +
        "}\n"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("Helpers.isArray(new java.util.ArrayList<Object>(java.util.Arrays.asList(this.getItems())));");
    });

    test('undefined is the constant false', () => {
        const input =
        "class T {\n" +
        "    f() {\n" +
        "        return Array.isArray(undefined);\n" +
        "    }\n" +
        "}\n"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("return false;");
        expect(output).not.toContain("Helpers.isArray(");
    });

    test('a String-typed operand keeps the helper (instanceof is not convertible)', () => {
        const input =
        "class T {\n" +
        "    s: string = 'a';\n" +
        "    f() {\n" +
        "        return Array.isArray(this.s);\n" +
        "    }\n" +
        "}\n"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("Helpers.isArray(this.s)");
        expect(output).not.toContain("instanceof java.util.List");
    });

    test('a String element access keeps the helper (List<String>.get(0) is a String)', () => {
        const input =
        "class T {\n" +
        "    f(xs: string[]) {\n" +
        "        return Array.isArray(xs[0]);\n" +
        "    }\n" +
        "}\n"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("Helpers.isArray((xs == null || 0 >= ((java.util.List<?>)xs).size() ? null : ((java.util.List<?>)xs).get(0)))");
        expect(output).not.toContain("instanceof java.util.List");
    });

    test('a rest parameter keeps the helper (it prints as a Java array)', () => {
        const input =
        "class T {\n" +
        "    f(...args: any[]) {\n" +
        "        return Array.isArray(args);\n" +
        "    }\n" +
        "}\n"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("Helpers.isArray(args)");
        expect(output).not.toContain("instanceof java.util.List");
    });

    test('a ternary operand keeps the helper (instanceof binds tighter than ?:)', () => {
        const input =
        "class T {\n" +
        "    f(c: boolean) {\n" +
        "        return Array.isArray(c ? 'a' : 'b');\n" +
        "    }\n" +
        "}\n"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("Helpers.isArray(");
        expect(output).not.toContain("instanceof java.util.List");
    });

    test('a statement-position call keeps the helper (a bare `true;` is not a statement)', () => {
        const input =
        "class T {\n" +
        "    f(): void {\n" +
        "        Array.isArray([1, 2]);\n" +
        "    }\n" +
        "}\n"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("Helpers.isArray(new java.util.ArrayList<Object>(java.util.Arrays.asList(1, 2)));");
    });
});

describe('java helper removal: mod / Math.pow residual families', () => {
    test('Math.pow emits java.lang.Math.pow (both arguments are already parsed doubles)', () => {
        const input =
        "class T {\n" +
        "    test(x: any, y: any): any {\n" +
        "        return Math.pow(x, y);\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("Math.pow(Double.parseDouble(Helpers.toString(x)), Double.parseDouble(Helpers.toString(y)))");
        expect(output).not.toContain("Helpers.mathPow");
    });

    test('mod on a for-counter emits the double remainder natively', () => {
        const input =
        "class T {\n" +
        "    test(xs: any[]): void {\n" +
        "        for (let i = 0; i < xs.length; i++) {\n" +
        "            if (i % 2 === 1) {\n" +
        "                return;\n" +
        "            }\n" +
        "        }\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("(((double) i) % ((double) 2))");
        expect(output).not.toContain("Helpers.mod(");
    });

    test('mod on an Object-typed operand keeps the helper', () => {
        const input =
        "class T {\n" +
        "    test(x: any, n: number): any {\n" +
        "        return x % n;\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("Helpers.mod(x, n)");
    });

    test('mod keeps the helper when the loop body assigns the counter', () => {
        const input =
        "class T {\n" +
        "    test(xs: any[]): void {\n" +
        "        for (let i = 0; i < xs.length; i++) {\n" +
        "            if (i % 2 === 1) {\n" +
        "                i = 0;\n" +
        "            }\n" +
        "        }\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("Helpers.mod(i, 2)");
    });

    test('mod keeps the helper on a non-counter local', () => {
        const input =
        "class T {\n" +
        "    test(): any {\n" +
        "        let i = 0;\n" +
        "        i++;\n" +
        "        return i % 2;\n" +
        "    }\n" +
        "}"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain("Helpers.mod(i, 2)");
    });
});

// b-09: the TS parameter annotations `Dict`/`Market`/`Currency`/`Str` reach the Java
// declaration of an INTERNAL method (a generated venue tier method that does not override a
// hand-written base signature), and the declared-type table answers for the parameter, so
// its element reads print the native accessor. The fixtures mirror the repository layout
// (ts/src/<venue>.ts + ts/src/base/{types,Exchange}.ts), because both the base-tier policy
// and the alias declarations are file-anchored.
describe('java typed parameters (b-09)', () => {
    const TMP = path.join(__dirname, 'files', 'tmp-b09-params');
    const TYPES_FIXTURE = path.join(TMP, 'ts', 'src', 'base', 'types.ts');
    const BASE_FIXTURE = path.join(TMP, 'ts', 'src', 'base', 'Exchange.ts');
    const VENUE_FIXTURE = path.join(TMP, 'ts', 'src', 'probe.ts');

    let venueOutput: string;

    beforeAll(() => {
        fs.mkdirSync(path.dirname(TYPES_FIXTURE), { recursive: true });
        fs.writeFileSync(TYPES_FIXTURE,
            "export interface Dictionary<T> {\n    [key: string]: T;\n}\n" +
            "export type Dict = Dictionary<any>;\n" +
            "export type Str = string | undefined;\n" +
            "export type Num = number | undefined;\n" +
            "export type Int = number | undefined;\n" +
            "export type Bool = boolean | undefined;\n" +
            "export interface MarketInterface {\n    id: string;\n    symbol: string;\n}\n" +
            "export type Market = MarketInterface | undefined;\n" +
            "export interface CurrencyInterface {\n    code: string;\n}\n" +
            "export type Currency = CurrencyInterface | undefined;\n");
        fs.writeFileSync(BASE_FIXTURE,
            "import type { Dict, Str, Int, Market } from './types';\n" +
            "export default class Exchange {\n" +
            "    parseX (data: Dict, status: Str): void {\n" +
            "        const id = data['id'];\n" +
            "    }\n" +
            "    parseRow (row: Dict, market: Market = undefined): Dict {\n" +
            "        return row;\n" +
            "    }\n" +
            "    networkIdToCode (networkId: Str = undefined, currencyCode: Str = undefined): Str {\n" +
            "        return networkId;\n" +
            "    }\n" +
            "}\n");
        fs.writeFileSync(VENUE_FIXTURE,
            "import type { Dict, Str, Num, Int, Market, Currency } from './base/types';\n" +
            "import Exchange from './base/Exchange';\n" +
            "class Venue extends Exchange {\n" +
            "    parseX (data: Dict, status: Str): void {\n" +
            "        const id = data['id'];\n" +
            "    }\n" +
            "    parseZ (data: Dict, status: Str, market: Market, cur: Currency): void {\n" +
            "        const id = data['id'];\n" +
            "        const sym = market['symbol'];\n" +
            "        const code = cur['code'];\n" +
            "    }\n" +
            "    parseOpt (data: Dict = {}, status: Str = undefined): void {\n" +
            "        const id = data['id'];\n" +
            "    }\n" +
            "    parseW (data: Dict, status: Str): void {\n" +
            "        data = this.safeDict (data, 'nested');\n" +
            "        status = this.safeString (data, 'status');\n" +
            "        status = (data['x'] !== undefined) ? 'buy' : 'sell';\n" +
            "    }\n" +
            "    parseAppend (url: Str, status: Str): void {\n" +
            "        url += '/path';\n" +
            "    }\n" +
            "    parseNum (amount: Num, count: Int): void {\n" +
            "        const x = amount;\n" +
            "    }\n" +
            "    async fetchRows (symbol: Str, since: Int = undefined, limit: Int = undefined, price: Num = undefined, params = {}) {\n" +
            "        return [ symbol, since, limit, price, params ];\n" +
            "    }\n" +
            "    async fetchMoved (symbol: Str, params: Dict = {}) {\n" +
            "        symbol = this.safeString (params, 'symbol', symbol);\n" +
            "        return symbol;\n" +
            "    }\n" +
            "    fetch2 (path: any, api: any = 'public', method = 'GET', params: Dict = {}, headers: any = undefined): void {\n" +
            "    }\n" +
            "    parseRow (row: Dict, market: Market = undefined, since: Int = undefined): Dict {\n" +
            "        return row;\n" +
            "    }\n" +
            "    networkIdToCode (networkId: Str = undefined, currencyCode: Str = undefined): Str {\n" +
            "        const title = this.safeTitle (networkId);\n" +
            "        return super.networkIdToCode (title, currencyCode);\n" +
            "    }\n" +
            "    safeTitle (x: any): any {\n" +
            "        return x;\n" +
            "    }\n" +
            "    fetchDepth (symbol: Str, limit: Int = 100, params: Dict = {}): void {\n" +
            "    }\n" +
                        "    pageRows (limit: Int = undefined, raw = undefined): void {\n" +
            "        limit = raw;\n" +
            "        [ limit, raw ] = [ raw, limit ];\n" +
            "    }\n" +
            "}\n" +
            "class Sub extends Venue {\n" +
            "    parseZ (data: Dict, status: Str, market: Market, cur: Currency): void {\n" +
            "        const id = data['id'];\n" +
            "    }\n" +
            "}\n" +
            "class Caller {\n" +
            "    go (raw: any, data: Dict): void {\n" +
            "        const v = new Venue ();\n" +
            "        v.parseZ (data, raw, data, data);\n" +
            "    }\n" +
            "}\n");
        const byPath = new Transpiler({ 'verbose': false, 'java': { 'parser': { 'NUM_LINES_END_FILE': 0 } } });
        venueOutput = byPath.transpileJavaByPath(VENUE_FIXTURE).content;
    });

    afterAll(() => {
        fs.rmSync(TMP, { recursive: true, force: true });
    });

    test('Dict/Market/Currency/Str parameters print the native Java type', () => {
        expect(venueOutput).toContain('public void parseZ(java.util.Map<String, Object> data, String status, java.util.Map<String, Object> market, java.util.Map<String, Object> cur)');
    });

    test('a retyped Dict parameter keeps its element reads native', () => {
        expect(venueOutput).toContain('((java.util.Map<String, Object>)data).get("id")');
        expect(venueOutput).not.toContain('Helpers.GetValue(data, "id")');
    });

    test('Market and Currency parameters read natively through the declared type', () => {
        expect(venueOutput).toContain('market.get("symbol")');
        expect(venueOutput).toContain('cur.get("code")');
        expect(venueOutput).not.toContain('Helpers.GetValue(market');
    });

    // d-10: the base tier prints its annotated parameters too, and every declaration of
    // the method up and down the chain prints the same native type - the override moves
    // with the base declaration (Java overrides are invariant on parameter types), and a
    // fixed parameter with no annotation of its own takes the inherited type.
    test('the base declaration and its override print the same typed signature (d-10)', () => {
        expect(venueOutput).toContain('public void parseX(java.util.Map<String, Object> data, String status)');
    });

    test('an override of a generated method moves with its base declaration', () => {
        const native = 'public void parseZ(java.util.Map<String, Object> data, String status, java.util.Map<String, Object> market, java.util.Map<String, Object> cur)';
        expect(venueOutput.split(native).length - 1).toBe(2);
    });

    test('call sites cast the argument to the declared parameter type', () => {
        expect(venueOutput).toContain('v.parseZ((java.util.Map<String, Object>) (data), (String) (raw), (java.util.Map<String, Object>) (data), (java.util.Map<String, Object>) (data))');
    });

    test('a plain write to a retyped parameter casts its right side', () => {
        expect(venueOutput).toContain('data = (java.util.Map<String, Object>) (Helpers.callDynamically(this, "safeDict", new Object[] { data, "nested" }));');
        expect(venueOutput).toContain('status = (String) ((((!java.util.Objects.equals(((java.util.Map<String, Object>)data).get("x"), null)))) ? "buy" : "sell");');
    });

    test('a compound write to a parameter keeps the whole parameter boxed', () => {
        expect(venueOutput).toContain('public void parseAppend(Object url, String status)');
        // the box stays; the concat itself is native because the right operand is a string literal
        expect(venueOutput).toContain('url = (url + "/path");');
    });

    test('Int/Num stay Object (an Integer/Long/Double box is not a provable Long/Double)', () => {
        expect(venueOutput).toContain('public void parseNum(Object amount, Object count)');
    });

    test('Int defaults print Long on the core and read through getArgLong; Num and unannotated stay Object', () => {
        expect(venueOutput).toContain('fetchRows(String symbol, Long since, Long limit, Object price, Object parameters)');
        expect(venueOutput).toContain('fetchRows(String symbol, Object... optionalArgs)');
        expect(venueOutput).toContain('return this.fetchRows(symbol, Helpers.getArgLong(optionalArgs, 0, null), Helpers.getArgLong(optionalArgs, 1, null), optionalArgs != null && optionalArgs.length > 2 ? optionalArgs[2] : null, ');
    });

    test('the front forwards a reassigned fixed parameter by its source name', () => {
        expect(venueOutput).toContain('fetchMoved(String symbol2, java.util.Map<String, Object> parameters)');
        expect(venueOutput).toContain('fetchMoved(String symbol, Object... optionalArgs)');
        expect(venueOutput).toContain('return this.fetchMoved(symbol, Helpers.getArgMap(optionalArgs, 0, ');
    });

    test('fetch2 keeps an untyped params slot for implicit-endpoint arrays', () => {
        expect(venueOutput).toContain('fetch2(Object path, Object api, Object method, Object parameters, Object headers)');
        expect(venueOutput).not.toContain('Helpers.getArgMap(optionalArgs, 2,');
    });

    test('an override with another parameter list bridges the ancestor core signature', () => {
        expect(venueOutput).toContain('public Object parseRow(java.util.Map<String, Object> row, java.util.Map<String, Object> market)');
        expect(venueOutput).toContain('return this.parseRow(row, (Object) (market), (Object) null);');
    });

    test('a super call into a split method binds the typed core at full arity', () => {
        expect(venueOutput).toContain('return super.networkIdToCode(Helpers.toStringArg(title), currencyCode);');
        expect(venueOutput).not.toContain('super.networkIdToCode(title, ');
    });

    test('an integer default of a Long slot prints as a long literal', () => {
        expect(venueOutput).toContain('this.fetchDepth(symbol, Helpers.getArgLong(optionalArgs, 0, 100L), ');
    });

    test('writes to a typed Long parameter of a sync core convert through Helpers.toLongOrNull', () => {
        expect(venueOutput).toContain('public void pageRows(Long limit, Object raw)');
        expect(venueOutput).toContain('limit = Helpers.toLongOrNull(raw);');
        expect(venueOutput).toContain('limit = Helpers.toLongOrNull(((java.util.List<Object>) ');
    });

    test('an optional parameter is typed on the core; the front reads it with a typed getter', () => {
        expect(venueOutput).toContain('public void parseOpt(java.util.Map<String, Object> data, String status)');
        expect(venueOutput).toContain('public void parseOpt(Object... optionalArgs)');
        expect(venueOutput).toContain('this.parseOpt(Helpers.getArgMap(optionalArgs, 0, new java.util.HashMap<String, Object>() {{}}), Helpers.getArgString(optionalArgs, 1, null));');
        expect(venueOutput).not.toContain('return this.parseOpt(');
    });
});

// d-10: override parameters/returns move with the base declaration. A declaration whose
// parameter carries no native annotation of its own still prints the type its base prints
// (otherwise the override would stop overriding the typed base method in Java), and a
// declaration whose own annotation disagrees with the base keeps the boxed signature.
describe('java override parameters move with the base declaration (d-10)', () => {
    const TMP = path.join(__dirname, 'files', 'tmp-d10-overrides');
    const TYPES_FIXTURE = path.join(TMP, 'ts', 'src', 'base', 'types.ts');
    const BASE_FIXTURE = path.join(TMP, 'ts', 'src', 'base', 'Exchange.ts');
    const VENUE_FIXTURE = path.join(TMP, 'ts', 'src', 'venue10.ts');

    let output: string;

    beforeAll(() => {
        fs.mkdirSync(path.dirname(TYPES_FIXTURE), { recursive: true });
        fs.writeFileSync(TYPES_FIXTURE,
            "export interface Dictionary<T> {\n    [key: string]: T;\n}\n" +
            "export type Dict = Dictionary<any>;\n" +
            "export type Str = string | undefined;\n" +
            "export interface MarketInterface {\n    id: string;\n}\n" +
            "export type Market = MarketInterface | undefined;\n");
        fs.writeFileSync(BASE_FIXTURE,
            "import type { Dict, Str, Market } from './types';\n" +
            "export default class Exchange {\n" +
            "    parseTyped (data: Dict, market: Market = undefined): void {\n" +
            "        const id = data['id'];\n" +
            "    }\n" +
            "    parseForced (data: Dict, status: Str): void {\n" +
            "        const id = data['id'];\n" +
            "    }\n" +
            "    parseLoose (data, status): void {\n" +
            "        const id = data['id'];\n" +
            "    }\n" +
            "    parseConflict (data: Dict): void {\n" +
            "        const id = data['id'];\n" +
            "    }\n" +
            "}\n");
        fs.writeFileSync(VENUE_FIXTURE,
            "import type { Dict, Str, Market } from './base/types';\n" +
            "import Exchange from './base/Exchange';\n" +
            "class Venue extends Exchange {\n" +
            "    parseTyped (data: Dict, market: Market = undefined): void {\n" +
            "        const id = data['id'];\n" +
            "    }\n" +
            "    parseForced (data, status): void {\n" +
            "        const id = data['id'];\n" +
            "    }\n" +
            "    parseLoose (data: Dict, status: Str): void {\n" +
            "        const id = data['id'];\n" +
            "    }\n" +
            "    parseConflict (data: Str): void {\n" +
            "        const id = data['id'];\n" +
            "    }\n" +
            "}\n");
        const byPath = new Transpiler({ 'verbose': false, 'java': { 'parser': { 'NUM_LINES_END_FILE': 0 } } });
        output = byPath.transpileJavaByPath(VENUE_FIXTURE).content;
    });

    afterAll(() => {
        fs.rmSync(TMP, { recursive: true, force: true });
    });

    test('an override of a typed base declaration prints the same typed signature', () => {
        // the venue output carries the Venue declaration; the base declaration prints the
        // same signature in Exchange.ts (checked by the b-09 parseX case above)
        expect(output).toContain('public void parseTyped(java.util.Map<String, Object> data, Object... optionalArgs)');
        expect(output).not.toContain('parseTyped(Object data');
    });

    test('a fixed override parameter with no annotation takes the base declaration type', () => {
        expect(output).toContain('public void parseForced(java.util.Map<String, Object> data, String status)');
        expect(output).not.toContain('parseForced(Object data');
    });

    test('an unannotated base declaration boxes the whole chain', () => {
        expect(output).toContain('public void parseLoose(Object data, Object status)');
        expect(output).not.toContain('parseLoose(java.util.Map<String, Object> data');
    });

    test('an override annotation that disagrees with the base keeps the boxed signature', () => {
        // D8: the base declaration prints its own Dict type, the disagreeing override keeps
        // the box (no site in ts/src disagrees today)
        expect(output).toContain('public void parseConflict(Object data)');
    });
});

describe('inOp on a proven map: containsKey for keys the checker does not type as strings', () => {
    test('a dict receiver and a repeatable key print the null-guarded containsKey', () => {
        const input =
        "type Dict = { [key: string]: any };\n" +
        "function f (m: Dict, k: any) {\n" +
        "    const a = k in m;\n" +
        "    const b = !(k in m);\n" +
        "    return [ a, b ];\n" +
        "}\n"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain('(k != null && ((java.util.Map<?, ?>)m).containsKey(k))');
        expect(output).not.toContain('Helpers.inOp');
    });

    test('a key the printer replays (call, element read) keeps the helper', () => {
        const input =
        "type Dict = { [key: string]: any };\n" +
        "function f (m: Dict, xs: any) {\n" +
        "    const a = xs.length in m;\n" +
        "    return [ a ];\n" +
        "}\n"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain('Helpers.inOp(m, Helpers.getArrayLength(xs))');
    });

    test('a string key keeps the unguarded containsKey', () => {
        const input =
        "type Dict = { [key: string]: any };\n" +
        "function f (m: Dict) {\n" +
        "    const a = 'code' in m;\n" +
        "    return [ a ];\n" +
        "}\n"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain('((java.util.Map<?, ?>)m).containsKey("code")');
    });
});

describe('isEqual on printed Java primitives and declared numerics', () => {
    const withResolver = (resolver: any, body: () => void) => {
        const printer: any = (transpiler as any).javaTranspiler;
        const previous = printer.javaDeclaredLocalTypeResolver;
        printer.javaDeclaredLocalTypeResolver = resolver;
        try {
            body();
        } finally {
            printer.javaDeclaredLocalTypeResolver = previous;
        }
    };

    test('.length and indexOf results are ints, so the compare is native', () => {
        const input =
        "function f (xs: any, s: string) {\n" +
        "    const a = xs.length === 3;\n" +
        "    const b = s.indexOf('x') === -1;\n" +
        "    const c = xs.length !== 0;\n" +
        "    return [ a, b, c ];\n" +
        "}\n"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain('(Helpers.getArrayLength(xs) == 3)');
        expect(output).toContain('(((String)s).indexOf("x") == -1)');
        expect(output).toContain('(Helpers.getArrayLength(xs) != 0)');
        expect(output).not.toContain('Helpers.isEqual');
    });

    test('a declared numeric compares with the operator and a null test for the box', () => {
        const input =
        "function f (a: any, b: any) {\n" +
        "    const x = a === 1;\n" +
        "    const y = a !== 1;\n" +
        "    const z = b === 2;\n" +
        "    return [ x, y, z ];\n" +
        "}\n"
        withResolver((declaration: any) => declaration.name?.escapedText === 'a' ? 'Long' : 'Double', () => {
            const output = transpiler.transpileJava(input).content;
            expect(output).toContain('(a != null && a == 1)');
            expect(output).toContain('(a == null || a != 1)');
            expect(output).toContain('(b != null && b == 2)');
            expect(output).not.toContain('Helpers.isEqual');
        });
    });

    test('a declared String compares through Objects.equals against any operand', () => {
        const input =
        "function f (a: any, n: any) {\n" +
        "    const x = a === 1;\n" +
        "    const y = a === n;\n" +
        "    return [ x, y ];\n" +
        "}\n"
        withResolver((declaration: any) => declaration.name?.escapedText === 'a' ? 'String' : undefined, () => {
            const output = transpiler.transpileJava(input).content;
            expect(output).toContain('java.util.Objects.equals(a, 1)');
            expect(output).toContain('java.util.Objects.equals(a, n)');
            expect(output).not.toContain('Helpers.isEqual');
        });
    });
});

describe('objectKeys on a declared map local', () => {
    test('a declared map receiver copies keySet natively', () => {
        const input =
        "function f (x: any) {\n" +
        "    const keys = Object.keys(x);\n" +
        "    return [ keys ];\n" +
        "}\n"
        const printer: any = (transpiler as any).javaTranspiler;
        const previous = printer.javaDeclaredLocalTypeResolver;
        printer.javaDeclaredLocalTypeResolver = () => 'java.util.Map<String, Object>';
        try {
            const output = transpiler.transpileJava(input).content;
            expect(output).toContain('new java.util.ArrayList<Object>(x.keySet())');
            expect(output).not.toContain('Helpers.objectKeys');
        } finally {
            printer.javaDeclaredLocalTypeResolver = previous;
        }
    });

    test('a field receiver keeps the synchronized helper', () => {
        const input =
        "class T {\n" +
        "    options: any = {};\n" +
        "    test(): void {\n" +
        "        const keys = Object.keys(this.options);\n" +
        "        this.something(keys);\n" +
        "    }\n" +
        "    something(...args: any[]): void {}\n" +
        "}\n"
        const output = transpiler.transpileJava(input).content;
        expect(output).toContain('Helpers.objectKeys(this.options)');
    });
});
// D-09: internal (non-override) generated methods print the native Java type named by the
// TS annotation (Map<String, Object> for dict-shaped types, String for Str, Boolean for
// Bool) when EVERY return statement of the body already prints that type. A method a base
// class declares (D8), an async method and any body whose returns are not provable keep the
// boxed `Object` signature. The fixtures mirror the repository layout because the rule is
// gated on the declaration living in a generated tier file (ts/src/<name>.ts).
describe('java native return types of internal methods (d09)', () => {
    const TMP = path.join(__dirname, 'files', 'tmp-javad09');
    const TYPES_FIXTURE = path.join(TMP, 'ts', 'src', 'base', 'types.ts');
    const VENUE_FIXTURE = path.join(TMP, 'ts', 'src', 'venuefake.ts');
    const TYPES_SOURCE =
        "export type Dict = Record<string, any>;\n" +
        "export type Str = string | undefined;\n" +
        "export type Bool = boolean | undefined;\n";
    const VENUE_SOURCE =
        "import { Dict, Str, Bool } from './base/types';\n" +
        "interface Row { [key: string]: any }\n" +
        "class BaseFake {\n" +
        "    parseOrder (order: Dict): any { return order; }\n" +
        "    safeValue (x: any, k: any, d: any = undefined): any { return x; }\n" +
        "}\n" +
        "export default class venuefake extends BaseFake {\n" +
        "    parseRow (data: Dict): Row { return { 'a': data }; }\n" +
        "    parseEcho (data: Dict): Row { return data; }\n" +
        "    parseChoice (data: Dict, flag: boolean): Dict { return flag ? { 'x': data } : data; }\n" +
        "    parseName (s: Str): Str { return s; }\n" +
        "    parseFlag (a: any): Bool { return a === 1; }\n" +
        "    parseOrder (order: Dict): Dict { return order; }\n" +
        "    parseUnproven (data: Dict): Dict { return this.safeValue (data, 'k'); }\n" +
        "    async parseAsync (data: Dict): Promise<Dict> { return data; }\n" +
        "}\n";

    let output: string;

    beforeAll(() => {
        fs.mkdirSync(path.dirname(TYPES_FIXTURE), { recursive: true });
        fs.writeFileSync(TYPES_FIXTURE, TYPES_SOURCE);
        fs.writeFileSync(VENUE_FIXTURE, VENUE_SOURCE);
        const byPath = new Transpiler({ 'verbose': false, 'java': { 'parser': { 'NUM_LINES_END_FILE': 0 } } });
        output = byPath.transpileJavaByPath(VENUE_FIXTURE).content;
    });

    afterAll(() => {
        fs.rmSync(TMP, { recursive: true, force: true });
    });

    test('a dict-shaped return whose every return prints a map is native', () => {
        expect(output).toContain('public java.util.Map<String, Object> parseRow(');
        expect(output).not.toContain('public Object parseRow(');
    });

    test('a return of a parameter the printer declares a map is native', () => {
        expect(output).toContain('public java.util.Map<String, Object> parseEcho(');
    });

    test('a ternary with both arms provable is native', () => {
        expect(output).toContain('public java.util.Map<String, Object> parseChoice(');
    });

    test('a Str return is native String', () => {
        expect(output).toContain('public String parseName(');
    });

    test('a Bool return over a comparison is native Boolean', () => {
        expect(output).toContain('public Boolean parseFlag(');
    });

    test('an override keeps the boxed signature (D8)', () => {
        expect(output).toContain('public Object parseOrder(');
        expect(output).not.toContain('public java.util.Map<String, Object> parseOrder(');
    });

    test('an unprovable return keeps the boxed signature', () => {
        expect(output).toContain('public Object parseUnproven(');
    });

    test('an async method keeps the future signature', () => {
        expect(output).toContain('public java.util.concurrent.CompletableFuture<Object> parseAsync(');
    });
});

// d-12: `this.spawn(this.someMethod, args...)` is the pro-tier dispatch shape - the ccxt
// post-pass rewrites the reference into a lambda `() -> { this.someMethod(args); }`, so the
// arguments bind to the METHOD's printed parameters. A parameter the printer declared
// natively (`Dict`/`Str`/`Bool`/`Market`/`Currency`) needs the same checkcast a direct call
// site carries, or `Object message` cannot convert to `Map<String,Object>` (job 1008:
// Lbank/Binance/Weex pro handlers). Fixtures mirror the repository layout, because the
// alias declarations and the base-tier policy are file-anchored.
describe('java spawn method references (d-12)', () => {
    const TMP = path.join(__dirname, 'files', 'tmp-d12-spawn');
    const TYPES_FIXTURE = path.join(TMP, 'ts', 'src', 'base', 'types.ts');
    const CLIENT_FIXTURE = path.join(TMP, 'ts', 'src', 'base', 'Client.ts');
    const BASE_FIXTURE = path.join(TMP, 'ts', 'src', 'base', 'Exchange.ts');
    const VENUE_FIXTURE = path.join(TMP, 'ts', 'src', 'pro', 'probe.ts');

    let venueOutput: string;

    beforeAll(() => {
        fs.mkdirSync(path.dirname(TYPES_FIXTURE), { recursive: true });
        fs.writeFileSync(TYPES_FIXTURE,
            "export interface Dictionary<T> {\n    [key: string]: T;\n}\n" +
            "export type Dict = Dictionary<any>;\n" +
            "export type Str = string | undefined;\n");
        fs.writeFileSync(CLIENT_FIXTURE,
            "export default class Client {\n    resolve (x: any, y: any): void {}\n}\n");
        fs.writeFileSync(BASE_FIXTURE,
            "import type { Dict } from './types';\n" +
            "import Client from './Client';\n" +
            "export default class Exchange {\n" +
            "    spawn (method: any, ...args: any[]): any {\n" +
            "    }\n" +
            "    handleBase (client: Client, data: Dict): void {\n" +
            "    }\n" +
            "}\n");
        fs.mkdirSync(path.dirname(VENUE_FIXTURE), { recursive: true });
        fs.writeFileSync(VENUE_FIXTURE,
            "import type { Dict, Str } from '../base/types';\n" +
            "import Exchange from '../base/Exchange';\n" +
            "import Client from '../base/Client';\n" +
            "class Probe extends Exchange {\n" +
            "    handlePing (client: Client, message: Dict): void {\n" +
            "        const x = message['ping'];\n" +
            "    }\n" +
            "    handleSnapshot (client: Client, message: Dict, subscription: Dict): Promise<void> {\n" +
            "        return undefined as any;\n" +
            "    }\n" +
            "    handleString (client: Client, mode: Str): void {\n" +
            "    }\n" +
            "    handleUntyped (client: Client, message: any): void {\n" +
            "    }\n" +
            "    handleMessage (client: Client, message: any): void {\n" +
            "        this.spawn (this.handlePing, client, message);\n" +
            "        this.spawn (this.handleSnapshot, client, message, message);\n" +
            "        this.spawn (this.handleString, client, message);\n" +
            "        this.spawn (this.handleUntyped, client, message);\n" +
            "        this.spawn (async () => { this.handlePing (client, message); });\n" +
            "        this.spawn (this.handleBase, client, message);\n" +
            "    }\n" +
            "}\n");
        const byPath = new Transpiler({ 'verbose': false, 'java': { 'parser': { 'NUM_LINES_END_FILE': 0 } } });
        venueOutput = byPath.transpileJavaByPath(VENUE_FIXTURE).content;
    });

    afterAll(() => {
        fs.rmSync(TMP, { recursive: true, force: true });
    });

    test('a spawned method reference casts its argument to the printed parameter type', () => {
        expect(venueOutput).toContain('this.spawn(this.handlePing, client, (java.util.Map<String, Object>) (message));');
    });

    test('every spawned argument position carries its own checkcast', () => {
        expect(venueOutput).toContain('this.spawn(this.handleSnapshot, client, (java.util.Map<String, Object>) (message), (java.util.Map<String, Object>) (message));');
    });

    test('a Str parameter casts to String', () => {
        expect(venueOutput).toContain('this.spawn(this.handleString, client, (String) (message));');
    });

    test('the method-reference argument itself is never cast', () => {
        expect(venueOutput).not.toContain('(java.util.Map<String, Object>) (this.handlePing)');
    });

    test('a spawned method with untyped parameters keeps its arguments verbatim', () => {
        expect(venueOutput).toContain('this.spawn(this.handleUntyped, client, message);');
    });

    test('a spawned base-tier method follows the typed base declaration (D-10)', () => {
        // the base tier is generated too, so its annotated `data: Dict` prints the Map and the spawn casts to it
        expect(venueOutput).toContain('this.spawn(this.handleBase, client, (java.util.Map<String, Object>) (message));');
    });

    test('an arrow-function spawn keeps the ordinary call-site cast inside its body', () => {
        expect(venueOutput).toContain('this.spawn(() => ');
        expect(venueOutput).toContain('this.handlePing(client, (java.util.Map<String, Object>) (message));');
    });
});

// D-16: a prediction venue (ts/src/prediction/<id>.ts) extends its abstract class ->
// PredictionExchange -> BaseExchange, a chain that never reaches the `Exchange` class of
// ts/src/base/Exchange.ts. The venue's method still overrides the Exchange-tier body
// javaTranspiler.ts injects into the generated PredictionExchange.java, and those declarations
// keep `Object` parameters (the base tier is a JAVA_NATIVE_PARAMETER_BASE_FILE) - so the venue
// parameter prints `Object` too, whatever alias its own annotation names.
describe('java prediction venue Exchange-tier parameter boxing (D-16)', () => {
    const TMP = path.join(__dirname, 'files', 'tmp-d16');
    const TYPES_FIXTURE = path.join(TMP, 'ts', 'src', 'base', 'types.ts');
    const BASE_FIXTURE = path.join(TMP, 'ts', 'src', 'base', 'Exchange.ts');
    const PREDICTION_BASE_FIXTURE = path.join(TMP, 'ts', 'src', 'base', 'PredictionExchange.ts');
    const VENUE_FIXTURE = path.join(TMP, 'ts', 'src', 'prediction', 'kalshi.ts');

    let venueOutput: string;

    beforeAll(() => {
        fs.mkdirSync(path.dirname(TYPES_FIXTURE), { recursive: true });
        fs.mkdirSync(path.dirname(PREDICTION_BASE_FIXTURE), { recursive: true });
        fs.mkdirSync(path.dirname(VENUE_FIXTURE), { recursive: true });
        fs.writeFileSync(TYPES_FIXTURE,
            "export type Str = string | undefined;\n" +
            "export type Dict = { [key: string]: any } | undefined;\n");
        fs.writeFileSync(BASE_FIXTURE,
            "import type { Str, Dict } from './types.js';\n" +
            "export class BaseExchange {}\n" +
            "export default class Exchange extends BaseExchange {\n" +
            "    async fetchOrder (id: string, symbol: Str = undefined, params: Dict = {}): Promise<any> { return null; }\n" +
            "}\n");
        fs.writeFileSync(PREDICTION_BASE_FIXTURE,
            "import { BaseExchange } from './Exchange.js';\n" +
            "export default class PredictionExchange extends BaseExchange {}\n");
        fs.writeFileSync(VENUE_FIXTURE,
            "import Exchange from '../base/PredictionExchange.js';\n" +
            "import type { Str, Dict } from '../base/types.js';\n" +
            "export default class kalshi extends Exchange {\n" +
            "    async fetchOrder (id: Str, outcome: Str = undefined, params: Dict = {}): Promise<any> { return null; }\n" +
            "    async fetchEvents (query: Str, params: Dict = {}): Promise<any> { return null; }\n" +
            "}\n");
        const byPath = new Transpiler({ 'verbose': false, 'java': { 'parser': { 'NUM_LINES_END_FILE': 0 } } });
        venueOutput = byPath.transpileJavaByPath(VENUE_FIXTURE).content;
    });

    afterAll(() => {
        fs.rmSync(TMP, { recursive: true, force: true });
    });

    test('a venue method named after the injected Exchange tier prints Object parameters', () => {
        expect(venueOutput).toContain('fetchOrder(Object id');
        expect(venueOutput).not.toContain('fetchOrder(String id');
    });

    test('a venue-local method keeps its native parameter', () => {
        expect(venueOutput).toContain('fetchEvents(String query');
    });
});
