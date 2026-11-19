import { Transpiler } from '../src/transpiler';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

jest.mock('module', () => ({ __esModule: true, default: jest.fn() }));

const base = [
    'export interface Dict { [key: string]: any }',
    'export type Str = string | undefined;',
    'export default class PredictionExchange {',
    '    outcomes: Dict = undefined;',
    '    outcome (outcomeSymbol: Str): any {',
    '        if (outcomeSymbol === undefined) { return undefined; }',
    '        return this.outcomes[outcomeSymbol];',
    '    }',
    '    hasOutcome (outcomeIdOrSymbol: Str): boolean {',
    '        return (this.outcomes !== undefined) && (outcomeIdOrSymbol in this.outcomes);',
    '    }',
    '    other (outcomeSymbol: Str): any {',
    '        return this.outcomes[outcomeSymbol];',
    '    }',
    '    run (s: string) {',
    '        const a = this.hasOutcome (s);',
    '        const b = this.other (s);',
    '        return this.outcome (s);',
    '    }',
    '}',
    '',
].join('\n');

describe('prediction outcome lookups lend their handle as Option<&str>', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'h14b16-'));
    afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));
    let out = '';
    let outElsewhere = '';
    beforeAll(() => {
        const t = new Transpiler({ verbose: false, rust: { parser: { NUM_LINES_END_FILE: 0 } } });
        const file = path.join(tmp, 'ts', 'src', 'base', 'PredictionExchange.ts');
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, base);
        out = t.transpileRustByPath(file).content;
        const other = path.join(tmp, 'ts', 'src', 'base', 'Other.ts');
        fs.writeFileSync(other, base);
        outElsewhere = t.transpileRustByPath(other).content;
    });
    test('outcome and hasOutcome take Option<&str>', () => {
        expect(out).toMatch(/fn outcome\(&self, outcomeSymbol: Option<&str>\)/);
        expect(out).toMatch(/fn hasOutcome\(&self, outcomeIdOrSymbol: Option<&str>\)/);
    });
    test('callers lend the string instead of cloning it', () => {
        expect(out).toContain('return self.outcome(s.as_str());');
    });
    test('a method outside the table keeps the Value slot', () => {
        expect(out).not.toMatch(/fn other\(&self, outcomeSymbol: Option<&str>\)/);
    });
    test('the same names outside the prediction base keep the Value slot', () => {
        expect(outElsewhere).not.toMatch(/fn outcome\(&self, outcomeSymbol: Option<&str>\)/);
    });
});
