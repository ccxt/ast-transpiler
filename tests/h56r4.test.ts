import fs from 'fs';
import path from 'path';
import {
    Transpiler,
    installCcxtGoHooks,
    installCcxtGoLocalTypes,
    installCcxtGoIndexableTypes,
    installCcxtGoParamTypes,
    installCcxtGoDictParams,
} from '../src/transpiler';

const tmp = path.join (__dirname, 'files', 'tmp-h56r4-' + (process.env.JEST_WORKER_ID || '0'));

describe ('h56r4: least-used helper elimination rules (Go RLP/Mod/Trim, C# async venue Int64?, Rust base bool params)', () => {
    afterAll (() => fs.rmSync (tmp, { recursive: true, force: true }));

    test ('Go: RLP base string returns, nil-guarded *int64 % int64, and native strings.TrimSpace on string', () => {
        const root = path.join (tmp, 'go', 'ts', 'src');
        fs.mkdirSync (root, { recursive: true });
        const file = path.join (root, 'demo.ts');
        fs.writeFileSync (file, `
export class Demo {
    padHexToEven (hex: string): string { return hex; }
    hexToRlpBytes (hex: string): string { return hex; }
    rlpEncodeBytes (hex: string): string { return hex; }
    safeInteger (o: any, k: string): number | undefined { return undefined; }
    milliseconds (): number { return 0; }
    run (o: any, raw: any) {
        const s: string = 'abc';
        const a = this.padHexToEven (s);
        const b = this.hexToRlpBytes (s);
        const c = this.rlpEncodeBytes (s);
        const trimmed = s.trim ();
        const rawTrimmed = raw.trim ();
        const since = this.safeInteger (o, 'since');
        const step = this.milliseconds ();
        let rem = 0;
        if (since !== undefined) {
            rem = since % step;
        }
        const unguarded = since % step;
        return [ a, b, c, trimmed, rawTrimmed, rem, unguarded ];
    }
}
`);
        const t = new Transpiler ({ verbose: false, go: { parser: { NUM_LINES_END_FILE: 0 } } });
        for (const f of [ installCcxtGoHooks, installCcxtGoLocalTypes, installCcxtGoIndexableTypes, installCcxtGoParamTypes, installCcxtGoDictParams ]) {
            (f as any) (t.goTranspiler);
        }
        const go = t.transpileGoByPath (file).content;
        expect (go).toContain ('var a string = this.PadHexToEven(s)');
        expect (go).toContain ('var b string = this.HexToRlpBytes(s)');
        expect (go).toContain ('var c string = this.RlpEncodeBytes(s)');
        expect (go).toContain ('var trimmed string = strings.TrimSpace(s)');
        expect (go).toContain ('Trim(raw)');
        expect (go).toContain ('*since % step');
        expect (go).toContain ('Mod(since, step)');
    });

    test ('C#: async venue-private method types = undefined Int params when not in host signature tables', () => {
        const root = path.join (tmp, 'cs', 'ts', 'src');
        fs.mkdirSync (path.join (root, 'base'), { recursive: true });
        fs.writeFileSync (path.join (root, 'base', 'Exchange.ts'), `
export class Exchange {
    async fetchMyTrades (symbol: string, since: number | undefined = undefined, limit: number | undefined = undefined): Promise<any[]> {
        return [];
    }
}
export default Exchange;
`);
        const venue = path.join (root, 'venue.ts');
        fs.writeFileSync (venue, `
import Exchange from './base/Exchange.js';
export default class venue extends Exchange {
    override async fetchMyTrades (symbol: string, since: number | undefined = undefined, limit: number | undefined = undefined): Promise<any[]> {
        return await this.fetchMyTradesHelper (symbol, since, limit);
    }
    async fetchMyTradesHelper (symbol: string, since: number | undefined = undefined, limit: number | undefined = undefined): Promise<any[]> {
        if (since !== undefined) {
            const diff = 1000 - since;
            return [ diff ];
        }
        return [ limit ];
    }
}
`);
        const csOpen = new Transpiler ({
            verbose: false,
            csharp: {
                numericArgTypes: { fetchMyTrades: { 1: 'Int64?', 2: 'Int64?' } },
                coreArgTypes: { fetchMyTrades: { 0: 'string', 1: 'Int64?', 2: 'Int64?' } },
            },
        }).transpileCSharpByPath (venue).content;
        expect (csOpen).toContain ('fetchMyTradesHelper(object symbol, Int64? since = null, Int64? limit = null)');
        // negative: when the venue method itself is in numericArgTypes, the host table owns its signature
        const csHost = new Transpiler ({
            verbose: false,
            csharp: {
                numericArgTypes: { fetchMyTrades: { 1: 'Int64?', 2: 'Int64?' }, fetchMyTradesHelper: { 1: 'Int64?' } },
                coreArgTypes: { fetchMyTrades: { 0: 'string', 1: 'Int64?', 2: 'Int64?' } },
            },
        }).transpileCSharpByPath (venue).content;
        expect (csHost).not.toContain ('fetchMyTradesHelper(object symbol, Int64? since = null, Int64? limit = null)');
    });

    test ('Rust: bool local passes bare to native bool param and listed base bool params print bool', () => {
        const root = path.join (tmp, 'rs', 'ts', 'src');
        fs.mkdirSync (path.join (root, 'base'), { recursive: true });
        const base = path.join (root, 'base', 'Exchange.ts');
        fs.writeFileSync (base, `
export class Exchange {
    filterBySinceLimit (array: any, since: number | undefined = undefined, limit: number | undefined = undefined, key: any = 'timestamp', tail: boolean = false): any[] {
        const sinceIsDefined = since !== undefined;
        if (tail && limit !== undefined) {
            return [];
        }
        const shouldFilterFromStart = !tail && sinceIsDefined;
        return [ shouldFilterFromStart ];
    }
    isPostOnly (isMarketOrder: boolean, exchangeSpecificParam: boolean): boolean {
        const postOnly = isMarketOrder || exchangeSpecificParam;
        if (postOnly) {
            if (isMarketOrder) {
                return false;
            }
            return true;
        }
        return false;
    }
}
export default Exchange;
`);
        const venue = path.join (root, 'venue.ts');
        fs.writeFileSync (venue, `
import Exchange from './base/Exchange.js';
export default class venue extends Exchange {
    check (kind: string): boolean {
        const isMarket = (kind === 'market') || (kind === 'MARKET');
        return this.isPostOnly (isMarket, false);
    }
}
`);
        const t = new Transpiler ({ verbose: false });
        const rsBase = t.transpileRustByPath (base).content;
        expect (rsBase).toContain ('let tail: bool = get_arg(optional_args, 3, Value::Bool(false)).is_truthy()');
        expect (rsBase).not.toContain ('is_true(&tail)');
        expect (rsBase).toContain ('pub fn isPostOnly(&self, isMarketOrder: bool, exchangeSpecificParam: bool)');
        expect (rsBase).not.toContain ('is_true(&exchangeSpecificParam)');
        const rsVenue = t.transpileRustByPath (venue).content;
        expect (rsVenue).toContain ('let mut isMarket: bool =');
        expect (rsVenue).toContain ('self.isPostOnly(isMarket, false)');
    });
});
