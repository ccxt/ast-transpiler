import { Transpiler } from '../src/transpiler';
import fs from 'fs';
import os from 'os';
import path from 'path';

jest.mock('module', () => ({
    __esModule: true,
    default: jest.fn()
}));

// a fixed `MarketInterface` parameter prints the Java Map, like a fixed `Market` parameter; a local
// interface of the same shape, an `any` slot and a defaulted slot keep their own forms
describe('java MarketInterface parameters', () => {
    let TMP: string;
    let VENUE: string;
    const TYPES = "export type Dict = { [key: string]: any };\n" +
        "export interface MarketInterface {\n    id: string;\n    symbol: string;\n}\n" +
        "export type Market = MarketInterface | undefined;\n";
    const SOURCE =
        "import type { Dict, Market, MarketInterface } from './base/types.js';\n" +
        "interface Local { id: string; }\n" +
        "class Venue {\n" +
        "    parseFee (fee: Dict, market: MarketInterface): any {\n" +
        "        return { 'info': fee, 'symbol': market['symbol'] };\n" +
        "    }\n" +
        "    parseLocal (fee: Dict, market: Local): any {\n" +
        "        return market;\n" +
        "    }\n" +
        "    parseAny (fee: Dict, market: any): any {\n" +
        "        return market;\n" +
        "    }\n" +
        "    parseNullable (fee: Dict, market: Market): any {\n" +
        "        return market;\n" +
        "    }\n" +
        "}\n";

    let output: string;

    beforeAll(() => {
        TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'java-market-interface-params-'));
        VENUE = path.join(TMP, 'ts', 'src', 'venue.ts');
        fs.mkdirSync(path.join(TMP, 'ts', 'src', 'base'), { recursive: true });
        fs.writeFileSync(path.join(TMP, 'ts', 'src', 'base', 'types.ts'), TYPES);
        fs.writeFileSync(VENUE, SOURCE);
        const byPath = new Transpiler({ verbose: false, java: { parser: { NUM_LINES_END_FILE: 0 } } });
        output = byPath.transpileJavaByPath(VENUE).content as string;
    });

    afterAll(() => {
        fs.rmSync(TMP, { recursive: true, force: true });
    });

    test('a MarketInterface parameter prints the Map and reads natively', () => {
        expect(output).toContain('parseFee(java.util.Map<String, Object> fee, java.util.Map<String, Object> market)');
        expect(output).toContain('market.get("symbol")');
        expect(output).not.toContain('Helpers.GetValue(market');
    });

    test('a Market parameter is unchanged', () => {
        expect(output).toContain('parseNullable(java.util.Map<String, Object> fee, java.util.Map<String, Object> market)');
    });

    test('a non-types.ts interface and an any slot keep Object', () => {
        expect(output).toContain('parseLocal(java.util.Map<String, Object> fee, Object market)');
        expect(output).toContain('parseAny(java.util.Map<String, Object> fee, Object market)');
    });
});
