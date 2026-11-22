import { Transpiler, installCcxtGoHooks } from '../src/transpiler';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

jest.mock('module', () => ({ __esModule: true, default: jest.fn() }));

describe('a sync venue [ Bool, Dict ] pair with literal bool returns prints (bool, map[string]any)', () => {
    const cwd = process.cwd();
    const dirs: string[] = [];
    afterAll(() => { process.chdir(cwd); dirs.forEach ((d) => fs.rmSync(d, { 'recursive': true, 'force': true })); });
    const run = (method: string, body: string): string => {
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'h36p12-'));
        dirs.push(tmp);
        process.chdir(tmp);
        const dir = path.join(tmp, 'ts', 'src');
        fs.mkdirSync(dir, { 'recursive': true });
        fs.writeFileSync(path.join(dir, 'venue.ts'), 'type Dict = { [key: string]: any };\ntype Bool = boolean | undefined;\nclass Exchange {\n    options: Dict = {};\n'
            + '    safeBool (a: any, b: any, c: any = undefined): Bool { return a; }\n'
            + '    handleOptionBoolAndParams (a: any, b: any, c: any, d: any): [boolean, Dict] { return [ a, b ]; }\n}\n'
            + 'class venue extends Exchange {\n' + method + body + '}\n');
        const inst: any = new Transpiler({ verbose: false, go: { parser: { NUM_LINES_END_FILE: 0 }, asyncMethodSuffix: 'Async' } });
        installCcxtGoHooks(inst.goTranspiler);
        return inst.transpileGoByPath(path.join('ts', 'src', 'venue.ts')).content;
    };
    const producer = (returns: string) => '    pick (m: string, params: Dict): [ Bool, Dict ] {\n        const [ s, query ] = this.handleOptionBoolAndParams (params, m, \'s\', false);\n'
        + returns + '    }\n';
    const literal = '        if (s === true) {\n            return [ true, query ];\n        }\n        return [ false, query ];\n';
    const callers = '    a (p: Dict) {\n        const [ s, q ] = this.pick (\'a\', p);\n        return [ s, q ];\n    }\n'
        + '    b (p: Dict) {\n        this.pick (\'b\', p);\n        return p;\n    }\n';
    test('literal returns print bare and a discarded call stays a bare statement', () => {
        const out = run(producer(literal), callers);
        expect(out).toContain('(bool, map[string]any) {');
        expect(out).toMatch(/return true, (?:MapTyped\()?query/);
        expect(out).toMatch(/return false, (?:MapTyped\()?query/);
        expect(out).toContain('this.Pick("b", p)');
        expect(out).not.toContain('SafeBoolPtr(true)');
        expect(out).not.toContain('TupleSlice(this.Pick(');
    });
    test('a nil-able slot 0 (undefined literal) keeps the list form', () => {
        const out = run(producer('        if (s === true) {\n            return [ true, query ];\n        }\n        return [ undefined, query ];\n'), callers);
        expect(out).not.toContain('(bool, map[string]any) {');
        expect(out).not.toMatch(/return true, /);
    });
    test('a Bool local (may be nil) in slot 0 keeps the list form', () => {
        const out = run(producer('        const v: Bool = this.safeBool (params, \'x\');\n        return [ v, query ];\n'), callers);
        expect(out).not.toContain('(bool, map[string]any) {');
    });
});
