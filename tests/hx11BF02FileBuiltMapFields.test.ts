import { Transpiler } from '../src/transpiler';

jest.mock('module', () => ({ __esModule: true, default: jest.fn() }));

let transpiler: Transpiler;

beforeAll(() => {
    transpiler = new Transpiler({ verbose: false, java: { parser: { NUM_LINES_END_FILE: 0 } } });
});

// `this.markets` / `this.positions` are Object/Map base fields: the read is the helper's Map branch and
// a put is the same write only where the file never stores anything but a plain map in the field.
const wrap = (fields: string, body: string) =>
    "type D = { [key: string]: any };\n" +
    "class T {\n" +
    "    markets: D | undefined = undefined;\n" +
    "    positions: any = undefined;\n" +
    "    createSafeDictionary (): D { return {}; }\n" + fields +
    "    test(type: string, v: any): any {\n" + body + "\n    }\n}";
const java = (src: string) => transpiler.transpileJava(src).content;

describe('hx11 BF02: file-built map fields', () => {
    test('a plain-map file reads and puts natively', () => {
        const out = java(wrap(
            "    init (): void {\n        this.positions = {};\n    }\n",
            "        this.positions[type] = v;\n        return this.positions[type];"));
        expect(out).toContain('((java.util.Map<Object, Object>) (java.util.Map<?, ?>) this.positions).put(type, v)');
        expect(out).toContain('(type == null || this.positions == null ? null : ((java.util.Map<?, ?>)this.positions).get(type))');
        expect(out).not.toContain('Helpers.addElementToObject(this.positions');
        expect(out).not.toContain('Helpers.GetValue(this.positions');
    });

    test('a field that also holds a cache object keeps the helpers', () => {
        const out = java(wrap(
            "    init (): void {\n        this.positions = {};\n    }\n    other (): void {\n        this.positions = new Cache ();\n    }\n",
            "        this.positions[type] = v;\n        return this.positions[type];") + "\nclass Cache {}\n");
        expect(out).toContain('Helpers.addElementToObject(this.positions, type, v)');
        expect(out).toContain('Helpers.GetValue(this.positions, type)');
    });

    test('a field with no plain build in the file reads but never puts natively', () => {
        const out = java(wrap("", "        this.markets[type] = v;\n        return this.markets[type];"));
        expect(out).toContain('Helpers.addElementToObject(this.markets, type, v)');
    });

    test('a literal and a local holding one count as plain builds; a non-base createSafeDictionary does not', () => {
        const out = java(wrap(
            "    init (): void {\n        this.markets = {};\n        const empty: D = {};\n        this.positions = empty;\n    }\n",
            "        this.markets[type] = v;\n        this.positions[type] = v;\n        return 1;"));
        expect(out).toContain('(java.util.Map<?, ?>) this.markets).put(type, v)');
        expect(out).toContain('(java.util.Map<?, ?>) this.positions).put(type, v)');
        const own = java(wrap(
            "    init (): void {\n        this.markets = this.createSafeDictionary ();\n    }\n",
            "        this.markets[type] = v;\n        return 1;"));
        expect(own).toContain('Helpers.addElementToObject(this.markets, type, v)');
    });

    test('a compound or foreign assignment keeps the helpers', () => {
        const out = java(wrap(
            "    init (): void {\n        this.markets = this.createSafeDictionary ();\n        this.markets = this.other;\n    }\n    other: any = {};\n",
            "        this.markets[type] = v;\n        return 1;"));
        expect(out).toContain('Helpers.addElementToObject(this.markets, type, v)');
    });
});
