import { Transpiler } from '../src/transpiler';
import fs from 'fs';
import path from 'path';

jest.mock('module', () => ({
    __esModule: true,
    default: jest.fn()
}));

// A base-tier method (ts/src/base/*.ts, printed alone) types its array parameter from the
// declared TS type; its overrides and in-program calls follow it.
describe('csharp base-tier array parameters (fold of ccxt hx10w3-C01)', () => {
    const TMP = path.join(__dirname, 'files', 'tmp-fold-c01');
    const BASE = path.join(TMP, 'ts', 'src', 'base', 'Exchange.ts');
    const VENUE = path.join(TMP, 'ts', 'src', 'venue.ts');
    let base: string;
    let venue: string;

    beforeAll(() => {
        fs.mkdirSync(path.dirname(BASE), { recursive: true });
        fs.writeFileSync(BASE,
            'export class Exchange {\n' +
            '    arraysConcat (arraysOfArrays: any[]): any[] {\n' +
            '        let result: any[] = [];\n' +
            '        for (let i = 0; i < arraysOfArrays.length; i++) {\n' +
            '            result = this.arrayConcat (result, arraysOfArrays[i]);\n' +
            '        }\n' +
            '        return result;\n' +
            '    }\n' +
            '    arrayConcat (a: any[], b: any[]): any[] { return a; }\n' +
            '    ids (symbols: string[]): number { return symbols.length; }\n' +
            '    rewrites (items: any[]): any[] {\n' +
            '        items = [];\n' +
            '        return items;\n' +
            '    }\n' +
            '    marketsForSymbols (symbols: string[] = undefined): any[] { return []; }\n' +
            '    fetchThing (x: any): any { return x; }\n' +
            '}\n');
        fs.writeFileSync(VENUE,
            "import { Exchange } from './base/Exchange';\n" +
            'export class Venue extends Exchange {\n' +
            '    override marketsForSymbols (symbols: any = undefined): any[] { return []; }\n' +
            '    caller (box: any): any {\n' +
            '        return this.ids (box);\n' +
            '    }\n' +
            '}\n');
        const transpiler = new Transpiler({ 'verbose': false, 'csharp': { 'parser': { 'NUM_LINES_END_FILE': 0, 'ELEMENT_ACCESS_WRAPPER_OPEN': 'getValue(', 'ELEMENT_ACCESS_WRAPPER_CLOSE': ')' } } });
        base = (transpiler as any).transpileCSharpByPath(BASE).content;
        venue = (transpiler as any).transpileCSharpByPath(VENUE).content;
    });

    afterAll(() => {
        fs.rmSync(TMP, { recursive: true, force: true });
    });

    test('an array-annotated base parameter prints IList<object> and its reads go native', () => {
        expect(base).toContain('arraysConcat(IList<object> arraysOfArrays)');
        expect(base).toContain('(arraysOfArrays?.Count ?? 0)');
        expect(base).not.toContain('getArrayLength(arraysOfArrays)');
    });

    test('a string[] base parameter prints IList<object> too', () => {
        expect(base).toContain('ids(IList<object> symbols)');
    });

    test('a parameter the body rebinds keeps object', () => {
        expect(base).toContain('rewrites(object items)');
    });

    test('a non-array parameter keeps object', () => {
        expect(base).toContain('fetchThing(object x)');
    });

    test('an override with a looser annotation follows the base spelling', () => {
        expect(venue).toContain('marketsForSymbols(IList<object> symbols = null)');
    });

    test('an object argument to a base-typed parameter is converted at the call', () => {
        expect(venue).toContain('this.ids(this.toArray(box))');
    });
});
