import { Transpiler } from '../src/transpiler';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// A venue `Dict` parameter stored whole as its last use (`'info': ticker`) takes the dict handle: the entry shares it
const base = 'export interface Dict { [key: string]: any }\nexport type Str = string | undefined;\n' +
    'export default class Exchange {\n    safeString (o: any, k: any, d: Str = undefined): Str { return o; }\n' +
    '    safeDict (o: any, k: any, d: Dict = undefined): Dict | undefined { return o; }\n    safeTicker (t: Dict): Dict { return t; }\n    hold (x: any): any { return x; }\n}\n';
const venue = "import Exchange from './base/Exchange.js';\nimport type { Dict, Str } from './base/Exchange.js';\n" +
    'export default class venue extends Exchange {\n' +
    "    parseWsTicker (ticker: Dict): Dict {\n        const last = this.safeString (ticker, 'last');\n        return this.safeTicker ({ 'last': last, 'info': ticker });\n    }\n" +
    "    keepTicker (ticker: Dict): Dict {\n        return ticker;\n    }\n" +
    "    run (message: Dict, raw: any) {\n        const data = this.safeDict (message, 'data', {});\n        const a = this.parseWsTicker (data);\n" +
    "        const b = this.keepTicker (data);\n        return this.hold ([ a, b ]);\n    }\n" +
    "    parseOther (row: Dict): Dict {\n        return this.safeTicker ({ 'info': row });\n    }\n" +
    "    runOther (raw: any) {\n        return this.hold (this.parseOther (raw['x']));\n    }\n}\n";

describe ('rust venue Dict parameter stored as a last-use entry (h44r16)', () => {
    let output = '';
    let root = '';
    beforeAll (() => {
        root = fs.mkdtempSync (path.join (os.tmpdir (), 'h44r16-'));
        fs.mkdirSync (path.join (root, 'ts', 'src', 'base'), { recursive: true });
        fs.writeFileSync (path.join (root, 'ts', 'src', 'base', 'Exchange.ts'), base);
        fs.writeFileSync (path.join (root, 'ts', 'src', 'venue.ts'), venue);
        const t = new Transpiler ({ 'verbose': false, 'rust': { 'parser': { 'NUM_LINES_END_FILE': 0 } } } as any);
        output = t.transpileRustByPath (path.join (root, 'ts', 'src', 'venue.ts')).content;
    });
    afterAll (() => fs.rmSync (root, { recursive: true, force: true }));

    test ('the slot takes the dict handle and the entry shares it', () => {
        expect (output).toContain ('pub fn parseWsTicker(&self, ticker: &crate::value::Dict)');
        expect (output).toMatch (/"info"[^\n]*Value::from\(ticker\)/);
        expect (output).not.toMatch (/Value::Dict\(ticker\.clone\(\)\)/);
        expect (output).toMatch (/self\.parseWsTicker\(&data\)/);
    });

    test ('negatives keep the Value slot', () => {
        // returned whole
        expect (output).not.toContain ('pub fn keepTicker(&self, ticker: &crate::value::Dict');
        // a caller hands an element read of an untyped value (may be null or another kind)
        expect (output).not.toContain ('pub fn parseOther(&self, row: &crate::value::Dict');
    });
});
