import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Transpiler } from '../src/transpiler.js';

jest.mock ('module', () => ({ __esModule: true, default: jest.fn () }));

const base = [
    'export interface Dict { [key: string]: any }',
    'export type Market = Dict;',
    'export default class Exchange {',
    '    urls: Dict = {};',
    '    safeString (o: any, k: any, d: string = undefined): string | undefined { return o; }',
    '    safeValue (o: any, k: any, d: any = undefined): any { return o; }',
    '    market (s: string): Market { return {}; }',
    '    // METHODS BELOW THIS LINE ARE TRANSPILED FROM TYPESCRIPT',
    '    safeBool (o: any, k: any, d: boolean = undefined): boolean | undefined { const v = this.safeValue (o, k, d); return v; }',
    '}',
    '',
].join ('\n');
const root = fs.mkdtempSync (path.join (os.tmpdir (), 'h38p26-'));
afterAll (() => fs.rmSync (root, { recursive: true, force: true }));
let seq = 0;
const rust = (body: string) => {
    const dir = path.join (root, 'v' + (seq++));
    fs.mkdirSync (path.join (dir, 'ts/src/base'), { recursive: true });
    fs.mkdirSync (path.join (dir, 'ts/src/pro'), { recursive: true });
    fs.writeFileSync (path.join (dir, 'ts/src/base/Exchange.ts'), base);
    const file = path.join (dir, 'ts/src/pro/venue.ts');
    fs.writeFileSync (file, [
        "import Exchange from '../base/Exchange.js';",
        "import type { Dict, Market } from '../base/Exchange.js';",
        'export default class venue extends Exchange {',
        body,
        '}',
        '',
    ].join ('\n'));
    const t = new Transpiler ({ 'verbose': false, 'rust': { 'parser': { 'NUM_LINES_END_FILE': 0 } } });
    return t.transpileRustByPath (file).content as string;
};
const urlOf = [
    '    urlOf (market: any): string {',
    "        if (this.safeBool (market, 'contract', false)) {",
    "            return this.safeString (this.urls['api'][market['type']], 'usdt', '');",
    '        }',
    "        return this.safeString (this.urls['api'], market['type'], '');",
    '    }',
];

describe ('h38 P26 a venue method that only key-reads its market parameter takes impl KeyRead', () => {
    test ('positive: the signature is impl KeyRead and the literal reads go through KeyRead (fails on the base printer)', () => {
        const out = rust (urlOf.join ('\n'));
        expect (out).toContain ('pub fn urlOf(&self, market: impl KeyRead) -> ');
        expect (out).not.toContain ('let mut market: Value = market.into();');
        expect (out).toContain ('self.safeBool(&market, ');
        expect (out).toContain ('crate::value::KeyRead::key_read(&market, "type")');
    });

    test ('negative: a whole-value use of the parameter keeps the Value slot', () => {
        const out = rust ([ '    urlOf (market: any): any {', "        const t = market['type'];", '        return market;', '    }' ].join ('\n'));
        expect (out).not.toContain ('market: impl KeyRead');
    });

    test ('negative: a write into the parameter keeps the Value slot', () => {
        const out = rust ([ '    urlOf (market: any): any {', "        market['type'] = 'spot';", "        return this.safeString (market, 'type');", '    }' ].join ('\n'));
        expect (out).not.toContain ('market: impl KeyRead');
    });

    test ('negative: a parameter with a non-literal key read keeps the Value slot', () => {
        const out = rust ([ '    urlOf (market: any, k: string): any {', '        return market[k];', '    }' ].join ('\n'));
        expect (out).not.toContain ('market: impl KeyRead');
    });

    test ('negative: a method overriding a base method keeps the Value slot', () => {
        const out = rust ([ '    market (market: any): Market {', "        return this.safeValue (market, 'x');", '    }' ].join ('\n'));
        expect (out).not.toContain ('market: impl KeyRead');
    });
});
