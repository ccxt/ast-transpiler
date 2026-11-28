import { Transpiler } from '../src/transpiler';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const base = 'export interface Dict { [key: string]: any }\nexport type Str = string | undefined;\n' +
    'export default class Exchange {\n    tickers: Dict = {};\n    bidsasks: Dict = {};\n' +
    '    safeString (o: any, k: any, d: Str = undefined): Str { return o; }\n' +
    '    safeMarket (id: Str = undefined, m: any = undefined): any { return {}; }\n' +
    '    safeTicker (t: Dict, m: any = undefined): Dict { return t; }\n' +
    '    parseTicker (t: Dict, m: any = undefined): Dict { return t; }\n}\n';
const wsClient = 'export default class Client {\n    futures: any = {};\n    resolve (r: any, h: any) { return r; }\n}\n';
const head = "import Exchange from '../base/Exchange.js';\nimport Client from '../base/ws/Client.js';\nimport type { Dict } from '../base/Exchange.js';\n" +
    'export default class venue extends Exchange {\n';
const build = (src: string): string => {
    const root = fs.mkdtempSync (path.join (os.tmpdir (), 'h52r42-'));
    try {
        fs.mkdirSync (path.join (root, 'ts', 'src', 'base', 'ws'), { recursive: true });
        fs.mkdirSync (path.join (root, 'ts', 'src', 'pro'), { recursive: true });
        fs.writeFileSync (path.join (root, 'ts', 'src', 'base', 'Exchange.ts'), base);
        fs.writeFileSync (path.join (root, 'ts', 'src', 'base', 'ws', 'Client.ts'), wsClient);
        fs.writeFileSync (path.join (root, 'ts', 'src', 'pro', 'venue.ts'), head + src + '}\n');
        const t = new Transpiler ({ 'verbose': false, 'rust': { 'parser': { 'NUM_LINES_END_FILE': 0 } } } as any);
        return t.transpileRustByPath (path.join (root, 'ts', 'src', 'pro', 'venue.ts')).content;
    } finally {
        fs.rmSync (root, { recursive: true, force: true });
    }
};
const pre = "    handleT (client: Client, message: Dict) {\n        const market = this.safeMarket (this.safeString (message, 'm'));\n        const symbol = this.safeString (market, 'symbol', '');\n";
const keyAndNeedle = pre + "        this.tickers[symbol] = message;\n        const hs = Object.keys (client.futures);\n        for (let i = 0; i < hs.length; i++) {\n            const h = hs[i];\n            if (h.indexOf (symbol) >= 0) {\n                client.resolve (message, h);\n            }\n        }\n    }\n";
const nilNeedle = keyAndNeedle.replace ("this.safeString (market, 'symbol', '')", "this.safeString (market, 'symbol')");

describe ('rust ws cache-key string local that is also an indexOf needle', () => {
    test ('a defaulted String key read as a find needle is typed (fails on the base printer)', () => {
        const out = build (keyAndNeedle);
        expect (out).toMatch (/let mut symbol: String = self\.safe_string_k\(&market, "symbol", &\[Value::Str\(""\.into\(\)\)\]\)\.as_str\(\)\.unwrap_or\(""\)\.to_string\(\);/);
        expect (out).toContain ('Some(symbol.as_str())');
        expect (out).not.toContain ('let mut symbol: Value');
    });
    test ('negative: a no-default (nil) key read keeps its nil-aware form', () => {
        const out = build (nilNeedle);
        expect (out).not.toMatch (/let mut symbol: String =/);
    });
});
