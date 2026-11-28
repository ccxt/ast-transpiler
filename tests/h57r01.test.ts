import { Transpiler } from '../src/transpiler';

jest.mock('module', () => ({ __esModule: true, default: jest.fn() }));

describe('h57r01: `x.toString ()` on an untyped receiver prints the Display text, no runtime helper', () => {
    const transpiler = new Transpiler({ verbose: false, rust: { parser: { NUM_LINES_END_FILE: 0 } } });
    const rust = (ts: string) => transpiler.transpileRust(ts).content;
    const cls = (body: string) => 'class E {\n    hold(x: any): any { return x; }\n    log(x: any) { return x; }\n' + body + '}';
    test('an any parameter', () => {
        const out = rust('function f(x: any) { return x.toString(); }');
        expect(out).toContain('Value::Str(format!("{}", x).into())');
        expect(out).not.toContain('to_string_val(');
    });
    test('an any local read from an element, assigned and concatenated', () => {
        const out = rust(cls(
            '    run(value: any[]) {\n' +
            '        let arrStr: any = undefined;\n' +
            '        for (let j = 0; j < value.length; j++) {\n' +
            '            const arrayElement = value[j];\n' +
            '            if (j > 0) {\n                arrStr += \',\' + arrayElement.toString ();\n' +
            '            } else {\n                arrStr = arrayElement.toString ();\n            }\n' +
            '        }\n' +
            '        return this.hold(arrStr);\n    }\n'));
        expect(out).not.toContain('to_string_val(');
        expect(out).toContain('arrStr = Value::Str(format!("{}", arrayElement).into());');
    });
    test('a caught error inside a `+` chain', () => {
        const out = rust(cls(
            '    run(n: number) {\n' +
            '        try {\n            this.hold(n);\n        } catch (e) {\n' +
            '            this.log(\'failed: \' + e.toString () + \', retrying \' + n.toString ());\n        }\n    }\n'));
        expect(out).not.toContain('to_string_val(');
        expect(out).toContain('e');
    });
    test('`s += v.toString ()` appends the Display text', () => {
        const out = rust(cls(
            '    run(value: any[]) {\n' +
            '        let s = \'[\';\n' +
            '        const v = value[0];\n' +
            '        s += v.toString ();\n' +
            '        return this.hold(s);\n    }\n'));
        expect(out).toContain('s.push_str(&format!("{}", v));');
    });
    test('negative: a ternary arm on a possibly-null box keeps its null guard and the other arm', () => {
        const out = rust('function f(x: any) { const r = (x !== undefined) ? x.toString() : "undefined"; return r; }');
        expect(out).toContain('Value::Str("undefined".into())');
        expect(out).toContain('Value::Str(format!("{}", x).into())');
    });
    test('negative: number and string receivers keep their existing forms', () => {
        expect(rust('function f(n: number) { const r = n.toString(); return r; }')).toContain('format!("{}", n)');
        expect(rust('function f(s: string) { const r = s.toString(); return r; }')).toContain('Value::Str(format!("{}", s).into())');
    });
    test('negative: other methods on an any receiver are untouched', () => {
        const out = rust('function f(x: any) { return x.toFixed(2); }');
        expect(out).toContain('to_fixed(&x,');
    });
});
