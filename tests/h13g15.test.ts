import fs from 'fs';
import path from 'path';
import { Transpiler } from '../src/transpiler';

describe ('go list row param: sibling []-defaulted safeList call sites', () => {
    const root = path.join (__dirname, 'files', 'tmp-h13g15', 'ts', 'src');
    const BASE =
        'export type Dict = { [key: string]: any };\n' +
        'export class Exchange {\n' +
        '    safeList (d: any, k: any, def: any = undefined): any { return def; }\n' +
        '}\n';
    const VENUE =
        "import { Exchange, Dict } from './base/Exchange';\n" +
        'export class ex extends Exchange {\n' +
        '    parseBalanceList (response: Dict[]): any {\n' +
        '        let n = 0;\n' +
        '        for (let i = 0; i < response.length; i++) {\n' +
        '            n = n + 1;\n' +
        '        }\n' +
        '        return n;\n' +
        '    }\n' +
        '    run () {\n' +
        '        return this.parseBalanceList ([]);\n' +
        '    }\n' +
        '}\n';
    const PRO = (body: string) =>
        "import exRest from '../ex';\n" +
        'export class ex extends exRest {\n' +
        '    handle (x: any) {\n' + body + '    }\n' +
        '}\n';
    const print = (proBody: string): string => {
        fs.mkdirSync (path.join (root, 'base'), { recursive: true });
        fs.mkdirSync (path.join (root, 'pro'), { recursive: true });
        fs.writeFileSync (path.join (root, 'base', 'Exchange.ts'), BASE);
        fs.writeFileSync (path.join (root, 'ex.ts'), VENUE);
        fs.writeFileSync (path.join (root, 'pro', 'ex.ts'), PRO (proBody));
        const t = new Transpiler ({ verbose: false, go: {} });
        return t.transpileGoByPath (path.join (root, 'ex.ts')).content;
    };
    afterAll (() => fs.rmSync (path.join (__dirname, 'files', 'tmp-h13g15'), { recursive: true, force: true }));

    test ('a sibling []-defaulted safeList local proves the []any row', () => {
        const typed = print ("        const a = this.safeList (x, 'k', []);\n        return this.parseBalanceList (a);\n");
        expect (typed).toContain ('ParseBalanceList(response []any)');
        expect (typed).toContain ('len(response)');
    });
    test ('a safeList without a default keeps the box', () => {
        const boxed = print ("        const a = this.safeList (x, 'k');\n        return this.parseBalanceList (a);\n");
        expect (boxed).toContain ('ParseBalanceList(response any)');
        expect (boxed).toContain ('GetArrayLength(response)');
    });
    test ('a rebound safeList local keeps the box', () => {
        const boxed = print ("        let a = this.safeList (x, 'k', []);\n        a = x;\n        return this.parseBalanceList (a);\n");
        expect (boxed).toContain ('ParseBalanceList(response any)');
    });
});
