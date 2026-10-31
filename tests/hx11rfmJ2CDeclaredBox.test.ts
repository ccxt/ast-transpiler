import { Transpiler } from '../src/transpiler';

jest.mock('module', () => ({
    __esModule: true,
    default: jest.fn()
}));

// hx11 RFM-J2 leaf C: the Helpers.isTrue / add / subtract / multiply / divide family from the DECLARED
// Java type of the operands (ccxt's build/hx10w2-J03.js text pass folded into the printer).
describe('java declared-box operands: native arithmetic and boolean parameter conditions', () => {
    const DECLARED: { [name: string]: string } = {
        a: 'Long', b: 'Long', n: 'Integer', i: 'int', d: 'Double', e: 'Double', p: 'long', f: 'double', g: 'double', s: 'String',
    };
    let printer: any;
    let transpiler: Transpiler;

    beforeAll(() => {
        transpiler = new Transpiler({ 'verbose': false, 'java': { 'parser': { 'NUM_LINES_END_FILE': 0 } } });
        printer = (transpiler as any).javaTranspiler;
        printer.javaDeclaredLocalTypeResolver = (declaration: any) => DECLARED[declaration?.name?.text];
    });

    // the checker must see plain numbers: the resolver names the Java type, the TS type gates the family
    const numeric = (body: string) => transpiler.transpileJava(
        'type Int = number | undefined;\n' +
        'class T {\n' +
        '    m (q: any): any {\n' +
        '        const a: Int = q; const b: Int = q; const n: Int = q; const i: Int = q;\n' +
        '        const d: Int = q; const e: Int = q; const p: Int = q; const f: Int = q; const g: Int = q;\n' +
        body +
        '    }\n' +
        '}\n').content;

    test('Long x Long multiply / add / subtract carry the helper null arm as a ternary', () => {
        const out = numeric('        return [ a * b, a + b, a - b ];\n');
        expect(out).toContain('((a == null || b == null) ? null : (a * b))');
        expect(out).toContain('((a == null || b == null) ? null : (a + b))');
        expect(out).toContain('((a == null || b == null) ? null : (a - b))');
        expect(out).not.toContain('Helpers.multiply');
        expect(out).not.toContain('Helpers.add');
        expect(out).not.toContain('Helpers.subtract');
    });

    test('Long x int literal widens the literal, Integer widens the box', () => {
        const out = numeric('        return [ a * 20, n * 16 ];\n');
        expect(out).toContain('((a == null) ? null : (a * 20L))');
        expect(out).toContain('((n == null) ? null : (((long) n) * 16L))');
    });

    test('primitive long / int operands need no null arm', () => {
        const out = numeric('        return [ p * 2, i + 1 ];\n');
        expect(out).toContain('(p * 2L)');
        expect(out).toContain('(((long) i) + 1L)');
    });

    test('divide keeps the helper (the old text pass had no residual site the later passes did not own)', () => {
        const out = numeric('        return a / b;\n');
        expect(out).toContain('Helpers.divide(a, b)');
    });

    test('primitive double operands are native; Double boxes and Double multiply keep the helper', () => {
        // Helpers.add/subtract answer toDouble (null) = 0.0 against a Double partner, so one ternary arm
        // would diverge: a boxed operand of a double + / - keeps the helper, as does multiply (re-boxes Long)
        const out = numeric('        return [ f - g, f / g, d - e, d * e, d + e, a + f, f * g ];\n');
        expect(out).toContain('(f - g)');
        expect(out).toContain('Helpers.divide(f, g)');
        expect(out).toContain('Helpers.subtract(d, e)');
        expect(out).toContain('Helpers.multiply(d, e)');
        expect(out).toContain('Helpers.add(d, e)');
        expect(out).toContain('Helpers.add(a, f)');
        expect(out).toContain('Helpers.multiply(f, g)');
    });

    test('an Object / undeclared operand keeps the helper', () => {
        const out = transpiler.transpileJava(
            'class T {\n    m (q: any, r: number): any {\n        const a: number = q;\n        return a * r;\n    }\n}\n').content;
        expect(out).toContain('Helpers.multiply(a, r)');
    });

    test('a result read as a ternary arm keeps the helper (the arm would be binary-promoted)', () => {
        const out = numeric('        return q ? (a * b) : 1.5;\n');
        expect(out).toContain('Helpers.multiply(a, b)');
    });

    test('boolean / Bool method parameter conditions are the null-safe TRUE test', () => {
        const out = transpiler.transpileJava(
            'class T {\n' +
            '    m (flag: boolean = false, opt: boolean | undefined, raw: any, written: boolean = false): any {\n' +
            '        let r = 0;\n' +
            '        if (flag) { r = 1; }\n' +
            '        if (opt) { r = 2; }\n' +
            '        if (raw) { r = 3; }\n' +
            '        written = this.safeBool ({}, "k", false);\n' +
            '        if (written) { r = 4; }\n' +
            '        return r;\n' +
            '    }\n' +
            '    safeBool (o: any, k: string, d: boolean): boolean { return d; }\n' +
            '}\n').content;
        expect(out).toContain('Boolean.TRUE.equals(java.util.Objects.requireNonNullElse(flag, false))');
        expect(out).toContain('Boolean.TRUE.equals(opt)');
        expect(out).toContain('Helpers.isTrue(raw)');
        expect(out).not.toContain('Boolean.TRUE.equals(written)');
        expect(out).not.toContain('Boolean.TRUE.equals(java.util.Objects.requireNonNullElse(written');
    });
});
