import { Transpiler } from '../src/transpiler';

const transpiler = new Transpiler({ verbose: false, java: { parser: { NUM_LINES_END_FILE: 0 } } });

const run = (source: string, boxes: { [name: string]: string }): string => {
    const printer: any = (transpiler as any).javaTranspiler;
    const previous = printer.javaBindingElementTypeResolver;
    printer.javaBindingElementTypeResolver = (element: any) => boxes[element?.name?.text];
    try {
        return transpiler.transpileJava(source).content;
    } finally {
        printer.javaBindingElementTypeResolver = previous;
    }
};

const SOURCE =
    "class T {\n" +
    "    test (params: any): void {\n" +
    "        const [ retries, rest ] = this.pair (params);\n" +
    "        for (let i = 0; i < 3; i++) {\n" +
    "            if ((i + 1) === retries) {\n" +
    "                this.use (rest);\n" +
    "            }\n" +
    "        }\n" +
    "    }\n" +
    "    pair (x: any): any {\n" +
    "        return x;\n" +
    "    }\n" +
    "    use (x: any): void {\n" +
    "    }\n" +
    "}\n";

describe('isEqual on a destructured element printed as a numeric box', () => {
    test('a Long element against native long arithmetic compares natively with its null arm', () => {
        const out = run(SOURCE, { retries: 'Long' });
        expect(out).toContain('retries != null && ');
        expect(out).not.toContain('Helpers.isEqual(');
    });

    test('no printed box for the element: helper kept', () => {
        const out = run(SOURCE, {});
        expect(out).toContain('Helpers.isEqual(');
    });

    test('a non-numeric box for the element: helper kept', () => {
        const out = run(SOURCE, { retries: 'String' });
        expect(out).toContain('Helpers.isEqual(');
    });

    test('a plain local (not destructured) with no declared type: helper kept', () => {
        const source = SOURCE.replace('const [ retries, rest ] = this.pair (params);', 'const retries = this.pair (params);\n        const rest = params;');
        const out = run(source, { retries: 'Long' });
        expect(out).toContain('Helpers.isEqual(');
    });
});
