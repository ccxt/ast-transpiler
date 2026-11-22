import { Transpiler, installCcxtGoHooks } from '../src/transpiler';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

jest.mock('module', () => ({ __esModule: true, default: jest.fn() }));

const config = { 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 } }, 'java': { 'parser': { 'NUM_LINES_END_FILE': 0 } }, 'csharp': { 'parser': { 'NUM_LINES_END_FILE': 0 } } };
const src = (body: string) => `class T {\n    pick (p) { return [ 'a', p ]; }\n    f (params) {\n${body}\n    }\n}`;
const LEADING = '        const [ , rest ] = this.pick (params);\n        return rest;';
const MIDDLE = '        const [ a, , c ] = this.pick (params);\n        return [ a, c ];';
const NONE = '        const [ a, b ] = this.pick (params);\n        return b;';

describe('array destructure with a skipped slot', () => {
    const go = (b: string) => new Transpiler(config).transpileGo(src(b)).content;
    const java = (b: string) => new Transpiler(config).transpileJava(src(b)).content;
    const cs = (b: string) => new Transpiler(config).transpileCSharp(src(b)).content;
    test('go: a leading hole binds only the named slot', () => {
        const out = go(LEADING);
        expect(out).toContain('restVariable := this.Pick(params)');
        expect(out).toContain('rest := GetValue(restVariable, 1)');
        expect(out).not.toMatch(/GetValue\(restVariable, 0\)/);
    });
    test('go: a middle hole keeps the later index', () => {
        const out = go(MIDDLE);
        expect(out).toContain('a := GetValue(acVariable, 0)');
        expect(out).toContain('c := GetValue(acVariable, 2)');
    });
    test('go: no hole unchanged', () => {
        expect(go(NONE)).toContain('b := GetValue(abVariable, 1)');
    });
    test('java: a leading hole binds only the named slot', () => {
        const out = java(LEADING);
        expect(out).toContain('var rest = ((java.util.List<Object>) restVariable).get(1);');
        expect(out).not.toMatch(/var\s+=/);
    });
    test('java: a middle hole keeps the later index', () => {
        expect(java(MIDDLE)).toContain('var c = ((java.util.List<Object>) acVariable).get(2);');
    });
    test('java: no hole unchanged', () => {
        expect(java(NONE)).toContain('var a = ((java.util.List<Object>) abVariable).get(0);');
    });
    test('csharp: a leading hole binds only the named slot', () => {
        const out = cs(LEADING);
        expect(out).toContain('var rest = ((IList<object>) restVariable)[1];');
        expect(out).not.toMatch(/var\s+=/);
    });
    test('csharp: a middle hole keeps the later index', () => {
        const out = cs(MIDDLE);
        expect(out).toContain('var a = ((IList<object>) acVariable)[0];\n');
        expect(out).toContain('var c = ((IList<object>) acVariable)[2];');
    });
    test('the base pattern printer prints a hole empty', () => {
        const t: any = new Transpiler(config);
        const src2 = 'let a; let c; const f = (p) => p; for (const [ , v ] of f ([])) { c = v; }';
        expect(() => t.transpileJava(src2)).not.toThrow();
    });
    test('csharp: no hole unchanged', () => {
        expect(cs(NONE)).toContain('var b = ((IList<object>) abVariable)[1];');
    });
});

describe('go: a skipped slot of a venue [Bool, Dict] pair', () => {
    const cwd = process.cwd();
    const dirs: string[] = [];
    afterAll(() => { process.chdir(cwd); dirs.forEach((d) => fs.rmSync(d, { 'recursive': true, 'force': true })); });
    const run = (body: string): string => {
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'p06-'));
        dirs.push(tmp);
        process.chdir(tmp);
        const dir = path.join(tmp, 'ts', 'src');
        fs.mkdirSync(dir, { 'recursive': true });
        fs.writeFileSync(path.join(dir, 'venue.ts'), 'type Dict = { [key: string]: any };\ntype Bool = boolean | undefined;\nclass Exchange {\n    options: Dict = {};\n'
            + '    handleOptionBoolAndParams (a: any, b: any, c: any, d: any): [boolean, Dict] { return [ a, b ]; }\n}\n'
            + 'class venue extends Exchange {\n'
            + '    pick (m: string, params: Dict): [ Bool, Dict ] {\n        const [ s, query ] = this.handleOptionBoolAndParams (params, m, \'s\', false);\n'
            + '        if (s === true) {\n            return [ true, query ];\n        }\n        return [ false, query ];\n    }\n' + body + '}\n');
        const inst: any = new Transpiler({ verbose: false, go: { parser: { NUM_LINES_END_FILE: 0 }, asyncMethodSuffix: 'Async' } });
        installCcxtGoHooks(inst.goTranspiler);
        return inst.transpileGoByPath(path.join('ts', 'src', 'venue.ts')).content;
    };
    test('a leading hole binds `_` in the multi-assign', () => {
        const out = run("    a (p: Dict) {\n        const [ , q ] = this.pick ('a', p);\n        return q;\n    }\n");
        expect(out).toContain('_, q := this.Pick("a", p)');
        expect(out).not.toContain('qVariable');
    });
    test('both slots named: unchanged', () => {
        const out = run("    a (p: Dict) {\n        const [ s, q ] = this.pick ('a', p);\n        return [ s, q ];\n    }\n");
        expect(out).toContain('s, q := this.Pick("a", p)');
    });
});

describe('python and php: a skipped slot prints valid code', () => {
    const SRC = 'class T {\n    pick (p) { return [ \'a\', p ]; }\n    f (params) {\n        const [ , rest ] = this.pick (params);\n        const [ a, , c ] = this.pick (params);\n        return [ rest, a, c ];\n    }\n}';
    test('python: a leading and a middle hole bind `_`', () => {
        const out = new Transpiler({ 'verbose': false }).transpilePython(SRC).content;
        expect(out).toContain('[_, rest] = self.pick(params)');
        expect(out).toContain('[a, _, c] = self.pick(params)');
    });
    test('php: a hole stays empty in the list pattern', () => {
        const out = new Transpiler({ 'verbose': false }).transpilePhp(SRC).content;
        expect(out).toContain('[, $rest] = $this->pick($params);');
        expect(out).toContain('[$a, , $c] = $this->pick($params);');
    });
    test('python: no hole unchanged', () => {
        const out = new Transpiler({ 'verbose': false }).transpilePython('class T {\n    f (p) {\n        const [ a, b ] = p;\n        return b;\n    }\n}').content;
        expect(out).toContain('[a, b] = p');
    });
});

describe('rust: a leading hole does not crash and reads slot 1', () => {
    test('rust: a leading hole binds only the named slot', () => {
        const out = new Transpiler({ 'verbose': false }).transpileRust(src(LEADING)).content;
        expect(out).toContain('.get(1)');
        expect(out).not.toMatch(/let mut _\b/);
    });
});
