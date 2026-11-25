import fs from 'fs';
import path from 'path';
import { Transpiler, installCcxtGoHooks, installCcxtGoLocalTypes, installCcxtGoIndexableTypes, installCcxtGoParamTypes, installCcxtGoDictParams, installCcxtGoGb05ParamTypes, installCcxtGoGb11HandleErrorsCode, installCcxtGoSignTyping, installRfGo5OwnedTables, installFmGo5G01, installFmGo5G04, installCcxtGoTupleSlotReads, installCcxtGoFeeTierLiterals, installFmGo5GP08, installFmGo5OG02 } from '../src/transpiler';

// `sub = this.safeDict (client.subscriptions, k) as Dict` into a declared Dict local reads the owner's typed entry
// (SubscriptionDict: nil map for missing / nil / non-map), so the local keeps map[string]any and its keys range natively
const tmp = path.join (__dirname, 'files', 'tmp-h52g12-' + (process.env.JEST_WORKER_ID || '0'));
const root = path.join (tmp, 'ts', 'src');
const BASE =
    'export type Dict = { [key: string]: any };\n' +
    'export class Client {\n' +
    '    subscriptions: Dict = {};\n' +
    '}\n' +
    'export class Exchange {\n' +
    "    id: string = 'x';\n" +
    '    clients: Dict = {};\n' +
    '    safeValue (o: any, k: any, d: any = undefined): any { return d; }\n' +
    '    safeBool (o: any, k: any, d: any = undefined): boolean { return d; }\n' +
    '    safeString (o: any, k: any, d: any = undefined): string { return d; }\n' +
    '    safeDict (o: any, k: any, d: any = undefined): Dict { return d; }\n' +
    '    watch (u: any, h: any, r: any, s: any, sub: any): any { return sub; }\n' +
    '}\n';
const printPro = (members: string): string => {
    fs.mkdirSync (path.join (root, 'base'), { recursive: true });
    fs.mkdirSync (path.join (root, 'pro'), { recursive: true });
    fs.writeFileSync (path.join (root, 'base', 'Exchange.ts'), BASE + 'export default Exchange;\n');
    fs.writeFileSync (path.join (root, 'pro', 'venue.ts'), "import Exchange, { Client } from '../base/Exchange.js';\nimport type { Dict } from '../base/Exchange.js';\nexport default class venue extends Exchange {\n" + members + '\n}\n');
    const t = new Transpiler ({ verbose: false, go: { parser: { NUM_LINES_END_FILE: 0 }, asyncMethodSuffix: 'Async' } });
    for (const f of [ installCcxtGoHooks, installCcxtGoLocalTypes, installCcxtGoIndexableTypes, installCcxtGoParamTypes, installCcxtGoDictParams, installCcxtGoGb05ParamTypes, installCcxtGoGb11HandleErrorsCode, installCcxtGoSignTyping, installRfGo5OwnedTables, installFmGo5G01, installFmGo5G04, installCcxtGoTupleSlotReads, installCcxtGoFeeTierLiterals, installFmGo5GP08, installFmGo5OG02 ]) {
        (f as any) (t.goTranspiler);
    }
    return t.transpileGoByPath (path.join (root, 'pro', 'venue.ts')).content;
};

const SRC =
    '    async watchMany (url: string, marketIds: string[]) {\n' +
    "        const subscriptionHash = 'CANDLESTICKS';\n" +
    '        const client = this.safeValue (this.clients, url);\n' +
    "        let type = 'SUBSCRIBE';\n" +
    '        let subscription: Dict = {};\n' +
    '        if (client !== undefined) {\n' +
    '            subscription = this.safeDict (client.subscriptions, subscriptionHash) as Dict;\n' +
    '            if (subscription !== undefined) {\n' +
    '                for (let i = 0; i < marketIds.length; i++) {\n' +
    '                    const marketSubscribed = this.safeBool (subscription, marketIds[i], false);\n' +
    '                    if (!marketSubscribed) {\n' +
    "                        type = 'UPDATE_SUBSCRIPTION';\n" +
    '                    }\n' +
    '                }\n' +
    '            } else {\n' +
    '                subscription = {};\n' +
    '            }\n' +
    '        }\n' +
    '        for (let i = 0; i < marketIds.length; i++) {\n' +
    '            subscription[marketIds[i]] = true;\n' +
    '        }\n' +
    '        const instrumentCodes = Object.keys (subscription);\n' +
    '        return await this.watch (url, type, instrumentCodes, subscriptionHash, subscription);\n' +
    '    }\n';

describe ('h52g12 subscription entry rebind keeps the Dict local typed', () => {
    afterAll (() => fs.rmSync (tmp, { recursive: true, force: true }));
    test ('the rebind reads the owner entry and the keys range natively (base printer: any local, ObjectKeys)', () => {
        const o = printPro (SRC);
        expect (o).toContain ('var subscription map[string]any = map[string]any{}');
        expect (o).toMatch (/subscription = client(\.\((ccxt\.)?ClientInterface\))?\.SubscriptionDict\(subscriptionHash\)/);
        expect (o).not.toContain ('ObjectKeys(');
        expect (o).toContain ('for objectKey := range subscription {');
    });
    test ('negatives: a key of unknown kind or a dict default keep the box', () => {
        const anyKey = printPro (SRC.replace ("const subscriptionHash = 'CANDLESTICKS';", "const subscriptionHash = this.safeValue (this.clients, 'h');"));
        expect (anyKey).not.toContain ('SubscriptionDict(');
        expect (anyKey).toContain ('ObjectKeys(');
        const noAs = printPro (SRC.replace ('subscription = this.safeDict (client.subscriptions, subscriptionHash) as Dict;', 'subscription = this.safeValue (client.subscriptions, subscriptionHash);'));
        expect (noAs).toContain ('ObjectKeys(');
    });
    test ('negative: a declaration initialised from the entry read (no rebind) keeps its base form and compiles', () => {
        const o = printPro ('    handle (client: any, key: string) {\n' +
            '        const subscription = this.safeDict (client.subscriptions, key);\n' +
            '        if (subscription !== undefined) {\n' +
            "            return this.safeString (subscription, 'symbol');\n" +
            '        }\n' +
            '        return undefined;\n' +
            '    }\n');
        expect (o).not.toMatch (/var subscription map\[string\]any = this\.SafeDict\(/);
    });
});
