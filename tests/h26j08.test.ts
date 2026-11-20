import { Transpiler } from '../src/transpiler';
import fs from 'fs';
import path from 'path';

// `this.parseToInt (a * b)` with a proven double operand prints the native product
describe('h26j08: double product inside the base parseToInt', () => {
    const TMP = path.join(__dirname, 'files', 'tmp-h26j08');
    const BASE_FIXTURE = path.join(TMP, 'ts', 'src', 'base', 'Exchange.ts');
    const VENUE_FIXTURE = path.join(TMP, 'ts', 'src', 'probe.ts');
    let out: string;
    beforeAll(() => {
        fs.mkdirSync(path.dirname(BASE_FIXTURE), { recursive: true });
        fs.writeFileSync(BASE_FIXTURE, "export default class Exchange {\n    parseToInt (x: any): number { return x; }\n    safeString (o: any, k: string): string { return o[k]; }\n}\n");
        fs.writeFileSync(VENUE_FIXTURE,
            "import Exchange from './base/Exchange';\n" +
            "type Int = number | undefined;\n" +
            "export default class probe extends Exchange {\n" +
            "    parseToIntOther (x: any): number { return x; }\n" +
            "    a (o: any, n: number): number {\n" +
            "        const m = 1000000;\n" +
            "        return this.parseToInt (parseFloat (this.safeString (o, 'x')) * m);\n" +
            "    }\n" +
            "    e (o: any, w: Int): number {\n" +
            "        return this.parseToInt (parseFloat (this.safeString (o, 'x')) * w);\n" +
            "    }\n" +
            "    b (o: any, m: any): number {\n" +
            "        return this.parseToInt (parseFloat (this.safeString (o, 'x')) * m);\n" +
            "    }\n" +
            "    c (o: any, m: number): number {\n" +
            "        return this.parseToIntOther (parseFloat (this.safeString (o, 'x')) * m);\n" +
            "    }\n" +
            "    d (o: any, m: number): any {\n" +
            "        const v = parseFloat (this.safeString (o, 'x')) * m;\n" +
            "        return v;\n" +
            "    }\n" +
            "}\n");
        const transpiler = new Transpiler({ verbose: false, java: { parser: { NUM_LINES_END_FILE: 0 } } });
        // the build layer declares these locals `Long` (as ccxt does for `amountMultiplier`)
        (transpiler as any).javaTranspiler.javaDeclaredLocalTypeResolver = (declaration: any) => (['m', 'w'].includes(declaration?.name?.text) ? 'Long' : undefined);
        out = transpiler.transpileJavaByPath(VENUE_FIXTURE).content;
    });
    afterAll(() => {
        fs.rmSync(TMP, { recursive: true, force: true });
    });
    const body = (name: string): string => {
        const at = out.indexOf(` ${name}(`);
        return out.slice(at, out.indexOf('\n    }', at));
    };

    test('a parsed double times a declared number prints natively into the base parseToInt', () => {
        expect(body('a')).not.toContain('Helpers.multiply');
        expect(body('a')).toContain('this.parseToInt(((m == null) ? null : (Double.parseDouble(');
    });

    test('a nullable Long operand keeps the helper null answer in a ternary', () => {
        expect(body('e')).not.toContain('Helpers.multiply');
        expect(body('e')).toContain('((w == null) ? null : (Double.parseDouble(');
    });

    test('an any operand keeps the helper', () => {
        expect(body('b')).toContain('Helpers.multiply(');
    });

    test('a product into another method keeps the helper', () => {
        expect(body('c')).toContain('Helpers.multiply(');
    });

    test('a product outside parseToInt keeps the helper', () => {
        expect(body('d')).toContain('Helpers.multiply(');
    });
});
