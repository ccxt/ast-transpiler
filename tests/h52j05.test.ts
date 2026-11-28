import fs from 'fs';
import path from 'path';
import { Transpiler } from '../src/transpiler';

jest.mock('module', () => ({ __esModule: true, default: jest.fn() }));

// an `OrderBookSide`-annotated parameter prints the hand-written side class (an ArrayList<Object>):
// its length and its element reads bind natively, a side-typed argument needs no checkcast
describe('java OrderBookSide parameter typing', () => {
    let root: string;
    let out: string;

    beforeAll(() => {
        root = path.join(__dirname, 'files', 'tmp-h52j05-orderbookside');
        const side = path.join(root, 'ts', 'src', 'base', 'ws', 'OrderBookSide.ts');
        const venue = path.join(root, 'ts', 'src', 'pro', 'probe.ts');
        fs.mkdirSync(path.dirname(side), { recursive: true });
        fs.mkdirSync(path.dirname(venue), { recursive: true });
        fs.writeFileSync(side,
            'class OrderBookSide extends Array {\n' +
            '    storeArray (delta: any): void {}\n' +
            '}\n' +
            'export { OrderBookSide };\n');
        fs.writeFileSync(venue,
            "import { OrderBookSide } from '../base/ws/OrderBookSide';\n" +
            'class Venue {\n' +
            '    reduce (orderSide: OrderBookSide, id: string): boolean {\n' +
            '        const n = orderSide.length;\n' +
            '        for (let i = 0; i < n; i++) {\n' +
            '            const order = orderSide[i];\n' +
            '            if (order === id) {\n' +
            '                orderSide.storeArray ([ 0, 0, id ]);\n' +
            '                return true;\n' +
            '            }\n' +
            '        }\n' +
            '        return false;\n' +
            '    }\n' +
            '    untyped (orderSide: any): any {\n' +
            '        return orderSide[0];\n' +
            '    }\n' +
            '    caller (box: any, side: OrderBookSide): void {\n' +
            "        this.reduce (box, 'a');\n" +
            "        this.reduce (side, 'b');\n" +
            '    }\n' +
            '}\n');
        const transpiler = new Transpiler({ verbose: false, java: { parser: { NUM_LINES_END_FILE: 0 } } });
        out = (transpiler as any).transpileJavaByPath(venue).content;
    });

    afterAll(() => {
        fs.rmSync(root, { recursive: true, force: true });
    });

    test('the annotated parameter prints the side class', () => {
        expect(out).toContain('reduce(io.github.ccxt.ws.OrderBookSide orderSide, String id)');
    });

    test('length and element reads bind on the typed side, with the helper answers for null and out of range', () => {
        expect(out).toContain('orderSide.size()');
        expect(out).toContain('(orderSide == null || i < 0 || i >= orderSide.size() ? null : orderSide.get(i))');
        expect(out.split('public Object untyped')[0]).not.toContain('Helpers.GetValue(orderSide');
        expect(out.split('public Object untyped')[0]).not.toContain('(List<?>)orderSide');
        expect(out).toContain('orderSide.storeArray(');
    });

    test('an any-annotated parameter keeps Object and the helper', () => {
        expect(out).toContain('untyped(Object orderSide)');
        expect(out).toContain('Helpers.GetValue(orderSide, 0)');
    });

    test('an Object argument takes the checkcast, a side-typed parameter does not', () => {
        expect(out).toContain('this.reduce((io.github.ccxt.ws.OrderBookSide) (box), "a")');
        expect(out).toContain('this.reduce(side, "b")');
    });
});
