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

describe('a cache-bucket row read through a nested literal key stays typed', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'h17r02-'));
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
    test('nested literal read on the row: typed row, first hop through KeyRead', () => {
        const out = run('venue', src('const', 'orders.hashmap', "previousOrder['fee'] = fee;\n            if (previousOrder['fee']['cost'] !== undefined) {\n                previousOrder['fee']['cost'] = fee;\n            }"));
        expect(out).not.toMatch(/add_element_to_object\(&mut previousOrder\b/);
        expect(out).toContain('crate::value::get_value_k(&crate::value::KeyRead::key_read(&&previousOrder, "fee"), "cost")');
        expect(out).toMatch(/let mut previousOrder: Option<crate::value::Dict>/);
    });
    test('negative: a nested read with a dynamic inner key keeps the helper', () => {
        const out = run('venue2', src('const', 'orders.hashmap', "previousOrder['fee'] = fee;\n            if (previousOrder['fee']['cost'] !== undefined) {\n                previousOrder['fee']['cost'] = fee;\n            }".replace("['fee']['cost'] !==", "['fee'][symbol] !==")));
        expect(out).toMatch(/add_element_to_object\(&mut previousOrder\b/);
    });
    test('negative: a whole rewrite of the row with another value keeps the helper', () => {
        const out = run('venue5', src('const', 'orders.hashmap', "previousOrder['fee'] = fee;\\n            if (previousOrder['fee']['cost'] !== undefined) {\\n                previousOrder['fee']['cost'] = fee;\\n            }\\n            previousOrder = {};").replace('const previousOrder', 'let previousOrder'));
        expect(out).toMatch(/add_element_to_object\(&mut previousOrder\b/);
    });
    test('negative: a let bucket keeps the helper on a nested read', () => {
        const out = run('venue3', src('let', 'orders.hashmap', "previousOrder['fee'] = fee;\n            if (previousOrder['fee']['cost'] !== undefined) {\n                previousOrder['fee']['cost'] = fee;\n            }"));
        expect(out).toMatch(/add_element_to_object\(&mut previousOrder\b/);
    });
    test('nullable row handed to a this. method that tests it arrives as Null for None', () => {
        const text = src('const', 'orders.hashmap', "previousOrder['fee'] = fee;\n            if (previousOrder['fee']['cost'] !== undefined) {\n                previousOrder['fee']['cost'] = fee;\n            }").replace('orders.append (previousOrder);', 'this.check (previousOrder);')
            .replace('export default class venue extends Exchange {', 'export default class venue extends Exchange {\n    check (o: any) { return o === undefined; }');
        const out = run('venue4', text);
        expect(out).toMatch(/self\.check\(&previousOrder\)|self\.check\(previousOrder(?:\.clone\(\))?\)/);
        expect(out).not.toMatch(/self\.check\(previousOrder\.unwrap/);
    });
});
