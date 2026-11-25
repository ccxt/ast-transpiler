import fs from 'fs';
import path from 'path';
import { Transpiler, installCcxtGoDictParams } from '../src/transpiler';

describe ('go dict params: parseLastPrice row', () => {
    const root = path.join (__dirname, 'files', 'tmp-h44g21', 'ts', 'src');
    const BASE = (body: string) =>
        'type Dict = { [key: string]: any };\n' +
        'export class Exchange {\n' +
        '    // METHODS BELOW THIS LINE ARE TRANSPILED FROM TYPESCRIPT\n' +
        '    run (rows: Dict[], x: any) {\n' + body + '    }\n' +
        '    safeDict (d: any, k: any, v: any = undefined): any { return undefined; }\n' +
        '    extend (...args: any[]): any { return {}; }\n' +
        '    parseLastPrice (entry: Dict, market: any = undefined): any {\n        return entry;\n    }\n' +
        '}\n';
    const print = (body: string): string => {
        fs.mkdirSync (path.join (root, 'base'), { recursive: true });
        fs.writeFileSync (path.join (root, 'base', 'Exchange.ts'), BASE (body));
        const t = new Transpiler ({ verbose: false, go: {} });
        installCcxtGoDictParams (t.goTranspiler);
        return t.transpileGoByPath (path.join (root, 'base', 'Exchange.ts')).content;
    };
    afterAll (() => fs.rmSync (path.join (__dirname, 'files', 'tmp-h44g21'), { recursive: true, force: true }));

    test ('an extend copy types the entry parameter', () => {
        const out = print ('        this.parseLastPrice (this.extend ({}, rows[0]));\n');
        expect (out).toContain ('ParseLastPrice(entry map[string]any');
    });
    test ('an untyped row, nil or undefaulted argument keeps the box', () => {
        expect (print ('        this.parseLastPrice (rows[0]);\n')).toContain ('ParseLastPrice(entry any');
        expect (print ('        this.parseLastPrice (x);\n')).toContain ('ParseLastPrice(entry any');
        expect (print ('        this.parseLastPrice (undefined);\n')).toContain ('ParseLastPrice(entry any');
        expect (print ('        this.parseLastPrice (this.safeDict (rows, 0));\n')).toContain ('ParseLastPrice(entry any');
    });
});
