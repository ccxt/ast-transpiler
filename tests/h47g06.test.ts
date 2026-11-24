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
    "export type Dict = { [key: string]: any };\n" +
    "export class Exchange {\n" +
    "    id: string = 'x';\n" +
    "    handleMarketTypeAndParams (methodName: string, market: any = undefined, params: Dict = {}, defaultValue: Str = undefined): [string, Dict] { return [ defaultValue, params ]; }\n" +
    "    handleSubTypeAndParams (methodName: string, market: any = undefined, params: Dict = {}, defaultValue: any = undefined): [Str, Dict] { return [ defaultValue, params ]; }\n" +
    "    isLinear (type: string, subType: Str = undefined): boolean { return type === 'swap'; }\n" +
    "    safeString (o: any, k: any, d: Str = undefined): Str { return d; }\n" +
    "}\n";

const go = (pro: string) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'h47g06-'));
    try {
        const src = path.join(dir, 'ts', 'src');
        fs.mkdirSync(path.join(src, 'base'), { recursive: true });
        fs.mkdirSync(path.join(src, 'pro'), { recursive: true });
        fs.writeFileSync(path.join(src, 'base', 'Exchange.ts'), BASE_FIXTURE);
        fs.writeFileSync(path.join(src, 'pro', 'ex.ts'), "import { Exchange, Str, Dict } from '../base/Exchange';\n" + pro);
        const t = new Transpiler({ verbose: false, go: {} } as any);
        installCcxtGoHooks((t as any).goTranspiler);
        installCcxtGoLocalTypes((t as any).goTranspiler);
        return t.transpileGoByPath(path.join(src, 'pro', 'ex.ts')).content;
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
};

const RESOLVE = (decl: string) =>
    "export class ex extends Exchange {\n" +
    "    resolveAuthType (methodName: string, market: any = undefined, params: Dict = {}): [string, Str, Dict] {\n" +
    "        const [ marketType, paramsMarketType ] = this.handleMarketTypeAndParams (methodName, market, params);\n" +
    "        const [ subType, paramsSubType ] = this.handleSubTypeAndParams (methodName, market, paramsMarketType);\n" +
    "        " + decl + "\n" +
    "        if (type !== 'option') {\n" +
    "            if (this.isLinear (type, subType)) {\n" +
    "                type = 'linear';\n" +
    "            }\n" +
    "        }\n" +
    "        return [ type, subType, paramsSubType ];\n" +
    "    }\n" +
    "}\n";

const F = (decl: string) => go(
    "export class ex extends Exchange {\n" +
    "    f (market: any = undefined, params: Dict = {}): string {\n" +
    "        const [ marketType, q ] = this.handleMarketTypeAndParams ('f', market, params);\n" +
    "        " + decl + "\n" +
    "        return type;\n" +
    "    }\n" +
    "}\n");

describe('h47g06: a declared string local defaulted from a *string pair slot', () => {
    test('positive: the pair slot arm is dereferenced under its nil test', () => {
        const out = go(RESOLVE("let type: string = (marketType !== undefined) ? marketType : 'spot';"));
        expect(out).toContain('var typeVar string\n');
        expect(out).toContain('typeVar = *marketType');
        expect(out).toContain('if typeVar != "option" {');
        expect(out).not.toContain('IsEqual(typeVar');
    });
    test('positive: a const local, mirrored condition', () => {
        const out = F("const type: string = (marketType === undefined) ? 'spot' : marketType;");
        expect(out).toContain('var typeVar string\n');
        expect(out).toContain('typeVar = *marketType');
    });
    test('negative: a declared Str local keeps its pointer', () => {
        const out = go(RESOLVE("let type: Str = marketType;"));
        expect(out).toContain('var typeVar *string = marketType');
    });
    test('negative: an unannotated local is not typed by this rule', () => {
        const out = go(RESOLVE("let type = (marketType !== undefined) ? marketType : 'spot';"));
        expect(out).not.toContain('var typeVar string');
    });
    test('negative: an arm of another kind keeps the box', () => {
        const out = F("const type: string = (marketType !== undefined) ? params['t'] : 'spot';");
        expect(out).not.toContain('var typeVar string');
    });
    test('negative: a condition that does not test the arm keeps the box', () => {
        const out = F("const type: string = (q !== undefined) ? marketType : 'spot';");
        expect(out).not.toContain('typeVar = *marketType');
    });
});
