import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Transpiler } from '../src/transpiler';

jest.mock('module', () => ({ __esModule: true, default: jest.fn() }));

describe('rust keysort map local read by a key whose bound element is later rebound', () => {
    const BASE = [
        'export interface Dict { [key: string]: any }',
        'export type Str = string | undefined;',
        'export default class Exchange {',
        '    keysort (d: Dict): Dict { return d; }',
        '}',
        '',
    ].join('\n');
    const src = (decl: string, body: string) => [
        "import Exchange from './base/Exchange.js';",
        "import type { Dict, Str } from './base/Exchange.js';",
        'export default class venue extends Exchange {',
        '    customEncode (params: Dict): Str {',
        '        const sortedParams: Dict = this.keysort (params);',
        '        const rawKeys = Object.keys (sortedParams);',
        '        const rawKeysLength = rawKeys.length;',
        '        let result: Str = undefined;',
        '        for (let i = 0; i < rawKeysLength; i++) {',
        '            const key = rawKeys[i];',
        `            ${decl}`,
        `            ${body}`,
        "            result = key + '=' + value;",
        '        }',
        '        return result;',
        '    }',
        '}',
        '',
    ].join('\n');
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'h26r12-'));
    afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));
    fs.mkdirSync(path.join(tmp, 'ts', 'src', 'base'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'ts', 'src', 'base', 'Exchange.ts'), BASE);
    const run = (name: string, text: string) => {
        const t = new Transpiler({ verbose: false, rust: { parser: { NUM_LINES_END_FILE: 0 } } });
        const file = path.join(tmp, 'ts', 'src', name + '.ts');
        fs.writeFileSync(file, text);
        return t.transpileRustByPath(file).content;
    };
    test('a rebound element of a keysort map reads natively (fails on the base printer)', () => {
        const out = run('venueA', src('let value = sortedParams[key];', "if (Array.isArray (value)) { value = 'x'; }"));
        expect(out).not.toContain('get_value(&sortedParams');
        expect(out).toContain('let mut value: Value = sortedParams.get(key.as_deref().unwrap_or("")).cloned().unwrap_or(Value::Null);');
    });
    test('negative: a keyed write through the bound element keeps the helper bind (write-back)', () => {
        const out = run('venueB', src('const value = sortedParams[key];', "value['x'] = 1;"));
        expect(out).toContain('let mut value: Value = get_value(&sortedParams, ');
    });
    test('negative: a push into the bound element keeps the helper bind (write-back)', () => {
        const out = run('venueC', src('const value = sortedParams[key];', 'value.push (1);'));
        expect(out).toContain('let mut value: Value = get_value(&sortedParams, ');
    });
    test('negative: a nil-tested rebound element still reads the missing key as Null', () => {
        const out = run('venueD', src('let value = sortedParams[key];', "if (value === undefined) { value = ''; }"));
        expect(out).toContain('.cloned().unwrap_or(Value::Null)');
        expect(out).toContain('value == Value::Null');
    });
});
