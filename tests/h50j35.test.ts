import { Transpiler } from '../src/transpiler';
import fs from 'fs';
import path from 'path';

jest.mock('module', () => ({ __esModule: true, default: jest.fn() }));

// `<` on a parameter the signature prints `String` and a string literal compares with compareTo
describe('java ordering of a String parameter and a string literal', () => {
    const TMP = path.join(__dirname, 'files', 'tmp-h50j35-string-param');
    let base: string;
    beforeAll(() => {
        fs.mkdirSync(path.join(TMP, 'ts', 'src', 'base'), { recursive: true });
        fs.writeFileSync(path.join(TMP, 'ts', 'src', 'base', 'types.ts'),
            'export type Int = number | undefined;\nexport type Str = string | undefined;\n' +
            'export interface Dictionary<T> { [key: string]: T; }\nexport type Dict = Dictionary<any>;\n');
        fs.writeFileSync(path.join(TMP, 'ts', 'src', 'base', 'Exchange.ts'),
            "import type { Int, Str, Dict } from './types';\n" +
            'export default class Exchange {\n' +
            '    // METHODS BELOW THIS LINE ARE TRANSPILED FROM TYPESCRIPT\n' +
            "    strLow (hex: Str): string {\n        if (hex === undefined) {\n            return '';\n        }\n        if (hex < '80') {\n            return hex;\n        }\n        return 'x';\n    }\n" +
            "    anyLow (hex: any): string {\n        if (hex < '80') {\n            return 'a';\n        }\n        return 'x';\n    }\n" +
            "    addLow (hex: Str): string {\n        hex += '0';\n        if (hex < '80') {\n            return 'a';\n        }\n        return 'x';\n    }\n" +
            '}\n');
        const t = new Transpiler({ verbose: false, java: { parser: { NUM_LINES_END_FILE: 0 } } });
        base = t.transpileJavaByPath(path.join(TMP, 'ts', 'src', 'base', 'Exchange.ts')).content;
    });
    afterAll(() => fs.rmSync(TMP, { recursive: true, force: true }));

    const member = (name: string) => base.slice(base.indexOf(name + '('), base.indexOf('\n    }\n', base.indexOf(name + '(')));

    test('a String parameter against a literal prints compareTo inside the helper null table', () => {
        expect(member('strLow')).toMatch(/strLow\(String hex\)/);
        expect(member('strLow')).toContain('(\"80\" != null && (hex == null || hex.compareTo(\"80\") < 0))');
        expect(member('strLow')).not.toContain('Helpers.isLessThan');
        expect(member('strLow')).not.toContain('j38a');
    });
    test('an any slot keeps the boxed compare', () => {
        expect(member('anyLow')).not.toContain('compareTo');
    });
    test('a compound-assigned parameter keeps the boxed compare', () => {
        expect(member('addLow')).not.toContain('compareTo');
    });
});
