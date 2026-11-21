import fs from 'fs';
import path from 'path';
import { Transpiler } from '../src/transpiler';

const root = path.join (__dirname, 'files', 'tmp-h27a10', 'ts', 'src');
const BASE = 'export type Dict = { [key: string]: any };\n' +
    'export class Exchange {\n' +
    '    safeList (o: any, k: any, d: any = undefined): any[] | undefined { return d; }\n' +
    '    safeString (o: any, k: any, d: any = undefined): string { return d; }\n' +
    '    async watchOHLCVForSymbols (symbolsAndTimeframes: string[][], params: Dict = {}): Promise<any> { return undefined; }\n' +
    '}\nexport default Exchange;\n';
const print = (body: string): string => {
    fs.mkdirSync (path.join (root, 'base'), { recursive: true });
    fs.writeFileSync (path.join (root, 'base', 'Exchange.ts'), BASE);
    fs.writeFileSync (path.join (root, 'ex.ts'), "import { Exchange, Dict } from './base/Exchange';\nexport default class ex extends Exchange {\n" +
        '    async watchOHLCVForSymbols (symbolsAndTimeframes: string[][], params: Dict = {}): Promise<any> {\n' + body + '    }\n}\n');
    const t = new Transpiler ({ verbose: false, go: { unifiedSliceParams: { 'watchOHLCVForSymbols': { 0: '[][]any' } } } });
    return t.transpileGoByPath (path.join (root, 'ex.ts')).content;
};
const LOOP = '        const out = [];\n' +
    '        for (let i = 0; i < symbolsAndTimeframes.length; i++) {\n' +
    '            const data = this.safeList (symbolsAndTimeframes, i);\n' +
    '            out.push (this.safeString (data, 0));\n' +
    '        }\n' +
    '        return out;\n';

describe ('h27a10: loop-bounded row of a [][]any list reads natively', () => {
    test ('the row is the plain index (fails on the base printer)', () => {
        const out = print (LOOP);
        expect (out).toContain ('var data []any = symbolsAndTimeframes[i]');
        expect (out).not.toContain ('SafeListTyped(symbolsAndTimeframes, i)');
    });
    test ('a constant index (no bounds proof) keeps the wrap', () => {
        const out = print (LOOP.replace ('safeList (symbolsAndTimeframes, i)', 'safeList (symbolsAndTimeframes, 0)'));
        expect (out).toContain ('SafeListTyped(symbolsAndTimeframes, 0)');
    });
    test ('a receiver that is not a [][]any row list keeps the wrap', () => {
        const body = LOOP.replace ('const out = [];', 'const out = [];\n        const other: any = params;').replace ('safeList (symbolsAndTimeframes, i)', 'safeList (other, i)');
        expect (print (body)).toContain ('SafeListTyped(other, i)');
    });
    test ('a row read inside a nested function (no loop proof there) keeps the wrap', () => {
        const out = print (LOOP.replace ('const data = this.safeList (symbolsAndTimeframes, i);', 'const f = () => this.safeList (symbolsAndTimeframes, i);\n            const data = f ();'));
        expect (out).not.toContain ('= symbolsAndTimeframes[i]');
    });
    test ('a counter written in the loop body keeps the wrap', () => {
        const out = print (LOOP.replace ('out.push (', 'i = i + 1;\n            out.push ('));
        expect (out).not.toContain ('= symbolsAndTimeframes[i]');
    });
    test ('a bound that is not the list length keeps the wrap', () => {
        const out = print (LOOP.replace ('i < symbolsAndTimeframes.length', 'i < 5'));
        expect (out).not.toContain ('= symbolsAndTimeframes[i]');
    });
});
