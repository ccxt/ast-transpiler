import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Transpiler } from '../src/transpiler';

jest.mock('module', () => ({ __esModule: true, default: jest.fn() }));

describe('rust keyed write on row 0 of a defaulted list local under a safeDict (xs, 0) guard', () => {
    const BASE = [
        'export interface Dict { [key: string]: any }',
        'export type Int = number | undefined;',
        'export default class Exchange {',
        '    safeList (d: any, k: any, def: any = undefined): any[] { return d[k] ?? def; }',
        '    safeValue (d: any, k: any, def: any = undefined): any { return d[k] ?? def; }',
        '    safeDict (d: any, k: any, def: Dict): Dict;',
        '    safeDict (d: any, k: any, def?: Dict): Dict | undefined;',
        '    isDictionary (v: any): boolean { return typeof v === \'object\'; }',
        '    safeDict (d: any, k: any, def: any = undefined): Dict | undefined { const value = this.safeValue (d, k, def); if (this.isDictionary (value)) { return value; } return def; }',
        '    safeString (d: any, k: any, def: any = undefined): string { return d[k] ?? def; }',
        '    parseTrades (d: any): any[] { return d; }',
        '}',
        '',
    ].join('\n');
    const src = (init: string, first: string, between: string, cond: string, write: string) => [
        "import Exchange from './base/Exchange.js';", "import type { Dict } from './base/Exchange.js';",
        'export default class venue extends Exchange {',
        '    fetchTrades (response: any) {',
        `        ${init}`,
        '        const cursor = this.safeString (response, \'cursor\');',
        `        ${first}`,
        `        ${between}`,
        `        if (${cond}) {`,
        `            ${write}`,
        '        }',
        '        return this.parseTrades (rows);',
        '    }',
        '}',
        '',
    ].join('\n');
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'h26r09-'));
    afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));
    fs.mkdirSync(path.join(tmp, 'ts', 'src', 'base'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'ts', 'src', 'base', 'Exchange.ts'), BASE);
    const run = (name: string, text: string) => {
        const t = new Transpiler({ verbose: false, rust: { parser: { NUM_LINES_END_FILE: 0 } } });
        const file = path.join(tmp, 'ts', 'src', name + '.ts');
        fs.writeFileSync(file, text);
        return t.transpileRustByPath(file).content;
    };
    const INIT = "const rows: Dict[] = this.safeList (response, 'results', []);";
    const FIRST = 'const first = this.safeDict (rows, 0);';
    const COND = '(first !== undefined) && (cursor !== undefined)';
    const WRITE = "rows[0]['cursor'] = cursor;";
    const HELPER = 'add_element_to_object(get_value_mut(&mut rows';
    test('guarded row-0 write inserts natively (fails on the base printer)', () => {
        const out = run('venueA', src(INIT, FIRST, '', COND, WRITE));
        expect(out).not.toContain(HELPER);
        expect(out).toContain('if let Some(Value::Dict(__d)) = std::sync::Arc::make_mut(&mut rows).get_mut(0) { std::sync::Arc::make_mut(__d).insert("cursor".into(), ');
    });
    test('negative: no first-row guard keeps the padding helper', () => {
        const out = run('venueB', src(INIT, FIRST, '', 'cursor !== undefined', WRITE));
        expect(out).toContain(HELPER);
    });
    test('negative: the list is emptied between the guard read and the write', () => {
        const out = run('venueC', src(INIT, FIRST, 'rows.pop ();', COND, WRITE));
        expect(out).toContain(HELPER);
    });
    test('negative: a guard read of another list keeps the helper', () => {
        const out = run('venueD', src(INIT + " const other = this.safeList (response, 'x', []);", 'const first = this.safeDict (other, 0);', '', COND, WRITE));
        expect(out).toContain(HELPER);
    });
    test('negative: a list that can be undefined (no [] default) keeps the helper', () => {
        const out = run('venueE', src("const rows: Dict[] = this.safeList (response, 'results');", FIRST, '', COND, WRITE));
        expect(out).toContain(HELPER);
    });
    test('negative: an index other than 0 keeps the helper', () => {
        const out = run('venueF', src(INIT, FIRST, '', COND, "rows[1]['cursor'] = cursor;"));
        expect(out).toContain(HELPER);
    });
});
