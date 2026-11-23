import { Transpiler } from '../src/transpiler';
import fs from 'fs';
import path from 'path';

jest.mock('module', () => ({ __esModule: true, default: jest.fn() }));

// a fixed `string[]` parameter of an async unified method the Exchange tier declares prints List<String>
describe('java unified string list parameter', () => {
    const TMP = path.join(__dirname, 'files', 'tmp-unified-string-list-param');
    let out: string;
    let base: string;
    beforeAll(() => {
        fs.mkdirSync(path.join(TMP, 'ts', 'src', 'base'), { recursive: true });
        fs.writeFileSync(path.join(TMP, 'ts', 'src', 'base', 'types.ts'),
            'export type Str = string | undefined;\nexport type Strings = string[] | undefined;\n' +
            'export interface Dictionary<T> { [key: string]: T; }\nexport type Dict = Dictionary<any>;\n');
        fs.writeFileSync(path.join(TMP, 'ts', 'src', 'base', 'Exchange.ts'),
            "import type { Str, Strings, Dict } from './types';\n" +
            'export default class Exchange {\n' +
            '    // METHODS BELOW THIS LINE ARE TRANSPILED FROM TYPESCRIPT\n' +
            '    async cancelOrders (ids: string[], symbol: Str = undefined, params: Dict = {}): Promise<{}> { return {}; }\n' +
            '    async fetchTickers (outcomes: Strings = undefined, params: Dict = {}): Promise<{}> { return {}; }\n' +
            '}\n');
        fs.writeFileSync(path.join(TMP, 'ts', 'src', 'probe.ts'),
            "import type { Str, Dict } from './base/types';\nimport Exchange from './base/Exchange';\n" +
            'class Venue extends Exchange {\n' +
            "    async cancelOrders (ids: string[], symbol: Str = undefined, params: Dict = {}): Promise<{}> {\n        return { 'ids': ids };\n    }\n" +
            "    async cancelOrder (id: string, symbol: Str = undefined, params: Dict = {}): Promise<{}> {\n        return await this.cancelOrders ([ id ], symbol, params);\n    }\n" +
            "    async fetchTickers (outcomes: string[] = undefined, params: Dict = {}): Promise<{}> {\n        return { 'n': outcomes.length };\n    }\n" +
            "    async venueOnly (outcomes: string[] = undefined): Promise<{}> {\n        return { 'o': outcomes };\n    }\n" +
            "    async other (names: string[]): Promise<{}> {\n        return { 'names': names };\n    }\n" +
            "    plain (names: string[]): any {\n        return names;\n    }\n" +
            "    async loose (x: any): Promise<{}> {\n        return await this.cancelOrders (x);\n    }\n" +
            '}\n');
        const t = new Transpiler({ verbose: false, java: { parser: { NUM_LINES_END_FILE: 0 } } });
        out = t.transpileJavaByPath(path.join(TMP, 'ts', 'src', 'probe.ts')).content;
        base = t.transpileJavaByPath(path.join(TMP, 'ts', 'src', 'base', 'Exchange.ts')).content;
    });
    afterAll(() => fs.rmSync(TMP, { recursive: true, force: true }));

    test('the override and the base declaration print List<String>', () => {
        expect(out).toMatch(/cancelOrders\(java\.util\.List<String> ids, /);
        expect(base).toMatch(/cancelOrders\(java\.util\.List<String> ids, /);
    });
    test('a literal of a proven String builds a List<String>', () => {
        expect(out).toMatch(/cancelOrders\(new java\.util\.ArrayList<String>\(java\.util\.Arrays\.asList\(id\)\), /);
    });
    test('an untyped argument converts through the list helper, not a checkcast', () => {
        expect(out).toMatch(/cancelOrders\(Helpers\.toStringListArg\(x\)/);
        expect(out).not.toMatch(/\(java\.util\.List<String>\) \(x\)/);
    });
    test('an optional Strings parameter of a unified method prints List<String>', () => {
        expect(out).toMatch(/fetchTickers\(java\.util\.List<String> outcomes, /);
        expect(base).toMatch(/fetchTickers\(java\.util\.List<String> outcomes, /);
        expect(out).toMatch(/venueOnly\(Object outcomes/);
    });
    test('a venue-only method keeps the Object slot', () => {
        expect(out).toMatch(/other\(Object names\)/);
        expect(out).toMatch(/plain\(Object names\)/);
    });
});
