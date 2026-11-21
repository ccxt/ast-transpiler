import fs from 'fs';
import path from 'path';
import { Transpiler, installCcxtGoHooks, installCcxtGoLocalTypes, installCcxtGoIndexableTypes, installCcxtGoParamTypes, installCcxtGoDictParams, installCcxtGoGb05ParamTypes, installCcxtGoGb11HandleErrorsCode, installCcxtGoSignTyping, installRfGo5OwnedTables, installFmGo5G01, installFmGo5G04, installCcxtGoTupleSlotReads, installCcxtGoFeeTierLiterals, installFmGo5GP08, installFmGo5OG02 } from '../src/transpiler';

// one tree per jest worker: suites importing printVenue run in parallel
const tmp = path.join (__dirname, 'files', 'tmp-h22g01-' + (process.env.JEST_WORKER_ID || '0'));
const root = path.join (tmp, 'ts', 'src');
const BASE =
    'export type Dict = { [key: string]: any };\n' +
    'export class Exchange {\n' +
    "    id: string = 'x';\n" +
    '    options: any = {};\n' +
    '    safeList (o: any, k: any, d: any = undefined): any[] { return d; }\n' +
    '    safeString (o: any, k: any, d: any = undefined): string { return d; }\n' +
    '    parseTicker (t: Dict, market: any = undefined): Dict { return t; }\n' +
    '    async publicGet (p: Dict = {}): Promise<any> { return p; }\n' +
    '}\n';
export const printVenue = (members: string): string => {
    fs.mkdirSync (path.join (root, 'base'), { recursive: true });
    fs.writeFileSync (path.join (root, 'base', 'Exchange.ts'), BASE + 'export default Exchange;\n');
    fs.writeFileSync (path.join (root, 'venue.ts'), "import Exchange from './base/Exchange.js';\nimport type { Dict } from './base/Exchange.js';\nexport default class venue extends Exchange {\n" + members + '\n}\n');
    const t = new Transpiler ({ verbose: false, go: { parser: { NUM_LINES_END_FILE: 0 }, asyncMethodSuffix: 'Async' } });
    for (const f of [ installCcxtGoHooks, installCcxtGoLocalTypes, installCcxtGoIndexableTypes, installCcxtGoParamTypes, installCcxtGoDictParams, installCcxtGoGb05ParamTypes, installCcxtGoGb11HandleErrorsCode, installCcxtGoSignTyping, installRfGo5OwnedTables, installFmGo5G01, installFmGo5G04, installCcxtGoTupleSlotReads, installCcxtGoFeeTierLiterals, installFmGo5GP08, installFmGo5OG02 ]) {
        (f as any) (t.goTranspiler);
    }
    return t.transpileGoByPath (path.join (root, 'venue.ts')).content;
};
const fetch = (decl: string, use: string) =>
    '    async fetchT (symbol: string, params: Dict = {}): Promise<Dict> {\n' +
    '        const response = await this.publicGet (params);\n' +
    "        const data" + decl + " = this.safeList (response, 'data', []);\n" + use + '\n    }\n';

describe ('h22g01: guarded first-row read on a declared dict list', () => {
    afterAll (() => fs.rmSync (tmp, { recursive: true, force: true }));
    test ('a returned row read prints a length branch without the closure', () => {
        const out = printVenue (fetch (': Dict[]', '        return this.parseTicker (data[0], symbol);'));
        expect (out).toContain ('\tif len(data) > 0 {\n\t\tch <- this.ParseTicker(data[0], symbol)\n\t} else {\n\t\tch <- this.ParseTicker(nil, symbol)\n\t}\n\treturn nil\n');
        expect (out).not.toContain ('func() any {');
    });
    test ('a declared local splits into a typed declaration and two assignments', () => {
        const out = printVenue (fetch (': Dict[]', '        const t = this.parseTicker (data[0], symbol);\n        t[\'x\'] = 1;\n        return t;'));
        expect (out).toContain ('\tvar t map[string]any\n\tif len(data) > 0 {\n\t\tt = this.ParseTicker(data[0], symbol)\n\t} else {\n\t\tt = this.ParseTicker(nil, symbol)\n\t}\n');
        expect (out).not.toContain ('func() any {');
    });
    test ('an unannotated safeList local reads the same way', () => {
        const out = printVenue (fetch ('', "        return this.safeString (data[0], 'symbol');"));
        expect (out).toContain ('if len(data) > 0 {');
        expect (out).not.toContain ('func() any {');
    });
    test ('a list written in the method keeps the closure', () => {
        const out = printVenue (fetch (': Dict[]', "        data.push ({});\n        return this.parseTicker (data[0], symbol);"));
        expect (out).not.toContain ('if len(data) > 0 {');
    });
    test ('a second read of the list in the statement keeps the closure', () => {
        const out = printVenue (fetch (': Dict[]', '        return this.parseTicker (data[0], data[1]);'));
        expect (out).not.toContain ('if len(data) > 0 {');
    });
    test ('a list whose length is tested is left to the in-range proof', () => {
        const out = printVenue (fetch (': Dict[]', '        if (data.length > 0) {\n            return this.parseTicker (data[0], symbol);\n        }\n        return {};'));
        expect (out).not.toContain ('if len(data) > 0 {\n\t\t\tch <-');
    });
    test ('a cast safeList local whose read carries DerefScalar goes bare', () => {
        const out = printVenue (fetch ('', '        return this.parseTicker (data[0] as Dict, symbol);').replace ("this.safeList (response, 'data', [])", "this.safeList (response, 'data', []) as any[]"));
        expect (out).toContain ('if len(data) > 0 {');
        expect (out).not.toContain ('DerefScalar(data[0])');
    });
    test ('a Dict[] list from another producer keeps a DerefScalar closure', () => {
        const out = printVenue ('    async fetchT (symbol: string, params: Dict = {}): Promise<Dict> {\n        const data: Dict[] = params[\'rows\'];\n        return this.parseTicker (data[0], symbol);\n    }\n');
        expect (out).not.toContain ('if len(data) > 0 {');
    });
    test ('a write through the first row keeps its form', () => {
        const out = printVenue (fetch (': Dict[]', "        data[0]['cursor'] = symbol;\n        return data;"));
        expect (out).not.toContain ('if len(data) > 0 {');
    });
});
