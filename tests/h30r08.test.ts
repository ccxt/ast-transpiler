import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Transpiler } from '../src/transpiler';

jest.mock('module', () => ({ __esModule: true, default: jest.fn() }));

// `xs[i] = f (xs[i])` on a list local: the write binds its value first, so the row read prints natively.
describe('rust native row read inside a write-back into the same list', () => {
    const setup = (body: string) => {
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'h30r08-'));
        fs.mkdirSync(path.join(tmp, 'ts', 'src', 'base'), { recursive: true });
        fs.writeFileSync(path.join(tmp, 'ts', 'src', 'base', 'Exchange.ts'), [
            'export interface Dict { [key: string]: any }',
            'export default class Exchange {',
            '    parseFeeNumeric (fee: any) { fee["cost"] = 1; return fee; }',
            '    reduceFeesByCurrency (fees: any): Dict[] { return fees; }',
            `    foo (fees: any, raw: any): any { ${body} }`,
            '}',
            '',
        ].join('\n'));
        fs.writeFileSync(path.join(tmp, 'ts', 'src', 'venue.ts'), "import Exchange from './base/Exchange.js';\nexport default class venue extends Exchange {}\n");
        const t = new Transpiler({ verbose: false, rust: { parser: { NUM_LINES_END_FILE: 0 } } });
        const out = t.transpileRustByPath(path.join(tmp, 'ts', 'src', 'base', 'Exchange.ts')).content;
        fs.rmSync(tmp, { recursive: true, force: true });
        return out;
    };
    const NATIVE = 'xs.as_array().map(Vec::as_slice).unwrap_or_default().get(i as usize).cloned().unwrap_or(Value::Null)';
    const loop = (stmt: string) => `const xs = this.reduceFeesByCurrency (fees); for (let i = 0; i < xs.length; i++) { ${stmt} } return xs;`;

    test('positive: xs[i] = f (xs[i]) on a Dict[] local', () => {
        const out = setup(loop('xs[i] = this.parseFeeNumeric (xs[i]);'));
        expect(out).toContain(`let __be_tmp = self.parseFeeNumeric(${NATIVE})`);
        expect(out).not.toContain('get_value(&xs, &Value::Int(i))');
    });

    test('negative: an untyped receiver keeps the helper', () => {
        const out = setup('for (let i = 0; i < raw.length; i++) { raw[i] = this.parseFeeNumeric (raw[i]); } return raw;');
        expect(out).toContain('get_value(&raw, &Value::Int(i))');
    });

    test('negative: the write targets another local', () => {
        const out = setup(loop('raw[i] = this.parseFeeNumeric (xs[i]);'));
        expect(out).not.toContain(`let __be_tmp = self.parseFeeNumeric(${NATIVE})`);
    });

    test('negative: a compound write keeps the helper form', () => {
        const out = setup(loop('xs[i] += xs[i];'));
        expect(out).not.toContain(`let __be_tmp = self.parseFeeNumeric(${NATIVE})`);
    });

    test('negative: a nested row write is left to the row-insert rules', () => {
        const out = setup(loop('xs[i]["cost"] = this.parseFeeNumeric (xs[i]);'));
        expect(out).not.toContain(`let __be_tmp = self.parseFeeNumeric(${NATIVE})`);
    });
});
