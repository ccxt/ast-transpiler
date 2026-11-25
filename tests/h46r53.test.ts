import { Transpiler } from '../src/transpiler';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// a venue method declared `Promise<NullableDict>` whose returns are an optional map local or a no-default `safeDict`
// read prints `-> Option<crate::value::Dict>`; a `Dict` local of its awaited result takes `unwrap_or_default`
const base = 'export interface Dict { [key: string]: any }\nexport type NullableDict = Dict | undefined;\nexport type Str = string | undefined;\n' +
    'export default class Exchange {\n    options: Dict = {};\n' +
    '    safeString (o: any, k: any, d: Str = undefined): Str { return o; }\n' +
    '    safeDict (o: any, k: any, d: Dict = undefined): Dict | undefined { return o; }\n    hold (x: any): any { return x; }\n}\n';
const venue = "import Exchange from './base/Exchange.js';\nimport type { Dict, NullableDict } from './base/Exchange.js';\n" +
    'export default class venue extends Exchange {\n' +
    "    async fetchWallet (methodName: string, params: Dict = {}): Promise<NullableDict> {\n        const cached = this.safeDict (this.options, 'wallet');\n        if (cached !== undefined) {\n            return cached;\n        }\n        this.hold (params);\n        if (methodName === 'x') {\n            return this.safeDict (this.options, 'wallet');\n        }\n        throw new Error ('none');\n    }\n" +
    "    async fetchLoose (params: Dict = {}): Promise<NullableDict> {\n        this.hold (params);\n        return this.safeDict (this.options, 'wallet', {});\n    }\n" +
    "    async fetchFalls (params: Dict = {}): Promise<NullableDict> {\n        if (this.hold (params)) {\n            return this.safeDict (this.options, 'wallet');\n        }\n    }\n" +
    "    async fetchOrders (params: Dict = {}) {\n        const wallet = await this.fetchWallet ('fetchOrders', params);\n        const loose = await this.fetchLoose (params);\n        const falls = await this.fetchFalls (params);\n        this.hold (falls);\n        return [ this.safeString (wallet, 'walletAddress'), this.safeString (loose, 'a') ];\n    }\n}\n";

describe ('rust venue NullableDict return: Option<Dict>', () => {
    let output = '';
    beforeAll (() => {
        const root = fs.mkdtempSync (path.join (os.tmpdir (), 'h46r53-'));
        fs.mkdirSync (path.join (root, 'ts', 'src', 'base'), { recursive: true });
        fs.writeFileSync (path.join (root, 'ts', 'src', 'base', 'Exchange.ts'), base);
        fs.writeFileSync (path.join (root, 'ts', 'src', 'venue.ts'), venue);
        const t = new Transpiler ({ 'verbose': false, 'rust': { 'parser': { 'NUM_LINES_END_FILE': 0 } } } as any);
        output = t.transpileRustByPath (path.join (root, 'ts', 'src', 'venue.ts')).content;
    });
    test ('the method returns Option<Dict>, each return its native optional map', () => {
        expect (output).toMatch (/fn fetchWallet\([^\n]*\) -> Option<crate::value::Dict> \{/);
        expect (output).toContain ('return cached;');
        expect (output).toContain ('return self.safe_dict_k_o(&self.options, "wallet");');
    });
    test ('the awaited result unwraps once (None -> the empty map, as into_dict answered for Null)', () => {
        expect (output).toMatch (/self\.fetchWallet\("fetchOrders", [^\n]*\)\.await\.unwrap_or_default\(\);/);
        expect (output).not.toMatch (/self\.fetchWallet\([^\n]*\.into_dict\(\)/);
    });
    test ('negatives: a `{}` default return and a body that falls off its end stay `Value`', () => {
        expect (output).toMatch (/fn fetchLoose\([^\n]*\) -> Value \{/);
        expect (output).toMatch (/fn fetchFalls\([^\n]*\) -> Value \{/);
    });
});
