import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

// a nil-defaulted `Strings` parameter read through `this.safeString (xs, i)` binds a typed []string:
// SafeValueN's []string arm answers the default for a nil slice, like the absent box did
describe ('h26g29 Strings parameter read by index', () => {
    const BASE = [
        'export class Exchange {',
        '    safeString (a, b, c?) { return \'\'; }',
        '    market (s: string): any { return {}; }',
        '    mystery (x: any): any { return x; }',
        '    parsePositions (positions: any[], symbols: Strings = undefined): any[] { return []; }',
        '    fetch (): Promise<any> { return undefined; }',
        '}',
        'type Dict = {[key: string]: any}; type Strings = string[] | undefined;',
        '',
    ].join ('\n');
    const HEADER = 'import { Exchange } from \'./base/Exchange\';\ntype Dict = {[key: string]: any}; type Strings = string[] | undefined;\n';
    const print = (body: string): string => {
        const tmp = fs.mkdtempSync (path.join (os.tmpdir (), 'h26g29-'));
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
    const method = (use: string) => '    async fetchPositions (symbols: Strings = undefined, params: Dict = {}): Promise<any[]> {\n'
        + '        if (symbols !== undefined) {\n            const n = symbols.length;\n'
        + use
        + '        }\n        const response = await this.fetch ();\n        return this.parsePositions (response, symbols);\n    }\n';
    test ('safeString (symbols, 0) keeps the typed []string binding (fails on the base printer)', () => {
        const out = print (method ('            const first = this.safeString (symbols, 0);\n            if (first !== undefined) {\n                this.market (first);\n            }\n'));
        expect (out).toContain ('var symbols []string = GetArgStringSlice(optionalArgs, 0, nil)');
        expect (out).toContain ('this.SafeString(symbols, 0)');
    });
    test ('symbols passed to an unknown method stays boxed', () => {
        const out = print (method ('            this.mystery (symbols);\n'));
        expect (out).toContain ('symbols := GetArg(optionalArgs, 0, nil)');
    });
    test ('safeString with symbols as the key stays boxed', () => {
        const out = print (method ('            const first = this.safeString (params, symbols);\n'));
        expect (out).toContain ('symbols := GetArg(optionalArgs, 0, nil)');
    });
    test ('symbols reassigned from a string stays boxed', () => {
        const out = print (method ('            const first = this.safeString (symbols, 0);\n            symbols = first as any;\n'));
        expect (out).not.toContain ('var symbols []string');
    });
});
