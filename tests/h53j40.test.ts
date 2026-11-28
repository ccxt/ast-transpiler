import { Transpiler } from '../src/transpiler';

jest.mock('module',()=>({
    __esModule: true,
    default: jest.fn()
}));

const make = (): Transpiler => new Transpiler({
    verbose: false,
    java: {
        parser: { NUM_LINES_END_FILE: 0 },
    },
});

const run = (body: string) => make().transpileJava(
    "type Dict = { [key: string]: any };\n" +
    "class Precise { static stringAdd (a: string, b: string): string { return a; } }\n" +
    "class T {\n" +
    "    safeString (o: any, k: any): string { return undefined; }\n" +
    "    arrayConcat (a: any[], b: any[]): any[] { return a; }\n" +
    body +
    "}\n").content;

const reduce = (extra = '') =>
    "    reduce (fees: any): Dict[] {\n" +
    "        const reduced: Dict = {};\n" +
    "        for (let i = 0; i < fees.length; i++) {\n" +
    "            const fee = fees[i];\n" +
    "            const code = this.safeString (fee, 'currency');\n" +
    "            const feeCurrencyCode = (code !== undefined) ? code : i.toString ();\n" +
    "            const rate = this.safeString (fee, 'rate');\n" +
    "            const cost = this.safeString (fee, 'cost');\n" +
    "            if (!(feeCurrencyCode in reduced)) {\n" +
    "                reduced[feeCurrencyCode] = {};\n" +
    "            }\n" +
    "            const rateKey = (rate === undefined) ? '' : rate;\n" +
    "            if (rateKey in reduced[feeCurrencyCode]) {\n" +
    "                reduced[feeCurrencyCode][rateKey]['cost'] = Precise.stringAdd (reduced[feeCurrencyCode][rateKey]['cost'], cost);\n" +
    "            } else {\n" +
    "                const newRateFee: Dict = { 'currency': code, 'cost': cost };\n" +
    "                reduced[feeCurrencyCode][rateKey] = newRateFee;\n" +
    "            }\n" +
    "        }\n" +
    extra +
    "        let result: any[] = [];\n" +
    "        const feeValues = Object.values (reduced);\n" +
    "        for (let i = 0; i < feeValues.length; i++) {\n" +
    "            const reducedFeeValues = Object.values (feeValues[i] as Dict);\n" +
    "            result = this.arrayConcat (result, reducedFeeValues);\n" +
    "        }\n" +
    "        return result;\n" +
    "    }\n";

describe('h53-J40 row container read by Object.values', () => {
    test('a row container read by Object.values types its rows and the row reads go native', () => {
        const out = run(reduce());
        expect(out).toContain('java.util.Map<String, Map<String, Object>> reduced = new java.util.HashMap<String, Map<String, Object>>()');
        expect(out).not.toContain('Helpers.GetValue((reduced == null || feeCurrencyCode == null ? null : reduced.get(feeCurrencyCode)), rateKey)');
        expect(out).toContain('(reduced.get(feeCurrencyCode) == null || rateKey == null ? null : reduced.get(feeCurrencyCode).get(rateKey))');
        expect(out).not.toContain('(reduced == null || feeCurrencyCode == null ? null : reduced.get(feeCurrencyCode)).get(rateKey)');
    });

    test('a container also written with a non-literal value keeps the box', () => {
        const out = run(reduce("        reduced['x'] = fees[0];\n"));
        expect(out).not.toContain('Map<String, Map<String, Object>> reduced');
        expect(out).toContain('Helpers.GetValue((reduced == null || feeCurrencyCode == null ? null : reduced.get(feeCurrencyCode)), rateKey)');
    });

    test('a container handed to another call keeps the box', () => {
        const out = run(reduce("        this.arrayConcat (reduced as any, []);\n"));
        expect(out).not.toContain('Map<String, Map<String, Object>> reduced');
    });
});
