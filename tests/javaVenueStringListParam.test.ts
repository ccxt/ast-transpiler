import { Transpiler } from '../src/transpiler';
import fs from 'fs';
import os from 'os';
import path from 'path';

jest.mock('module', () => ({ __esModule: true, default: jest.fn() }));

// a venue-private `string[]` slot whose every caller hands an override's own fixed `string[]` parameter prints List<String>
describe('java venue string list parameter', () => {
    let TMP: string;
    let out: string;
    const uses = (name: string) => ({ declared: 1, mentions: name === 'mentioned' ? 1 : 0, handWritten: name === 'handWritten', calls: [] });
    beforeAll(() => {
        TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'venue-string-list-'));
        fs.mkdirSync(path.join(TMP, 'ts', 'src', 'base'), { recursive: true });
        fs.writeFileSync(path.join(TMP, 'ts', 'src', 'base', 'types.ts'),
            'export type Str = string | undefined;\nexport type Strings = string[] | undefined;\n' +
            'export interface Dictionary<T> { [key: string]: T; }\nexport type Dict = Dictionary<any>;\n');
        fs.writeFileSync(path.join(TMP, 'ts', 'src', 'base', 'Exchange.ts'),
            "import type { Str, Dict } from './types';\n" +
            'export default class Exchange {\n' +
            '    // METHODS BELOW THIS LINE ARE TRANSPILED FROM TYPESCRIPT\n' +
            '    async cancelOrders (ids: string[], symbol: Str = undefined, params: Dict = {}): Promise<{}> { return {}; }\n' +
            '    async fetchOrders (symbol: Str = undefined, params: Dict = {}): Promise<{}> { return {}; }\n' +
            '}\n');
        fs.writeFileSync(path.join(TMP, 'ts', 'src', 'probe.ts'),
            "import type { Str, Dict } from './base/types';\nimport Exchange from './base/Exchange';\n" +
            'class Venue extends Exchange {\n' +
            "    override async cancelOrders (ids: string[], symbol: Str = undefined, params: Dict = {}): Promise<{}> {\n" +
            "        const a = this.cancelOrdersRequest (ids, symbol, params);\n        const b = this.loose (ids);\n        const c = this.mentioned (ids);\n" +
            "        const d = this.handWritten (ids);\n        return [ a, b, c, d ];\n    }\n" +
            "    override async fetchOrders (symbol: Str = undefined, params: Dict = {}): Promise<{}> {\n" +
            "        const ids = this.safeList (params, 'ids');\n        return this.loose (ids);\n    }\n" +
            "    cancelOrdersRequest (ids: string[], symbol: Str = undefined, params: Dict = {}): Dict {\n        return { 'n': ids.length, 'ids': ids };\n    }\n" +
            "    loose (ids: string[]): Dict {\n        return { 'ids': ids };\n    }\n" +
            "    mentioned (ids: string[]): Dict {\n        return { 'ids': ids };\n    }\n" +
            "    handWritten (ids: string[]): Dict {\n        return { 'ids': ids };\n    }\n" +
            "    safeList (p: any, k: string): any {\n        return p[k];\n    }\n" +
            '}\n');
        const t = new Transpiler({ verbose: false, java: { parser: { NUM_LINES_END_FILE: 0 } } });
        (t as any).javaTranspiler.javaRepoMethodUses = (name: string) => uses(name);
        out = t.transpileJavaByPath(path.join(TMP, 'ts', 'src', 'probe.ts')).content;
    });
    afterAll(() => fs.rmSync(TMP, { recursive: true, force: true }));

    test('every caller hands an override string[] parameter: List<String>, passed without a helper', () => {
        expect(out).toMatch(/cancelOrdersRequest\(java\.util\.List<String> ids, /);
        expect(out).toMatch(/this\.cancelOrdersRequest\(ids, symbol, /);
        expect(out).not.toMatch(/toStringListArg\(ids\)/);
    });
    test('a caller handing an untyped value keeps the Object slot', () => {
        expect(out).toMatch(/loose\(Object ids\)/);
    });
    test('a dynamically mentioned or hand-written name keeps the Object slot', () => {
        expect(out).toMatch(/mentioned\(Object ids\)/);
        expect(out).toMatch(/handWritten\(Object ids\)/);
    });
});
