import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler } from '../src/transpiler';

// a local the venue declares `ArrayCache` awaited from its own watch wrapper keeps the typed cache handle
describe ('h49r07: declared cache local awaited through a venue watch wrapper', () => {
    const files: Record<string, string> = {
        'ts/src/base/ws/Cache.ts': 'export class ArrayCache {\n    constructor (maxSize: any = undefined) {}\n    append (item: any) {}\n    getLimit (symbol: any, limit: any): any { return limit; }\n}\n',
        'ts/src/base/ws/Client.ts': 'export default class Client {\n    resolve (result: any, messageHash: string): any { return result; }\n}\n',
        'ts/src/base/Exchange.ts': 'import { ArrayCache } from \'./ws/Cache.js\';\nexport interface Dictionary<T> { [key: string]: T }\nexport type Int = number | undefined;\nexport default class Exchange {\n    trades: Dictionary<ArrayCache> = {};\n    newUpdates: boolean = true;\n    safeString (obj: any, key: any, defaultValue: string = undefined): string { return obj[key]; }\n    safeDict (obj: any, key: any, defaultValue: any = undefined): any { return obj[key]; }\n    async watchMultiple (url: string, messageHashes: string[], message: any = undefined, subscribeHashes: any = undefined, subscription: any = undefined): Promise<any> { return undefined; }\n    // METHODS BELOW THIS LINE ARE TRANSPILED FROM TYPESCRIPT\n    filterBySinceLimit (array: object[] | undefined, since: Int = undefined, limit: Int = undefined, key = \'timestamp\', tail = false): any[] {\n        return [];\n    }\n}\n',
    };
    const venue = (body: string) => 'import Exchange from \'../base/Exchange.js\';\nimport Client from \'../base/ws/Client.js\';\nimport { ArrayCache } from \'../base/ws/Cache.js\';\nexport default class venue extends Exchange {\n'
        + '    async wrap (channel: string, symbols: string[]) {\n        const hashes = [];\n        for (let i = 0; i < symbols.length; i++) {\n            hashes.push (channel + \'|\' + symbols[i]);\n        }\n        return await this.watchMultiple (\'wss://x\', hashes, {}, hashes);\n    }\n'
        + '    handleTrades (client: Client, message: any) {\n        const symbol = this.safeString (message, \'s\');\n        let stored = this.trades[symbol];\n        if (stored === undefined) {\n            stored = new ArrayCache (10);\n            this.trades[symbol] = stored;\n        }\n        stored.append (message);\n        client.resolve (stored, \'trades|\' + symbol);\n    }\n'
        + '    handleTicker (client: Client, message: any) {\n        client.resolve (message, this.safeString (message, \'channel\'));\n    }\n'
        + body + '}\n';
    const print = (body: string): string => {
        const root = fs.mkdtempSync (path.join (process.env.TMPDIR || os.tmpdir (), 'h49r07-'));
        try {
            for (const [ rel, text ] of Object.entries (files)) {
                fs.mkdirSync (path.dirname (path.join (root, rel)), { 'recursive': true });
                fs.writeFileSync (path.join (root, rel), text);
            }
            fs.mkdirSync (path.join (root, 'ts/src/pro'), { 'recursive': true });
            fs.writeFileSync (path.join (root, 'ts/src/pro/venue.ts'), venue (body));
            return new Transpiler ({ 'verbose': false, 'rust': { 'parser': { 'NUM_LINES_END_FILE': 0 } } }).transpileRustByPath (path.join (root, 'ts/src/pro/venue.ts')).content;
        } finally {
            fs.rmSync (root, { 'recursive': true, 'force': true });
        }
    };
    const WATCH = '    async watchTradesForSymbols (symbols: string[], since: Int = undefined, limit: Int = undefined) {\n        const trades: ArrayCache = await this.wrap (\'trades\', symbols);\n'
        + '        const first = this.safeDict (trades, 0);\n        let limitResolved = limit;\n        if (this.newUpdates) {\n            limitResolved = trades.getLimit (this.safeString (first, \'symbol\'), limit);\n        }\n        return this.filterBySinceLimit (trades, since, limitResolved, \'timestamp\', true);\n    }\n';
    test ('the declared ArrayCache local is an optional cache handle', () => {
        const out = print (WATCH);
        expect (out).toMatch (/let mut trades: Option<crate::pro::cache::Cache> = self\.wrap\([\s\S]*?\)\.await\.into\(\);/);
    });
    test ('negative: with no ArrayCache annotation the awaited local stays a Value', () => {
        const out = print (WATCH.replace ('const trades: ArrayCache =', 'const trades =').replace ('watchTradesForSymbols', 'watchTradesPlain'));
        expect (out).not.toMatch (/let mut trades: Option<crate::pro::cache::Cache>/);
    });
    test ('negative: a known hash resolved with a plain dict keeps the Value', () => {
        const out = print (WATCH + '    handleOther (client: Client, message: any) {\n        client.resolve ({ \'a\': 1 }, \'trades|BTC\');\n    }\n');
        expect (out).not.toMatch (/let mut trades: Option<crate::pro::cache::Cache>/);
    });
    test ('negative: a direct watchMultiple await is left to the existing watch-result proof', () => {
        const out = print (WATCH.replace ('await this.wrap (\'trades\', symbols)', 'await this.watchMultiple (\'wss://x\', [ \'ticker\' ], {})'));
        expect (out).not.toMatch (/let mut trades: Option<crate::pro::cache::Cache>/);
    });
});
