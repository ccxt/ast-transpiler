import fs from 'fs';
import path from 'path';
import { Transpiler, installCcxtGoHooks, installCcxtGoLocalTypes, installCcxtGoIndexableTypes, installCcxtGoParamTypes, installCcxtGoDictParams, installCcxtGoGb05ParamTypes, installCcxtGoGb11HandleErrorsCode, installCcxtGoSignTyping, installRfGo5OwnedTables, installFmGo5G01, installFmGo5G04, installCcxtGoTupleSlotReads, installCcxtGoFeeTierLiterals, installFmGo5GP08, installFmGo5OG02 } from '../src/transpiler';

const root = path.join (__dirname, 'files', 'tmp-h26g09', 'ts', 'src');
const BASE =
    'export type Str = string | undefined;\n' +
    'export type Dict = { [key: string]: any };\n' +
    'export class Exchange {\n' +
    "    id: string = 'x';\n" +
    '    options: any = {};\n' +
    '    safeList (o: any, k: any, d: any = undefined): any[] { return d; }\n' +
    '    safeString (o: any, k: any, d: any = undefined): string { return d; }\n' +
    '    parseTicker (t: Dict, market: any = undefined): Dict { return t; }\n' +
    '    async publicGet (p: Dict = {}): Promise<any> { return p; }\n' +
    '}\n';
const printVenue = (members: string): string => {
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
const conv = (ret: string) => '    conv (currency: Dict, kind: string): Str {\n' + L (
    'const id = this.safeString (currency, \'id\');',
    'if (kind === \'d\') { return id + \'F0\'; }',
    ret) + '    }\n';
const use = '    use (c: Dict) {\n' + L ('const a = this.conv (c, \'d\');', 'return { \'currency\': a };') + '    }\n';

describe ('h26g09: a Str method mixing *string and native string returns returns *string', () => {
    afterAll (() => fs.rmSync (path.join (__dirname, 'files', 'tmp-h26g09'), { recursive: true, force: true }));
    test ('a pointer path and a native concat path print *string with an addressed concat', () => {
        const out = printVenue (conv ('return id;') + use);
        expect (out).toContain ('Conv(currency any, kind string) *string {');
        expect (out).toContain ('\t\tretStrVal := *id + "F0"\n\t\treturn &retStrVal\n');
        expect (out).toContain ('var a *string = this.Conv(c, "d")');
    });
    test ('a boxed return keeps any', () => {
        const out = printVenue (conv ('return currency[\'x\'];') + use);
        expect (out).toContain ('Conv(currency any, kind string) any {');
        expect (out).not.toContain ('retStrVal');
    });
    test ('a nil path whose caller boxes the value keeps any', () => {
        const out = printVenue (conv ('return undefined;') + use);
        expect (out).toContain ('Conv(currency any, kind string) any {');
        expect (out).not.toContain ('retStrVal');
    });
    test ('a string-only method keeps its string signature', () => {
        const out = printVenue ('    s (x: Dict): Str {\n' + L ('const u = this.safeString (x, \'u\', \'\');', 'return u + \'/\';') + '    }\n');
        expect (out).not.toContain ('retStrVal');
    });
});
