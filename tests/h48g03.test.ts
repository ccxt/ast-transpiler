import fs from 'fs';
import path from 'path';
import { Transpiler, installCcxtGoDictParams } from '../src/transpiler';

describe ('go dict params: safeBalance takes the this.balance field', () => {
    let run = 0;
    const BASE = 'type Dict = { [key: string]: any };\n' +
        'export class Exchange {\n' +
        '    balance: Dict = {};\n' +
        '    other: any = undefined;\n' +
        '    // METHODS BELOW THIS LINE ARE TRANSPILED FROM TYPESCRIPT\n' +
        '    safeBalance (balance: Dict): Dict {\n' +
        '        balance[\'free\'] = {};\n' +
        '        return balance;\n' +
        '    }\n' +
        '}\n';
    const print = (call: string): string => {
        // the tree and sibling-program caches are per root: one root per print
        run += 1;
        const root = path.join (__dirname, 'files', 'tmp-h48g03', String (run), 'ts', 'src');
        fs.mkdirSync (path.join (root, 'base'), { recursive: true });
        fs.mkdirSync (path.join (root, 'pro'), { recursive: true });
        fs.writeFileSync (path.join (root, 'base', 'Exchange.ts'), BASE);
        fs.writeFileSync (path.join (root, 'pro', 'foo.ts'),
            'import { Exchange } from \'../base/Exchange.js\';\n' +
            'export default class foo extends Exchange {\n' +
            '    handleBalance (client: any, message: any) {\n' +
            '        this.balance = this.safeBalance (' + call + ');\n' +
            '        return this.balance;\n' +
            '    }\n' +
            '}\n');
        const t = new Transpiler ({ verbose: false, go: {} });
        installCcxtGoDictParams (t.goTranspiler);
        return t.transpileGoByPath (path.join (root, 'base', 'Exchange.ts')).content;
    };
    afterAll (() => fs.rmSync (path.join (__dirname, 'files', 'tmp-h48g03'), { recursive: true, force: true }));

    test ('a sibling call passing this.balance types the parameter', () => {
        const out = print ('this.balance');
        expect (out).toContain ('SafeBalance(balance map[string]any)');
        expect (out).not.toContain ('AddElementToObject(balance');
    });
    test.each ([ 'this.other', 'this.balance[\'cash\']', 'message', 'undefined' ]) ('%s keeps the box', (call: string) => {
        expect (print (call)).toContain ('SafeBalance(balance any)');
    });
});
