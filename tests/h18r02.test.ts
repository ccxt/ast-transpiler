import { Transpiler } from '../src/transpiler';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

jest.mock('module', () => ({ __esModule: true, default: jest.fn() }));

const BASE = [
    'export interface Dict { [key: string]: any }',
    'export type NullableDict = Dict | undefined;',
    'export default class Exchange {',
    '    safeValueN (d: any, k: any, def: any = undefined): any { return d; }',
    '    isDictionary (x: any): boolean { return true; }',
    '    safeDictN (dictionaryOrList: any, keys: any[], defaultValue: NullableDict = undefined): Dictionary<any> | undefined {',
    '        const value = this.safeValueN (dictionaryOrList, keys, defaultValue);',
    '        if (this.isDictionary (value)) {',
    '            return value;',
    '        }',
    '        return defaultValue;',
    '    }',
    '}',
    '',
].join('\n');

const venue = (body: string) => [
    "import Exchange from '../base/Exchange.js';",
    'export default class venue extends Exchange {',
    '    check (o: any) { return o === undefined; }',
    body,
    '}',
    '',
].join('\n');

describe('rust safeDictN through overload signatures', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'h18r02o-'));
    afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));
    fs.mkdirSync(path.join(tmp, 'ts', 'src', 'base'), { recursive: true });
    fs.mkdirSync(path.join(tmp, 'ts', 'src', 'pro'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'ts', 'src', 'base', 'Exchange.ts'), BASE.replace('    safeDictN (dictionaryOrList: any, keys: any[], defaultValue: NullableDict', "    safeDictN (dictionaryOrList: any, keys: any[], defaultValue: Dictionary<any>): Dictionary<any>;\n    safeDictN (dictionaryOrList: any, keys: any[], defaultValue?: Dictionary<any>): Dictionary<any> | undefined;\n    safeDictN (dictionaryOrList: any, keys: any[], defaultValue: NullableDict"));
    test('a venue call resolved through an overload takes Option<Dict>', () => {
        const t = new Transpiler({ verbose: false, rust: { parser: { NUM_LINES_END_FILE: 0 } } });
        const file = path.join(tmp, 'ts', 'src', 'pro', 'o1.ts');
        fs.writeFileSync(file, venue("    f (message: any) {\n        const data = this.safeDictN (message, [ 'd', 'data' ]);\n        if (data === undefined) {\n            return undefined;\n        }\n        return data['x'];\n    }"));
        const out = t.transpileRustByPath(file).content;
        expect(out).not.toContain('into_opt_dict');
    });
});

describe('rust safeDictN answers Option<Dict> natively', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'h18r02-'));
    afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));
    fs.mkdirSync(path.join(tmp, 'ts', 'src', 'base'), { recursive: true });
    fs.mkdirSync(path.join(tmp, 'ts', 'src', 'pro'), { recursive: true });
    const baseFile = path.join(tmp, 'ts', 'src', 'base', 'Exchange.ts');
    fs.writeFileSync(baseFile, BASE);
    const run = (name: string, text: string) => {
        const t = new Transpiler({ verbose: false, rust: { parser: { NUM_LINES_END_FILE: 0 } } });
        const file = path.join(tmp, 'ts', 'src', 'pro', name + '.ts');
        fs.writeFileSync(file, text);
        return t.transpileRustByPath(file).content;
    };
    test('base declaration returns Option<Dict>', () => {
        const t = new Transpiler({ verbose: false, rust: { parser: { NUM_LINES_END_FILE: 0 } } });
        const out = t.transpileRustByPath(baseFile).content;
        expect(out).toMatch(/fn (?:safe_dict_n|safeDictN)\([^)]*\) -> Option<crate::value::Dict>/);
        expect(out).toContain('if let Value::Dict(__m) = value { Some(__m) } else { None }');
    });
    test('an optional map local takes the call without into_opt_dict', () => {
        const out = run('v1', venue("    f (message: any) {\n        const data = this.safeDictN (message, [ 'd', 'data' ]);\n        if (data === undefined) {\n            return undefined;\n        }\n        return data['x'];\n    }"));
        expect(out).toMatch(/let (?:mut )?data: Option<crate::value::Dict> = self\.(?:safe_dict_n|safeDictN)\([^\n]*\);/);
        expect(out).not.toContain('into_opt_dict');
    });
    test('negative: a Value slot boxes the result once (None -> Null)', () => {
        const out = run('v2', venue("    g (message: any) {\n        this.check (this.safeDictN (message, [ 'd' ]));\n    }"));
        expect(out).toContain('.map_or(Value::Null, Value::Dict)');
    });
    test('negative: a default-carrying call into a Dict local answers the empty map for None', () => {
        const out = run('v3', venue("    h (order: any) {\n        const entry = this.safeDictN (order, [ 'a', 'b' ], order);\n        return entry['x'];\n    }"));
        expect(out).not.toMatch(/(?:safe_dict_n|safeDictN)\([^\n]*\)\.into_dict\(\)/);
    });
});

const ROW_BASE = [
    'export interface Dict { [key: string]: any }',
    'export type Str = string | undefined;',
    'export type NullableDict = Dict | undefined;',
    'export default class Exchange {',
    '    orders: any = undefined;',
    '    safeValueN (d: any, k: any, def: any = undefined): any { return d; }',
    '    isDictionary (x: any): boolean { return true; }',
    '    safeDict (d: any, k: any, def: Dict = undefined): Dict { return d[k] ?? def; }',
    '    safeDictN (dictionaryOrList: any, keys: any[], defaultValue: NullableDict = undefined): Dictionary<any> | undefined {',
    '        const value = this.safeValueN (dictionaryOrList, keys, defaultValue);',
    '        if (this.isDictionary (value)) {',
    '            return value;',
    '        }',
    '        return defaultValue;',
    '    }',
    '}', ''].join('\n');

const row = (bucketDecl: string, rewrite: string) => [
    "import Exchange, { Dict, Str } from '../base/Exchange.js';",
    'export default class venue extends Exchange {',
    '    handleOrder (symbol: Str, orderId: Str, a: Str, b: Str, fee: any) {',
    '        const orders = this.orders;',
    `        ${bucketDecl} previousOrders = this.safeDict (orders.hashmap, symbol, {});`,
    '        let previousOrder = this.safeDict (previousOrders, orderId);',
    '        if (previousOrder === undefined) {',
    `            previousOrder = ${rewrite};`,
    '        }',
    '        if (previousOrder === undefined) {',
    '            orders.append (fee);',
    '        } else {',
    "            previousOrder['fee'] = fee;",
    '            previousOrder[symbol] = fee;',
    '            orders.append (previousOrder);',
    '        }',
    '    }',
    '}', ''].join('\n');

describe('a cache row rewritten by safeDictN of its own bucket stays Option<Dict>', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'h18r02r-'));
    afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));
    fs.mkdirSync(path.join(tmp, 'ts', 'src', 'base'), { recursive: true });
    fs.mkdirSync(path.join(tmp, 'ts', 'src', 'pro'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'ts', 'src', 'base', 'Exchange.ts'), ROW_BASE);
    const run = (name: string, text: string) => {
        const t = new Transpiler({ verbose: false, rust: { parser: { NUM_LINES_END_FILE: 0 } } });
        const file = path.join(tmp, 'ts', 'src', 'pro', name + '.ts');
        fs.writeFileSync(file, text);
        return t.transpileRustByPath(file).content;
    };
    test('rewrite takes the native Option and the row write is native', () => {
        const out = run('r1', row('const', 'this.safeDictN (previousOrders, [ a, b ])'));
        expect(out).toMatch(/let mut previousOrder: Option<crate::value::Dict>/);
        expect(out).toMatch(/\n\s*previousOrder = self\.(?:safe_dict_n|safeDictN)\(&previousOrders, [^\n]*\);/);
        expect(out).toContain('if let Some(__d) = &mut previousOrder { std::sync::Arc::make_mut(__d).insert("fee".into(), fee');
        expect(out).toContain('previousOrder.map_or(Value::Null, Value::Dict)');
    });
    test('negative: a let bucket keeps the boxed row', () => {
        const out = run('r2', row('let', 'this.safeDictN (previousOrders, [ a, b ])'));
        expect(out).toMatch(/add_element_to_object\(&mut previousOrder, &Value::Str\("fee"/);
    });
    test('negative: a rewrite with a default keeps the boxed row', () => {
        const out = run('r3', row('const', 'this.safeDictN (previousOrders, [ a, b ], fee)'));
        expect(out).toMatch(/add_element_to_object\(&mut previousOrder, &Value::Str\("fee"/);
    });
});
