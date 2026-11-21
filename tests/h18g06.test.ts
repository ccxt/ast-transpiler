import fs from 'fs';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

describe ('go marketIds returns []string', () => {
    const root = path.join (__dirname, 'files', 'tmp-h18g06', 'ts', 'src');
    const BASE =
        'export type Str = string | undefined;\n' +
        'export type Strings = string[] | undefined;\n' +
        'export class Exchange {\n' +
        "    id: string = 'x';\n" +
        '    marketId (symbol: Str): Str {\n' +
        '        return symbol;\n' +
        '    }\n' +
        '    marketIds (symbols: string[]): string[];\n' +
        '    marketIds (symbols?: Strings): Strings;\n' +
        '    marketIds (symbols: Strings = undefined): Strings {\n' +
        '        if (symbols === undefined) {\n' +
        '            return symbols;\n' +
        '        }\n' +
        '        const result: string[] = [];\n' +
        '        for (let i = 0; i < symbols.length; i++) {\n' +
        '            const id = this.marketId (symbols[i]);\n' +
        '            if (id !== undefined) {\n' +
        '                result.push (id);\n' +
        '            }\n' +
        '        }\n' +
        '        return result;\n' +
        '    }\n' +
        '}\n';
    const VENUE =
        "import { Exchange } from './base/Exchange.js';\n" +
        'export default class v extends Exchange {\n' +
        '    subscribe (symbols: string[], sub: any) {\n' +
        '        const marketIds = this.marketIds (symbols);\n' +
        '        for (let i = 0; i < marketIds.length; i++) {\n' +
        '            const marketId = marketIds[i];\n' +
        '            sub[marketId] = true;\n' +
        '        }\n' +
        '        return sub;\n' +
        '    }\n' +
        '    nilTest (symbols: Strings) {\n' +
        '        const ids = this.marketIds (symbols);\n' +
        '        if (ids === undefined) {\n' +
        '            return false;\n' +
        '        }\n' +
        '        return true;\n' +
        '    }\n' +
        '    rebound (symbols: string[]) {\n' +
        '        let ids: any = this.marketIds (symbols);\n' +
        '        ids = {};\n' +
        '        return ids;\n' +
        '    }\n' +
        '}\n';
    const print = (file: string): string => {
        fs.mkdirSync (path.join (root, 'base'), { recursive: true });
        fs.writeFileSync (path.join (root, 'base', 'Exchange.ts'), BASE);
        fs.writeFileSync (path.join (root, 'v.ts'), VENUE);
        const t = new Transpiler ({ verbose: false, go: {} });
        installCcxtGoHooks (t.goTranspiler);
        return t.transpileGoByPath (path.join (root, file)).content;
    };
    afterAll (() => fs.rmSync (path.join (__dirname, 'files', 'tmp-h18g06'), { recursive: true, force: true }));

    test ('a caller local is []string and its elements read natively', () => {
        const venue = print ('v.ts');
        expect (venue).toContain ('var marketIds []string = this.MarketIds(symbols)');
        expect (venue).toContain ('var marketId string = marketIds[i]');
        expect (venue).not.toContain ('GetValue(marketIds, i)');
        expect (venue).not.toContain ('MarketIdsSlice(');
    });

    test ('negative: a nil test on an optional-input result keeps the nil answer', () => {
        const venue = print ('v.ts');
        expect (venue).toContain ('var ids []string = this.MarketIds(symbols)');
        expect (venue).toMatch (/if \(?ids == nil\)? \{/);
    });

    test ('negative: a caller local rebound to a non-list keeps its box', () => {
        expect (print ('v.ts')).toContain ('var ids any = this.MarketIds(symbols)');
    });
});
