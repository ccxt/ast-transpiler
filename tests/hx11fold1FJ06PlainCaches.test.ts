import { Transpiler } from '../src/transpiler';
import fs from 'fs';
import path from 'path';

jest.mock('module', () => ({
    __esModule: true,
    default: jest.fn()
}));

// hx11 fold 1F (hx10w2 J06): a base cache the hand-written BaseExchange.java declares as a plain
// `Map<String, Object> = new HashMap<>()` takes the native put / guarded get on a String key.
describe('java plain base caches', () => {
    const TMP = path.join(__dirname, 'files', 'tmp-hx11-fold-1f-j06');
    const BASE = path.join(TMP, 'ts', 'src', 'base', 'Exchange.ts');
    const VENUE = path.join(TMP, 'ts', 'src', 'pro', 'fake.ts');
    const body =
        "export class fake extends Exchange {\n" +
        "    w1 (v: any, k: string) {\n" +
        "        const sym = this.safeString (v, 'symbol');\n" +
        "        this.tickers['a'] = v;\n" +
        "        this.tickers[sym as string] = v;\n" +
        "        this.tickers[sym as string] = undefined;\n" +
        "        this.bag[sym as string] = v;\n" +
        "        this.other[sym as string] = v;\n" +
        "        this.tickers[this.hash (k)] = v;\n" +
        "    }\n" +
        "    r1 (v: any) {\n" +
        "        const sym = this.safeString (v, 'symbol');\n" +
        "        const a = this.tickers[sym as string];\n" +
        "        const b = this.bag[sym as string];\n" +
        "        const c = this.other[sym as string];\n" +
        "        const d = this.tickers[this.hash (sym)];\n" +
        "        return [ a, b, c, d ];\n" +
        "    }\n" +
        "    hash (s: string): string { return s; }\n" +
        "}\n";
    let out: string;
    let bare: string;

    beforeAll(() => {
        fs.mkdirSync(path.dirname(BASE), { recursive: true });
        fs.mkdirSync(path.dirname(VENUE), { recursive: true });
        fs.writeFileSync(BASE,
            "type Dictionary<T> = { [key: string]: T };\n" +
            "export class Exchange {\n" +
            "    tickers: Dictionary<number> = {};\n" +
            "    bag: Dictionary<any> = {};\n" +
            "    other: Dictionary<number> = {};\n" +
            "    safeString (d: any, k: any): string | undefined { return d; }\n" +
            "}\n");
        fs.writeFileSync(VENUE, "import { Exchange } from '../base/Exchange.js';\n" + body);
        const make = (caches: string[]) => {
            const t: any = new Transpiler({ 'verbose': false, 'java': { 'parser': { 'NUM_LINES_END_FILE': 0 } } });
            const printer: any = t.javaTranspiler;
            printer.javaPlainCacheFields = new Set(caches);
            // the build layer's local-type pass publishes `String sym` for the safeString local
            printer.javaDeclaredLocalTypeResolver = (declaration: any) => declaration.name?.text === 'sym' ? 'String' : undefined;
            return t.transpileJavaByPath(VENUE).content;
        };
        out = make(['tickers', 'bag']);
        bare = make([]);
    });

    afterAll(() => {
        fs.rmSync(TMP, { recursive: true, force: true });
    });

    const method = (text: string, name: string) => {
        const start = text.indexOf(' ' + name + '(');
        return text.slice(start, text.indexOf('\n    }', start));
    };

    test('a String key writes natively, null value included', () => {
        const w1 = method(out, 'w1');
        expect(w1).toContain('this.tickers.put("a", v);');
        expect(w1).toContain('this.tickers.put(((String)sym), v);');
        expect(w1).toContain('this.tickers.put(((String)sym), null);');
    });

    test('an any-valued bag, an unnamed field and an unproven key keep the helper', () => {
        const w1 = method(out, 'w1');
        expect(w1).toContain('Helpers.addElementToObject(this.bag, ((String)sym), v)');
        expect(w1).toContain('Helpers.addElementToObject(this.other, ((String)sym), v)');
        expect(w1).toContain('Helpers.addElementToObject(this.tickers, this.hash((String) (k)), v)');
    });

    test('a String-declared key reads through the guarded get', () => {
        const r1 = method(out, 'r1');
        expect(r1).toContain('Object a = (this.tickers == null || sym == null ? null : this.tickers.get(sym));');
        expect(r1).toContain('Helpers.GetValue(this.bag, ((String)sym))');
        expect(r1).toContain('Helpers.GetValue(this.other, ((String)sym))');
        expect(r1).toContain('Helpers.GetValue(this.tickers, this.hash((String) (sym)))');
    });

    test('without a declared plain cache every site keeps the helper', () => {
        expect(method(bare, 'w1')).toContain('Helpers.addElementToObject(this.tickers, "a", v)');
        expect(method(bare, 'r1')).toContain('Helpers.GetValue(this.tickers, ((String)sym))');
    });
});
