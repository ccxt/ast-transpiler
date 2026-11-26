import { Transpiler } from '../src/transpiler';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

jest.mock('module', () => ({ __esModule: true, default: jest.fn() }));

const BASE = [
    'export interface Dict { [key: string]: any }',
    'export type Str = string | undefined;',
    'export type List = any[];',
    'export type NullableList = List | undefined;',
    'export default class Exchange {',
    '    options: Dict = {};',
    '    safeString (d: any, k: any, def: Str = undefined): Str { return d[k] ?? def; }',
    '    safeDict (d: any, k: any, def: Dict = undefined): Dict | undefined { return d[k] ?? def; }',
    '    safeList (d: any, k: any, def: List = undefined): List | undefined { return d[k] ?? def; }',
    '    hold (x: any): any { return x; }',
    '    inArray (n: any, h: any[]): boolean { return h.includes (n); }',
    '}',
    '',
].join('\n');

const venue = (body: string) => [
    "import Exchange, { Dict, Str, List, NullableList } from './base/Exchange.js';",
    'export default class venue extends Exchange {',
    '    probe (params: Dict = {}): any {',
    body,
    '    }',
    '}',
    '',
].join('\n');

const TYPES_BODY = [
    '        let types: NullableList = undefined;',
    "        const fetchMarketsOptions = this.safeDict (this.options, 'fetchMarkets');",
    "        const defaultTypes = [ 'spot', 'swap' ];",
    '        if (fetchMarketsOptions !== undefined) {',
    "            types = this.safeList (fetchMarketsOptions, 'types', defaultTypes);",
    '        } else {',
    "            types = this.safeList (this.options, 'fetchMarkets', defaultTypes);",
    '        }',
    '        const out = [];',
    '        for (let i = 0; i < types.length; i++) {',
    '            const type = this.safeString (types, i);',
    '            out.push (type);',
    '        }',
    '        return out;',
].join('\n');

describe('a nil-declared list local filled by safeList with a list-literal local default', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'h54r43-'));
    afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));
    fs.mkdirSync(path.join(tmp, 'ts', 'src', 'base'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'ts', 'src', 'base', 'Exchange.ts'), BASE);
    const run = (name: string, text: string) => {
        const t = new Transpiler({ verbose: false, rust: { parser: { NUM_LINES_END_FILE: 0 } } } as any);
        const file = path.join(tmp, 'ts', 'src', name + '.ts');
        fs.writeFileSync(file, text);
        return t.transpileRustByPath(file).content;
    };
    test('positive: both writes `safeList (o, k, defaultTypes)` (const list-literal default) type the nil local', () => {
        const out = run('p1', venue(TYPES_BODY));
        expect(out).toMatch(/let mut types: Option<crate::value::List> = None;/);
        expect(out).toMatch(/types = self\.safe_list_k\(&fetchMarketsOptions, "types", &\[defaultTypes\.clone\(\)\]\)\.into_opt_list\(\);/);
        expect(out).not.toMatch(/let (mut )?types: Value\b/);
    });
    test('positive: an `inArray` read and a push on the local keep the typed list', () => {
        const out = run('p2', venue(TYPES_BODY.replace('        const out = [];', "        if (!this.inArray ('option', types)) {\n            types.push ('option');\n        }\n        const out = [];")));
        expect(out).toMatch(/types = self\.safe_list_k\(/);
    });
    test('negative: a default that is a `let` local (may be rewritten) keeps the box', () => {
        const out = run('n1', venue(TYPES_BODY.replace("const defaultTypes = [", "let defaultTypes = [")));
        expect(out).toMatch(/let mut types: Value = Value::Null;/);
    });
    test('negative: a const default seeded by a call (may be undefined) keeps the box', () => {
        const out = run('n2', venue(TYPES_BODY.replace("const defaultTypes = [ 'spot', 'swap' ];", "const defaultTypes = this.safeList (params, 'd');")));
        expect(out).toMatch(/let mut types: Value = Value::Null;/);
    });
});
