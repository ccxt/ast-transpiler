import fs from 'fs';
import path from 'path';
import { Transpiler, installCcxtGoHooks, installCcxtGoLocalTypes, installCcxtGoIndexableTypes, installCcxtGoParamTypes, installCcxtGoDictParams, installCcxtGoGb05ParamTypes, installCcxtGoGb11HandleErrorsCode, installCcxtGoSignTyping, installRfGo5OwnedTables, installFmGo5G01, installFmGo5G04, installCcxtGoTupleSlotReads, installCcxtGoFeeTierLiterals, installFmGo5GP08, installFmGo5OG02 } from '../src/transpiler';

let run = 0;
let root = '';
const BASE =
    'export type Str = string | undefined;\n' +
    'export type Dict = { [key: string]: any };\n' +
    'export class Exchange {\n' +
    "    id: string = 'x';\n" +
    '    options: any = {};\n' +
    '    safeList (o: any, k: any, d: any = undefined): any[] { return d; }\n' +
    '    safeString (o: any, k: any, d: any = undefined): string { return d; }\n' +
    '    safeCurrencyCode (id: Str, c: any = undefined): Str { return id; }\n' +
    '    parseNumber (v: any, d: any = undefined): any { return v; }\n' +
    '    other (v: any): any { return v; }\n' +
    '    parseTicker (t: Dict, market: any = undefined): Dict { return t; }\n' +
    '    async publicGet (p: Dict = {}): Promise<any> { return p; }\n' +
    '}\n';
const printVenue = (members: string): string => {
    run += 1;
    root = path.join (__dirname, 'files', 'tmp-h27g13', 'r' + run, 'ts', 'src');
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
const conv = '    conv (t: Dict): Str {\n' + L ('const id = this.safeString (t, \'id\');', 'if (id === \'z\') { return undefined; }', 'return id + \'/\';') + '    }\n';
const use = (read: string) => '    use (t: Dict) {\n' + L ('const a = this.conv (t);', read) + '    }\n';

describe ('h27g13: a nil-returning Str method whose callers pass the local to a deref-safe callee returns *string', () => {
    afterAll (() => fs.rmSync (path.join (__dirname, 'files', 'tmp-h27g13'), { recursive: true, force: true }));
    test ('safeCurrencyCode argument: *string signature and typed local', () => {
        const out = printVenue (conv + use ('return this.safeCurrencyCode (a);'));
        expect (out).toContain ('Conv(t any) *string {');
        expect (out).toContain ('var a *string = this.Conv(t)');
    });
    test ('parseNumber argument: *string', () => {
        const out = printVenue (conv + use ('return this.parseNumber (a);'));
        expect (out).toContain ('Conv(t any) *string {');
    });
    test ('negative: an untabled callee keeps any', () => {
        const out = printVenue (conv + use ('return this.other (a);'));
        expect (out).toContain ('Conv(t any) any {');
        expect (out).not.toContain ('var a *string');
    });
    test ('negative: a dict store without a nil guard keeps any', () => {
        const out = printVenue (conv + use ('return { \'x\': a };'));
        expect (out).toContain ('Conv(t any) any {');
    });
    test ('negative: a second caller that boxes keeps any', () => {
        const out = printVenue (conv + use ('return this.safeCurrencyCode (a);') + '    use2 (t: Dict) {\n' + L ('const b = this.conv (t);', 'return [ b ];') + '    }\n');
        expect (out).toContain ('Conv(t any) any {');
    });
});
