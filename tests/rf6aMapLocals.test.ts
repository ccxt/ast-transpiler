import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Transpiler } from '../src/transpiler';

// RF-go-6-A: type-keyed Go map-local rules (a Dict local seeded from safeDict is a map[string]any read with the
// typed twin; an element read on a map[string]any receiver with a Go string key is the native index).
const PRELUDE =
    'type Dict = { [key: string]: any };\n' +
    'type Str = string | undefined;\n' +
    'export class Exchange {\n' +
    '    options: Dict;\n' +
    '    fees: Dict;\n' +
    '    markets: Dict;\n' +
    '    safeDict (a: any, k: any, d: any = undefined): Dict { return a; }\n' +
    '    safeDict2 (a: any, k: any, k2: any, d: any = undefined): Dict { return a; }\n' +
    '    safeString (a: any, k: any, d: any = undefined): Str { return a; }\n' +
    '    safeValue (a: any, k: any, d: any = undefined): any { return a; }\n' +
    '    extend (a: any, b: any): Dict { return a; }\n';

const run = (members: string, dir = 'ts/src'): string => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rf6a-'));
    try {
        const src = path.join(tmp, dir);
        fs.mkdirSync(src, { recursive: true });
        const file = path.join(src, 'x.ts');
        fs.writeFileSync(file, PRELUDE + members + '}\n');
        const t = new Transpiler({ verbose: false, go: { parser: { NUM_LINES_END_FILE: 0 } } });
        return t.transpileGoByPath(file).content;
    } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
    }
};

describe('RF-go-6-A: safeDict-seeded Dict locals', () => {
    test('a never-nil default types the local and reads through SafeDictMap', () => {
        const out = run(
            '    f (p: Dict): any {\n' +
            '        const d = this.safeDict (p, "data", {});\n' +
            '        d["a"] = 1;\n' +
            '        const x = this.safeString (d, "k");\n' +
            '        return this.extend (d, {});\n' +
            '    }\n');
        expect(out).toContain('var d map[string]any = this.SafeDictMap(p, "data", map[string]any{})');
    });
    test('safeDict2 and a nested never-nil default', () => {
        const out = run(
            '    f (p: Dict): any {\n' +
            '        const a = this.safeDict2 (p, "a", "b", {});\n' +
            '        const b = this.safeDict (p, "data", this.safeDict (p, 0, {}));\n' +
            '        return [ a, b ];\n' +
            '    }\n');
        expect(out).toContain('var a map[string]any = this.SafeDict2Map(p, "a", "b", map[string]any{})');
        expect(out).toContain('var b map[string]any = this.SafeDictMap(p, "data", this.SafeDict(p, 0, map[string]any{}))');
    });
    test('a rebinding to another never-nil safeDict keeps one map type', () => {
        const out = run(
            '    f (p: Dict, c: boolean): any {\n' +
            '        let d = this.safeDict (this.fees, "a", {});\n' +
            '        if (c) {\n' +
            '            d = this.safeDict (this.fees, "b", {});\n' +
            '        }\n' +
            '        return this.safeString (d, "k");\n' +
            '    }\n');
        expect(out).toContain('var d map[string]any = this.SafeDictMap(this.Fees, "a", map[string]any{})');
        expect(out).toContain('d = this.SafeDictMap(this.Fees, "b", map[string]any{})');
    });
    test('a rebinding to anything else, an assertion-like use, an address or a non-nil compare keep the box', () => {
        for (const body of [
            'd = this.extend (d, {});\n return 1;',
            'const q = d.foo; return q;',
            'if (d === p) { return 1; }\n return 2;',
            'const q = typeof d; return q;',
            'return Array.isArray (d);',
        ]) {
            const out = run('    f (p: Dict): any {\n        let d = this.safeDict (p, "data", {});\n ' + body + '\n    }\n');
            expect(out).not.toContain('SafeDictMap');
        }
    });
    test('a computed default or a non-Dict-field container keeps the box', () => {
        expect(run('    f (p: Dict): any {\n        const d = this.safeDict (p, "data", this.fees);\n        return d;\n    }\n')).not.toContain('SafeDictMap');
        expect(run('    f (p: Dict): any {\n        const d = this.safeDict (this.markets, "data", {});\n        return d;\n    }\n')).not.toContain('SafeDictMap');
    });
    test('no default: a nil test, a safe read and a guarded block type the local, a bare use does not', () => {
        const typed = run(
            '    f (p: Dict): any {\n' +
            '        const d = this.safeDict (p, "data");\n' +
            '        if (d !== undefined) {\n' +
            '            d["a"] = 1;\n' +
            '            return this.safeString (d, "k");\n' +
            '        }\n' +
            '        return undefined;\n' +
            '    }\n');
        expect(typed).toContain('var d map[string]any = this.SafeDictMap(p, "data")');
        const bare = run('    f (p: Dict): any {\n        const d = this.safeDict (p, "data");\n        return d;\n    }\n');
        expect(bare).not.toContain('SafeDictMap');
        const write = run('    f (p: Dict): any {\n        const d = this.safeDict (p, "data");\n        d["a"] = 1;\n        return 1;\n    }\n');
        expect(write).not.toContain('SafeDictMap');
    });
    test('ws sources type a Dict field of this and a decoded-message receiver, and a .length read keeps the map', () => {
        const body = '    f (message: Dict): any {\n        const o = this.safeDict (this.options, "ws", {});\n        const d = this.safeDict (message, "data", {});\n        return [ o, d["x"], d.length ];\n    }\n';
        const out = run(body, 'ts/src/pro');
        expect(out).toContain('var o map[string]any = this.SafeDictMap(this.Options, "ws", map[string]any{})');
        expect(out).toContain('var d map[string]any = this.SafeDictMap(message, "data", map[string]any{})');
        const member = run('    f (message: Dict): any {\n        const d = this.safeDict (message, "data", {});\n        return d.foo;\n    }\n', 'ts/src/pro');
        expect(member).not.toContain('SafeDictMap');
    });
    test('prediction and base sources keep the box', () => {
        const body = '    f (p: Dict): any {\n        const d = this.safeDict (p, "data", {});\n        return this.extend (d, {});\n    }\n';
        expect(run(body, 'ts/src/prediction')).not.toContain('SafeDictMap');
        expect(run(body, 'ts/src')).toContain('SafeDictMap');
    });
});

describe('RF-go-6-A: element reads on map[string]any receivers', () => {
    test('a defaulted Dict parameter read with a literal key is the native index', () => {
        const out = run(
            '    f (symbol: string, config: Dict = {}): any {\n' +
            '        return config["noCoin"];\n' +
            '    }\n');
        expect(out).toContain('return config["noCoin"]');
        expect(out).not.toContain('GetValue(config');
    });
    test('a map local with only pointer-free writes reads natively with a string-typed key', () => {
        const out = run(
            '    f (response: Dict): any {\n' +
            '        const balances = {};\n' +
            '        const id = "a";\n' +
            '        balances[id] = 1;\n' +
            '        return balances[id];\n' +
            '    }\n');
        expect(out).toContain('return balances[id]');
    });
    test('a pointer-valued write, a rebinding or a delete keeps the helper', () => {
        const ptr = run('    f (p: Dict, m: Dict = {}): any {\n        m["a"] = this.safeString (p, "a");\n        return m["b"];\n    }\n');
        expect(ptr).toContain('GetValue(m, "b")');
        const rebind = run('    f (p: Dict, m: Dict = {}): any {\n        m = this.extend (p, {});\n        return m["b"];\n    }\n');
        expect(rebind).toContain('GetValue(m, "b")');
        const del = run('    f (p: Dict, m: Dict = {}): any {\n        delete m["a"];\n        return m["b"];\n    }\n');
        expect(del).toContain('GetValue(m, "b")');
        const plain = run('    f (p: Dict, m: Dict = {}): any {\n        m["a"] = 1;\n        return m["b"];\n    }\n');
        expect(plain).toContain('return m["b"]');
    });
    test('a compared element, an untyped key and a non-map receiver keep the helper', () => {
        const compared = run('    f (c: Dict = {}): any {\n        if (c["a"] === true) {\n            return 1;\n        }\n        return 2;\n    }\n');
        expect(compared).toContain('GetValue(c, "a")');
        const anyKey = run('    f (k: any, c: Dict = {}): any {\n        return c[k];\n    }\n');
        expect(anyKey).toContain('GetValue(c, k)');
        const list = run('    f (p: Dict): any {\n        const l = [ 1, 2 ];\n        return l[0];\n    }\n');
        expect(list).not.toContain('l["0"]');
    });
});
