import { Transpiler } from '../src/transpiler';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';

const root = fs.mkdtempSync (path.join (os.tmpdir (), 'astfx-h14p01-'));
const transpiler = new Transpiler ({ 'verbose': false, 'rust': { 'parser': { 'NUM_LINES_END_FILE': 0 } } });

const exchange = "export interface Dict { [key: string]: any }\nexport type Str = string | undefined;\nexport default class Exchange {\n    safeString (o: any, k: any, d: Str = undefined): Str { return o[k]; }\n    hold (x: any): any { return x; }\n    async watch (url: string, hash: string): Promise<any> { return undefined; }\n}\n";

function build (name: string, venueBody: string): string {
    const dir = path.join (root, name);
    fs.mkdirSync (path.join (dir, 'ts/src/base'), { recursive: true });
    fs.mkdirSync (path.join (dir, 'ts/src/pro'), { recursive: true });
    fs.writeFileSync (path.join (dir, 'ts/src/base/Exchange.ts'), exchange);
    fs.writeFileSync (path.join (dir, 'ts/src/pro/venue.ts'), "import Exchange from '../base/Exchange.js';\nimport type { Dict, Str } from '../base/Exchange.js';\nexport default class venue extends Exchange {\n" + venueBody + "}\n");
    transpiler.transpileRustByPath (path.join (dir, 'ts/src/base/Exchange.ts'));
    return transpiler.transpileRustByPath (path.join (dir, 'ts/src/pro/venue.ts')).content;
}

// the parameter is only read (passed on), never seeded into a local, so ral-63x alone keeps it Value
const helper = "    getMessageHash (channel: string, symbol: Str = undefined): string {\n        return this.hold (channel) + ':' + symbol;\n    }\n";
const callers = (second: string) => "    async watchA (symbol: string): Promise<any> {\n        const messageHash = this.getMessageHash ('ticker', symbol);\n        return await this.watch ('wss://x', messageHash);\n    }\n    async watchB (name: string, symbol: string): Promise<any> {\n" + second + "        return await this.watch ('wss://x', messageHash);\n    }\n";

describe ('rustVenueStrParam: a required string slot of an armless ws helper whose callers pass literals or string names', () => {
    test ('a literal and a `string` parameter caller: the slot prints `&str`, callers lend', () => {
        const out = build ('pos', helper + callers ("        const messageHash = this.getMessageHash (name, symbol);\n"));
        expect (out).toMatch (/fn getMessageHash\(&self, channel: &str, /);
        expect (out).toContain ('self.getMessageHash("ticker", ');
        expect (out).toContain ('self.getMessageHash(name, ');
    });
    test ('negative: a caller passes its own `Str` (maybe undefined) parameter, the slot stays Value', () => {
        const body = helper + callers ("        const messageHash = this.getMessageHash (name, symbol);\n").replace ('watchB (name: string,', 'watchB (name: Str,');
        const out = build ('neg-str', body);
        expect (out).toMatch (/fn getMessageHash\(&self, (?:mut )?channel: Value, /);
    });
    test ('negative: the body compares the parameter to undefined, the slot stays Value', () => {
        const guarded = helper.replace ('        return', "        if (channel === undefined) {\n            return 'x';\n        }\n        return");
        const out = build ('neg-undef', guarded + callers ("        const messageHash = this.getMessageHash (name, symbol);\n"));
        expect (out).toMatch (/fn getMessageHash\(&self, (?:mut )?channel: Value, /);
    });
    test ('negative: a caller passes a call expression, the slot stays Value', () => {
        const out = build ('neg-call', helper + callers ("        const messageHash = this.getMessageHash (this.hold (name), symbol);\n"));
        expect (out).toMatch (/fn getMessageHash\(&self, (?:mut )?channel: Value, /);
    });
});
