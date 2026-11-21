import fs from 'fs';
import path from 'path';
import { Transpiler, installCcxtGoLocalTypes } from '../src/transpiler';

describe ('go nil-declared join: base map producers in every arm', () => {
    const root = path.join (__dirname, 'files', 'tmp-h11g24', 'ts', 'src');
    const BASE =
        'export type Dict = { [key: string]: any };\n' +
        'export class Exchange {\n' +
        '    parseWsTrade (t: any, m: any = undefined): Dict { return t; }\n' +
        '    parseWsTicker (t: any, m: any = undefined): Dict { return t; }\n' +
        '    safeValue (o: any, k: any, d: any = undefined): any { return o; }\n' +
        '    safeString (o: any, k: any, d: any = undefined): string { return o; }\n' +
        '}\n';
    const VENUE = (otherArm: string) =>
        "import { Exchange, Dict } from './base/Exchange';\n" +
        'export class ex extends Exchange {\n' +
        '    run (raw: Dict, spot: boolean) {\n' +
        '        let parsed: Dict;\n' +
        '        if (spot) {\n' +
        '            parsed = this.parseWsTicker (raw);\n' +
        '        } else {\n' +
        '            parsed = ' + otherArm + ';\n' +
        '        }\n' +
        "        return this.safeString (parsed, 'symbol');\n" +
        '    }\n' +
        '}\n';
    const print = (otherArm: string): string => {
        fs.mkdirSync (path.join (root, 'base'), { recursive: true });
        fs.writeFileSync (path.join (root, 'base', 'Exchange.ts'), BASE);
        fs.writeFileSync (path.join (root, 'ex.ts'), VENUE (otherArm));
        const t = new Transpiler ({ verbose: false, go: {} });
        installCcxtGoLocalTypes (t.goTranspiler);
        return t.transpileGoByPath (path.join (root, 'ex.ts')).content;
    };
    afterAll (() => fs.rmSync (path.join (__dirname, 'files', 'tmp-h11g24'), { recursive: true, force: true }));

    test ('both arms from map[string]any base producers: typed map', () => {
        expect (print ('this.parseWsTrade (raw)')).toContain ('var parsed map[string]any = nil');
    });
    test ('an untyped arm keeps the box', () => {
        expect (print ("this.safeValue (raw, 'x')")).toContain ('var parsed any = nil');
    });
});
