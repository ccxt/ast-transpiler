import { Transpiler, installCcxtGoHooks } from '../src/transpiler';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

jest.mock('module', () => ({ __esModule: true, default: jest.fn() }));

describe('an async venue Promise<[int, Dict]> method carries a Go MapPair[int64]', () => {
    const cwd = process.cwd();
    const dirs: string[] = [];
    afterAll(() => { process.chdir(cwd); dirs.forEach ((d) => fs.rmSync(d, { 'recursive': true, 'force': true })); });
    const run = (method: string, body: string): string => {
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'h17g03-'));
        dirs.push(tmp);
        process.chdir(tmp);
        const dir = path.join(tmp, 'ts', 'src');
        fs.mkdirSync(dir, { 'recursive': true });
        fs.writeFileSync(path.join(dir, 'venue.ts'), 'type Dict = { [key: string]: any };\ntype Int = number | undefined;\ntype int = number;\nclass Exchange {\n    options: Dict = {};\n'
            + '    parseToInt (a: any): number { return a; }\n    safeInteger (a: any, b: any): Int { return a; }\n    numberToString (a: any): string { return a; }\n'
            + '    handleOptionAndParams2 (a: any, b: any, c: any, d: any): [any, Dict] { return [ a, b ]; }\n    async fetchX (a: any): Promise<Dict> { return {}; }\n}\n'
            + 'class venue extends Exchange {\n' + method + body + '}\n');
        const inst: any = new Transpiler({ verbose: false, go: { parser: { NUM_LINES_END_FILE: 0 }, asyncMethodSuffix: 'Async' } });
        installCcxtGoHooks(inst.goTranspiler);
        return inst.transpileGoByPath(path.join('ts', 'src', 'venue.ts')).content;
    };
    const producer = (slot: string) => '    async idx (params: Dict): Promise<[int, Dict]> {\n        const [ v, rest ] = this.handleOptionAndParams2 (params, \'m\', \'a\', \'b\');\n'
        + '        let i: Int = v;\n        if (i === undefined) {\n            const res = await this.fetchX ({});\n            i = res[\'index\'];\n        }\n        return [ ' + slot + ', rest ];\n    }\n';
    test('parseToInt slot: typed carrier, destructuring and holder callers bind the fields', () => {
        const out = run(producer('this.parseToInt (i)'), '    async a (p: Dict) {\n        const [ n, rest ] = await this.idx (p);\n        return [ this.numberToString (n), rest ];\n    }\n'
            + '    async b (p: Dict) {\n        const h = await this.idx (p);\n        const n = h[0];\n        if (n === undefined) {\n            return 0;\n        }\n        return n;\n    }\n');
        expect(out).toContain('IdxAsync(params any) <-chan AsyncResult[MapPair[int64]] {');
        expect(out).toContain('ch <- AsyncResult[MapPair[int64]]{Value: MapPair[int64]{V: this.ParseToInt(i), P: rest}}');
        expect(out).toContain('var n int64 = nrestPair.Value.V');
        expect(out).toContain('var rest map[string]any = nrestPair.Value.P');
        expect(out).toContain('var n int64 = h.Value.V');
        expect(out).toContain('if false {');
    });
    test('a slot that may be nil (an Int local written from JSON) keeps the boxed carrier', () => {
        const out = run(producer('i as number'), '    async a (p: Dict) {\n        const [ n, rest ] = await this.idx (p);\n        if (n === undefined) {\n            return 0;\n        }\n        return n;\n    }\n');
        expect(out).not.toContain('MapPair[int64]');
        expect(out).toContain('IsEqual(n, nil)');
    });
    test('a holder handed on whole keeps the boxed carrier', () => {
        const out = run(producer('this.parseToInt (i)'), '    async a (p: Dict) {\n        const h = await this.idx (p);\n        return h;\n    }\n');
        expect(out).not.toContain('MapPair[int64]');
    });
    test('a sync [int, Dict] method is left to the sync pair rule', () => {
        const out = run('    idx (params: Dict): [int, Dict] {\n        return [ 1, params ];\n    }\n', '    a (p: Dict) {\n        const [ n, rest ] = this.idx (p);\n        return n;\n    }\n');
        expect(out).not.toContain('MapPair[int64]');
    });
});
