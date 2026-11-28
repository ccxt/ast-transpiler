import { Transpiler } from '../src/transpiler';

const transpiler = new Transpiler({ csharp: { parser: { 'ELEMENT_ACCESS_WRAPPER_OPEN': 'getValue(', 'ELEMENT_ACCESS_WRAPPER_CLOSE': ')' } } });

describe('csharp List<string> destructuring holder', () => {
    const input =
        "class Exchange {\n" +
        "    test (): void {\n" +
        "        const [a, b] = this.someTuple(1);\n" +
        "        const [c, d] = this.otherTuple(1);\n" +
        "    }\n" +
        "}";
    test('a List<string> holder prints string slots and no holder cast', () => {
        const printer: any = (transpiler as any).csharpTranspiler;
        printer.csharpDestructuringTempType = (node) => (node.expression?.name?.text === 'someTuple' ? 'List<string>' : undefined);
        printer.csharpDestructuringTempNeedsCast = () => false;
        try {
            const output = transpiler.transpileCSharp(input).content;
            expect(output).toContain('List<string> abVariable = callDynamically(this, "someTuple", new object[] { 1 });');
            expect(output).toContain('string a = abVariable[0];');
            expect(output).toContain('string b = abVariable[1];');
            // negative: an untyped holder keeps var slots and the re-cast
            expect(output).toContain('var c = ((IList<object>) cdVariable)[0];');
            expect(output).toContain('var d = ((IList<object>) cdVariable)[1];');
        } finally {
            delete printer.csharpDestructuringTempType;
            delete printer.csharpDestructuringTempNeedsCast;
        }
    });
    test('an IList<object> holder keeps var slots', () => {
        const printer: any = (transpiler as any).csharpTranspiler;
        printer.csharpDestructuringTempType = () => 'IList<object>';
        try {
            const output = transpiler.transpileCSharp(input).content;
            expect(output).toContain('var a = abVariable[0];');
            expect(output).not.toContain('string a =');
        } finally {
            delete printer.csharpDestructuringTempType;
        }
    });
});
