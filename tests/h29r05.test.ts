import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Transpiler } from '../src/transpiler';

jest.mock('module', () => ({ __esModule: true, default: jest.fn() }));

// `Object.keys (r)` where `const r = (p === undefined) ? this.timeframes : p` and every caller fills `p` from `this.options`.
describe('rust Object.keys on a field-or-options-dict ternary local', () => {
    const KEYS = '.as_map().into_iter().flat_map(crate::value::HashMap::keys).cloned().map(Value::from).collect())';
    const setup = (venue: string, body?: string) => {
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'h29r05-'));
        fs.mkdirSync(path.join(tmp, 'ts', 'src', 'base'), { recursive: true });
        const base = [
            'export interface Dict { [key: string]: any }',
            'export type NullableDict = Dict | undefined;',
            'export interface Dictionary<T> { [key: string]: T }',
            'export default class Exchange {',
            '    options: Dict;',
            '    timeframes: Dictionary<number | string> = {};',
            '    safeDict (d: any, k: any, v: any = undefined): any { return d; }',
            '    findTf (timeframe: any, timeframes: NullableDict = undefined): string {',
            body ?? '        const resolved: Dict = (timeframes === undefined) ? this.timeframes : timeframes; const keys = Object.keys (resolved); for (let i = 0; i < keys.length; i++) { const key = keys[i]; if (resolved[key] === timeframe) { return key; } } return undefined;',
            '    }',
            '}',
            '',
        ].join('\n');
        fs.writeFileSync(path.join(tmp, 'ts', 'src', 'base', 'Exchange.ts'), base);
        fs.writeFileSync(path.join(tmp, 'ts', 'src', 'venue.ts'), [
            "import Exchange from './base/Exchange.js';",
            'export default class venue extends Exchange {',
            `    run (r: any) { ${venue} }`,
            '}',
            '',
        ].join('\n'));
        const t = new Transpiler({ verbose: false, rust: { parser: { NUM_LINES_END_FILE: 0 } } });
        const out = t.transpileRustByPath(path.join(tmp, 'ts', 'src', 'base', 'Exchange.ts')).content;
        fs.rmSync(tmp, { recursive: true, force: true });
        return out;
    };

    test('positive: callers omit the dict or pass one cut from this.options', () => {
        const out = setup('const ws = this.safeDict (this.options, "ws", {}); const tfs = this.safeDict (ws, "timeframes", {}); this.findTf (r, tfs); this.findTf (r, this.options["timeframes"]); return this.findTf (r);');
        expect(out).toContain(`Value::Array(resolved${KEYS}`);
        expect(out).not.toContain('object_keys(&resolved)');
    });

    test('negative: a caller passes a raw message value', () => {
        const out = setup('this.findTf (r, this.options["timeframes"]); return this.findTf (r, r);');
        expect(out).toContain('object_keys(&resolved)');
    });

    test('negative: a caller passes a safeDict with a non-empty default', () => {
        const out = setup('return this.findTf (r, this.safeDict (this.options, "tf", r));');
        expect(out).toContain('object_keys(&resolved)');
    });

    test('negative: the method is named by a quoted string (dynamic dispatch)', () => {
        const out = setup('const n = "findTf"; return this.findTf (r);');
        expect(out).toContain('object_keys(&resolved)');
    });

    test('negative: the parameter is reassigned in the body', () => {
        const out = setup('return this.findTf (r);', '        timeframes = this.options; const resolved: Dict = (timeframes === undefined) ? this.timeframes : timeframes; return Object.keys (resolved)[0];');
        expect(out).toContain('object_keys(&resolved)');
    });
});
