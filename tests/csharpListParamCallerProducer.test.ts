import { Transpiler } from '../src/transpiler';
import * as fs from 'fs';
import * as path from 'path';

const WRAPPED_PARSER = { 'ELEMENT_ACCESS_WRAPPER_OPEN': 'getValue(', 'ELEMENT_ACCESS_WRAPPER_CLOSE': ')' };

describe ('csharp list parameter of nullable cells', () => {
    // `Market[]` (cells `MarketInterface | undefined`) is a list of JSON cells like `Dict[]`:
    // the parameter prints IList<object> once every caller passes a declared list
    const TMP = path.join(__dirname, 'files', 'tmp-csharp-list-param-nullable-cells');
    const BASE = path.join(TMP, 'ts', 'src', 'base', 'Exchange.ts');
    const A = path.join(TMP, 'ts', 'src', 'a.ts');
    let a: string;

    beforeAll(() => {
        fs.mkdirSync(path.dirname(BASE), { recursive: true });
        fs.writeFileSync(BASE,
            'export interface MarketInterface { symbol: string; }\n' +
            'export type Market = MarketInterface | undefined;\n' +
            'export class Exchange {\n    fetchThing (x: any): any { return x; }\n}\n');
        fs.writeFileSync(A,
            "import { Exchange, Market } from './base/Exchange';\n" +
            'export class A extends Exchange {\n' +
            '    f (): Market[] { return this.dis ([ undefined ]); }\n' +
            '    dis (markets: Market[]): Market[] { const out = []; for (let i = 0; i < markets.length; i++) { out.push (markets[i]); } return out; }\n' +
            '    g (x: any): Market[] { const boxed = this.fetchThing (x); return this.boxedDis (boxed); }\n' +
            '    boxedDis (rows: Market[]): Market[] { const out = []; for (let i = 0; i < rows.length; i++) { out.push (rows[i]); } return out; }\n' +
            '    h (): any[] { return this.mixed ([ 1 ]); }\n' +
            '    mixed (cells: (Market | string)[]): any[] { return [ cells.length ]; }\n' +
            '}\n');
        const transpiler = new Transpiler({ 'verbose': false, 'csharp': { 'parser': WRAPPED_PARSER } });
        (transpiler as any).setSharedProgram([ A ]);
        a = (transpiler as any).transpileCSharpByPath(A).content;
        (transpiler as any).setSharedProgram([]);
    });

    afterAll(() => {
        fs.rmSync(TMP, { recursive: true, force: true });
    });

    test('a Market[] parameter whose callers pass a list prints IList<object> and counts natively (null -> 0)', () => {
        expect(a).toContain('dis(IList<object> markets)');
        expect(a).toContain('(markets?.Count ?? 0)');
        expect(a).not.toContain('getArrayLength(markets)');
    });

    test('an object argument keeps the parameter object and the helper', () => {
        expect(a).toContain('boxedDis(object rows)');
        expect(a).toContain('getArrayLength(rows)');
    });

    test('a cell union of two kinds keeps object', () => {
        expect(a).toContain('mixed(object cells)');
    });
});
