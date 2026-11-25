import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Transpiler } from '../src/transpiler';

jest.mock('module', () => ({ __esModule: true, default: jest.fn() }));

describe('rust Object.keys on a const alias of an untagged declared-dict base field', () => {
    const BASE = [
        'export interface Dict { [key: string]: any }',
        'export default class Exchange {',
        '    markets_by_id: Dict = undefined;',
        '    loose: any = undefined;',
        '    safeDict (d: any, k: any, def: any = undefined): Dict { return d[k] ?? def; }',
        '}',
        '',
    ].join('\n');
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'h26r11-'));
    afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));
    fs.mkdirSync(path.join(tmp, 'ts', 'src', 'base'), { recursive: true });
    fs.mkdirSync(path.join(tmp, 'ts', 'src', 'pro'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'ts', 'src', 'base', 'Exchange.ts'), BASE);
    const run = (body: string) => {
        const t = new Transpiler({ verbose: false, rust: { parser: { NUM_LINES_END_FILE: 0 } } });
        const file = path.join(tmp, 'ts', 'src', 'pro', 'venue.ts');
        fs.writeFileSync(file, [
            "import Exchange from '../base/Exchange.js';",
            'export default class venue extends Exchange {',
            '    ids (message: any) {',
            `        ${body}`,
            '    }',
            '}',
            '',
        ].join('\n'));
        return t.transpileRustByPath(file).content;
    };
    const NATIVE = '.as_map().into_iter().flat_map(crate::value::HashMap::keys).cloned().map(Value::from).collect()';

    test('positive: const alias of the field lists its own keys in order', () => {
        const out = run('const byId = this.markets_by_id; if (byId === undefined) { return []; } return Object.keys (byId);');
        expect(out).toContain(`Value::Array(byId${NATIVE})`);
        expect(out).not.toContain('object_keys(');
    });

    test('positive: field-or-empty ternary, values form', () => {
        const out = run('const m = (this.markets_by_id !== undefined) ? this.markets_by_id : {}; return Object.values (m);');
        expect(out).toContain('Value::Array(m.as_map().into_iter().flat_map(crate::value::HashMap::values).cloned().collect())');
        expect(out).not.toContain('object_values(');
    });

    test('negative: a let alias that is rewritten keeps the helper', () => {
        const out = run('let byId = this.markets_by_id; byId = message; return Object.keys (byId);');
        expect(out).toContain('object_keys(&byId)');
    });

    test('negative: a field declared any keeps the helper', () => {
        const out = run('const m = this.loose; return Object.keys (m);');
        expect(out).toContain('object_keys(&m)');
    });

    test('negative: a ws-built map (safeDict of the message) keeps the helper', () => {
        const out = run("const m = this.safeDict (message, 'subscriptions', {}); if (m === undefined) { return []; } return Object.keys (m);");
        expect(out).not.toContain(`m${NATIVE}`);
    });
});
