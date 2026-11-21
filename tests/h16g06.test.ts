import fs from 'fs';
import path from 'path';
import { Transpiler } from '../src/transpiler';

describe ('go string[] venue param fed by a slice-table []string param', () => {
    const root = path.join (__dirname, 'files', 'tmp-h16g06', 'ts', 'src');
    const BASE =
        'export type Dict = { [key: string]: any };\n' +
        'export type Str = string | undefined;\n' +
        'export class Exchange {\n' +
        '    async cancelOrders (ids: string[], symbol: Str = undefined, params: Dict = {}): Promise<any> { return undefined; }\n' +
        '}\n';
    const VENUE = (body: string) =>
        "import { Exchange, Dict, Str } from './base/Exchange';\n" +
        'export class ex extends Exchange {\n' +
        '    async cancelOrdersRequest (ids: string[], symbol: Str = undefined, params: Dict = {}): Promise<Dict> {\n' + body + '    }\n' +
        '}\n';
    // the only caller sits in a sibling (pro) file, inside an `if` after the method header
    const PRO = (caller: string) =>
        "import exRest from '../ex';\n" +
        "import { Dict, Str } from '../base/Exchange';\n" +
        'export default class ex extends exRest {\n' +
        '    async cancelOrders (ids: string[], symbol: Str = undefined, params: Dict = {}): Promise<any> {\n' +
        '        if (symbol === undefined) {\n' +
        '            symbol = \'x\';\n' +
        '        }\n' + caller + '    }\n' +
        '}\n';
    const print = (body: string, caller: string): string => {
        fs.mkdirSync (path.join (root, 'base'), { recursive: true });
        fs.writeFileSync (path.join (root, 'base', 'Exchange.ts'), BASE);
        fs.mkdirSync (path.join (root, 'pro'), { recursive: true });
        fs.writeFileSync (path.join (root, 'ex.ts'), VENUE (body).replace ('export class ex', 'export default class ex'));
        fs.writeFileSync (path.join (root, 'pro', 'ex.ts'), PRO (caller));
        const t = new Transpiler ({ verbose: false, go: { unifiedSliceParams: { 'cancelOrders': { 0: '[]string' } } } });
        return t.transpileGoByPath (path.join (root, 'ex.ts')).content;
    };
    afterAll (() => fs.rmSync (path.join (__dirname, 'files', 'tmp-h16g06'), { recursive: true, force: true }));
    const BODY =
        '        const out = [];\n' +
        '        for (let i = 0; i < ids.length; i++) {\n' +
        '            out.push (i);\n' +
        '        }\n' +
        "        const tx: Dict = { 'digests': ids, 'n': out };\n" +
        '        return tx;\n';
    const CALL = '        return await this.cancelOrdersRequest (ids, symbol, params);\n';

    test ('typed caller: []string param, len native', () => {
        const out = print (BODY, CALL);
        expect (out).toContain ('CancelOrdersRequest(ids []string');
        expect (out).toContain ('i < len(ids)');
    });
    test ('an untyped caller keeps the box', () => {
        const out = print (BODY, '        const x: any = ids;\n        return await this.cancelOrdersRequest (x, symbol, params);\n');
        expect (out).toContain ('CancelOrdersRequest(ids any');
        expect (out).toContain ('GetArrayLength(ids)');
    });
    test ('a body writing a non-slice keeps the box', () => {
        const out = print ('        ids = undefined;\n' + BODY, CALL);
        expect (out).not.toContain ('ids []string');
    });
});
