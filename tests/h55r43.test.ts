import { Transpiler } from '../src/transpiler';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

jest.mock('module', () => ({ __esModule: true, default: jest.fn() }));

const BASE = [
    'export interface Dict { [key: string]: any }',
    'export type Str = string | undefined;',
    'export default class Exchange {',
    '    secret: string = "";',
    '    urlencode (d: any): string { return ""; }',
    '    keysort (d: any): any { return d; }',
    '    omit (d: any, k: any): any { return d; }',
    '    extend (...a: any[]): any { return a[0]; }',
    '    hmac (a: any, b: any): string { return ""; }',
    '    encode (a: any): any { return a; }',
    '    milliseconds (): number { return 0; }',
    '}',
    '',
].join('\n');

const venue = (body: string) => [
    "import Exchange, { Dict, Str } from './base/Exchange.js';",
    'export default class venue extends Exchange {',
    "    probe (method: string, signed: boolean, params: Dict = {}): any {",
    body,
    '    }',
    '}',
    '',
].join('\n');

const BODIES: Record<string, string> = {
    a: "        const request: Dict = { 'x': method, 'o': true };\n        if (signed) {\n            request['c'] = Math.min (params['n'], 1000);\n        }\n        return this.omit (this.extend (request, params), 'z');",
    b: "        const request: Dict = { 'x': method, 'o': true };\n        if (signed) {\n            request['c'] = method;\n        }\n        return this.omit (this.extend (request, params), 'z');",
    c: "        const request: Dict = { 'x': method, 'o': true };\n        if (signed) {\n            request['c'] = method;\n        }\n        if (!('c' in request)) {\n            return 1;\n        }\n        return this.omit (this.extend (request, params), 'z');",
};

describe('a literal-built map local tested with a literal `in` key', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'h55r43-'));
    afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));
    fs.mkdirSync(path.join(tmp, 'ts', 'src', 'base'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'ts', 'src', 'base', 'Exchange.ts'), BASE);
    const run = (name: string, body: string) => {
        const t = new Transpiler({ verbose: false, rust: { parser: { NUM_LINES_END_FILE: 0 } } } as any);
        const file = path.join(tmp, 'ts', 'src', name + '.ts');
        fs.writeFileSync(file, venue(body));
        return t.transpileRustByPath(file).content;
    };
    test('positive: the map is typed and the test reads its own lookup', () => {
        const out = run('p1', BODIES.c);
        expect(out).toMatch(/let mut request: indexmap::IndexMap<String, Value> = \(/);
        expect(out).toMatch(/if !\(request\.contains_key\("c"\)\)/);
        expect(out).not.toMatch(/matches!\(&request, Value::Dict/);
    });
    test('negative: a map seeded from a producer keeps its form', () => {
        const out = run('n1', BODIES.c.replace("const request: Dict = { 'x': method, 'o': true };", "const request: Dict = this.omit (params, 'z');"));
        expect(out).not.toMatch(/let mut request: indexmap::IndexMap<String, Value> = \(/);
    });
    test('negative: a variable key keeps the boxed test', () => {
        const out = run('n2', BODIES.c.replace("!('c' in request)", "!(method in request)"));
        expect(out).not.toMatch(/request\.contains_key\("c"\)/);
    });
    test('negative: an `in` result stored in a local keeps the box', () => {
        const body = BODIES.c.replace("        if (!('c' in request)) {\n", "        const has = ('c' in request);\n        if (!has) {\n");
        expect(body).toContain('const has');
        const out = run('n3', body);
        expect(out).not.toMatch(/request\.contains_key\("c"\)/);
    });
});
