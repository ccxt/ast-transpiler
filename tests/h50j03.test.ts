import { Transpiler } from '../src/transpiler';
import fs from 'fs';
import path from 'path';

jest.mock('module', () => ({ __esModule: true, default: jest.fn() }));

// a venue createOrderRequest / createTestOrder / signAndCreateOrder prints a Double amount and price
describe('java venue order-request amount / price parameters', () => {
    const TMP = path.join(__dirname, 'files', 'tmp-h50j03-order-request');
    let out: string;
    beforeAll(() => {
        fs.mkdirSync(path.join(TMP, 'ts', 'src', 'base'), { recursive: true });
        fs.writeFileSync(path.join(TMP, 'ts', 'src', 'base', 'types.ts'),
            'export type Num = number | undefined;\nexport type Str = string | undefined;\n' +
            'export interface Dictionary<T> { [key: string]: T; }\nexport type Dict = Dictionary<any>;\n');
        fs.writeFileSync(path.join(TMP, 'ts', 'src', 'base', 'Exchange.ts'),
            "import type { Dict, Num } from './types';\n" +
            'export default class Exchange {\n' +
            '    // METHODS BELOW THIS LINE ARE TRANSPILED FROM TYPESCRIPT\n' +
            '    async createOrder (symbol: string, type: string, side: string, amount: number, price: Num = undefined, params: Dict = {}): Promise<{}> { return {}; }\n' +
            '}\n');
        fs.writeFileSync(path.join(TMP, 'ts', 'src', 'probe.ts'),
            "import type { Dict, Num, Str } from './base/types';\nimport Exchange from './base/Exchange';\n" +
            'class Venue extends Exchange {\n' +
            "    createOrderRequest (symbol: Str, type: Str, side: Str, amount: Num, price: Num = undefined, params: Dict = {}): Dict {\n        if (price === undefined) {\n            return { 'amount': amount };\n        }\n        return { 'amount': amount, 'price': price };\n    }\n" +
            "    async createOrder (symbol: string, type: string, side: string, amount: number, price: Num = undefined, params: Dict = {}): Promise<{}> {\n        const a = this.createOrderRequest (symbol, type, side, amount, price, params);\n        return this.createOrderRequest (symbol, type, side, 0, undefined, a);\n    }\n" +
            "    async createTestOrder (symbol: string, type: string, side: string, amount: number, price: Num = undefined, params: Dict = {}): Promise<{}> {\n        return { 'amount': amount, 'price': price };\n    }\n" +
            "    otherRequest (symbol: Str, amount: Num, price: Num = undefined): Dict {\n        return { 'amount': amount, 'price': price };\n    }\n" +
            '}\n');
        fs.writeFileSync(path.join(TMP, 'ts', 'src', 'strvenue.ts'),
            "import type { Dict, Str } from './base/types';\nimport Exchange from './base/Exchange';\n" +
            'class StrVenue extends Exchange {\n' +
            "    createOrderRequest (symbol: Str, type: Str, side: Str, amount: Str, price: any = undefined, params: Dict = {}): Dict {\n        return { 'amount': amount, 'price': price };\n    }\n" +
            '}\n');
        const t = new Transpiler({ verbose: false, java: { parser: { NUM_LINES_END_FILE: 0 } } });
        out = t.transpileJavaByPath(path.join(TMP, 'ts', 'src', 'probe.ts')).content
            + t.transpileJavaByPath(path.join(TMP, 'ts', 'src', 'strvenue.ts')).content;
    });
    afterAll(() => fs.rmSync(TMP, { recursive: true, force: true }));

    test('createOrderRequest and createTestOrder print Double amount and price', () => {
        expect(out).toMatch(/createOrderRequest\(String symbol, String type, String side, Double amount, Double price, /);
        expect(out).toMatch(/createTestOrder\w*\(\w+ symbol, \w+ type, \w+ side, Double amount, Double price, /);
    });
    test('the call passes the typed locals uncast and a literal as a double', () => {
        expect(out).not.toContain('(Double) (amount)');
        expect(out).not.toContain('(Double) (price)');
        expect(out).toMatch(/createOrderRequest\([^;]*side\), 0\.0, /);
    });
    test('the null test on the typed slot keeps its answer', () => {
        expect(out).toMatch(/price, null\)|price == null/);
    });
    test('another method and a string-declared venue keep their slots', () => {
        expect(out).toMatch(/otherRequest\(String symbol, Object amount/);
        expect(out).toMatch(/createOrderRequest\(String symbol, String type, String side, String amount, Object price, /);
    });
});
