import { Transpiler } from '../src/transpiler';

jest.mock('module', () => ({ __esModule: true, default: jest.fn() }));

const transpiler = new Transpiler({ verbose: false, rust: { parser: { NUM_LINES_END_FILE: 0 } } } as any);
const JWT = "function jwt (r: any, s: any, h: any, isRsa = false, o: any = {}): any { return r; }\n";

describe('typed dict local from a dict literal', () => {
    test('a spread-free literal builds the Arc directly, with no Value::Map box and no into_dict', () => {
        const ts = JWT + "class T {\n    f (a: any, b: any) {\n        const request = { 'access_key': a };\n        request['query_hash'] = b;\n        return jwt (request, b, 'sha256');\n    }\n}";
        const out = transpiler.transpileRust(ts).content;
        expect(out).toContain('let mut request: crate::value::Dict = std::sync::Arc::new({');
        expect(out).not.toContain('}).into_dict();');
    });

    test('negative: a literal kept in a Value local (no typed dict) keeps Value::Map', () => {
        const ts = "class T {\n    f (a: any) {\n        const request = { 'access_key': a };\n        return request;\n    }\n}";
        const out = transpiler.transpileRust(ts).content;
        expect(out).not.toContain('std::sync::Arc::new({');
    });

    test('negative: a non-literal initializer keeps into_dict', () => {
        const ts = JWT + "class T {\n    g (x: any): any { return x; }\n    f (a: any, b: any) {\n        const request = this.g ({ 'k': a });\n        request['query_hash'] = b;\n        return jwt (request, b, 'sha256');\n    }\n}";
        const out = transpiler.transpileRust(ts).content;
        expect(out).not.toContain('crate::value::Dict = std::sync::Arc::new(');
    });
});
