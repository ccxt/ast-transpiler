import { Transpiler } from '../src/transpiler';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

jest.mock('module', () => ({ __esModule: true, default: jest.fn() }));

const BASE = [
    'export interface Dict { [key: string]: any }',
    'export type NullableDict = Dict | undefined;',
    'export type Str = string | undefined;',
    'export default class Exchange {',
    '    orders: any = undefined;',
    '    safeDict (d: any, k: any, def: Dict = undefined): Dict { return d[k] ?? def; }',
    '    safeString (d: any, k: any, def: Str = undefined): Str { return d[k] ?? def; }',
    '    safeOrder (o: Dict, m: any = undefined): Dict { return o; }',
    '    extend (...args: any[]): Dict { return {}; }',
    '}',
    '',
].join('\n');

const src = (ret: string, tail: string) => [
    "import Exchange, { Dict, NullableDict, Str } from '../base/Exchange.js';",
    'export default class venue extends Exchange {',
    '    handleOrderUpdate (symbol: Str, orderId: Str, data: Dict, remains: Str) {',
    '        const storedOrders = this.orders;',
    '        const ordersBySymbol = this.safeDict (storedOrders.hashmap, symbol, {});',
    '        let order = this.safeDict (ordersBySymbol, orderId);',
    '        if (order === undefined) {',
    '            order = this.parseWsOrderUpdate (data);',
    '            if (order === undefined) {',
    '                return;',
    '            }',
    '        }',
    "        order['remaining'] = remains;",
    "        order['status'] = 'closed';",
    `        ${tail}`,
    '    }',
    '',
    `    parseWsOrderUpdate (order: Dict): ${ret} {`,
    "        if (this.safeString (order, 'd') === undefined) {",
    '            return undefined;',
    '        }',
    "        return this.safeOrder ({ 'id': this.safeString (order, 'id') });",
    '    }',
    '}',
    '',
].join('\n');

describe('a cache row refilled from a NullableDict venue parser stays typed', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'h20r01-'));
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
    test('NullableDict parser: -> Option<Dict>, row typed, writes native', () => {
        const out = run('venueA', src('NullableDict', 'const parsed = this.safeOrder (this.extend (order, {}));'));
        expect(out).toContain('-> Option<crate::value::Dict>');
        expect(out).toContain('return None;');
        expect(out).not.toMatch(/add_element_to_object\(&mut order\b/);
        expect(out).toMatch(/let mut order: Option<crate::value::Dict>/);
        expect(out).toContain('if let Some(__d) = &mut order');
    });
    test('negative: an untyped parser keeps the helper', () => {
        const out = run('venueB', src('Dict', 'const parsed = this.safeOrder (this.extend (order, {}));'));
        expect(out).toMatch(/add_element_to_object\(&mut order\b/);
    });
});
