import fs from 'fs';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

describe ('go list-declared local seeded by safeList (c, k, []) prints []any', () => {
    const root = path.join (__dirname, 'files', 'tmp-h26g04', 'ts', 'src');
    const BASE =
        'export type Dict = { [key: string]: any };\n' +
        'export type List = any[];\n' +
        'export class Exchange {\n' +
        '    safeList (o: any, k: any, d: any = undefined): any[] | undefined {\n' +
        '        return o;\n' +
        '    }\n' +
        '    safeString (o: any, k: any): string {\n' +
        '        return o;\n' +
        '    }\n' +
        '    parseTrades (t: any): any[] {\n' +
        '        return t;\n' +
        '    }\n' +
        '    keep (t: any): any {\n' +
        '        return t;\n' +
        '    }\n' +
        '}\n';
    const VENUE =
        "import { Exchange, Dict } from './base/Exchange.js';\n" +
        'export default class v extends Exchange {\n' +
        '    declaredRows (data: any) {\n' +
        "        const trades: Dict[] = this.safeList (data, 'items', []);\n" +
        '        let tradesList: Dict[] = [];\n' +
        '        if (trades !== undefined) {\n' +
        '            tradesList = trades;\n' +
        '        }\n' +
        '        for (let i = 0; i < trades.length; i++) {\n' +
        "            this.safeString (trades[i], 'symbol');\n" +
        '        }\n' +
        '        return this.parseTrades (tradesList);\n' +
        '    }\n' +
        '    writtenOther (data: any) {\n' +
        "        let rows: Dict[] = this.safeList (data, 'items', []);\n" +
        "        rows = this.keep ('x');\n" +
        '        return rows.length;\n' +
        '    }\n' +
        '    noDefault (data: any) {\n' +
        "        const raw: Dict[] = this.safeList (data, 'items');\n" +
        '        if (raw === undefined) {\n' +
        '            return 0;\n' +
        '        }\n' +
        '        return raw.length;\n' +
        '    }\n' +
        '    undeclared (data: any) {\n' +
        "        const loose = this.safeList (data, 'items', []);\n" +
        '        if (loose !== undefined) {\n' +
        '            return this.parseTrades (loose);\n' +
        '        }\n' +
        '        return [];\n' +
        '    }\n' +
        '}\n';
    let out = '';
    beforeAll (() => {
        fs.mkdirSync (path.join (root, 'base'), { recursive: true });
        fs.writeFileSync (path.join (root, 'base', 'Exchange.ts'), BASE);
        fs.writeFileSync (path.join (root, 'v.ts'), VENUE);
        const t = new Transpiler ({ verbose: false, go: {} });
        installCcxtGoHooks (t.goTranspiler);
        out = t.transpileGoByPath (path.join (root, 'v.ts')).content;
    });
    afterAll (() => fs.rmSync (path.join (__dirname, 'files', 'tmp-h26g04'), { recursive: true, force: true }));

    test ('positive: the declared list prints []any with native length, index, nil test and copy', () => {
        expect (out).toMatch (/var trades \[\]any = this\.SafeListSlice\(data, "items", \[\]any\{\}\)/);
        expect (out).toMatch (/tradesList = trades\n/);
        expect (out).toMatch (/i < len\(trades\)/);
        expect (out).toMatch (/trades\[i\]/);
    });

    test ('negative: a local written with another value keeps the box', () => {
        expect (out).not.toMatch (/var rows \[\]any/);
    });

    test ('negative: no default (nil-able) with a nil test keeps the box', () => {
        expect (out).not.toMatch (/var raw \[\]any = this\.SafeListSlice/);
    });

    test ('negative: an undeclared local is not typed by this rule', () => {
        // the list reader is printed as SafeListSlice directly (H34-X04); the declared-list rule's nil-guard form stays absent
        expect (out).toContain ('var loose []any = this.SafeListSlice(data, "items", []any{})');
        expect (out).not.toMatch (/var looseList \[\]any/);
    });
});
