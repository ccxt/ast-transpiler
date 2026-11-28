import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Transpiler } from '../src/transpiler';

jest.mock('module', () => ({ __esModule: true, default: jest.fn() }));

describe('h51-R43: rust groupBy / indexBy local handed whole to a base parse method', () => {
    const BASE = [
        'export interface Dict { [key: string]: any }',
        'export type List = Array<any>;',
        'export type Strings = string[] | undefined;',
        'export type Str = string | undefined;',
        'export interface DepositWithdrawFees extends Dictionary<any> {}',
        'const groupBy = (x: Dictionary<any> | undefined, k: string, out: Dictionary<any> = {}): Dictionary<any> => out;',
        'export interface Dictionary<T> { [key: string]: T }',
        'const indexBy = (x: any, k: string, out: Dict = {}): Dict => out;',
        'export default class Exchange {',
        '    groupBy = groupBy;',
        '    indexBy = indexBy;',
        '    safeList (d: any, k: any, def: any = undefined): any { return d[k] ?? def; }',
        '    // METHODS BELOW THIS LINE ARE TRANSPILED FROM TYPESCRIPT',
        '    parseDepositWithdrawFees (response: any, codes: Strings = undefined, currencyIdKey: Str = undefined): Dict { return response; }',
        '    override_dummy = 0;',
        '    async privateGetX (p: any): Promise<any> { return []; }',
        '    async fetchDepositWithdrawFees (codes: Strings = undefined, params: Dict = {}): Promise<DepositWithdrawFees> { return {}; }',
        '}',
        '',
    ].join('\n');
    const src = (body: string) => [
        "import Exchange from './base/Exchange.js';",
        "import type { Dict, List, Strings, DepositWithdrawFees } from './base/Exchange.js';",
        'export default class venue extends Exchange {',
        '    override async fetchDepositWithdrawFees (codes: Strings = undefined, params: Dict = {}): Promise<DepositWithdrawFees> {',
        '        const response = await this.privateGetX (params);',
        "        const data = this.safeList (response, 'data', []);",
        body,
        '    }',
        '}',
        '',
    ].join('\n');
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'h51r43-'));
    afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));
    fs.mkdirSync(path.join(tmp, 'ts', 'src', 'base'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'ts', 'src', 'base', 'Exchange.ts'), BASE);
    const run = (name: string, text: string) => {
        const t = new Transpiler({ verbose: false, rust: { typedUnified: ['fetchDepositWithdrawFees'], virtualDispatch: {}, parser: { NUM_LINES_END_FILE: 0 } } });
        const file = path.join(tmp, 'ts', 'src', name + '.ts');
        fs.writeFileSync(file, text);
        return t.transpileRustByPath(file).content;
    };
    const BODY = "        const byId = this.groupBy (data, 'currency');\n        return this.parseDepositWithdrawFees (byId, codes) as DepositWithdrawFees;";
    test('a groupBy map lent to a plural parser rows slot is a typed map local (fails on the base printer)', () => {
        const out = run('venueA', src(BODY));
        expect(out).toContain('let mut byId: crate::value::Dict = self.groupBy(');
        expect(out).toContain('self.parseDepositWithdrawFees(&byId, ');
        expect(out).not.toContain('let mut byId: Value');
    });
    test('the same for indexBy', () => {
        const out = run('venueB', src(BODY.replace('groupBy', 'indexBy')));
        expect(out).toContain('let mut byId: crate::value::Dict = self.indexBy(');
        expect(out).toContain('self.parseDepositWithdrawFees(&byId, ');
    });
    test('negative: a venue helper of the same name that may answer a non-map keeps the box', () => {
        const venue = src(BODY).replace('export default class venue extends Exchange {', "export default class venue extends Exchange {\n    groupBy (x: any, k: string): any { return x; }");
        const out = run('venueC', venue);
        expect(out).toContain('let mut byId: Value');
    });
    test('negative: an any-typed producer handed to the same slot keeps the box', () => {
        const out = run('venueD', src("        const byId = this.safeList (response, 'x');\n        return this.parseDepositWithdrawFees (byId, codes) as DepositWithdrawFees;"));
        expect(out).not.toContain('let mut byId: crate::value::Dict');
    });
});

