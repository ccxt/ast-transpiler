import fs from 'fs';
import path from 'path';
import { Transpiler, installCcxtGoDictParams } from '../src/transpiler';

describe ('go dict params: parsePredictionOrder order', () => {
    const root = path.join (__dirname, 'files', 'tmp-h46g19', 'ts', 'src');
    const BASE = (body: string) =>
        'type Dict = { [key: string]: any };\n' +
        'export class Exchange {\n' +
        '    // METHODS BELOW THIS LINE ARE TRANSPILED FROM TYPESCRIPT\n' +
        '    run (rows: Dict[], x: any) {\n' + body + '    }\n' +
        '    safeDict (d: any, k: any, v: any = undefined): any { return undefined; }\n' +
        '    extend (...args: any[]): any { return {}; }\n' +
        '    parsePredictionOrder (order: Dict, market: any = undefined): any {\n        return order;\n    }\n' +
        '}\n';
    const print = (body: string): string => {
        fs.mkdirSync (path.join (root, 'base'), { recursive: true });
        fs.writeFileSync (path.join (root, 'base', 'Exchange.ts'), BASE (body));
        const t = new Transpiler ({ verbose: false, go: {} });
        installCcxtGoDictParams (t.goTranspiler);
        return t.transpileGoByPath (path.join (root, 'base', 'Exchange.ts')).content;
    };
    afterAll (() => fs.rmSync (path.join (__dirname, 'files', 'tmp-h46g19'), { recursive: true, force: true }));

    test ('a defaulted safeDict row types the order parameter', () => {
        const out = print ('        this.parsePredictionOrder (this.safeDict (rows, 0, {}));\n');
        expect (out).toContain ('ParsePredictionOrder(order map[string]any');
    });
    test ('an extend copy types the order parameter', () => {
        expect (print ('        this.parsePredictionOrder (this.extend ({}, x), x);\n')).toContain ('ParsePredictionOrder(order map[string]any');
    });
    test ('an untyped, nil or undefaulted argument keeps the box', () => {
        expect (print ('        this.parsePredictionOrder (x);\n')).toContain ('ParsePredictionOrder(order any');
        expect (print ('        this.parsePredictionOrder (undefined);\n')).toContain ('ParsePredictionOrder(order any');
        expect (print ('        this.parsePredictionOrder (this.safeDict (rows, 0));\n')).toContain ('ParsePredictionOrder(order any');
    });
});
