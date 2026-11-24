import { Transpiler } from '../src/transpiler';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';

jest.mock ('module', () => ({ __esModule: true, default: jest.fn () }));

// a venue-private `parseFundingHistories` declared `FundingHistory[]` whose every return is a static list returns `List`
const run = (body: string) => {
    const root = fs.mkdtempSync (path.join (os.tmpdir (), 'h48r07-'));
    fs.mkdirSync (path.join (root, 'ts/src/base'), { recursive: true });
    fs.writeFileSync (path.join (root, 'ts/src/base/Exchange.ts'), "export interface Dict { [key: string]: any }\nexport type List = any[];\nexport type Int = number | undefined;\nexport type Str = string | undefined;\nexport interface FundingHistory { info: any; symbol: string; timestamp?: number; }\nexport default class Exchange {\n    keep (p: any): any { return p; }\n    // METHODS BELOW THIS LINE ARE TRANSPILED FROM TYPESCRIPT\n    sortBy (array: any[], key: string): any[] { return array; }\n    filterBySinceLimit (array: object[] | undefined, since: Int = undefined, limit: Int = undefined): any[] { return array as any[]; }\n    filterBySymbolSinceLimit (array: object[] | undefined, symbol: Str = undefined, since: Int = undefined, limit: Int = undefined): any[] { return this.filterBySinceLimit (array, since, limit); }\n    parseFundingHistory (data: Dict, market: any = undefined): FundingHistory { return { 'info': data, 'symbol': '' }; }\n}\n");
    fs.writeFileSync (path.join (root, 'ts/src/venue.ts'), "import Exchange from './base/Exchange.js';\nimport type { Dict, List, FundingHistory } from './base/Exchange.js';\nexport default class venue extends Exchange {\n" + body + "}\n");
    const t = new Transpiler ({ 'verbose': false, 'rust': { 'parser': { 'NUM_LINES_END_FILE': 0 } } });
    try { return t.transpileRustByPath (path.join (root, 'ts/src/venue.ts')).content; } finally { fs.rmSync (root, { recursive: true, force: true }); }
};

describe ('rust venue-private FundingHistory[] return', () => {
    test ('every return the built list: `-> crate::value::List`', () => {
        const out = run ("    parseFundingHistories (contracts: Dict[], market: any = undefined, since: number = undefined, limit: number = undefined): FundingHistory[] {\n        const result: List = [];\n        for (let i = 0; i < contracts.length; i++) {\n            result.push (this.parseFundingHistory (contracts[i], market));\n        }\n        return result;\n    }\n");
        expect (out).toMatch (/fn parseFundingHistories\([^\n]*\) -> crate::value::List \{/);
    });
    test ('negative: a return of an any value (nil may come back) keeps Value', () => {
        const out = run ("    parseFundingHistories (contracts: Dict[], market: any = undefined): FundingHistory[] {\n        return this.keep (contracts);\n    }\n");
        expect (out).toMatch (/fn parseFundingHistories\([^\n]*\) -> Value \{/);
    });
    test ('negative: another record list (not listed) keeps Value', () => {
        const out = run ("    parseOtherHistories (contracts: Dict[], since: number = undefined): FundingHistory[][] {\n        return [ this.filterBySinceLimit (contracts, since) ];\n    }\n");
        expect (out).not.toMatch (/fn parseOtherHistories\([^\n]*\) -> crate::value::List \{/);
    });
    test ('real shape: the base filter answer (already a list) is returned as the List', () => {
        const out = run ("    parseFundingHistories (contracts: Dict[], market: any = undefined, since: number = undefined, limit: number = undefined): FundingHistory[] {\n        const result = [];\n        for (let i = 0; i < contracts.length; i++) {\n            result.push (this.parseFundingHistory (contracts[i], market));\n        }\n        const sorted = this.sortBy (result, 'timestamp');\n        return this.filterBySymbolSinceLimit (sorted, undefined, since, limit);\n    }\n");
        expect (out).toMatch (/fn parseFundingHistories\([^\n]*\) -> crate::value::List \{/);
    });
    test ('real shape with a cast: `filterBySinceLimit (..) as FundingHistory[]`', () => {
        const out = run ("    parseFundingHistories (contracts: Dict[], since: number = undefined, limit: number = undefined): FundingHistory[] {\n        return this.filterBySinceLimit (contracts, since, limit) as FundingHistory[];\n    }\n");
        expect (out).toMatch (/fn parseFundingHistories\([^\n]*\) -> crate::value::List \{/);
        expect (out).toMatch (/return self\.filterBySinceLimit\([^\n]*\)\.into_list\(\);/);
    });
    test ('negative: a base call returning Value (not a list filter) keeps Value', () => {
        const out = run ("    parseFundingHistories (contracts: Dict[], since: number = undefined): FundingHistory[] {\n        return this.sortBy (contracts, 'timestamp');\n    }\n");
        expect (out).toMatch (/fn parseFundingHistories\([^\n]*\) -> Value \{/);
    });
});
