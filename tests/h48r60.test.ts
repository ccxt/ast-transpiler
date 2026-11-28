import { Transpiler } from '../src/transpiler';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// a pro local holding a same-class venue `Promise<Dict>` answer, handed whole to a typed params slot, is a Dict
const base = 'export interface Dict { [key: string]: any }\nexport type Int = number | undefined;\n' +
    'export default class Exchange {\n' +
    '    async watchTradesForSymbols (symbols: string[], since: Int = undefined, limit: Int = undefined, params: Dict = {}): Promise<any[]> { return []; }\n' +
    '    async loadMarkets (): Promise<Dict> { return {}; }\n' +
    '    safeDict (o: any, k: any, d: Dict = undefined): Dict | undefined { return o; }\n' +
    '    extend (...args: any[]): any { return {}; }\n' +
    '    handleOptionBoolAndParams (params: object, methodName: string, optionName: string, defaultValue: boolean = undefined): [ boolean, Dict ] { return [ defaultValue, params ]; }\n}\n';
const venue = "import Exchange from '../base/Exchange.js';\nimport type { Dict, Int } from '../base/Exchange.js';\n" +
    'export default class venue extends Exchange {\n' +
    '    async prepareQuery (methodName: string, params: Dict): Promise<Dict> {\n' +
    "        const [ stock, query ] = this.handleOptionBoolAndParams (params, methodName, 'stock');\n" +
    '        await this.loadMarkets ();\n        if (stock === undefined) {\n            return query;\n        }\n' +
    "        return this.extend (query, { 'stock': stock });\n    }\n" +
    '    override async watchTradesForSymbols (symbols: string[], since: Int = undefined, limit: Int = undefined, params: Dict = {}): Promise<any[]> {\n' +
    "        const query = await this.prepareQuery ('watchTradesForSymbols', params);\n        return [ this.safeDict (query, 'x') ];\n    }\n" +
    '    async prepareMaybe (methodName: string, params: Dict): Promise<any> {\n' +
    '        await this.loadMarkets ();\n        return this.safeDict (params, methodName);\n    }\n' +
    // positive: declared Dict answer handed whole to the typed params slot
    '    async watchTrades (symbol: string, since: Int = undefined, limit: Int = undefined, params: Dict = {}): Promise<any[]> {\n' +
    "        const query = await this.prepareQuery ('watchTrades', params);\n" +
    '        return await this.watchTradesForSymbols ([ symbol ], since, limit, query);\n    }\n' +
    // negative: an `any` answer keeps its box
    '    async watchOther (symbol: string, params: Dict = {}): Promise<any[]> {\n' +
    "        const other = await this.prepareMaybe ('watchOther', params);\n" +
    '        return await this.watchTradesForSymbols ([ symbol ], undefined, undefined, other);\n    }\n' +
    '}\n';

describe ('rust pro venue Dict answer handed to a typed params slot', () => {
    let output = '';
    let root = '';
    beforeAll (() => {
        root = fs.mkdtempSync (path.join (os.tmpdir (), 'h48r60-'));
        fs.mkdirSync (path.join (root, 'ts', 'src', 'base'), { recursive: true });
        fs.mkdirSync (path.join (root, 'ts', 'src', 'pro'), { recursive: true });
        fs.writeFileSync (path.join (root, 'ts', 'src', 'base', 'Exchange.ts'), base);
        fs.writeFileSync (path.join (root, 'ts', 'src', 'pro', 'venue.ts'), venue);
        const t = new Transpiler ({ 'verbose': false, 'rust': { 'typedUnified': [ 'watchTradesForSymbols' ], 'parser': { 'NUM_LINES_END_FILE': 0 } } } as any);
        output = t.transpileRustByPath (path.join (root, 'ts', 'src', 'pro', 'venue.ts')).content;
    });
    afterAll (() => fs.rmSync (root, { recursive: true, force: true }));

    test ('the declared Dict answer is a Dict local, boxed once at the slot', () => {
        expect (output).not.toMatch (/let (?:mut )?query: Value\b/);
        expect (output).toMatch (/let (?:mut )?query: crate::value::Dict = /);
    });

    test ('negative: an any answer keeps its Value local', () => {
        expect (output).not.toMatch (/let (?:mut )?other: crate::value::Dict/);
    });
});
