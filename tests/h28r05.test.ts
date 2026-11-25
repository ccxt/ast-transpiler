import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Transpiler } from '../src/transpiler';

jest.mock('module', () => ({ __esModule: true, default: jest.fn() }));

// Base `Dict` parameter whose every ts/src caller passes a const bound to a fresh map producer.
describe('rust Object.keys on a read-only base Dict parameter fed fresh maps', () => {
    const KEYS = '.as_map().into_iter().flat_map(crate::value::HashMap::keys).cloned().map(Value::from).collect())';
    const setup = (base: string, venue: string) => {
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'h28r05-'));
        fs.mkdirSync(path.join(tmp, 'ts', 'src', 'base'), { recursive: true });
        fs.writeFileSync(path.join(tmp, 'ts', 'src', 'base', 'Exchange.ts'), base);
        fs.writeFileSync(path.join(tmp, 'ts', 'src', 'venue.ts'), venue);
        const t = new Transpiler({ verbose: false, rust: { parser: { NUM_LINES_END_FILE: 0 } } });
        const out = t.transpileRustByPath(path.join(tmp, 'ts', 'src', 'base', 'Exchange.ts')).content;
        fs.rmSync(tmp, { recursive: true, force: true });
        return out;
    };
    const base = (body: string) => [
        'export interface Dict { [key: string]: any }',
        'export default class Exchange {',
        '    parseThings (x: any): Dict {',
        '        return x;',
        '    }',
        '    parseLoose (x: any): any {',
        '        return x;',
        '    }',
        `    pick (d: Dict, k: string): Dict { ${body} }`,
        '}',
        '',
    ].join('\n');
    const venue = (body: string) => [
        "import Exchange from './base/Exchange.js';",
        'export default class venue extends Exchange {',
        `    run (r: any) { ${body} }`,
        '}',
        '',
    ].join('\n');
    const READ = 'const keys = Object.keys (d); const out: Dict = {}; for (let i = 0; i < keys.length; i++) { const key = keys[i]; if (key !== k) { out[key] = d[key]; } } return out;';

    test('positive: every caller lends a fresh parse map', () => {
        const out = setup(base(READ), venue('const m = this.parseThings (r); const a = m; return this.pick (a, "x");'));
        // the parameter is shadowed (its keys key its own reads), so the shadow map's iterators list them
        expect(out).toContain('Value::Array(d.keys().cloned().map(Value::from).collect())');
        expect(out).not.toContain('object_keys(&d)');
    });

    test('negative: a caller passes an any-returning parse result', () => {
        const out = setup(base(READ), venue('const m = this.parseLoose (r); return this.pick (m, "x");'));
        expect(out).not.toContain(`Value::Array(d${KEYS}`);
    });

    test('negative: a caller passes a raw response value', () => {
        const out = setup(base(READ), venue('return this.pick (r, "x");'));
        expect(out).not.toContain(`Value::Array(d${KEYS}`);
    });

    test('negative: the parameter is written in the body', () => {
        const out = setup(base('d[k] = 1; return Object.keys (d);'), venue('const m = this.parseThings (r); return this.pick (m, "x");'));
        expect(out).not.toContain(`Value::Array(d${KEYS}`);
    });

    test('negative: a venue overrides the method', () => {
        const v = venue('const m = this.parseThings (r); return this.pick (m, "x");').replace('    run (r', '    pick (d: Dict, k: string): any { return d; }\n    run (r');
        const out = setup(base(READ), v);
        expect(out).not.toContain(`Value::Array(d${KEYS}`);
    });
});
