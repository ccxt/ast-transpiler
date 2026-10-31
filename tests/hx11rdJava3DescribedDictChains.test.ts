import { Transpiler } from '../src/transpiler';
import fs from 'fs';
import path from 'path';

jest.mock('module', () => ({
    __esModule: true,
    default: jest.fn()
}));

// hx11 RD-JAVA-3 (folds hx10w3 J05): nested reads of the hand-written Map<String, Object>
// header fields (urls / fees / limits) that the class's own describe () literal holds as objects.

describe('java described dict chains', () => {
    const TMP = path.join(__dirname, 'files', 'tmp-hx11rd-java3');
    const BASE = path.join(TMP, 'ts', 'src', 'base', 'Exchange.ts');
    const VENUE = path.join(TMP, 'ts', 'src', 'pro', 'fake.ts');
    const body =
        "export class fake extends Exchange {\n" +
        "    describe (): Dict {\n" +
        "        return this.deepExtend (super.describe (), {\n" +
        "            'urls': { 'api': { 'ws': { 'public': 'wss://a', 'private': 'wss://b' }, 'rest': 'https://c' }, 'doc': 'd' },\n" +
        "            'fees': { 'trading': { 'taker': 0.1 } },\n" +
        "            'limits': { 'amount': { 'min': 1 } },\n" +
        "        });\n" +
        "    }\n" +
        "    r1 (t: string) {\n" +
        "        const a = this.urls['api']['ws']['public'];\n" +
        "        const b = this.urls['api']['ws'][t];\n" +
        "        const c = this.fees['trading']['taker'];\n" +
        "        const d = this.limits['amount']['min'];\n" +
        "        return [ a, b, c, d ];\n" +
        "    }\n" +
        "    r2 (t: string) {\n" +
        "        const a = this.urls['api']['rest']['x'];\n" +
        "        const b = this.urls['doc']['x'];\n" +
        "        const c = this.urls['api']['nope']['x'];\n" +
        "        const d = this.markets['a']['b'];\n" +
        "        return [ a, b, c, d ];\n" +
        "    }\n" +
        "}\n";
    let out: string;
    let bare: string;

    beforeAll(() => {
        fs.mkdirSync(path.dirname(BASE), { recursive: true });
        fs.mkdirSync(path.dirname(VENUE), { recursive: true });
        fs.writeFileSync(BASE,
            "type Dictionary<T> = { [key: string]: T };\n" +
            "export type Dict = Dictionary<any>;\n" +
            "export class Exchange {\n" +
            "    urls: any;\n    fees: any;\n    limits: any;\n    markets: any;\n" +
            "    describe (): Dict { return {}; }\n" +
            "    deepExtend (...args: any[]): any { return args[0]; }\n" +
            "    extend (...args: any[]): any { return args[0]; }\n" +
            "}\n");
        fs.writeFileSync(VENUE, "import { Exchange, Dict } from '../base/Exchange.js';\n" + body);
        const make = (fields: string[]) => {
            const t: any = new Transpiler({ 'verbose': false, 'java': { 'parser': { 'NUM_LINES_END_FILE': 0 } } });
            t.javaTranspiler.javaHeaderMapFields = new Set(fields);
            return t.transpileJavaByPath(VENUE).content as string;
        };
        out = make(['urls']);
        bare = make([]);
    });

    afterAll(() => {
        fs.rmSync(TMP, { recursive: true, force: true });
    });

    const method = (text: string, name: string) => {
        const start = text.indexOf(' ' + name + '(');
        return text.slice(start, text.indexOf('\n    }', start));
    };

    test('a literal path the describe literal holds as objects reads natively', () => {
        const r1 = method(out, 'r1');
        expect(r1).toContain('Object a = ((java.util.Map<String, Object>)((java.util.Map<String, Object>)');
        expect(r1).toContain('.get("ws")).get("public");');
        expect(r1).not.toContain('Helpers.GetValue(this.urls');
    });

    test('a name key is null-guarded', () => {
        expect(method(out, 'r1')).toContain('Object b = (t == null ? null : ((java.util.Map<String, Object>)');
        expect(method(out, 'r1')).toContain('.get("ws")).get(t));');
    });

    test('a field the header does not declare Map<String, Object> keeps the helper', () => {
        expect(method(out, 'r1')).toContain('Object d = Helpers.GetValue(Helpers.GetValue(this.limits, "amount"), "min");');
        expect(method(out, 'r1')).toContain('Object c = Helpers.GetValue((this.fees == null');
    });

    test('scalar, missing and foreign paths keep the helper', () => {
        const r2 = method(out, 'r2');
        expect(r2.match(/Helpers\.GetValue\(/g)?.length).toBe(4);
        expect(r2).toContain('Helpers.GetValue((this.markets == null');
    });

    test('without header map fields every site keeps the helper', () => {
        expect(method(bare, 'r1')).toContain('Helpers.GetValue(');
        expect(method(bare, 'r1')).not.toContain('.get("ws"))).get("public")');
    });
});
