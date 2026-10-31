import { Transpiler } from '../src/transpiler';

jest.mock('module', () => ({
    __esModule: true,
    default: jest.fn(),
}));

let output = '';

beforeAll(() => {
    const transpiler = new Transpiler({ verbose: false, rust: { parser: { NUM_LINES_END_FILE: 0 } } } as any);
    output = transpiler.transpileRustByPath('./tests/files/input/rsdictread/ts/src/venue.ts').content;
});

const free = (recv: string, key: string) =>
    `(if let (Some(__m), Some(__k)) = (${recv}.as_map(), ${key}.as_str()) { __m.get(__k).cloned().unwrap_or(Value::Null) } else { Value::Null })`;

describe('rust closure-free dict reads (FM-RS1 L1)', () => {
    test('a Str-place key into a fresh-literal local prints the closure-free read', () => {
        expect(output).toContain(`let mut viaCode: Value = ${free('result', 'code')};`);
        expect(output).not.toContain('get_value(&result, &code)');
    });

    test('a literal key into a proven local prints the native read', () => {
        expect(output).toContain('let mut viaCore: Value = result.as_map().and_then(|__m| __m.get("core")).cloned().unwrap_or(Value::Null);');
        expect(output).toContain('let mut viaLit: Value = merged.as_map().and_then(|__m| __m.get("core")).cloned().unwrap_or(Value::Null);');
    });

    test('a dict-only callee local reads a Str-place key closure-free', () => {
        expect(output).toContain(`let mut viaCode: Value = ${free('merged', 'code')};`);
    });

    test('membership: a computed key on a dict-callee local keeps in_op (content unproven)', () => {
        expect(output).toContain('Value::Bool(in_op(&merged, &code))');
        expect(output).not.toContain('merged.as_map().is_some_and');
    });

    test('a base runtime-state field reads and tests membership natively', () => {
        expect(output).toContain(`let mut viaCode: Value = ${free('self.options', 'code')};`);
    });

    test('an unproven local keeps the helper', () => {
        expect(output).not.toContain('x.as_map()');
        expect(output).toContain('get_value(&x, &code)');
    });
});
