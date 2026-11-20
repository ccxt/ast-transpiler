import { Transpiler } from '../src/transpiler';

const config = { 'verbose': false, 'csharp': { 'parser': { 'NUM_LINES_END_FILE': 0 } } };
const ts =
    "class ex {\n" +
    "    toArray (x: any): any[] { return []; }\n" +
    "    f (d: any) {\n" +
    "        const xs = this.toArray (d);\n" +
    "        return xs;\n" +
    "    }\n" +
    "}\n";

describe ('h26c01 toArray of a declared dictionary', () => {
    test ('a local the classifier declares a dictionary prints its value list, null kept null', () => {
        const t = new Transpiler (config);
        (t.csharpTranspiler as any).csharpDeclaredLocalDictType = (node) => (node?.text === 'd') ? 'Dictionary<string, object>' : undefined;
        const out = t.transpileCSharp (ts).content;
        expect (out).toContain ('(d == null ? null : new List<object>(d.Values))');
        expect (out).not.toContain ('this.toArray(d)');
    });
    test ('IDictionary declaration converts the same way', () => {
        const t = new Transpiler (config);
        (t.csharpTranspiler as any).csharpDeclaredLocalDictType = (node) => (node?.text === 'd') ? 'IDictionary<string, object>' : undefined;
        expect (t.transpileCSharp (ts).content).toContain ('(d == null ? null : new List<object>(d.Values))');
    });
    test ('an undeclared (object) operand keeps the helper', () => {
        const t = new Transpiler (config);
        expect (t.transpileCSharp (ts).content).toContain ('this.toArray(d)');
    });
    test ('a list-declared operand keeps the helper', () => {
        const t = new Transpiler (config);
        (t.csharpTranspiler as any).csharpDeclaredLocalDictType = (node) => (node?.text === 'd') ? 'List<object>' : undefined;
        expect (t.transpileCSharp (ts).content).toContain ('this.toArray(d)');
    });
});
