import fs from 'fs';
import path from 'path';
import { Transpiler, installCcxtGoHooks, installCcxtGoLocalTypes, installCcxtGoIndexableTypes, installCcxtGoParamTypes, installCcxtGoDictParams, installCcxtGoGb05ParamTypes, installCcxtGoGb11HandleErrorsCode, installCcxtGoSignTyping, installRfGo5OwnedTables, installFmGo5G01, installFmGo5G04, installCcxtGoTupleSlotReads, installCcxtGoFeeTierLiterals, installFmGo5GP08, installFmGo5OG02 } from '../src/transpiler';

let run = 0;
const BASE =
    'export type Str = string | undefined;\n' +
    'export type Dict = { [key: string]: any };\n' +
    'export class Exchange {\n' +
    "    id: string = 'x';\n" +
    '    options: any = {};\n' +
    '    safeString (o: any, k: any, d: any = undefined): string { return d; }\n' +
    '    safeCurrencyCode (id: Str, c: any = undefined): Str { return id; }\n' +
    '    safeMarket (marketId: Str = undefined, market: any = undefined): Dict { return {}; }\n' +
    '    safeSymbol (marketId: Str, market: any = undefined): string { return \'\'; }\n' +
    '    other (v: any): any { return v; }\n' +
    '}\n';
const printVenue = (members: string): string => {
    run += 1;
    const root = path.join (__dirname, 'files', 'tmp-h30g05', 'r' + run, 'ts', 'src');
    fs.mkdirSync (path.join (root, 'base'), { recursive: true });
    fs.writeFileSync (path.join (root, 'base', 'Exchange.ts'), BASE + 'export default Exchange;\n');
    fs.writeFileSync (path.join (root, 'venue.ts'), "import Exchange from './base/Exchange.js';\nimport type { Dict, Str } from './base/Exchange.js';\nexport default class venue extends Exchange {\n" + members + '\n}\n');
    const t = new Transpiler ({ verbose: false, go: { parser: { NUM_LINES_END_FILE: 0 }, asyncMethodSuffix: 'Async' } });
    for (const f of [ installCcxtGoHooks, installCcxtGoLocalTypes, installCcxtGoIndexableTypes, installCcxtGoParamTypes, installCcxtGoDictParams, installCcxtGoGb05ParamTypes, installCcxtGoGb11HandleErrorsCode, installCcxtGoSignTyping, installRfGo5OwnedTables, installFmGo5G01, installFmGo5G04, installCcxtGoTupleSlotReads, installCcxtGoFeeTierLiterals, installFmGo5GP08, installFmGo5OG02 ]) {
        (f as any) (t.goTranspiler);
    }
    return t.transpileGoByPath (path.join (root, 'venue.ts')).content;
};
const L = (...xs: string[]) => xs.map ((x) => '        ' + x + '\n').join ('');
const conv = '    conv (coin: Str): Str {\n' + L ('if (coin === undefined) { return undefined; }', 'if (coin.indexOf (\'/\') > -1) { return coin; }', 'return this.safeCurrencyCode (coin) + \'/USDC:USDC\';') + '    }\n';
const constUse = '    a (t: Dict) {\n' + L ('const coin = this.safeString (t, \'coin\');', 'const m = this.conv (coin);', 'return this.safeMarket (m);') + '    }\n';
const letUse = (read: string) => '    b (t: Dict) {\n' + L ('const coin = this.safeString (t, \'coin\');', 'let m: Str = undefined;', 'if (coin !== undefined) {', '    m = this.conv (coin);', '}', read) + '    }\n';

describe ('h30g05: a nil-returning Str method whose let-local callers only feed deref-safe callees returns *string', () => {
    afterAll (() => fs.rmSync (path.join (__dirname, 'files', 'tmp-h30g05'), { recursive: true, force: true }));
    test ('const caller with a *string + literal concat return: *string, nil kept', () => {
        const out = printVenue (conv + constUse);
        expect (out).toContain ('Conv(coin *string) *string {');
        expect (out).toContain ('retStrPtr := this.SafeCurrencyCode(coin)');
        expect (out).toContain ('if retStrPtr == nil {');
        expect (out).toContain ('retStrVal := *retStrPtr + "/USDC:USDC"');
        expect (out).toContain ('var m *string = this.Conv(coin)');
    });
    test ('let local written only by the call, read by safeSymbol: *string', () => {
        const out = printVenue (conv + constUse + letUse ('return this.safeSymbol (m);'));
        expect (out).toContain ('Conv(coin *string) *string {');
        expect (out).toContain ('var m *string = nil');
    });
    test ('negative: a non-literal concat tail keeps any', () => {
        const c2 = conv.replace ("+ '/USDC:USDC'", "+ this.other (coin)");
        expect (printVenue (c2 + constUse)).not.toContain ('Conv(coin *string) *string {');
    });
    test ('negative: let local also written with a non-Str value keeps any', () => {
        const out = printVenue (conv + constUse + letUse ('m = this.other (t);\n        return this.safeSymbol (m);'));
        expect (out).not.toContain ('Conv(coin *string) *string {');
    });
    test ('negative: let local stored unguarded into a dict keeps any', () => {
        const out = printVenue (conv + constUse + letUse ('return { \'s\': m };'));
        expect (out).not.toContain ('Conv(coin *string) *string {');
    });
    test ('negative: let local nil-tested then boxed into a list keeps any', () => {
        const out = printVenue (conv + constUse + letUse ('if (m === undefined) { return [ m ]; }\n        return this.safeSymbol (m);'));
        expect (out).not.toContain ('Conv(coin *string) *string {');
    });
});
