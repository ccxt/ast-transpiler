import { Transpiler } from '../src/transpiler';

jest.mock('module', () => ({
    __esModule: true,
    default: jest.fn()
}));

const config = {
    'verbose': false,
    'csharp': { 'parser': { 'NUM_LINES_END_FILE': 0, 'ELEMENT_ACCESS_WRAPPER_OPEN': 'getValue(', 'ELEMENT_ACCESS_WRAPPER_CLOSE': ')' } }
};

// `declared` answers csharpStringReceiverType, the hook the embedding build layer fills with the
// type its retyped declaration carries
function printed(source: string, declared?: string): string {
    const transpiler = new Transpiler(config);
    if (declared !== undefined) {
        (transpiler as any).csharpTranspiler.csharpStringReceiverType = (receiver: any) => (receiver?.text === 'id' ? declared : undefined);
    }
    return transpiler.transpileCSharp(source).content;
}

const body = (lines: string) => 'class T {\n    f (id: string, rows: any, i: number) {\n' + lines + '\n    }\n}';

describe('csharp literal-index read on a declared string local', () => {
    test('a string? receiver reads through the indexer with the helper null and range tests', () => {
        const out = printed(body('        return id[0];'), 'string?');
        expect(out).toContain('(id != null && 0 < id.Length ? id[0].ToString () : null)');
        expect(out).not.toContain('getValue(id, 0)');
    });

    test('a string receiver and a larger literal index', () => {
        expect(printed(body('        return id[3];'), 'string')).toContain('(id != null && 3 < id.Length ? id[3].ToString () : null)');
    });

    test('an object-declared or unknown receiver keeps the helper', () => {
        expect(printed(body('        return id[0];'))).toContain('getValue(id, 0)');
        expect(printed(body('        return id[0];'), 'object')).toContain('getValue(id, 0)');
        expect(printed(body('        return id[0];'), 'List<object>')).not.toContain('.ToString ()');
    });

    test('a non-literal index, a string key and a foreign receiver keep the helper', () => {
        expect(printed(body('        return id[i];'), 'string?')).not.toContain('.ToString ()');
        expect(printed(body('        return id[\'a\'];'), 'string?')).not.toContain('.Length');
        expect(printed(body('        return rows[0];'), 'string?')).not.toContain('.Length');
    });

    test('a write target keeps its printed form', () => {
        const out = printed(body('        id[0] = \'x\';'), 'string?');
        expect(out).not.toContain('.Length');
    });
});
