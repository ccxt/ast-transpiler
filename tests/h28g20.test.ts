import fs from 'fs';
import path from 'path';
import { printVenue } from './h22g01.test';

// `const ks = Object.keys (x)` on an awaited typed-map receive prints the nil-guarded native range
const fn = (pre: string, body: string) =>
    '    async fetchDepositAddressesByNetwork (id: string, params: Dict = {}): Promise<Dict> {\n        return this.safeDict (params, \'x\');\n    }\n' + pre
    + '    async useThing (id: string, params: Dict = {}) {\n        const a = await this.fetchDepositAddressesByNetwork (id, params);\n' + body + '\n    }\n';
const keys = '        const keys = Object.keys (a);\n        return this.safeString (keys, 0);';

describe ('h28g20: Object.keys of an awaited typed map receive', () => {
    afterAll (() => fs.rmSync (path.join (__dirname, 'files', 'tmp-h22g01-' + (process.env.JEST_WORKER_ID || '0')), { recursive: true, force: true }));
    test ('keys of the awaited map keep the typed map receive (fails on the base printer; the pipeline prints the range collect)', () => {
        const out = printVenue (fn ('', keys));
        expect (out).toContain ('\tvar a map[string]any = MapTyped(PanicOnError((<-this.FetchDepositAddressesByNetworkAsync(id, params))))\n');
    });
    test ('negative: a write of another value keeps the helper', () => {
        const out = printVenue (fn ('', keys).replace ('const a =', 'let a =').replace ('        const keys', '        a = 5;\n        const keys'));
        expect (out).not.toContain ('var a map[string]any = MapTyped(');
    });
    test ('negative: a nil compare on the receive keeps the helper', () => {
        const out = printVenue (fn ('', keys.replace ('        const keys', '        if (a === undefined) {\n            return undefined;\n        }\n        const keys')));
        expect (out).not.toContain ('var a map[string]any = MapTyped(');
    });
    test ('negative: an element read stored into another container keeps the helper', () => {
        const out = printVenue (fn ('    bal: Dict = {};\n', '        const keys = Object.keys (a);\n        for (let i = 0; i < keys.length; i++) {\n            const k = keys[i];\n            this.bal[k] = a[k];\n        }'));
        expect (out).not.toContain ('var a map[string]any = MapTyped(');
    });
});
