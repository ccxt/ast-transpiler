import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler, installCcxtGoLocalTypes } from '../src/transpiler';

const TYPES = 'type Str = string | undefined;\ntype Dict = { [key: string]: any };\n';
const HEAD = 'class Exchange {\n'
    + '    options: Dict = {};\n'
    + '    safeString (o: any, k: any, d: Str = undefined): Str { return d; }\n'
    + '    safeDict (o: any, k: any, d: Dict = undefined): Dict { return d; }\n'
    + '    safeList (o: any, k: any, d: any[] = undefined): any[] { return d; }\n'
    + '    omit (a: Dict, k: any): Dict { return a; }\n'
    + '    json (a: any): string { return \'\'; }\n'
    + '    extend (a: Dict, b: Dict = {}): Dict { return a; }\n'
    + '    market (s: string): Dict { return {}; }\n'
    + '}\nexport default Exchange;\n';
const print = (body: string): string => {
    const dir = fs.mkdtempSync (path.join (os.tmpdir (), 'h46g04-'));
    try {
        fs.mkdirSync (path.join (dir, 'ts', 'src', 'base'), { 'recursive': true });
        const file = path.join (dir, 'ts', 'src', 'x.ts');
        fs.writeFileSync (path.join (dir, 'ts', 'src', 'base', 'Exchange.ts'), TYPES + HEAD);
        fs.writeFileSync (file, 'import Exchange from \'./base/Exchange.js\';\n' + TYPES + 'export default class X extends Exchange {\n' + body + '\n}\n');
        const config: any = { 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 } } };
        const cwd = process.cwd ();
        process.chdir (dir);
        try {
            const t = new Transpiler (config);
            installCcxtGoLocalTypes (t.goTranspiler);
            return t.transpileGoByPath (file).content;
        } finally {
            process.chdir (cwd);
        }
    } finally {
        fs.rmSync (dir, { 'recursive': true, 'force': true });
    }
};

const PAIR = '    marketDataRequest (marketId: string, params: Dict = {}): [ string, Dict ] {\n'
    + '        const options = this.safeDict (this.options, \'watchTickers\', {});\n'
    + '        const fields = this.safeList (params, \'fields\', []);\n'
    + '        const query = this.omit (params, \'fields\');\n'
    + '        const request: string = \'smd+\' + marketId + \'+\' + this.json ({ \'fields\': fields });\n'
    + '        return [ request, query ];\n'
    + '    }\n';
const SUB = '    async subscribe (hash: string, request: string, subscription: Dict = {}): Promise<any> {\n'
    + '        return request;\n'
    + '    }\n';
const CALLER = '    async f (symbol: string, params = {}) {\n'
    + '        const market = this.market (symbol);\n'
    + '        const [ request, query ] = this.marketDataRequest (this.safeString (market, \'id\', \'\'), params);\n'
    + '        const subscription: Dict = this.extend ({ \'conid\': market[\'id\'] }, query);\n'
    + '        await this.subscribe (\'h\', request, subscription);\n'
    + '    }\n';

describe ('go venue [ string, Dict ] pair destructured by its callers', () => {
    test ('a destructuring caller binds `a, b := call` with no TupleSlice', () => {
        const out = print (PAIR + SUB + CALLER);
        expect (out).toContain ('MarketDataRequest(marketId string, optionalArgs ...any) (string, map[string]any) {');
        expect (out).toContain ('request, query := this.MarketDataRequest(');
        expect (out).not.toContain ('TupleSlice(');
        expect (out).not.toContain ('SafeStringPtr(');
        expect (out).toContain ('}, query)');
        expect (out).toContain ('this.Subscribe("h", request, subscription)');
    });
    test ('an unread slot 0 binds `_`', () => {
        const out = print (PAIR + SUB + CALLER.replace ('await this.subscribe (\'h\', request, subscription);', 'await this.subscribe (\'h\', \'x\', subscription);'));
        expect (out).toContain ('_, query := this.MarketDataRequest(');
    });
    test ('a let destructuring keeps the holder', () => {
        const out = print (PAIR + SUB + CALLER.replace ('const [ request, query ]', 'let [ request, query ]'));
        expect (out).not.toContain ('request, query := this.MarketDataRequest(');
    });
    test ('a nullable slot 0 keeps the []any return and no pair bind', () => {
        const out = print (PAIR.replace (': [ string, Dict ]', ': [ Str, Dict ]').replace ('const request: string', 'const request: Str') + SUB + CALLER);
        expect (out).not.toContain ('(string, map[string]any)');
    });
});
