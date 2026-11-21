import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

// a safeDict of a string key on `this.urls` / `this.fees` (or a const map local read from them) prints the
// comma-ok map assertion; a non-string key, a non-config receiver or a reassigned local keep SafeMapTyped.
describe ('h27a07: config map reads print the comma-ok assertion', () => {
    const HEAD = 'type Dict = { [key: string]: any };\nclass BaseExchange {\n'
        + '    urls: { api: Dict; [key: string]: any } = { api: {} };\n    fees: Dict = {};\n    options: Dict = {};\n'
        + '    safeDict (o: any, k: any, d: any = undefined): any { return d; }\n    safeString (o: any, k: any): any { return k; }\n'
        + '    note (h: any): any { return h; }\n}\nexport default BaseExchange;\n';
    const print = (body: string): string => {
        const dir = fs.mkdtempSync (path.join (process.env.TMPDIR || os.tmpdir (), 'h27a07-'));
        try {
            fs.mkdirSync (path.join (dir, 'ts', 'src', 'base'), { 'recursive': true });
            const file = path.join (dir, 'ts', 'src', 'x.ts');
            fs.writeFileSync (path.join (dir, 'ts', 'src', 'base', 'Exchange.ts'), HEAD);
            fs.writeFileSync (file, 'import Exchange from \'./base/Exchange.js\';\nclass x extends Exchange {\n' + body + '}\n');
            const config: any = { 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 } } };
            const t: any = new Transpiler (config);
            installCcxtGoHooks (t.goTranspiler);
            return t.transpileGoByPath (file).content;
        } finally {
            fs.rmSync (dir, { 'recursive': true, 'force': true });
        }
    };
    test ('fees read with a literal key', () => {
        const out = print ('    f () {\n        const fees = this.safeDict (this.fees, \'trading\', {});\n        return this.safeString (fees, \'taker\');\n    }\n');
        expect (out).toContain ('var fees, _ = this.Fees["trading"].(map[string]any)');
        expect (out).not.toContain ('SafeMapTyped(this.Fees');
    });
    test ('urls chain through a const local', () => {
        const out = print ('    f (sandbox: boolean) {\n        let urlKey = \'api\';\n        if (sandbox) {\n            urlKey = \'test\';\n        }\n'
            + '        const apiUrls = this.safeDict (this.urls, urlKey, {});\n        const wsUrls = this.safeDict (apiUrls, \'ws\', {});\n        return this.safeString (wsUrls, \'public\');\n    }\n');
        expect (out).toContain ('var apiUrls, _ = this.Urls[urlKey].(map[string]any)');
        expect (out).toContain ('var wsUrls, _ = apiUrls["ws"].(map[string]any)');
    });
    test ('negative: options receiver keeps the wrap', () => {
        const out = print ('    f () {\n        const o = this.safeDict (this.options, \'x\', {});\n        return this.safeString (o, \'y\');\n    }\n');
        // sibling h27-A06 owns the options receiver: its read is the comma-ok form, never this unit's SafeMapTyped
        expect (out).toContain ('this.Options["x"].(map[string]any)');
        expect (out).not.toContain ('SafeMapTyped(this.Options');
    });
    test ('negative: an untyped key keeps the wrap', () => {
        const out = print ('    f (k) {\n        const fees = this.safeDict (this.fees, k, {});\n        return this.safeString (fees, \'taker\');\n    }\n');
        expect (out).not.toContain ('].(map[string]any)');
    });
    test ('negative: a reassigned local receiver keeps the wrap', () => {
        const out = print ('    f (r: any) {\n        let src = this.safeDict (this.fees, \'a\', {});\n        src = r;\n'
            + '        const fees = this.safeDict (src, \'b\', {});\n        return this.safeString (fees, \'taker\');\n    }\n');
        expect (out).not.toContain ('src["b"].(map[string]any)');
    });
    test ('negative: a nil-tested local keeps the nil answer of the map', () => {
        const out = print ('    f () {\n        const fees = this.safeDict (this.fees, \'trading\');\n        if (fees === undefined) {\n            return undefined;\n        }\n        return this.safeString (fees, \'taker\');\n    }\n');
        expect (out).toContain ('var fees any = this.SafeDict(this.Fees, "trading")');
        expect (out).not.toContain ('.(map[string]any)');
    });
});
