import fs from 'fs';
import path from 'path';
import { Transpiler } from '../src/transpiler';

// a ws cache local awaited from a venue wrapper prints `object`: a base list parameter still converts it
describe('csharp ws cache local held as object keeps toArray at a list parameter', () => {
    const TMP = path.join(__dirname, 'files', 'tmp-csharp-ws-cache-object-local');
    const BASE = path.join(TMP, 'ts', 'src', 'base', 'Exchange.ts');
    const VENUE = path.join(TMP, 'ts', 'src', 'pro', 'venue.ts');
    let venue: string;

    beforeAll(() => {
        fs.mkdirSync(path.dirname(BASE), { recursive: true });
        fs.mkdirSync(path.dirname(VENUE), { recursive: true });
        fs.writeFileSync(BASE,
            'export class BaseCache extends Array {}\n' +
            'export class ArrayCache extends BaseCache {}\n' +
            'export class Exchange {\n' +
            '    async watch (u: string, h: string): Promise<any> { return u; }\n' +
            '    filterBySinceLimit (array: any[], since: any = undefined, limit: any = undefined): any[] { return array; }\n' +
            '}\n');
        fs.writeFileSync(VENUE,
            "import { Exchange, ArrayCache } from '../base/Exchange';\n" +
            'export class Venue extends Exchange {\n' +
            '    async watchPublic (h: string): Promise<any> { return await this.watch (\'u\', h); }\n' +
            '    async viaWrapper (since: any): Promise<any[]> {\n' +
            '        const trades: ArrayCache = await this.watchPublic (\'trades\');\n' +
            '        return this.filterBySinceLimit (trades, since);\n' +
            '    }\n' +
            '    async plainList (since: any): Promise<any[]> {\n' +
            '        const rows: { [k: string]: any } = {};\n' +
            '        return this.filterBySinceLimit (rows, since);\n' +
            '    }\n' +
            '    nullArg (since: any): any[] {\n' +
            '        return this.filterBySinceLimit (undefined, since);\n' +
            '    }\n' +
            '}\n');
        const transpiler = new Transpiler({ 'verbose': false, 'csharp': { 'parser': { 'NUM_LINES_END_FILE': 0 } } });
        (transpiler as any).transpileCSharpByPath(BASE);
        venue = (transpiler as any).transpileCSharpByPath(VENUE).content;
    });

    afterAll(() => {
        fs.rmSync(TMP, { recursive: true, force: true });
    });

    test('positive: an object-held cache local is converted at the call', () => {
        expect(venue).toMatch(/object trades = await this\.watchPublic\("trades"\);/);
        expect(venue).toContain('this.filterBySinceLimit(this.toArray(trades), since)');
    });

    test('negative: a dictionary-typed local (not an Array class) is not converted', () => {
        expect(venue).toContain('this.filterBySinceLimit(rows, since)');
    });

    test('negative: null stays null', () => {
        expect(venue).toContain('this.filterBySinceLimit(null, since)');
    });
});
