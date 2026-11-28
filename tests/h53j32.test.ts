import { Transpiler } from '../src/transpiler';
import fs from 'fs';
import path from 'path';

jest.mock('module', () => ({ __esModule: true, default: jest.fn() }));

// a venue method's `x: string = '<literal>'` parameter prints String, so its reads are native
describe('java venue string-literal-defaulted parameter', () => {
    const TMP = path.join(__dirname, 'files', 'tmp-h53j32-string-default');
    let out: string;
    beforeAll(() => {
        fs.mkdirSync(path.join(TMP, 'ts', 'src', 'base'), { recursive: true });
        fs.writeFileSync(path.join(TMP, 'ts', 'src', 'base', 'types.ts'),
            'export type Str = string | undefined;\n' +
            'export interface Dictionary<T> { [key: string]: T; }\nexport type Dict = Dictionary<any>;\n');
        fs.writeFileSync(path.join(TMP, 'ts', 'src', 'base', 'Exchange.ts'),
            "import type { Dict } from './types';\n" +
            'export default class Exchange {\n' +
            '    // METHODS BELOW THIS LINE ARE TRANSPILED FROM TYPESCRIPT\n' +
            "    baseJoin (a: string, b: string = 'x'): string { return a + b; }\n" +
            '}\n');
        fs.writeFileSync(path.join(TMP, 'ts', 'src', 'venue.ts'),
            "import type { Dict } from './base/types';\nimport Exchange from './base/Exchange';\n" +
            'class Venue extends Exchange {\n' +
            "    baseString (method: string, url: string, params: Dict, prepend: string = ''): string {\n        return prepend + method + '&' + url;\n    }\n" +
            "    undefDefault (a: string, b: string = undefined): string {\n        return a + b;\n    }\n" +
            "    written (a: string, b: string = 'p'): string {\n        b += a;\n        return b;\n    }\n" +
            "    baseJoin (a: string, b: string = 'y'): string {\n        return b + a;\n    }\n" +
            "    caller (): string {\n        return this.baseString ('GET', 'u', {}, 'pre') + this.baseString ('GET', 'u', {});\n    }\n" +
            '}\n');
        const t = new Transpiler({ verbose: false, java: { parser: { NUM_LINES_END_FILE: 0 } } });
        out = t.transpileJavaByPath(path.join(TMP, 'ts', 'src', 'venue.ts')).content;
    });
    afterAll(() => fs.rmSync(TMP, { recursive: true, force: true }));

    test('the literal-defaulted string slot prints String and its concat is native', () => {
        expect(out).toMatch(/baseString\(String method, String url, [^)]*, String prepend\)/);
        expect(out).not.toMatch(/Helpers\.add\([^;]*prepend/);
    });
    test('an undefined default keeps the Object slot', () => {
        expect(out).toMatch(/undefDefault\(String a, Object b\)/);
    });
    test('a compound-assigned parameter keeps the Object slot', () => {
        expect(out).toMatch(/written\(String a, Object b\)/);
    });
    test('an override of a base method keeps the base slot type', () => {
        expect(out).toMatch(/baseJoin\([A-Za-z]+ a, Object b\)/);
    });
    test('callers pass the literal and the default with no cast', () => {
        expect(out).not.toMatch(/\(String\) ?\("pre"\)/);
    });
});
