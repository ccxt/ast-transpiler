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
    '}',
    '',
].join('\n');

const src = (bucketDecl: string, bucketSrc: string, write = "previousOrder['fee'] = fee;") => [
    "import Exchange, { Dict, Str } from '../base/Exchange.js';",
    'export default class venue extends Exchange {',
    '    handleOrder (symbol: Str, orderId: Str, fee: any) {',
    '        const orders = this.orders;',
    `        ${bucketDecl} previousOrders = this.safeDict (${bucketSrc}, symbol, {});`,
    '        const previousOrder = this.safeDict (previousOrders, orderId);',
    '        if (previousOrder !== undefined) {',
    `            ${write}`,
    '            orders.append (previousOrder);',
    '        }',
    '    }',
    '}',
    '',
].join('\n');

describe('a row read by key out of a ws cache bucket is written natively', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'h16r03-'));
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
    test('const bucket from cache.hashmap: native insert on the row', () => {
        const out = run('venue', src('const', 'orders.hashmap'));
        expect(out).not.toMatch(/add_element_to_object\(&mut previousOrder\b/);
        expect(out).toMatch(/make_mut\([^)]*\)\.insert\("fee"/);
    });
    test('negative: a let bucket keeps the helper', () => {
        const out = run('venue2', src('let', 'orders.hashmap'));
        expect(out).toMatch(/add_element_to_object\(&mut previousOrder\b/);
    });
    test('negative: a bucket not read from hashmap keeps the helper', () => {
        const out = run('venue3', src('const', 'orders.subscriptions'));
        expect(out).toMatch(/add_element_to_object\(&mut previousOrder\b/);
    });
    test('negative: a dynamic key write keeps the helper', () => {
        const out = run('venue4', src('const', 'orders.hashmap', 'previousOrder[symbol] = fee;'));
        expect(out).toMatch(/add_element_to_object\(&mut previousOrder\b/);
    });
    test('field push and nested write on the row go through the map entry', () => {
        const out = run('venue5', src('const', 'orders.hashmap', "previousOrder['trades'].push (fee);\n            previousOrder['fee']['cost'] = fee;"));
        expect(out).not.toMatch(/append_to_object_array\(&mut previousOrder\b/);
        expect(out).not.toMatch(/get_value_mut\(&mut previousOrder\b/);
        expect(out).toContain('if let Some(__d) = &mut previousOrder { if let Value::Arr(__a) = std::sync::Arc::make_mut(__d).entry("trades".to_string()).or_insert_with(|| Value::Array(Vec::new()))');
        expect(out).toContain('if let Some(__d) = &mut previousOrder { add_element_to_object(std::sync::Arc::make_mut(__d).entry("fee".to_string()).or_insert(Value::Null), &Value::Str("cost".into()), fee); }');
    });
    test('negative: a whole rewrite of the row with another value keeps the helper', () => {
        const out = run('venue6', src('const', 'orders.hashmap', "previousOrder['fee'] = fee;\n            previousOrder = {};").replace('const previousOrder', 'let previousOrder'));
        expect(out).toMatch(/add_element_to_object\(&mut previousOrder\b/);
    });
    test('negative: the nullable row handed whole to a this. method that tests it keeps the null apart', () => {
        const text = src('const', 'orders.hashmap').replace('orders.append (previousOrder);', 'this.check (previousOrder);')
            .replace('export default class venue extends Exchange {', 'export default class venue extends Exchange {\n    check (o: any) { return o === undefined; }');
        const out = run('venue7', text);
        expect(out).not.toMatch(/let mut previousOrder: crate::value::Dict\b/);
    });
});
