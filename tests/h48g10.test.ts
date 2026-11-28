import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

// a sibling-file caller that hands a `const x = s.replace ('<lit>', '<lit>')` local proves a `string` slot
describe ('h48g10: a replace-bound sibling local types a required string parameter', () => {
    const BASE = 'export type Dict = { [key: string]: any };\nexport type Str = string | undefined;\nexport class Exchange {\n'
        + '    options: Dict = {};\n'
        + '    safeString (a: any, k: any, d: any = undefined): Str { return a; }\n}\n';
    const method = '    gatewayBase (baseUrl: string, gatewayUrl: string): string {\n'
        + '        const prefix = \'https://api.x.com/\';\n'
        + '        if (baseUrl.startsWith (prefix)) {\n'
        + '            return gatewayUrl + baseUrl.replace (prefix, \'\');\n'
        + '        }\n'
        + '        return baseUrl;\n'
        + '    }\n'
        + '    sign (path: string) {\n'
        + '        const apiUrl: string = this.safeString (this.options, \'api\', \'\');\n'
        + '        const gw = this.safeString (this.options, \'gw\', \'\');\n'
        + '        return this.gatewayBase (apiUrl, gw) + path;\n'
        + '    }\n';
    const run = (proBody: string): string => {
        const tmp = fs.mkdtempSync (path.join (os.tmpdir (), 'h48g10-'));
        try {
            const src = path.join (tmp, 'ts', 'src');
            fs.mkdirSync (path.join (src, 'base'), { recursive: true });
            fs.mkdirSync (path.join (src, 'pro'), { recursive: true });
            fs.writeFileSync (path.join (src, 'base', 'Exchange.ts'), BASE);
            const file = path.join (src, 'ex.ts');
            fs.writeFileSync (file, 'import { Exchange, Dict, Str } from \'./base/Exchange\';\nexport default class ex extends Exchange {\n' + method + '}\n');
            fs.writeFileSync (path.join (src, 'pro', 'ex.ts'), 'import exRest from \'../ex.js\';\nexport default class ex extends exRest {\n'
                + '    connect (wsUrl: string) {\n' + proBody + '    }\n}\n');
            const inst: any = new Transpiler ({ verbose: false, go: { parser: { NUM_LINES_END_FILE: 0 } } });
            installCcxtGoHooks (inst.goTranspiler);
            return inst.transpileGoByPath (file).content;
        } finally {
            fs.rmSync (tmp, { recursive: true, force: true });
        }
    };
    test ('positive: the replace-bound local proves the slot (fails on the base printer)', () => {
        const out = run ('        const replaced = wsUrl.replace (\'wss://\', \'https://\');\n        return this.gatewayBase (replaced, \'a\');\n');
        expect (out).toMatch (/GatewayBase\(baseUrl string, gatewayUrl string\) string \{/);
        expect (out).toContain ('return this.GatewayBase(apiUrl, gw) + path');
    });
    test ('negative: a rebound local keeps the slot boxed', () => {
        const out = run ('        let replaced = wsUrl.replace (\'wss://\', \'https://\');\n        replaced = this.safeString (this.options, \'x\');\n        return this.gatewayBase (replaced, \'a\');\n');
        expect (out).toMatch (/GatewayBase\(baseUrl any,/);
    });
    test ('negative: a replace with a non-literal pattern keeps the slot boxed', () => {
        const out = run ('        const replaced = wsUrl.replace (this.safeString (this.options, \'x\'), \'https://\');\n        return this.gatewayBase (replaced, \'a\');\n');
        expect (out).toMatch (/GatewayBase\(baseUrl any,/);
    });
    test ('negative: an untyped sibling local keeps the slot off string', () => {
        const out = run ('        const replaced = this.safeString (this.options, \'x\');\n        return this.gatewayBase (replaced, \'a\');\n');
        expect (out).not.toMatch (/GatewayBase\(baseUrl string,/);
    });
});
