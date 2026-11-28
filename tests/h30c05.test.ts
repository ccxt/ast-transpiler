import { Transpiler } from '../src/transpiler';

const config = { 'verbose': false, 'csharp': { 'parser': { 'NUM_LINES_END_FILE': 0, 'ELEMENT_ACCESS_WRAPPER_OPEN': 'getValue(', 'ELEMENT_ACCESS_WRAPPER_CLOSE': ')' } } };
const head =
    "class Client {}\n" +
    "class ex {\n" +
    "    safeValue (o: any, k: any, d: any = undefined): any { return d; }\n" +
    "    parseWsOrder (o: any): any { return o; }\n" +
    "    resolve (x: any) { }\n";

function cs (body: string): string {
    const t = new Transpiler (config);
    // the ccxt build types loop counters `int`; the in-memory program has no such resolver
    (t.csharpTranspiler as any).csharpExpressionTypeResolver = (node) => (node?.text === 'i') ? 'int' : undefined;
    return t.transpileCSharp (head + body + "}\n").content;
}

describe ('h30c05 reads inside a bound Array.isArray test', () => {
    test ('a ws frame value tested as a list is read through the bound name', () => {
        const out = cs (
            "    handleOrders (client: Client, message: any) {\n" +
            "        const result = this.safeValue (message, 'result', {});\n" +
            "        if (Array.isArray (result)) {\n" +
            "            for (let i = 0; i < result.length; i++) {\n" +
            "                this.resolve (this.parseWsOrder (result[i]));\n" +
            "            }\n" +
            "        }\n" +
            "    }\n");
        expect (out).toMatch (/\(result is IList<object> hxList\d+\)/);
        expect (out).toMatch (/hxList\d+\.Count/);
        expect (out).toMatch (/this\.parseWsOrder\(hxList\d+\[i\]\)/);
        expect (out).not.toContain ('getArrayLength(result)');
        expect (out).not.toContain ('getValue(result, i)');
    });
    test ('a value that is written later keeps the helper form', () => {
        const out = cs (
            "    handleOrders (client: Client, message: any) {\n" +
            "        let result = this.safeValue (message, 'result', {});\n" +
            "        if (Array.isArray (result)) {\n" +
            "            result = [];\n" +
            "            this.resolve (result.length);\n" +
            "        }\n" +
            "    }\n");
        expect (out).not.toMatch (/is IList<object> hxList/);
        expect (out).toContain ('getArrayLength(result)');
    });
    test ('a non-frame parameter (may be any shape a caller built) keeps the helper form', () => {
        const out = cs (
            "    collect (client: Client, payload: any) {\n" +
            "        const data = this.safeValue (payload, 'data');\n" +
            "        if (Array.isArray (data)) {\n" +
            "            this.resolve (data.length);\n" +
            "        }\n" +
            "    }\n");
        expect (out).not.toMatch (/is IList<object> hxList/);
        expect (out).toContain ('getArrayLength(data)');
    });
    test ('a nullable value tested negated, or read inside a closure, keeps the helper', () => {
        const out = cs (
            "    handleThing (client: Client, message: any) {\n" +
            "        const data = this.safeValue (message, 'data');\n" +
            "        if (!Array.isArray (data)) {\n" +
            "            return;\n" +
            "        }\n" +
            "        this.resolve (data.length);\n" +
            "    }\n");
        expect (out).not.toMatch (/is IList<object> hxList/);
        expect (out).toContain ('getArrayLength(data)');
    });
});
