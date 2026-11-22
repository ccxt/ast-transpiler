import { Transpiler, installCcxtGoHooks } from '../src/transpiler';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

jest.mock('module', () => ({ __esModule: true, default: jest.fn() }));

describe('an async venue Promise<[Bool, Dict]> method carries a Go MapPair[any]', () => {
    const cwd = process.cwd();
    const dirs: string[] = [];
    afterAll(() => { process.chdir(cwd); dirs.forEach ((d) => fs.rmSync(d, { 'recursive': true, 'force': true })); });
    const run = (method: string, body: string): string => {
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'h35p05-'));
        dirs.push(tmp);
        process.chdir(tmp);
        const dir = path.join(tmp, 'ts', 'src');
        fs.mkdirSync(dir, { 'recursive': true });
        fs.writeFileSync(path.join(dir, 'venue.ts'), 'type Dict = { [key: string]: any };\ntype Bool = boolean | undefined;\nclass Exchange {\n    options: Dict = {};\n'
            + '    safeBool (a: any, b: any, c: any = undefined): Bool { return a; }\n    safeDict (a: any, b: any, c: any = undefined): Dict { return a; }\n'
            + '    handleOptionAndParams2 (a: any, b: any, c: any, d: any): [any, Dict] { return [ a, b ]; }\n    async fetchX (a: any): Promise<Dict> { return {}; }\n}\n'
            + 'class venue extends Exchange {\n' + method + body + '}\n');
        const inst: any = new Transpiler({ verbose: false, go: { parser: { NUM_LINES_END_FILE: 0 }, asyncMethodSuffix: 'Async' } });
        installCcxtGoHooks(inst.goTranspiler);
        return inst.transpileGoByPath(path.join('ts', 'src', 'venue.ts')).content;
    };
    // slot 0 may be nil (the option is unset and the fetch fails), true or false
    const producer = '    async uni (method: string, params: Dict = {}): Promise<[Bool, Dict]> {\n        const [ v, rest ] = this.handleOptionAndParams2 (params, method, \'a\', \'b\');\n'
        + '        let u: Bool = v;\n        if (u === undefined) {\n            const res = await this.fetchX ({});\n            u = res[\'unified\'];\n        }\n        return [ u, rest ];\n    }\n';
    test('destructuring, assignment, Promise.all and a safeBool holder all bind the typed carrier', () => {
        const out = run(producer, '    async a (p: Dict) {\n        const [ u, rest ] = await this.uni (\'a\', p);\n        return [ u === true, rest ];\n    }\n'
            + '    async b (p: Dict) {\n        let u: Bool = undefined;\n        let q: Dict = p;\n        [ u, q ] = await this.uni (\'b\', q);\n        return q;\n    }\n'
            + '    async c () {\n        await Promise.all ([ this.uni (\'c\', {}) ]);\n    }\n'
            + '    async d (p: Dict) {\n        const r = await this.uni (\'d\', p);\n        return this.safeBool (r, 0, false);\n    }\n');
        expect(out).toContain('UniAsync(method string, optionalArgs ...any) <-chan AsyncResult[MapPair[any]] {');
        expect(out).toContain('ch <- AsyncResult[MapPair[any]]{Value: MapPair[any]{V: u, P: ');
        expect(out).toContain('var u any = urestPair.Value.V');
        expect(out).toContain('var rest map[string]any = urestPair.Value.P');
        expect(out).toContain('u = uqPair.Value.V');
        expect(out).toContain('var r []any = []any{rPair.Value.V, rPair.Value.P}');
        expect(out).not.toContain('GetValue(');
    });
    test('a caller that hands the result on whole keeps the boxed carrier', () => {
        const out = run(producer, '    async a (p: Dict) {\n        return await this.uni (\'a\', p);\n    }\n');
        expect(out).not.toContain('MapPair[any]');
    });
    test('a slot 0 declared boolean (not Bool) is not this rule', () => {
        const out = run(producer.replace ('Promise<[Bool, Dict]>', 'Promise<[boolean, Dict]>').replace ('let u: Bool = v', 'let u: boolean = v'), '    async a (p: Dict) {\n        const [ u, rest ] = await this.uni (\'a\', p);\n        return u;\n    }\n');
        expect(out).not.toContain('MapPair[any]');
    });
    test('a quoted name that is not a call label (dynamic dispatch) keeps the boxed carrier', () => {
        const out = run(producer, '    async a (p: Dict) {\n        const [ u, rest ] = await this.uni (\'a\', p);\n        const m = \'uni\';\n        return u;\n    }\n');
        expect(out).not.toContain('MapPair[any]');
    });
});
