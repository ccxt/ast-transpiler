import { Transpiler } from '../src/transpiler';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

jest.mock('module', () => ({ __esModule: true, default: jest.fn () }));

// a `let x: Dict = {}` local whose later writes are never-nil safeDict reads stays map[string]any
describe ('go Dict local with safeDict writes', () => {
    const BASE = 'export type Dict = { [key: string]: any };\n'
        + 'export default class Exchange {\n'
        + '    safeDict (o: any, k: any, d: any = undefined): any { return o[k]; }\n'
        + '    safeValue (o: any, k: any, d: any = undefined): any { return o[k]; }\n'
        + '}\n';
    const print = (body: string): string => {
        const dir = fs.mkdtempSync (path.join (os.tmpdir (), 'godictsafedict-'));
        const cwd = process.cwd ();
        try {
            fs.mkdirSync (path.join (dir, 'ts', 'src', 'base'), { 'recursive': true });
            fs.writeFileSync (path.join (dir, 'ts', 'src', 'base', 'Exchange.ts'), BASE);
            const file = path.join (dir, 'ts', 'src', 'x.ts');
            fs.writeFileSync (file, 'import Exchange, { Dict } from \'./base/Exchange.js\';\n' + body);
            process.chdir (dir);
            const config: any = { 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 } } };
            return new Transpiler (config).transpileGoByPath (file).content;
        } finally {
            process.chdir (cwd);
            fs.rmSync (dir, { 'recursive': true, 'force': true });
        }
    };
    const method = (writes: string, read = 'return result[\'id\'];') => 'export default class x extends Exchange {\n'
        + '    f (response: any, data: any, a: boolean) {\n'
        + '        let result: Dict = {};\n'
        + '        if (a) {\n'
        + '            ' + writes + '\n'
        + '        }\n'
        + '        ' + read + '\n'
        + '    }\n'
        + '}\n';
    test ('a never-nil safeDict write on an untyped receiver keeps the box (no SafeDictMap move)', () => {
        const out = print (method ('result = this.safeDict (response, \'data\', {});'));
        expect (out).toMatch (/var result any = map\[string\]any\{\}/);
        expect (out).not.toContain ('SafeDictMap(');
    });
    test ('a safeDict write without a default keeps the box (absent is nil)', () => {
        const out = print (method ('result = this.safeDict (response, \'data\');'));
        expect (out).toMatch (/var result any = map\[string\]any\{\}/);
    });
    test ('a write of another kind keeps the box', () => {
        const out = print (method ('result = this.safeValue (response, \'data\', {});'));
        expect (out).toMatch (/var result any = map\[string\]any\{\}/);
    });
    test ('a safeDict whose default is not a map keeps the box', () => {
        const out = print (method ('result = this.safeDict (response, \'data\', data);'));
        expect (out).toMatch (/var result any = map\[string\]any\{\}/);
    });
});
