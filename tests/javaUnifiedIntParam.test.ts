import { Transpiler } from '../src/transpiler';
import fs from 'fs';
import path from 'path';

jest.mock('module', () => ({ __esModule: true, default: jest.fn() }));

// a fixed `int` parameter of an async unified method the Exchange tier declares prints Long
describe('java unified int parameter', () => {
    const TMP = path.join(__dirname, 'files', 'tmp-unified-int-param');
    let out: string;
    let base: string;
    beforeAll(() => {
        fs.mkdirSync(path.join(TMP, 'ts', 'src', 'base'), { recursive: true });
        fs.writeFileSync(path.join(TMP, 'ts', 'src', 'base', 'types.ts'),
            'export type Int = number | undefined;\nexport type int = number;\nexport type Str = string | undefined;\n' +
            'export interface Dictionary<T> { [key: string]: T; }\nexport type Dict = Dictionary<any>;\n');
        fs.writeFileSync(path.join(TMP, 'ts', 'src', 'base', 'Exchange.ts'),
            "import type { int, Str, Dict } from './types';\n" +
            'export default class Exchange {\n' +
            '    // METHODS BELOW THIS LINE ARE TRANSPILED FROM TYPESCRIPT\n' +
            '    async setLeverage (leverage: int, symbol: Str = undefined, params: Dict = {}): Promise<{}> { return {}; }\n' +
            '    handleErrors (code: int, reason: string): any { return undefined; }\n' +
            '}\n');
        fs.writeFileSync(path.join(TMP, 'ts', 'src', 'probe.ts'),
            "import type { int, Str, Dict } from './base/types';\nimport Exchange from './base/Exchange';\n" +
            'class Venue extends Exchange {\n' +
            "    async setLeverage (leverage: int, symbol: Str = undefined, params: Dict = {}): Promise<{}> {\n        return { 'leverage': leverage };\n    }\n" +
            "    async other (count: int): Promise<{}> {\n        return { 'count': count };\n    }\n" +
            "    plain (count: int): any {\n        return count;\n    }\n" +
            "    handleErrors (code: int, reason: string): any {\n        if (code === 418) {\n            return reason;\n        }\n        return undefined;\n    }\n" +
            "    callsErrors (): any {\n        const n: int = 3;\n        this.handleErrors (0, 'r');\n        return this.handleErrors (n, 'r');\n    }\n" +
            '}\n');
        const t = new Transpiler({ verbose: false, java: { parser: { NUM_LINES_END_FILE: 0 } } });
        out = t.transpileJavaByPath(path.join(TMP, 'ts', 'src', 'probe.ts')).content;
        base = t.transpileJavaByPath(path.join(TMP, 'ts', 'src', 'base', 'Exchange.ts')).content;
    });
    afterAll(() => fs.rmSync(TMP, { recursive: true, force: true }));

    test('the override and the base declaration print Long', () => {
        expect(out).toMatch(/setLeverage\(Long leverage, /);
        expect(base).toMatch(/setLeverage\(Long leverage, /);
    });
    test('a venue-only async method keeps the Object slot', () => {
        expect(out).toContain('other(Object count)');
    });
    test('a sync override of an Exchange-tier int parameter prints Long', () => {
        expect(out).toMatch(/handleErrors\(Long code, /);
        expect(base).toMatch(/handleErrors\(Long code, /);
    });
    test('an integer literal into the Long slot takes the long suffix', () => {
        expect(out).toContain('this.handleErrors(0L, ');
        expect(out).not.toContain('(Long) (0)');
    });
    test('a sync method keeps the Object slot', () => {
        expect(out).toContain('plain(Object count)');
    });
});

describe('java unified money amount parameter', () => {
    const TMP = path.join(__dirname, 'files', 'tmp-unified-amount-param');
    let out: string;
    beforeAll(() => {
        fs.mkdirSync(path.join(TMP, 'ts', 'src', 'base'), { recursive: true });
        fs.writeFileSync(path.join(TMP, 'ts', 'src', 'base', 'types.ts'),
            'export type Num = number | undefined;\nexport interface Dictionary<T> { [key: string]: T; }\nexport type Dict = Dictionary<any>;\n');
        fs.writeFileSync(path.join(TMP, 'ts', 'src', 'base', 'Exchange.ts'),
            "import type { Dict } from './types';\n" +
            'export default class Exchange {\n' +
            '    // METHODS BELOW THIS LINE ARE TRANSPILED FROM TYPESCRIPT\n' +
            '    async withdraw (code: string, amount: number, address: string, params: Dict = {}): Promise<{}> { return {}; }\n' +
            '    async setMargin (symbol: string, amount: number, params: Dict = {}): Promise<{}> { return {}; }\n' +
            '}\n');
        fs.writeFileSync(path.join(TMP, 'ts', 'src', 'probe.ts'),
            "import type { Dict } from './base/types';\nimport Exchange from './base/Exchange';\n" +
            'class Venue extends Exchange {\n' +
            "    async withdraw (code: string, amount: number, address: string, params: Dict = {}): Promise<{}> {\n        return { 'amount': amount };\n    }\n" +
            "    async setMargin (symbol: string, amount: number, params: Dict = {}): Promise<{}> {\n        return { 'amount': amount };\n    }\n" +
            '}\n');
        out = new Transpiler({ verbose: false, java: { parser: { NUM_LINES_END_FILE: 0 } } })
            .transpileJavaByPath(path.join(TMP, 'ts', 'src', 'probe.ts')).content;
    });
    afterAll(() => fs.rmSync(TMP, { recursive: true, force: true }));

    test('withdraw amount prints Double', () => {
        expect(out).toMatch(/withdraw\(\w+ code, Double amount, /);
    });
    test('a money method outside the group keeps the Object slot', () => {
        expect(out).toMatch(/setMargin\(\w+ symbol, Object amount/);
    });
});

// transfer and the venue transferIn / transferOut shortcuts print a Double amount
describe('java transfer amount parameter', () => {
    const TMP = path.join(__dirname, 'files', 'tmp-transfer-amount-param');
    let out: string;
    beforeAll(() => {
        fs.mkdirSync(path.join(TMP, 'ts', 'src', 'base'), { recursive: true });
        fs.writeFileSync(path.join(TMP, 'ts', 'src', 'base', 'types.ts'),
            'export interface Dictionary<T> { [key: string]: T; }\nexport type Dict = Dictionary<any>;\n');
        fs.writeFileSync(path.join(TMP, 'ts', 'src', 'base', 'Exchange.ts'),
            "import type { Dict } from './types';\n" +
            'export default class Exchange {\n' +
            '    // METHODS BELOW THIS LINE ARE TRANSPILED FROM TYPESCRIPT\n' +
            '    async transfer (code: string, amount: number, fromAccount: string, toAccount: string, params: Dict = {}): Promise<{}> { return {}; }\n' +
            '}\n');
        fs.writeFileSync(path.join(TMP, 'ts', 'src', 'probe.ts'),
            "import type { Dict } from './base/types';\nimport Exchange from './base/Exchange';\n" +
            'class Venue extends Exchange {\n' +
            "    async transfer (code: string, amount: number, fromAccount: string, toAccount: string, params: Dict = {}): Promise<{}> {\n        return { 'amount': amount };\n    }\n" +
            "    async transferOut (code: string, amount: number, params: Dict = {}): Promise<{}> {\n        return await this.transfer (code, amount, 'a', 'b', params);\n    }\n" +
            "    async moveOut (code: string, amount: number, params: Dict = {}): Promise<{}> {\n        return { 'amount': amount };\n    }\n" +
            "    transferIn (code: string, amount: number): any {\n        return amount;\n    }\n" +
            '}\n');
        out = new Transpiler({ verbose: false, java: { parser: { NUM_LINES_END_FILE: 0 } } })
            .transpileJavaByPath(path.join(TMP, 'ts', 'src', 'probe.ts')).content;
    });
    afterAll(() => fs.rmSync(TMP, { recursive: true, force: true }));

    test('transfer and transferOut print Double, the call passes the typed slot uncast', () => {
        expect(out).toMatch(/transfer\(\w+ code, Double amount, /);
        expect(out).toMatch(/transferOut\(\w+ code, Double amount, /);
        expect(out).not.toContain('(Double) (amount)');
    });
    test('another venue method and a sync shortcut keep the Object slot', () => {
        expect(out).toMatch(/moveOut\(\w+ code, Object amount/);
        expect(out).toMatch(/transferIn\(\w+ code, Object amount/);
    });
});

// a written amount parameter keeps the checkcast at the call
describe('java transfer amount written before the call', () => {
    const TMP = path.join(__dirname, 'files', 'tmp-transfer-amount-written');
    let out: string;
    beforeAll(() => {
        fs.mkdirSync(path.join(TMP, 'ts', 'src', 'base'), { recursive: true });
        fs.writeFileSync(path.join(TMP, 'ts', 'src', 'base', 'types.ts'),
            'export interface Dictionary<T> { [key: string]: T; }\nexport type Dict = Dictionary<any>;\n');
        fs.writeFileSync(path.join(TMP, 'ts', 'src', 'base', 'Exchange.ts'),
            "import type { Dict } from './types';\n" +
            'export default class Exchange {\n' +
            '    // METHODS BELOW THIS LINE ARE TRANSPILED FROM TYPESCRIPT\n' +
            '    async transfer (code: string, amount: number, fromAccount: string, toAccount: string, params: Dict = {}): Promise<{}> { return {}; }\n' +
            '}\n');
        fs.writeFileSync(path.join(TMP, 'ts', 'src', 'probe.ts'),
            "import type { Dict } from './base/types';\nimport Exchange from './base/Exchange';\n" +
            'class Venue extends Exchange {\n' +
            "    async transferOut (code: string, amount: number, params: Dict = {}): Promise<{}> {\n        amount = amount * 2;\n        return await this.transfer (code, amount, 'a', 'b', params);\n    }\n" +
            '}\n');
        out = new Transpiler({ verbose: false, java: { parser: { NUM_LINES_END_FILE: 0 } } })
            .transpileJavaByPath(path.join(TMP, 'ts', 'src', 'probe.ts')).content;
    });
    afterAll(() => fs.rmSync(TMP, { recursive: true, force: true }));

    test('the written copy keeps the checkcast', () => {
        expect(out).toContain('(Double) (amount)');
    });
});
