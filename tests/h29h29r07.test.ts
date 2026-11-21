import { Transpiler } from '../src/transpiler';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

jest.mock('module', () => ({ __esModule: true, default: jest.fn() }));

const BASE = [
    'export interface Dict { [key: string]: any }',
    'export type Str = string | undefined;',
    'export type Bool = boolean | undefined;',
    'export default class Exchange {',
    '    id: string;',
    '    safeString (d: any, k: any, def: Str = undefined): Str { return d[k] ?? def; }',
    '    parseNumber (x: any, d: any = undefined): any { return x; }',
    '    sum (...a: any[]): any { return 0; }',
    '    milliseconds (): number { return 0; }',
    '    parse8601 (x: Str): any { return 0; }',
    '    convertExpireDate (x: Str): Str { return x; }',
    '    convertMarketIdExpireDate (x: Str): Str { return x; }',
    '    convertExpireDateToMarketIdDate (x: Str): Str { return x; }',
    '}',
    '',
].join('\n');


const src = (body: string) => [
    "import Exchange, { Dict, Str } from './base/Exchange.js';",
    'export default class venue extends Exchange {',
    '    mk (parts: string[], flag: boolean, a: any, b: any, c: any, d: any, e: any, f: any, g: any, h: any): Dict {',
    ...body.split('\n').map((l) => '        ' + l),
    '    }',
    '}',
    '',
].join('\n');

const run = (text: string) => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'h29r07-'));
    fs.mkdirSync(path.join(tmp, 'ts', 'src', 'base'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'ts', 'src', 'base', 'Exchange.ts'), BASE);
    const t = new Transpiler({ verbose: false, rust: { parser: { NUM_LINES_END_FILE: 0 } } });
    const file = path.join(tmp, 'ts', 'src', 'venue.ts');
    fs.writeFileSync(file, text);
    const out = t.transpileRustByPath(file).content;
    fs.rmSync(tmp, { recursive: true, force: true });
    return out;
};

let TAIL = "'-'";
// x is read in a concat that already prints past 400 chars with the `Value` operand
const body = (write: string, use: string) => [
    'let x: Str = undefined;',
    'if (flag) {',
    `    x = ${write};`,
    '}',
    'return {',
    `    'id': x + '-' + a + '-' + b + '-' + c + '-' + d + '-' + e + '-' + f + '-' + g + '-' + h + '-' + a + '-' + b + '-' + c + '-' + d + '-' + x + ${TAIL},`,
    `    'x': ${use},`,
    '};',
].join('\n');

// paradex createExpiredOptionMarket: the nil Str locals feed two `+` chains whose boxed form already prints past 400 chars
const PARADEX = "import Exchange, { Dict, Str, Bool } from './base/Exchange.js';\nclass BadSymbol extends Error {}\nexport default class venue extends Exchange {\n    override createExpiredOptionMarket (symbol: string): MarketInterface {\n        //\n        // an option leaves the market list once it expires, while fills, orders and positions still name it\n        //\n        //     id      NEAR-USD-30OCT26-5_6-C\n        //     symbol  NEAR/USD:USDC-261030-5.6-C\n        //\n        const parts = symbol.split ('-');\n        const partsLength = parts.length;\n        let base: Str = undefined;\n        let quote: Str = undefined;\n        let settle: Str = undefined;\n        let expiryDate: Str = undefined;\n        let strike: Str = undefined;\n        let optionType: Str = undefined;\n        if (symbol.indexOf ('/') > -1) {\n            if (partsLength !== 4) {\n                throw new BadSymbol (this.id + ' does not have market symbol ' + symbol);\n            }\n            const pair = parts[0];\n            const pairParts = pair.split ('/');\n            base = this.safeString (pairParts, 0);\n            const quoteAndSettle = this.safeString (pairParts, 1, '');\n            const quoteParts = quoteAndSettle.split (':');\n            quote = this.safeString (quoteParts, 0);\n            settle = this.safeString (quoteParts, 1, quote);\n            expiryDate = this.safeString (parts, 1);\n            strike = this.safeString (parts, 2);\n            optionType = this.safeString (parts, 3);\n        } else {\n            if (partsLength !== 5) {\n                throw new BadSymbol (this.id + ' does not have market symbol ' + symbol);\n            }\n            base = this.safeString (parts, 0);\n            quote = this.safeString (parts, 1);\n            settle = 'USDC'; // every option on the venue settles in USDC\n            expiryDate = this.convertMarketIdExpireDate (this.safeString (parts, 2));\n            const strikeId = parts[3];\n            strike = strikeId.replace ('_', '.');\n            optionType = this.safeString (parts, 4);\n        }\n        // the id carries the day without a leading zero, 6NOV26\n        let idDate = this.convertExpireDateToMarketIdDate (expiryDate) as string;\n        if (idDate.startsWith ('0')) {\n            idDate = idDate.slice (1);\n        }\n        // the id names the expiry day only, the hour depends on the underlying\n        const datetime = this.convertExpireDate (expiryDate);\n        const timestamp = this.parse8601 (datetime);\n        let active: Bool = undefined;\n        if ((timestamp !== undefined) && (this.sum (timestamp, 86400000) <= this.milliseconds ())) {\n            active = false;\n        }\n        let strikeInId = '';\n        if (strike !== undefined) {\n            strikeInId = strike.replace ('.', '_');\n        }\n        return {\n            'id': base + '-' + quote + '-' + idDate + '-' + strikeInId + '-' + optionType,\n            'symbol': base + '/' + quote + ':' + settle + '-' + expiryDate + '-' + strike + '-' + optionType,\n            'base': base,\n            'quote': quote,\n            'settle': settle,\n            'baseId': base,\n            'quoteId': quote,\n            'settleId': settle,\n            'active': active,\n            'type': 'option',\n            'subType': 'linear',\n            'linear': true,\n            'inverse': false,\n            'spot': false,\n            'swap': false,\n            'future': false,\n            'option': true,\n            'margin': false,\n            'contract': true,\n            'contractSize': this.parseNumber ('1'),\n            'expiry': timestamp,\n            'expiryDatetime': datetime,\n            'optionType': (optionType === 'C') ? 'call' : 'put',\n            'strike': this.parseNumber (strike),\n            'precision': {\n                'amount': undefined,\n                'price': undefined,\n            },\n            'limits': {\n                'amount': {\n                    'min': undefined,\n                    'max': undefined,\n                },\n                'price': {\n                    'min': undefined,\n                    'max': undefined,\n                },\n                'cost': {\n                    'min': undefined,\n                    'max': undefined,\n                },\n            },\n            'info': undefined,\n        } as MarketInterface;\n    }\n}\n";

describe('h29 R07: nil Str local as an operand of an over-budget concat', () => {
    test('positive (paradex): the concat operands become Option<String> locals read in place', () => {
        const out = run(PARADEX);
        for (const n of [ 'base', 'quote', 'settle', 'optionType' ]) expect(out).toContain(`let mut ${n}: Option<String> = None;`);
        expect(out).toContain('format!("{}{}{}{}{}{}{}{}{}{}{}", base.as_deref().unwrap_or("null"), "/", quote.as_deref().unwrap_or("null")');
    });
    test('negative (paradex): a non-string write to one operand keeps that local boxed', () => {
        const out = run(PARADEX.replace("settle = 'USDC';", 'settle = parts as any;'));
        expect(out).not.toContain('let mut settle: Option<String>');
    });
    test('regression: a concat within budget keeps its in-place read', () => {
        const out = run(src(body('this.safeString (parts, 0)', 'x')));
        expect(out).toContain('let mut x: Option<String> = None;');
        expect(out).toContain('x.as_deref().unwrap_or("null")');
    });
    test('negative: a write that is not a string keeps the Value local', () => {
        const out = run(src(body('parts', 'x')));
        expect(out).not.toContain('let mut x: Option<String>');
    });
    test('negative: a nil test the consumer relies on keeps the exact None answer', () => {
        const out = run(src(body('this.safeString (parts, 0)', "(x === undefined) ? 'none' : x")));
        expect(out).not.toContain('x.as_deref().unwrap_or("none")');
        if (out.includes('let mut x: Option<String>')) expect(out).toContain('x.is_none()');
    });
});
