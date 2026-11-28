import { Transpiler } from '../src/transpiler';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// a venue-private `market: Dict` slot fed by an inline `safeDict (list, i, {})` read borrows the map
const base = 'export interface Dict { [key: string]: any }\nexport type Str = string | undefined;\nexport type List = any[];\n' +
    'export default class Exchange {\n    options: Dict = {};\n    safeString (o: any, k: any, d: Str = undefined): Str { return o; }\n' +
    '    safeDict (o: any, k: any, d: Dict = undefined): Dict { return o; }\n' +
    '    safeList (o: any, k: any, d: List = undefined): List { return o; }\n' +
    '    extend (...args: any[]): any { return args[0]; }\n    hold (x: any): any { return x; }\n}\n';
const api = "import Exchange from '../base/Exchange.js';\nexport default abstract class venueApi extends Exchange {\n}\n";
const venue = "import venueApi from './abstract/venue.js';\nimport type { Dict } from './base/Exchange.js';\n" +
    'export default class venue extends venueApi {\n' +
    "    fetchRows (response: Dict) {\n        const data: Dict[] = this.safeList (response, 'products', []);\n        const result = [];\n        for (let i = 0; i < data.length; i++) {\n            const row = this.parseSpotRow (this.safeDict (data, i, {}), response);\n            if (row !== undefined) {\n                result.push (row);\n            }\n        }\n        return result;\n    }\n" +
    "    parseSpotRow (market: Dict, feeTier: Dict): Dict {\n        const id = this.safeString (market, 'product_id');\n        if (id === undefined) {\n            return undefined;\n        }\n        return { 'id': id, 'fee': this.safeString (feeTier, 'fee'), 'info': market };\n    }\n" +
    "    fetchLoose (response: Dict) {\n        const data = this.safeList (response, 'products', []);\n        const result = [];\n        for (let i = 0; i < data.length; i++) {\n            result.push (this.parseLooseRow (this.safeDict (data, i), response));\n        }\n        return result;\n    }\n" +
    "    parseLooseRow (market: Dict, feeTier: Dict): Dict {\n        return { 'id': this.safeString (market, 'product_id'), 'info': market };\n    }\n" +
    "    fetchExtended (response: Dict) {\n        const data = this.safeList (response, 'products', []);\n        const result = [];\n        for (let i = 0; i < data.length; i++) {\n            const m = data[i];\n            result.push (this.parseExtRow (this.extend (m, { 'k': 1 })));\n        }\n        return result;\n    }\n" +
    "    parseExtRow (market: Dict): Dict {\n        return { 'id': this.safeString (market, 'product_id'), 'info': market };\n    }\n}\n";

jest.mock ('module', () => ({ __esModule: true, default: jest.fn () }));

describe ('rust venue dict slot: an inline safeDict read with an empty-map default lends a borrowed dict', () => {
    let output = '';
    let root = '';
    beforeAll (() => {
        root = fs.mkdtempSync (path.join (os.tmpdir (), 'h50r08-'));
        fs.mkdirSync (path.join (root, 'ts', 'src', 'base'), { recursive: true });
        fs.writeFileSync (path.join (root, 'ts', 'src', 'base', 'Exchange.ts'), base);
        fs.mkdirSync (path.join (root, 'ts', 'src', 'abstract'), { recursive: true });
        fs.writeFileSync (path.join (root, 'ts', 'src', 'abstract', 'venue.ts'), api);
        fs.writeFileSync (path.join (root, 'ts', 'src', 'venue.ts'), venue);
        const t = new Transpiler ({ 'verbose': false, 'rust': { 'parser': { 'NUM_LINES_END_FILE': 0 } } } as any);
        output = t.transpileRustByPath (path.join (root, 'ts', 'src', 'venue.ts')).content;
    });
    afterAll (() => fs.rmSync (root, { recursive: true, force: true }));

    test ('negative: a safeDict read with no default (undefined for a non-map row) keeps the boxed slot', () => {
        expect (output).toMatch (/fn parseLooseRow\(&self, market: Value/);
    });
    test ('negative: an extend of a boxed loop row keeps the boxed slot', () => {
        expect (output).toMatch (/fn parseExtRow\(&self, market: Value/);
    });
});
