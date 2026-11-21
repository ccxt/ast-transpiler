import { Transpiler } from '../src/transpiler';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

jest.mock('module', () => ({ __esModule: true, default: jest.fn() }));

const BASE = [
    'export interface Dict { [key: string]: any }',
    'export type Str = string | undefined;',
    'export type List = any[];',
    'export default class Exchange {',
    '    safeValue (d: any, k: any, def: any = undefined): any { return d[k] ?? def; }',
    '    safeList (d: any, k: any, def: any[] = undefined): any[] | undefined { return d[k] ?? def; }',
    '    safeString (d: any, k: any, def: Str = undefined): Str { return d[k] ?? def; }',
    '}',
    '',
].join('\n');

const VENUE = [
    "import Exchange from './base/Exchange.js';",
    "import type { Dict, Str, List } from './base/Exchange.js';",
    'export default class venue extends Exchange {',
    '    rows (response: Dict) {',
    "        const rows: Dict[] = this.safeList (response, 'data', []);",
    '        const out: List = [];',
    '        for (let i = 0; i < rows.length; i++) {',
    '            const row = rows[i];',
    "            out.push (this.safeString (row, 'a'));",
    '        }',
    '        return out;',
    '    }',
    '    anyRows (response: Dict) {',
    "        const anyList: Dict[] = this.safeList (response, 'data', []);",
    '        const out: List = [];',
    '        for (let i = 0; i < anyList.length; i++) {',
    '            const anyEntry: any = anyList[i];',
    "            out.push ({ 'info': anyEntry, 'a': this.safeString (anyEntry, 'a') });",
    '        }',
    '        return out;',
    '    }',
    '    paged (response: Dict, linear: boolean) {',
    "        const data = this.safeValue (response, 'data');",
    '        const rates: List = [];',
    '        if (linear) {',
    "            const linearRows: Dict[] = this.safeList (response, 'data', []);",
    '            for (let i = 0; i < linearRows.length; i++) {',
    '                const linearEntry = linearRows[i];',
    "                rates.push ({ 'info': linearEntry, 'a': this.safeString (linearEntry, 'a') });",
    '            }',
    '        } else {',
    "            const cursor = this.safeValue (data, 'current_page');",
    "            const result: Dict[] = this.safeList (data, 'data', []);",
    '            for (let i = 0; i < result.length; i++) {',
    '                const entry = result[i];',
    "                entry['current_page'] = cursor;",
    "                rates.push ({ 'info': entry, 'a': this.safeString (entry, 'a') });",
    '            }',
    '        }',
    '        return rates;',
    '    }',
    '}',
    '',
].join('\n');

describe('rust: rows of a declared Dict[] list and a written row next to a dict-typed safeValue local', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'h22r01-'));
    afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));
    fs.mkdirSync(path.join(tmp, 'ts', 'src', 'base'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'ts', 'src', 'base', 'Exchange.ts'), BASE);
    const file = path.join(tmp, 'ts', 'src', 'venue.ts');
    fs.writeFileSync(file, VENUE);
    const out = new Transpiler({ verbose: false, rust: { parser: { NUM_LINES_END_FILE: 0 } } }).transpileRustByPath(file).content;
    if (process.env.H22DUMP) console.log(out);
    test('a counter row of a Dict[] local reads through safe_dict_t, no into_dict', () => {
        expect(out).toContain('let mut row: crate::value::Dict = self.safe_dict_t(&rows, Value::Int(i));');
        expect(out).toContain('let mut linearEntry: crate::value::Dict = self.safe_dict_t(&linearRows, Value::Int(i));');
        expect(out).not.toMatch(/\.get\(i as usize\)\.cloned\(\)\.unwrap_or\(Value::Null\)\.into_dict\(\)/);
    });
    test('a row the source declares any stays the boxed element', () => {
        expect(out).toMatch(/let (mut )?anyEntry: Value = /);
        expect(out).not.toMatch(/anyEntry: crate::value::Dict/);
    });
    test('a written, handed-on row keeps its list typed when a sibling makes the safeValue local a dict', () => {
        expect(out).toMatch(/let mut data: crate::value::Dict = /);
        expect(out).toMatch(/let mut result: crate::value::List = /);
        expect(out).toContain('let mut entry: Option<crate::value::Dict> = self.safe_dict_o(&result, Value::Int(i));');
        expect(out).not.toContain('get_value(&result');
        expect(out).not.toContain('crate::set_value(&mut result');
    });
});
