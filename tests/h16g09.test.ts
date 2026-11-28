import { Transpiler, installCcxtGoHooks } from '../src/transpiler';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

jest.mock('module', () => ({ __esModule: true, default: jest.fn() }));

describe('a sync venue [int, Dict] tuple method prints a Go (int64, map[string]any) pair', () => {
    const cwd = process.cwd();
    const dirs: string[] = [];
    afterAll(() => { process.chdir(cwd); dirs.forEach ((d) => fs.rmSync(d, { 'recursive': true, 'force': true })); });
    // the caller scan caches ts/src per working directory: each case gets its own
    const run = (method: string, body: string): string => {
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'h16g09-'));
        dirs.push(tmp);
        process.chdir(tmp);
        const dir = path.join(tmp, 'ts', 'src');
        fs.mkdirSync(dir, { 'recursive': true });
        const file = path.join(dir, 'venue.ts');
        fs.writeFileSync(file, 'type Dict = { [key: string]: any };\ntype Int = number | undefined;\nclass Exchange {\n    options: Dict = {};\n'
            + '    parseToInt (a: any): number { return a; }\n    safeInteger (a: any, b: any): Int { return a; }\n    numberToString (a: any): string { return a; }\n}\n'
            + 'class venue extends Exchange {\n' + method + '    run (p: Dict) {\n' + body + '    }\n}\n');
        const inst: any = new Transpiler({ verbose: false, go: { parser: { NUM_LINES_END_FILE: 0 }, asyncMethodSuffix: 'Async' } });
        installCcxtGoHooks(inst.goTranspiler);
        return inst.transpileGoByPath(path.join('ts', 'src', 'venue.ts')).content;
    };
    const proven = '    idx (params: Dict): [int, Dict] {\n        const v = this.safeInteger (params, \'k\');\n        if (v !== undefined) {\n            return [ this.parseToInt (v), params ];\n        }\n'
        + '        const fallback = 254;\n        return [ fallback, params ];\n    }\n';
    test('parseToInt / const literal slots: typed pair, joined caller', () => {
        const out = run(proven, '        const [ i, rest ] = this.idx (p);\n        return this.numberToString (i);\n');
        expect(out).toContain(') (int64, map[string]any) {');
        expect(out).toContain('return this.ParseToInt(v), MapTyped(params)');
        expect(out).toContain('return int64(fallback), MapTyped(params)');
        expect(out).toContain('i, rest := this.Idx(p)');
    });
    test('a slot that may be nil (an Int local) keeps the []any box', () => {
        const nilable = '    idx (params: Dict): [int, Dict] {\n        const v = this.safeInteger (params, \'k\');\n        return [ v as number, params ];\n    }\n';
        const out = run(nilable, '        const [ i, rest ] = this.idx (p);\n        if (i === undefined) {\n            return 0;\n        }\n        return i;\n');
        expect(out).not.toContain('(int64, map[string]any)');
        expect(out).toContain('[]any');
    });
    test('a rebound local slot (written twice) keeps the []any box', () => {
        const rebound = '    idx (params: Dict): [int, Dict] {\n        let v = 1;\n        v = this.safeInteger (params, \'k\') as number;\n        return [ v, params ];\n    }\n';
        const out = run(rebound, '        const [ i, rest ] = this.idx (p);\n        return i;\n');
        expect(out).not.toContain('(int64, map[string]any)');
    });
    test('a holder passed on whole keeps the []any box', () => {
        const out = run(proven, '        const h = this.idx (p);\n        return h;\n');
        expect(out).not.toContain('(int64, map[string]any)');
    });
});
