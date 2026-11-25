import { Transpiler } from '../src/transpiler';

const transpiler = new Transpiler({ verbose: false, java: { parser: { NUM_LINES_END_FILE: 0 } } });
const MAP_TYPE = 'java.util.Map<String, Object>';

const run = (source: string, maps: string[]): string => {
    const printer: any = (transpiler as any).javaTranspiler;
    const previous = printer.javaDeclaredLocalTypeResolver;
    printer.javaDeclaredLocalTypeResolver = (declaration: any) => (maps.includes(declaration?.name?.text) ? MAP_TYPE : undefined);
    try {
        return transpiler.transpileJava(source).content;
    } finally {
        printer.javaDeclaredLocalTypeResolver = previous;
    }
};

const SOURCE =
    "class T {\n" +
    "    test (byId: any, value: any, other: any): void {\n" +
    "        const a = byId[value['id']];\n" +
    "        this.use (a);\n" +
    "    }\n" +
    "    use (x: any): void {\n" +
    "    }\n" +
    "}\n";

describe('declared Map read keyed by a literal read of a declared Map: Helpers.GetValue -> guarded get', () => {
    test('both declared maps: the String-tested native get', () => {
        const out = run(SOURCE, [ 'byId', 'value' ]);
        expect(out).toContain('(byId == null || !(value.get("id") instanceof String) ? null : byId.get(value.get("id")))');
        expect(out).not.toContain('Helpers.GetValue(byId');
    });

    test('key container not a declared map: helper kept', () => {
        const out = run(SOURCE, [ 'byId' ]);
        expect(out).toContain('Helpers.GetValue(byId');
    });

    test('receiver not a declared map: helper kept', () => {
        const out = run(SOURCE, [ 'value' ]);
        expect(out).toContain('Helpers.GetValue(byId');
    });

    test('key read through a call result: helper kept', () => {
        const source = SOURCE.replace("byId[value['id']]", "byId[this.pick (value)['id']]").replace('use (x: any): void {', 'pick (x: any): any {\n        return x;\n    }\n    use (x: any): void {');
        const out = run(source, [ 'byId', 'value' ]);
        expect(out).toContain('Helpers.GetValue(byId');
    });
});
