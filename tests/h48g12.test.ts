import fs from 'fs';
import path from 'path';
import { Transpiler, installCcxtGoHooks, installCcxtGoLocalTypes, installCcxtGoIndexableTypes, installCcxtGoParamTypes, installCcxtGoDictParams, installCcxtGoGb05ParamTypes, installCcxtGoGb11HandleErrorsCode, installCcxtGoSignTyping, installRfGo5OwnedTables, installFmGo5G01, installFmGo5G04, installCcxtGoTupleSlotReads, installCcxtGoFeeTierLiterals, installFmGo5GP08, installFmGo5OG02 } from '../src/transpiler';

const root = path.join (__dirname, 'files', 'tmp-h48g12', 'ts', 'src');
const BASE =
    'export type Str = string | undefined;\n' +
    'export type Dict = { [key: string]: any };\n' +
    'export type Liquidation = { [key: string]: any };\n' +
    'export class Exchange {\n' +
    "    id: string = 'x';\n" +
    '    options: any = {};\n' +
    '    safeList (o: any, k: any, d: any = undefined): any[] { return d; }\n' +
    '    safeString (o: any, k: any, d: any = undefined): string { return d; }\n' +
    '    parseTicker (t: Dict, market: any = undefined): Dict { return t; }\n' +
    '    safeLiquidation (l: Dict, market: any = undefined): Liquidation { return l; }\n' +
    '    async publicGet (p: Dict = {}): Promise<any> { return p; }\n' +
    '}\n';
const printVenue = (members: string): string => {
    fs.mkdirSync (path.join (root, 'base'), { recursive: true });
    fs.writeFileSync (path.join (root, 'base', 'Exchange.ts'), BASE + 'export default Exchange;\n');
    fs.writeFileSync (path.join (root, 'venue.ts'), "import Exchange from './base/Exchange.js';\nimport type { Dict, Str, Liquidation } from './base/Exchange.js';\nexport default class venue extends Exchange {\n" + members + '\n}\n');
    const t = new Transpiler ({ verbose: false, go: { parser: { NUM_LINES_END_FILE: 0 }, asyncMethodSuffix: 'Async' } });
    for (const f of [ installCcxtGoHooks, installCcxtGoLocalTypes, installCcxtGoIndexableTypes, installCcxtGoParamTypes, installCcxtGoDictParams, installCcxtGoGb05ParamTypes, installCcxtGoGb11HandleErrorsCode, installCcxtGoSignTyping, installRfGo5OwnedTables, installFmGo5G01, installFmGo5G04, installCcxtGoTupleSlotReads, installCcxtGoFeeTierLiterals, installFmGo5GP08, installFmGo5OG02 ]) {
        (f as any) (t.goTranspiler);
    }
    return t.transpileGoByPath (path.join (root, 'venue.ts')).content;
};
const L = (...xs: string[]) => xs.map ((x) => '        ' + x + '\n').join ('');
const parser = (decl: string, ...lines: string[]) => '    parseWsLiquidation (liquidation: Dict, market = undefined)' + decl + ' {\n' + L (...lines) + '    }\n';
const ret = 'return this.safeLiquidation ({ \'info\': liquidation, \'symbol\': this.safeString (liquidation, \'s\') });';

describe ('h48g12: a `: Liquidation` method returning safeLiquidation on every path is map[string]any', () => {
    afterAll (() => fs.rmSync (path.join (__dirname, 'files', 'tmp-h48g12'), { recursive: true, force: true }));
    test ('declared Liquidation, every return safeLiquidation: map[string]any', () => {
        const out = printVenue (parser (': Liquidation', ret));
        expect (out).toContain ('ParseWsLiquidation(liquidation map[string]any, optionalArgs ...any) map[string]any {');
    });
    test ('no declaration keeps any', () => {
        const out = printVenue (parser ('', ret));
        expect (out).toMatch (/ParseWsLiquidation\([^)]*\) any \{/);
    });
    test ('a nil path keeps any', () => {
        const out = printVenue (parser (': Liquidation', 'if (liquidation === undefined) { return undefined; }', ret));
        expect (out).toMatch (/ParseWsLiquidation\([^)]*\) any \{/);
    });
    test ('a returned row keeps any', () => {
        const out = printVenue (parser (': Liquidation', 'if (this.id === \'y\') { return liquidation as any; }', ret));
        expect (out).toMatch (/ParseWsLiquidation\([^)]*\) any \{/);
    });
});
