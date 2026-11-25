import { Transpiler } from '../src/transpiler';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

jest.mock('module', () => ({ __esModule: true, default: jest.fn() }));

const BASE = [
    'export default class Exchange {',
    '    safeValueN (d: any, k: any, def: any = undefined): any { return d; }',
    '    safeListN (dictionaryOrList: any, keys: any[], defaultValue: any[]): any[];',
    '    safeListN (dictionaryOrList: any, keys: any[], defaultValue?: any[]): any[] | undefined;',
    '    safeListN (dictionaryOrList: any, keys: any[], defaultValue: any[] = undefined): any[] | undefined {',
    '        const value = this.safeValueN (dictionaryOrList, keys, defaultValue);',
    '        if (value === undefined) {',
    '            return defaultValue;',
    '        }',
    '        if (Array.isArray (value)) {',
    '            return value;',
    '        }',
    '        return defaultValue;',
    '    }',
    '}',
    '',
].join('\n');

const venue = (body: string) => [
    "import Exchange from './base/Exchange.js';",
    'export default class venue extends Exchange {',
    body,
    '}',
    '',
].join('\n');

describe('rust safeListN answers Option<List> natively', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'h49r59-'));
    afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));
    fs.mkdirSync(path.join(tmp, 'ts', 'src', 'base'), { recursive: true });
    const baseFile = path.join(tmp, 'ts', 'src', 'base', 'Exchange.ts');
    fs.writeFileSync(baseFile, BASE);
    const run = (name: string, text: string) => {
        const t = new Transpiler({ verbose: false, rust: { parser: { NUM_LINES_END_FILE: 0 } } });
        const file = path.join(tmp, 'ts', 'src', name + '.ts');
        fs.writeFileSync(file, text);
        return t.transpileRustByPath(file).content;
    };
    test('the base method prints -> Option<List>', () => {
        const t = new Transpiler({ verbose: false, rust: { parser: { NUM_LINES_END_FILE: 0 } } });
        const out = t.transpileRustByPath(baseFile).content;
        expect(out).toMatch(/fn (?:safe_list_n|safeListN)\([^)]*\) -> Option<crate::value::List>/);
        expect(out).toContain('if let Value::Arr(__l) = value { Some(__l) } else { None }');
    });
    test('a no-default local takes the call as is, no into_opt_list', () => {
        const out = run('v1', venue("    f (params: any) {\n        const ids = this.safeListN (params, [ 'a', 'b' ]);\n        if (ids !== undefined) {\n            return ids.length;\n        }\n        return 0;\n    }"));
        expect(out).toMatch(/let (mut )?ids: Option<crate::value::List> = self\.(?:safe_list_n|safeListN)\(&?params, [^;]*\);/);
        expect(out).not.toContain('into_opt_list');
    });
    test('negative: a Value slot boxes the call once (None stays Null)', () => {
        const out = run('v2', venue("    f (params: any) {\n        return this.safeListN (params, [ 'a' ]);\n    }"));
        expect(out).toContain('.map_or(Value::Null, Value::Arr)');
        expect(out).not.toContain('into_opt_list');
    });
    test('negative: a [] default keeps the empty list for a missing key', () => {
        const out = run('v3', venue("    f (params: any) {\n        const rows = this.safeListN (params, [ 'a' ], []);\n        return rows.length;\n    }"));
        expect(out).not.toContain('.map_or(Value::Null, Value::Arr).into_list()');
    });
});
