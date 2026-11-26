import { Transpiler } from '../src/transpiler';

// the build layer prints an `Int = <literal>` parameter `Int64?` (with a `??= <literal>` prologue); stand in for it here
const transpiler = new Transpiler({ csharp: { parser: { 'ELEMENT_ACCESS_WRAPPER_OPEN': 'getValue(' } } } as any);
const emit = (body: string) => {
    const csharp: any = transpiler.csharpTranspiler;
    const original = csharp.printParameterType;
    csharp.csharpExpressionTypeResolver = (node) => ({ a: 'Int64?' })[node?.text];
    csharp.printParameterType = function (node) {
        return (node?.type?.getText?.() === 'Int') ? 'Int64?' : original.call(this, node);
    };
    try {
        return transpiler.transpileCSharp('type Int = number | undefined;\nclass Exchange {\n safeInteger (o, k, d = undefined): number { return d; }\n' + body + '\n}').content;
    } finally {
        csharp.csharpExpressionTypeResolver = undefined;
        csharp.printParameterType = original;
    }
};

describe('csharp Int64? parameter with an integer literal default in native arithmetic', () => {
    test('a never-null Int64? local plus the defaulted parameter prints native addition', () => {
        const output = emit('stream (o, numSubscriptions: Int = 1) { const a = this.safeInteger (o, "x", 0); const b = a + numSubscriptions; return b; }');
        expect(output).toContain('Int64? numSubscriptions');
        expect(output).toContain('(a.GetValueOrDefault() + numSubscriptions.GetValueOrDefault())');
        expect(output).not.toContain('add(');
    });
    test('an undefined default keeps the helper: the parameter may be null', () => {
        const output = emit('stream (o, n: Int = undefined) { const a = this.safeInteger (o, "x", 0); const b = a + n; return b; }');
        expect(output).toContain('add(a, n)');
    });
    test('a parameter the body writes keeps the helper', () => {
        const output = emit('stream (o, n: Int = 1) { const a = this.safeInteger (o, "x", 0); n = undefined; const b = a + n; return b; }');
        expect(output).toContain('add(a, n)');
    });
    test('an untyped parameter with a literal default keeps the helper', () => {
        const output = emit('stream (o, n = 1) { const a = this.safeInteger (o, "x", 0); const b = a + n; return b; }');
        expect(output).toContain('add(a, n)');
    });
});
