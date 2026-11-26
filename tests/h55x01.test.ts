import { Transpiler } from '../src/transpiler';
import fs from 'fs';
import os from 'os';
import path from 'path';

jest.mock('module', () => ({
    __esModule: true,
    default: jest.fn()
}));

// a plain `string` parameter of a base-tier method that is declared once and never called from
// hand-written Java prints String, like its `Str` twin; any other use keeps the printer's old type
describe('java base sole plain string parameters', () => {
    let TMP: string;
    let BASE: string;
    const TYPES = "export type Dict = { [key: string]: any };\nexport type Str = string | undefined;\n";
    const SOURCE =
        "import type { Dict, Str } from './types.js';\n" +
        "export default class Exchange {\n" +
        "    mapperSole (rows: Dict, marketType: string, subType: Str = undefined): Dict {\n" +
        "        return { 'k': marketType };\n" +
        "    }\n" +
        "    mapperOverridden (rows: Dict, marketType: string): Dict {\n" +
        "        return { 'k': marketType };\n" +
        "    }\n" +
        "    mapperHandWritten (rows: Dict, marketType: string): Dict {\n" +
        "        return { 'k': marketType };\n" +
        "    }\n" +
        "    mapperBoxedCaller (rows: Dict, marketType: string): Dict {\n" +
        "        return { 'k': marketType };\n" +
        "    }\n" +
        "    setup (rows: Dict, other: any) {\n" +
        "        const types = [ 'spot', 'swap' ];\n" +
        "        const t = types[0];\n" +
        "        const e = this.safeString (rows, 'extends');\n" +
        "        this.mapperSole (rows, t);\n" +
        "        this.mapperSole (rows, e);\n" +
        "        this.mapperSole (rows, 'spot');\n" +
        "        this.mapperOverridden (rows, 'spot');\n" +
        "        this.mapperHandWritten (rows, 'spot');\n" +
        "        this.mapperBoxedCaller (rows, other);\n" +
        "    }\n" +
        "    safeString (o: any, k: any, d: any = undefined): any { return o[k]; }\n" +
        "}\n";

    const print = () => {
        const byPath = new Transpiler({ verbose: false, java: { parser: { NUM_LINES_END_FILE: 0 } } });
        (byPath as any).javaTranspiler.javaRepoMethodUses = (name: string) => ({
            declared: name === 'mapperOverridden' ? 2 : 1,
            mentions: 0,
            handWritten: name === 'mapperHandWritten',
            calls: [] as any[],
            foreignCalls: 0,
        });
        return byPath.transpileJavaByPath(BASE).content as string;
    };

    beforeAll(() => {
        TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'h55x01-'));
        fs.mkdirSync(path.join(TMP, 'ts', 'src', 'base'), { recursive: true });
        BASE = path.join(TMP, 'ts', 'src', 'base', 'Exchange.ts');
        fs.writeFileSync(path.join(TMP, 'ts', 'src', 'base', 'types.ts'), TYPES);
        fs.writeFileSync(BASE, SOURCE);
    });

    afterAll(() => {
        fs.rmSync(TMP, { recursive: true, force: true });
    });

    test('a sole base method types its plain string slot', () => {
        expect(print()).toMatch(/mapperSole\([^)]*String marketType/);
    });

    test('a method declared twice keeps Object', () => {
        expect(print()).toMatch(/mapperOverridden\([^)]*Object marketType/);
    });

    test('a caller handing a boxed value keeps Object', () => {
        expect(print()).toMatch(/mapperBoxedCaller\([^)]*Object marketType/);
    });

    test('a method hand-written Java calls keeps Object', () => {
        expect(print()).toMatch(/mapperHandWritten\([^)]*Object marketType/);
    });
});
