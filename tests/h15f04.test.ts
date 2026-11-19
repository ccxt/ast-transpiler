import { Transpiler } from '../src/transpiler';

jest.mock('module', () => ({ __esModule: true, default: jest.fn() }));

describe('delete on an options sub-dict reaches the stored field', () => {
    const t = new Transpiler({ verbose: false, rust: { parser: { NUM_LINES_END_FILE: 0 } } });
    const src = (body: string) => `class Exchange {\n    options = {};\n    f (connectId: string, d) {\n${body}\n    }\n}\n`;
    test('identifier key removes inside self.options', () => {
        const out = t.transpileRust(src("        delete this.options['urls'][connectId];")).content;
        expect(out).toContain('if let Some(__v) = std::sync::Arc::make_mut(&mut self.options).get_mut("urls") { remove(__v, &connectId); }');
        expect(out).not.toContain('remove(&mut self.options.get(');
    });
    test('literal key removes inside self.options', () => {
        const out = t.transpileRust(src("        delete this.options['urls']['x'];")).content;
        expect(out).toContain('.get_mut("urls") { remove(__v, &');
    });
    test('a non-options field or a computed sub key keeps the old form', () => {
        const a = t.transpileRust(src("        delete d['urls'][connectId];")).content;
        expect(a).not.toContain('get_mut("urls")');
        const b = t.transpileRust(src("        delete this.options[connectId]['x'];")).content;
        expect(b).not.toContain('make_mut(&mut self.options).get_mut(');
    });
});
