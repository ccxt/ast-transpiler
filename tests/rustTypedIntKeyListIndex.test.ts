import { Transpiler } from '../src/transpiler';

// a typed `i64` / `Option<i64>` local indexing a checker-proven list reads the array arm of `get_value` natively
let transpiler: Transpiler;
beforeAll(() => {
    transpiler = new Transpiler({ 'verbose': false, 'rust': { 'parser': { 'NUM_LINES_END_FILE': 0 } } });
});

const run = (body: string, params = 'parts: string[]') => transpiler.transpileRust(
    'class T {\n' +
    '    m(' + params + ') {\n' + body + '    }\n' +
    '}').content;

describe('rust typed integer key into a proven list', () => {
    test('a plain int local reads the slice', () => {
        const out = run(
            '        const n = parts.length;\n' +
            '        const last = n - 1;\n' +
            '        return \'A_\' + parts[last];\n');
        expect(out).not.toContain('get_value(&parts');
        expect(out).toContain('parts.as_array().zip(Some(last)).and_then(|(__arr, __n)| if __n < 0 { None } else { __arr.get(__n as usize) }).cloned().unwrap_or(Value::Null)');
    });

    test('an untyped key keeps the helper', () => {
        const out = run(
            '        return parts[k];\n', 'parts: string[], k');
        expect(out).toContain('get_value(&parts');
        expect(out).not.toContain('.zip(');
    });

    test('a string key on a dict receiver keeps its own read', () => {
        const out = run(
            '        const k = \'a\';\n' +
            '        return d[k];\n', 'd: any');
        expect(out).not.toContain('.zip(');
    });
});
