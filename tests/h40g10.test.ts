import fs from 'fs';
import path from 'path';
import { Transpiler, installCcxtGoDictParams } from '../src/transpiler';

describe ('go dict params: parseFundingRate, parseLeverage and parseIncome rows', () => {
    const root = path.join (__dirname, 'files', 'tmp-h40g10', 'ts', 'src');
    const BASE = (body: string) =>
        'type Dict = { [key: string]: any };\n' +
        'export class Exchange {\n' +
        '    // METHODS BELOW THIS LINE ARE TRANSPILED FROM TYPESCRIPT\n' +
        '    run (rows: Dict[], x: any) {\n' + body + '    }\n' +
        '    safeDict (d: any, k: any, v: any = undefined): any { return undefined; }\n' +
        '    parseFundingRate (contract: Dict, market: any = undefined): any {\n        return contract;\n    }\n' +
        '    parseLeverage (leverage: Dict, market: any = undefined): any {\n        return leverage;\n    }\n' +
        '    parseIncome (info: Dict, market: any = undefined): any {\n        return info;\n    }\n' +
        '}\n';
    const print = (body: string): string => {
        fs.mkdirSync (path.join (root, 'base'), { recursive: true });
        fs.writeFileSync (path.join (root, 'base', 'Exchange.ts'), BASE (body));
        const t = new Transpiler ({ verbose: false, go: {} });
        installCcxtGoDictParams (t.goTranspiler);
        return t.transpileGoByPath (path.join (root, 'base', 'Exchange.ts')).content;
    };
    afterAll (() => fs.rmSync (path.join (__dirname, 'files', 'tmp-h40g10'), { recursive: true, force: true }));

    test ('a defaulted safeDict row types all three row parameters', () => {
        const out = print (
            '        this.parseFundingRate (this.safeDict (rows, 0, {}));\n' +
            '        this.parseLeverage (this.safeDict (rows, 0, {}));\n' +
            '        this.parseIncome (this.safeDict (rows, 0, {}));\n');
        expect (out).toContain ('ParseFundingRate(contract map[string]any');
        expect (out).toContain ('ParseLeverage(leverage map[string]any');
        expect (out).toContain ('ParseIncome(info map[string]any');
    });
    test ('an untyped argument (nil or another kind) keeps the box', () => {
        const out = print (
            '        this.parseFundingRate (x);\n' +
            '        this.parseLeverage (undefined);\n' +
            '        this.parseIncome (this.safeDict (rows, 0));\n');
        expect (out).toContain ('ParseFundingRate(contract any');
        expect (out).toContain ('ParseLeverage(leverage any');
        expect (out).toContain ('ParseIncome(info any');
    });
});
