import fs from 'fs';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

describe ('go position parser result locals print map[string]any (h30g08)', () => {
    const root = path.join (__dirname, 'files', 'tmp-h30g08', 'ts', 'src');
    const BASE =
        'export type Dict = { [key: string]: any };\n' +
        'export class Exchange {\n' +
        '    parseWsOptionsPosition (p: Dict, m: any = undefined): Dict {\n' +
        '        return { "info": p };\n' +
        '    }\n' +
        '    parsePredictionPosition (p: Dict, m: any = undefined): Dict {\n' +
        '        return { "info": p };\n' +
        '    }\n' +
        '    parseOtherPosition (p: Dict): Dict {\n' +
        '        return p;\n' +
        '    }\n' +
        '    keep (t: any): any {\n' +
        '        return t;\n' +
        '    }\n' +
        '}\n';
    const VENUE =
        "import { Exchange } from './base/Exchange.js';\n" +
        'export default class v extends Exchange {\n' +
        '    handleWs (raw: Dict, ts: any) {\n' +
        '        const position = this.parseWsOptionsPosition (raw);\n' +
        "        position['timestamp'] = ts;\n" +
        '        return position;\n' +
        '    }\n' +
        '    fromClob (raw: Dict, o: any) {\n' +
        '        const parsed = this.parsePredictionPosition (raw, o);\n' +
        "        parsed['contracts'] = 1;\n" +
        '        return parsed;\n' +
        '    }\n' +
        '    rebound (raw: Dict) {\n' +
        '        let reb = this.parsePredictionPosition (raw);\n' +
        "        reb = this.keep ('x');\n" +
        "        reb['a'] = 1;\n" +
        '        return reb;\n' +
        '    }\n' +
        '    untabled (raw: Dict) {\n' +
        '        const other = this.parseOtherPosition (raw);\n' +
        "        other['a'] = 1;\n" +
        '        return other;\n' +
        '    }\n' +
        '}\n';
    let out = '';
    beforeAll (() => {
        fs.mkdirSync (path.join (root, 'base'), { recursive: true });
        fs.writeFileSync (path.join (root, 'base', 'Exchange.ts'), BASE);
        fs.writeFileSync (path.join (root, 'v.ts'), VENUE);
        const t = new Transpiler ({ verbose: false, go: {} });
        installCcxtGoHooks (t.goTranspiler);
        out = t.transpileGoByPath (path.join (root, 'v.ts')).content;
    });
    afterAll (() => fs.rmSync (path.join (__dirname, 'files', 'tmp-h30g08'), { recursive: true, force: true }));

    test ('positive: the parser result is a typed map written natively', () => {
        expect (out).toMatch (/var position map\[string\]any = this\.ParseWsOptionsPosition\(raw\)/);
        expect (out).toMatch (/position\["timestamp"\] = ts/);
        expect (out).toMatch (/var parsed map\[string\]any = this\.ParsePredictionPosition\(raw, o\)/);
        expect (out).toMatch (/parsed\["contracts"\] = 1/);
    });

    test ('negative: a local rebound to a non-map value is not printed as a typed map', () => {
        expect (out).not.toMatch (/var reb map\[string\]any/);
        expect (out).not.toMatch (/reb\["a"\] = 1/);
    });

    test ('negative: a parser outside the table is not printed as a typed map', () => {
        expect (out).not.toMatch (/var other map\[string\]any/);
    });
});
