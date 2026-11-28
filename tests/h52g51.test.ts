import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

// a local seeded by a sync method of the same class whose Go signature is map[string]any takes that type
describe ('h52g51: a local seeded by an own map-returning method', () => {
    const BASE = 'export type Dict = { [key: string]: any };\nexport type Str = string | undefined;\n'
        + 'export interface Trade { symbol: Str }\nexport interface Liquidation { symbol: Str }\nexport type Market = Dict | undefined;\nexport class Exchange {\n'
        + '    safeString (a: any, k: any, d: any = undefined): Str { return a; }\n'
        + '    safeDict (a: any, k: any, d: any = undefined): Dict { return a; }\n'
        + '    parseWsTrade (trade: Dict, market: Market = undefined): Trade { return trade as any; }\n'
        + '    keep (x: any): any { return x; }\n'
        + '    safeLiquidation (l: Dict, market: Market = undefined): Liquidation { return l as any; }\n}\n';
    const REST = 'import { Exchange } from \'./base/Exchange\';\nexport default class venue extends Exchange {\n}\n';
    const run = (members: string, pro = true): string => {
        const tmp = fs.mkdtempSync (path.join (os.tmpdir (), 'h52g51-'));
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
    const PARSER = '    parseWsLiquidation (l: Dict, market: Market = undefined): Liquidation {\n'
        + '        return this.safeLiquidation ({ \'info\': l, \'symbol\': this.safeString (l, \'s\') });\n'
        + '    }\n';
    test ('a local seeded by an own map[string]any method prints that type', () => {
        const out = run (PARSER + '    h (message: Dict) {\n'
            + '        const liquidation = this.parseWsLiquidation (this.safeDict (message, \'o\', {}));\n'
            + '        return this.safeString (liquidation, \'symbol\');\n'
            + '    }\n');
        expect (out).toMatch (/ParseWsLiquidation\(l \S+, optionalArgs \.\.\.any\) map\[string\]any/);
        expect (out).toContain ('var liquidation map[string]any = this.ParseWsLiquidation(');
        expect (out).not.toContain ('MapTyped(this.ParseWsLiquidation');
    });
    test ('a local handed on as a value (append, list literal) takes the map type', () => {
        const out = run (PARSER + '    h (message: Dict, out: any[]) {\n'
            + '        const liquidation = this.parseWsLiquidation (this.safeDict (message, \'o\', {}));\n'
            + '        out.push (liquidation);\n'
            + '        return [ liquidation ];\n'
            + '    }\n');
        expect (out).toContain ('var liquidation map[string]any = this.ParseWsLiquidation(');
    });
    test ('a local tested against undefined keeps the box (a nil map tests nil, its box did not)', () => {
        const out = run (PARSER + '    h (message: Dict) {\n'
            + '        const liquidation = this.parseWsLiquidation (this.safeDict (message, \'o\', {}));\n'
            + '        if (liquidation !== undefined) {\n            return 1;\n        }\n'
            + '        return [ liquidation ];\n'
            + '    }\n');
        expect (out).toContain ('var liquidation any = this.ParseWsLiquidation(');
    });
    test ('a local that is rebound keeps the box', () => {
        const out = run (PARSER + '    h (message: Dict) {\n'
            + '        let liquidation = this.parseWsLiquidation (this.safeDict (message, \'o\', {}));\n'
            + '        liquidation = this.keep (message);\n'
            + '        return [ liquidation ];\n'
            + '    }\n');
        expect (out).not.toContain ('var liquidation map[string]any');
    });
    test ('an own method that can answer undefined keeps the box', () => {
        const out = run ('    parseWsLiquidation (l: Dict, market: Market = undefined) {\n'
            + '        if (l === undefined) {\n            return undefined;\n        }\n'
            + '        return this.safeLiquidation ({ \'info\': l });\n'
            + '    }\n'
            + '    h (message: Dict) {\n'
            + '        const liquidation = this.parseWsLiquidation (this.safeDict (message, \'o\', {}));\n'
            + '        return this.safeString (liquidation, \'symbol\');\n'
            + '    }\n');
        expect (out).toContain ('var liquidation any = this.ParseWsLiquidation(');
    });
    test ('a method of another class (no own member) keeps the box', () => {
        const out = run ('    h (message: Dict) {\n'
            + '        const k = this.keep (message);\n'
            + '        return this.safeString (k, \'symbol\');\n'
            + '    }\n');
        expect (out).toContain ('var k any = this.Keep(');
    });
});
