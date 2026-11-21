import fs from 'fs';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

describe ('go safeList local with a [] default keeps []any through a const alias', () => {
    const root = path.join (__dirname, 'files', 'tmp-h22g02', 'ts', 'src');
    const BASE =
        'export type Dict = { [key: string]: any };\n' +
        'export class Exchange {\n' +
        '    safeList (o: any, k: any, d: any = undefined): any[] | undefined {\n' +
        '        return o;\n' +
        '    }\n' +
        '    parseWsTrade (t: any): Dict {\n' +
        '        return t;\n' +
        '    }\n' +
        '    keep (t: any) {\n' +
        '        return t;\n' +
        '    }\n' +
        '}\n';
    const VENUE =
        "import { Exchange } from './base/Exchange.js';\n" +
        'export default class v extends Exchange {\n' +
        '    handleTrades (client: any, message: any) {\n' +
        "        const data = this.safeList (message, 'data', []);\n" +
        '        const trades = data;\n' +
        '        const out = [];\n' +
        '        for (let j = 0; j < trades.length; j++) {\n' +
        '            out.push (this.parseWsTrade (trades[j]));\n' +
        '        }\n' +
        '        return out;\n' +
        '    }\n' +
        '    aliasNilTest (client: any, message: any) {\n' +
        "        const rows = this.safeList (message, 'data', []);\n" +
        '        const copy = rows;\n' +
        '        if (copy === undefined) {\n' +
        '            return 0;\n' +
        '        }\n' +
        '        return copy.length;\n' +
        '    }\n' +
        '    aliasWritten (client: any, message: any) {\n' +
        "        const items = this.safeList (message, 'data', []);\n" +
        '        let list = items;\n' +
        "        list = this.keep ('x');\n" +
        '        return list.length;\n' +
        '    }\n' +
        '    noDefault (client: any, message: any) {\n' +
        "        const raw = this.safeList (message, 'data');\n" +
        '        const view = raw;\n' +
        '        return view.length;\n' +
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
    afterAll (() => fs.rmSync (path.join (__dirname, 'files', 'tmp-h22g02'), { recursive: true, force: true }));

    test ('positive: the defaulted list and its alias print []any with native length and bounded reads', () => {
        expect (out).toMatch (/var data \[\]any = SafeListTypedDefault\(message, "data", \[\]any\{\}\)/);
        expect (out).toMatch (/var trades \[\]any = data\n/);
        expect (out).toMatch (/for j := 0; j < len\(trades\); j\+\+ \{/);
        expect (out).toMatch (/this\.ParseWsTrade\(trades\[j\]\)/);
    });

    test ('negative: an alias tested against nil keeps the box', () => {
        expect (out).toMatch (/var rows any = this\.SafeList\(message, "data", \[\]any\{\}\)/);
        expect (out).toMatch (/var copy any = rows/);
        expect (out).toMatch (/copy == nil/);
    });

    test ('negative: an alias written with another value keeps the box', () => {
        expect (out).toMatch (/var items any = this\.SafeList/);
        expect (out).toMatch (/var list any = items/);
    });

    test ('negative: no default (nil-able) keeps the box', () => {
        expect (out).toMatch (/var raw any = this\.SafeList\(message, "data"\)/);
        expect (out).toMatch (/var view any = raw/);
    });
});
