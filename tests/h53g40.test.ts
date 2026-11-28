import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

describe ('h53g40: a Strings copy of a GetArgStringSlice parameter read earlier in the body', () => {
    const BASE = [
        'export class Exchange {',
        '    safeString (a, b, c?) { return \'\'; }',
        '    safeBool (a, b, c?) { return false; }',
        '    symbols: string[] = [];',
        '    id: string = \'\';',
        '    market (s: string): any { return {}; }',
        '    parseTickers (tickers: any, symbols: Strings = undefined, params = {}): Dict { return {}; }',
        '    fetch (): Promise<any> { return undefined; }',
        '}',
        'type Dict = {[key: string]: any}; type Strings = string[] | undefined;',
        '',
    ].join ('\n');
    const HEADER = 'import { Exchange } from \'./base/Exchange\';\ntype Dict = {[key: string]: any}; type Strings = string[] | undefined;\n';
    const print = (body: string): string => {
        const tmp = fs.mkdtempSync (path.join (os.tmpdir (), 'h53g40-'));
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
    const src = (push: string) => '    async fetchTickers (symbols: Strings = undefined, params = {}): Promise<Dict> {\n'
        + '        const data = await this.fetch ();\n'
        + '        const isStock = this.safeBool (params, \'stock\', false);\n'
        + '        let symbolsResolved: Strings = symbols;\n'
        + '        if (isStock && (symbols === undefined)) {\n'
        + '            symbolsResolved = [];\n'
        + '            const allSymbols: string[] = this.symbols;\n'
        + '            for (let i = 0; i < allSymbols.length; i++) {\n'
        + '                const symbol = allSymbols[i];\n'
        + '                const entry = this.market (symbol);\n'
        + '                const marketSymbol = this.safeString (entry, \'symbol\');\n'
        + push
        + '            }\n'
        + '        }\n'
        + '        return this.parseTickers (data, symbolsResolved);\n'
        + '    }\n';
    const typed = (body: string) => {
        const out = print (body);
        expect (out).toContain ('var symbolsResolved []string = symbols');
        expect (out).toContain ('symbolsResolved = append(symbolsResolved, *marketSymbol)');
        expect (out).not.toContain ('AppendToArray');
    };
    test ('a safeString read of the parameter before the copy keeps the copy []string (fails on the base printer)', () => {
        typed (src ('                if (marketSymbol !== undefined) {\n                    symbolsResolved.push (marketSymbol);\n                }\n').replace ('const isStock = this.safeBool (params, \'stock\', false);', 'const isStock = this.safeBool (params, \'stock\', false);\n        if (symbols !== undefined) {\n            const s0 = this.safeString (symbols, 0);\n        }'));
    });
    test ('a length read of the parameter before the copy keeps the copy []string (fails on the base printer)', () => {
        typed (src ('                if (marketSymbol !== undefined) {\n                    symbolsResolved.push (marketSymbol);\n                }\n').replace ('const isStock = this.safeBool (params, \'stock\', false);', 'const isStock = this.safeBool (params, \'stock\', false);\n        if (symbols !== undefined) {\n            const n = symbols.length;\n        }'));
    });
    test ('the copy with no earlier read stays []string', () => {
        typed (src ('                if (marketSymbol !== undefined) {\n                    symbolsResolved.push (marketSymbol);\n                }\n'));
    });
    test ('negative: an unguarded push of a nullable string keeps the box', () => {
        const out = print (src ('                symbolsResolved.push (marketSymbol);\n').replace ('const isStock = this.safeBool (params, \'stock\', false);', 'const isStock = this.safeBool (params, \'stock\', false);\n        if (symbols !== undefined) {\n            const n = symbols.length;\n        }'));
        expect (out).toContain ('AppendToArray(&symbolsResolved, marketSymbol)');
    });
    test ('negative: a push of a non-string keeps the box', () => {
        const out = print (src ('                symbolsResolved.push (entry);\n').replace ('const isStock = this.safeBool (params, \'stock\', false);', 'const isStock = this.safeBool (params, \'stock\', false);\n        if (symbols !== undefined) {\n            const n = symbols.length;\n        }').replace ('let symbolsResolved: Strings', 'let symbolsResolved: any'));
        expect (out).toContain ('AppendToArray(&symbolsResolved, entry)');
    });
});
