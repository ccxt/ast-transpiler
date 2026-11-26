import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

// a `string[]` / `Strings` parameter with an empty `[]` default binds a typed []string with an empty
// []string default, so its length prints natively
describe ('h54g63 empty-list default of a string[] parameter', () => {
    const BASE = [
        'export class Exchange {',
        '    mystery (x: any): any { return x; }',
        '    parsePositions (positions: any[], symbols: Strings = undefined): any[] { return []; }',
        '    fetch (): Promise<any> { return undefined; }',
        '}',
        'type Dict = {[key: string]: any}; type Strings = string[] | undefined;',
        '',
    ].join ('\n');
    const HEADER = 'import { Exchange } from \'./base/Exchange\';\ntype Dict = {[key: string]: any}; type Strings = string[] | undefined;\n';
    const print = (body: string): string => {
        const tmp = fs.mkdtempSync (path.join (os.tmpdir (), 'h54g63-'));
        try {
            const src = path.join (tmp, 'ts', 'src');
            fs.mkdirSync (path.join (src, 'base'), { 'recursive': true });
            fs.writeFileSync (path.join (src, 'base', 'Exchange.ts'), BASE);
            fs.writeFileSync (path.join (src, 'ex.ts'), HEADER + 'export class ex extends Exchange {\n' + body + '}\n');
            const t: any = new Transpiler ({ 'verbose': false, 'go': {} });
            installCcxtGoHooks (t.goTranspiler);
            return t.transpileGoByPath (path.join (src, 'ex.ts')).content;
        } finally {
            fs.rmSync (tmp, { 'recursive': true, 'force': true });
        }
    };
    const method = (sig: string, use: string) => '    checkArg (name: string, ' + sig + ') {\n'
        + '        const n = options.length;\n'
        + use
        + '        return n;\n    }\n';
    test ('string[] = [] binds []string and its length is native (fails on the base printer)', () => {
        const out = print (method ('options: string[] = []', ''));
        expect (out).toContain ('var options []string = GetArgStringSlice(optionalArgs, 0, []string{})');
        expect (out).toContain ('len(options)');
        expect (out).not.toContain ('GetArrayLength(options)');
    });
    test ('Strings = [] binds []string', () => {
        const out = print (method ('options: Strings = []', ''));
        expect (out).toContain ('var options []string = GetArgStringSlice(optionalArgs, 0, []string{})');
    });
    test ('an unannotated [] default stays boxed', () => {
        const out = print (method ('options = []', ''));
        expect (out).not.toContain ('var options []string');
    });
    test ('any[] = [] stays boxed', () => {
        const out = print (method ('options: any[] = []', ''));
        expect (out).not.toContain ('var options []string');
    });
    test ('a string[] = [] that receives a non-string push stays boxed', () => {
        const out = print (method ('options: string[] = []', '        options.push (this.mystery (name));\n'));
        expect (out).not.toContain ('var options []string');
    });
    test ('a string[] = [] reassigned to another kind stays boxed', () => {
        const out = print (method ('options: string[] = []', '        options = name as any;\n'));
        expect (out).not.toContain ('var options []string');
    });
});
