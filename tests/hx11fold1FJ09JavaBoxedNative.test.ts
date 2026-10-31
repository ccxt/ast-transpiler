import { Transpiler } from '../src/transpiler';
import fs from 'fs';
import path from 'path';

jest.mock('module', () => ({
    __esModule: true,
    default: jest.fn()
}));

// hx11 fold 1F hx10w6-J09: two native forms the switch-blob pass used to collapse after printing.
//  * `Object.keys (this.<f>)` for a BaseExchange Map field is a null-guarded key copy;
//  * `x + <int literal>` on a local the build layer reports as the nullable `Long` box is a null-propagating add.
describe('java boxed native forms', () => {
    const TMP = path.join(__dirname, 'files', 'tmp-hx11-j09');
    const BASE = path.join(TMP, 'ts', 'src', 'base', 'Exchange.ts');
    const VENUE = path.join(TMP, 'ts', 'src', 'fake.ts');
    const body =
        "export class fake extends Exchange {\n" +
        "    k1 () {\n" +
        "        const a = Object.keys (this.tickers);\n" +
        "        const e = Object.keys (this.tickers);\n" +
        "        for (let i = 0; i < e.length; i++) { this.pair (e[i]); }\n" +
        "        const b = Object.keys (this.options);\n" +
        "        const c = Object.keys (this.currencies);\n" +
        "        const d = Object.keys (this.own);\n" +
        "        return [ a, b, c, d ];\n" +
        "    }\n" +
        "    a1 (n: number, o: any) {\n" +
        "        let m = n;\n" +
        "        const [ r, p ] = this.pair (o);\n" +
        "        const x = r + 1;\n" +
        "        for (let j = 0; j < r + 1; j++) { this.pair (j); }\n" +
        "        const y = m + 1;\n" +
        "        const z = o + 1;\n" +
        "        return [ x, y, z ];\n" +
        "    }\n" +
        "}\n";
    let out: string;
    let bare: string;

    const run = (withResolver: boolean) => {
        const t = new Transpiler({ 'verbose': false, 'java': { 'parser': { 'NUM_LINES_END_FILE': 0 } } });
        const printer: any = (t as any).javaTranspiler;
        printer.javaOwnerStoreFields = new Set(['options']);
        if (withResolver) {
            printer.javaBoxedLongResolver = (node: any) => node.text === 'r';
        }
        return t.transpileJavaByPath(VENUE).content;
    };

    beforeAll(() => {
        fs.mkdirSync(path.dirname(BASE), { recursive: true });
        fs.writeFileSync(BASE,
            "type Dictionary<T> = { [key: string]: T };\n" +
            "export class Exchange {\n" +
            "    tickers: Dictionary<any> = {};\n" +
            "    options: Dictionary<any> = {};\n" +
            "    currencies: Dictionary<any> = {};\n" +
            "    pair (o: any): [ number, any ] { return [ 1, o ]; }\n" +
            "}\n");
        fs.writeFileSync(VENUE,
            "import { Exchange } from './base/Exchange.js';\n" +
            body.replace('k1 () {', 'own: Record<string, any> = {};\n    k1 () {'));
        out = run(true);
        bare = run(false);
    });

    afterAll(() => {
        fs.rmSync(TMP, { recursive: true, force: true });
    });

    const method = (text: string, name: string) => {
        const start = text.indexOf(' ' + name + '(');
        return text.slice(start, text.indexOf('\n    }', start));
    };

    test('Object.keys on a base Map field is the null-guarded key copy', () => {
        const k1 = method(out, 'k1');
        expect(k1).toContain('(this.tickers == null ? new java.util.ArrayList<Object>() : new java.util.ArrayList<Object>(this.tickers.keySet()))');
    });

    test('a local fed by it declares the List<Object> its copy is', () => {
        expect(method(out, 'k1')).toContain('List<Object> e = (this.tickers == null');
    });

    test('an owner store, an unlisted field and a venue field keep the helper', () => {
        const k1 = method(out, 'k1');
        expect(k1).toContain('Helpers.objectKeys(this.options)');
        expect(k1).toContain('Helpers.objectKeys(this.currencies)');
        expect(k1).toContain('Helpers.objectKeys(this.own)');
    });

    test('a nullable Long local plus an int literal is a null-propagating add', () => {
        const a1 = method(out, 'a1');
        expect(a1).toContain('(r == null ? null : (Object) (r + 1L))');
    });

    test('an unreported local and an untyped operand keep Helpers.add', () => {
        const a1 = method(out, 'a1');
        expect(a1).toContain('Helpers.add(o, 1)');
        expect(a1).not.toContain('(m == null ? null');
        expect(method(bare, 'a1')).not.toContain('r == null ? null');
    });
});
