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

describe('an async venue Promise<[boolean | string, Dict]> method carries a typed Go MapPair', () => {
    const cwd = process.cwd();
    const dirs: string[] = [];
    afterAll(() => { process.chdir(cwd); dirs.forEach ((d) => fs.rmSync(d, { 'recursive': true, 'force': true })); });
    const run = (body: string): string => {
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'h40g16-'));
        dirs.push(tmp);
        process.chdir(tmp);
        const dir = path.join(tmp, 'ts', 'src');
        fs.mkdirSync(dir, { 'recursive': true });
        fs.writeFileSync(path.join(dir, 'venue.ts'), 'type Dict = { [key: string]: any };\ntype Str = string | undefined;\nclass Exchange {\n'
            + '    handleOptionAndParams (a: any, b: any, c: any): [any, Dict] { return [ a, b ]; }\n    async fetchX (a: any): Promise<Dict> { return {}; }\n}\n'
            + 'class venue extends Exchange {\n' + body + '}\n');
        const inst: any = new Transpiler({ verbose: false, go: { parser: { NUM_LINES_END_FILE: 0 }, asyncMethodSuffix: 'Async' } });
        installCcxtGoHooks(inst.goTranspiler);
        return inst.transpileGoByPath(path.join('ts', 'src', 'venue.ts')).content;
    };
    const boolProducer = '    async uni (params: Dict, m: Str, defaultValue: boolean = false): Promise<[boolean, Dict]> {\n        const [ v, rest ] = this.handleOptionAndParams (params, m, \'u\');\n'
        + '        if (v !== undefined) {\n            return [ (v === true), rest ];\n        }\n        let known = false;\n        try {\n            await this.fetchX ({});\n            known = true;\n        } catch (e) {\n            known = false;\n        }\n        if (known) {\n            return [ known, rest ];\n        }\n        return [ defaultValue, rest ];\n    }\n';
    const callers = '    async a (p: Dict) {\n        const [ u, rest ] = await this.uni (p, \'a\', false);\n        return (u === true) ? rest : p;\n    }\n'
        + '    async b (p: Dict) {\n        let u: boolean = false;\n        let q: Dict = p;\n        [ u, q ] = await this.uni (q, \'b\', false);\n        return (u !== true) ? q : p;\n    }\n';
    test('a boolean slot 0 sends MapPair[bool] and binds bool locals', () => {
        const out = run(boolProducer + callers);
        expect(out).toContain('UniAsync(params any, m string, optionalArgs ...any) <-chan AsyncResult[MapPair[bool]] {');
        expect(out).toContain('ch <- AsyncResult[MapPair[bool]]{Value: MapPair[bool]{V: known, P: rest}}');
        expect(out).toContain('ch <- AsyncResult[MapPair[bool]]{Value: MapPair[bool]{V: defaultValue, P: rest}}');
        expect(out).toContain('var u bool = urestPair.Value.V');
        expect(out).toContain('u = uqPair.Value.V');
        expect(out).not.toContain('GetValue(');
    });
    test('a string slot 0 sends MapPair[string]', () => {
        const out = run('    async acc (params: Dict): Promise<[string, Dict]> {\n        const [ v, rest ] = this.handleOptionAndParams (params, \'loadAcc\', \'id\');\n        if (v === undefined) {\n            return [ \'\', rest ];\n        }\n        return [ \'x\', rest ];\n    }\n'
            + '    async a (p: Dict) {\n        const [ id, rest ] = await this.acc (p);\n        return id + \'-\';\n    }\n');
        expect(out).toContain('ch <- AsyncResult[MapPair[string]]{Value: MapPair[string]{V: "", P: rest}}');
        expect(out).toContain('var id string = idrestPair.Value.V');
    });
    test('a returned boxed (nil-able) value keeps the untyped list', () => {
        const out = run(boolProducer.replace ('return [ (v === true), rest ]', 'return [ v, rest ]') + callers);
        expect(out).not.toContain('MapPair[bool]');
    });
    test('a string slot fed a nullable Str keeps the untyped list', () => {
        const out = run('    async acc (params: Dict, s: Str = undefined): Promise<[string, Dict]> {\n        return [ s, params ];\n    }\n'
            + '    async a (p: Dict) {\n        const [ id, rest ] = await this.acc (p);\n        return id;\n    }\n');
        expect(out).not.toContain('MapPair[string]');
    });
    test('a caller that hands the result on whole keeps the untyped list', () => {
        const out = run(boolProducer + '    async a (p: Dict) {\n        return await this.uni (p, \'a\', false);\n    }\n');
        expect(out).not.toContain('MapPair[bool]');
    });
});
