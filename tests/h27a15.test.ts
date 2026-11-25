import fs from 'fs';
import path from 'path';
import { Transpiler, installCcxtGoLocalTypes } from '../src/transpiler';

// row 0 of a ws list receive typed ArrayCacheInterface reads the cache's ToArray() snapshot under nil and bounds checks
describe ('go ws cache row 0 read', () => {
    const root = path.join (__dirname, 'files', 'tmp-h27a15', 'ts', 'src', 'pro');
    const SRC =
        'type Dict = { [key: string]: any };\n' +
        'type Trade = Dict;\n' +
        'class Exchange {\n' +
        '    newUpdates: boolean = true;\n' +
        '    async watch (u: string, h: string): Promise<any> { return u; }\n' +
        '    safeDict (o: any, k: any, d: any = undefined): any { return o; }\n' +
        '    safeString (o: any, k: any): any { return o; }\n' +
        '    filterBySinceLimit (a: any, s: any, l: any, k: string, t: boolean = false): any { return a; }\n' +
        '    hold (x: any): any { return x; }\n' +
        '}\n' +
        'class venue extends Exchange {\n' +
        '    async watchTrades (symbol: string, since: number = undefined, limit: number = undefined): Promise<Trade[]> {\n' +
        '        const trades = await this.watch (\'u\', symbol);\n' +
        '        const first = this.safeDict (trades, 0);\n' +
        '        const tradeSymbol = this.safeString (first, \'symbol\');\n' +
        '        if (this.newUpdates) {\n' +
        '            limit = trades.getLimit (tradeSymbol, limit);\n' +
        '        }\n' +
        '        return this.filterBySinceLimit (trades, since, limit, \'timestamp\', true);\n' +
        '    }\n' +
        '    async watchOther (symbol: string, since: number = undefined, limit: number = undefined): Promise<Trade[]> {\n' +
        '        const rows = await this.watch (\'u\', symbol);\n' +
        '        const second = this.safeDict (rows, 1);\n' +
        '        this.hold (second);\n' +
        '        return this.filterBySinceLimit (rows, since, limit, \'timestamp\', true);\n' +
        '    }\n' +
        '    async watchEscaped (symbol: string, since: number = undefined, limit: number = undefined): Promise<Trade[]> {\n' +
        '        const boxed = await this.watch (\'u\', symbol);\n' +
        '        const head = this.safeDict (boxed, 0);\n' +
        '        this.hold (boxed);\n' +
        '        return this.filterBySinceLimit (boxed, since, limit, \'timestamp\', true);\n' +
        '    }\n' +
        '}\n';
    let out = '';
    beforeAll (() => {
        fs.mkdirSync (root, { recursive: true });
        const file = path.join (root, 'venue.ts');
        fs.writeFileSync (file, SRC);
        const t: any = new Transpiler ({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 }, 'asyncMethodSuffix': 'Async' } });
        installCcxtGoLocalTypes (t.goTranspiler);
        out = t.transpileGoByPath (file).content;
    });
    afterAll (() => fs.rmSync (path.join (__dirname, 'files', 'tmp-h27a15'), { recursive: true, force: true }));

    test ('positive: row 0 of a typed ws list cache is a checked ToArray read', () => {
        expect (out).toMatch (/var first map\[string\]any\n\s*if trades != nil \{\n\s*var firstRows \[\]any = trades\.ToArray\(\)\n\s*if len\(firstRows\) > 0 \{\n\s*first, _ = firstRows\[0\]\.\(map\[string\]any\)\n\s*\}\n\s*\}/);
        expect (out).not.toMatch (/SafeMapTyped\(trades, 0\)/);
    });

    test ('negative: another index keeps the helper', () => {
        expect (out).not.toMatch (/secondRows/);
    });

    test ('negative: a receive that escapes as a box is not a typed cache and keeps its read', () => {
        expect (out).not.toMatch (/headRows/);
    });
});
