import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

// a nil-defaulted `Strings` parameter joined with `xs.join (sep)` binds a typed []string:
// Join answers "" for a nil []string exactly as for the absent box, and the join prints natively
describe ('h51g39 Strings parameter read by join', () => {
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
        const tmp = fs.mkdtempSync (path.join (os.tmpdir (), 'h51g39-'));
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
        + '        let hash = \'p\';\n'
        + '        if (symbols !== undefined) {\n'
        + use
        + '        }\n        const response = await this.fetch ();\n        return this.parsePositions (response, symbols);\n    }\n';
    test ('symbols.join keeps the typed []string binding (fails on the base printer)', () => {
        const out = print (method ('            hash = hash + \'::\' + symbols.join (\',\');\n'));
        expect (out).toContain ('var symbols []string = GetArgStringSlice(optionalArgs, 0, nil)');
        expect (out).not.toContain ('symbols := GetArg(optionalArgs, 0, nil)');
    });
    test ('symbols.join plus an unknown method stays boxed', () => {
        const out = print (method ('            hash = hash + symbols.join (\',\');\n            this.mystery (symbols);\n'));
        expect (out).toContain ('symbols := GetArg(optionalArgs, 0, nil)');
    });
    test ('symbols reassigned after a join stays boxed', () => {
        const out = print (method ('            hash = hash + symbols.join (\',\');\n            symbols = hash as any;\n'));
        expect (out).not.toContain ('var symbols []string');
    });
});
