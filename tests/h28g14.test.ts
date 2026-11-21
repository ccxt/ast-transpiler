import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

describe('go awaited map value stored into a non-nil local map', () => {
    const HEAD = 'type Dict = { [key: string]: any };\ntype Str = string | undefined;\ntype Strings = string[] | undefined;\nclass Exchange {\n'
        + '    symbols: string[] = [];\n'
        + '    safeString (d: any, k: any, def: any = undefined): Str { return d; }\n'
        + '    marketId (s: Str): string { return \'\'; }\n'
        + '    async fetchLimitsById (id: Str, params: Dict = {}): Promise<Dict> { return {}; }\n'
        + '    async fetchAnyById (id: Str, params: Dict = {}): Promise<any> { return {}; }\n'
        + '    async fetchStrById (id: Str, params: Dict = {}): Promise<Str> { return undefined; }\n';
    const print = (body: string): string => {
        const t: any = new Transpiler ({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 }, 'asyncMethodSuffix': 'Async' } });
        installCcxtGoHooks (t.goTranspiler);
        const tmp = fs.mkdtempSync (path.join (os.tmpdir (), 'h28g14-'));
        try {
            const dir = path.join (tmp, 'ts', 'src', 'base');
            fs.mkdirSync (dir, { 'recursive': true });
            const file = path.join (dir, 'Exchange.ts');
            fs.writeFileSync (file, HEAD + '    async fetchAll (symbols: Strings = undefined, params: Dict = {}) {\n' + body + '\n    }\n}\n');
            const out = t.transpileGoByPath (file).content;
            return out.slice (out.indexOf ('func (this *Exchange) FetchAll'));
        } finally {
            fs.rmSync (tmp, { 'recursive': true, 'force': true });
        }
    };
    const loop = (call: string) => '        const result: Dict = {};\n        for (let i = 0; i < this.symbols.length; i++) {\n            const symbol = this.safeString (this.symbols, i);\n'
        + '            result[symbol] = await this.' + call + ' (this.marketId (symbol), params);\n        }\n        return result;';
    test('positive: an awaited Promise<Dict> stored under a *string key prints the guarded native store', () => {
        const out = print (loop ('fetchLimitsById'));
        expect (out).toMatch (/\t(r\d+) := \(<-this\.FetchLimitsByIdAsync\(this\.MarketId\(symbol\), params\)\)\n\t+PanicOnError\(\1\.Raw\)\n\t+if symbol != nil \{\n\t+result\[\*symbol\] = \1\.Value\n/);
        expect (out).not.toContain ('AddElementToObject(result');
    });
    test('negative: an awaited Promise<any> value keeps the helper', () => {
        const out = print (loop ('fetchAnyById'));
        expect (out).not.toMatch (/result\[\*symbol\] = /);
    });
    test('negative: an awaited Promise<Str> (nil-able scalar pointer) value keeps the helper', () => {
        const out = print (loop ('fetchStrById'));
        expect (out).not.toMatch (/result\[\*symbol\] = /);
    });
    test('negative: a map that may be nil at the write keeps the helper', () => {
        const out = print (loop ('fetchLimitsById').replace ('const result: Dict = {};', 'let result: Dict = undefined;\n        if (params[\'x\'] === undefined) { result = {}; }'));
        expect (out).not.toMatch (/result\[\*symbol\] = /);
    });
});
