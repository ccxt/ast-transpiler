import fs from 'fs';
import path from 'path';
import { Transpiler, installCcxtGoDictParams } from '../src/transpiler';

describe ('go dict params: getCacheIndex row with a hand-written base caller', () => {
    const root = path.join (__dirname, 'files', 'tmp-h45g07', 'ts', 'src');
    const BASE = (body: string) =>
        'type Dict = { [key: string]: any };\n' +
        'type NullableDict = Dict | undefined;\n' +
        'export class Exchange {\n' +
        '    // METHODS BELOW THIS LINE ARE TRANSPILED FROM TYPESCRIPT\n' +
        '    async loadOrderBook (x: any) {\n' + body + '    }\n' +
        '    getCacheIndex (orderbook: NullableDict, deltas: any[]): number {\n        return -1;\n    }\n' +
        '}\n';
    const print = (body: string, handWritten: string[] | undefined): string => {
        fs.mkdirSync (path.join (root, 'base'), { recursive: true });
        fs.writeFileSync (path.join (root, 'base', 'Exchange.ts'), BASE (body));
        const go: any = (handWritten === undefined) ? {} : { 'handWrittenBaseMethods': handWritten };
        const t = new Transpiler ({ verbose: false, go });
        installCcxtGoDictParams (t.goTranspiler);
        return t.transpileGoByPath (path.join (root, 'base', 'Exchange.ts')).content;
    };
    afterAll (() => fs.rmSync (path.join (__dirname, 'files', 'tmp-h45g07'), { recursive: true, force: true }));

    test ('a call inside a hand-written base method does not keep the box', () => {
        const out = print ('        const index = this.getCacheIndex (x, []);\n', [ 'loadOrderBook' ]);
        expect (out).toContain ('GetCacheIndex(orderbook map[string]any');
    });
    test ('the same call in a printed base method keeps the box', () => {
        expect (print ('        const index = this.getCacheIndex (x, []);\n', undefined)).toContain ('GetCacheIndex(orderbook any');
        expect (print ('        const index = this.getCacheIndex (x, []);\n', [ 'other' ])).toContain ('GetCacheIndex(orderbook any');
        expect (print ('        const index = this.getCacheIndex (undefined, []);\n', [])).toContain ('GetCacheIndex(orderbook any');
    });
});
