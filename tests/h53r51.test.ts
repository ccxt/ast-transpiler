import { Transpiler } from '../src/transpiler';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';

jest.mock ('module', () => ({ __esModule: true, default: jest.fn () }));

// `this.safeDict (xs, i)` (no default) on a const local printed as a typed `List` in a pro / prediction file reads the
// element's map natively (`None` out of range or for a non-map); other receivers and tiers keep the reader.
// Inline fixtures, printed through relative paths as the farm prints them.
const base = "export interface Dict { [key: string]: any }\nexport type Str = string | undefined;\nexport default class Exchange {\n"
    + "    safeString (o: any, k: any, d: Str = undefined): Str { return o; }\n    safeValue (o: any, k: any, d: any = undefined): any { return o; }\n"
    + "    safeDict (dictionaryOrList: any, key: any, defaultValue: Dict = undefined): Dict | undefined {\n        const value = this.safeValue (dictionaryOrList, key, defaultValue);\n        return (typeof value === 'object') ? value : defaultValue;\n    }\n"
    + "    safeList (dictionaryOrList: any, key: any, defaultValue: any[] = undefined): any[] { return this.safeValue (dictionaryOrList, key, defaultValue); }\n"
    + "    keep (p: any): any { return p; }\n}\n";
const venue = (body: string): string => "import Exchange from '../base/Exchange.js';\nimport type { Dict } from '../base/Exchange.js';\nexport default class venue extends Exchange {\n" + body + "}\n";
const listRow = "    handleRows (message: Dict): any {\n        const data = this.safeList (message, 'data', []);\n        const out = [];\n        for (let i = 0; i < data.length; i++) {\n            const row = this.safeDict (data, i);\n            out.push (this.keep (row));\n        }\n        return out;\n    }\n";
const literalRow = "    topRow (raw: Dict): any {\n        const levels = this.safeList (raw, 'levels', []);\n        const rawBids = this.safeList (levels, 0, []);\n        const topBid = this.safeDict (rawBids, 0);\n        return (topBid !== undefined) ? this.safeString (topBid, 'px') : undefined;\n    }\n";
const defaulted = "    firstRow (message: Dict): any {\n        const dataList = this.safeList (message, 'data');\n        if (dataList !== undefined) {\n            const first = this.safeDict (dataList, 0, {});\n            return this.safeString (first, 'id');\n        }\n        return undefined;\n    }\n";
const nonLocal = "    pickRow (message: Dict, priceIndex: number): any {\n        const priceResponse = this.safeDict (this.keep (message), priceIndex);\n        return this.safeString (priceResponse, 'id');\n    }\n";

const run = (rel: string, body: string): string => {
    const root = fs.mkdtempSync (path.join (os.tmpdir (), 'h53r51-'));
    const cwd = process.cwd ();
    try {
        for (const dir of [ 'ts/src/base', 'ts/src/pro', 'ts/src/prediction' ]) fs.mkdirSync (path.join (root, dir), { recursive: true });
        fs.writeFileSync (path.join (root, 'ts/src/base/Exchange.ts'), base);
        const src = venue (body);
        fs.writeFileSync (path.join (root, rel), rel.split ('/').length === 3 ? src.replace (/'\.\.\/base\//g, "'./base/") : src);
        process.chdir (root);
        const t = new Transpiler ({ 'verbose': false, 'rust': { 'parser': { 'NUM_LINES_END_FILE': 0 } } } as any);
        return t.transpileRustByPath (rel).content;
    } finally {
        process.chdir (cwd);
        fs.rmSync (root, { recursive: true, force: true });
    }
};
const native = (x: string, at: string): string => '(match ' + x + '.get(' + at + ') { Some(Value::Dict(__m)) => Some(std::sync::Arc::clone(__m)), _ => None })';

describe ('rust: list-row safeDict on a typed List local in pro / prediction', () => {
    test ('pro: a counter row of a defaulted list local is native (fails on the base printer)', () => {
        const out = run ('ts/src/pro/venue.ts', listRow);
        expect (out).toContain (native ('data', 'i as usize'));
        expect (out).not.toMatch (/self\.safe(_d|D)ict\(&data/);
    });
    test ('prediction: a literal row of a typed List local is native', () => {
        expect (run ('ts/src/prediction/venue.ts', literalRow)).toContain (native ('rawBids', '0'));
    });
    test ('negative: a REST venue file is left to its own rule', () => {
        expect (run ('ts/src/venue.ts', listRow + literalRow)).not.toMatch (/\(match \w+\.get\([^)]*\) \{ Some\(Value::Dict\(__m\)\) => Some\(std::sync::Arc::clone\(__m\)\), _ => None \}\)/);
    });
    test ('negative: a defaulted row and a non-local receiver keep the reader', () => {
        expect (run ('ts/src/pro/venue.ts', defaulted)).not.toContain ('(match dataList.get(0) { Some(Value::Dict(__m))');
        expect (run ('ts/src/prediction/venue.ts', nonLocal)).not.toContain ('Some(Value::Dict(__m)) => Some(std::sync::Arc::clone(__m))');
    });
});
