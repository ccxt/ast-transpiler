import { Transpiler } from '../src/transpiler';
import fs from 'fs';
import path from 'path';

jest.mock('module', () => ({ __esModule: true, default: jest.fn() }));

// a default-valued `int` parameter prints the core's Long slot, like `Int`
describe('java int default parameter', () => {
    const TMP = path.join(__dirname, 'files', 'tmp-int-default-param');
    let out: string;
    beforeAll(() => {
        fs.mkdirSync(path.join(TMP, 'ts', 'src', 'base'), { recursive: true });
        fs.writeFileSync(path.join(TMP, 'ts', 'src', 'base', 'types.ts'),
            'export type Int = number | undefined;\nexport type int = number;\n' +
            'export interface Dictionary<T> { [key: string]: T; }\nexport type Dict = Dictionary<any>;\n');
        fs.writeFileSync(path.join(TMP, 'ts', 'src', 'base', 'Exchange.ts'),
            'export default class Exchange {\n    safeInteger (x: any, k: any): any { return x; }\n}\n');
        fs.writeFileSync(path.join(TMP, 'ts', 'src', 'probe.ts'),
            "import type { int, Dict } from './base/types';\nimport Exchange from './base/Exchange';\n" +
            'class Venue extends Exchange {\n' +
            "    scaled (params: Dict = {}, multiplier: int = 1): any {\n        return multiplier * 3;\n    }\n" +
            "    plain (count: int): any {\n        return count;\n    }\n" +
            "    caller (): any {\n        return this.scaled ({}, 1000000);\n    }\n" +
            '}\n');
        out = new Transpiler({ verbose: false, java: { parser: { NUM_LINES_END_FILE: 0 } } })
            .transpileJavaByPath(path.join(TMP, 'ts', 'src', 'probe.ts')).content;
    });
    afterAll(() => fs.rmSync(TMP, { recursive: true, force: true }));

    test('the slot prints Long and the default reads as a long literal', () => {
        expect(out).toContain('Long multiplier)');
        expect(out).toContain('java.util.Objects.requireNonNullElse(multiplier, 1L)');
    });
    test('a call passes the argument as a long literal', () => {
        expect(out).toContain('this.scaled(');
        expect(out).toContain('1000000L)');
    });
    test('a fixed int parameter keeps today\'s Object slot', () => {
        expect(out).toContain('plain(Object count)');
    });
});
