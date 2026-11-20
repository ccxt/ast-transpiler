import fs from 'fs';
import path from 'path';
import { Transpiler, installCcxtGoLocalTypes } from '../src/transpiler';

describe ('go: element local of a JSON list read only by deref-at-entry consumers prints without DerefScalar', () => {
    const root = path.join (__dirname, 'files', 'tmp-h16g13', 'ts', 'src');
    const BASE = (body: string) =>
        'type Dict = { [key: string]: any };\n' +
        'type List = any[];\n' +
        'export class Exchange {\n' +
        '    toArray (v: any): List { return v; }\n' +
        '    safeList (d: any, k: any): List { return undefined; }\n' +
        '    safeString (d: any, k: any): string { return undefined; }\n' +
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
    afterAll (() => fs.rmSync (path.join (__dirname, 'files', 'tmp-h16g13'), { recursive: true, force: true }));
    const loop = (uses: string, extra = '') => '        const arr = this.toArray (rows);\n' + extra +
        '        const result = [];\n' +
        '        for (let i = 0; i < arr.length; i++) {\n' +
        '            const row = arr[i];\n' + uses +
        '        }\n' +
        '        return result;\n';

    test ('a row read only by safe* arg 0 and a Dict parse parameter is a plain index', () => {
        const out = print (loop ('            const id = this.safeString (row, "id");\n            result.push (this.parseRow (row));\n'));
        expect (out).toContain ('var row any = arr[i]');
        expect (out).not.toContain ('DerefScalar(arr[i])');
    });
    test ('a row passed to an any parameter keeps DerefScalar', () => {
        const out = print (loop ('            result.push (this.parseAnyRow (row));\n'));
        expect (out).toContain ('DerefScalar(arr[i])');
    });
    test ('a row stored into the result box (nil answer observable) keeps DerefScalar', () => {
        const out = print (loop ('            if (row !== undefined) {\n                result.push (row);\n            }\n'));
        expect (out).toContain ('DerefScalar(arr[i])');
    });
    test ('a reassigned row keeps DerefScalar', () => {
        const out = print (loop ('            let r2 = this.safeString (row, "id");\n            result.push (this.parseRow (row));\n', '').replace ('const row', 'let row') .replace ('result.push (this.parseRow (row));', 'row = r2;\n            result.push (this.parseRow (row));'));
        expect (out).toContain ('DerefScalar(arr[i])');
    });
    test ('a written list keeps DerefScalar', () => {
        const out = print (loop ('            result.push (this.parseRow (row));\n', '        arr.push (undefined);\n'));
        expect (out).toContain ('DerefScalar(arr[i])');
    });
});
