import { Transpiler } from '../src/transpiler';
import fs from 'fs';
import os from 'os';
import path from 'path';

jest.mock('module', () => ({
    __esModule: true,
    default: jest.fn()
}));

// a venue-private `NullableDict` parameter prints a Map when only its own file calls it and every caller hands a
// local the printer declares a Map; an opaque, foreign, written or hand-written use keeps Object
describe('java venue-private NullableDict parameters', () => {
    let TMP: string;
    let VENUE: string;
    const CLEAN = { declared: 2, mentions: 0, handWritten: false, calls: [] as any[], foreignCalls: 0 };
    const TYPES = "export type Dict = { [key: string]: any };\nexport type NullableDict = Dict | undefined;\n";
    const SOURCE =
        "import type { NullableDict } from './base/types.js';\n" +
        "class Venue {\n" +
        "    parseRow (contract: NullableDict, market: any): any {\n" +
        "        return { 'info': contract, 'id': contract };\n" +
        "    }\n" +
        "    parseOpaque (contract: NullableDict, market: any): any {\n" +
        "        return contract;\n" +
        "    }\n" +
        "    parseWritten (contract: NullableDict, market: any): any {\n" +
        "        contract = undefined;\n" +
        "        return contract;\n" +
        "    }\n" +
        "    parseRows (rows: any, other: any) {\n" +
        "        const row = rows;\n" +
        "        this.parseRow (row, undefined);\n" +
        "        this.parseOpaque (other, undefined);\n" +
        "        this.parseWritten (row, undefined);\n" +
        "    }\n" +
        "}\n";

    const print = (uses: any, mapLocals = true) => {
        const byPath = new Transpiler({ verbose: false, java: { parser: { NUM_LINES_END_FILE: 0 } } });
        if (uses !== undefined) {
            (byPath as any).javaTranspiler.javaRepoMethodUses = (name: string) => uses(name);
        }
        (byPath as any).javaTranspiler.javaDeclaredLocalTypeResolver = (declaration: any) => (mapLocals && declaration?.name?.text === 'row' ? 'Map<String, Object>' : undefined);
        return byPath.transpileJavaByPath(VENUE).content as string;
    };

    beforeAll(() => {
        TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'venue-nullable-dict-params-'));
        VENUE = path.join(TMP, 'ts', 'src', 'venue.ts');
        fs.mkdirSync(path.join(TMP, 'ts', 'src', 'base'), { recursive: true });
        fs.writeFileSync(path.join(TMP, 'ts', 'src', 'base', 'types.ts'), TYPES);
        fs.writeFileSync(VENUE, SOURCE);
    });

    afterAll(() => {
        fs.rmSync(TMP, { recursive: true, force: true });
    });

    test('a Map local caller in the own file types the parameter', () => {
        expect(print(() => CLEAN)).toContain('parseRow(java.util.Map<String, Object> contract, Object market)');
    });

    test('an opaque argument or a written parameter keeps Object', () => {
        const output = print(() => CLEAN);
        expect(output).toContain('parseOpaque(Object contract, Object market)');
        expect(output).toContain('parseWritten(Object contract, Object market)');
    });

    test('a caller the printer does not declare a Map keeps Object', () => {
        expect(print(() => CLEAN, false)).toContain('parseRow(Object contract, Object market)');
    });

    test('a foreign caller, a mention or a hand-written caller keeps Object', () => {
        for (const uses of [ { ...CLEAN, foreignCalls: 1 }, { ...CLEAN, mentions: 1 }, { ...CLEAN, handWritten: true } ]) {
            expect(print(() => uses)).toContain('parseRow(Object contract, Object market)');
        }
    });

    test('with no repo index installed nothing changes', () => {
        expect(print(undefined)).toContain('parseRow(Object contract, Object market)');
    });
});
