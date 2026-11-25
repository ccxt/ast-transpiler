import { Transpiler } from '../src/transpiler';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

jest.mock('module', () => ({ __esModule: true, default: jest.fn() }));

const BASE = [
    'export interface Dict { [key: string]: any }',
    'export type Str = string | undefined;',
    'export default class Exchange {',
    '    safeString (d: any, k: any, def: Str = undefined): Str { return d[k] ?? def; }',
    '    extend (...args: any[]): Dict { return {}; }',
    '    safeOrder (order: Dict, market: any = undefined): Dict { return this.extend (order, { \'x\': 1 }); }',
    '    safeTicker (ticker: Dict, market: any = undefined): Dict { return this.extend (ticker, { \'x\': 1 }); }',
    '    keep (x: any): any { return x; }',
    '}',
    '',
].join('\n');

const venue = (body: string, extra = '') => [
    "import Exchange, { Dict, Str } from './base/Exchange.js';",
    'export default class venue extends Exchange {',
    extra,
    '    cancelAll (response: any): any {',
    body,
    '    }',
    '}',
    '',
].join('\n');

describe('a local built by a base record builder (safeOrder / safeTicker) keeps the map type', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'h50r43-'));
    afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));
    fs.mkdirSync(path.join(tmp, 'ts', 'src', 'base'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'ts', 'src', 'base', 'Exchange.ts'), BASE);
    const run = (name: string, text: string) => {
        const t = new Transpiler({ verbose: false, rust: { parser: { NUM_LINES_END_FILE: 0 } } } as any);
        const file = path.join(tmp, 'ts', 'src', name + '.ts');
        fs.writeFileSync(file, text);
        return t.transpileRustByPath(file).content;
    };
    test('positive: safeOrder local returned in a list is not a Value local', () => {
        const out = run('venueA', venue("        const order = this.safeOrder ({ 'info': response });\n        return [ order ];"));
        expect(out).not.toMatch(/let (mut )?order: Value\b/);
    });
    test('positive: safeTicker local returned whole is not a Value local', () => {
        const out = run('venueB', venue("        const ticker = this.safeTicker ({ 'info': response });\n        return ticker;"));
        expect(out).not.toMatch(/let (mut )?ticker: Value\b/);
    });
    test('negative: a venue override of safeOrder keeps the box', () => {
        const out = run('venueC', venue("        const order = this.safeOrder ({ 'info': response });\n        return [ order ];",
            '    safeOrder (order: Dict, market: any = undefined): any { return this.keep (order); }'));
        expect(out).toMatch(/let (mut )?order: Value\b/);
    });
});
