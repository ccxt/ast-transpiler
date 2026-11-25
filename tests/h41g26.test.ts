import { Transpiler, installCcxtGoHooks } from '../src/transpiler';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

jest.mock('module', () => ({ __esModule: true, default: jest.fn() }));

describe('an async venue Promise<[Str, Dict]> method carries a Go MapPair[*string]', () => {
    const cwd = process.cwd();
    const dirs: string[] = [];
    afterAll(() => { process.chdir(cwd); dirs.forEach ((d) => fs.rmSync(d, { 'recursive': true, 'force': true })); });
    const run = (method: string, body: string): string => {
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'h41g26-'));
        dirs.push(tmp);
        process.chdir(tmp);
        const dir = path.join(tmp, 'ts', 'src');
        fs.mkdirSync(dir, { 'recursive': true });
        fs.writeFileSync(path.join(dir, 'venue.ts'), 'type Dict = { [key: string]: any };\ntype Str = string | undefined;\nclass Exchange {\n    options: Dict = {};\n'
            + '    safeString (a: any, b: any, c: any = undefined): Str { return a; }\n'
            + '    handleOptionAndParams (a: any, b: any, c: any): [any, Dict] { return [ a, b ]; }\n    handleOptionStringAndParams (a: any, b: any, c: any): [Str, Dict] { return [ a, b ]; }\n    async fetchAccounts (): Promise<Dict> { return {}; }\n}\n'
            + 'class venue extends Exchange {\n' + method + body + '}\n');
        const inst: any = new Transpiler({ verbose: false, go: { parser: { NUM_LINES_END_FILE: 0 }, asyncMethodSuffix: 'Async' } });
        installCcxtGoHooks(inst.goTranspiler);
        return inst.transpileGoByPath(path.join('ts', 'src', 'venue.ts')).content;
    };
    // slot 0 comes from an option reader, so the producer quotes its own name as the reader's method label
    const producer = '    async loadId (params: Dict = {}): Promise<[Str, Dict]> {\n        const [ fromParams, query ] = this.handleOptionStringAndParams (params, \'loadId\', \'id\');\n'
        + '        let id: Str = fromParams;\n        if (id === undefined) {\n            await this.fetchAccounts ();\n            id = this.safeString (this.options, \'id\');\n        }\n        return [ id, query ];\n    }\n';
    const caller = '    async a (p: Dict = {}) {\n        const [ id, rest ] = await this.loadId (p);\n        return [ id, rest ];\n    }\n';
    test('destructuring binds the typed carrier, no GetValue', () => {
        const out = run(producer, caller);
        expect(out).toContain('LoadIdAsync(optionalArgs ...any) <-chan AsyncResult[MapPair[*string]] {');
        expect(out).toContain('ch <- AsyncResult[MapPair[*string]]{Value: MapPair[*string]{V: id, P: query}}');
        expect(out).toContain('var id *string = idrestPair.Value.V');
        expect(out).toContain('var rest map[string]any = idrestPair.Value.P');
        expect(out).not.toContain('GetValue(');
    });
    test('a concat on the bound slot dereferences the declared *string', () => {
        const out = run(producer, '    async a (p: Dict = {}) {\n        const [ id, rest ] = await this.loadId (p);\n        return [ \'x::\' + id, rest ];\n    }\n');
        expect(out).toContain('var id *string = idrestPair.Value.V');
        expect(out).toContain('Add("x::", id)');
        expect(out).not.toContain('var id any');
    });
    test('a Str slot fed from an untyped option reader keeps the boxed list', () => {
        const out = run(producer.replace ('handleOptionStringAndParams', 'handleOptionAndParams'), caller);
        expect(out).not.toContain('MapPair[');
    });
    test('a quoted name outside an option reader (dynamic dispatch) keeps the boxed list', () => {
        const out = run(producer, caller + '    b () {\n        return \'loadId\';\n    }\n');
        expect(out).not.toContain('MapPair[');
    });
    test('a caller that hands the result on whole keeps the boxed list', () => {
        const out = run(producer, '    async a (p: Dict) {\n        return await this.loadId (p);\n    }\n');
        expect(out).not.toContain('MapPair[');
    });
    test('a Promise<[Num, Dict]> slot is not this rule', () => {
        const out = run(producer.replace ('Promise<[Str, Dict]>', 'Promise<[number, Dict]>'), caller);
        expect(out).not.toContain('MapPair[');
    });
});
