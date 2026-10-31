import { Transpiler } from '../src/transpiler';

jest.mock('module', () => ({
    __esModule: true,
    default: jest.fn()
}));

const unique = [ 'pairOf', 'rowOf', 'chained', 'mixed', 'dictLiteral', 'asyncPair', 'overridden', 'noReturn', 'scalar' ];
const makeConfig = (table: boolean): any => ({ 'verbose': false, 'csharp': { ...(table ? { 'uniqueMethodNames': unique } : {}), 'parser': { 'NUM_LINES_END_FILE': 0, 'ELEMENT_ACCESS_WRAPPER_OPEN': 'getValue(', 'ELEMENT_ACCESS_WRAPPER_CLOSE': ')' } } });

// RD-CS-3 (relocates RFM-C1 w3C06): a venue-local method declared once, annotated with a collection
const source =
    "type Dict = { [key: string]: any };\n" +
    "type List = any[];\n" +
    "interface MarketInterface { id: string }\n" +
    "class Base {\n" +
    "    markets: any;\n" +
    "    safeDict (d: any, k: string, def: any = undefined): Dict { return d[k]; }\n" +
    "    safeString (d: any, k: string): string { return d[k]; }\n" +
    "    overridden (a: any): List { throw new Error ('x'); }\n" +
    "}\n" +
    "class Venue extends Base {\n" +
    "    pairOf (a: any, b: any): List {\n" +
    "        return [ a, b ];\n" +
    "    }\n" +
    "    rowOf (symbol: string): MarketInterface {\n" +
    "        const market = this.safeDict (this.markets, symbol);\n" +
    "        return market as MarketInterface;\n" +
    "    }\n" +
    "    chained (a: any): List {\n" +
    "        if (a) {\n" +
    "            return this.pairOf (a, a);\n" +
    "        }\n" +
    "        return [ a ];\n" +
    "    }\n" +
    "    mixed (a: any): List {\n" +
    "        if (a) {\n" +
    "            return [ a ];\n" +
    "        }\n" +
    "        return this.safeString (a, 'k') as any;\n" +
    "    }\n" +
    "    dictLiteral (a: any): Dict {\n" +
    "        return { 'a': a };\n" +
    "    }\n" +
    "    async asyncPair (a: any): Promise<List> {\n" +
    "        return [ a ];\n" +
    "    }\n" +
    "    override overridden (a: any): List {\n" +
    "        return [ a ];\n" +
    "    }\n" +
    "    twoDecls (a: any): List {\n" +
    "        return [ a ];\n" +
    "    }\n" +
    "    noReturn (a: any): List {\n" +
    "        throw new Error ('x');\n" +
    "    }\n" +
    "    scalar (a: any): string {\n" +
    "        return 'x';\n" +
    "    }\n" +
    "    user (symbol: string) {\n" +
    "        const p = this.pairOf (1, 2);\n" +
    "        const n = p.length;\n" +
    "        const m = this.rowOf (symbol);\n" +
    "        const z = this.mixed (1);\n" +
    "        return [ p, n, m, z ];\n" +
    "    }\n" +
    "}\n" +
    "class Other {\n" +
    "    twoDecls (a: any): List {\n" +
    "        return [ a ];\n" +
    "    }\n" +
    "}";

const printed = (table: boolean): string => (new Transpiler(makeConfig(table)) as any).transpileCSharp(source).content;

describe('RD-CS-3: inferred collection return box', () => {
    test('without the table every signature and local keeps the printer box', () => {
        const out = printed(false);
        expect(out).toContain('public virtual object pairOf(object a, object b)');
        expect(out).toContain('public virtual object rowOf(object symbol)');
        expect(out).toContain('object p = this.pairOf(1, 2);');
    });

    test('a method whose every return proves the box prints it, callers type their locals', () => {
        const out = printed(true);
        expect(out).toContain('public virtual List<object> pairOf(object a, object b)');
        expect(out).toContain('return new List<object>() {a, b};');
        expect(out).toContain('public virtual IDictionary<string, object> rowOf(object symbol)');
        expect(out).toContain('return market;');
        expect(out).toContain('public virtual List<object> chained(object a)');
        expect(out).toContain('List<object> p = this.pairOf(1, 2);');
        expect(out).toContain('IDictionary<string, object> m = this.rowOf(symbol);');
        expect(out).toContain('int n = getArrayLength(p);');
        expect(out).not.toContain('((List<object>)((object)(');
    });

    test('an unproven return path, async, override, unlisted name and missing return keep object', () => {
        const out = printed(true);
        expect(out).toContain('public virtual object mixed(object a)');
        expect(out).toContain('object z = this.mixed(1);');
        expect(out).toContain('public virtual object dictLiteral(object a)');
        expect(out).toMatch(/public (async )?virtual Task<object> asyncPair/);
        expect(out).toContain('public override object overridden(object a)');
        expect(out).toMatch(/public virtual object twoDecls\(object a\)/);
        expect(out).toContain('public virtual object noReturn(object a)');
        expect(out).toContain('public virtual string? scalar(object a)');
    });
});
