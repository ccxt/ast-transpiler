import { Transpiler } from '../src/transpiler';

jest.mock('module', () => ({ __esModule: true, default: jest.fn() }));

describe('rust: a bare argument of a returned call moves at its last use', () => {
    const transpiler = new Transpiler({ verbose: false, rust: { parser: { NUM_LINES_END_FILE: 0 } } });
    const D = "interface Dictionary<T> { [key: string]: T; }\ntype Dict = Dictionary<any>;\ntype Str = string | undefined;\nclass C {\n    safeDict (o: any, k: any, d: any = undefined): Dict { return o; }\n";
    const run = (body: string) => transpiler.transpileRust(D + "    f (key: Str, mapping: Dict = {}): any {\n" + body + "\n    }\n}").content;
    test('positive: guarded returned call moves the local (fails on the base printer)', () => {
        const out = run("        if (key in mapping) { return this.safeDict (mapping, key); }\n        return Object.keys (mapping);");
        expect(out).toContain('self.safeDict(mapping, key');
    });
    test('negative: a later read outside a guard or return keeps the clone', () => {
        const out = run("        if (key in mapping) { return this.safeDict (mapping, key); }\n        const n = mapping;\n        return n;");
        expect(out).toContain('self.safeDict(mapping.clone(), key');
    });
    test('negative: a returned call inside a loop keeps the clone', () => {
        const out = run("        for (let i = 0; i < 2; i++) {\n            if (key in mapping) { return this.safeDict (mapping, key); }\n        }\n        return Object.keys (mapping);");
        expect(out).toContain('self.safeDict(mapping.clone(), key');
    });
});
