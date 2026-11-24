import fs from 'fs';
import path from 'path';
import { Transpiler, installCcxtGoHooks, installCcxtGoLocalTypes, installCcxtGoIndexableTypes, installCcxtGoParamTypes, installCcxtGoDictParams, installCcxtGoGb05ParamTypes, installCcxtGoGb11HandleErrorsCode, installCcxtGoSignTyping, installRfGo5OwnedTables, installFmGo5G01, installFmGo5G04, installCcxtGoTupleSlotReads, installCcxtGoFeeTierLiterals, installFmGo5GP08, installFmGo5OG02 } from '../src/transpiler';

const root = path.join (__dirname, 'files', 'tmp-h47g22', 'ts', 'src');
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
const status = (name: string, last: string) => '    ' + name + ' (status: Str): Str {\n' + L (
    'if (status === undefined) { return undefined; }',
    'const statuses: Dict = { \'FILLED\': \'closed\' };',
    'if (status.endsWith (\'Rejected\')) { return \'rejected\'; }',
    last) + '    }\n';
const use = (name: string) => '    use (o: Dict) {\n' + L ('const s = this.' + name + ' (this.safeString (o, \'status\'));', 'return { \'status\': s };') + '    }\n';

describe ('h47g22: a parse*Status method mixing nil, literal and SafeString returns is *string', () => {
    afterAll (() => fs.rmSync (path.join (__dirname, 'files', 'tmp-h47g22'), { recursive: true, force: true }));
    test ('nil, literal and SafeString paths print *string with an addressed literal', () => {
        const out = printVenue (status ('parseOrderStatus', 'return this.safeString (statuses, status, status);') + use ('parseOrderStatus'));
        expect (out).toContain ('ParseOrderStatus(status *string) *string {');
        expect (out).toContain ('retStrVal := "rejected"\n');
        expect (out).toContain ('return nil\n');
    });
    test ('a boxed return keeps any', () => {
        const out = printVenue (status ('parseOrderStatus', 'return statuses[status];') + use ('parseOrderStatus'));
        expect (out).toContain ('ParseOrderStatus(status *string) any {');
        expect (out).not.toContain ('retStrVal');
    });
    test ('a non-family method whose caller boxes the nil keeps any', () => {
        const out = printVenue (status ('mapStatus', 'return this.safeString (statuses, status, status);') + use ('mapStatus'));
        expect (out).toContain ('MapStatus(status *string) any {');
        expect (out).not.toContain ('retStrVal');
    });
});
