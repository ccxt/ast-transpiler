import { Transpiler } from '../src/transpiler';
import fs from 'fs';
import os from 'os';
import path from 'path';

jest.mock('module', () => ({
    __esModule: true,
    default: jest.fn()
}));

// a venue-private `any[]` parameter prints `java.util.List<Object>` when only its own file calls it and every
// caller hands a value that already prints a List; any other caller or an unproven argument keeps Object
describe('java venue-private list parameters', () => {
    let TMP: string;
    let VENUE: string;
    const CLEAN = { declared: 2, mentions: 0, handWritten: false, calls: [] as any[], foreignCalls: 0 };
    const SOURCE =
        "class Venue {\n" +
        "    handleBidAsks (bookSide: any, bidAsks: any[]) {\n" +
        "        for (let i = 0; i < bidAsks.length; i++) {\n" +
        "            bookSide.storeArray (bidAsks[i]);\n" +
        "        }\n" +
        "    }\n" +
        "    handleOpaque (bookSide: any, bidAsks: any[]) {\n" +
        "        return bidAsks;\n" +
        "    }\n" +
        "    handleBookDelta (side: any, other: any) {\n" +
        "        this.handleBidAsks (side, [ 1, 2 ]);\n" +
        "        this.handleOpaque (side, other);\n" +
        "    }\n" +
        "}\n";

    const print = (uses: any) => {
        const byPath = new Transpiler({ verbose: false, java: { parser: { NUM_LINES_END_FILE: 0 } } });
        if (uses !== undefined) {
            (byPath as any).javaTranspiler.javaRepoMethodUses = (name: string) => uses(name);
        }
        return byPath.transpileJavaByPath(VENUE).content as string;
    };

    beforeAll(() => {
        TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'venue-list-params-'));
        VENUE = path.join(TMP, 'ts', 'src', 'pro', 'venue.ts');
        fs.mkdirSync(path.dirname(VENUE), { recursive: true });
        fs.writeFileSync(VENUE, SOURCE);
    });

    afterAll(() => {
        fs.rmSync(TMP, { recursive: true, force: true });
    });

    test('a list-literal caller in the own file types the parameter', () => {
        const output = print(() => CLEAN);
        expect(output).toContain('handleBidAsks(Object bookSide, java.util.List<Object> bidAsks)');
    });

    test('an opaque argument keeps Object', () => {
        expect(print(() => CLEAN)).toContain('handleOpaque(Object bookSide, Object bidAsks)');
    });

    test('a caller in a file that does not declare the name, a mention or a hand-written caller keeps Object', () => {
        const other = { kind: 0 };
        // another venue's own call (a file declaring the name itself) does not block the proof
        expect(print(() => ({ ...CLEAN, calls: [ [ other, other ] ] }))).toContain('handleBidAsks(Object bookSide, java.util.List<Object> bidAsks)');
        for (const uses of [ { ...CLEAN, calls: [ [ other, other ] ], foreignCalls: 1 }, { ...CLEAN, mentions: 1 }, { ...CLEAN, handWritten: true } ]) {
            expect(print(() => uses)).toContain('handleBidAsks(Object bookSide, Object bidAsks)');
        }
    });

    test('with no repo index installed nothing changes', () => {
        expect(print(undefined)).toContain('handleBidAsks(Object bookSide, Object bidAsks)');
    });
});
