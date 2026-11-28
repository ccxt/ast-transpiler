import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

describe ('go: a required Market parameter whose callers pass a map or undefined prints map[string]any', () => {
    const top = fs.mkdtempSync (path.join (process.env.TMPDIR ?? os.tmpdir (), 'h45g12-'));
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
        '    safeSymbol (id: Str, market: Market = undefined): string { return id; }\n' +
        '    market (s: string): MarketInterface { return undefined; }\n' +
        '}\n' +
        'export { Exchange };\n';
    const venue = (name: string, caller: string) =>
        "import { Exchange, Dict, List, Market, Str } from './base/Exchange.js';\n" +
        `class ${name} extends Exchange {\n` +
        '    parseRow (row: Dict, market: Market): Dict {\n' +
        "        return { 'symbol': this.safeSymbol (this.safeString (row, 's'), market) };\n" +
        '    }\n' +
        '    parseRows (rows: List, market: Market): List {\n' +
        '        const result: List = [];\n' +
        '        for (let i = 0; i < rows.length; i++) {\n' +
        '            result.push (this.parseRow (this.extend ({}, rows[i]), market));\n' +
        '        }\n' +
        '        return result;\n' +
        '    }\n' +
        caller +
        '}\n' +
        `export default ${name};\n`;
    const print = (name: string, caller: string): string => {
        fs.mkdirSync (path.join (root, 'base'), { recursive: true });
        fs.writeFileSync (path.join (root, 'base', 'Exchange.ts'), BASE);
        fs.writeFileSync (path.join (root, name + '.ts'), venue (name, caller));
        const t = new Transpiler ({ verbose: false, go: {} });
        installCcxtGoHooks (t.goTranspiler);
        return t.transpileGoByPath (path.join (root, name + '.ts')).content;
    };
    afterAll (() => fs.rmSync (top, { recursive: true, force: true }));

    test ('positive: the only caller passes undefined', () => {
        const out = print ('vnil', '    async fetchRows (rows: List) {\n        return this.parseRows (rows, undefined);\n    }\n');
        expect (out).toMatch (/\) ParseRows\(rows \[\]any, market map\[string\]any\) \[\]any \{/);
        expect (out).toContain ('this.ParseRows(rows, nil)');
    });
    test ('negative: a caller passes a boxed (any) value keeps the any slot', () => {
        const out = print ('vany', '    async fetchRows (rows: List, m: any) {\n        return this.parseRows (rows, m);\n    }\n');
        expect (out).toMatch (/\) ParseRows\(rows \[\]any, market any\) \[\]any \{/);
    });
    test ('negative: one undefined caller and one boxed caller keeps the any slot', () => {
        const out = print ('vmix', '    async fetchRows (rows: List, m: any) {\n        this.parseRows (rows, undefined);\n        return this.parseRows (rows, m);\n    }\n');
        expect (out).toMatch (/\) ParseRows\(rows \[\]any, market any\) \[\]any \{/);
    });
});
