import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Transpiler } from '../src/transpiler';

jest.mock('module', () => ({ __esModule: true, default: jest.fn() }));

describe('rust keyed write on a Dict-annotated REST local built from fresh maps', () => {
    const BASE = [
        'export interface Dict { [key: string]: any }',
        'export type Int = number | undefined;',
        'export default class Exchange {',
        '    options: Dict = {};',
        '    extend (...args: any[]): any { return Object.assign ({}, ...args); }',
        '    safeDict (d: any, k: any, def: any = undefined): any { return d[k] ?? def; }',
        '    safeInteger (d: any, k: any, def: Int = undefined): Int { return d[k] ?? def; }',
        '    nonce (): number { return 1; }',
        '    urlencode (d: Dict): string { return String (d); }',
        '}',
        '',
    ].join('\n');
    const src = (decl: string, branch: string, write: string) => [
        "import Exchange, { Dict } from './base/Exchange.js';",
        'export default class venue extends Exchange {',
        '    sign (params: Dict, section: string, key: string) {',
        `        ${decl}`,
        "        if (section === 'broker') {",
        `            ${branch}`,
        '        } else {',
        `            ${write}`,
        '        }',
        '        return this.urlencode (urlParams);',
        '    }',
        '}',
        '',
    ].join('\n');
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'h23r02-'));
    afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));
    fs.mkdirSync(path.join(tmp, 'ts', 'src', 'base'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'ts', 'src', 'base', 'Exchange.ts'), BASE);
    const run = (name: string, text: string) => {
        const t = new Transpiler({ verbose: false, rust: { parser: { NUM_LINES_END_FILE: 0 } } });
        const file = path.join(tmp, 'ts', 'src', name + '.ts');
        fs.writeFileSync(file, text);
        return t.transpileRustByPath(file).content;
    };
    const STAMP = "urlParams['timestamp'] = this.nonce ();";
    test('extend-initialised Dict local rebound to a literal: the literal-key write inserts natively (fails on the base printer)', () => {
        const out = run('venueA', src('let urlParams: Dict = this.extend (params, {});', "urlParams = { 'a': 1 };", STAMP));
        expect(out).not.toContain('add_element_to_object(&mut urlParams');
        expect(out).toContain('if let Value::Dict(__d) = &mut urlParams { std::sync::Arc::make_mut(__d).insert("timestamp".into()');
    });
    test('negative: a rebind from a non-copy call keeps the helper', () => {
        const out = run('venueB', src('let urlParams: Dict = this.extend (params, {});', "urlParams = this.safeDict (params, 'x', {});", STAMP));
        expect(out).toContain('add_element_to_object(&mut urlParams');
    });
    test('negative: a local that can be undefined (rebound to undefined) keeps the helper', () => {
        const out = run('venueC', src('let urlParams: Dict = this.extend (params, {});', 'urlParams = undefined;', STAMP));
        expect(out).toContain('add_element_to_object(&mut urlParams');
    });
    test('negative: an unannotated local keeps the helper', () => {
        const out = run('venueD', src('let urlParams = this.extend (params, {});', "urlParams = { 'a': 1 };", STAMP));
        expect(out).toContain('add_element_to_object(&mut urlParams');
    });
    test('negative: a dynamic key keeps the helper (a native key would add a clone)', () => {
        const out = run('venueE', src('let urlParams: Dict = this.extend (params, {});', "urlParams = { 'a': 1 };", 'urlParams[key] = this.nonce ();'));
        expect(out).toContain('add_element_to_object(&mut urlParams');
    });
});
