import fs from 'fs';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

describe ('go sibling-file Num parameter: the calling method must bind it as *float64', () => {
    const root = path.join (__dirname, 'files', 'tmp-h28g07', 'ts', 'src');
    const BASE =
        'export type Num = number | undefined;\n' +
        'export type Dict = { [key: string]: any };\n' +
        'export class Exchange {\n' +
        '    other (x: any): any { return x; }\n' +
        '    async editOrder (id: string, amount: Num = undefined, params: Dict = {}): Promise<Dict> { return {}; }\n' +
        '    async editOrderWs (id: string, amount: Num = undefined, params: Dict = {}): Promise<Dict> { return {}; }\n' +
        '}\n';
    const VENUE =
        "import { Exchange, Num, Dict } from './base/Exchange';\n" +
        'export class ex extends Exchange {\n' +
        '    override async editOrder (id: string, amount: Num = undefined, params: Dict = {}): Promise<Dict> {\n' +
        '        return this.editOrderRequest (id, amount, params);\n' +
        '    }\n' +
        '    editOrderRequest (id: string, amount: Num, params: Dict = {}): Dict {\n' +
        '        const request: Dict = { "id": id };\n' +
        '        if (amount === undefined) {\n' +
        '            return request;\n' +
        '        }\n' +
        '        return request;\n' +
        '    }\n' +
        '}\n';
    const PRO = (body: string) =>
        "import exRest from '../ex';\n" +
        "import { Num, Dict } from '../base/Exchange';\n" +
        'export class ex extends exRest {\n' +
        '    override async editOrderWs (id: string, amount: Num = undefined, params: Dict = {}): Promise<Dict> {\n' + body + '    }\n' +
        '}\n';
    const print = (proBody: string): string => {
        fs.mkdirSync (path.join (root, 'base'), { recursive: true });
        fs.mkdirSync (path.join (root, 'pro'), { recursive: true });
        fs.writeFileSync (path.join (root, 'base', 'Exchange.ts'), BASE);
        fs.writeFileSync (path.join (root, 'ex.ts'), VENUE);
        fs.writeFileSync (path.join (root, 'pro', 'ex.ts'), PRO (proBody));
        const t = new Transpiler ({ verbose: false, go: { asyncMethodSuffix: 'Async' } });
        installCcxtGoHooks ((t as any).goTranspiler);
        return t.transpileGoByPath (path.join (root, 'ex.ts')).content;
    };
    afterAll (() => fs.rmSync (path.join (__dirname, 'files', 'tmp-h28g07'), { recursive: true, force: true }));

    test ('a sibling caller whose own Num parameter is GetArgFloat64Ptr-bound proves *float64', () => {
        const typed = print ('        return this.editOrderRequest (id, amount, params);\n');
        expect (typed).toContain ('EditOrderRequest(id any, amount *float64');
        expect (typed).toContain ('amount == nil');
    });
    test ('a sibling caller that binds its Num with a plain GetArg keeps the box', () => {
        // the second use hands amount to an `any` parameter, so editWs binds it with GetArg (any)
        const boxed = print ('        this.other (amount);\n        return this.editOrderRequest (id, amount, params);\n');
        expect (boxed).not.toContain ('amount *float64, optionalArgs');
        expect (boxed).toContain ('EditOrderRequest(id any, amount any');
    });
    test ('a sibling caller passing a non-parameter value keeps the box', () => {
        const boxed = print ('        const a = this.other (amount);\n        return this.editOrderRequest (id, a, params);\n');
        expect (boxed).toContain ('EditOrderRequest(id any, amount any');
    });
});
