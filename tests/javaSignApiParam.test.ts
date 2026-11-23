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

// a fixed `api: string[]` slot of a sync base method that venues override prints List<String> in the base and every override
describe('java sync overridden string-list parameter', () => {
    const TMP = path.join(__dirname, 'files', 'tmp-sync-string-list-param');
    const print = (handWritten: boolean, declared: number) => {
        fs.mkdirSync(path.join(TMP, 'ts', 'src', 'base'), { recursive: true });
        fs.writeFileSync(path.join(TMP, 'ts', 'src', 'base', 'types.ts'),
            'export type Strings = string[] | undefined;\nexport interface Dictionary<T> { [key: string]: T; }\nexport type Dict = Dictionary<any>;\n');
        fs.writeFileSync(path.join(TMP, 'ts', 'src', 'base', 'Exchange.ts'),
            "import type { Dict } from './types';\n" +
            'export default class Exchange {\n' +
            '    // METHODS BELOW THIS LINE ARE TRANSPILED FROM TYPESCRIPT\n' +
            '    cost (api: string[], method: string, params: any, config: Dict = {}) { return 1; }\n' +
            '    loose (codes: Strings, method: string) { return 1; }\n' +
            '}\n');
        fs.writeFileSync(path.join(TMP, 'ts', 'src', 'probe.ts'),
            "import type { Dict } from './base/types';\nimport Exchange from './base/Exchange';\n" +
            'class Venue extends Exchange {\n' +
            '    cost (api: string[], method: string, params: any, config: Dict = {}) {\n        return api.length;\n    }\n' +
            '}\n');
        const t = new Transpiler({ verbose: false, java: { parser: { NUM_LINES_END_FILE: 0 } } });
        const printer: any = (t as any).javaTranspiler;
        printer.javaRepoMethodUses = (name: string) => ({ declared: name === 'cost' ? declared : 1, mentions: 0, handWritten, calls: [] });
        return {
            out: t.transpileJavaByPath(path.join(TMP, 'ts', 'src', 'probe.ts')).content,
            base: t.transpileJavaByPath(path.join(TMP, 'ts', 'src', 'base', 'Exchange.ts')).content,
        };
    };
    afterAll(() => fs.rmSync(TMP, { recursive: true, force: true }));

    test('the base and the override print List<String>', () => {
        const { out, base } = print(false, 2);
        expect(base).toMatch(/cost\(java\.util\.List<String> api, \w+ method, /);
        expect(out).toMatch(/cost\(java\.util\.List<String> api, \w+ method, /);
        expect(base).toMatch(/loose\(Object codes, /);
    });
    test('a hand-written use or no override keeps the Object slot', () => {
        expect(print(true, 2).base).toMatch(/cost\(Object api, /);
        expect(print(false, 1).base).toMatch(/cost\(Object api, /);
    });
});
