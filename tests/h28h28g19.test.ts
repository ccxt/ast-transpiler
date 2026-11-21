import fs from 'fs';
import path from 'path';
import { Transpiler } from '../src/transpiler';

const root = path.join (__dirname, 'files', 'tmp-h28g19', 'ts', 'src');
const BASE = 'export type Dict = { [key: string]: any };\nexport type List = any[];\n' +
    'export interface OrderRequest { symbol: string; }\nexport interface PredictionOrderRequest { outcome: string; }\n' +
    'export class Exchange {\n' +
    '    safeDict (o: any, k: any, d: any = undefined): any { return d; }\n' +
    '    safeString (o: any, k: any, d: any = undefined): string { return d; }\n' +
    '    async createOrders (orders: OrderRequest[], params: Dict = {}): Promise<any> { return undefined; }\n' +
    '}\nexport default Exchange;\n';
const TABLE = { 'createOrders': { 0: '[]map[string]any' } };
const print = (body: string, extra = '', table: any = TABLE, annotation = 'OrderRequest[]'): string => {
    fs.mkdirSync (path.join (root, 'base'), { recursive: true });
    fs.writeFileSync (path.join (root, 'base', 'Exchange.ts'), BASE);
    fs.writeFileSync (path.join (root, 'ex.ts'), "import { Exchange, Dict, List, OrderRequest, PredictionOrderRequest } from './base/Exchange';\nexport default class ex extends Exchange {\n" +
        '    async createOrders (orders: ' + annotation + ', params: Dict = {}): Promise<any> {\n' + body + '    }\n' + extra + '}\n');
    const t = new Transpiler ({ verbose: false, go: { unifiedSliceParams: table } });
    return t.transpileGoByPath (path.join (root, 'ex.ts')).content;
};
const LOOP = '        const ids = [];\n        for (let i = 0; i < orders.length; i++) {\n            const o = this.safeDict (orders, i);\n' +
    "            ids.push (this.safeString (o, 'outcome'));\n        }\n        return ids;\n";
const CALLER = (literal: string, use = '') => '    async tryBatch (other: any): Promise<any> {\n        const rows = ' + literal + ';\n' + use +
    '        return await other.createOrders (rows);\n    }\n';

describe ('h28g19: prediction order rows and request-row literal locals', () => {
    afterAll (() => fs.rmSync (path.join (__dirname, 'files', 'tmp-h28g19'), { recursive: true, force: true }));
    test ('a PredictionOrderRequest[] row slot prints map rows with native bounded reads', () => {
        const out = print (LOOP, '', TABLE, 'PredictionOrderRequest[]');
        expect (out).toContain ('createOrdersBody(ch chan any, orders []map[string]any, optionalArgs ...any)');
        expect (out).toContain ('var o map[string]any = orders[i]\n');
        expect (out).not.toContain ('SafeMapTyped(orders, i)');
    });
    test ('a PredictionOrderRequest[] parameter read unbounded is refused, never printed as a map slice', () => {
        expect (() => print ('        return this.safeDict (orders, 0);\n', '', TABLE, 'PredictionOrderRequest[]')).toThrow (/bounded map row/);
    });
    test ('a local list of object literals handed only to the row slot opens as the map slice', () => {
        const out = print (LOOP, CALLER ("[ { 'symbol': 'A' }, { 'symbol': 'B' } ]"));
        expect (out).toContain ('var rows []map[string]any = []map[string]any{map[string]any{');
    });
    test ('a literal local that is also read elsewhere stays []any', () => {
        const out = print (LOOP, CALLER ("[ { 'symbol': 'A' } ]", '        if (rows === undefined) {\n            return undefined;\n        }\n'));
        expect (out).not.toContain ('var rows []map[string]any');
    });
    test ('a literal with a non-object element stays []any', () => {
        const out = print (LOOP, CALLER ("[ { 'symbol': 'A' }, other ]"));
        expect (out).not.toContain ('var rows []map[string]any');
    });
    test ('without the table row the literal stays []any', () => {
        const out = print (LOOP, CALLER ("[ { 'symbol': 'A' } ]"), {});
        expect (out).not.toContain ('[]map[string]any{');
    });
});
