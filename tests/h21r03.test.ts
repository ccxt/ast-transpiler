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
    '    subs: any = undefined;',
    '    safeDict (d: any, k: any, def: Dict = undefined): Dict { return d[k] ?? def; }',
    '    safeString (d: any, k: any, def: Str = undefined): Str { return d[k] ?? def; }',
    '}',
    '',
].join('\n');

const src = (ret: string) => [
    "import Exchange, { Dict, NullableDict, Str } from '../base/Exchange.js';",
    'export default class venue extends Exchange {',
    '    handleOHLCV (message: Dict) {',
    "        const subscription = this.findSubscription ('ohlcv');",
    '        if (subscription === undefined) {',
    '            return;',
    '        }',
    "        return this.safeString (subscription, 'symbol');",
    '    }',
    '',
    `    findSubscription (name: string): ${ret} {`,
    '        const keys = Object.keys (this.subs);',
    '        for (let i = 0; i < keys.length; i++) {',
    '            const subscription = this.safeDict (this.subs, keys[i]);',
    "            if (this.safeString (subscription, 'name') === name) {",
    '                return subscription;',
    '            }',
    '        }',
    '        return undefined;',
    '    }',
    '}',
    '',
].join('\n');

describe('findSubscription declared NullableDict returns Option<Dict>', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'h21r03-'));
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
    test('NullableDict: -> Option<Dict>, caller drops into_opt_dict', () => {
        const out = run('venueA', src('NullableDict'));
        expect(out).toMatch(/fn (?:find_subscription|findSubscription)\([^\n]*\) -> Option<crate::value::Dict>/);
        expect(out).toContain('return None;');
        expect(out).not.toContain('.into_opt_dict()');
    });
    test('negative: declared Dict keeps the Value return', () => {
        const out = run('venueB', src('Dict'));
        expect(out).not.toMatch(/fn (?:find_subscription|findSubscription)\([^\n]*\) -> Option<crate::value::Dict>/);
    });
    test('negative: undeclared return keeps the Value return', () => {
        const out = run('venueC', src('any'));
        expect(out).not.toMatch(/fn (?:find_subscription|findSubscription)\([^\n]*\) -> Option<crate::value::Dict>/);
    });
});
