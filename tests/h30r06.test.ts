import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Transpiler } from '../src/transpiler';

jest.mock('module', () => ({ __esModule: true, default: jest.fn() }));

describe('rust cache-row fee writes: row[fee][k] / row[fees][i][k] print a native insert', () => {
    const BASE = [
        'export default class Exchange {',
        '    orders: any = undefined;',
        '    safeList (d: any, k: any, def: any = undefined): any[] { return d[k] ?? def; }',
        '    safeDict (d: any, k: any, def: any = undefined): any { return d[k] ?? def; }',
        '    safeString (d: any, k: any, def: any = undefined): any { return d[k] ?? def; }',
        '    sum (a: any, b: any): any { return a; }',
        '    touch (x: any): any { return x; }',
        '}',
        '',
    ].join('\n');
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'h30r06-'));
    afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));
    fs.mkdirSync(path.join(tmp, 'ts', 'src', 'pro', 'base'), { recursive: true });
    fs.mkdirSync(path.join(tmp, 'ts', 'src', 'base'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'ts', 'src', 'base', 'Exchange.ts'), BASE);
    const run = (name: string, body: string) => {
        const text = [
            "import Exchange from '../base/Exchange.js';",
            'export default class venue extends Exchange {',
            '    handle (symbol: string, orderId: string, tradeFee: any, cost: any) {',
            '        const cachedOrders = this.orders;',
            '        const orders = this.safeDict (cachedOrders.hashmap, symbol, {});',
            '        const order = this.safeDict (orders, orderId);',
            '        if (order !== undefined) {',
            ...body.split('\n').map((l) => '            ' + l),
            '        }',
            '    }',
            '}',
            '',
        ].join('\n');
        const t = new Transpiler({ verbose: false, rust: { parser: { NUM_LINES_END_FILE: 0 } } });
        const file = path.join(tmp, 'ts', 'src', 'pro', name + '.ts');
        fs.writeFileSync(file, text);
        return t.transpileRustByPath(file).content;
    };
    const FEE = 'if let Value::Dict(__f) = std::sync::Arc::make_mut(__d).entry("fee".to_string()).or_insert(Value::Null) { std::sync::Arc::make_mut(__f).insert("cost".into(), ';
    const FEES = 'if let Value::Arr(__a) = std::sync::Arc::make_mut(__d).entry("fees".to_string()).or_insert(Value::Null) { if let Some(Value::Dict(__f)) = std::sync::Arc::make_mut(__a).get_mut(i as usize) { std::sync::Arc::make_mut(__f).insert("cost".into(), ';
    const LOOP = (inner: string) => ['const fees = this.safeList (order, \'fees\', []);', 'for (let i = 0; i < fees.length; i++) {', inner, '}'].join('\n');
    test('row[fee][cost] = v: native insert on the fee map (fails on the base printer)', () => {
        const out = run('venueA', 'order[\'fee\'][\'cost\'] = this.sum (cost, cost);');
        expect(out).toContain(FEE);
        expect(out).not.toMatch(/add_element_to_object\([^\n]*"fee"/);
    });
    test('row[fees][i][cost] = v in a loop over safeList (row, fees, []): native in-bounds insert (fails on the base printer)', () => {
        const out = run('venueB', LOOP('    order[\'fees\'][i][\'cost\'] = this.sum (cost, cost);\n    break;'));
        expect(out).toContain(FEES);
        expect(out).not.toMatch(/add_element_to_object\([^\n]*"fees"/);
    });
    test('negative: index not bounded by a copy of the same row list keeps the helper', () => {
        const out = run('venueC', ['const other = this.safeList (tradeFee, \'fees\', []);', 'for (let i = 0; i < other.length; i++) {', '    order[\'fees\'][i][\'cost\'] = cost;', '}'].join('\n'));
        expect(out).not.toContain(FEES);
        expect(out).toMatch(/add_element_to_object\(get_value_mut\([^\n]*"fees"/);
    });
    test('negative: the row list is replaced inside the loop, so the slot may be out of bounds: helper kept', () => {
        const out = run('venueD', LOOP('    order[\'fees\'][i][\'cost\'] = cost;\n    order[\'fees\'] = [];'));
        expect(out).not.toContain(FEES);
    });
    test('negative: the row is handed to a callee that may write it: helper kept', () => {
        const out = run('venueE', LOOP('    this.touch (order);\n    order[\'fees\'][i][\'cost\'] = cost;'));
        expect(out).not.toContain(FEES);
    });
    test('negative: a book-meta last key keeps the helper', () => {
        const out = run('venueF', 'order[\'fee\'][\'timestamp\'] = cost;');
        expect(out).not.toContain('insert("timestamp".into()');
    });
});
