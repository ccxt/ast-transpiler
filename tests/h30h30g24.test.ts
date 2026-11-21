import fs from 'fs';
import path from 'path';
import { Transpiler, installCcxtGoLocalTypes } from '../src/transpiler';

// entry reads from an ArrayCache hashmap row in more statement shapes: `{}` default, `let` local, ternary arm
describe ('go ArrayCache hashmap row entry reads (h30g24)', () => {
    const root = path.join (__dirname, 'files', 'tmp-h30g24', 'ts', 'src', 'pro');
    const SRC =
        'type Dict = { [key: string]: any };\n' +
        'type Str = string | undefined;\n' +
        'class ArrayCache extends Array<any> { hashmap: { [key: string]: any } = {}; append (x: any) {} }\n' +
        'class Exchange {\n' +
        '    orders: ArrayCache | undefined = undefined;\n' +
        '    safeDict (o: any, k: any, d: any = undefined): any { return o; }\n' +
        '    safeDictN (o: any, k: any, d: any = undefined): any { return o; }\n' +
        '    safeString (o: any, k: any, d: any = undefined): Str { return o; }\n' +
        '}\n' +
        'class venue extends Exchange {\n' +
        '    handleA (parsed: Dict, ids: string[]) {\n' +
        '        const cachedOrders = this.orders;\n' +
        '        const symbol = this.safeString (parsed, \'symbol\');\n' +
        '        const ordersById = this.safeDict (cachedOrders.hashmap, symbol, {});\n' +
        '        for (let j = 0; j < ids.length; j++) {\n' +
        '            const cachedId = ids[j];\n' +
        '            const cachedOrder = this.safeDict (ordersById, cachedId, {});\n' +
        '            parsed[cachedId] = this.safeString (cachedOrder, \'status\');\n' +
        '        }\n' +
        '    }\n' +
        '    handleB (parsed: Dict) {\n' +
        '        const symbol = this.safeString (parsed, \'symbol\');\n' +
        '        const orderId = this.safeString (parsed, \'id\');\n' +
        '        if (this.orders === undefined) {\n' +
        '            return;\n' +
        '        }\n' +
        '        const orders = this.orders;\n' +
        '        const previousOrders = this.safeDict (orders.hashmap, symbol, {});\n' +
        '        let previousOrder = this.safeDict (previousOrders, orderId);\n' +
        '        if (previousOrder === undefined) {\n' +
        '            previousOrder = this.safeDictN (previousOrders, [ orderId ]);\n' +
        '        }\n' +
        '        return previousOrder;\n' +
        '    }\n' +
        '    handleC (parsed: Dict) {\n' +
        '        const symbol = this.safeString (parsed, \'symbol\');\n' +
        '        const orderId = this.safeString (parsed, \'id\');\n' +
        '        const cachedOrders = this.orders;\n' +
        '        const orders = this.safeDict (cachedOrders.hashmap, symbol, {});\n' +
        '        const order = (orderId === undefined) ? undefined : this.safeDict (orders, orderId);\n' +
        '        if (order !== undefined) {\n' +
        '            parsed[\'fee\'] = this.safeDict (order, \'fee\');\n' +
        '        }\n' +
        '    }\n' +
        '    handleD (parsed: Dict, other: Dict, ids: string[]) {\n' +
        '        const rows = this.safeDict (other, \'hashmap\', {});\n' +
        '        const cachedId = ids[0];\n' +
        '        const cachedOrder = this.safeDict (rows, cachedId, {});\n' +
        '        return cachedOrder;\n' +
        '    }\n' +
        '}\n';
    let out = '';
    beforeAll (() => {
        fs.mkdirSync (root, { recursive: true });
        const file = path.join (root, 'venue.ts');
        fs.writeFileSync (file, SRC);
        const t: any = new Transpiler ({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 }, 'asyncMethodSuffix': 'Async' } });
        installCcxtGoLocalTypes (t.goTranspiler);
        out = t.transpileGoByPath (file).content;
        fs.writeFileSync (path.join (__dirname, '..', '..', '..', 'campaigns', 'hx12', 'work', 'h30', 'tmp-H30-G24', 'out.go'), out);
    });
    afterAll (() => fs.rmSync (path.join (__dirname, 'files', 'tmp-h30g24'), { recursive: true, force: true }));

    test ('positive: a {}-defaulted entry read with a string key', () => {
        expect (out).toMatch (/var cachedOrder, _ = ordersById\[cachedId\]\.\(map\[string\]any\)\n/);
        expect (out).not.toMatch (/SafeMapTyped\(ordersById/);
    });

    test ('negative: a plain dict member named hashmap (not an ArrayCache) keeps the defaulted reader', () => {
        expect (out).not.toMatch (/rows\[/);
    });

    test ('negative: a let entry local (reassigned from another reader) is not converted', () => {
        expect (out).not.toMatch (/previousOrder, _ =/);
    });
});
