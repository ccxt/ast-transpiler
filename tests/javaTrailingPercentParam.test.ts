import { Transpiler } from '../src/transpiler';
import fs from 'fs';
import path from 'path';

jest.mock('module', () => ({ __esModule: true, default: jest.fn() }));

// the defaulted `trailingPercent: Num` of createTrailingPercentOrder prints Double; null still passes
describe('java createTrailingPercentOrder trailingPercent parameter', () => {
    const TMP = path.join(__dirname, 'files', 'tmp-trailing-percent-param');
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
            '    async createOrder (symbol: string, type: string, side: string, amount: number, price: Num = undefined, params: Dict = {}): Promise<{}> { return {}; }\n' +
            '    async createTrailingPercentOrder (symbol: string, type: string, side: string, amount: number, price: Num = undefined, trailingPercent: Num = undefined, trailingTriggerPrice: Num = undefined, params: Dict = {}): Promise<{}> {\n' +
            "        if (trailingPercent === undefined) {\n            return {};\n        }\n        params['trailingPercent'] = trailingPercent;\n" +
            '        return await this.createOrder (symbol, type, side, amount, price, params);\n    }\n' +
            '}\n');
        fs.writeFileSync(path.join(TMP, 'ts', 'src', 'probe.ts'),
            "import type { Dict, Num } from './base/types';\nimport Exchange from './base/Exchange';\n" +
            'class Venue extends Exchange {\n' +
            '    async createTrailingPercentOrder (symbol: string, type: string, side: string, amount: number, price: Num = undefined, trailingPercent: Num = undefined, trailingTriggerPrice: Num = undefined, params: Dict = {}): Promise<{}> {\n' +
            "        if (trailingPercent === undefined) {\n            return {};\n        }\n        params['trailingPercent'] = trailingPercent;\n        return await this.createOrder (symbol, type, side, amount, price, params);\n    }\n" +
            '    async otherTrailing (symbol: string, trailingPercent: Num = undefined, params: Dict = {}): Promise<{}> {\n        return { \'trailingPercent\': trailingPercent };\n    }\n' +
            '}\n');
        const t = new Transpiler({ verbose: false, java: { parser: { NUM_LINES_END_FILE: 0 } } });
        out = t.transpileJavaByPath(path.join(TMP, 'ts', 'src', 'probe.ts')).content;
        base = t.transpileJavaByPath(path.join(TMP, 'ts', 'src', 'base', 'Exchange.ts')).content;
    });
    afterAll(() => fs.rmSync(TMP, { recursive: true, force: true }));

    test('the base and a venue override print Double trailingPercent', () => {
        expect(base).toMatch(/createTrailingPercentOrder\w*\([^)]*Double price, Double trailingPercent, /);
        expect(out).toMatch(/createTrailingPercentOrder\w*\([^)]*Double price, Double trailingPercent, /);
        expect(out).not.toMatch(/createTrailingPercentOrder\w*\([^)]*Object trailingPercent/);
    });
    test('the null test on the typed slot keeps its answer', () => {
        expect(out).toMatch(/trailingPercent, null\)|trailingPercent == null/);
    });
    test('a defaulted Num trailingPercent of another method keeps the Object slot', () => {
        expect(out).toMatch(/otherTrailing\w*\(\w+ symbol, Object trailingPercent/);
    });
});
