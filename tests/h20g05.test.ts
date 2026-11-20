import fs from 'fs';
import path from 'path';
import { Transpiler, installCcxtGoHooks, installCcxtGoLocalTypes, installCcxtGoIndexableTypes, installCcxtGoParamTypes, installCcxtGoDictParams, installCcxtGoGb05ParamTypes, installCcxtGoGb11HandleErrorsCode, installCcxtGoSignTyping, installRfGo5OwnedTables, installFmGo5G01, installFmGo5G04, installCcxtGoTupleSlotReads, installCcxtGoFeeTierLiterals, installFmGo5GP08, installFmGo5OG02 } from '../src/transpiler';

describe ('go *string locals from an await or a defaulted ternary as string-method receivers', () => {
    const root = path.join (__dirname, 'files', 'tmp-h20g05', 'ts', 'src');
    const BASE =
        'export type Str = string | undefined;\n' +
        'export class Exchange {\n' +
        "    id: string = 'x';\n" +
        "    walletAddress: string = '';\n" +
        '    options: any = {};\n' +
        '    safeString (o: any, k: any, d: string): string;\n    safeString (o: any, k: any, d?: string): Str;\n    safeString (o: any, k: any, d: Str = undefined): Str { return d; }\n' +
        '}\n';
    const VENUE = (members: string) =>
        "import Exchange from './base/Exchange.js';\n" +
        "import type { Str } from './base/Exchange.js';\n" +
        'export default class venue extends Exchange {\n' + members + '\n}\n';
    const print = (members: string): string => {
        fs.mkdirSync (path.join (root, 'base'), { recursive: true });
        fs.writeFileSync (path.join (root, 'base', 'Exchange.ts'), BASE + 'export default Exchange;\n');
        fs.writeFileSync (path.join (root, 'venue.ts'), VENUE (members));
        const t = new Transpiler ({ verbose: false, go: { parser: { NUM_LINES_END_FILE: 0 }, asyncMethodSuffix: 'Async' } });
        installCcxtGoHooks (t.goTranspiler);
        installCcxtGoLocalTypes (t.goTranspiler);
        installCcxtGoIndexableTypes (t.goTranspiler);
        installCcxtGoParamTypes (t.goTranspiler);
        installCcxtGoDictParams (t.goTranspiler);
        installCcxtGoGb05ParamTypes (t.goTranspiler);
        installCcxtGoGb11HandleErrorsCode (t.goTranspiler);
        installCcxtGoSignTyping (t.goTranspiler);
        installRfGo5OwnedTables (t.goTranspiler);
        installFmGo5G01 (t.goTranspiler);
        installFmGo5G04 (t.goTranspiler);
        installCcxtGoTupleSlotReads (t.goTranspiler);
        installCcxtGoFeeTierLiterals (t.goTranspiler);
        installFmGo5GP08 (t.goTranspiler);
        installFmGo5OG02 (t.goTranspiler);
        return t.transpileGoByPath (path.join (root, 'venue.ts')).content;
    };
    afterAll (() => fs.rmSync (path.join (__dirname, 'files', 'tmp-h20g05'), { recursive: true, force: true }));
    const LOADER =
        '    async load (): Promise<string> {\n' +
        "        const cached = this.safeString (this.options, 'a');\n" +
        '        if (cached !== undefined) {\n            return cached;\n        }\n' +
        "        return this.safeString (this.options, 'b', this.walletAddress);\n" +
        '    }\n';

    test ('positive: awaited Promise<string> local lowered natively', async () => {
        const out = print (LOADER + `    async m (): Promise<any> {\n        const maker = await this.load ();\n        const lower = maker.toLowerCase ();\n        const side = (lower === this.walletAddress) ? 0 : 2;\n        const o: any = { 'maker': maker, 'side': side };\n        return o;\n    }`);
        expect (out).toContain ('strings.ToLower(*maker)');
        expect (out).not.toContain ('ToLower(maker)');
    });

    test ('positive: ternary of defaulted safeString calls lowered natively', () => {
        const out = print ("    m (market: any = undefined): boolean {\n        const raw = (market !== undefined) ? this.safeString (market, 'label', this.safeString (market['info'], 'x', 'yes')) : 'yes';\n        return raw.toLowerCase () !== 'no';\n    }");
        expect (out).toContain ('strings.ToLower(*raw)');
    });

    test ('negative: ternary with an undefaulted arm keeps the helper', () => {
        const out = print ("    m (market: any = undefined): boolean {\n        const raw = (market !== undefined) ? this.safeString (market, 'label') : 'yes';\n        return (raw as string).length > 0 && raw.toLowerCase () !== 'no';\n    }");
        expect (out).not.toContain ('strings.ToLower(*raw)');
    });

    test ('negative: awaited Promise<Str> local keeps the helper', async () => {
        const out = print ("    async load (): Promise<Str> {\n        return this.safeString (this.options, 'a');\n    }\n    async m (): Promise<string> {\n        const maker = await this.load ();\n        const o: any = { maker: maker };\n        return (maker as any).toLowerCase () + o.maker;\n    }");
        expect (out).not.toContain ('strings.ToLower(*maker)');
    });
    test ('positive: getBaseDomainFromUrl is a *string family method, its nil-tested result a native prefix', () => {
        const out = print ("    getBaseDomainFromUrl (url: Str): Str {\n        if (url === undefined) {\n            return undefined;\n        }\n        return url + '/';\n    }\n    m (depositUrl: Str = undefined, siteUrl: Str = undefined): boolean {\n        if (depositUrl === undefined) {\n            return false;\n        }\n        const baseDomain = this.getBaseDomainFromUrl (siteUrl);\n        return baseDomain !== undefined && depositUrl.startsWith (baseDomain);\n    }");
        expect (out).toMatch (/GetBaseDomainFromUrl\(url \*string\) \*string \{/);
        expect (out).toContain ('var baseDomain *string = this.GetBaseDomainFromUrl(siteUrl)');
        expect (out).not.toContain ('StartsWith(depositUrl, baseDomain)');
    });
});
