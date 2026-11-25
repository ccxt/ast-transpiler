import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Transpiler } from '../src/transpiler.js';

jest.mock ('module', () => ({ __esModule: true, default: jest.fn () }));

const base = [
    'export interface Dict { [key: string]: any }',
    'export type Str = string | undefined;',
    'export type Int = number | undefined;',
    'export interface MarketInterface { symbol: string; [key: string]: any }',
    'export type Market = MarketInterface | undefined;',
    'export default class Exchange {',
    '    safeString (o: any, k: any, d: Str = undefined): Str { return o; }',
    '    safeInteger (o: any, k: any, d: Int = undefined): Int { return o; }',
    '}',
    '',
].join ('\n');
const venue = (body: string) => [
    'import Exchange from \'./base/Exchange.js\';',
    'import type { Dict, Market, Str, Int } from \'./base/Exchange.js\';',
    'export default class phemex extends Exchange {',
    '    fromEn (en: Str, scale: Int): Str {',
    '        if (en === undefined || scale === undefined) {',
    '            return undefined;',
    '        }',
    '        return en + \'x\';',
    '    }',
    '    fromEp (ep: Str, market: Market = undefined): Str {',
    '        if ((ep === undefined) || (market === undefined)) {',
    '            return ep;',
    '        }',
    '        return this.fromEn (ep, this.safeInteger (market, \'priceScale\'));',
    '    }',
    body,
    '}',
    '',
].join ('\n');
const root = fs.mkdtempSync (path.join (os.tmpdir (), 'h50g01-'));
let n = 0;
const emit = (body: string): string => {
    const dir = path.join (root, String (n++));
    fs.mkdirSync (path.join (dir, 'ts/src/base'), { recursive: true });
    fs.writeFileSync (path.join (dir, 'ts/src/base/Exchange.ts'), base);
    fs.writeFileSync (path.join (dir, 'ts/src/phemex.ts'), venue (body));
    const out = new Transpiler ({ 'verbose': false, 'rust': { 'parser': { 'NUM_LINES_END_FILE': 0 } } }).transpileRustByPath (path.join (dir, 'ts/src/phemex.ts')).content;
    return out.slice (out.indexOf ('fn parseIt'));
};

describe ('a nil Str local written from a base reader and from a pass-through venue helper', () => {
    test ('the reader write keeps the local Option<String>', () => {
        const out = emit ([
            '    parseIt (trade: any[], market: Market = undefined): Dict {',
            '        let price: Str;',
            '        const n = trade.length;',
            '        price = this.safeString (trade, n - 2);',
            '        if (typeof trade[0] === \'number\') {',
            '            price = this.fromEp (this.safeString (trade, n - 2), market);',
            '        }',
            '        return { \'price\': price };',
            '    }',
        ].join ('\n'));
        expect (out).toContain ('let mut price: Option<String> = None;');
        expect (out).not.toContain ('let mut price: Value');
    });
    test ('a local written only from the helper and boxed straight back stays Value', () => {
        const out = emit ([
            '    parseIt (trade: any[], market: Market = undefined): Dict {',
            '        let price: Str;',
            '        if (typeof trade[0] === \'number\') {',
            '            price = this.fromEp (this.safeString (trade, 1), market);',
            '        }',
            '        return { \'price\': price };',
            '    }',
        ].join ('\n'));
        expect (out).toContain ('let mut price: Value');
    });
    test ('a missing key: the reader write is the `_opt` twin, None for a missing index', () => {
        const out = emit ([
            '    parseIt (trade: any[], market: Market = undefined): Dict {',
            '        let price: Str;',
            '        price = this.safeString (trade, 5);',
            '        if (market !== undefined) {',
            '            price = this.fromEp (this.safeString (trade, 5), market);',
            '        }',
            '        return { \'price\': price };',
            '    }',
        ].join ('\n'));
        expect (out).toContain ('safe_string_opt(');
    });
});
