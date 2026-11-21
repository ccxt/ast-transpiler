import fs from 'fs';
import path from 'path';
import { Transpiler, installCcxtGoLocalTypes } from '../src/transpiler';

// entry reads from an ArrayCache hashmap row: the row only ever holds maps, so a comma-ok read replaces SafeMapTyped
describe ('go ArrayCache hashmap row entry reads', () => {
    const root = path.join (__dirname, 'files', 'tmp-h29g08', 'ts', 'src', 'pro');
    const SRC =
        'type Dict = { [key: string]: any };\n' +
        'type Str = string | undefined;\n' +
        'class ArrayCache extends Array<any> { hashmap: { [key: string]: any } = {}; append (x: any) {} }\n' +
        'class Exchange {\n' +
        '    orders: ArrayCache | undefined = undefined;\n' +
        '    safeDict (o: any, k: any, d: any = undefined): any { return o; }\n' +
        '    safeString (o: any, k: any, d: any = undefined): Str { return o; }\n' +
        '}\n' +
        'class venue extends Exchange {\n' +
        '    handleA (parsed: Dict) {\n' +
        '        const symbol = this.safeString (parsed, \'symbol\');\n' +
        '        const orderId = this.safeString (parsed, \'id\');\n' +
        '        const cachedOrders = this.orders;\n' +
        '        const orders = this.safeDict (cachedOrders.hashmap, symbol, {});\n' +
        '        const order = this.safeDict (orders, orderId);\n' +
        '        if (order !== undefined) {\n' +
        '            parsed[\'fee\'] = this.safeDict (order, \'fee\');\n' +
        '        }\n' +
        '    }\n' +
        '    handleB (parsed: Dict, other: Dict) {\n' +
        '        const orderId = this.safeString (parsed, \'id\');\n' +
        '        let rows = this.safeDict (other, \'x\', {});\n' +
        '        rows = this.safeDict (parsed, \'y\', {});\n' +
        '        const order = this.safeDict (rows, orderId);\n' +
        '        return order;\n' +
        '    }\n' +
        '    handleC (parsed: Dict, other: Dict) {\n' +
        '        const orderId = this.safeString (parsed, \'id\');\n' +
        '        const rows = this.safeDict (other, \'hashmap\', {});\n' +
        '        const order = this.safeDict (rows, orderId);\n' +
        '        return order;\n' +
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
    });
    afterAll (() => fs.rmSync (path.join (__dirname, 'files', 'tmp-h29g08'), { recursive: true, force: true }));

    test ('positive: a *string key reads the row entry under a nil check', () => {
        expect (out).toMatch (/var order map\[string\]any\n\s*if orderId != nil \{\n\s*order, _ = orders\[\*orderId\]\.\(map\[string\]any\)\n\s*\}/);
    });

    test ('negative: a reassigned row local is not a cache row', () => {
        expect (out).not.toMatch (/rows\[\*orderId\]/);
    });

    test ('negative: a plain dict member named hashmap is not a cache row', () => {
        const c = out.substring (out.indexOf ('HandleC('));
        expect (c).not.toMatch (/, _ = rows\[/);
    });
});
