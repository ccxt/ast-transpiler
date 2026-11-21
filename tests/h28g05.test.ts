import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

describe ('h28g05 nil-defaulted Strings parameters and their copies', () => {
    const BASE = [
        'export class Exchange {',
        '    safeString (a, b, c?) { return \'\'; }',
        '    symbols: string[] = [];',
        '    id: string = \'\';',
        '    market (s: string): any { return {}; }',
        '    marketId (s: string): string { return s; }',
        '    mystery (x: any): any { return x; }',
        '    fetch (): Promise<any> { return undefined; }',
        '}',
        'type Dict = {[key: string]: any}; type Strings = string[] | undefined;',
        '',
    ].join ('\n');
    const HEADER = 'import { Exchange } from \'./base/Exchange\';\ntype Dict = {[key: string]: any}; type Strings = string[] | undefined;\n';
    const print = (body: string): string => {
        const tmp = fs.mkdtempSync (path.join (os.tmpdir (), 'h28g05-'));
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
    test ('a Strings copy reset from this.symbols stays []string with a native nil test (fails on the base printer)', () => {
        const out = print ('    async fetchTradingLimits (symbols: Strings = undefined, params: Dict = {}): Promise<Dict> {\n'
            + '        let symbolsValue: Strings = symbols;\n        if (symbols === undefined) {\n            symbolsValue = this.symbols;\n        }\n'
            + '        if (symbolsValue === undefined) {\n            throw new Error (this.id);\n        }\n        const result: Dict = {};\n'
            + '        for (let i = 0; i < symbolsValue.length; i++) {\n            const symbol = symbolsValue[i];\n            result[symbol] = this.marketId (symbol);\n        }\n        return result;\n    }\n');
        expect (out).toContain ('var symbols []string = GetArgStringSlice(optionalArgs, 0, nil)');
        expect (out).toContain ('var symbolsValue []string = symbols');
        expect (out).toContain ('if symbolsValue == nil {');
        expect (out).toContain ('len(symbolsValue)');
        expect (out).not.toContain ('GetArrayLength');
    });
    test ('a string[] local seeded from this.symbols and overwritten by the parameter is []string (fails on the base printer)', () => {
        const out = print ('    async fetchTickers (symbols: Strings = undefined, params: Dict = {}): Promise<Dict> {\n'
            + '        let s2: string[] = this.symbols;\n        if (symbols !== undefined) {\n            s2 = symbols;\n        }\n'
            + '        const n = s2.length;\n        for (let i = 0; i < n; i++) {\n            const market = this.market (s2[i]);\n        }\n        return {};\n    }\n');
        expect (out).toContain ('var symbols []string = GetArgStringSlice(optionalArgs, 0, nil)');
        expect (out).toContain ('var s2 []string = this.Symbols');
        expect (out).toContain ('this.Market(s2[i])');
    });
    test ('negative: a copy also written with an untyped value keeps the box', () => {
        const out = print ('    async fetchA (symbols: Strings = undefined, params: Dict = {}): Promise<Dict> {\n        let r: Strings = symbols;\n        if (symbols === undefined) {\n            r = this.mystery (params);\n        }\n        if (r === undefined) {\n            return {};\n        }\n        return { \'n\': r.length };\n    }\n');
        expect (out).not.toContain ('var r []string');
        expect (out).toContain ('IsEqual(r, nil)');
    });
    test ('negative: a copy handed to an unknown consumer (could compare the box with nil) keeps the box', () => {
        const out = print ('    async fetchB (symbols: Strings = undefined, params: Dict = {}): Promise<Dict> {\n        let r: Strings = symbols;\n        if (symbols === undefined) {\n            r = this.symbols;\n        }\n        this.mystery (r);\n        return {};\n    }\n');
        expect (out).not.toContain ('var r []string');
        expect (out).toContain ('symbols := GetArg(optionalArgs, 0, nil)');
    });
    test ('negative: a call through an optional string[] parameter still does not type a pushed local', () => {
        const out = print ('    async fetchC (symbols: Strings = undefined, params: Dict = {}): Promise<Dict> {\n        const out: string[] = [];\n        out.push (\'a\');\n        this.mystery (out);\n        return {};\n    }\n');
        expect (out).not.toContain ('var out []string');
    });
});
