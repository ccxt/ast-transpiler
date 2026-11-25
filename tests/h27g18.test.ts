import fs from 'fs';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

describe ('go checkConflictingProxies proxyAgentSet prints *string', () => {
    const root = path.join (__dirname, 'files', 'tmp-h27g18', 'ts', 'src');
    const BASE =
        'export type Str = string | undefined;\n' +
        'export class Exchange {\n' +
        '    id: string = "x";\n' +
        '    checkConflictingProxies (proxyAgentSet: Str, proxyUrlSet: Str) {\n' +
        "        const proxyAgentIsSet = (proxyAgentSet !== undefined) && (proxyAgentSet !== '');\n" +
        "        const proxyUrlIsSet = (proxyUrlSet !== undefined) && (proxyUrlSet !== '');\n" +
        '        if (proxyAgentIsSet && proxyUrlIsSet) {\n' +
        "            throw new Error (this.id + ' conflicting');\n" +
        '        }\n' +
        '    }\n' +
        '    otherConflictingProxies (proxyAgentSet: Str, proxyUrlSet: Str) {\n' +
        "        const proxyAgentIsSet = (proxyAgentSet !== undefined) && (proxyAgentSet !== '');\n" +
        "        const proxyUrlIsSet = (proxyUrlSet !== undefined) && (proxyUrlSet !== '');\n" +
        '        if (proxyAgentIsSet && proxyUrlIsSet) {\n' +
        "            throw new Error (this.id + ' conflicting');\n" +
        '        }\n' +
        '    }\n' +
        '}\n';
    const print = (install = true): string => {
        fs.mkdirSync (path.join (root, 'base'), { recursive: true });
        fs.writeFileSync (path.join (root, 'base', 'Exchange.ts'), BASE);
        const t = new Transpiler ({ verbose: false, go: {} });
        if (install) { installCcxtGoHooks (t.goTranspiler); }
        return t.transpileGoByPath (path.join (root, 'base', 'Exchange.ts')).content;
    };
    afterAll (() => fs.rmSync (path.join (__dirname, 'files', 'tmp-h27g18'), { recursive: true, force: true }));

    test ('proxyAgentSet is *string with a native nil and empty test', () => {
        const out = print ();
        expect (out).toMatch (/CheckConflictingProxies\(proxyAgentSet \*string, proxyUrlSet any\)/);
        expect (out).toContain ('(proxyAgentSet != nil) && (proxyAgentSet == nil || *proxyAgentSet != "")');
        expect (out).not.toContain ('IsEqual(proxyAgentSet');
    });
    test ('the untabled twin and the second parameter stay any', () => {
        const out = print ();
        expect (out).toMatch (/OtherConflictingProxies\(proxyAgentSet any, proxyUrlSet any\)/);
        expect (out).toContain ('(proxyUrlSet != nil) && (proxyUrlSet != "")');
    });
    test ('without the ccxt hooks the parameter stays any', () => {
        expect (print (false)).toMatch (/CheckConflictingProxies\(proxyAgentSet any, /);
    });
});
