import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler, installCcxtGoDictParams } from '../src/transpiler';

describe ('go dict params: fetchUnifiedOrder order (async table row)', () => {
    const top = fs.mkdtempSync (path.join (os.tmpdir (), 'h46g12-'));
    const root = path.join (top, 'ts', 'src');
    const BASE = (body: string) =>
        'type Dict = { [key: string]: any };\n' +
        'type Order = { [key: string]: any };\n' +
        'export class Exchange {\n' +
        '    // METHODS BELOW THIS LINE ARE TRANSPILED FROM TYPESCRIPT\n' +
        '    safeString (d: any, k: any, v: any = undefined): any { return undefined; }\n' +
        '    async cancelOrder (id: string, symbol: any = undefined, params: Dict = {}): Promise<any> { return undefined; }\n' +
        '    async fetchUnifiedOrder (order: Order, params: Dict = {}): Promise<any> {\n' + body + '    }\n' +
        '    async cancelUnifiedOrder (order: Order, params: Dict = {}): Promise<any> {\n' +
        "        return await this.cancelOrder (this.safeString (order, 'id', ''), this.safeString (order, 'symbol'), params);\n" +
        '    }\n' +
        '    async fetchOtherOrder (order: Order, params: Dict = {}): Promise<any> {\n' +
        "        return await this.cancelOrder (this.safeString (order, 'id', ''), this.safeString (order, 'symbol'), params);\n" +
        '    }\n' +
        '}\n';
    const print = (body: string): string => {
        fs.mkdirSync (path.join (root, 'base'), { recursive: true });
        fs.writeFileSync (path.join (root, 'base', 'Exchange.ts'), BASE (body));
        const t = new Transpiler ({ verbose: false, go: { asyncMethodSuffix: 'Async' } });
        installCcxtGoDictParams (t.goTranspiler);
        return t.transpileGoByPath (path.join (root, 'base', 'Exchange.ts')).content;
    };
    afterAll (() => fs.rmSync (top, { recursive: true, force: true }));

    test ('the tabled async row types the fetchUnifiedOrder order parameter', () => {
        const out = print ("        return await this.cancelOrder (this.safeString (order, 'id', ''), this.safeString (order, 'symbol'), params);\n");
        expect (out).toContain ('FetchUnifiedOrderAsync(order map[string]any');
        expect (out).toMatch (/fetchUnifiedOrderBody\(ch chan [^,]+, order map\[string\]any,/);
    });
    test ('an async method outside the async rows keeps the box', () => {
        const out = print ("        return await this.cancelOrder (this.safeString (order, 'id', ''), this.safeString (order, 'symbol'), params);\n");
        expect (out).toContain ('FetchOtherOrderAsync(order any');
    });
    test ('a base body that writes the parameter another type keeps the box', () => {
        const out = print ("        order = 'x';\n        return await this.cancelOrder (this.safeString (order, 'id', ''), undefined, params);\n");
        expect (out).toContain ('FetchUnifiedOrderAsync(order any');
    });
});
