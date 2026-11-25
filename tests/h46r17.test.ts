import { Transpiler } from '../src/transpiler';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// a base method parameter declared as the base exchange class prints `&crate::exchange::Exchange` and reads its fields natively
const base = 'export interface Dict { [key: string]: any }\n' +
    'export class BaseExchange {\n    id: string = \'x\';\n    markets: Dict = undefined;\n    options: Dict = {};\n    symbols: string[] = [];\n' +
    '    safeList (o: any, k: any, d: any = undefined): any { return o; }\n' +
    '    setMarketsFromExchange (sourceExchange: BaseExchange) {\n' +
    '        if (this.id !== sourceExchange.id) {\n            throw new Error (\'got \' + sourceExchange[\'id\']);\n        }\n' +
    '        if ((sourceExchange.markets === undefined) || (sourceExchange.markets === null)) {\n            throw new Error (\'no markets\');\n        }\n' +
    '        this.markets = sourceExchange.markets;\n        this.symbols = sourceExchange.symbols;\n' +
    '        const helpers = this.safeList (sourceExchange.options, \'marketHelperProps\', []);\n' +
    '        for (let i = 0; i < helpers.length; i++) {\n            const helper = helpers[i];\n' +
    '            if (sourceExchange.options[helper] !== undefined) {\n                this.options[helper] = sourceExchange.options[helper];\n            }\n        }\n        return this;\n    }\n' +
    '    keepBoxed (other: BaseExchange) {\n        return other.hold;\n    }\n' +
    '    keepAny (other: any) {\n        return other.id;\n    }\n' +
    '}\n';

describe ('rust base-exchange parameter', () => {
    let output = '';
    beforeAll (() => {
        const root = fs.mkdtempSync (path.join (os.tmpdir (), 'h46r17-'));
        fs.mkdirSync (path.join (root, 'ts', 'src', 'base'), { recursive: true });
        const file = path.join (root, 'ts', 'src', 'base', 'Exchange.ts');
        fs.writeFileSync (file, base.replace ('return other.hold;', 'return other.hold ();').replace ('    symbols: string[] = [];\n', '    symbols: string[] = [];\n    hold (): any { return 1; }\n'));
        const t = new Transpiler ({ 'verbose': false, 'rust': { 'parser': { 'NUM_LINES_END_FILE': 0 } } } as any);
        output = t.transpileRustByPath (file).content;
    });
    test ('the parameter prints the exchange reference', () => {
        expect (output).toMatch (/(?:set_markets_from_exchange|setMarketsFromExchange)\([^)]*sourceExchange: &crate::exchange::Exchange\)/);
    });
    test ('field reads, null tests and copies are native', () => {
        expect (output).toContain ('(Value::from(&(*sourceExchange).markets) == Value::Null)');
        expect (output).toContain ('self.markets = (*sourceExchange).markets.as_ref().map(std::sync::Arc::clone)');
        expect (output).toContain ('self.symbols = std::sync::Arc::clone(&(*sourceExchange).symbols)');
        expect (output).toContain ('Value::clone(&(*sourceExchange).id)');
        expect (output).toContain ('(*sourceExchange).options.get(&crate::runtime::stringify_param(&helper)).cloned().unwrap_or(Value::Null)');
        const body = output.slice (output.indexOf ('setMarketsFromExchange'), output.indexOf ('keepBoxed'));
        expect (body).not.toContain ('get_value');
    });
    test ('a method call on the parameter keeps the boxed parameter', () => {
        expect (output).not.toMatch (/keepBoxed\([^)]*&crate::exchange::Exchange/);
    });
    test ('the overload-free copy of the base file reads the same rule', () => {
        const root = fs.mkdtempSync (path.join (os.tmpdir (), 'h46r17c-'));
        fs.mkdirSync (path.join (root, 'ts', 'src', 'base'), { recursive: true });
        const file = path.join (root, 'ts', 'src', 'base', '.__ExchangeNoOverloads.ts');
        fs.writeFileSync (file, base);
        const t = new Transpiler ({ 'verbose': false, 'rust': { 'parser': { 'NUM_LINES_END_FILE': 0 } } } as any);
        const copy = t.transpileRustByPath (file).content;
        expect (copy).toMatch (/(?:set_markets_from_exchange|setMarketsFromExchange)\([^)]*sourceExchange: &crate::exchange::Exchange\)/);
    });
    test ('a file outside the base folder keeps the boxed parameter', () => {
        const root = fs.mkdtempSync (path.join (os.tmpdir (), 'h46r17d-'));
        fs.mkdirSync (path.join (root, 'ts', 'src'), { recursive: true });
        const file = path.join (root, 'ts', 'src', 'Exchange.ts');
        fs.writeFileSync (file, base);
        const t = new Transpiler ({ 'verbose': false, 'rust': { 'parser': { 'NUM_LINES_END_FILE': 0 } } } as any);
        expect (t.transpileRustByPath (file).content).not.toContain ('&crate::exchange::Exchange');
    });
    test ('an any parameter keeps the boxed parameter', () => {
        expect (output).not.toMatch (/keepAny\([^)]*&crate::exchange::Exchange/);
    });
});
