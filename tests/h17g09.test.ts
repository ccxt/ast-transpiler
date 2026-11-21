import fs from 'fs';
import path from 'path';
import { Transpiler, installCcxtGoLocalTypes } from '../src/transpiler';

describe ('go: JSON list elements handed to this.extend or a later Dict parameter print without DerefScalar', () => {
    const root = path.join (__dirname, 'files', 'tmp-h17g09', 'ts', 'src');
    const BASE = (body: string) =>
        'type Dict = { [key: string]: any };\n' +
        'type List = any[];\n' +
        'export class Exchange {\n' +
        '    toArray (v: any): List { return v; }\n' +
        '    safeList (d: any, k: any): List { return undefined; }\n' +
        '    safeString (d: any, k: any): string { return undefined; }\n' +
        '    extend (a: any, b: any = undefined): Dict { return a; }\n' +
        '    parseRow2 (market: any, row: Dict): Dict { return row; }\n' +
        '    parseRow (row: Dict, market: any = undefined): Dict { return row; }\n' +
        '    parseAnyRow (row: any): Dict { return row; }\n' +
        '    parseRows (rows: any): List {\n' + body + '    }\n' +
        '}\n';
    const print = (body: string): string => {
        fs.mkdirSync (path.join (root, 'base'), { recursive: true });
        fs.writeFileSync (path.join (root, 'base', 'Exchange.ts'), BASE (body));
        const t = new Transpiler ({ verbose: false, go: {} });
        installCcxtGoLocalTypes (t.goTranspiler);
        return t.transpileGoByPath (path.join (root, 'base', 'Exchange.ts')).content;
    };
    afterAll (() => fs.rmSync (path.join (__dirname, 'files', 'tmp-h17g09'), { recursive: true, force: true }));
    const loop = (uses: string, extra = '') => '        const arr = this.toArray (rows);\n' + extra +
        '        const result = [];\n' +
        '        for (let i = 0; i < arr.length; i++) {\n' +
        '            const row = arr[i];\n' + uses +
        '        }\n' +
        '        return result;\n';

    test ('a row read only by this.extend and safe* is a plain index', () => {
        const out = print (loop ('            const e = this.extend (row, { "x": 1 });\n            const id = this.safeString (row, "id");\n            result.push (e);\n'));
        expect (out).toContain ('var row any = arr[i]');
        expect (out).not.toContain ('DerefScalar(arr[i])');
    });
    test ('an element passed straight to this.extend (any position) is a plain index', () => {
        const out = print (loop ('            result.push (this.extend ({ "s": 1 }, arr[i]));\n'));
        expect (out).toContain ('}, arr[i]))');
    });
    test ('an element passed straight to a later Dict parameter is a plain index', () => {
        const out = print (loop ('            result.push (this.parseRow2 (undefined, arr[i]));\n'));
        expect (out).toContain ('this.ParseRow2(nil, arr[i])');
    });
    test ('a row handed to extend but also stored keeps DerefScalar', () => {
        const out = print (loop ('            const e = this.extend (row, {});\n            result.push (row);\n'));
        expect (out).toContain ('DerefScalar(arr[i])');
    });
    test ('a row handed to extend but nil-tested keeps DerefScalar', () => {
        const out = print (loop ('            if (row !== undefined) {\n                result.push (this.extend (row, {}));\n            }\n'));
        expect (out).toContain ('DerefScalar(arr[i])');
    });
    test ('an element passed straight to a later any parameter keeps DerefScalar', () => {
        const out = print (loop ('            result.push (this.parseRow2 (arr[i], undefined));\n'));
        expect (out).toContain ('this.ParseRow2(DerefScalar(arr[i]), nil)');
    });
});
