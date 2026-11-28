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
    "    minFundingAddressLength: number = 1;\n" +
    '    unique (x: any): any { return x; }\n' +
    '    stringToCharsArray (x: string): string[] { return []; }\n' +
    '    inArray (a: any, b: any): boolean { return true; }\n' +
    '    filterBy (a: any, k: any, v: any = undefined): any { return a; }\n' +
    '    parseTicker (t: Dict, market: any = undefined): Dict { return t; }\n' +
    '    async publicGet (p: Dict = {}): Promise<any> { return p; }\n' +
    '}\n';
const printVenue = (members: string): string => {
    run += 1;
    root = path.join (__dirname, 'files', 'tmp-h28g08', 'r' + run, 'ts', 'src');
    fs.mkdirSync (path.join (root, 'base'), { recursive: true });
    fs.writeFileSync (path.join (root, 'base', 'Precise.ts'), 'export class Precise {\n    static stringGe (a: Str, b: Str): boolean { return a >= b; }\n}\nexport type Str = string | undefined;\n');
    fs.writeFileSync (path.join (root, 'base', 'Exchange.ts'), BASE + 'export default Exchange;\n');
    fs.writeFileSync (path.join (root, 'venue.ts'), "import Exchange from './base/Exchange.js';\nimport type { Dict, Str } from './base/Exchange.js';\nimport { Precise } from './base/Precise.js';\nexport default class venue extends Exchange {\n" + members + '\n}\n');
    const t = new Transpiler ({ verbose: false, go: { parser: { NUM_LINES_END_FILE: 0 }, asyncMethodSuffix: 'Async' } });
    for (const f of [ installCcxtGoHooks, installCcxtGoLocalTypes, installCcxtGoIndexableTypes, installCcxtGoParamTypes, installCcxtGoDictParams, installCcxtGoGb05ParamTypes, installCcxtGoGb11HandleErrorsCode, installCcxtGoSignTyping, installRfGo5OwnedTables, installFmGo5G01, installFmGo5G04, installCcxtGoTupleSlotReads, installCcxtGoFeeTierLiterals, installFmGo5GP08, installFmGo5OG02 ]) {
        (f as any) (t.goTranspiler);
    }
    return t.transpileGoByPath (path.join (root, 'venue.ts')).content;
};
const L = (...xs: string[]) => xs.map ((x) => '        ' + x + '\n').join ('');
const gt = '    getTif (orderType: Str = undefined): Str {\n' + L ("const statuses: Dict = { 'A': 'B' };", 'return this.safeString (statuses, (orderType as string), orderType);') + '    }\n';
const vol = (extra: string) => '    vol (volume: Str = undefined) {\n' + L ("if ((volume === undefined) || Precise.stringGe (volume, '1')) {", '    return 1;', '}', extra, 'return 2;') + '    }\n';

describe ('h28g08: an optional Str parameter read only by derefScalar-ing slots binds GetArgStringPtr', () => {
    afterAll (() => fs.rmSync (path.join (__dirname, 'files', 'tmp-h28g08'), { recursive: true, force: true }));
    test ('`(x as string)` key of a tabled this.safeString call', () => {
        const out = printVenue (gt);
        expect (out).toContain ('var orderType *string = GetArgStringPtr(optionalArgs, 0, nil)');
        expect (out).not.toContain ('orderType := GetArg(');
    });
    test ('Precise.stringGe operand', () => {
        const out = printVenue (vol (''));
        expect (out).toContain ('var volume *string = GetArgStringPtr(optionalArgs, 0, nil)');
        expect (out).toContain ('Precise.StringGe(volume, "1")');
    });
    test ('negative: `as string` into an untabled callee keeps the box', () => {
        const out = printVenue ('    t2 (x: Str = undefined) {\n' + L ('return this.other ((x as string));') + '    }\n');
        expect (out).toContain ('x := GetArg(optionalArgs, 0, nil)');
    });
    test ('negative: a list store (nil compared by the consumer) keeps the box', () => {
        const out = printVenue (vol ('const xs = [ volume ];', ) .replace ('return 2;', 'return xs;'));
        expect (out).toContain ('volume := GetArg(optionalArgs, 0, nil)');
    });
    test ('negative: a write of another type keeps the box', () => {
        const out = printVenue (vol ('volume = this.other (1);'));
        expect (out).toContain ('volume := GetArg(optionalArgs, 0, nil)');
    });
});
