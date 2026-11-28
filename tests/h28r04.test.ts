import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Transpiler } from '../src/transpiler';

jest.mock('module', () => ({ __esModule: true, default: jest.fn() }));

describe('rust slot write on the last row of a grow-only list of fixed-length array rows', () => {
    const BASE = [
        'export default class Exchange {',
        '    safeList (d: any, k: any, def: any = undefined): any[] { return d[k] ?? def; }',
        '    safeValue (d: any, k: any, def: any = undefined): any { return d[k] ?? def; }',
        '}',
        '',
    ].join('\n');
    const src = (body: string) => [
        "import Exchange from './base/Exchange.js';",
        'export default class venue extends Exchange {',
        '    build (trades: any[], other: any) {',
        '        const rows = [];',
        '        const i_close = 4;',
        '        for (let i = 0; i < trades.length; i++) {',
        '            const price = trades[i];',
        '            const n = rows.length;',
        '            const candle = n - 1;',
        '            if (candle === -1) {',
        '                rows.push ([ 1, price, price, price, price, 0, 1 ]);',
        '            } else {',
        '                const prev = this.safeList (rows, candle);',
        `                ${body}`,
        '            }',
        '        }',
        '        return rows;',
        '    }',
        '}',
        '',
    ].join('\n');
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'h28r04-'));
    afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));
    fs.mkdirSync(path.join(tmp, 'ts', 'src', 'base'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'ts', 'src', 'base', 'Exchange.ts'), BASE);
    const run = (name: string, text: string) => {
        const t = new Transpiler({ verbose: false, rust: { parser: { NUM_LINES_END_FILE: 0 } } });
        const file = path.join(tmp, 'ts', 'src', name + '.ts');
        fs.writeFileSync(file, text);
        return t.transpileRustByPath(file).content;
    };
    const HELPER = 'add_element_to_object(get_value_mut(&mut rows';
    test('slot write on the last row is a native in-bounds store (fails on the base printer)', () => {
        const out = run('venueA', src('rows[candle][i_close] = price;'));
        expect(out).not.toContain(HELPER);
        expect(out).toContain('if let (Value::Arr(__a), Value::Int(__c)) = (&mut rows, &candle) { if let Some(Value::Arr(__r)) = std::sync::Arc::make_mut(__a).get_mut(*__c as usize) { std::sync::Arc::make_mut(__r)[4] = ');
    });
    test('negative: a slot past the pushed row length keeps the helper', () => {
        const out = run('venueB', src('rows[candle][7] = price;'));
        expect(out).toContain(HELPER);
        expect(out).not.toContain('make_mut(__r)[7]');
    });
    test('negative: a whole-row write (value not of the row shape) keeps the helper', () => {
        const out = run('venueC', src('rows[candle] = other; rows[candle][i_close] = price;'));
        expect(out).not.toContain('make_mut(__r)[4]');
    });
    test('negative: a row index that is not length - 1 keeps the helper', () => {
        const out = run('venueD', src('rows[i][i_close] = price;'));
        expect(out).toContain(HELPER);
        expect(out).not.toContain('make_mut(__r)[4]');
    });
    test('negative: the list handed to a callee that may write it keeps the helper', () => {
        const out = run('venueE', src('rows[candle][i_close] = price; other.mutate (rows);'));
        expect(out).toContain(HELPER);
    });
});
