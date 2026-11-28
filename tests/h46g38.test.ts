import fs from 'fs';
import path from 'path';
import { Transpiler, installCcxtGoLocalTypes, installCcxtGoIndexableTypes, installCcxtGoParamTypes } from '../src/transpiler';

jest.mock('module', () => ({ __esModule: true, default: jest.fn() }));

describe ('go list producer locals whose callee already returns []any', () => {
    const root = path.join (__dirname, 'files', 'tmp-h46g38', 'ts', 'src');
    const BASE =
        'export type Dict = { [key: string]: any };\n' +
        'export class Exchange {\n' +
        '    parseOrder (o: Dict): Dict { return o; }\n' +
        '    parseOrders (orders: any, market: any = undefined): Dict[] {\n' +
        '        const out = [];\n' +
        '        for (let i = 0; i < orders.length; i++) {\n' +
        '            out.push (this.parseOrder (orders[i]));\n' +
        '        }\n' +
        '        return out;\n' +
        '    }\n' +
        '}\n';
    const VENUE = (body: string) =>
        "import { Exchange, Dict } from './base/Exchange';\n" +
        'export default class ex extends Exchange {\n' +
        '    parseEventToMarkets (event: any): Dict[] {\n' +
        '        const out = [];\n' +
        "        out.push ({ 'id': event });\n" +
        '        return out;\n' +
        '    }\n' +
        '    run (rows: any): any {\n' + body + '    }\n' +
        '}\n';
    const print = (body: string, lists: string[]): string => {
        fs.mkdirSync (path.join (root, 'base'), { recursive: true });
        fs.writeFileSync (path.join (root, 'base', 'Exchange.ts'), BASE);
        fs.writeFileSync (path.join (root, 'ex.ts'), VENUE (body));
        const t = new Transpiler ({ verbose: false, go: { generatedListCallees: lists } });
        installCcxtGoLocalTypes (t.goTranspiler, {});
        installCcxtGoIndexableTypes (t.goTranspiler);
        installCcxtGoParamTypes (t.goTranspiler);
        return t.transpileGoByPath (path.join (root, 'ex.ts')).content;
    };
    afterAll (() => fs.rmSync (path.join (__dirname, 'files', 'tmp-h46g38'), { recursive: true, force: true }));
    const BODY = '        const parsed = this.parseOrders (rows);\n        return parsed.length;\n';

    test ('a host-proven []any producer prints without ArrayTyped', () => {
        const out = print (BODY, [ 'ParseOrders' ]);
        expect (out).toContain ('var parsed []any = this.ParseOrders(rows)');
        expect (out).not.toContain ('ArrayTyped(this.ParseOrders');
    });

    test ('a producer the host does not prove keeps ArrayTyped', () => {
        const out = print (BODY, []);
        expect (out).not.toContain ('var parsed []any = this.ParseOrders(rows)\n');
    });

    test ('this class\'s own []any method prints without ArrayTyped', () => {
        const out = print ('        const markets = this.parseEventToMarkets (rows);\n        return markets.length;\n', []);
        expect (out).not.toContain ('ArrayTyped(this.ParseEventToMarkets');
        expect (out).toContain ('this.ParseEventToMarkets(rows)');
    });
});
