import fs from 'fs';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

describe ('go call argument concat with one *string call leaf', () => {
    const root = path.join (__dirname, 'files', 'tmp-h27g15', 'ts', 'src');
    const BASE =
        'export type Str = string | undefined;\n' +
        'export class Exchange {\n' +
        "    id: string = 'x';\n" +
        '    marketId (symbol: string): Str {\n' +
        '        return symbol;\n' +
        '    }\n' +
        '    safeValue (o: any, k: string): any {\n' +
        '        return o[k];\n' +
        '    }\n' +
        '    resolve (x: any, h: Str): void {\n' +
        '    }\n' +
        '    cleanUnsubscription (client: any, subHash: Str, unsubHash: Str, subHashIsPrefix = false) {\n' +
        '    }\n' +
        '}\n';
    const VENUE =
        "import { Exchange } from './base/Exchange.js';\n" +
        'export default class v extends Exchange {\n' +
        '    one (m: any, symbol: string) {\n' +
        "        this.resolve (m, 'bidask:' + this.marketId (symbol));\n" +
        '    }\n' +
        '    pushed (symbol: string) {\n' +
        '        const topics = [];\n' +
        "        topics.push ('pos.' + this.marketId (symbol));\n" +
        '        return topics;\n' +
        '    }\n' +
        '    commented (client: any, symbol: string, channel: string) {\n' +
        '        // keep this comment\n' +
        "        this.cleanUnsubscription (client, 'c:' + this.marketId (symbol), undefined);\n" +
        '    }\n' +
        '    anyCall (m: any) {\n' +
        "        this.resolve (m, 'k:' + this.safeValue (m, 'k'));\n" +
        '    }\n' +
        '    twoCalls (m: any, symbol: string) {\n' +
        "        this.resolve (this.safeValue (m, 'x'), 'k:' + this.marketId (symbol));\n" +
        '    }\n' +
        '}\n';
    let out = '';
    const body = (name) => {
        const start = out.indexOf (') ' + name.charAt (0).toUpperCase () + name.slice (1) + '(');
        const end = out.indexOf ('\nfunc ', start + 1);
        return out.substring (start, (end < 0) ? out.length : end);
    };
    beforeAll (() => {
        fs.mkdirSync (path.join (root, 'base'), { recursive: true });
        fs.writeFileSync (path.join (root, 'base', 'Exchange.ts'), BASE);
        fs.writeFileSync (path.join (root, 'v.ts'), VENUE);
        const t = new Transpiler ({ verbose: false, go: {} });
        installCcxtGoHooks (t.goTranspiler);
        out = t.transpileGoByPath (path.join (root, 'v.ts')).content;
    });
    afterAll (() => fs.rmSync (path.join (__dirname, 'files', 'tmp-h27g15'), { recursive: true, force: true }));

    test ('positive: the call leaf is bound in the if header, native concat, nil argument otherwise', () => {
        const b = body ('one');
        expect (b).toMatch (/if argPiece := this\.MarketId\(symbol\); argPiece != nil \{\n\s*this\.Resolve\(m, "bidask:" \+ \*argPiece\)\n\s*\} else \{\n\s*this\.Resolve\(m, nil\)\n\s*\}/);
        expect (b).not.toMatch (/Add\(/);
    });
    test ('negative: a push keeps the helper (a typed list cannot take the nil element)', () => {
        expect (body ('pushed')).toMatch (/Add\(/);
    });
    test ('positive: a leading comment stays above the if, the nil branch passes nil', () => {
        expect (body ('commented')).toMatch (/\/\/ keep this comment\n\s*if argPiece := this\.MarketId\(symbol\); argPiece != nil \{\n\s*this\.CleanUnsubscription\(client, "c:" \+ \*argPiece, nil\)\n\s*\} else \{\n\s*this\.CleanUnsubscription\(client, nil, nil\)/);
    });
    test ('negative: an any-typed call leaf keeps the helper', () => {
        expect (body ('anyCall')).toMatch (/Add\(/);
    });
    test ('negative: another call in the statement keeps the helper (evaluation order)', () => {
        expect (body ('twoCalls')).toMatch (/Add\(/);
    });
});
