import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Transpiler } from '../src/transpiler.js';
import { installCcxtGoLocalTypes, installFmGo5G01 } from '../src/goTranspiler.js';

const t = () => {
    const x = new Transpiler ({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 } } });
    installCcxtGoLocalTypes (x.goTranspiler);
    installFmGo5G01 (x.goTranspiler);
    return x;
};
const src = (body: string) => [
    'type Dict = { [key: string]: any };',
    'class Base {',
    '    safeDict (a: any, b: any, c: any = undefined) { return undefined; }',
    '    safeString (a: any, b: any, c: any = undefined) { return undefined; }',
    '    extend (...args: any[]): Dict { return {}; }',
    '    omit (a: any, ...args: any[]): any { return {}; }',
    '}',
    'class ex extends Base {',
    body,
    '}',
    '',
].join ('\n');
const root = fs.mkdtempSync (path.join (os.tmpdir (), 'h35p10-'));
let seq = 0;
const go = (body: string) => {
    const full = path.join (root, 'ts/src/ex' + (seq++) + '.ts');
    fs.mkdirSync (path.dirname (full), { recursive: true });
    fs.writeFileSync (full, src (body));
    return t ().transpileGoByPath (full).content as string;
};
const PROBE = process.env.H35P10_PROBE === '1';

const fn = (body: string[]) => go ([ '    f (row: Dict, s: string, v: any) {', ...body.map ((l) => '        ' + l), '    }' ].join ('\n'));
const seed = 'let p: Dict = this.safeDict (row, \'params\', {});';

describe ('h35 P10 a reassigned Dict local seeded from safeDict keeps its map type', () => {
    test ('extend and omit rebinds keep map[string]any: keys, in and writes are native (fails on the base printer)', () => {
        const out = fn ([ seed, 'p = this.extend (p, { \'slippage\': s });', 'const keys = Object.keys (p);',
            'if (\'x\' in p) { p[\'y\'] = 1; }', 'p = this.omit (p, [ \'a\' ]);', 'return [ keys, p ];' ]);
        expect (out).toContain ('var p map[string]any = this.SafeDictMap(row, "params", map[string]any{})');
        expect (out).toContain ('p = this.OmitDict(p, []any{"a"})');
        expect (out).toContain ('for objectKey := range p {');
        expect (out).toContain ('if _, ok := p["x"]; ok {');
        expect (out).toContain ('p["y"] = 1');
        expect (out).not.toMatch (/ObjectKeys\(|InOp\(|AddElementToObject\(/);
    });
    test ('a map literal rebind keeps the map type', () => {
        const out = fn ([ seed, 'p = { \'a\': s };', 'p[\'b\'] = 1;', 'return p;' ]);
        expect (out).toContain ('var p map[string]any = this.SafeDictMap(');
        expect (out).toContain ('p["b"] = 1');
    });
    test ('negative: a rebind from an any value keeps the box', () => {
        const out = fn ([ seed, 'p = v;', 'p[\'b\'] = 1;', 'return p;' ]);
        expect (out).toContain ('var p any = ');
        expect (out).toContain ('AddElementToObject(p, "b", 1)');
    });
    test ('negative: omit of another value keeps the box', () => {
        const out = fn ([ seed, 'p = this.omit (v, \'a\');', 'return Object.keys (p);' ]);
        expect (out).toContain ('var p any = ');
    });
    test ('negative: no default (nil map) with an unguarded rebind read keeps the box', () => {
        const out = fn ([ 'let p: Dict = this.safeDict (row, \'params\');', 'p = this.extend (p, { \'a\': s });', 'p[\'b\'] = 1;', 'return p;' ]);
        expect (out).not.toContain ('var p map[string]any = MapTyped(');
    });
    test ('negative: a rebind inside an expression keeps the box', () => {
        const out = fn ([ seed, 'const q = (p = this.extend (p, {}));', 'p[\'b\'] = 1;', 'return q;' ]);
        expect (out).toContain ('var p any = ');
    });
});
