import fs from 'fs';
import path from 'path';
import { Transpiler, installCcxtGoDictParams } from '../src/transpiler';

describe ('go dict params: safeBalance balance', () => {
    const root = path.join (__dirname, 'files', 'tmp-h47g12', 'ts', 'src');
    const BASE = (body: string) =>
        'type Dict = { [key: string]: any };\n' +
        'export class Exchange {\n' +
        '    balance: Dict = {};\n' +
        '    // METHODS BELOW THIS LINE ARE TRANSPILED FROM TYPESCRIPT\n' +
        '    run (x: any, k: string) {\n' + body + '    }\n' +
        '    safeDict (d: any, k: any, v: any = undefined): any { return undefined; }\n' +
        '    safeBalance (balance: Dict): Dict {\n        balance[\'free\'] = {};\n        return balance;\n    }\n' +
        '}\n';
    const print = (body: string): string => {
        fs.mkdirSync (path.join (root, 'base'), { recursive: true });
        fs.writeFileSync (path.join (root, 'base', 'Exchange.ts'), BASE (body));
        const t = new Transpiler ({ verbose: false, go: {} });
        installCcxtGoDictParams (t.goTranspiler);
        return t.transpileGoByPath (path.join (root, 'base', 'Exchange.ts')).content;
    };
    afterAll (() => fs.rmSync (path.join (__dirname, 'files', 'tmp-h47g12'), { recursive: true, force: true }));

    test ('a defaulted safeDict read and a map local type the balance parameter', () => {
        const out = print ('        const m: Dict = {};\n        this.safeBalance (m);\n        this.safeBalance (this.safeDict (this.balance, k, {}));\n');
        expect (out).toContain ('SafeBalance(balance map[string]any)');
        expect (out).not.toContain ('AddElementToObject(balance');
    });
    test ('an untyped, nil or undefaulted argument keeps the box', () => {
        expect (print ('        this.safeBalance (x);\n')).toContain ('SafeBalance(balance any)');
        expect (print ('        this.safeBalance (undefined);\n')).toContain ('SafeBalance(balance any)');
        expect (print ('        this.safeBalance (this.safeDict (this.balance, k));\n')).toContain ('SafeBalance(balance any)');
    });
});
