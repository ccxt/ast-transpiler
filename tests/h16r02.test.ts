import { Transpiler } from '../src/transpiler';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

jest.mock('module', () => ({ __esModule: true, default: jest.fn() }));

const precise = [
    'export default class Precise {',
    '    decimals: number;',
    '    integer: bigint;',
    '    constructor (n: string) { this.decimals = 0; this.integer = BigInt (n); }',
    '    reduce () { return this; }',
    '    toString () { return \'\'; }',
    '}',
    '',
].join('\n');

const venue = [
    'import Precise from \'./base/Precise.js\';',
    'export type Int = number | undefined;',
    'export default class v {',
    '    sum (...xs: any[]): any { return undefined; }',
    '    parseToInt (x: any): Int { return undefined; }',
    '    fromEn (en: string, scale: Int): string {',
    '        const precise = new Precise (en);',
    '        precise.decimals = this.sum (precise.decimals, 8);',
    '        precise.reduce ();',
    '        return precise.toString ();',
    '    }',
    '    mixed (en: string, x: any): string {',
    '        const q = new Precise (en);',
    '        q.decimals = this.sum (q.decimals, x);',
    '        return q.toString ();',
    '    }',
    '    maybe (en: string, flag: boolean): string {',
    '        const m = flag ? new Precise (en) : undefined;',
    '        if (m === undefined) { return undefined; }',
    '        return m.toString ();',
    '    }',
    '    other (x: any): string {',
    '        const o: any = x;',
    '        o.decimals = this.sum (o.decimals, 1);',
    '        return o.toString ();',
    '    }',
    '}',
    '',
].join('\n');

describe('Precise locals are the typed struct', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'h16r02-'));
    afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));
    let out = '';
    beforeAll(() => {
        const t = new Transpiler({ verbose: false, rust: { parser: { NUM_LINES_END_FILE: 0 } } });
        const base = path.join(tmp, 'ts', 'src', 'base', 'Precise.ts');
        fs.mkdirSync(path.dirname(base), { recursive: true });
        fs.writeFileSync(base, precise);
        const file = path.join(tmp, 'ts', 'src', 'v.ts');
        fs.writeFileSync(file, venue);
        out = t.transpileRustByPath(file).content;
    });
    test('toString prints the struct Display', () => {
        expect(out).toContain('Value::from(precise.to_string())');
        expect(out).not.toContain('to_string_val(&precise)');
    });
    test('the decimals write is the i64 field', () => {
        expect(out).toContain('(precise).decimals += 8;');
    });
    test('an any local keeps the boxed forms', () => {
        expect(out).toContain('format!("{}", o)');
        expect(out).not.toContain('(o).decimals');
    });
    test('a write of an any operand keeps the helper sum', () => {
        expect(out).not.toContain('(q).decimals');
        expect(out).toMatch(/self\.sum\(/);
    });
    test('a maybe-undefined Precise keeps the boxed toString', () => {
        expect(out).not.toContain('m.to_string()');
        expect(out).toContain('format!("{}", m)');
    });
});
