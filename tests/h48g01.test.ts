import { Transpiler, installCcxtGoLocalTypes } from '../src/transpiler';
import * as fs from 'fs';
import * as path from 'path';

jest.mock('module', () => ({
    __esModule: true,
    default: jest.fn()
}));

const BASE = "export type Str = string | undefined;\n" +
    "export type Dict = { [key: string]: any };\n" +
    "export class BaseExchange {\n" +
    "    handleMarketTypeAndParams (methodName: string, market: any = undefined, params: Dict = {}, defaultValue: Str = undefined): [string, Dict] { return [ defaultValue, params ]; }\n" +
    "    handleSubTypeAndParams (methodName: string, market: any = undefined, params: Dict = {}, defaultValue: any = undefined): [Str, Dict] { return [ defaultValue, params ]; }\n" +
    "    safeString (o: any, k: any, d: Str = undefined): Str { return d; }\n" +
    "}\n" +
    "export class Exchange extends BaseExchange {}\n";

const run = (name: string, body: string) => {
    const root = path.join(__dirname, 'files', name);
    const src = path.join(root, 'ts', 'src');
    fs.mkdirSync(path.join(src, 'base'), { recursive: true });
    fs.writeFileSync(path.join(src, 'base', 'Exchange.ts'), BASE);
    fs.writeFileSync(path.join(src, 'a.ts'), "import { Exchange, Str, Dict } from './base/Exchange';\nexport class a extends Exchange {\n" + body + "}\n");
    const cwd = process.cwd();
    try {
        process.chdir(root);
        const inst = new Transpiler({ verbose: false, go: {} } as any);
        installCcxtGoLocalTypes((inst as any).goTranspiler);
        return inst.transpileGoByPath('ts/src/a.ts').content;
    } finally {
        process.chdir(cwd);
        fs.rmSync(root, { recursive: true, force: true });
    }
};

const resolve = (decl: string, ret = 'type') =>
    "    auth (methodName: string, market: any = undefined, params: Dict = {}): [string, Str, Dict] {\n" +
    "        const [ marketType, paramsMarketType ] = this.handleMarketTypeAndParams (methodName, market, params);\n" +
    "        const [ subType, paramsSubType ] = this.handleSubTypeAndParams (methodName, market, paramsMarketType);\n" +
    "        " + decl + "\n" +
    "        if (type !== 'option') {\n" +
    "            type = 'linear';\n" +
    "        }\n" +
    "        return [ " + ret + ", subType, paramsSubType ];\n" +
    "    }\n" +
    "    f (params: Dict = {}) {\n" +
    "        const [ t, s, p ] = this.auth ('f', undefined, params);\n" +
    "        return [ t, s, p ];\n" +
    "    }\n";

describe('h48g01: a string ternary with a *string pair-slot arm', () => {
    test('positive: the nil test on the pair slot is the native pointer test', () => {
        const out = run('tmp-h48g01-a', resolve("let type: string = (marketType !== undefined) ? marketType : 'spot';"));
        expect(out).toContain('if marketType != nil {');
        expect(out).not.toContain('IsEqual(marketType, nil)');
        expect(out).toContain('typeVar = *marketType');
    });
    test('positive: a returned string local fills the *string slot by address', () => {
        const out = run('tmp-h48g01-b', resolve("let type: string = (marketType !== undefined) ? marketType : 'spot';"));
        expect(out).toContain('(*string, *string, map[string]any) {');
        expect(out).toContain('return &typeVar, subType, paramsSubType');
        expect(out).not.toContain('SafeStringPtr(typeVar)');
    });
    test('negative: a Str local keeps its pointer slot as is', () => {
        const out = run('tmp-h48g01-c', resolve("let type: Str = marketType;"));
        expect(out).toContain('return typeVar, subType, paramsSubType');
    });
    test('negative: a returned string literal keeps the SafeStringPtr box', () => {
        const out = run('tmp-h48g01-d', resolve("let type: string = (marketType !== undefined) ? marketType : 'spot';", "'spot'"));
        expect(out).not.toContain('return &');
    });
    test('negative: a local a closure captures is not handed out by address', () => {
        const out = run('tmp-h48g01-e', resolve("let type: string = (marketType !== undefined) ? marketType : 'spot';\n        const g = () => type;"));
        expect(out).not.toContain('return &typeVar');
    });
    test('negative: a nil test on a slot-1 binding keeps its own form', () => {
        const out = run('tmp-h48g01-f', "    g (params: Dict = {}) {\n        const [ t, q ] = this.handleMarketTypeAndParams ('g', undefined, params);\n        const x: string = (q !== undefined) ? 'a' : 'b';\n        return x;\n    }\n");
        expect(out).not.toContain('q != nil');
    });
});
