import { Transpiler } from '../src/transpiler';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// a venue-private `parseTradingFees (response: Dict)` whose callers lend a typed dict borrows the map
const base = 'export interface Dict { [key: string]: any }\nexport type Str = string | undefined;\nexport type Bool = boolean | undefined;\n' +
    'export default class Exchange {\n    symbols: string[] = [];\n    safeString (o: any, k: any, d: Str = undefined): Str { return o; }\n' +
    '    safeDict (o: any, k: any, d: any = undefined): any { return o; }\n    safeBool (o: any, k: any, d: any = undefined): any { return o; }\n    safeNumber (o: any, k: any, d: any = undefined): any { return o; }\n    market (s: string): any { return s; }\n    safeMarket (s: Str): any { return s; }\n' +
    '    async privateGetFee (p: Dict = {}): Promise<any> { return p; }\n}\n';
const venue = "import Exchange from './base/Exchange.js';\nimport type { Dict, Str } from './base/Exchange.js';\n" +
    'export default class venue extends Exchange {\n' +
    "    async fetchTradingFees (params: Dict = {}): Promise<Dict> {\n        const response = await this.privateGetFee (params);\n        const data = this.safeDict (response, 'data', {});\n        return this.parseTradingFees (data);\n    }\n" +
    "    parseTradingFees (response: Dict): Dict {\n        const result: Dict = {};\n        const symbols = this.symbols;\n        for (let i = 0; i < symbols.length; i++) {\n            const symbol = symbols[i];\n            const market = this.market (symbol);\n            result[symbol] = this.parseTradingFee (response, market);\n        }\n        return result;\n    }\n" +
    "    parseTradingFee (info: Dict, market: any = undefined): Dict {\n        const gtDiscount = this.safeBool (info, 'gt_discount', false);\n        let taker: Str = 'taker_fee';\n        if (gtDiscount) {\n            taker = 'gt_taker_fee';\n        }\n        return {\n            'info': info,\n            'symbol': this.safeString (market, 'symbol'),\n            'taker': this.safeNumber (info, taker),\n        };\n    }\n" +
    "    keepRow (row: Dict): Dict {\n        row['x'] = 1;\n        return row;\n    }\n" +
    "    parseKept (response: Dict): Dict {\n        const s = this.safeString (response, 'a');\n        return this.keepRow (response);\n    }\n" +
    "    parseOther (response: Dict): Dict {\n        const data = this.safeDict (response, 'data', {});\n        return this.parseKept (data);\n    }\n" +
    "}\n";

// a cex-shaped slot: its own keys enumerated, each entry read by a variable key, the whole handed on
const cex = "import Exchange from './base/Exchange.js';\nimport type { Bool, Dict, Str } from './base/Exchange.js';\n" +
    'export default class cexv extends Exchange {\n' +
    "    async fetchTradingFees (params: Dict = {}): Promise<Dict> {\n        const response = await this.privateGetFee (params);\n        const data = this.safeDict (response, 'data', {});\n        const fees = this.safeDict (data, 'tradingFee', {});\n        return this.parseTradingFees (fees, true);\n    }\n" +
    "    parseTradingFees (response: Dict, useKeyAsId: Bool = false): Dict {\n        const result: Dict = {};\n        const keys = Object.keys (response);\n        for (let i = 0; i < keys.length; i++) {\n            const key = keys[i];\n            let market: any = undefined;\n            if (useKeyAsId) {\n                market = this.safeMarket (key);\n            }\n            const parsed = this.parseTradingFee (this.safeDict (response, key, {}), market);\n            const parsedSymbol = this.safeString (parsed, 'symbol');\n            if (parsedSymbol !== undefined) {\n                result[parsedSymbol] = parsed;\n            }\n        }\n        const symbols = this.symbols;\n        for (let i = 0; i < symbols.length; i++) {\n            const symbol = symbols[i];\n            if (!(symbol in result)) {\n                const market = this.market (symbol);\n                result[symbol] = this.parseTradingFee (response, market);\n            }\n        }\n        return result;\n    }\n" +
    "    parseTradingFee (info: Dict, market: any = undefined): Dict {\n        return {\n            'info': info,\n            'symbol': this.safeString (market, 'symbol'),\n            'taker': this.safeNumber (info, 'taker'),\n        };\n    }\n" +
    "}\n";

describe ('rust venue parseTradingFees response slot', () => {
    let output = '';
    let cexOutput = '';
    let root = '';
    beforeAll (() => {
        root = fs.mkdtempSync (path.join (os.tmpdir (), 'h47r26-'));
        fs.mkdirSync (path.join (root, 'ts', 'src', 'base'), { recursive: true });
        fs.writeFileSync (path.join (root, 'ts', 'src', 'base', 'Exchange.ts'), base);
        fs.writeFileSync (path.join (root, 'ts', 'src', 'venue.ts'), venue);
        // another venue declares its own copy, and its ws file calls that inherited copy
        fs.mkdirSync (path.join (root, 'ts', 'src', 'pro'), { recursive: true });
        fs.writeFileSync (path.join (root, 'ts', 'src', 'other.ts'), "import Exchange from './base/Exchange.js';\nimport type { Dict } from './base/Exchange.js';\nexport default class other extends Exchange {\n    parseTradingFees (fees: Dict): Dict {\n        return fees;\n    }\n}\n");
        fs.writeFileSync (path.join (root, 'ts', 'src', 'pro', 'other.ts'), "import otherRest from '../other.js';\nimport type { Dict } from '../base/Exchange.js';\nexport default class other extends otherRest {\n    handleFees (message: Dict): Dict {\n        return this.parseTradingFees (message);\n    }\n}\n");
        const t = new Transpiler ({ 'verbose': false, 'rust': { 'parser': { 'NUM_LINES_END_FILE': 0 } } } as any);
        output = t.transpileRustByPath (path.join (root, 'ts', 'src', 'venue.ts')).content;
        fs.writeFileSync (path.join (root, 'ts', 'src', 'cexv.ts'), cex);
        cexOutput = t.transpileRustByPath (path.join (root, 'ts', 'src', 'cexv.ts')).content;
        if (process.env.H49_DUMP) fs.writeFileSync (process.env.H49_DUMP, cexOutput);
    });
    afterAll (() => fs.rmSync (root, { recursive: true, force: true }));

    test ('the slot borrows the dict handle and boxes the same handle for a boxed sibling slot', () => {
        expect (output).toMatch (/fn parseTradingFees\(&self, response: &crate::value::Dict\)/);
        expect (output).toMatch (/self\.parseTradingFees\(&data\)/);
        expect (output).toMatch (/self\.parseTradingFee\(Value::from\(response\), /);
        expect (output).not.toMatch (/parseTradingFee\(response\.clone\(\)/);
    });

    test ('a slot handed to a callee that writes into it keeps the box', () => {
        expect (output).toMatch (/fn keepRow\(&self, mut row: Value\)|fn keepRow\(&self, row: Value\)|fn keepRow\(&self, row: impl Into<crate::Value>\)/);
        expect (output).not.toMatch (/fn parseKept\(&self, response: &/);
    });

    test ('an async method slot keeps its type', () => {
        expect (output).not.toMatch (/fn fetchTradingFees\([^)]*: &crate::value::Dict/);
    });
});
