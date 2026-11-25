import fs from 'fs';
import path from 'path';
import { Transpiler, installCcxtGoLocalTypes } from '../src/transpiler';

describe ('go: a *string reader local written with the head of a literal split stays *string', () => {
    const root = path.join (__dirname, 'files', 'tmp-h18g12', 'ts', 'src');
    const BASE = (body: string) =>
        'type Dict = { [key: string]: any };\n' +
        'type Str = string | undefined;\n' +
        'export class Exchange {\n' +
        '    safeString (d: any, k: any): Str { return undefined; }\n' +
        '    safeString2 (d: any, k: any, k2: any): Str { return undefined; }\n' +
        '    safeTrade (d: any): Dict { return d; }\n' +
        '    parseTrade (trade: Dict): Dict {\n' +
        '        let side = this.safeString2 (trade, "direction", "side");\n' +
        '        const rawType = this.safeString (trade, "type");\n' + body +
        '        return this.safeTrade ({ "side": side });\n' +
        '    }\n' +
        '}\n';
    const print = (body: string): string => {
        fs.mkdirSync (path.join (root, 'base'), { recursive: true });
        fs.writeFileSync (path.join (root, 'base', 'Exchange.ts'), BASE (body));
        const t = new Transpiler ({ verbose: false, go: {} });
        installCcxtGoLocalTypes (t.goTranspiler);
        return t.transpileGoByPath (path.join (root, 'base', 'Exchange.ts')).content;
    };
    afterAll (() => fs.rmSync (path.join (__dirname, 'files', 'tmp-h18g12'), { recursive: true, force: true }));

    test ('split head of a narrowed string keeps the local *string', () => {
        const out = print ('        if ((rawType !== undefined) && (rawType.indexOf ("-") >= 0)) {\n            const typeParts = rawType.split ("-");\n            side = typeParts[0];\n        }\n');
        expect (out).toContain ('var side *string = this.SafeString2(trade, "direction", "side")');
        expect (out).toContain ('sideStr := typeParts[0]\n');
        expect (out).toContain ('side = &sideStr\n');
    });
    test ('a non-head index (may be out of range) keeps the box', () => {
        const out = print ('        if (rawType !== undefined) {\n            const typeParts = rawType.split ("-");\n            side = typeParts[1];\n        }\n');
        expect (out).toContain ('var side any = ');
    });
    test ('a split of a possibly-undefined value keeps the box', () => {
        const out = print ('        const raw: any = this.safeString (trade, "x");\n        const typeParts = raw.split ("-");\n        side = typeParts[0];\n');
        expect (out).toContain ('var side any = ');
    });
    test ('a split on an empty separator keeps the box', () => {
        const out = print ('        if (rawType !== undefined) {\n            const typeParts = rawType.split ("");\n            side = typeParts[0];\n        }\n');
        expect (out).toContain ('var side any = ');
    });
    test ('a split of the written local itself keeps the box', () => {
        const out = print ('        if (side !== undefined) {\n            const sideParts = side.split ("@");\n            side = sideParts[0];\n        }\n');
        expect (out).not.toContain ('side = &sideStr');
        expect (out).not.toContain ('var side *string');
    });
});
