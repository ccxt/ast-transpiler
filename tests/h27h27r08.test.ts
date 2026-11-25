import { Transpiler } from '../src/transpiler';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

jest.mock('module', () => ({ __esModule: true, default: jest.fn() }));

const BASE = [
    'export interface Dict { [key: string]: any }',
    'export type Str = string | undefined;',
    'export interface Trade { [key: string]: any }',
    'export class ArrayCache { append (x: any) { } }',
    'export default class Exchange {',
    '    myTrades: ArrayCache | undefined;',
    '    safeDict (d: any, k: any, def: Dict = undefined): Dict { return d[k] ?? def; }',
    '    safeString (d: any, k: any, def: Str = undefined): Str { return d[k] ?? def; }',
    '    safeTrade (t: Dict, market: any = undefined): Trade { return t; }',
    '    parseTrade (t: Dict, market: any = undefined): Trade { return t; }',
    '    parseWsTrade (t: Dict, market: any = undefined): Trade { throw new Error (\'x\'); }',
    '    hold (x: any): any { return x; }',
    '}',
    '',
].join('\n');

const src = (body: string, wsReturn = "return this.safeTrade ({ 'info': trade });") => [
    "import Exchange, { Dict, Trade } from '../base/Exchange.js';",
    'export default class venue extends Exchange {',
    '    handleMyTrade (client: any, message: Dict) {',
    "        const data = this.safeDict (message, 'data', {});",
    ...body.split('\n').map((l) => '        ' + l),
    '    }',
    '    parseWsTrade (trade: Dict, market: any = undefined): Trade {',
    '        ' + wsReturn,
    '    }',
    '}',
    '',
].join('\n');

const POS = [
    'let trade: Trade;',
    "if (this.safeString (data, 's') === 'spot') {",
    '    trade = this.parseWsTrade (data);',
    '} else {',
    '    trade = this.parseTrade (data);',
    '}',
    'let trades = this.myTrades;',
    'trades.append (trade);',
    "client.resolve (trades, 'h');",
].join('\n');

describe('h27-R08: nil record local written from a typed parseWs* override, handed to a cache append', () => {
    const tmp = fs.mkdtempSync(path.join(process.env.TMPDIR ?? os.tmpdir(), 'h27r08-'));
    afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));
    fs.mkdirSync(path.join(tmp, 'ts', 'src', 'base'), { recursive: true });
    fs.mkdirSync(path.join(tmp, 'ts', 'src', 'pro'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'ts', 'src', 'base', 'Exchange.ts'), BASE);
    const run = (name: string, text: string) => {
        const t = new Transpiler({ verbose: false, rust: { parser: { NUM_LINES_END_FILE: 0 } } });
        const file = path.join(tmp, 'ts', 'src', 'pro', name + '.ts');
        fs.writeFileSync(file, text);
        return t.transpileRustByPath(file).content;
    };
    test('parseWsTrade + parseTrade writes and a cache append type the local', () => {
        const out = run('venueA', src(POS));
        expect(out).toMatch(/let mut trade: Option<crate::value::Dict> = None/);
        expect(out).toMatch(/trade = Some\(self\.parseWsTrade\(/);
        expect(out).toMatch(/\.append\(trade\.map_or\(Value::Null, Value::Dict\)\)/);
    });
    test('negative: an override with a non-record return keeps the box', () => {
        const out = run('venueB', src(POS, 'return this.hold (trade);'));
        expect(out).toMatch(/let mut trade: Value = Value::Null/);
    });
    test('negative: a nil local read by a string reader keeps the box', () => {
        const out = run('venueC', src(POS + "\nconst s = this.safeString (trade, 'id');\nthis.hold (s);"));
        expect(out).toMatch(/let mut trade: Value = Value::Null/);
    });
    test('negative: append on a receiver that is not a ws cache keeps the box', () => {
        const out = run('venueD', src(POS.replace('let trades = this.myTrades;', 'let trades = this.hold (1);')));
        expect(out).toMatch(/let mut trade: Value = Value::Null/);
    });
});
