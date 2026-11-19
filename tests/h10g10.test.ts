import fs from 'fs';
import path from 'path';
import { Transpiler, installCcxtGoDictParams } from '../src/transpiler';

describe ('go dict params: removeKeysFromDict map receiver', () => {
    const root = path.join (__dirname, 'files', 'tmp-h10g10', 'ts', 'src');
    const BASE =
        'type Dict = { [key: string]: any };\n' +
        'export class Exchange {\n' +
        '    inArray (a, b) { return false; }\n' +
        '    removeKeysFromDict (dict: Dict, removeKeys: string[]): Dict {\n' +
        '        const keys = Object.keys (dict);\n' +
        '        const newDict = {};\n' +
        '        for (let i = 0; i < keys.length; i++) {\n' +
        '            const key = keys[i];\n' +
        '            if (!this.inArray (key, removeKeys)) {\n' +
        '                newDict[key] = dict[key];\n' +
        '            }\n' +
        '        }\n' +
        '        return newDict;\n' +
        '    }\n' +
        '}\n';
    const VENUE = (call: string) =>
        "import { Exchange } from './base/Exchange';\n" +
        'type Dict = { [key: string]: any };\n' +
        'export class ex extends Exchange {\n' +
        '    run (x: any) {\n' + call + '    }\n' +
        '}\n';
    const print = (file: string, call: string, install = true): string => {
        fs.mkdirSync (path.join (root, 'base'), { recursive: true });
        fs.writeFileSync (path.join (root, 'base', 'Exchange.ts'), BASE);
        fs.writeFileSync (path.join (root, 'ex.ts'), VENUE (call));
        const t = new Transpiler ({ verbose: false, go: {} });
        if (install) { installCcxtGoDictParams (t.goTranspiler); }
        return t.transpileGoByPath (path.join (root, file)).content;
    };
    afterAll (() => fs.rmSync (path.join (__dirname, 'files', 'tmp-h10g10'), { recursive: true, force: true }));

    test ('the base receiver prints the map when every call site passes one', () => {
        const typed = print ('base/Exchange.ts', '        const r: Dict = {};\n        return this.removeKeysFromDict (r, []);\n');
        expect (typed).toContain ('RemoveKeysFromDict(dict map[string]any');
        expect (typed).toContain ('dict[key]');
        expect (print ('base/Exchange.ts', '        return 0;\n', false)).toContain ('RemoveKeysFromDict(dict any');
    });
    test ('an untyped call site keeps the base box', () => {
        const boxed = print ('base/Exchange.ts', '        return this.removeKeysFromDict (x, []);\n');
        expect (boxed).toContain ('RemoveKeysFromDict(dict any');
        expect (boxed).toContain ('GetValue(dict, key)');
    });
});
