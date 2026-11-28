import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Transpiler } from '../src/transpiler';

jest.mock('module', () => ({ __esModule: true, default: jest.fn() }));

// `Object.keys (x)` on receivers no ws client snapshot can reach: the map's own keys.
describe('rust Object.keys on client-free receivers', () => {
    const KEYS = '.into_iter().flat_map(crate::value::HashMap::keys).cloned().map(Value::from).collect())';
    const BASE = [
        'export interface Dict { [key: string]: any }',
        'export default class Exchange {',
        '    balance: any = undefined;',
        '    ohlcvs: any = undefined;',
        '    safeDict (o: any, k: any, d: any = undefined): any { return o[k]; }',
        '    async fetchBalance (params = {}): Promise<any> { return params; }',
        '    BODY',
        '}',
        '',
    ].join('\n');
    const setup = (baseBody: string, proBody: string, target: 'base' | 'pro') => {
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'h57r05-'));
        fs.mkdirSync(path.join(tmp, 'ts', 'src', 'base'), { recursive: true });
        fs.mkdirSync(path.join(tmp, 'ts', 'src', 'pro'), { recursive: true });
        const basePath = path.join(tmp, 'ts', 'src', 'base', 'Exchange.ts');
        const proPath = path.join(tmp, 'ts', 'src', 'pro', 'venue.ts');
        fs.writeFileSync(basePath, BASE.replace('BODY', baseBody));
        fs.writeFileSync(proPath, [ "import Exchange from '../base/Exchange.js';", 'interface Dict { [key: string]: any }', 'export default class venue extends Exchange {', `    ${proBody}`, '}', '' ].join('\n'));
        const t = new Transpiler({ verbose: false, rust: { parser: { NUM_LINES_END_FILE: 0 } } });
        const out = t.transpileRustByPath(target === 'base' ? basePath : proPath).content;
        fs.rmSync(tmp, { recursive: true, force: true });
        return out;
    };
    const NOOP = 'noop (r: any) { return r; }';

    test('base: an untyped parameter of a method with no client and no ws caller', () => {
        const out = setup('count (response: any): number { const keys = Object.keys (response); return keys.length; }', NOOP, 'base');
        expect(out).toContain(`Value::Array(response.as_map()${KEYS}`);
        expect(out).not.toContain('object_keys(');
    });

    test('base: a `{}` local only rewritten from a parameter', () => {
        const out = setup('count (response: any): number { let d = {}; if (!Array.isArray (response)) { d = response; } const keys = Object.keys (d); return keys.length; }', NOOP, 'base');
        expect(out).toContain(`Value::Array(d.as_map()${KEYS}`);
        expect(out).not.toContain('object_keys(');
    });

    test('base: a literal-key member of a parameter', () => {
        const out = setup("count (fee: Dict): number { const keys = Object.keys (fee['networks']); fee['n'] = keys.length; return keys.length; }", NOOP, 'base');
        expect(out).toContain(`Value::Array(fee.as_map().and_then(|__m| __m.get("networks")).and_then(Value::as_map)${KEYS}`);
        expect(out).not.toContain('object_keys(');
    });

    test('negative: a base method that takes the ws client keeps the helper', () => {
        const out = setup('count (client: any, response: any): number { const keys = Object.keys (response); return keys.length; }', NOOP, 'base');
        expect(out).toContain('object_keys(&response)');
    });

    test('negative: a base method a ws venue calls keeps the helper', () => {
        const out = setup('count (response: any): number { const keys = Object.keys (response); return keys.length; }', 'run (r: any) { return this.count (r); }', 'base');
        expect(out).toContain('object_keys(&response)');
    });

    test('negative: a `Dict` parameter is left to its own rules', () => {
        const out = setup('count (response: Dict): number { response["k"] = 1; const keys = Object.keys (response); return keys.length; }', NOOP, 'base');
        expect(out).not.toContain(`Value::Array(response.as_map()${KEYS}`);
    });

    test('negative: a local also written from a call keeps the helper', () => {
        const out = setup('count (response: any): number { let d = {}; d = this.safeDict (response, "k"); const keys = Object.keys (d); return keys.length; }', NOOP, 'base');
        expect(out).not.toContain(`Value::Array(d.as_map()${KEYS}`);
    });

    test('pro: a const read of this.ohlcvs and a REST fetch result', () => {
        const out = setup('noop (): void {}', "async run (symbol: string) { const bySymbol = this.safeDict (this.ohlcvs, symbol); const a = Object.keys (bySymbol); const response = await this.fetchBalance (); const b = Object.keys (response); return a.length + b.length; }", 'pro');
        expect(out).toContain(`Value::Array(bySymbol.as_map()${KEYS}`);
        expect(out).toContain(`Value::Array(response.as_map()${KEYS}`);
        expect(out).not.toContain('object_keys(');
    });

    test('negative (pro): a subscription dict read through the client keeps the helper', () => {
        const out = setup('noop (): void {}', "run (client: any, key: string) { const subscriptions = this.safeDict (client.subscriptions, key, {}); const a = Object.keys (subscriptions); return a.length; }", 'pro');
        expect(out).toContain('object_keys(&subscriptions)');
    });

    test('pro: a private method parameter every caller fills from this.balance', () => {
        const out = setup('noop (): void {}', "prune (b: any, seen: any): any { const keys = Object.keys (b); for (let i = 0; i < keys.length; i++) { const key = keys[i]; if (!(key in seen)) { delete b[key]; } } return b; }\n    run (seen: any) { const cash = this.safeDict (this.balance, 'cash', {}); return this.prune (cash, seen); }", 'pro');
        expect(out).toContain(`Value::Array(b.as_map()${KEYS}`);
    });

    test('negative (pro): a caller passing anything else keeps the helper', () => {
        const out = setup('noop (): void {}', "prune (b: any, seen: any): any { const keys = Object.keys (b); return keys.length; }\n    run (client: any, seen: any) { const cash = this.safeDict (client.subscriptions, 'cash', {}); return this.prune (cash, seen); }", 'pro');
        expect(out).toContain('object_keys(&b)');
    });
});
