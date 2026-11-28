import fs from 'fs';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

describe ('go loop-bounded read of an object[] parameter is the slice index', () => {
    const root = path.join (__dirname, 'files', 'tmp-h51g31', 'ts', 'src');
    const print = (method: string): string => {
        const base =
            'export type Dict = { [key: string]: any };\n' +
            'export class Exchange {\n' +
            '    parseRow (r: any): Dict { return r; }\n' + method + '}\n';
        fs.mkdirSync (path.join (root, 'base'), { recursive: true });
        fs.writeFileSync (path.join (root, 'base', 'Exchange.ts'), base);
        const t = new Transpiler ({ verbose: false, go: { 'unifiedSliceParams': { 'run': { 0: '[]any' } } } });
        installCcxtGoHooks (t.goTranspiler);
        return t.transpileGoByPath (path.join (root, 'base', 'Exchange.ts')).content;
    };
    afterAll (() => fs.rmSync (path.join (__dirname, 'files', 'tmp-h51g31'), { recursive: true, force: true }));

    test ('object[] parameter read inside its length loop', () => {
        const out = print (
            '    run (response: object[]): Dict[] {\n' +
            '        const out: Dict[] = [];\n' +
            '        for (let i = 0; i < response.length; i++) {\n' +
            '            out.push (this.parseRow (response[i]));\n' +
            '        }\n' +
            '        return out;\n' +
            '    }\n');
        expect (out).toMatch (/ParseRow\(response\[i\]\)/);
        expect (out).not.toMatch (/GetValue\(response, i\)/);
    });

    test ('negative: any[] parameter keeps the helper', () => {
        const out = print (
            '    run (response: any[]): Dict[] {\n' +
            '        const out: Dict[] = [];\n' +
            '        for (let i = 0; i < response.length; i++) {\n' +
            '            out.push (this.parseRow (response[i]));\n' +
            '        }\n' +
            '        return out;\n' +
            '    }\n');
        expect (out).toMatch (/GetValue\(response, i\)/);
    });

    test ('negative: a read outside the length loop keeps the helper', () => {
        const out = print (
            '    run (response: object[]): Dict {\n' +
            '        return this.parseRow (response[0]);\n' +
            '    }\n');
        expect (out).toMatch (/GetValue\(response, 0\)/);
    });

    test ('negative: the list written in the loop keeps the helper', () => {
        const out = print (
            '    run (response: object[]): Dict[] {\n' +
            '        const out: Dict[] = [];\n' +
            '        for (let i = 0; i < response.length; i++) {\n' +
            '            out.push (this.parseRow (response[i]));\n' +
            '            response.pop ();\n' +
            '        }\n' +
            '        return out;\n' +
            '    }\n');
        expect (out).toMatch (/GetValue\(response, i\)/);
    });
});
