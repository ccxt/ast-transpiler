import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

describe ('h30g04 refilled Strings copies Strings parameters and their copies', () => {
    const BASE = [
        'export class Exchange {',
        '    safeString (a, b, c?) { return \'\'; }',
        '    symbols: string[] = [];',
        '    id: string = \'\';',
        '    market (s: string): any { return {}; }',
        '    marketId (s: string): string { return s; }',
        '    mystery (x: any): any { return x; }',
        '    parseTickers (t: any, symbols: Strings = undefined, params: Dict = {}): Dict { return {}; }',
        '    fetch (): Promise<any> { return undefined; }',
        '}',
        'type Dict = {[key: string]: any}; type Strings = string[] | undefined;',
        '',
    ].join ('\n');
    const HEADER = 'import { Exchange } from \'./base/Exchange\';\ntype Dict = {[key: string]: any}; type Strings = string[] | undefined;\n';
    const print = (body: string): string => {
        const tmp = fs.mkdtempSync (path.join (os.tmpdir (), 'h30g04-'));
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
    test ('a Strings copy reset to [] and filled with nil-guarded safeString values stays []string (fails on the base printer)', () => {
        const out = print ('    async fetchTickers (symbols: Strings = undefined, params: Dict = {}): Promise<Dict> {\n        const isStock = this.id === \'x\';\n        let symbolsResolved: Strings = symbols;\n        if (isStock && (symbols === undefined)) {\n            symbolsResolved = [];\n            const ms = this.safeString (this.market (\'x\'), \'symbol\');\n            if (ms !== undefined) {\n                symbolsResolved.push (ms);\n            }\n        }\n        return this.parseTickers ([], symbolsResolved);\n    }\n');
        expect (out).toContain ('var symbolsResolved []string = symbols');
        expect (out).toContain ('symbolsResolved = []string{}');
        expect (out).toContain ('symbolsResolved = append(symbolsResolved, *ms)');
        expect (out).not.toContain ('AppendToArray');
    });
    test ('negative: an unguarded safeString push keeps the box', () => {
        const out = print ('    async fetchTickers (symbols: Strings = undefined, params: Dict = {}): Promise<Dict> {\n        const isStock = this.id === \'x\';\n        let symbolsResolved: Strings = symbols;\n        if (isStock && (symbols === undefined)) {\n            symbolsResolved = [];\n            symbolsResolved.push (this.safeString (this.market (\'x\'), \'symbol\'));\n        }\n        return this.parseTickers ([], symbolsResolved);\n    }\n');
        expect (out).not.toContain ('var symbolsResolved []string');
        expect (out).toContain ('AppendToArray(&symbolsResolved');
    });
    test ('negative: a copy stored as a dict value (a nil []string would not be nil there) keeps the box', () => {
        const out = print ('    async fetchTickers (symbols: Strings = undefined, params: Dict = {}): Promise<Dict> {\n        const isStock = this.id === \'x\';\n        let symbolsResolved: Strings = symbols;\n        if (isStock && (symbols === undefined)) {\n            symbolsResolved = [];\n            symbolsResolved.push (\'a\');\n        }\n        return { \'n\': symbolsResolved };\n    }\n');
        expect (out).not.toContain ('var symbolsResolved []string');
    });
    test ('negative: a copy reset to a non-string literal keeps the box', () => {
        const out = print ('    async fetchTickers (symbols: Strings = undefined, params: Dict = {}): Promise<Dict> {\n        let r: Strings = symbols;\n        if (symbols === undefined) {\n            r = [ this.mystery (params) ];\n        }\n        return this.parseTickers ([], r);\n    }\n');
        expect (out).not.toContain ('var r []string');
    });
    const COPY = (callee: string) => '    async fetchTickers (symbols: Strings = undefined, params: Dict = {}): Promise<Dict> {\n        let req: Strings = symbols;\n        if (symbols === undefined) {\n            req = this.symbols;\n        }\n        return this.' + callee + ' (req);\n    }\n';
    test ('a Strings copy handed to a callee that binds the slot as []string stays []string', () => {
        const out = print (COPY ('useTyped') + '    useTyped (xs: Strings = undefined): Dict {\n        const n = (xs === undefined) ? 0 : xs.length;\n        return { \'n\': n };\n    }\n');
        expect (out).toContain ('GetArgStringSlice(optionalArgs, 0, nil)');
        expect (out).toContain ('var req []string = symbols');
    });
    test ('negative: a callee binding the slot with plain GetArg (stored in a dict) keeps the caller boxed', () => {
        const out = print (COPY ('useBoxed') + '    useBoxed (xs: Strings = undefined): Dict {\n        return { \'xs\': xs };\n    }\n');
        expect (out).not.toContain ('var req []string');
    });
});
