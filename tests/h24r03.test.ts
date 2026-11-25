import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Transpiler } from '../src/transpiler';

jest.mock('module', () => ({ __esModule: true, default: jest.fn() }));

describe('rust keyed write on a row of a defaulted list local inside its own bounded loop', () => {
    const BASE = [
        'export interface Dict { [key: string]: any }',
        'export type Int = number | undefined;',
        'export default class Exchange {',
        '    safeList (d: any, k: any, def: any = undefined): any[] { return d[k] ?? def; }',
        '    safeValue (d: any, k: any, def: any = undefined): any { return d[k] ?? def; }',
        '    safeString (d: any, k: any, def: any = undefined): string { return d[k] ?? def; }',
        '    parseTrades (d: any): any[] { return d; }',
        '}',
        '',
    ].join('\n');
    const src = (init: string, loop: string, body: string) => [
        "import Exchange from './base/Exchange.js';",
        'export default class venue extends Exchange {',
        '    fetchTrades (response: any) {',
        `        ${init}`,
        '        const next = this.safeString (response, \'next\');',
        `        for (${loop}) {`,
        `            ${body}`,
        '        }',
        '        return this.parseTrades (rows);',
        '    }',
        '}',
        '',
    ].join('\n');
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'h24r03-'));
    afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));
    fs.mkdirSync(path.join(tmp, 'ts', 'src', 'base'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'ts', 'src', 'base', 'Exchange.ts'), BASE);
    const run = (name: string, text: string) => {
        const t = new Transpiler({ verbose: false, rust: { parser: { NUM_LINES_END_FILE: 0 } } });
        const file = path.join(tmp, 'ts', 'src', name + '.ts');
        fs.writeFileSync(file, text);
        return t.transpileRustByPath(file).content;
    };
    const INIT = "const rows = this.safeList (response, 'results', []);";
    const LOOP = 'let i = 0; i < rows.length; i++';
    const WRITE = "rows[i]['next'] = next;";
    test('in-bounds row write inserts natively (fails on the base printer)', () => {
        const out = run('venueA', src(INIT, LOOP, WRITE));
        expect(out).not.toContain('add_element_to_object(get_value_mut(&mut rows');
        expect(out).toContain('if let Some(Value::Dict(__d)) = std::sync::Arc::make_mut(&mut rows).get_mut(i as usize) { std::sync::Arc::make_mut(__d).insert("next".into(), ');
    });
    test('negative: a loop bounded by another value keeps the padding helper', () => {
        const out = run('venueB', src(INIT, 'let i = 0; i < 5; i++', WRITE));
        expect(out).toContain('add_element_to_object(get_value_mut(&mut rows');
    });
    test('negative: a body that resizes the list keeps the helper', () => {
        const out = run('venueC', src(INIT, LOOP, WRITE + ' rows.push ({});'));
        expect(out).toContain('add_element_to_object(get_value_mut(&mut rows');
    });
    test('negative: a list that can be undefined (no [] default) keeps the helper', () => {
        const out = run('venueD', src("const rows = this.safeList (response, 'results');", LOOP, WRITE));
        expect(out).toContain('add_element_to_object(get_value_mut(&mut rows');
    });
    test('negative: a body that writes the index keeps the helper', () => {
        const out = run('venueE', src(INIT, LOOP, WRITE + ' i = i + 1;'));
        expect(out).not.toContain('get_mut(i as usize) { std::sync::Arc::make_mut(__d)');
    });
});
