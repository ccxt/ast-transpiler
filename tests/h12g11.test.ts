import fs from 'fs';
import path from 'path';
import { Transpiler, installCcxtGoDictParams, installCcxtGoLocalTypes } from '../src/transpiler';

describe ('go dict params: safeDict-with-default argument and nil-seeded safeDict join', () => {
    const root = path.join (__dirname, 'files', 'tmp-h12g11', 'ts', 'src');
    const BASE = (call: string) =>
        'type Dict = { [key: string]: any };\n' +
        'export class Exchange {\n' +
        '    options: Dict = {};\n' +
        '    isString (v) { return false; }\n' +
        '    safeDict (d: any, k: any, def: any = undefined): any { return def; }\n' +
        '    init () {\n' + call + '    }\n' +
        '    invertFlatStringDictionary (dict: any): Dict {\n' +
        '        const reversed: Dict = {};\n' +
        '        const keys = Object.keys (dict);\n' +
        '        for (let i = 0; i < keys.length; i++) {\n' +
        '            const key = keys[i];\n' +
        '            const value = dict[key];\n' +
        '            if (this.isString (value)) {\n' +
        '                reversed[value] = key;\n' +
        '            }\n' +
        '        }\n' +
        '        return reversed;\n' +
        '    }\n' +
        '}\n';
    const print = (call: string): string => {
        fs.mkdirSync (path.join (root, 'base'), { recursive: true });
        fs.writeFileSync (path.join (root, 'base', 'Exchange.ts'), BASE (call));
        const t = new Transpiler ({ verbose: false, go: {} });
        installCcxtGoLocalTypes (t.goTranspiler);
        installCcxtGoDictParams (t.goTranspiler);
        return t.transpileGoByPath (path.join (root, 'base', 'Exchange.ts')).content;
    };
    afterAll (() => fs.rmSync (path.join (__dirname, 'files', 'tmp-h12g11'), { recursive: true, force: true }));

    test ('a {}-defaulted safeDict argument prints the typed read and types the receiver', () => {
        const typed = print ("        return this.invertFlatStringDictionary (this.safeDict (this.options, 'networks', {}));\n");
        expect (typed).toContain ('InvertFlatStringDictionary(dict map[string]any)');
        expect (typed).toContain ('this.InvertFlatStringDictionary(this.SafeDictMap(this.Options, "networks", map[string]any{}))');
        expect (typed).toContain ('var value any = dict[key]');
    });
    test ('a safeDict without a default keeps the box', () => {
        const boxed = print ("        return this.invertFlatStringDictionary (this.safeDict (this.options, 'networks'));\n");
        expect (boxed).toContain ('InvertFlatStringDictionary(dict any)');
        expect (boxed).toContain ('GetValue(dict, key)');
        expect (boxed).not.toContain ('SafeDictMap');
    });
});
