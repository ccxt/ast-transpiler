import fs from 'fs';
import path from 'path';
import { Transpiler, installCcxtGoLocalTypes, installCcxtGoIndexableTypes, installCcxtGoParamTypes, installCcxtGoDictParams, installCcxtGoSignTyping } from '../src/transpiler';

describe ('go slice-table slot fed by a defaulted string[] parameter', () => {
    const root = path.join (__dirname, 'files', 'tmp-h40g29', 'ts', 'src');
    const BASE = (call: string) =>
        'export type Dict = { [key: string]: any };\n' +
        'export class Exchange {\n' +
        "    async fetch2 (path: string, api: string[] = [ 'public' ], method = 'GET', params: Dict = {}, config: Dict = {}): Promise<any> {\n" +
        call +
        '        return cost;\n' +
        '    }\n' +
        '    calculateRateLimiterCost (api: string[], method: string, path: string, params: any, config: Dict = {}) {\n' +
        "        return this.safeValue (config, 'cost', 1);\n" +
        '    }\n' +
        '    safeValue (o: any, k: any, d: any = undefined): any { return d; }\n' +
        '}\n';
    const print = (call: string): string => {
        fs.mkdirSync (path.join (root, 'base'), { recursive: true });
        fs.writeFileSync (path.join (root, 'base', 'Exchange.ts'), BASE (call));
        const t: any = new Transpiler ({ verbose: false, go: { unifiedSliceParams: { 'calculateRateLimiterCost': { 0: '[]string' } } } });
        installCcxtGoLocalTypes (t.goTranspiler);
        installCcxtGoIndexableTypes (t.goTranspiler);
        installCcxtGoParamTypes (t.goTranspiler);
        installCcxtGoDictParams (t.goTranspiler);
        installCcxtGoSignTyping (t.goTranspiler);
        return t.transpileGoByPath (path.join (root, 'base', 'Exchange.ts')).content;
    };
    afterAll (() => fs.rmSync (path.join (__dirname, 'files', 'tmp-h40g29'), { recursive: true, force: true }));

    test ('the defaulted api parameter is handed on: the slot prints []string', () => {
        const out = print ('        const cost = this.calculateRateLimiterCost (api, method, path, params, config);\n');
        expect (out).toMatch (/CalculateRateLimiterCost\(api \[\]string, /);
    });

    test ('a boxed argument keeps the slot any', () => {
        const out = print ('        const box: any = params;\n        const cost = this.calculateRateLimiterCost (box, method, path, params, config);\n');
        expect (out).toMatch (/CalculateRateLimiterCost\(api any, /);
    });

    test ('a list literal of a boxed element keeps the slot any', () => {
        const out = print ("        const cost = this.calculateRateLimiterCost ([ params['x'] ], method, path, params, config);\n");
        expect (out).toMatch (/CalculateRateLimiterCost\(api any, /);
    });
});
