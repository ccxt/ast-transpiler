import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

describe ('go: a nil-declared Market local written only by this.market and handed to a Market slot prints map[string]any', () => {
    const top = fs.mkdtempSync (path.join (process.env.TMPDIR ?? os.tmpdir (), 'h47g20-'));
    const root = path.join (top, 'ts', 'src');
    const BASE =
        'export type Dict = { [key: string]: any };\n' +
        'export type List = any[];\n' +
        'export type Str = string | undefined;\n' +
        'export interface MarketInterface { id: string; symbol: string; }\n' +
        'export type Market = MarketInterface | undefined;\n' +
        'class Exchange {\n' +
        '    extend (a: any, b: any): Dict { return a; }\n' +
        '    safeString (o: any, k: any): Str { return o; }\n' +
        '    safeList (o: any, k: any, d: any = undefined): any[] | undefined { return o; }\n' +
        '    safeSymbol (id: Str, market: Market = undefined): string { return id; }\n' +
        '    market (s: string): MarketInterface { return undefined; }\n' +
        '    sortBy (a: any, k: any): any[] { return a; }\n' +
        '}\n' +
        'export { Exchange };\n';
    const venue = (name: string, fetchBody: string) =>
        "import { Exchange, Dict, List, Market, Str } from './base/Exchange.js';\n" +
        `class ${name} extends Exchange {\n` +
        '    getKind (method: string, market: Market = undefined, params: Dict = {}): [Str, Dict] {\n        return [ this.safeString (market, \'type\'), params ];\n    }\n' +
        '    parseRow (row: Dict, market: Market): Dict {\n' +
        "        return { 'symbol': this.safeSymbol (this.safeString (row, 's'), market) };\n" +
        '    }\n' +
        '    parseRows (rows: Dict[], market: Market): List {\n' +
        '        const result: List = [];\n' +
        '        for (let i = 0; i < rows.length; i++) {\n' +
        '            result.push (this.parseRow (this.extend ({}, rows[i]), market));\n' +
        '        }\n' +
        '        return result;\n' +
        '    }\n' +
        '    async fetchOther (symbol: Str = undefined, params: Dict = {}): Promise<List> {\n' +
        '        let market: Market = undefined;\n        if (symbol !== undefined) {\n            market = this.market (symbol);\n        }\n' +
        "        const otherRows: Dict[] = this.safeList (params, 'list', []);\n" +
        '        return this.parseRows (otherRows, market);\n' +
        '    }\n' +
        '    async fetchRows (symbol: Str = undefined, params: Dict = {}): Promise<List> {\n' +
        fetchBody +
        '    }\n' +
        '}\n' +
        `export default ${name};\n`;
    const print = (name: string, fetchBody: string): string => {
        fs.mkdirSync (path.join (root, 'base'), { recursive: true });
        fs.writeFileSync (path.join (root, 'base', 'Exchange.ts'), BASE);
        fs.writeFileSync (path.join (root, name + '.ts'), venue (name, fetchBody));
        const t = new Transpiler ({ verbose: false, go: {} });
        installCcxtGoHooks (t.goTranspiler);
        return t.transpileGoByPath (path.join (root, name + '.ts')).content;
    };
    afterAll (() => fs.rmSync (top, { recursive: true, force: true }));
    const head = '        let market: Market = undefined;\n        if (symbol !== undefined) {\n            market = this.market (symbol);\n        }\n';
    const tail = "        const rows: Dict[] = this.safeList (params, 'list', []);\n" +
        '        const parsed = this.parseRows (rows, market);\n' +
        "        return this.sortBy (parsed, this.safeString (market, 'symbol'));\n";

    test ('positive: the local and the Market slot both print map[string]any', () => {
        const out = print ('vpos', head + tail);
        expect (out).toContain ('var market map[string]any = nil');
        expect (out).toMatch (/\) ParseRows\(rows \[\]any, market map\[string\]any\) \[\]any \{/);
    });
    test ('positive: a const copy of this.market written into the local', () => {
        const out = print ('vcopy', '        let market: Market = undefined;\n        if (symbol !== undefined) {\n            const symbolMarket = this.market (symbol);\n            market = symbolMarket;\n        }\n' + tail);
        expect (out).toMatch (/\) ParseRows\(rows \[\]any, market map\[string\]any\) \[\]any \{/);
    });
    test ('positive: the local is also handed to an optional Market slot of a tuple method', () => {
        const out = print ('vtuple', head + "        const [ kind, rest ] = this.getKind ('fetchRows', market, params);\n" + tail);
        expect (out).toMatch (/\) ParseRows\(rows \[\]any, market map\[string\]any\) \[\]any \{/);
    });
    test ('positive: two fetch methods each hand their own nil-declared local to the slot', () => {
        const out = print ('vtwo', head + "        if (symbol === 'x') {\n            return this.fetchOther (symbol);\n        }\n" + tail);
        expect (out).toMatch (/\) ParseRows\(rows \[\]any, market map\[string\]any\) \[\]any \{/);
    });
    test ('negative: a local also written from an untyped value keeps both boxes', () => {
        const out = print ('vany', head + "        if (symbol === 'x') {\n            market = params['m'];\n        }\n" + tail);
        expect (out).toMatch (/\) ParseRows\(rows \[\]any, market any\) \[\]any \{/);
        expect (out).not.toContain ('var market map[string]any = nil');
    });
    test ('negative: a second caller passing a boxed value keeps both boxes', () => {
        const out = print ('vmix', head + "        this.parseRows ([], params['m']);\n" + tail);
        expect (out).toMatch (/\) ParseRows\(rows \[\]any, market any\) \[\]any \{/);
        expect (out).not.toContain ('var market map[string]any = nil');
    });
});
