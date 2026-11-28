import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

// pro tree: a producer local declared in two disjoint blocks of one method prints as two Go locals in two scopes,
// so each takes the producer's map type; a same-named binding in an enclosing scope still keeps the box
describe ('h50g51: same-named producer locals in sibling blocks', () => {
    const BASE = 'export type Dict = { [key: string]: any };\nexport type Str = string | undefined;\n'
        + 'export interface Trade { symbol: Str }\nexport type Market = Dict | undefined;\nexport class Exchange {\n'
        + '    safeString (a: any, k: any, d: any = undefined): Str { return a; }\n'
        + '    safeDict (a: any, k: any, d: any = undefined): Dict { return a; }\n'
        + '    parseWsTrade (trade: Dict, market: Market = undefined): Trade { return trade as any; }\n'
        + '    keep (x: any): any { return x; }\n}\n';
    const REST = 'import { Exchange } from \'./base/Exchange\';\nexport default class venue extends Exchange {\n}\n';
    const run = (members: string, pro = true): string => {
        const tmp = fs.mkdtempSync (path.join (os.tmpdir (), 'h50g51-'));
        try {
            const src = path.join (tmp, 'ts', 'src');
            fs.mkdirSync (path.join (src, 'base'), { recursive: true });
            fs.mkdirSync (path.join (src, 'pro'), { recursive: true });
            fs.writeFileSync (path.join (src, 'base', 'Exchange.ts'), BASE);
            fs.writeFileSync (path.join (src, 'venue.ts'), REST);
            const file = pro ? path.join (src, 'pro', 'venue.ts') : path.join (src, 'other.ts');
            const head = pro ? 'import venueRest from \'../venue\';\nexport default class venue extends venueRest {\n'
                : 'import { Exchange } from \'./base/Exchange\';\nexport default class other extends Exchange {\n';
            fs.writeFileSync (file, head + members + '}\n');
            const inst: any = new Transpiler ({ verbose: false, go: { parser: { NUM_LINES_END_FILE: 0 } } });
            installCcxtGoHooks (inst.goTranspiler);
            return inst.transpileGoByPath (file).content;
        } finally {
            fs.rmSync (tmp, { recursive: true, force: true });
        }
    };
    const SIBLINGS = '    f (message: Dict, flag: boolean) {\n'
        + '        if (flag) {\n'
        + '            const trade = this.parseWsTrade (this.safeDict (message, \'a\', {}));\n'
        + '            return this.safeString (trade, \'symbol\');\n'
        + '        } else {\n'
        + '            const trade = this.parseWsTrade (this.safeDict (message, \'b\', {}));\n'
        + '            return this.safeString (trade, \'symbol\');\n'
        + '        }\n'
        + '    }\n';
    test ('two sibling-block producer locals both print map[string]any', () => {
        const out = run (SIBLINGS);
        expect (out).not.toContain ('var trade any');
        expect ((out.match (/var trade map\[string\]any = this\.ParseWsTrade\(/g) ?? []).length).toBe (2);
    });
    test ('a same-named local in an enclosing scope keeps the box', () => {
        const out = run ('    f (message: Dict, flag: boolean) {\n'
            + '        let trade = undefined;\n'
            + '        if (flag) {\n'
            + '            const trade = this.parseWsTrade (this.safeDict (message, \'a\', {}));\n'
            + '            return this.safeString (trade, \'symbol\');\n'
            + '        }\n'
            + '        return trade;\n'
            + '    }\n');
        expect (out).toContain ('var trade any = this.ParseWsTrade(');
    });
    test ('a sibling local the other block re-boxes does not type ours through its reads', () => {
        const out = run ('    f (message: Dict, flag: boolean) {\n'
            + '        if (flag) {\n'
            + '            const trade = this.parseWsTrade (this.safeDict (message, \'a\', {}));\n'
            + '            return this.safeString (trade, \'symbol\');\n'
            + '        } else {\n'
            + '            const trade = this.keep (message);\n'
            + '            return trade;\n'
            + '        }\n'
            + '    }\n');
        expect (out).toContain ('var trade any = this.Keep(');
    });
    test ('a non-parse sibling local keeps its own rule', () => {
        const out = run ('    f (message: Dict, flag: boolean) {\n'
            + '        if (flag) {\n'
            + '            const trade = this.keep (message);\n'
            + '            return this.safeString (trade, \'symbol\');\n'
            + '        } else {\n'
            + '            const trade = this.keep (message);\n'
            + '            return this.safeString (trade, \'symbol\');\n'
            + '        }\n'
            + '    }\n');
        expect (out).toContain ('var trade any = this.Keep(');
    });
    test ('the REST tree is unchanged', () => {
        const out = run (SIBLINGS, false);
        expect (out).toContain ('var trade any = this.ParseWsTrade(');
    });
});
