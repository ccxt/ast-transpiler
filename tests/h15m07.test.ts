import fs from 'fs';
import path from 'path';
import { Transpiler, installCcxtGoLocalTypes } from '../src/transpiler';

describe ('go: list element handed to a Dict-typed parse parameter prints without DerefScalar', () => {
    const root = path.join (__dirname, 'files', 'tmp-h15m07', 'ts', 'src');
    const BASE = (body: string) =>
        'type Dict = { [key: string]: any };\n' +
        'type List = any[];\n' +
        'export class Exchange {\n' +
        '    toArray (v: any): List { return v; }\n' +
        '    safeList (d: any, k: any): List { return undefined; }\n' +
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
    afterAll (() => fs.rmSync (path.join (__dirname, 'files', 'tmp-h15m07'), { recursive: true, force: true }));
    const loop = (call: string, extra = '') => '        const arr = this.toArray (rows);\n' + extra +
        '        const result = [];\n' +
        '        for (let i = 0; i < arr.length; i++) {\n' +
        '            result.push (' + call + ');\n' +
        '        }\n' +
        '        return result;\n';

    test ('a toArray list element into a Dict parameter is a plain index', () => {
        const out = print (loop ('this.parseRow (arr[i])'));
        expect (out).toContain ('this.ParseRow(arr[i])');
        expect (out).not.toContain ('DerefScalar(arr[i])');
    });
    test ('an any parameter keeps DerefScalar', () => {
        const out = print (loop ('this.parseAnyRow (arr[i])'));
        expect (out).not.toContain ('this.ParseAnyRow(arr[i])');
    });
    test ('a written list keeps DerefScalar', () => {
        const out = print (loop ('this.parseRow (arr[i])', '        arr.push (undefined);\n'));
        expect (out).not.toContain ('this.ParseRow(arr[i])');
    });
});
