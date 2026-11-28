import { Transpiler } from '../src/transpiler';
import fs from 'fs';
import path from 'path';

jest.mock('module', () => ({ __esModule: true, default: jest.fn() }));

// a required `Int` parameter of a sync method the (Prediction)Exchange tier declares prints Long
describe('java required sync Int parameter', () => {
    const TMP = path.join(__dirname, 'files', 'tmp-h49j33-sync-int');
    let out: string;
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
            "    intToHex (value: Int): string {\n        if (value === undefined) {\n            return 'x';\n        }\n        if (value === 0) {\n            return '';\n        }\n        return 'y';\n    }\n" +
            "    optHex (value: Int = undefined): string {\n        if (value === 0) {\n            return '';\n        }\n        return 'y';\n    }\n" +
            "    anyHex (value: any): string {\n        if (value === 0) {\n            return '';\n        }\n        return 'y';\n    }\n" +
            '}\n');
        fs.writeFileSync(path.join(TMP, 'ts', 'src', 'probe.ts'),
            "import type { Int } from './base/types';\nimport Exchange from './base/Exchange';\n" +
            'class Venue extends Exchange {\n' +
            "    own (value: Int): string {\n        if (value === 0) {\n            return '';\n        }\n        return 'y';\n    }\n" +
            '}\n');
        const t = new Transpiler({ verbose: false, java: { parser: { NUM_LINES_END_FILE: 0 } } });
        out = t.transpileJavaByPath(path.join(TMP, 'ts', 'src', 'probe.ts')).content;
        base = t.transpileJavaByPath(path.join(TMP, 'ts', 'src', 'base', 'Exchange.ts')).content;
    });
    afterAll(() => fs.rmSync(TMP, { recursive: true, force: true }));

    test('the base declaration prints Long and its zero compare is native with the null arm', () => {
        expect(base).toMatch(/intToHex\(Long value\)/);
        expect(base).toContain('value != null && value == 0');
    });
    test('an any slot keeps the Object slot and the helper', () => {
        expect(base).toMatch(/anyHex\(Object value\)/);
        expect(base).toContain('Helpers.isEqual(value, 0)');
    });
    test('a venue-only sync Int keeps the Object slot', () => {
        expect(out).toMatch(/own\(Object value\)/);
    });
});
