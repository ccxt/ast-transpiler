import fs from 'fs';
import path from 'path';
import { Transpiler, installCcxtGoHooks, installCcxtGoLocalTypes, installCcxtGoIndexableTypes, installCcxtGoParamTypes, installCcxtGoDictParams, installCcxtGoGb05ParamTypes, installCcxtGoGb11HandleErrorsCode, installCcxtGoSignTyping, installRfGo5OwnedTables, installFmGo5G01, installFmGo5G04, installCcxtGoTupleSlotReads, installCcxtGoFeeTierLiterals, installFmGo5GP08, installFmGo5OG02 } from '../src/transpiler';

// the base stage prints with the virtual-call wrapping on; a venue caller's awaited map must still prove the tabled dict slot
const tmp = path.join (__dirname, 'files', 'tmp-h55g01-' + (process.env.JEST_WORKER_ID || '0'));
const root = path.join (tmp, 'ts', 'src');
const BASE =
    'export type Dict = { [key: string]: any };\n' +
    'export type Str = string | undefined;\n' +
    'export class Exchange {\n' +
    "    id: string = 'x';\n" +
    '    safeDict (o: any, k: any, d: any = undefined): Dict { return d; }\n' +
    '    safeValue (o: any, k: any, d: any = undefined): any { return d; }\n' +
    '    async fetchDepositAddressesByNetwork (code: string, params: Dict = {}): Promise<Dict> {\n' +
    "        return this.safeDict (params, 'x', {});\n" +
    '    }\n' +
    '    selectNetworkKeyFromNetworks (currencyCode: string, networkCode: Str, indexedNetworkEntries: Dict, flag = false): Str {\n' +
    '        const ks = Object.keys (indexedNetworkEntries);\n' +
    '        if (ks.length === 0) {\n' +
    '            return undefined;\n' +
    '        }\n' +
    '        return ks[0];\n' +
    '    }\n' +
    '    async useAddresses (code: string): Promise<Dict> {\n' +
    '        return await this.fetchDepositAddressesByNetwork (code);\n' +
    '    }\n' +
    '}\n' +
    'export default Exchange;\n';
const printBase = (venueBody: string, wrap: string[]): string => {
    fs.mkdirSync (path.join (root, 'base'), { recursive: true });
    fs.writeFileSync (path.join (root, 'base', 'Exchange.ts'), BASE);
    fs.writeFileSync (path.join (root, 'venue.ts'), "import Exchange from './base/Exchange.js';\nimport type { Dict } from './base/Exchange.js';\nexport default class venue extends Exchange {\n    async fetchDepositAddress (code: string, params: Dict = {}) {\n" + venueBody + '        const key = this.selectNetworkKeyFromNetworks (code, undefined, indexed, true);\n        return this.safeDict (indexed, key);\n    }\n}\n');
    const t = new Transpiler ({ verbose: false, go: { parser: { NUM_LINES_END_FILE: 0 }, asyncMethodSuffix: 'Async' } });
    for (const f of [ installCcxtGoHooks, installCcxtGoLocalTypes, installCcxtGoIndexableTypes, installCcxtGoParamTypes, installCcxtGoDictParams, installCcxtGoGb05ParamTypes, installCcxtGoGb11HandleErrorsCode, installCcxtGoSignTyping, installRfGo5OwnedTables, installFmGo5G01, installFmGo5G04, installCcxtGoTupleSlotReads, installCcxtGoFeeTierLiterals, installFmGo5GP08, installFmGo5OG02 ]) {
        (f as any) (t.goTranspiler);
    }
    (t.goTranspiler as any).wrapCallMethods = wrap;
    return t.transpileGoByPath (path.join (root, 'base', 'Exchange.ts')).content;
};
const awaited = '        const indexed = await this.fetchDepositAddressesByNetwork (code, params);\n';
const SIG = 'func (this *Exchange) SelectNetworkKeyFromNetworks(';

describe ('h55g01: a venue caller of a tabled base dict slot, proven while the base stage wraps virtual calls', () => {
    afterAll (() => fs.rmSync (tmp, { recursive: true, force: true }));
    test ('an awaited fetchDepositAddressesByNetwork map types the slot with the wrapping on (fails on the base printer)', () => {
        const out = printBase (awaited, [ 'fetchDepositAddressesByNetwork' ]);
        expect (out).toContain (SIG);
        expect (out).toMatch (/SelectNetworkKeyFromNetworks\([^)]*indexedNetworkEntries map\[string\]any/);
        expect (out).not.toContain ('ObjectKeys(indexedNetworkEntries)');
    });
    test ('the same caller types the slot with no wrapping', () => {
        const out = printBase (awaited, []);
        expect (out).toMatch (/SelectNetworkKeyFromNetworks\([^)]*indexedNetworkEntries map\[string\]any/);
    });
    test ('the base stage still wraps the base file\'s own virtual calls after the proof', () => {
        const out = printBase (awaited, [ 'fetchDepositAddressesByNetwork' ]);
        expect (out).toContain ('this.callInternal("fetchDepositAddressesByNetwork", code)');
    });
    test ('negative: a venue caller that passes an untyped safeValue keeps the box', () => {
        const out = printBase ("        const indexed = this.safeValue (params, 'k');\n", [ 'fetchDepositAddressesByNetwork' ]);
        expect (out).toMatch (/SelectNetworkKeyFromNetworks\([^)]*indexedNetworkEntries any/);
    });
    test ('negative: a nil-seeded caller local keeps the box', () => {
        const out = printBase ('        let indexed = undefined;\n        if (code === \'a\') {\n            indexed = await this.fetchDepositAddressesByNetwork (code, params);\n        }\n', [ 'fetchDepositAddressesByNetwork' ]);
        expect (out).toMatch (/SelectNetworkKeyFromNetworks\([^)]*indexedNetworkEntries any/);
    });
});
