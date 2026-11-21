import { rustDropUnusedMut } from '../src/rustUnusedMut';

const fn = (body: string) => `fn f(&mut self) -> Value {\n${body}\n}\n`;

describe('rust unused mut', () => {
    test('a const scalar read only prints let', () => {
        expect(rustDropUnusedMut(fn('    let mut a: i64 = 3;\n    let mut s: String = x.clone();\n    return Value::from(a + s.len() as i64);')))
            .toBe(fn('    let a: i64 = 3;\n    let s: String = x.clone();\n    return Value::from(a + s.len() as i64);'));
    });
    test('a map filled by insert keeps mut', () => {
        const t = fn('    let mut m: crate::value::Dict = Default::default();\n    m.insert("a".into(), Value::Null);\n    return Value::from(m);');
        expect(rustDropUnusedMut(t)).toBe(t);
    });
    test('a &mut argument keeps mut', () => {
        const t = fn('    let mut l: Vec<Value> = Vec::new();\n    fill(&mut l);\n    return l.into();');
        expect(rustDropUnusedMut(t)).toBe(t);
    });
    test('a reassigned let keeps mut', () => {
        const t = fn('    let mut n: i64 = 0;\n    if c { n = 1; }\n    n += 2;\n    return n.into();');
        expect(rustDropUnusedMut(t)).toBe(t);
    });
    test('field and index stores, ref mut and closures keep mut', () => {
        for (const b of ['x.field = 1;', 'x[0] = Value::Null;', 'if let Some(ref mut y) = x {}', 'let c = || x.push(1);', 'x.0 += 1;']) {
            const t = fn(`    let mut x = make();\n    ${b}`);
            expect(rustDropUnusedMut(t)).toBe(t);
        }
    });
    test('a read in a nested block outside the scope does not count', () => {
        expect(rustDropUnusedMut('{ { let mut a = 1; g(a); } a = 2; }')).toBe('{ { let a = 1; g(a); } a = 2; }');
    });
    test('a name inside a string is ignored for scoping braces', () => {
        expect(rustDropUnusedMut(fn('    let mut a = "}";\n    a.push(1);'))).toBe(fn('    let mut a = "}";\n    a.push(1);'));
    });
});
