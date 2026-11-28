import fs from 'fs';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

describe ('go bool local seeded with a literal and written from safeBool with a literal default', () => {
    const root = path.join (__dirname, 'files', 'tmp-h24n05', 'ts', 'src');
    const BASE = [
        'export class Exchange {',
        "    id: string = 'x';",
        '    safeBool (o: any, k: any, d: any = undefined): boolean { return d; }',
        '}',
        '',
    ].join ('\n');
    const VENUE = [
        "import { Exchange } from './base/Exchange.js';",
        'export default class v extends Exchange {',
        '    a (market: any, c: boolean) {',
        '        let active = true;',
        '        if (c) {',
        "            active = this.safeBool (market, 'enableTrade', false);",
        '        }',
        "        return { 'active': active };",
        '    }',
        '    b (market: any, c: boolean, s: string) {',
        '        let isActive = false;',
        '        if (c) {',
        "            isActive = this.safeBool (market, 'x', false);",
        "        } else if (s === 'ON') {",
        '            isActive = true;',
        '        }',
        "        return { 'active': isActive };",
        '    }',
        '    d (market: any, c: boolean, x: any) {',
        '        let dAny = false;',
        '        if (c) {',
        "            dAny = this.safeBool (market, 'x', x);",
        '        }',
        "        return { 'd': dAny };",
        '    }',
        '    e (market: any, c: boolean) {',
        '        let eNil = false;',
        '        if (c) {',
        "            eNil = this.safeBool (market, 'x');",
        '        }',
        '        if (eNil === undefined) {',
        '            return 0;',
        '        }',
        "        return { 'e': eNil };",
        '    }',
        '}',
        '',
    ].join ('\n');
    let out = '';
    beforeAll (() => {
        fs.mkdirSync (path.join (root, 'base'), { recursive: true });
        fs.writeFileSync (path.join (root, 'base', 'Exchange.ts'), BASE);
        fs.writeFileSync (path.join (root, 'v.ts'), VENUE);
        const t = new Transpiler ({ verbose: false, go: {} });
        installCcxtGoHooks (t.goTranspiler);
        out = t.transpileGoByPath (path.join (root, 'v.ts')).content;
    });
    afterAll (() => fs.rmSync (path.join (__dirname, 'files', 'tmp-h24n05'), { recursive: true, force: true }));
    test ('positive: the local is a bool and the write reads the pointee', () => {
        expect (out).toMatch (/var active bool = true/);
        expect (out).toMatch (/active = \*this\.SafeBool\(market, "enableTrade", false\)/);
        expect (out).toMatch (/var isActive bool = false/);
        expect (out).toMatch (/isActive = \*this\.SafeBool\(market, "x", false\)/);
    });
    test ('negative: a non-literal default can answer nil and keeps the box', () => {
        expect (out).toMatch (/var dAny any = false/);
    });
    test ('negative: no default with a nil test keeps the box and the nil answer', () => {
        expect (out).toMatch (/var eNil any = false/);
        expect (out).toMatch (/IsEqual\(eNil, nil\)|eNil == nil/);
    });
});
