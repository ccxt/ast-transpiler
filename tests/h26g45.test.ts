import fs from 'fs';
import path from 'path';
import { Transpiler } from '../src/transpiler';

const root = path.join (__dirname, 'files', 'tmp-h26g45', 'ts', 'src');
const BASE = 'export type Dict = { [key: string]: any };\n' +
    'export interface CancellationRequest { id: string; symbol: string; }\n' +
    'export class Exchange {\n' +
    '    safeDict (o: any, k: any, d: any = undefined): any { return d; }\n' +
    '    safeString (o: any, k: any, d: any = undefined): string { return d; }\n' +
    '    async cancelOrdersForSymbols (orders: CancellationRequest[], params: Dict = {}): Promise<any> { return undefined; }\n' +
    '}\nexport default Exchange;\n';
const print = (body: string, caller = '', table: any = { 'cancelOrdersForSymbols': { 0: '[]map[string]any' } }): string => {
    fs.mkdirSync (path.join (root, 'base'), { recursive: true });
    fs.writeFileSync (path.join (root, 'base', 'Exchange.ts'), BASE);
    fs.writeFileSync (path.join (root, 'ex.ts'), "import { Exchange, Dict, CancellationRequest } from './base/Exchange';\nexport default class ex extends Exchange {\n" +
        '    async cancelOrdersForSymbols (orders: CancellationRequest[], params: Dict = {}): Promise<any> {\n' + body + '    }\n' + caller + '}\n');
    const t = new Transpiler ({ verbose: false, go: { unifiedSliceParams: table } });
    return t.transpileGoByPath (path.join (root, 'ex.ts')).content;
};
const LOOP = '        const ids = [];\n' +
    '        for (let i = 0; i < orders.length; i++) {\n' +
    '            const order = this.safeDict (orders, i);\n' +
    "            ids.push (this.safeString (order, 'id'));\n" +
    '        }\n' +
    '        for (let i = 0; i < orders.length; i++) {\n' +
    '            const o2 = orders[i];\n' +
    "            ids.push (this.safeString (o2, 'symbol'));\n" +
    '        }\n' +
    '        return ids;\n';
const CALLER = '    async other (ids: string[]): Promise<any> {\n' +
    '        const rows: CancellationRequest[] = [];\n' +
    '        for (let i = 0; i < ids.length; i++) {\n' +
    "            const item: CancellationRequest = { 'id': ids[i], 'symbol': 'x' };\n" +
    '            rows.push (item);\n' +
    '        }\n' +
    '        return await this.cancelOrdersForSymbols (rows, {});\n' +
    '    }\n';

describe ('h26g45: request-row list parameters typed as []map[string]any', () => {
    afterAll (() => fs.rmSync (path.join (__dirname, 'files', 'tmp-h26g45'), { recursive: true, force: true }));
    test ('bounded safeDict / index reads print the native row', () => {
        const out = print (LOOP, CALLER);
        expect (out).toContain ('cancelOrdersForSymbolsBody(ch chan any, orders []map[string]any, optionalArgs ...any)');
        expect (out).toContain ('\t\tvar order map[string]any = orders[i]\n');
        expect (out).toContain ('\t\tvar o2 map[string]any = orders[i]\n');
        expect (out).not.toContain ('SafeMapTyped(orders, i)');
        expect (out).not.toContain ('GetArrayLength(orders)');
    });
    test ('a caller row list filled with map locals is the same slice', () => {
        const out = print (LOOP, CALLER);
        expect (out).toContain ('\tvar rows []map[string]any = []map[string]any{}\n');
        expect (out).toContain ('\t\trows = append(rows, item)\n');
    });
    test ('without the table row the parameter stays boxed', () => {
        const out = print (LOOP, '', {});
        expect (out).not.toContain ('orders []map[string]any');
        expect (out).toContain ('SafeMapTyped(orders, i)');
    });
    test ('an unbounded element read refuses the slot', () => {
        expect (() => print ("        return this.safeString (orders[0], 'id');\n")).toThrow (/read as something other than a bounded map row/);
    });
    test ('a write through the list refuses the slot', () => {
        expect (() => print ('        for (let i = 0; i < orders.length; i++) {\n            orders[i] = undefined;\n        }\n        return 1;\n')).toThrow (/bounded map row/);
    });
    test ('a nil test of the list refuses the slot', () => {
        expect (() => print ('        if (orders === undefined) {\n            return 0;\n        }\n        return orders.length;\n')).toThrow (/bounded map row/);
    });
    test ('a caller list pushed a boxed value stays []any', () => {
        const caller = '    async other (ids: any): Promise<any> {\n        const rows: CancellationRequest[] = [];\n        rows.push (ids);\n        return 1;\n    }\n';
        const out = print (LOOP, caller);
        expect (out).not.toContain ('var rows []map[string]any');
    });
});
