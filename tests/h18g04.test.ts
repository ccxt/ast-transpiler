import fs from 'fs';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

describe ('go Dict[] local written from an awaited []map[string]any channel prints []any', () => {
    const root = path.join (__dirname, 'files', 'tmp-h18g04', 'ts', 'src');
    const BASE =
        'export type Dict = { [key: string]: any };\n' +
        'export class Exchange {\n' +
        '    async rowsA (q: any): Promise<Dict[]> { return []; }\n' +
        '    async rowsB (q: any): Promise<Dict[]> { return []; }\n' +
        '    async anyRows (q: any): Promise<Dict[]> { return []; }\n' +
        '    parseRow (r: any): Dict { return r; }\n' +
        '}\n';
    const print = (body: string): string => {
        const venue =
            "import { Exchange, Dict } from './base/Exchange';\n" +
            'export class ex extends Exchange {\n' +
            '    async run (q: any, c: boolean) {\n' +
            '        const out: Dict[] = [];\n' + body +
            '        return out;\n' +
            '    }\n' +
            '}\n';
        fs.mkdirSync (path.join (root, 'base'), { recursive: true });
        fs.writeFileSync (path.join (root, 'base', 'Exchange.ts'), BASE);
        fs.writeFileSync (path.join (root, 'ex.ts'), venue);
        const t = new Transpiler ({ verbose: false, go: { 'asyncMethodSuffix': 'Async', 'asyncMapRowListCallees': [ 'RowsA', 'RowsB' ] } });
        installCcxtGoHooks (t.goTranspiler);
        return t.transpileGoByPath (path.join (root, 'ex.ts')).content;
    };
    afterAll (() => fs.rmSync (path.join (__dirname, 'files', 'tmp-h18g04'), { recursive: true, force: true }));

    test ('both writes from tabled list channels: []any local, len and a bare index', () => {
        const out = print (
            '        let rows: Dict[] = [];\n' +
            '        if (c) { rows = await this.rowsA (q); } else { rows = await this.rowsB (q); }\n' +
            '        for (let i = 0; i < rows.length; i++) {\n' +
            '            out.push (this.parseRow (rows[i]));\n' +
            '        }\n');
        expect (out).toMatch (/var rows \[\]any = \[\]any\{\}/);
        expect (out).toMatch (/i < len\(rows\)/);
        expect (out).not.toMatch (/GetArrayLength\(rows\)/);
        expect (out).not.toMatch (/DerefScalar\(rows/);
    });

    test ('a write from an untabled producer keeps the box', () => {
        const out = print (
            '        let rows: Dict[] = [];\n' +
            '        if (c) { rows = await this.rowsA (q); } else { rows = await this.anyRows (q); }\n' +
            '        for (let i = 0; i < rows.length; i++) {\n' +
            '            out.push (this.parseRow (rows[i]));\n' +
            '        }\n');
        expect (out).not.toMatch (/var rows \[\]any/);
        expect (out).toMatch (/GetArrayLength\(rows\)/);
    });

    test ('a nil test on the local keeps the box (typed nil is not the untyped nil)', () => {
        const out = print (
            '        let rows: Dict[] = [];\n' +
            '        if (c) { rows = await this.rowsA (q); }\n' +
            '        if (rows === undefined) { return out; }\n' +
            '        for (let i = 0; i < rows.length; i++) {\n' +
            '            out.push (this.parseRow (rows[i]));\n' +
            '        }\n');
        expect (out).not.toMatch (/var rows \[\]any/);
    });

    test ('the local handed on as an argument keeps the box', () => {
        const out = print (
            '        let rows: Dict[] = [];\n' +
            '        if (c) { rows = await this.rowsA (q); }\n' +
            '        const n = rows.length;\n' +
            '        out.push (this.parseRow (rows));\n' +
            '        out.push (this.parseRow (n));\n');
        expect (out).not.toMatch (/var rows \[\]any/);
    });
});
