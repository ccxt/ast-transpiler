import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

// a `string[]` local filled with `this.safeString (.., '')` pushes is a Go []string: the
// literal-defaulted read is never nil, so it appends dereferenced and the join prints natively
describe ('h52g39 string list filled by defaulted safeString pushes', () => {
    const BASE = [
        'export class Exchange {',
        '    safeString (o: any, k: any, d: any = undefined): any { return d; }',
        '    mystery (x: any): any { return x; }',
        '}',
        'type Dict = {[key: string]: any};',
        '',
    ].join ('\n');
    const HEADER = 'import { Exchange } from \'./base/Exchange\';\ntype Dict = {[key: string]: any};\n';
    const print = (body: string): string => {
        const tmp = fs.mkdtempSync (path.join (os.tmpdir (), 'h52g39-'));
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
    const method = (push: string) => '    build (rows: any[]): string {\n'
        + '        const parts: string[] = [];\n'
        + '        for (let i = 0; i < rows.length; i++) {\n'
        + push
        + '        }\n'
        + '        return parts.join (\':\');\n'
        + '    }\n';
    test ('a literal-defaulted safeString push keeps []string (fails on the base printer)', () => {
        const out = print (method ('            parts.push (this.safeString (rows[i], \'id\', \'\'));\n'));
        expect (out).toContain ('var parts []string = []string{}');
        expect (out).toMatch (/parts = append\(parts, \*this\.SafeString\(/);
        expect (out).toContain ('strings.Join(parts, ":")');
    });
    test ('a safeString push with no default stays boxed', () => {
        const out = print (method ('            parts.push (this.safeString (rows[i], \'id\'));\n'));
        expect (out).not.toContain ('var parts []string');
    });
    test ('a safeString push with a variable default stays boxed', () => {
        const out = print (method ('            const d = this.mystery (i);\n            parts.push (this.safeString (rows[i], \'id\', d));\n'));
        expect (out).not.toContain ('var parts []string');
    });
});
