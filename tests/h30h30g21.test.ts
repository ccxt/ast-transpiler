import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

// `this.client (url)` / `this.orderBook ()` in a prediction source take the ws interface types and the base
// `this.packb ()` takes `[]uint8`; a venue override and a REST source keep the box.
describe ('go local typed from a hand-written base return', () => {
    const TYPES = 'export type Dict = { [key: string]: any };\nexport type Str = string | undefined;\n';
    const BASE =
        "import { Dict } from './types.js';\n" +
        "import { packb } from './functions/encode.js';\n" +
        'export class Exchange {\n    packb = packb;\n' +
        '    client (url: Str): any {\n        return url;\n    }\n' +
        '    orderBook (snapshot = {}, depth = undefined): any {\n        return snapshot;\n    }\n' +
        '    hashMessage (m: any): string {\n        return m;\n    }\n}\n';
    const ENCODE = 'export function packb (req: any) {\n    return req;\n}\n';
    const PRED =
        "import { Exchange } from '../base/Exchange.js';\n" +
        'export default class pr extends Exchange {\n' +
        "    subscribe (url: string) {\n        const client = this.client (url);\n        const ob = this.orderBook ({});\n        return [ client, ob ];\n    }\n" +
        "    sign (a: any) {\n        const packed = this.packb (a);\n        return this.hashMessage (packed);\n    }\n" +
        '}\n';
    const OVER =
        "import { Exchange } from '../base/Exchange.js';\n" +
        'export default class ov extends Exchange {\n' +
        "    client (url: Str): any {\n        return undefined;\n    }\n" +
        "    subscribe (url: string) {\n        const client = this.client (url);\n        return client;\n    }\n" +
        '}\n';
    const REST =
        "import { Exchange } from './base/Exchange.js';\n" +
        'export default class re extends Exchange {\n' +
        "    subscribe (url: string) {\n        const client = this.client (url);\n        return client;\n    }\n" +
        '}\n';
    const outs: { [k: string]: string } = {};
    const fn = (out: string, name: string) => {
        const start = out.indexOf (') ' + name + '(');
        const next = out.indexOf ('\nfunc ', start + 1);
        return out.slice (out.lastIndexOf ('func ', start), (next < 0) ? out.length : next);
    };
    beforeAll (() => {
        const tmp = fs.mkdtempSync (path.join (os.tmpdir (), 'h30g21-'));
        try {
            const src = path.join (tmp, 'ts', 'src');
            fs.mkdirSync (path.join (src, 'base', 'functions'), { 'recursive': true });
            fs.mkdirSync (path.join (src, 'prediction'), { 'recursive': true });
            fs.mkdirSync (path.join (tmp, 'go', 'v4'), { 'recursive': true });
            fs.writeFileSync (path.join (src, 'base', 'types.ts'), TYPES);
            fs.writeFileSync (path.join (src, 'base', 'Exchange.ts'), BASE.replace ("from './types.js';\n", "from './types.js';\nimport { Str } from './types.js';\n"));
            fs.writeFileSync (path.join (src, 'base', 'functions', 'encode.ts'), ENCODE);
            fs.writeFileSync (path.join (src, 'prediction', 'pr.ts'), PRED);
            fs.writeFileSync (path.join (src, 'prediction', 'ov.ts'), OVER.replace ("Exchange.js';\n", "Exchange.js';\nimport { Str } from '../base/types.js';\n"));
            fs.writeFileSync (path.join (src, 're.ts'), REST);
            for (const [ k, f ] of [ [ 'pr', path.join (src, 'prediction', 'pr.ts') ], [ 'ov', path.join (src, 'prediction', 'ov.ts') ], [ 're', path.join (src, 're.ts') ] ]) {
                const t: any = new Transpiler ({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 } } });
                installCcxtGoHooks (t.goTranspiler);
                outs[k] = t.transpileGoByPath (f).content;
            }
        } finally {
            fs.rmSync (tmp, { 'recursive': true, 'force': true });
        }
    });
    test ('positive: prediction client and order book locals take the interface types', () => {
        expect (fn (outs['pr'], 'Subscribe')).toMatch (/var client ClientInterface = this\.Client\(url\)/);
        expect (fn (outs['pr'], 'Subscribe')).toMatch (/var ob OrderBookInterface = this\.OrderBook\(/);
    });
    test ('positive: base packb local takes []uint8', () => {
        expect (fn (outs['pr'], 'Sign')).toMatch (/var packed \[\]uint8 = this\.Packb\(a\)/);
    });
    test ('negative: a venue override of client can answer nil', () => {
        expect (fn (outs['ov'], 'Subscribe')).not.toMatch (/var client ClientInterface = /);
    });
    test ('negative: a REST source has no ws interface reads', () => {
        expect (fn (outs['re'], 'Subscribe')).not.toMatch (/var client ClientInterface = /);
    });
});
