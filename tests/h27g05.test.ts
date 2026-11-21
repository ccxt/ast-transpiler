import fs from 'fs';
import path from 'path';
import * as os from 'os';
import { Transpiler, installCcxtGoLocalTypes } from '../src/transpiler';

const HEAD =
    'type Dict = { [key: string]: any };\n' +
    'type Num = number | undefined;\n' +
    'export class ex {\n' +
    '    safeNumber (o: any, k: any, d: any = undefined): Num { return 1; }\n' +
    '    safeString (o: any, k: any, d: any = undefined): string | undefined { return undefined; }\n' +
    '    other (x: any): any { return x; }\n';
const print = (body: string): string => {
    const dir = fs.mkdtempSync (path.join (os.tmpdir (), 'h27g05-'));
    fs.mkdirSync (path.join (dir, 'ts', 'src'), { recursive: true });
    fs.writeFileSync (path.join (dir, 'ts', 'src', 'ex.ts'), HEAD + body + '}\n');
    const cwd = process.cwd ();
    try {
        process.chdir (dir);
        const x = new Transpiler ({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 } } });
        installCcxtGoLocalTypes (x.goTranspiler);
        return x.transpileGoByPath ('ts/src/ex.ts').content;
    } finally {
        process.chdir (cwd);
        fs.rmSync (dir, { recursive: true, force: true });
    }
};
const method = (write: string, extra = ''): string =>
    '    p (trade: Dict) {\n' +
    "        const price = this.safeNumber (trade, 'price');\n" +
    "        const amount = this.safeNumber (trade, 'amount');\n" +
    '        let cost: Num = undefined;\n' +
    '        if ((price !== undefined) && (amount !== undefined)) {\n' +
    '            ' + write + '\n' +
    '        }\n' + extra +
    '        return {\n' +
    "            'price': price,\n" +
    "            'cost': cost,\n" +
    '        };\n' +
    '    }\n';

describe ('h27-g05: nil-seeded Num locals joined as *float64', () => {
    test ('a float64 product write types the local *float64 through a fresh temp', () => {
        const out = print (method ('cost = price * amount;'));
        expect (out).toContain ('var cost *float64 = nil');
        expect (out).toContain ('costValue := (*price * *amount)');
        expect (out).toContain ('cost = &costValue');
        expect (out).not.toContain ('var cost any');
        expect (out).not.toContain ('Multiply(');
    });
    test ('a safeNumber write is stored as the pointer itself', () => {
        const out = print (method ("cost = this.safeNumber (trade, 'cost');"));
        expect (out).toContain ('var cost *float64 = nil');
        expect (out).not.toContain ('costValue');
    });
    test ('negative: a product of an operand the guard does not narrow keeps the box (nil deref)', () => {
        const out = print (method ('cost = price * amount;').replace ('(price !== undefined) && (amount !== undefined)', 'price !== undefined'));
        expect (out).toContain ('var cost any = nil');
        expect (out).not.toContain ('*amount');
    });
    test ('negative: a write of a boxed value keeps the box', () => {
        const out = print (method ("cost = this.other (trade);"));
        expect (out).toContain ('var cost any = nil');
    });
    test ('negative: an element store into a request map keeps the box (typed-nil trap)', () => {
        const out = print (method ('cost = price * amount;', "        const request: Dict = {};\n        request['cost'] = cost;\n"));
        expect (out).toContain ('var cost any = nil');
    });
    test ('negative: a lone value in an object literal keeps the box', () => {
        const body = method ('cost = price * amount;').replace ("            'price': price,\n", "            'id': this.safeString (trade, 'id'),\n");
        const out = print (body);
        expect (out).toContain ('var cost any = nil');
    });
});
