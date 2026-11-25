import { Transpiler } from '../src/transpiler';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// a venue `parseWsLiquidation (liquidation: Dict, ..)` whose callers hand it a converted row of a `Dict[]` list
const base = 'export interface Dict { [key: string]: any }\nexport type Str = string | undefined;\nexport type Int = number | undefined;\n' +
    'export default class Exchange {\n' +
    '    safeList (o: any, k: any, d: any[] = undefined): any[] | undefined { return o; }\n' +
    '    safeString (o: any, k: any, d: Str = undefined): Str { return o; }\n' +
    '    safeInteger (o: any, k: any, d: Int = undefined): Int { return o; }\n' +
    '    safeLiquidation (l: Dict, m: any = undefined): Dict { return l; }\n' +
    '    keep (o: any): any { return o; }\n    parseMarket (m: Dict): Dict { return m; }\n}\n';
const rest = "import Exchange from './base/Exchange.js';\nexport default class venueRest extends Exchange {\n}\n";
const wsClient = 'export default class Client {\n    resolve (x: any, h: string) {}\n}\n';
const pro = (caller: string) => "import Exchange from '../venueRest.js';\nimport Client from '../base/ws/Client.js';\nimport type { Dict } from '../base/Exchange.js';\n" +
    'export default class venue extends Exchange {\n' +
    '    handleLiquidation (client: Client, message: Dict) {\n' +
    "        const rawLiquidations: Dict[] = this.safeList (message, 'result', []);\n" +
    '        for (let i = 0; i < rawLiquidations.length; i++) {\n' + caller +
    "            client.resolve (liquidation, 'x');\n" +
    '        }\n    }\n' +
    '    parseRows (raw: Dict): Dict[] {\n        const out: Dict[] = [];\n        out.push (this.parseMarket (raw));\n        return out;\n    }\n' +
    '    parseWsLiquidation (liquidation: Dict, market: any = undefined): Dict {\n' +
    "        const timestamp = this.safeInteger (liquidation, 'time_ms');\n" +
    "        return this.safeLiquidation ({\n            'info': liquidation,\n            'contract': this.safeString (liquidation, 'contract'),\n            'timestamp': timestamp,\n        });\n    }\n}\n";

function run (dir: string, caller: string): string {
    const root = fs.mkdtempSync (path.join (os.tmpdir (), 'h48r19-' + dir + '-'));
    try {
        fs.mkdirSync (path.join (root, 'ts', 'src', 'base', 'ws'), { recursive: true });
        fs.mkdirSync (path.join (root, 'ts', 'src', 'pro'), { recursive: true });
        fs.writeFileSync (path.join (root, 'ts', 'src', 'base', 'Exchange.ts'), base);
        fs.writeFileSync (path.join (root, 'ts', 'src', 'venueRest.ts'), rest);
        fs.writeFileSync (path.join (root, 'ts', 'src', 'base', 'ws', 'Client.ts'), wsClient);
        fs.writeFileSync (path.join (root, 'ts', 'src', 'pro', 'venue.ts'), pro (caller));
        const t = new Transpiler ({ 'verbose': false, 'rust': { 'parser': { 'NUM_LINES_END_FILE': 0 } } } as any);
        return t.transpileRustByPath (path.join (root, 'ts', 'src', 'pro', 'venue.ts')).content;
    } finally {
        fs.rmSync (root, { recursive: true, force: true });
    }
}

describe ('rust venue parseWsLiquidation takes the dict handle', () => {
    test ('a row local of a Dict[] list is lent to the typed slot', () => {
        const out = run ('pos', '            const rawLiquidation = rawLiquidations[i];\n            const liquidation = this.parseWsLiquidation (rawLiquidation);\n');
        expect (out).toMatch (/fn parseWsLiquidation\(&self, liquidation: &crate::value::Dict/);
        expect (out).toContain ('self.parseWsLiquidation(&rawLiquidation');
        expect (out).not.toContain ('Value::Dict(rawLiquidation)');
    });
    test ('negative: a row local that is reassigned keeps the boxed slot', () => {
        const out = run ('reassigned', '            let rawLiquidation = rawLiquidations[i];\n            rawLiquidation = this.keep (rawLiquidation);\n            const liquidation = this.parseWsLiquidation (rawLiquidation);\n');
        expect (out).not.toMatch (/fn parseWsLiquidation\(&self, liquidation: &crate::value::Dict/);
    });
    test ('negative: a row of an untyped list keeps the boxed slot', () => {
        const out = run ('untyped', "            const anyRows = this.safeList (message, 'other');\n            const rawLiquidation = anyRows[i];\n            const liquidation = this.parseWsLiquidation (rawLiquidation);\n");
        expect (out).not.toMatch (/fn parseWsLiquidation\(&self, liquidation: &crate::value::Dict/);
    });
    test ('negative: a row also handed to an untyped venue slot keeps its list converted once', () => {
        const out = run ('kalshi', "            const rawLiquidation = rawLiquidations[i];\n            const parsed = this.parseRows (rawLiquidation);\n            const tag = this.safeString (rawLiquidation, 'title', this.safeString (rawLiquidation, 'id'));\n            for (let j = 0; j < parsed.length; j++) {\n                this.keep (parsed[j]);\n            }\n            const liquidation = this.parseWsLiquidation (rawLiquidation);\n");
        console.log (out);
        expect (out).toContain ('crate::value::dict_rows(');
        expect (out).not.toContain ('safe_dict_t(');
    });
});
