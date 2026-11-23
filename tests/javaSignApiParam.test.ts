import { Transpiler } from '../src/transpiler';
import fs from 'fs';
import path from 'path';

jest.mock('module', () => ({ __esModule: true, default: jest.fn() }));

// a defaulted `api: string[]` slot of sign / fetch2 / request prints List<String> in the base and every override
describe('java sign api parameter', () => {
    const TMP = path.join(__dirname, 'files', 'tmp-sign-api-param');
    let out: string;
    let base: string;
    beforeAll(() => {
        fs.mkdirSync(path.join(TMP, 'ts', 'src', 'base'), { recursive: true });
        fs.writeFileSync(path.join(TMP, 'ts', 'src', 'base', 'types.ts'),
            'export type Str = string | undefined;\nexport type Strings = string[] | undefined;\n' +
            'export interface Dictionary<T> { [key: string]: T; }\nexport type Dict = Dictionary<any>;\n');
        fs.writeFileSync(path.join(TMP, 'ts', 'src', 'base', 'Exchange.ts'),
            "import type { Str, Dict } from './types';\n" +
            'export default class Exchange {\n' +
            '    // METHODS BELOW THIS LINE ARE TRANSPILED FROM TYPESCRIPT\n' +
            "    sign (path: string, api: string[] = [ 'public' ], method: string = 'GET', params: Dict = {}, headers: any = undefined, body: any = undefined): Dict { return {}; }\n" +
            '}\n');
        fs.writeFileSync(path.join(TMP, 'ts', 'src', 'probe.ts'),
            "import type { Str, Dict } from './base/types';\nimport Exchange from './base/Exchange';\n" +
            'class Venue extends Exchange {\n' +
            "    sign (path: string, section: string[] = [ 'public' ], method: string = 'GET', params: Dict = {}, headers: any = undefined, body: any = undefined): Dict {\n        return { 'url': section[0] };\n    }\n" +
            "    probe (api: string[]): any {\n        return api;\n    }\n" +
            '}\n');
        const t = new Transpiler({ verbose: false, java: { parser: { NUM_LINES_END_FILE: 0 } } });
        out = t.transpileJavaByPath(path.join(TMP, 'ts', 'src', 'probe.ts')).content;
        base = t.transpileJavaByPath(path.join(TMP, 'ts', 'src', 'base', 'Exchange.ts')).content;
    });
    afterAll(() => fs.rmSync(TMP, { recursive: true, force: true }));

    test('the base and the override print List<String>', () => {
        expect(base).toMatch(/sign\(\w+ path, java\.util\.List<String> api, /);
        expect(out).toMatch(/sign\(\w+ path, java\.util\.List<String> section, /);
    });
    test('a fixed api parameter keeps the Object slot', () => {
        expect(out).toMatch(/probe\(Object api\)/);
    });
});
