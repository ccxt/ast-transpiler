import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Transpiler } from '../src/transpiler';

jest.mock('module', () => ({ __esModule: true, default: jest.fn() }));

describe('h26-R10: rust dynamic-key write on a Dict-annotated REST local built from fresh maps', () => {
    const BASE = [
        'export interface Dict { [key: string]: any }',
        'export type List = Array<any>;',
        'export type Str = string | undefined;',
        'const groupBy = (x: Dict | undefined, k: string, out: Dict = {}): Dict => out;',
        'export default class Exchange {',
        '    groupBy = groupBy;',
        '    extend (...args: any[]): any { return Object.assign ({}, ...args); }',
        '    safeString (d: any, k: any, def: Str = undefined): Str { return d[k] ?? def; }',
        '    anyThing (x: any): any { return x; }',
        '    async fetchX (p: any): Promise<List> { return []; }',
        '}',
        '',
    ].join('\n');
    const src = (rebind: string) => [
        "import Exchange from './base/Exchange.js';",
        "import type { Dict, List } from './base/Exchange.js';",
        'export default class venue extends Exchange {',
        '    async fetchTiers (params: Dict = {}) {',
        "        const contract = this.safeString (params, 'contract', '');",
        '        let tiers: Dict = {};',
        '        while (true) {',
        '            const response: List = await this.fetchX (params);',
        '            let grouped: Dict = {};',
        "            if (contract !== '') {",
        '                grouped[contract] = response;',
        '            } else {',
        `                ${rebind}`,
        '            }',
        '            tiers = this.extend (tiers, grouped);',
        '            const contracts = Object.keys (grouped);',
        '            if (contracts.length < 3) { break; }',
        '        }',
        '        return tiers;',
        '    }',
        '}',
        '',
    ].join('\n');
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'h26r10-'));
    afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));
    fs.mkdirSync(path.join(tmp, 'ts', 'src', 'base'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'ts', 'src', 'base', 'Exchange.ts'), BASE);
    const run = (name: string, text: string) => {
        const t = new Transpiler({ verbose: false, rust: { parser: { NUM_LINES_END_FILE: 0 } } });
        const file = path.join(tmp, 'ts', 'src', name + '.ts');
        fs.writeFileSync(file, text);
        return t.transpileRustByPath(file).content;
    };
    test('literal-built Dict local rebound to groupBy: the string-key write inserts natively with no key clone (fails on the base printer)', () => {
        const out = run('venueA', src("grouped = this.groupBy (response, 'contract');"));
        expect(out).not.toContain('add_element_to_object(&mut grouped');
        expect(out).toContain('if let Value::Dict(__d) = &mut grouped { std::sync::Arc::make_mut(__d).insert(contract.to_string(), response.clone()); }');
    });
    test('negative: a rebind from a non-copy call (any) keeps the helper', () => {
        const out = run('venueB', src('grouped = this.anyThing (response);'));
        expect(out).toContain('add_element_to_object(&mut grouped, &contract');
    });
    test('negative: a rebind to a non-dict value keeps the helper', () => {
        const out = run('venueC', src('grouped = [] as any;'));
        expect(out).toContain('add_element_to_object(&mut grouped, &contract');
    });
});
