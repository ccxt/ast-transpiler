import fs from 'fs';
import path from 'path';
import { Transpiler, installCcxtGoDictParams } from '../src/transpiler';

describe ('go dict params: parseADLRank row', () => {
    const root = path.join (__dirname, 'files', 'tmp-h44g14', 'ts', 'src');
    const BASE = (body: string) =>
        'type Dict = { [key: string]: any };\n' +
        'export class Exchange {\n' +
        '    // METHODS BELOW THIS LINE ARE TRANSPILED FROM TYPESCRIPT\n' +
        '    run (rows: Dict[], x: any) {\n' + body + '    }\n' +
        '    safeDict (d: any, k: any, v: any = undefined): any { return undefined; }\n' +
        '    extend (...args: any[]): any { return {}; }\n' +
        '    parseADLRank (info: Dict, market: any = undefined): any {\n        if (info === undefined) { return undefined; }\n        return info;\n    }\n' +
        '}\n';
    const print = (body: string): string => {
        fs.mkdirSync (path.join (root, 'base'), { recursive: true });
        fs.writeFileSync (path.join (root, 'base', 'Exchange.ts'), BASE (body));
        const t = new Transpiler ({ verbose: false, go: {} });
        installCcxtGoDictParams (t.goTranspiler);
        return t.transpileGoByPath (path.join (root, 'base', 'Exchange.ts')).content;
    };
    afterAll (() => fs.rmSync (path.join (__dirname, 'files', 'tmp-h44g14'), { recursive: true, force: true }));

    test ('a defaulted safeDict row types the info parameter', () => {
        const out = print ('        this.parseADLRank (this.safeDict (rows, 0, {}));\n');
        expect (out).toContain ('ParseADLRank(info map[string]any');
    });
    test ('an untyped, nil or undefaulted argument keeps the box', () => {
        expect (print ('        this.parseADLRank (x);\n')).toContain ('ParseADLRank(info any');
        expect (print ('        this.parseADLRank (undefined);\n')).toContain ('ParseADLRank(info any');
        expect (print ('        this.parseADLRank (this.safeDict (rows, 0));\n')).toContain ('ParseADLRank(info any');
    });
});
