import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Transpiler } from '../src/transpiler';

jest.mock('module', () => ({ __esModule: true, default: jest.fn() }));

describe('rust Object.keys/values on a const bound to a fresh parse / setMarkets map', () => {
    const BASE = [
        'export interface Dict { [key: string]: any }',
        'export default class Exchange {',
        '    parsePosition (p: any): Dict { return p; }',
        '    parseLoose (p: any): any { return p; }',
        '    setMarkets (m: any, c: any = undefined): Dict { return m; }',
        '}',
        '',
    ].join('\n');
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'h27r06-'));
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
            '    override setMarkets (m: any, c: any = undefined): Dict {',
            '        const stored: Dict = super.setMarkets (m, c);',
            '        const ks = Object.keys (stored);',
            '        for (let i = 0; i < ks.length; i++) { stored[ks[i]] = message2; }',
            '        return stored;',
            '    }',
            '}',
            'const message2 = {};',
            '',
        ].join('\n'));
        return t.transpileRustByPath(file).content;
    };
    const KEYS = '.as_map().into_iter().flat_map(crate::value::HashMap::keys).cloned().map(Value::from).collect())';

    test('positive: parse result with deletes lists its own keys', () => {
        const out = run('const p = this.parsePosition (message); const keys = Object.keys (p); for (let i = 0; i < keys.length; i++) { const k = keys[i]; if (p[k] === undefined) { delete p[k]; } } return p;');
        expect(out).toContain(`Value::Array(p${KEYS}`);
        expect(out).not.toContain('object_keys(&p)');
    });

    test('positive: super.setMarkets result', () => {
        const out = run('return message;');
        expect(out).toContain(`Value::Array(stored${KEYS}`);
        expect(out).not.toContain('object_keys(&stored)');
    });

    test('positive: values form', () => {
        const out = run('const p = this.parsePosition (message); delete p["x"]; return Object.values (p);');
        expect(out).toContain('Value::Array(p.as_map().into_iter().flat_map(crate::value::HashMap::values).cloned().collect())');
    });

    test('negative: a parse declared any keeps the helper', () => {
        const out = run('const p = this.parseLoose (message); delete p["x"]; return Object.keys (p);');
        expect(out).toContain('object_keys(&p)');
    });

    test('negative: a let that is rebound keeps the helper', () => {
        const out = run('let p = this.parsePosition (message); p = message; delete p["x"]; return Object.keys (p);');
        expect(out).not.toContain(`Value::Array(p${KEYS}`);
    });
});
