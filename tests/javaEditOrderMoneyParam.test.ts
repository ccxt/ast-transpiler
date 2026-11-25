import { Transpiler } from '../src/transpiler';
import fs from 'fs';
import path from 'path';

jest.mock('module', () => ({ __esModule: true, default: jest.fn() }));

// the defaulted `amount` / `price: Num` of the unified edit methods print Double; null still passes
describe('java editOrder amount / price parameters', () => {
    const TMP = path.join(__dirname, 'files', 'tmp-edit-order-money-param');
    let out: string;
    let base: string;
    beforeAll(() => {
        fs.mkdirSync(path.join(TMP, 'ts', 'src', 'base'), { recursive: true });
        fs.writeFileSync(path.join(TMP, 'ts', 'src', 'base', 'types.ts'),
            'export type Num = number | undefined;\nexport interface Dictionary<T> { [key: string]: T; }\nexport type Dict = Dictionary<any>;\n');
        fs.writeFileSync(path.join(TMP, 'ts', 'src', 'base', 'Exchange.ts'),
            "import type { Dict, Num } from './types';\n" +
            'export default class Exchange {\n' +
            '    // METHODS BELOW THIS LINE ARE TRANSPILED FROM TYPESCRIPT\n' +
            '    async editOrder (id: string, symbol: string, type: string, side: string, amount: Num = undefined, price: Num = undefined, params: Dict = {}): Promise<{}> { return {}; }\n' +
            '    async editLimitOrder (id: string, symbol: string, side: string, amount: number, price: Num = undefined, params: Dict = {}): Promise<{}> {\n' +
            "        return await this.editOrder (id, symbol, 'limit', side, amount, price, params);\n    }\n" +
            '}\n');
        fs.writeFileSync(path.join(TMP, 'ts', 'src', 'probe.ts'),
            "import type { Dict, Num } from './base/types';\nimport Exchange from './base/Exchange';\n" +
            'class Venue extends Exchange {\n' +
            "    async editOrder (id: string, symbol: string, type: string, side: string, amount: Num = undefined, price: Num = undefined, params: Dict = {}): Promise<{}> {\n        if (price === undefined) {\n            return {};\n        }\n        return { 'amount': amount, 'price': price };\n    }\n" +
            "    async otherEdit (id: string, amount: Num = undefined, price: Num = undefined, params: Dict = {}): Promise<{}> {\n        return { 'amount': amount, 'price': price };\n    }\n" +
            '}\n');
        const t = new Transpiler({ verbose: false, java: { parser: { NUM_LINES_END_FILE: 0 } } });
        out = t.transpileJavaByPath(path.join(TMP, 'ts', 'src', 'probe.ts')).content;
        base = t.transpileJavaByPath(path.join(TMP, 'ts', 'src', 'base', 'Exchange.ts')).content;
    });
    afterAll(() => fs.rmSync(TMP, { recursive: true, force: true }));

    test('a venue editOrder override prints Double amount and price', () => {
        expect(out).toMatch(/editOrder\w*\(\w+ id, \w+ symbol, \w+ type, \w+ side, Double amount, Double price, /);
        expect(out).not.toMatch(/editOrder\w*\([^)]*Object (amount|price)/);
    });
    test('the base editOrder and editLimitOrder print Double', () => {
        expect(base).toMatch(/editOrder\w*\(\w+ id, \w+ symbol, \w+ type, \w+ side, Double amount, Double price, /);
        expect(base).toMatch(/editLimitOrder\w*\(\w+ id, \w+ symbol, \w+ side, Double amount, Double price, /);
    });
    test('a defaulted Num amount / price of another method keeps the Object slot', () => {
        expect(out).toMatch(/otherEdit\w*\(\w+ id, Object amount, Object price/);
    });
});
