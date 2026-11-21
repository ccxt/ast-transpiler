import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Transpiler } from '../src/transpiler';

jest.mock('module', () => ({ __esModule: true, default: jest.fn() }));

// `Object.keys (x)` on a base local whose every value derives from the untagged config fields lists the map's own keys.
describe('rust Object.keys/values on a config-derived base local', () => {
    const setup = (body: string) => {
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'h30r07-'));
        fs.mkdirSync(path.join(tmp, 'ts', 'src', 'base'), { recursive: true });
        fs.writeFileSync(path.join(tmp, 'ts', 'src', 'base', 'Exchange.ts'), [
            'export interface Dict { [key: string]: any }',
            'export default class Exchange {',
            '    features: Dict = undefined;',
            '    safeDict (d: any, k: any, dflt: any = undefined): any { return d; }',
            '    omit (d: any, k: any): any { return d; }',
            '    parseThing (x: any): any { return x; }',
            `    pick (marketType: string, raw: any): any { ${body} }`,
            '}',
            '',
        ].join('\n'));
        fs.writeFileSync(path.join(tmp, 'ts', 'src', 'venue.ts'), "import Exchange from './base/Exchange.js';\nexport default class venue extends Exchange {}\n");
        const t = new Transpiler({ verbose: false, rust: { parser: { NUM_LINES_END_FILE: 0 } } });
        const out = t.transpileRustByPath(path.join(tmp, 'ts', 'src', 'base', 'Exchange.ts')).content;
        fs.rmSync(tmp, { recursive: true, force: true });
        return out;
    };
    const KEYS = 'Value::Array(obj.as_map().into_iter().flat_map(crate::value::HashMap::keys).cloned().map(Value::from).collect())';
    const VALUES = 'Value::Array(obj.as_map().into_iter().flat_map(crate::value::HashMap::values).cloned().collect())';

    test('positive: keys of a safeDict of this.features rebuilt through omit, with a literal keyed write', () => {
        const out = setup('let obj = this.safeDict (this.features, marketType); obj = this.omit (obj, "extends"); obj["createOrder"] = {}; return Object.keys (obj);');
        expect(out).toContain(KEYS);
        expect(out).not.toContain('object_keys(&obj)');
    });

    test('positive: values of a safeDict of this.features', () => {
        const out = setup('const obj = this.safeDict (this.features, marketType); return Object.values (obj);');
        expect(out).toContain(VALUES);
        expect(out).not.toContain('object_values(&obj)');
    });

    test('negative: one write is a raw parameter value', () => {
        const out = setup('let obj = this.safeDict (this.features, marketType); obj = raw; return Object.keys (obj);');
        expect(out).not.toContain(KEYS);
        expect(out).toContain('object_keys(&obj)');
    });

    test('negative: one write is an unproven callee result', () => {
        const out = setup('let obj = this.safeDict (this.features, marketType); obj = this.parseThing (raw); return Object.keys (obj);');
        expect(out).not.toContain(KEYS);
    });

    test('negative: a computed-key write into the local (could be a ws tag)', () => {
        const out = setup('const obj = this.safeDict (this.features, marketType); obj[marketType] = raw; return Object.keys (obj);');
        expect(out).not.toContain(KEYS);
    });

    test('negative: nil-able local is still listed as nothing, not a panic (no unwrap printed)', () => {
        const out = setup('const obj = this.safeDict (this.features, marketType); if (obj === undefined) { return []; } return Object.keys (obj);');
        expect(out).toContain(KEYS);
        expect(out).not.toMatch(/obj\.as_map\(\)\.unwrap\(\)/);
    });
});
