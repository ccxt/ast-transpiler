import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Transpiler } from '../src/transpiler';

jest.mock('module', () => ({ __esModule: true, default: jest.fn() }));

describe('rust keyed write on a bounded row of a toArray list local', () => {
    const BASE = [
        'export interface Dict { [key: string]: any }',
        'export default class Exchange {',
        '    toArray (v: any): any[] { return Object.values (v); }',
        '    safeList (d: any, k: any, def: any = undefined): any[] { return d[k] ?? def; }',
        '    safeString (d: any, k: any, def: any = undefined): string { return d[k] ?? def; }',
        '    parseLedger (d: any): any[] { return d; }',
        '}',
        '',
    ].join('\n');
    const src = (decl: string, between: string, body: string) => [
        "import Exchange from './base/Exchange.js';",
        'export default class venue extends Exchange {',
        '    fetchLedger (response: any, other: any) {',
        '        const code = this.safeString (response, \'code\');',
        `        ${decl}`,
        `        ${between}`,
        '        for (let i = 0; i < entries.length; i++) {',
        `            ${body}`,
        '        }',
        '        return this.parseLedger (entries);',
        '    }',
        '}',
        '',
    ].join('\n');
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'h27r05-'));
    afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));
    fs.mkdirSync(path.join(tmp, 'ts', 'src', 'base'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'ts', 'src', 'base', 'Exchange.ts'), BASE);
    const run = (name: string, text: string) => {
        const t = new Transpiler({ verbose: false, rust: { parser: { NUM_LINES_END_FILE: 0 } } });
        const file = path.join(tmp, 'ts', 'src', name + '.ts');
        fs.writeFileSync(file, text);
        return t.transpileRustByPath(file).content;
    };
    const DECL = 'const entries = this.toArray (response);';
    const WRITE = "entries[i]['currency'] = code;";
    const HELPER = 'add_element_to_object(get_value_mut(&mut entries';
    test('bounded row write on a toArray local inserts natively (fails on the base printer)', () => {
        const out = run('venueA', src(DECL, '', WRITE));
        expect(out).not.toContain(HELPER);
        expect(out).toContain('if let Value::Arr(__a) = &mut entries { if let Some(Value::Dict(__d)) = std::sync::Arc::make_mut(__a).get_mut(i as usize) { std::sync::Arc::make_mut(__d).insert("currency".into(), ');
    });
    test('reassigned through toArray / [] inserts natively', () => {
        const out = run('venueB', src('let entries = [];', 'if (code !== undefined) { entries = this.toArray (response); }', WRITE));
        expect(out).not.toContain(HELPER);
    });
    test('negative: a rebinding that is not an array source keeps the helper', () => {
        const out = run('venueC', src('let entries = this.toArray (response);', 'if (code === undefined) { entries = other; }', WRITE));
        expect(out).toContain(HELPER);
    });
    test('negative: an initializer that can be undefined keeps the helper', () => {
        const out = run('venueD', src('const entries = other;', '', WRITE));
        expect(out).toContain(HELPER);
    });
    test('negative: the loop body resizes the list keeps the helper', () => {
        const out = run('venueE', src(DECL, '', WRITE + ' entries.push ({});'));
        expect(out).toContain(HELPER);
    });
    test('negative: the index is written in the body keeps the helper', () => {
        const out = run('venueF', src(DECL, '', WRITE + ' i = i + 1;'));
        expect(out).toContain(HELPER);
    });
});
