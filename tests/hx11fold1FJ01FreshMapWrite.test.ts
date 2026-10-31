import { Transpiler } from '../src/transpiler';

jest.mock('module', () => ({ __esModule: true, default: jest.fn() }));

let transpiler: Transpiler;
beforeAll(() => {
    transpiler = new Transpiler({ 'verbose': false, 'java': { 'parser': { 'NUM_LINES_END_FILE': 0 } } });
});

const run = (body: string) => transpiler.transpileJava(`class T {\n    test(other: any): void {\n${body}\n    }\n}`).content;

describe('java element write of a fresh-map local into a base map field', () => {
    test('any-typed local bound once to an object literal puts natively', () => {
        const out = run("        const seeded: any = { 'a': 1 };\n        this.balance['k'] = seeded;");
        expect(out).toContain('this.balance.put("k", seeded)');
        expect(out).not.toContain('addElementToObject');
    });

    test('a local reassigned from an unproven value keeps the helper', () => {
        const out = run("        let seeded: any = { 'a': 1 };\n        seeded = other;\n        this.balance['k'] = seeded;");
        expect(out).toContain('Helpers.addElementToObject(this.balance, "k", seeded)');
    });

    test('a parameter keeps the helper', () => {
        const out = run("        this.balance['k'] = other;");
        expect(out).toContain('Helpers.addElementToObject(this.balance, "k", other)');
    });
});
