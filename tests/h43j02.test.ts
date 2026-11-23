import { Transpiler } from '../src/transpiler';
import fs from 'fs';
import path from 'path';

jest.mock('module', () => ({
    __esModule: true,
    default: jest.fn()
}));

// a string literal argument of startsWith / endsWith prints with no checkcast; a non-literal
// argument keeps it; a bare String-parameter receiver still makes a primitive boolean condition
describe('h43j02 java startsWith / endsWith literal arguments', () => {
    const TMP = path.join(__dirname, 'files', 'tmp-h43j02');
    const FIXTURE = path.join(TMP, 'ts', 'src', 'bitfake.ts');
    const source =
    "class T {\n" +
    "    f1 (status: string): any { return status.endsWith ('limit'); }\n" +
    "    f2 (status: string): any { return status.startsWith ('C-'); }\n" +
    "    f3 (status: string, suffix: any): any { return status.endsWith (suffix); }\n" +
    "    f4 (status: any): any { return status.startsWith ('x'); }\n" +
    "    f5 (status: string): any { if (status.endsWith ('a')) { return 1; } return 2; }\n" +
    "}\n";
    let out: string;

    beforeAll(() => {
        fs.mkdirSync(path.join(TMP, 'ts', 'src', 'base'), { recursive: true });
        fs.writeFileSync(FIXTURE, source);
        const t = new Transpiler({ verbose: false, java: { parser: { NUM_LINES_END_FILE: 0 } } });
        out = t.transpileJavaByPath(FIXTURE).content;
    });

    afterAll(() => {
        fs.rmSync(TMP, { recursive: true, force: true });
    });

    test('a literal argument prints bare', () => {
        expect(out).toContain('return status.endsWith("limit");');
        expect(out).toContain('return status.startsWith("C-");');
        expect(out).not.toContain('((String)"');
    });

    test('a non-literal argument keeps the checkcast', () => {
        expect(out).toContain('status.endsWith(((String)suffix))');
    });

    test('an any receiver keeps its checkcast', () => {
        expect(out).toContain('((String)status).startsWith("x")');
    });

    test('a bare String-parameter receiver is a primitive boolean condition', () => {
        expect(out).toMatch(/if \(status\.endsWith\("a"\)\)/);
        expect(out).not.toContain('Helpers.isTrue(status.endsWith');
    });
});
