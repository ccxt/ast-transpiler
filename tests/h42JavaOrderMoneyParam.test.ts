import { Transpiler } from '../src/transpiler';
import fs from 'fs';
import path from 'path';

jest.mock('module', () => ({ __esModule: true, default: jest.fn() }));

// createOrder / editOrder and their ws twins print a Double amount and price
describe('java order amount / price parameters', () => {
    const TMP = path.join(__dirname, 'files', 'tmp-h42-order-money-param');
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
            '    async createOrderWs (symbol: string, type: string, side: string, amount: number, price: Num = undefined, params: Dict = {}): Promise<{}> { return {}; }\n' +
            '    async editOrder (id: string, symbol: string, type: string, side: string, amount: Num = undefined, price: Num = undefined, params: Dict = {}): Promise<{}> { return {}; }\n' +
            '    async createTriggerOrder (symbol: string, type: string, side: string, amount: number, price: Num = undefined, triggerPrice: Num = undefined, params: Dict = {}): Promise<{}> { return {}; }\n' +
            '    async createOrderWithTakeProfitAndStopLossWs (symbol: string, type: string, side: string, amount: number, price: Num = undefined, takeProfit: Num = undefined, stopLoss: Num = undefined, params: Dict = {}): Promise<{}> { return {}; }\n' +
            '    async createLimitOrder (symbol: string, side: string, amount: number, price: number, params: Dict = {}): Promise<{}> { return {}; }\n' +
            '    async createMarketOrderWs (symbol: string, side: string, amount: number, price: Num = undefined, params: Dict = {}): Promise<{}> { return {}; }\n' +
            '    async editOrderWs (id: string, symbol: string, type: string, side: string, amount: Num = undefined, price: Num = undefined, params: Dict = {}): Promise<{}> { return {}; }\n' +
            '}\n');
        fs.writeFileSync(path.join(TMP, 'ts', 'src', 'probe.ts'),
            "import type { Dict, Num } from './base/types';\nimport Exchange from './base/Exchange';\n" +
            'class Venue extends Exchange {\n' +
            "    async createOrder (symbol: string, type: string, side: string, amount: number, price: Num = undefined, params: Dict = {}): Promise<{}> {\n        return { 'amount': amount, 'price': price };\n    }\n" +
            "    async createOrderWs (symbol: string, type: string, side: string, amount: number, price: Num = undefined, params: Dict = {}): Promise<{}> {\n        return { 'amount': amount, 'price': price };\n    }\n" +
            "    async editOrder (id: string, symbol: string, type: string, side: string, amount: Num = undefined, price: Num = undefined, params: Dict = {}): Promise<{}> {\n        if (amount === undefined) {\n            return {};\n        }\n        return { 'amount': amount, 'price': price };\n    }\n" +
            "    async editOrderWs (id: string, symbol: string, type: string, side: string, amount: Num = undefined, price: Num = undefined, params: Dict = {}): Promise<{}> {\n        return { 'amount': amount, 'price': price };\n    }\n" +
            "    async createZero (symbol: string, cost: number): Promise<{}> {\n        await this.createOrder (symbol, 'market', 'buy', 0, undefined);\n        return await this.createOrder (symbol, 'market', 'buy', -1, 1);\n    }\n" +
            "    async createTriggerOrder (symbol: string, type: string, side: string, amount: number, price: Num = undefined, triggerPrice: Num = undefined, params: Dict = {}): Promise<{}> {\n        return await this.createOrder (symbol, type, side, amount, price, { 'triggerPrice': triggerPrice });\n    }\n" +
            "    async createOrderWithTakeProfitAndStopLossWs (symbol: string, type: string, side: string, amount: number, price: Num = undefined, takeProfit: Num = undefined, stopLoss: Num = undefined, params: Dict = {}): Promise<{}> {\n        return { 'amount': amount, 'price': price, 'takeProfit': takeProfit };\n    }\n" +
            "    async createLimitOrder (symbol: string, side: string, amount: number, price: number, params: Dict = {}): Promise<{}> {\n        return await this.createOrder (symbol, 'limit', side, amount, price, params);\n    }\n" +
            "    async createMarketOrderWs (symbol: string, side: string, amount: number, price: Num = undefined, params: Dict = {}): Promise<{}> {\n        return await this.createOrderWs (symbol, 'market', side, amount, price, params);\n    }\n" +
            "    async createOtherOrder (symbol: string, amount: number, price: Num = undefined, params: Dict = {}): Promise<{}> {\n        return { 'amount': amount, 'price': price };\n    }\n" +
            '}\n');
        out = new Transpiler({ verbose: false, java: { parser: { NUM_LINES_END_FILE: 0 } } })
            .transpileJavaByPath(path.join(TMP, 'ts', 'src', 'probe.ts')).content;
    });
    afterAll(() => fs.rmSync(TMP, { recursive: true, force: true }));

    test('createOrder amount and price print Double', () => {
        expect(out).toMatch(/createOrder\w*\(\w+ symbol, \w+ type, \w+ side, Double amount, Double price, /);
        expect(out).not.toMatch(/createOrder\w*\([^)]*Object (amount|price)/);
    });
    test('createOrderWs amount and price print Double', () => {
        expect(out).toMatch(/createOrderWs\w*\(\w+ symbol, \w+ type, \w+ side, Double amount, Double price, /);
    });
    test('editOrder defaulted amount and price print Double', () => {
        expect(out).toMatch(/editOrder\w*\(\w+ id, \w+ symbol, \w+ type, \w+ side, Double amount, Double price, /);
        expect(out).not.toMatch(/editOrder\w*\([^)]*Object (amount|price)/);
    });
    test('editOrderWs defaulted amount and price print Double', () => {
        expect(out).toMatch(/editOrderWs\w*\(\w+ id, \w+ symbol, \w+ type, \w+ side, Double amount, Double price, /);
    });
    test('integer literals into the Double slots print as double literals', () => {
        expect(out).toMatch(/createOrder\(symbol, "market", "buy", 0\.0, /);
        expect(out).toMatch(/createOrder\(symbol, "market", "buy", -1\.0, 1\.0, /);
        expect(out).not.toMatch(/\(Double\) \(-?\d+\)/);
    });
    test('order wrappers print a Double amount and price and forward them with no checkcast', () => {
        expect(out).toMatch(/createTriggerOrder\w*\(\w+ symbol, \w+ type, \w+ side, Double amount, Double price, \w+ triggerPrice, /);
        expect(out).toMatch(/createOrderWithTakeProfitAndStopLossWs\w*\(\w+ symbol, \w+ type, \w+ side, Double amount, Double price, \w+ takeProfit, /);
        expect(out).not.toMatch(/\(Double\) \((amount|price)\)/);
    });
    test('limit / market shortcuts print a Double amount and price', () => {
        expect(out).toMatch(/createLimitOrder\w*\(\w+ symbol, \w+ side, Double amount, Double price, /);
        expect(out).toMatch(/createMarketOrderWs\w*\(\w+ symbol, \w+ side, Double amount, Double price, /);
        expect(out).toMatch(/createOrder\(symbol, "limit", [^,]+, amount, price, /);
    });
    test('another method keeps its Object price', () => {
        expect(out).toMatch(/createOtherOrder\w*\([^)]*Object price/);
    });
});
