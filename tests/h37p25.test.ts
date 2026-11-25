import { Transpiler } from '../src/transpiler';

jest.mock('module', () => ({ __esModule: true, default: jest.fn() }));

describe('rust: a String insert key moves at its last use', () => {
    const transpiler = new Transpiler({ verbose: false, rust: { parser: { NUM_LINES_END_FILE: 0 } } });
    const D = "interface Dictionary<T> { [key: string]: T; }\ntype Dict = Dictionary<any>;\ntype Str = string | undefined;\nclass C {\n";
    const run = (body: string) => transpiler.transpileRust(D + "    f (o: any): Dict {\n        const result: Dict = {};\n" + body + "\n        return result;\n    }\n}").content;
    const head = "        let k = 'a';\n        if (o) { k = 'b'; }\n";
    test('positive: inserts in both branches of an if/else move the key (fails on the base printer)', () => {
        const out = run(head + "        if (o === 1) { result[k] = 1; } else { result[k] = 2; }");
        expect(out).toContain('result.insert(k, Value::Int(1));');
        expect(out).toContain('result.insert(k, Value::Int(2));');
    });
    test('positive: a single last-use insert moves the key', () => {
        const out = run(head + "        result[k] = 1;");
        expect(out).toContain('result.insert(k, Value::Int(1));');
    });
    test('negative: a later read keeps the clone', () => {
        const out = run(head + "        if (o === 1) { result[k] = 1; } else { result[k] = 2; }\n        result['z'] = k + 'x';");
        expect(out).toContain('result.insert(k.clone(), Value::Int(1));');
    });
    test('negative: an insert inside a loop keeps the clone', () => {
        const out = run(head + "        for (let i = 0; i < 2; i++) { result[k] = i; }");
        expect(out).not.toMatch(/result\.insert\(k, /);
    });
    test('negative: a nil-declared Str key keeps its Option key text', () => {
        const out = run("        let k: Str = undefined;\n        if (o) { k = 'b'; }\n        result[k] = 1;");
        expect(out).not.toMatch(/result\.insert\(k, /);
    });
});
