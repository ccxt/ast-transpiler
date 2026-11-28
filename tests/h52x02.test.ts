import { Transpiler, installCcxtGoLocalTypes } from '../src/transpiler';

function go (body: string): string {
    const x = new Transpiler ({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 } } });
    installCcxtGoLocalTypes (x.goTranspiler);
    const src = 'class Ex {\n'
        + '    safeString (a: any, b: any, c: any = undefined) { return undefined; }\n'
        + '    safeList (a: any, b: any, c: any = undefined) { return c; }\n'
        + '    parseWsOrderRow (o: any, m: any = undefined) { return {}; }\n'
        + '    parseWsOrderRaw (o: any, m: any = undefined) { return {}; }\n'
        + body
        + '}\n';
    return x.transpileGo (src).content;
}

describe ('h52x02 bitfinex ws order row local', () => {
    test ('a local seeded by parseWsOrderRow is declared map[string]any', () => {
        const out = go ('    h (data: any) {\n'
            + '        const parsed = this.parseWsOrderRow (this.safeList (data, 0, []));\n'
            + '        return this.safeString (parsed, \'symbol\', \'\');\n'
            + '    }\n');
        expect (out).toContain ('var parsed map[string]any = this.ParseWsOrderRow(');
        expect (out).not.toContain ('OrderToMap(');
    });
    test ('another venue-private row parser keeps its box', () => {
        const out = go ('    h (data: any) {\n'
            + '        const parsed = this.parseWsOrderRaw (data);\n'
            + '        return this.safeString (parsed, \'symbol\', \'\');\n'
            + '    }\n');
        expect (out).toContain ('var parsed any = this.ParseWsOrderRaw(data)');
    });
});
