import { Transpiler } from '../src/transpiler';
import fs from 'fs';
import path from 'path';

jest.mock('module', () => ({ __esModule: true, default: jest.fn() }));

// `Math.floor (a / b) * b` on two long operands is a long product, not a boxed multiply
describe('java floor product of long operands', () => {
    const TMP = path.join(__dirname, 'files', 'tmp-h51j35-floor-product');
    let base: string;
    beforeAll(() => {
        fs.mkdirSync(path.join(TMP, 'ts', 'src', 'base'), { recursive: true });
        fs.writeFileSync(path.join(TMP, 'ts', 'src', 'base', 'types.ts'),
            'export type Int = number | undefined;\nexport type Str = string | undefined;\n' +
            'export interface Dictionary<T> { [key: string]: T; }\nexport type Dict = Dictionary<any>;\n');
        fs.writeFileSync(path.join(TMP, 'ts', 'src', 'base', 'Exchange.ts'),
            "import type { Int, Str, Dict } from './types';\n" +
            'export default class Exchange {\n' +
            '    // METHODS BELOW THIS LINE ARE TRANSPILED FROM TYPESCRIPT\n' +
            "    parseTimeframe (timeframe: string): number {\n        return 60;\n    }\n" +
            "    safeInteger (d: Dict, k: string): Int {\n        return d[k];\n    }\n" +
            "    sum (a: any, b: any): any {\n        return a + b;\n    }\n" +
            "    edge (trade: Dict, timeframe: string = '1m', since: number = 0): boolean {\n" +
            "        const ms = this.parseTimeframe (timeframe) * 1000;\n" +
            "        const ts = this.safeInteger (trade, 'timestamp');\n" +
            "        if (ts === undefined) {\n            return false;\n        }\n" +
            "        const openingTime = Math.floor (ts / ms) * ms;\n" +
            "        if (openingTime < since) {\n            return false;\n        }\n" +
            "        return openingTime >= this.sum (since, ms);\n" +
            '    }\n' +
            "    longEdge (ts: Int, ms: number, since: Int): boolean {\n        if (ts === undefined || since === undefined) {\n            return false;\n        }\n        const t = Math.floor (ts / ms) * ms;\n        return t < since;\n    }\n" +
            "    sinceEdge (ts: number, since: Int): any {\n        const t = Math.floor (ts / 60) * since;\n        const u = Math.floor (ts / 60) * 1000;\n        return [ t, u ];\n    }\n" +
            "    anyEdge (x: any, ms: any): any {\n        const t = Math.floor (x / ms) * ms;\n        return t;\n    }\n" +
            '}\n');
        const t = new Transpiler({ verbose: false, java: { parser: { NUM_LINES_END_FILE: 0 } } });
        base = t.transpileJavaByPath(path.join(TMP, 'ts', 'src', 'base', 'Exchange.ts')).content;
    });
    afterAll(() => fs.rmSync(TMP, { recursive: true, force: true }));

    const member = (name: string) => base.slice(base.indexOf(name + '('), base.indexOf('\n    }\n', base.indexOf(name + '(')));

    test('floor of a quotient times a const long product prints a long product', () => {
        expect(member('edge')).toContain('openingTime = ((long) ((Math.floor(');
        expect(member('edge')).not.toContain('Helpers.multiply');
    });
    test('a nullable Long operand keeps the helper null answer', () => {
        expect(member('sinceEdge')).toContain('((since == null) ? null : (long) ((Math.floor(');
        expect(member('sinceEdge')).toContain('u = ((long) ((Math.floor(');
    });
    test('an any or untyped operand keeps Helpers.multiply', () => {
        expect(member('anyEdge')).toContain('Helpers.multiply(');
        expect(member('longEdge')).toContain('Helpers.multiply(');
    });
});
