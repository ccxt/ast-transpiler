import { Transpiler } from '../src/transpiler';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

jest.mock('module', () => ({ __esModule: true, default: jest.fn() }));

const BASE = [
    'export interface Dict { [key: string]: any }',
    'export type Str = string | undefined;',
    'export default class Exchange {',
    '    orders: any = undefined;',
    '    safeDict (d: any, k: any, def: Dict = undefined): Dict { return d[k] ?? def; }',
    '    safeList (d: any, k: any, def: any[] = undefined): any[] { return d[k] ?? def; }',
    '}',
    '',
].join('\n');

const src = (storeBack: string, bucketDecl = 'const') => [
    "import Exchange, { Dict, Str } from '../base/Exchange.js';",
    'export default class venue extends Exchange {',
    '    handleTrade (symbol: Str, orderId: Str, trade: Dict, tradeFee: Dict) {',
    '        const cachedOrders = this.orders;',
    '        if (cachedOrders !== undefined) {',
    `            ${bucketDecl} orders = this.safeDict (cachedOrders.hashmap, symbol, {});`,
    '            const others = this.safeDict (cachedOrders.hashmap, orderId, {});',
    '            const order = this.safeDict (orders, orderId);',
    '            if (order !== undefined) {',
    "                order['fee'] = tradeFee;",
    "                const orderTrades = this.safeList (order, 'trades', []);",
    '                orderTrades.push (trade);',
    "                order['trades'] = orderTrades;",
    `                ${storeBack}`,
    '            }',
    '        }',
    '    }',
    '}',
    '',
].join('\n');

describe('a cache-bucket row stored back into its own bucket stays typed', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'h19r01-'));
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
    test('row stored back into its own bucket: typed row, one box at the store', () => {
        const out = run('venueA', src('orders[orderId] = order;'));
        expect(out).not.toMatch(/add_element_to_object\(&mut order\b/);
        expect(out).toMatch(/let mut order: Option<crate::value::Dict>/);
        expect(out).toContain('add_element_to_object(&mut orders, &orderId, order.map_or(Value::Null, Value::Dict));');
    });
    test('negative: stored into another bucket keeps the helper', () => {
        const out = run('venueB', src('others[orderId] = order;'));
        expect(out).toMatch(/add_element_to_object\(&mut order\b/);
    });
    test('negative: a let bucket keeps the helper', () => {
        const out = run('venueC', src('orders[orderId] = order;', 'let'));
        expect(out).toMatch(/add_element_to_object\(&mut order\b/);
    });
});
