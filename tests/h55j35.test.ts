import { Transpiler } from '../src/transpiler';
import fs from 'fs';
import path from 'path';

jest.mock('module', () => ({ __esModule: true, default: jest.fn() }));

// Math.max / Math.min over null-guarded Double const locals (and a conditional of them) is native
describe('java native min / max of guarded Double locals', () => {
    const TMP = path.join(__dirname, 'files', 'tmp-h55j35-guarded-double');
    let base: string;
    beforeAll(() => {
        fs.mkdirSync(path.join(TMP, 'ts', 'src', 'base'), { recursive: true });
        fs.writeFileSync(path.join(TMP, 'ts', 'src', 'base', 'types.ts'),
            'export type Int = number | undefined;\nexport type Num = number | undefined;\n' +
            'export interface Dictionary<T> { [key: string]: T; }\nexport type Dict = Dictionary<any>;\n');
        fs.writeFileSync(path.join(TMP, 'ts', 'src', 'base', 'Exchange.ts'),
            "import type { Int, Num, Dict } from './types';\n" +
            'export default class Exchange {\n' +
            '    // METHODS BELOW THIS LINE ARE TRANSPILED FROM TYPESCRIPT\n' +
            "    safeNumber (d: any, k: any): Num {\n        return d[k];\n    }\n" +
            "    high (trade: Dict, prev: any[]): any {\n" +
            "        const price = this.safeNumber (trade, 'price');\n" +
            "        if (price === undefined) {\n            return undefined;\n        }\n" +
            "        const prevHigh = this.safeNumber (prev, 2);\n" +
            "        return Math.max ((prevHigh === undefined) ? price : prevHigh, price);\n" +
            '    }\n' +
            "    unguarded (trade: Dict, prev: any[]): any {\n" +
            "        const price = this.safeNumber (trade, 'price');\n" +
            "        const prevLow = this.safeNumber (prev, 3);\n" +
            "        return Math.min ((prevLow === undefined) ? price : prevLow, price);\n" +
            '    }\n' +
            "    boxed (trade: Dict, x: any): any {\n" +
            "        const price = this.safeNumber (trade, 'price');\n" +
            "        if (price === undefined) {\n            return undefined;\n        }\n" +
            "        return Math.max (price, x);\n" +
            '    }\n' +
            '}\n');
        const t = new Transpiler({ verbose: false, java: { parser: { NUM_LINES_END_FILE: 0 } } });
        // the build layer declares the safeNumber locals Double (as ccxt does)
        (t as any).javaTranspiler.javaDeclaredLocalTypeResolver = (d: any) => (/^(price|prevHigh|prevLow)$/.test(d?.name?.text) ? 'Double' : undefined);
        base = t.transpileJavaByPath(path.join(TMP, 'ts', 'src', 'base', 'Exchange.ts')).content;
    });
    afterAll(() => fs.rmSync(TMP, { recursive: true, force: true }));

    const member = (name: string) => base.slice(base.indexOf(name + '('), base.indexOf('\n    }\n', base.indexOf(name + '(')));

    test('a conditional of guarded Double locals and a guarded Double print native Math.max', () => {
        expect(member('high')).toContain('Math.max(');
        expect(member('high')).not.toContain('mathMax');
    });
    test('an unguarded nullable Double keeps the helper', () => {
        expect(member('unguarded')).not.toContain('Math.min(');
    });
    test('an any operand keeps the helper', () => {
        expect(member('boxed')).not.toContain('Math.max(');
    });
});
