import { Transpiler } from '../src/transpiler';
import * as fs from 'fs';
import * as path from 'path';

jest.mock('module', () => ({
    __esModule: true,
    default: jest.fn()
}));

// RD-CS-3 (relocates hx10w3-C06 parseJson): a callee whose emitted signature already returns a string
// makes parseJson's `(string)` unbox an identity, so the deserializer is called on the call itself.
describe('parseJson on a string-returning this-call', () => {
    const TMP = path.join(__dirname, 'files', 'tmp-rdcs3-parsejson');
    const VENUE = path.join(TMP, 'ts', 'src', 'v.ts');
    let out: string;

    beforeAll(() => {
        fs.mkdirSync(path.dirname(VENUE), { recursive: true });
        fs.writeFileSync(VENUE,
            "export class V {\n" +
            "    parseJson (x: any): any { return x; }\n" +
            "    sign (h: string): string { return h; }\n" +
            "    other (h: string): any { return h; }\n" +
            "    f (h: string) {\n" +
            "        const a = JSON.parse (this.sign (h));\n" +
            "        const b = this.parseJson (this.sign (h));\n" +
            "        const c = JSON.parse (this.other (h));\n" +
            "        const d = this.parseJson (this.other (h));\n" +
            "        return [ a, b, c, d ];\n" +
            "    }\n" +
            "}\n");
        out = new Transpiler({ 'verbose': false, 'csharp': { 'parser': { 'NUM_LINES_END_FILE': 0 } } }).transpileCSharpByPath(VENUE).content;
    });

    afterAll(() => {
        fs.rmSync(TMP, { recursive: true, force: true });
    });

    test('JSON.parse and this.parseJson of a string-typed call deserialize the call directly', () => {
        expect(out).toContain('object a = JsonHelper.Deserialize((string)this.sign(h));');
        expect(out).toContain('object b = JsonHelper.Deserialize((string)this.sign(h));');
    });

    test('an object-returning callee keeps the helper', () => {
        expect(out).toContain('parseJson(this.other(h))');
        expect(out).not.toContain('(string)this.other(h)');
    });
});
