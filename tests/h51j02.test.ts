import { Transpiler } from '../src/transpiler';
import fs from 'fs';
import path from 'path';

jest.mock('module', () => ({ __esModule: true, default: jest.fn() }));

// a venue createOrderRequest / createTestOrder / signAndCreateOrder prints a Double amount and price
describe('java order-request Double arguments from Double locals and parameters', () => {
    const TMP = path.join(__dirname, 'files', 'tmp-h51j02-order-request-args');
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
            '    safeNumber (o: any, k: any, d: Num = undefined): Num { return d; }\n' +
            '}\n');
        fs.writeFileSync(path.join(TMP, 'ts', 'src', 'probe.ts'),
            "import type { Dict, Num, Str } from './base/types';\nimport Exchange from './base/Exchange';\n" +
            'class Venue extends Exchange {\n' +
            "    createOrderRequest (symbol: Str, type: Str, side: Str, amount: Num, price: Num = undefined, params: Dict = {}): Dict {\n        if (price === undefined) {\n            return { 'amount': amount };\n        }\n        return { 'amount': amount, 'price': price };\n    }\n" +
            "    async createOrder (symbol: string, type: string, side: string, amount: number, price: Num = undefined, params: Dict = {}): Promise<{}> {\n        const amt = this.safeNumber (params, 'amount');\n        const a = this.createOrderRequest (symbol, type, side, amt, price, params);\n        const boxed: any = params['x'];\n        return this.createOrderRequest (symbol, type, side, boxed, undefined, a);\n    }\n" +
            "    async createTestOrder (symbol: string, type: string, side: string, amount: number, price: Num = undefined, params: Dict = {}): Promise<{}> {\n        return { 'amount': amount, 'price': price };\n    }\n" +
            "    otherRequest (symbol: Str, amount: Num, price: Num = undefined): Dict {\n        return { 'amount': amount, 'price': price };\n    }\n" +
            '}\n');
        fs.writeFileSync(path.join(TMP, 'ts', 'src', 'strvenue.ts'),
            "import type { Dict, Str } from './base/types';\nimport Exchange from './base/Exchange';\n" +
            'class StrVenue extends Exchange {\n' +
            "    createOrderRequest (symbol: Str, type: Str, side: Str, amount: Str, price: any = undefined, params: Dict = {}): Dict {\n        return { 'amount': amount, 'price': price };\n    }\n" +
            '}\n');
        const t = new Transpiler({ verbose: false, java: { parser: { NUM_LINES_END_FILE: 0 } } });
        // the build layer declares the safeNumber local Double
        (t as any).javaTranspiler.javaDeclaredLocalTypeResolver = (declaration: any) => (declaration?.name?.text === 'amt' ? 'Double' : undefined);
        out = t.transpileJavaByPath(path.join(TMP, 'ts', 'src', 'probe.ts')).content
            + t.transpileJavaByPath(path.join(TMP, 'ts', 'src', 'strvenue.ts')).content;
    });
    afterAll(() => fs.rmSync(TMP, { recursive: true, force: true }));

    test('a safeNumber local passes the Double slot uncast', () => {
        expect(out).toMatch(/createOrderRequest\([^;]*side\), amt, price, /);
        expect(out).not.toContain('(Double) (amt)');
    });
    test('an Object local still takes the checkcast', () => {
        expect(out).toContain('(Double) (boxed)');
    });
});
