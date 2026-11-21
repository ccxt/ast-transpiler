import fs from 'fs';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

describe ('go async venue Str parameter fed by literals inside promises.push', () => {
    const root = path.join (__dirname, 'files', 'tmp-h16g05', 'ts', 'src');
    const BASE =
        'export type Str = string | undefined;\n' +
        'export type Dict = { [key: string]: any };\n' +
        'export class Exchange {\n' +
        '    async fetchX (o: Dict): Promise<any> { return o; }\n' +
        '}\n';
    const print = (body: string): string => {
        const venue =
            "import { Exchange, Str, Dict } from './base/Exchange';\n" +
            'export class ex extends Exchange {\n' + body +
            '    async run (key: string) {\n' +
            '        const promises = [];\n' +
            "        promises.push (this.byType ('spot', undefined));\n" +
            "        promises.push (this.byType (undefined, 'linear'));\n" +
            '        return await Promise.all (promises);\n' +
            '    }\n' +
            '}\n';
        fs.mkdirSync (path.join (root, 'base'), { recursive: true });
        fs.writeFileSync (path.join (root, 'base', 'Exchange.ts'), BASE);
        fs.writeFileSync (path.join (root, 'ex.ts'), venue);
        const t = new Transpiler ({ verbose: false, go: {} });
        installCcxtGoHooks (t.goTranspiler);
        return t.transpileGoByPath (path.join (root, 'ex.ts')).content;
    };
    afterAll (() => fs.rmSync (path.join (__dirname, 'files', 'tmp-h16g05'), { recursive: true, force: true }));

    test ('literal and undefined callers in promises.push type the async parameter *string', () => {
        const out = print (
            '    async byType (type: Str, subType: Str): Promise<any> {\n' +
            "        const isSpot = (type === 'spot');\n" +
            "        if (!isSpot && (subType === 'linear')) { return await this.fetchX ({}); }\n" +
            '        return undefined;\n' +
            '    }\n');
        expect (out).toMatch (/byTypeBody\(ch chan [^)]*, typeVar \*string, subType \*string\)/);
        expect (out).not.toContain ('IsEqual(typeVar, "spot")');
        expect (out).not.toContain ('IsEqual(subType, "linear")');
    });
    test ('a body that writes a non-string into the parameter keeps the box', () => {
        const out = print (
            '    async byType (type: Str, subType: any): Promise<any> {\n' +
            '        subType = 3;\n' +
            "        if (type === 'spot') { return subType; }\n" +
            '        return undefined;\n' +
            '    }\n');
        expect (out).toMatch (/byTypeBody\(ch chan [^)]*, typeVar \*string, subType any\)/);
    });
    test ('a nil-capable boxed caller whose value the body nil-tests keeps the box', () => {
        const out = print (
            '    async byType (type: Str, subType: Str): Promise<any> {\n' +
            '        if (subType === undefined) { return type; }\n' +
            '        return await this.fetchX ({});\n' +
            '    }\n' +
            '    async other (o: Dict) {\n' +
            "        return await this.byType ('swap', o['sub']);\n" +
            '    }\n');
        expect (out).toMatch (/byTypeBody\(ch chan [^)]*, typeVar \*string, subType any\)/);
        expect (out).toContain ('if subType == nil {');
    });
});
