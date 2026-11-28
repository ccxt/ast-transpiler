import fs from 'fs';
import path from 'path';
import { Transpiler } from '../src/transpiler';

const root = path.join (__dirname, 'files', 'tmp-h27g27', 'ts', 'src');
const BASE = 'export type Dict = { [key: string]: any };\nexport type List = any[];\n' +
    'export interface OrderRequest { symbol: string; }\n' +
    'export class Exchange {\n' +
    '    safeDict (o: any, k: any, d: any = undefined): any { return d; }\n' +
    '    safeString (o: any, k: any, d: any = undefined): string { return d; }\n' +
    '    async editOrders (orders: OrderRequest[], params: Dict = {}): Promise<any> { return undefined; }\n' +
    '}\nexport default Exchange;\n';
const TABLE = { 'editOrders': { 0: '[]map[string]any' }, 'editOrdersRequest': { 0: '[]map[string]any' } };
const print = (request: string, extra = '', table: any = TABLE): string => {
    fs.mkdirSync (path.join (root, 'base'), { recursive: true });
    fs.writeFileSync (path.join (root, 'base', 'Exchange.ts'), BASE);
    fs.writeFileSync (path.join (root, 'ex.ts'), "import { Exchange, Dict, List, OrderRequest } from './base/Exchange';\nexport default class ex extends Exchange {\n" +
        '    editOrdersRequest (orders: List, params: Dict = {}): Dict {\n' + request + '    }\n' +
        '    async editOrders (orders: OrderRequest[], params: Dict = {}): Promise<any> {\n        return this.editOrdersRequest (orders, params);\n    }\n' +
                '    async editOne (id: string): Promise<any> {\n        const order: Dict = {};\n        order[\'id\'] = id;\n        return await this.editOrders ([ order as OrderRequest ], {});\n    }\n' +
        extra + '}\n');
    const t = new Transpiler ({ verbose: false, go: { unifiedSliceParams: table } });
    return t.transpileGoByPath (path.join (root, 'ex.ts')).content;
};
const LOOP = '        const ids = [];\n        const n = orders.length;\n' +
    '        for (let i = 0; i < n; i++) {\n            const rawOrder = this.safeDict (orders, i);\n' +
    "            ids.push (this.safeString (rawOrder, 'id'));\n        }\n        return { 'ids': ids };\n";

describe ('h27g27: List-declared and pass-through request-row slots', () => {
    afterAll (() => fs.rmSync (path.join (__dirname, 'files', 'tmp-h27g27'), { recursive: true, force: true }));
    test ('a List row parameter and a pass-through override print map rows; a Dict tuple literal opens as the slice', () => {
        const out = print (LOOP);
        expect (out).toContain ('EditOrdersRequest(orders []map[string]any, optionalArgs ...any)');
        expect (out).toContain ('\t\tvar rawOrder map[string]any = orders[i]\n');
        expect (out).toContain ('editOrdersBody(ch chan any, orders []map[string]any, optionalArgs ...any)');
        expect (out).toContain ('this.EditOrders([]map[string]any{order}, map[string]any{})');
        expect (out).not.toContain ('SafeMapTyped(orders, i)');
    });
    test ('without the table rows everything stays boxed', () => {
        const out = print (LOOP, '', {});
        expect (out).not.toContain ('[]map[string]any{order}');
        expect (out).toContain ('SafeMapTyped(orders, i)');
    });
    test ('an unbounded read keeps the List parameter boxed', () => {
        const out = print ("        return this.safeDict (orders, 0);\n");
        expect (out).not.toContain ('EditOrdersRequest(orders []map[string]any');
    });
    test ('a nil test of the List parameter keeps it boxed', () => {
        const out = print ('        if (orders === undefined) {\n            return {};\n        }\n        return { \'n\': orders.length };\n');
        expect (out).not.toContain ('EditOrdersRequest(orders []map[string]any');
    });
    test ('a literal of a boxed element is not a row slice', () => {
        const extra = '    async editAny (x: any): Promise<any> {\n        return await this.editOrders ([ x ], {});\n    }\n';
        const out = print (LOOP, extra);
        expect (out).not.toContain ('[]map[string]any{x}');
    });
});
