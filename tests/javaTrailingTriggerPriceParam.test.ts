import { Transpiler } from '../src/transpiler';
import fs from 'fs';
import path from 'path';

jest.mock('module', () => ({ __esModule: true, default: jest.fn() }));

// the defaulted `trailingTriggerPrice: Num` of createTrailingPercentOrder prints Double; null still passes
describe('java createTrailingPercentOrder trailingTriggerPrice parameter', () => {
    const TMP = path.join(__dirname, 'files', 'tmp-trailing-trigger-price-param');
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
            '    async createTrailingPercentOrder (symbol: string, type: string, side: string, amount: number, price: Num = undefined, trailingPercent: Num = undefined, trailingTriggerPrice: Num = undefined, params: Dict = {}): Promise<{}> {\n' +
            "        if (trailingTriggerPrice !== undefined) {\n            params['trailingTriggerPrice'] = trailingTriggerPrice;\n        }\n        return params;\n    }\n" +
            '}\n');
        fs.writeFileSync(path.join(TMP, 'ts', 'src', 'probe.ts'),
            "import type { Dict, Num } from './base/types';\nimport Exchange from './base/Exchange';\n" +
            'class Venue extends Exchange {\n' +
            "    async createTrailingPercentOrder (symbol: string, type: string, side: string, amount: number, price: Num = undefined, trailingPercent: Num = undefined, trailingTriggerPrice: Num = undefined, params: Dict = {}): Promise<{}> {\n        if (trailingTriggerPrice === undefined) {\n            return {};\n        }\n        params['trailingTriggerPrice'] = trailingTriggerPrice;\n        return params;\n    }\n" +
            "    async otherTrailing (symbol: string, trailingTriggerPrice: Num = undefined, params: Dict = {}): Promise<{}> {\n        return { 'p': trailingTriggerPrice };\n    }\n" +
            '}\n');
        const t = new Transpiler({ verbose: false, java: { parser: { NUM_LINES_END_FILE: 0 } } });
        out = t.transpileJavaByPath(path.join(TMP, 'ts', 'src', 'probe.ts')).content;
        base = t.transpileJavaByPath(path.join(TMP, 'ts', 'src', 'base', 'Exchange.ts')).content;
    });
    afterAll(() => fs.rmSync(TMP, { recursive: true, force: true }));

    test('the base and a venue override print Double trailingTriggerPrice', () => {
        expect(base).toMatch(/createTrailingPercentOrder\w*\([^)]*Double trailingTriggerPrice, /);
        expect(out).toMatch(/createTrailingPercentOrder\w*\([^)]*Double trailingTriggerPrice, /);
        expect(out).not.toMatch(/createTrailingPercentOrder\w*\([^)]*Object trailingTriggerPrice/);
    });
    test('the undefined test stays a null test', () => {
        expect(out).toMatch(/trailingTriggerPrice, null\)|trailingTriggerPrice == null/);
    });
    test('a defaulted trailingTriggerPrice of another method keeps the Object slot', () => {
        expect(out).toMatch(/otherTrailing\w*\([^)]*Object trailingTriggerPrice/);
    });
});
