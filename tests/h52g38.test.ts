import fs from 'fs';
import path from 'path';
import { Transpiler, installCcxtGoHooks, installCcxtGoLocalTypes, installCcxtGoIndexableTypes, installCcxtGoParamTypes, installCcxtGoDictParams, installCcxtGoGb05ParamTypes, installCcxtGoGb11HandleErrorsCode, installCcxtGoSignTyping, installRfGo5OwnedTables, installFmGo5G01, installFmGo5G04, installCcxtGoTupleSlotReads, installCcxtGoFeeTierLiterals, installFmGo5GP08, installFmGo5OG02 } from '../src/transpiler';

// one tree per jest worker: suites importing printVenue run in parallel
const tmp = path.join (__dirname, 'files', 'tmp-h52g38-' + (process.env.JEST_WORKER_ID || '0'));
const root = path.join (tmp, 'ts', 'src');
const BASE =
    'export type Dict = { [key: string]: any };\n' +
    'export class Exchange {\n' +
    "    id: string = 'x';\n" +
    '    options: any = {};\n' +
    '    safeDict (o: any, k: any, d: any = undefined): Dict { return d; }\n' +
    '    indexBy (o: any, k: any): Dict { return {}; }\n' +
    '    safeList (o: any, k: any, d: any = undefined): any[] { return d; }\n' +
    '    safeString (o: any, k: any, d: any = undefined): string { return d; }\n' +
    '    parseTicker (t: Dict, market: any = undefined): Dict { return t; }\n' +
    '    async publicGet (p: Dict = {}): Promise<any> { return p; }\n' +
    '}\n';
const printVenue = (members: string): string => {
    fs.mkdirSync (path.join (root, 'base'), { recursive: true });
    fs.writeFileSync (path.join (root, 'base', 'Exchange.ts'), BASE + 'export default Exchange;\n');
    fs.writeFileSync (path.join (root, 'venue.ts'), "import Exchange from './base/Exchange.js';\nimport type { Dict } from './base/Exchange.js';\nexport default class venue extends Exchange {\n" + members + '\n}\n');
    const t = new Transpiler ({ verbose: false, go: { parser: { NUM_LINES_END_FILE: 0 }, asyncMethodSuffix: 'Async' } });
    for (const f of [ installCcxtGoHooks, installCcxtGoLocalTypes, installCcxtGoIndexableTypes, installCcxtGoParamTypes, installCcxtGoDictParams, installCcxtGoGb05ParamTypes, installCcxtGoGb11HandleErrorsCode, installCcxtGoSignTyping, installRfGo5OwnedTables, installFmGo5G01, installFmGo5G04, installCcxtGoTupleSlotReads, installCcxtGoFeeTierLiterals, installFmGo5GP08, installFmGo5OG02 ]) {
        (f as any) (t.goTranspiler);
    }
    return t.transpileGoByPath (path.join (root, 'venue.ts')).content;
};

// the base method lives in the venue file here; the row in GO_BASE_DICT_PARAMS names it
const sel = '    selectNetworkKeyFromNetworks (code: string, networkCode: Str, indexedNetworkEntries: Dict, flag = false): Str {\n        const ks = Object.keys (indexedNetworkEntries);\n        if (ks.length === 0) {\n            return undefined;\n        }\n        return ks[0];\n    }\n';
const by = '    async fetchDepositAddressesByNetwork (id: string, params: Dict = {}): Promise<Dict> {\n        return this.safeDict (params, \'x\');\n    }\n';
const use = (decl: string) => '    async useA (id: string, params: Dict = {}) {\n' + decl + '        const s = this.selectNetworkKeyFromNetworks (id, undefined, a, true);\n        return this.safeDict (a, s);\n    }\n';
const recv = '        const a = await this.fetchDepositAddressesByNetwork (id, params);\n';

describe ('h52g38: an awaited map handed to a tabled dict slot', () => {
    afterAll (() => fs.rmSync (tmp, { recursive: true, force: true }));
    test ('the awaited receive keeps its map type when passed to the dict slot (fails on the base printer)', () => {
        const out = printVenue ('type Str = string | undefined;\n'.slice (0, 0) + by + sel + use (recv));
        expect (out).toContain ('\tvar a map[string]any = MapTyped(PanicOnError((<-this.FetchDepositAddressesByNetworkAsync(id, params))))\n');
    });
    test ('negative: an untabled method slot keeps the box', () => {
        const out = printVenue (by + sel.replace ('selectNetworkKeyFromNetworks', 'pickKey') + use (recv).replace ('selectNetworkKeyFromNetworks', 'pickKey'));
        expect (out).not.toContain ('var a map[string]any = MapTyped(');
        expect (out).toContain ('ObjectKeys(indexedNetworkEntries)');
    });
    test ('negative: another slot of the tabled method keeps the box', () => {
        const out = printVenue (by + sel + use (recv).replace ('(id, undefined, a, true)', '(id, undefined, {}, a)'));
        expect (out).not.toContain ('var a map[string]any = MapTyped(');
    });
    test ('negative: a nil compare on the receive keeps the box', () => {
        const out = printVenue (by + sel + use (recv + '        if (a === undefined) {\n            return undefined;\n        }\n'));
        expect (out).not.toContain ('var a map[string]any = MapTyped(');
    });
});
