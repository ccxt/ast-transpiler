import fs from 'fs';
import path from 'path';
import { Transpiler, installCcxtGoHooks, installCcxtGoLocalTypes, installCcxtGoIndexableTypes, installCcxtGoParamTypes, installCcxtGoDictParams, installCcxtGoGb05ParamTypes, installCcxtGoGb11HandleErrorsCode, installCcxtGoSignTyping, installRfGo5OwnedTables, installFmGo5G01, installFmGo5G04, installCcxtGoTupleSlotReads, installCcxtGoFeeTierLiterals, installFmGo5GP08, installFmGo5OG02 } from '../src/transpiler';

// `this.safeDict (client.subscriptions, k[, {}])` into a dict local with a string key reads the entry through the
// owner (SubscriptionDict) instead of SafeDictMap over a full snapshot copy; the `{}` default keeps its fresh map
const tmp = path.join (__dirname, 'files', 'tmp-h29g06-' + (process.env.JEST_WORKER_ID || '0'));
const root = path.join (tmp, 'ts', 'src');
const BASE =
    'export type Dict = { [key: string]: any };\n' +
    'export class Client {\n' +
    '    subscriptions: Dict = {};\n' +
    '}\n' +
    'export class Exchange {\n' +
    "    id: string = 'x';\n" +
    '    safeString (o: any, k: any, d: any = undefined): string { return d; }\n' +
    '    safeDict (o: any, k: any, d: any = undefined): Dict { return d; }\n' +
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

describe ('h29g06 subscription dict read through the owner', () => {
    afterAll (() => fs.rmSync (tmp, { recursive: true, force: true }));
    const SRC =
        '    handleSub (client: Client, message: Dict, subscription: Dict) {\n' +
        "        return this.safeString (subscription, 'method');\n" +
        '    }\n' +
        '    handleA (client: Client, message: Dict) {\n' +
        "        const id = this.safeString (message, 'id');\n" +
        '        const h = this.safeString (client.subscriptions, id);\n' +
        '        const sub = this.safeDict (client.subscriptions, h);\n' +
        "        if ((sub !== undefined) && (this.safeString (sub, 'method') !== undefined)) {\n" +
        '            this.handleSub (client, message, sub);\n' +
        '        }\n' +
        '    }\n' +
        '    handleB (client: Client, message: Dict) {\n' +
        "        const topic = this.safeString (message, 'topic');\n" +
        "        const subd = this.safeDict (client.subscriptions, 'unsubscribe:' + topic, {});\n" +
        '        this.handleSub (client, message, subd);\n' +
        '    }\n' +
        '    handleC (client: Client, message: Dict) {\n' +
        "        const k = message['k'];\n" +
        '        const suba = this.safeDict (client.subscriptions, k);\n' +
        '        this.handleSub (client, message, suba);\n' +
        '    }\n';
    // H40-G12 dropped the redundant ClientInterface assertion on the typed client parameter
    test ('a string-keyed dict read goes to the owner (fails on the base printer: SafeDictMap over the snapshot)', () => {
        const o = printPro (SRC);
        expect (o).toMatch (/var sub map\[string\]any = client(\.\((ccxt\.)?ClientInterface\))?\.SubscriptionDict\(h\)\n/);
        expect (o).not.toMatch (/SafeDictMap\([^\n]*SubscriptionsSnapshot\(\), h\)/);
    });
    test ('the {} default becomes a fresh map exactly where the owner answers nil', () => {
        const o = printPro (SRC);
        expect (o).toMatch (/var subd map\[string\]any = client(\.\((ccxt\.)?ClientInterface\))?\.SubscriptionDict\("unsubscribe:"\+\*topic\)\n\tif subd == nil \{\n\t\tsubd = map\[string\]any\{\}\n\t\}/);
    });
    test ('negatives: a key that may be a non-string box does not read the owner', () => {
        const o = printPro (SRC);
        expect (o).not.toMatch (/SubscriptionDict\(k\)/);
    });
});
