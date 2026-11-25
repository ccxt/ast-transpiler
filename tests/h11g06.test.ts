import fs from 'fs';
import path from 'path';
import { Transpiler, installCcxtGoGb05ParamTypes } from '../src/transpiler';

describe ('go parseBalance frame: sibling safeDict call sites', () => {
    const root = path.join (__dirname, 'files', 'tmp-h11g06', 'ts', 'src');
    const BASE =
        'export type Dict = { [key: string]: any };\n' +
        'export class Exchange {\n' +
        '    parseBalance (response: Dict): any { return response; }\n' +
        '}\n';
    const VENUE =
        "import { Exchange, Dict } from './base/Exchange';\n" +
        'export class ex extends Exchange {\n' +
        '    parseBalance (response: Dict): any {\n' +
        '        const keys = Object.keys (response);\n' +
        '        return keys.length;\n' +
        '    }\n' +
        '    run () {\n' +
        "        return this.parseBalance ({ 'a': 1 });\n" +
        '    }\n' +
        '}\n';
    const PRO = (body: string) =>
        "import exRest from '../ex';\n" +
        'export class ex extends exRest {\n' +
        '    handle (x: any) {\n' + body + '    }\n' +
        '}\n';
    const print = (proBody: string, install = true): string => {
        fs.mkdirSync (path.join (root, 'base'), { recursive: true });
        fs.mkdirSync (path.join (root, 'pro'), { recursive: true });
        fs.writeFileSync (path.join (root, 'base', 'Exchange.ts'), BASE);
        fs.writeFileSync (path.join (root, 'ex.ts'), VENUE);
        fs.writeFileSync (path.join (root, 'pro', 'ex.ts'), PRO (proBody));
        const t = new Transpiler ({ verbose: false, go: {} });
        if (install) { installCcxtGoGb05ParamTypes (t.goTranspiler); }
        return t.transpileGoByPath (path.join (root, 'ex.ts')).content;
    };
    afterAll (() => fs.rmSync (path.join (__dirname, 'files', 'tmp-h11g06'), { recursive: true, force: true }));

    test ('a sibling safeDict local proves the frame map', () => {
        const typed = print ("        const a = this.safeDict (x, 'k', {});\n        return this.parseBalance (a);\n");
        expect (typed).toContain ('ParseBalance(response map[string]any)');
        expect (print ("        const a = this.safeDict (x, 'k', {});\n        return this.parseBalance (a);\n", false)).toContain ('ParseBalance(response any)');
    });
    test ('an untyped sibling argument keeps the box', () => {
        const boxed = print ('        return this.parseBalance (x);\n');
        expect (boxed).toContain ('ParseBalance(response any)');
        expect (boxed).toContain ('ObjectKeys(response)');
    });
});
