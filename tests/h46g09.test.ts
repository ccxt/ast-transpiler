import { Transpiler, installCcxtGoHooks, installCcxtGoLocalTypes } from '../src/transpiler';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

jest.mock('module', () => ({
    __esModule: true,
    default: jest.fn()
}));

const BASE_FIXTURE =
    "export type Str = string | undefined;\n" +
    "export type Bool = boolean | undefined;\n" +
    "export class Exchange {\n" +
    "    id: string = 'x';\n" +
    "    getSupportedMapping (key: any, mapping: any = {}) { return mapping[key]; }\n" +
    "    handleMarketTypeAndParams (m: string, market: any = undefined, params: any = {}, d: any = undefined): any { return [ d, params ]; }\n" +
    "    handleSubTypeAndParams (m: string, market: any = undefined, params: any = {}, d: any = undefined): any { return [ d, params ]; }\n" +
    "}\n";

const go = (pro: string) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'h46g09-'));
    try {
        const src = path.join(dir, 'ts', 'src');
        fs.mkdirSync(path.join(src, 'base'), { recursive: true });
        fs.mkdirSync(path.join(src, 'pro'), { recursive: true });
        fs.writeFileSync(path.join(src, 'base', 'Exchange.ts'), BASE_FIXTURE);
        fs.writeFileSync(path.join(src, 'pro', 'ex.ts'), "import { Exchange, Str, Bool } from '../base/Exchange';\n" + pro);
        const t = new Transpiler({ verbose: false, go: {} } as any);
        installCcxtGoHooks((t as any).goTranspiler);
        installCcxtGoLocalTypes((t as any).goTranspiler);
        return t.transpileGoByPath(path.join(src, 'pro', 'ex.ts')).content;
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
};

const URL_BY_TYPE =
    "    getUrlByMarketType (type: Str, isInverse: Bool = false): Str {\n" +
    "        if (type === 'spot') {\n" +
    "            return 'a';\n" +
    "        }\n" +
    "        return isInverse ? 'b' : 'c';\n" +
    "    }\n";

describe('h46g09: a Str local declared undefined and written only by *string values', () => {
    test('positive: written by the market-type pair, read by a Str slot and a compare', () => {
        const out = go(
            "export class ex extends Exchange {\n" +
            "    watchOrders (market: any = undefined, params = {}) {\n" +
            "        let type: Str = undefined;\n" +
            "        let query = undefined;\n" +
            "        [ type, query ] = this.handleMarketTypeAndParams ('watchOrders', market, params);\n" +
            "        const typeId: string = this.getSupportedMapping (type, { 'spot': 'spot' });\n" +
            "        const url = this.getUrlByMarketType (type, false);\n" +
            "        const requiresUid = (type !== 'spot');\n" +
            "        return [ url, typeId, requiresUid ];\n" +
            "    }\n" +
            "    other (params = {}) {\n" +
            "        return this.getUrlByMarketType ('spot', true);\n" +
            "    }\n" + URL_BY_TYPE + "}\n");
        expect(out).toContain('var typeVar *string = nil');
        expect(out).toContain('typeVar, query = this.HandleMarketTypeAndParams(');
        expect(out).toContain('GetUrlByMarketType(typeVar *string, ');
        expect(out).toContain('(typeVar == nil || *typeVar != "spot")');
    });

    const variant = (reads: string, extra = '') => go(
        "export class ex extends Exchange {\n" +
        "    watchOrders (market: any = undefined, params = {}) {\n" +
        "        let type: Str = undefined;\n" +
        "        let query = undefined;\n" +
        "        [ type, query ] = this.handleMarketTypeAndParams ('watchOrders', market, params);\n" +
        reads +
        "    }\n" + extra + URL_BY_TYPE + "}\n");

    test('positive: the Str slot alone types the local and the parameter', () => {
        const out = variant("        return this.getUrlByMarketType (type, false);\n");
        expect(out).toContain('var typeVar *string = nil');
        expect(out).toContain('GetUrlByMarketType(typeVar *string, ');
    });

    test('negative: a later write of another kind keeps the box', () => {
        const out = variant("        type = params['t'];\n        return this.getUrlByMarketType (type, false);\n");
        expect(out).toContain('var typeVar any = nil');
    });

    test('negative: another caller hands an untyped value, so the parameter and the local stay untyped', () => {
        const out = variant("        return this.getUrlByMarketType (type, false);\n",
            "    other (params: any = {}) {\n        return this.getUrlByMarketType (params['t'], true);\n    }\n");
        expect(out).toContain('var typeVar any = nil');
        expect(out).toMatch(/GetUrlByMarketType\(typeVar any, /);
    });

    test('negative: a local declared any keeps the box', () => {
        const out = go(
            "export class ex extends Exchange {\n" +
            "    watchOrders (market: any = undefined, params = {}) {\n" +
            "        let type: any = undefined;\n" +
            "        let query = undefined;\n" +
            "        [ type, query ] = this.handleMarketTypeAndParams ('watchOrders', market, params);\n" +
            "        return this.getUrlByMarketType (type, false);\n" +
            "    }\n" + URL_BY_TYPE + "}\n");
        expect(out).not.toContain('var typeVar *string');
    });
});
