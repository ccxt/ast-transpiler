import { Transpiler } from '../src/transpiler';

jest.mock('module', () => ({ __esModule: true, default: jest.fn() }));

let transpiler: Transpiler;
beforeAll(() => {
    transpiler = new Transpiler({ verbose: false, rust: { parser: { NUM_LINES_END_FILE: 0 } } });
});

// The ws order book is a `Value::Dict` in the rust port even though ts/src declares it
// as a class: `order_book()` builds the map and every element read is a plain map read.
const HEAD = 'type Dict = { [key: string]: any };\n' +
    'type Dictionary<T> = { [key: string]: T };\n' +
    'class OrderBook { bids: any; asks: any; nonce: any; constructor(o: any = undefined) {} }\n' +
    'class A {\n' +
    '    orderbooks: Dictionary<OrderBook> = {};\n';

const rs = (body: string): string => transpiler.transpileRust(HEAD + body + '}\n').content;

const MAP_READ = (name: string, key: string) => `${name}.get("${key}").cloned().unwrap_or(Value::Null)`;
const SHADOW = 'let orderbook = orderbook.as_map().unwrap_or(&__orderbook_empty);';

describe('hx10w9 RP03: get_value on proven map locals (ws order book)', () => {
    test('an OrderBook parameter is shadowed as a map; literal reads are lookups', () => {
        const out = rs('    handleBookDelta(orderbook: OrderBook, delta: Dict) {\n' +
            "        const bids = orderbook['bids'];\n" +
            "        const asks = orderbook['asks'];\n" +
            '        return bids;\n' +
            '    }\n');
        expect(out).toContain('pub fn handleBookDelta(&self, orderbook: Value, delta: Value)');
        expect(out).toContain(SHADOW);
        expect(out).toContain(`let mut bids: Value = ${MAP_READ('orderbook', 'bids')};`);
        expect(out).toContain(`let mut asks: Value = ${MAP_READ('orderbook', 'asks')};`);
        expect(out).not.toContain('get_value(&orderbook');
        expect(out).not.toContain('as_map().and_then');
    });

    test('a dynamic key keeps the helper (and the box)', () => {
        const out = rs('    h(orderbook: OrderBook, k: string) {\n        return orderbook[k];\n    }\n');
        expect(out).not.toContain('__orderbook_empty');
        expect(out).toContain('get_value(&orderbook, &k)');
    });

    test('an escaped OrderBook parameter keeps the box', () => {
        const out = rs('    i(orderbook: OrderBook) {\n        return orderbook;\n    }\n');
        expect(out).not.toContain('__orderbook_empty');
        expect(out).toContain('return orderbook;');
    });

    test('a marker-routed key keeps the helper', () => {
        const out = rs('    j(orderbook: OrderBook) {\n        return orderbook[\'nonce\'];\n    }\n');
        expect(out).not.toContain('__orderbook_empty');
        expect(out).toContain('get_value(&orderbook, &Value::Str("nonce".into()))');
    });

    test('a read-only local from this.orderbooks[sym] is a bare IndexMap', () => {
        const out = rs('    k(sym: string) {\n' +
            "        const ob = this.orderbooks[sym];\n" +
            "        const bids = ob['bids'];\n" +
            '        return bids;\n' +
            '    }\n');
        expect(out).toContain('let mut ob: indexmap::IndexMap<String, Value> = (if let (Some(__m), Some(__k)) = (self.orderbooks.as_map(), sym.as_str())');
        expect(out).toContain(`let mut bids: Value = ${MAP_READ('ob', 'bids')};`);
        expect(out).not.toContain('get_value(&ob');
    });

    test('a read-only local from safeValue(container, key) is a bare IndexMap', () => {
        const out = rs('    l(sym: string) {\n' +
            '        const ob = this.safeValue (this.orderbooks, sym);\n' +
            "        const bids = ob['bids'];\n" +
            '        return bids;\n' +
            '    }\n');
        expect(out).toContain('let mut ob: indexmap::IndexMap<String, Value> = self.safeValue(self.orderbooks, sym)');
        expect(out).toContain(`let mut bids: Value = ${MAP_READ('ob', 'bids')};`);
        expect(out).not.toContain('get_value(&ob');
    });

    test('written and escaped locals keep the box and the helper', () => {
        const written = rs('    m(sym: string, ts: any) {\n' +
            "        const ob = this.orderbooks[sym];\n" +
            "        const bids = ob['bids'];\n" +
            "        ob['nonce'] = ts;\n" +
            '        return bids;\n' +
            '    }\n');
        expect(written).toContain('get_value(&ob, &Value::Str("bids".into()))');
        const escaped = rs('    n(sym: string) {\n' +
            "        const ob = this.orderbooks[sym];\n" +
            "        const bids = ob['bids'];\n" +
            '        return ob;\n' +
            '    }\n');
        expect(escaped).toContain('let mut ob: Value = self.orderbooks');
        expect(escaped).toContain('get_value(&ob, &Value::Str("bids".into()))');
    });
});
