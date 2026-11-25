import { Transpiler } from '../src/transpiler';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// a venue parser's `Dict` row fed by an endpoint result the abstract file declares `Promise<Dict>`
const base = 'export interface Dict { [key: string]: any }\nexport type Str = string | undefined;\n' +
    'export default class Exchange {\n    safeString (o: any, k: any, d: Str = undefined): Str { return o; }\n' +
    '    safeNumber (o: any, k: any): any { return o; }\n    extend (...args: any[]): any { return {}; }\n}\n';
const abstract = "import { Exchange as _Exchange } from '../base/Exchange.js';\nimport type { Dict } from '../base/Exchange.js';\n" +
    'export default abstract class Exchange extends _Exchange {\n' +
    '    privateGetFees (params = {}): Promise<Dict> {\n        return this[\'request\'] (\'fees\', \'private\', \'GET\', params);\n    }\n' +
    '    privateGetRaw (params = {}): Promise<any> {\n        return this[\'request\'] (\'raw\', \'private\', \'GET\', params);\n    }\n}\n';
const venue = "import Exchange from './abstract/venue.js';\nimport type { Dict, Str } from './base/Exchange.js';\n" +
    'export default class venue extends Exchange {\n' +
    "    async fetchFee (params: Dict = {}) {\n        const response = await this.privateGetFees (this.extend ({}, params));\n        return this.parseFee (response);\n    }\n" +
    "    parseFee (fee: Dict): Dict {\n        return {\n            'info': fee,\n            'maker': this.safeNumber (fee, 'maker'),\n        };\n    }\n" +
    "    async fetchFees (params: Dict = {}) {\n        const response = await this.privateGetFees (params);\n        return this.parseFees (response);\n    }\n" +
    "    parseFees (response: Dict): Dict {\n        const result: Dict = {};\n        result['a'] = this.parseFee2 (response);\n        return result;\n    }\n" +
    "    async fetchFee2 (params: Dict = {}) {\n        const response = await this.privateGetFees (params);\n        return this.parseFee2 (response);\n    }\n" +
    "    parseFee2 (fee: Dict): Dict {\n        return {\n            'info': fee,\n            'maker': this.safeNumber (fee, 'maker'),\n        };\n    }\n" +
    "    async fetchRaw (params: Dict = {}) {\n        const response = await this.privateGetRaw (params);\n        return this.parseRaw (response);\n    }\n" +
    "    parseRaw (fee: Dict): Dict {\n        return {\n            'info': fee,\n            'maker': this.safeNumber (fee, 'maker'),\n        };\n    }\n}\n";

describe ('rust venue Dict row lent from a declared Dict endpoint result', () => {
    let output = '';
    let root = '';
    beforeAll (() => {
        root = fs.mkdtempSync (path.join (os.tmpdir (), 'h50x04-'));
        fs.mkdirSync (path.join (root, 'ts', 'src', 'base'), { recursive: true });
        fs.mkdirSync (path.join (root, 'ts', 'src', 'abstract'), { recursive: true });
        fs.writeFileSync (path.join (root, 'ts', 'src', 'base', 'Exchange.ts'), base);
        fs.writeFileSync (path.join (root, 'ts', 'src', 'abstract', 'venue.ts'), abstract);
        fs.writeFileSync (path.join (root, 'ts', 'src', 'venue.ts'), venue);
        const t = new Transpiler ({ 'verbose': false, 'rust': { 'parser': { 'NUM_LINES_END_FILE': 0 } } } as any);
        output = t.transpileRustByPath (path.join (root, 'ts', 'src', 'venue.ts')).content;
    });
    afterAll (() => fs.rmSync (root, { recursive: true, force: true }));

    test ('a declared Dict endpoint local lends the row', () => {
        expect (output).toMatch (/fn parse_?[fF]ee\(&self, fee: &crate::value::Dict/);
    });

    test ('the caller lends the endpoint local by reference', () => {
        expect (output).toMatch (/self\.parse_?[fF]ee\(&response\)/);
    });

    test ('a slot also fed by a boxed caller parameter keeps the Value slot', () => {
        const m = output.match (/fn parse_?[fF]ees\(&self, response: ([^,)]+)/);
        const slot = output.match (/fn parse_?[fF]ee2\(&self, fee: ([^,)]+)/);
        expect (m !== null && slot !== null).toBe (true);
        // a row slot also fed by another method's parameter stays boxed
        expect (slot[1]).not.toMatch (/Dict|IndexMap/);
    });

    test ('an endpoint declared any keeps the Value slot', () => {
        expect (output).not.toMatch (/fn parse_?[rR]aw\(&self, fee: &crate::value::Dict/);
    });
});
