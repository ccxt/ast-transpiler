import { Transpiler } from '../src/transpiler';

jest.mock('module', () => ({ __esModule: true, default: jest.fn() }));

// A `Dict` parameter read by the elements of its own `Object.keys` list reads the shadow map.
describe('rust Dict parameter keyed by its own key list', () => {
    const transpiler = new Transpiler({ verbose: false, rust: { parser: { NUM_LINES_END_FILE: 0 } } });
    const DICT_DECL = 'interface Dictionary<T> { [key: string]: T; }\ntype Dict = Dictionary<any>;\n';
    const cls = (body: string) => DICT_DECL + 'class C {\n    f (dict: Dict): Dict {\n' + body + '\n    }\n}';
    test('positive: dict[keys[i]] over Object.keys (dict)', () => {
        const output = transpiler.transpileRust(cls([
            '        const reversed: Dict = {};',
            '        const keys = Object.keys (dict);',
            '        for (let i = 0; i < keys.length; i++) {',
            '            const key = keys[i];',
            '            const value = dict[key];',
            '            if (typeof value === \'string\') {',
            '                reversed[value] = key;',
            '            }',
            '        }',
            '        return reversed;',
        ].join('\n'))).content;
        expect(output).toContain('let dict = dict.as_map().unwrap_or(&__dict_empty);');
        expect(output).not.toContain('object_keys(');
    });
    test('positive: the keyed read uses the shadow map itself (no as_map on the borrowed map)', () => {
        const output = transpiler.transpileRust(cls([
            '        const out: Dict = {};',
            '        const keys = Object.keys (dict);',
            '        for (let i = 0; i < keys.length; i++) {',
            '            const key = keys[i];',
            '            const value = dict[key];',
            '            out[key] = value;',
            '        }',
            '        return out;',
        ].join('\n'))).content;
        expect(output).toContain('let dict = dict.as_map().unwrap_or(&__dict_empty);');
        expect(output).not.toContain('(dict.as_map(), key');
        expect(output).toMatch(/dict\.get\(key\.as_deref\(\)\.unwrap_or\(""\)\)\.cloned\(\)\.unwrap_or\(Value::Null\)/);
    });
    test('negative: a key from another list keeps the box', () => {
        const output = transpiler.transpileRust(cls([
            '        const other = [ \'a\', \'b\' ];',
            '        const keys = Object.keys (dict);',
            '        const key = other[0];',
            '        return [ keys, dict[key] ] as any;',
        ].join('\n'))).content;
        expect(output).not.toContain('__dict_empty');
    });
    test('negative: the parameter is written', () => {
        const output = transpiler.transpileRust(cls([
            '        const keys = Object.keys (dict);',
            '        const key = keys[0];',
            '        dict[key] = 1;',
            '        return dict;',
        ].join('\n'))).content;
        expect(output).not.toContain('__dict_empty');
    });
    test('negative: a key list of another map keeps the box', () => {
        const output = transpiler.transpileRust(cls([
            '        const m: Dict = { \'x\': 1 };',
            '        const keys = Object.keys (m);',
            '        const all = Object.keys (dict);',
            '        const key = keys[0];',
            '        return [ all, dict[key] ] as any;',
        ].join('\n'))).content;
        expect(output).not.toContain('__dict_empty');
    });
});
