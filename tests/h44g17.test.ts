import fs from 'fs';
import path from 'path';
import { Transpiler, installCcxtGoDictParams } from '../src/transpiler';

describe ('go dict params: parsePredictionTrade row', () => {
    const root = path.join (__dirname, 'files', 'tmp-h44g17', 'ts', 'src');
    const BASE = (body: string) =>
        'type Dict = { [key: string]: any };\n' +
        'export class Exchange {\n' +
        '    // METHODS BELOW THIS LINE ARE TRANSPILED FROM TYPESCRIPT\n' +
        '    run (rows: Dict[], x: any) {\n' + body + '    }\n' +
        '    safeDict (d: any, k: any, v: any = undefined): any { return undefined; }\n' +
        '    extend (...args: any[]): any { return {}; }\n' +
        '    parsePredictionTrade (trade: Dict, market: any = undefined): any {\n        return trade;\n    }\n' +
        '}\n';
    const print = (body: string): string => {
        fs.mkdirSync (path.join (root, 'base'), { recursive: true });
        fs.writeFileSync (path.join (root, 'base', 'Exchange.ts'), BASE (body));
        const t = new Transpiler ({ verbose: false, go: {} });
        installCcxtGoDictParams (t.goTranspiler);
        return t.transpileGoByPath (path.join (root, 'base', 'Exchange.ts')).content;
    };
    afterAll (() => fs.rmSync (path.join (__dirname, 'files', 'tmp-h44g17'), { recursive: true, force: true }));

    test ('a defaulted safeDict row types the trade parameter', () => {
        const out = print ('        this.parsePredictionTrade (this.safeDict (rows, 0, {}));\n');
        expect (out).toContain ('ParsePredictionTrade(trade map[string]any');
    });
    test ('an extend copy types the trade parameter', () => {
        expect (print ('        this.parsePredictionTrade (this.extend ({}, x), x);\n')).toContain ('ParsePredictionTrade(trade map[string]any');
    });
    test ('an untyped, nil or undefaulted argument keeps the box', () => {
        expect (print ('        this.parsePredictionTrade (x);\n')).toContain ('ParsePredictionTrade(trade any');
        expect (print ('        this.parsePredictionTrade (undefined);\n')).toContain ('ParsePredictionTrade(trade any');
        expect (print ('        this.parsePredictionTrade (this.safeDict (rows, 0));\n')).toContain ('ParsePredictionTrade(trade any');
    });
});
