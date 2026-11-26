import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

// a nil-seeded Str url written from safeString and read only as the url slot of client / watch takes *string
describe ('h53g51: a nil-seeded ws url read only by client / watch', () => {
    const BASE = 'export type Dict = { [key: string]: any };\nexport type Str = string | undefined;\n'
        + 'export class Exchange {\n'
        + '    urls: any = {};\n'
        + '    safeString (a: any, k: any, d: any = undefined): Str { return a; }\n'
        + '    safeBool (a: any, k: any, d: any = undefined): boolean { return a; }\n'
        + '    client (url: any): any { return url; }\n'
        + '    async watch (url: any, messageHash: any, message: any = undefined, subscribeHash: any = undefined): Promise<any> { return url; }\n'
        + '    keep (x: any): any { return x; }\n}\n';
    const run = (members: string): string => {
        const tmp = fs.mkdtempSync (path.join (os.tmpdir (), 'h53g51-'));
        try {
            const src = path.join (tmp, 'ts', 'src');
            fs.mkdirSync (path.join (src, 'base'), { recursive: true });
            fs.mkdirSync (path.join (src, 'pro'), { recursive: true });
            fs.writeFileSync (path.join (src, 'base', 'Exchange.ts'), BASE);
            fs.writeFileSync (path.join (src, 'venue.ts'), 'import { Exchange } from \'./base/Exchange\';\nexport default class venue extends Exchange {\n}\n');
            const file = path.join (src, 'pro', 'venue.ts');
            fs.writeFileSync (file, 'import venueRest from \'../venue\';\nexport default class venue extends venueRest {\n' + members + '}\n');
            const inst: any = new Transpiler ({ verbose: false, go: { parser: { NUM_LINES_END_FILE: 0 } } });
            installCcxtGoHooks (inst.goTranspiler);
            return inst.transpileGoByPath (file).content;
        } finally {
            fs.rmSync (tmp, { recursive: true, force: true });
        }
    };
    const body = (use: string) => '    h (market: Dict) {\n'
        + '        let url: Str = undefined;\n'
        + '        if (this.safeBool (market, \'spot\', false)) {\n'
        + '            url = this.safeString (this.urls[\'api\'][\'ws\'], \'spot\');\n'
        + '        } else {\n'
        + '            url = this.safeString (this.urls[\'api\'][\'ws\'], \'swap\');\n'
        + '        }\n'
        + use
        + '    }\n';
    test ('read only as the client url: *string', () => {
        const out = run (body ('        const client = this.client (url);\n        return client;\n'));
        expect (out).toContain ('var url *string = nil');
        expect (out).not.toContain ('var url any = nil');
    });
    test ('read only as the watch url: *string', () => {
        const out = run ('    async w (market: Dict) {\n'
            + '        let url: Str = undefined;\n'
            + '        url = this.safeString (this.urls[\'api\'][\'ws\'], \'spot\');\n'
            + '        return await this.watch (url, \'h\');\n'
            + '    }\n');
        expect (out).toContain ('var url *string = nil');
    });
    test ('a url also handed to another method in a later slot keeps the box', () => {
        const out = run (body ('        return this.keep (url);\n'));
        expect (out).toContain ('var url any = nil');
    });
    test ('a url cast `as string` inside the watch url slot: *string', () => {
        const out = run ('    async w (market: Dict) {\n'
            + '        let url: Str = undefined;\n'
            + '        url = this.safeString (this.urls[\'api\'][\'ws\'], \'spot\');\n'
            + '        return await this.watch ((url as string), \'h\');\n'
            + '    }\n');
        expect (out).toContain ('var url *string = nil');
        expect (out).toMatch (/this\.Watch\(url, "h"\)/);
    });
    test ('a url cast `as string` in a non-url slot keeps the box', () => {
        const out = run ('    async w (market: Dict) {\n'
            + '        let url: Str = undefined;\n'
            + '        url = this.safeString (this.urls[\'api\'][\'ws\'], \'spot\');\n'
            + '        return await this.watch (\'u\', (url as string));\n'
            + '    }\n');
        expect (out).toContain ('var url any = nil');
    });
    test ('a url handed to watch in a non-url slot keeps the box', () => {
        const out = run ('    async w (market: Dict) {\n'
            + '        let url: Str = undefined;\n'
            + '        url = this.safeString (this.urls[\'api\'][\'ws\'], \'spot\');\n'
            + '        return await this.watch (\'u\', url);\n'
            + '    }\n');
        expect (out).toContain ('var url any = nil');
    });
});
