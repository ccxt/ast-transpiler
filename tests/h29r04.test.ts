import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Transpiler } from '../src/transpiler';

jest.mock('module', () => ({ __esModule: true, default: jest.fn() }));

describe('rust bounded-loop row write on an always-list local (safeList with [] / groupBy bucket)', () => {
    const BASE = [
        'export default class Exchange {',
        '    safeList (d: any, k: any, def: any = undefined): any[] { return d[k] ?? def; }',
        '    safeValue (d: any, k: any, def: any = undefined): any { return d[k] ?? def; }',
        '    safeNumber (d: any, k: any, def: any = undefined): any { return d[k] ?? def; }',
        '    groupBy (xs: any, k: string): any { return {}; }',
        '}',
        '',
    ].join('\n');
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'h29r04-'));
    afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));
    fs.mkdirSync(path.join(tmp, 'ts', 'src', 'base'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'ts', 'src', 'base', 'Exchange.ts'), BASE);
    const run = (name: string, body: string) => {
        const text = [
            "import Exchange from './base/Exchange.js';",
            'export default class venue extends Exchange {',
            '    build (entry: any, response: any, other: any) {',
            ...body.split('\n').map((l) => '        ' + l),
            '    }',
            '}',
            '',
        ].join('\n');
        const t = new Transpiler({ verbose: false, rust: { parser: { NUM_LINES_END_FILE: 0 } } });
        const file = path.join(tmp, 'ts', 'src', name + '.ts');
        fs.writeFileSync(file, text);
        return t.transpileRustByPath(file).content;
    };
    const NATIVE = 'if let Value::Arr(__a) = &mut fees { if let Some(Value::Dict(__d)) = std::sync::Arc::make_mut(__a).get_mut(j as usize) { std::sync::Arc::make_mut(__d).insert("cost".into(), ';
    const LOOP = 'for (let j = 0; j < fees.length; j++) {';
    test('safeList with [] default, value reads the row: native in-bounds insert (fails on the base printer)', () => {
        const out = run('venueA', ['const fees = this.safeList (entry, \'fees\', []);', LOOP, '    fees[j][\'cost\'] = this.safeNumber (fees[j], \'cost\');', '}', 'return fees;'].join('\n'));
        expect(out).not.toContain('add_element_to_object(get_value_mut(&mut fees');
        expect(out).toContain('{ let __be_tmp = ');
        expect(out).toContain(NATIVE + 'Value::from(__be_tmp)); } } }');
    });
    test('groupBy bucket row write: native in-bounds insert', () => {
        const out = run('venueB', ['const grouped = this.groupBy (response, \'symbol\');', 'const fees = grouped[\'x\'];', LOOP, '    const c = this.safeNumber (fees[j], \'id\');', '    fees[j][\'cost\'] = c;', '}', 'return fees;'].join('\n'));
        expect(out).not.toContain('add_element_to_object(get_value_mut(&mut fees');
        expect(out).toContain(NATIVE);
    });
    test('negative: safeList without a [] default (may be Null) keeps the helper', () => {
        const out = run('venueC', ['const fees = this.safeList (entry, \'fees\');', LOOP, '    fees[j][\'cost\'] = 1;', '}', 'return fees;'].join('\n'));
        expect(out).not.toContain(NATIVE);
    });
    test('negative: a whole-row write in the loop (row of another shape) keeps the helper', () => {
        const out = run('venueD', ['const fees = this.safeList (entry, \'fees\', []);', LOOP, '    fees[j] = other;', '    fees[j][\'cost\'] = 1;', '}', 'return fees;'].join('\n'));
        expect(out).not.toContain(NATIVE);
    });
    test('negative: the list handed to a callee inside the loop keeps the helper', () => {
        const out = run('venueE', ['const fees = this.safeList (entry, \'fees\', []);', LOOP, '    fees[j][\'cost\'] = 1;', '    other.mutate (fees);', '}', 'return fees;'].join('\n'));
        expect(out).not.toContain(NATIVE);
    });
    test('negative: a loop bounded by another list keeps the helper', () => {
        const out = run('venueF', ['const fees = this.safeList (entry, \'fees\', []);', 'for (let j = 0; j < response.length; j++) {', '    fees[j][\'cost\'] = 1;', '}', 'return fees;'].join('\n'));
        expect(out).not.toContain(NATIVE);
    });
});
