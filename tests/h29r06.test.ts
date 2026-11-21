import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Transpiler } from '../src/transpiler';

jest.mock('module', () => ({ __esModule: true, default: jest.fn() }));

// `X[k]` on a base local whose every value derives from the untagged config fields reads the map natively.
describe('rust native read on a config-derived base local', () => {
    const setup = (body: string, venue = 'export default class venue extends Exchange {}') => {
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'h29r06-'));
        fs.mkdirSync(path.join(tmp, 'ts', 'src', 'base'), { recursive: true });
        fs.writeFileSync(path.join(tmp, 'ts', 'src', 'base', 'Exchange.ts'), [
            'export interface Dict { [key: string]: any }',
            'export default class Exchange {',
            '    features: Dict = undefined;',
            '    safeDict (d: any, k: any, dflt: any = undefined): any { return d; }',
            '    omit (d: any, k: any): any { return d; }',
            '    parseThing (x: any): any { return x; }',
            `    pick (marketType: string, methodName: string, raw: any): any { ${body} }`,
            '}',
            '',
        ].join('\n'));
        fs.writeFileSync(path.join(tmp, 'ts', 'src', 'venue.ts'), "import Exchange from './base/Exchange.js';\n" + venue + '\n');
        const t = new Transpiler({ verbose: false, rust: { parser: { NUM_LINES_END_FILE: 0 } } });
        const out = t.transpileRustByPath(path.join(tmp, 'ts', 'src', 'base', 'Exchange.ts')).content;
        fs.rmSync(tmp, { recursive: true, force: true });
        return out;
    };
    const NATIVE = '(if let (Some(__m), Some(__k)) = (methodsContainer.as_map(), methodName.as_str()) { __m.get(__k).cloned().unwrap_or(Value::Null) } else { Value::Null })';

    test('positive: safeDict of this.features, reassigned through safeDict', () => {
        const out = setup('let methodsContainer = this.safeDict (this.features, marketType); if (methodsContainer === undefined) { return undefined; } methodsContainer = this.safeDict (methodsContainer, "linear"); return methodsContainer[methodName];');
        expect(out).toContain(NATIVE);
        expect(out).not.toContain('get_value(&methodsContainer, &methodName)');
    });

    test('negative: one write is a raw parameter value', () => {
        const out = setup('let methodsContainer = this.safeDict (this.features, marketType); methodsContainer = raw; return methodsContainer[methodName];');
        expect(out).not.toContain(NATIVE);
    });

    test('negative: one write is an unproven callee result', () => {
        const out = setup('let methodsContainer = this.safeDict (this.features, marketType); methodsContainer = this.parseThing (raw); return methodsContainer[methodName];');
        expect(out).not.toContain(NATIVE);
    });

    test('negative: a computed-key write into the local', () => {
        const out = setup('const methodsContainer = this.safeDict (this.features, marketType); methodsContainer[marketType] = raw; return methodsContainer[methodName];');
        expect(out).not.toContain(NATIVE);
    });

    test('negative: a marker-key write into the local', () => {
        const out = setup('const methodsContainer = this.safeDict (this.features, marketType); methodsContainer["subscriptions"] = raw; return methodsContainer[methodName];');
        expect(out).not.toContain(NATIVE);
    });
});
