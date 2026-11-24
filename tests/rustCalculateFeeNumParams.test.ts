import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import Transpiler from '../src/transpiler';

const CR = 'calculateFee (symbol: string, type: string, side: string, amount: number, price: number, takerOrMaker = \'taker\', params: Dict = {})';
const BODY = ' {\n        const a = this.numberToString (amount);\n        const p = this.numberToString (price);\n        return { \'cost\': this.amountToPrecision (symbol, amount), \'a\': a, \'p\': p };\n    }\n';
const BASE = ' {\n        return this.calculateFeeWithRate (symbol, type, side, amount, price, takerOrMaker, undefined, params);\n    }\n    calculateFeeWithRate (symbol: string, type: string, side: string, amount: number, price: number, takerOrMaker = \'taker\', feeRate: Num = undefined, params: Dict = {}) {\n        return this.safeValue (params, \'cost\', amount);\n    }\n';

const mk = (tag: string, venueHead: string, baseHead: string = CR) => {
    const root = fs.mkdtempSync (path.join (os.tmpdir (), `astfx-cfeen-${tag}-`));
    fs.mkdirSync (path.join (root, 'ts/src/base'), { recursive: true });
    fs.writeFileSync (path.join (root, 'ts/src/base/Exchange.ts'), 'export interface Dict { [key: string]: any }\nexport type Num = number | undefined;\nexport default class Exchange {\n    id: string = \'x\';\n    safeValue (o: any, k: any, d: any = undefined): any {\n        return d;\n    }\n    numberToString (x: any): string {\n        return String (x);\n    }\n    amountToPrecision (symbol: string, amount: any): string {\n        return String (amount);\n    }\n    ' + baseHead + BASE + '}\n');
    fs.writeFileSync (path.join (root, 'ts/src/venue.ts'), 'import Exchange, { Dict, Num } from \'./base/Exchange.js\';\nexport default class venue extends Exchange {\n    override ' + venueHead + BODY + '}\n');
    const t = new Transpiler ({ 'verbose': false, 'rust': { 'virtualDispatch': {}, 'parser': { 'NUM_LINES_END_FILE': 0 } } });
    return {
        'venue': t.transpileRustByPath (path.join (root, 'ts/src/venue.ts')).content,
        'base': t.transpileRustByPath (path.join (root, 'ts/src/base/Exchange.ts')).content,
    };
};

describe ('calculateFee amount and price (number in every declaration) print f64', () => {
    test ('every declaration spells them number: amount: f64, price: f64, no Value binding', () => {
        const { venue, base } = mk ('ok', CR);
        expect (venue).toMatch (/fn calculateFee\(&(mut )?self, symbol: &str, (mut )?type_var: Value, side: &str, amount: f64, price: f64, /);
        expect (venue).not.toMatch (/let mut (amount|price): Value/);
        expect (base).toMatch (/calculateFeeWithRate\(symbol, type_var, side, Value::from\(amount\), Value::from\(price\), /);
    });
    test ('negative: the base spelling amount differently keeps amount Value', () => {
        const { venue } = mk ('no', CR, CR.replace ('amount: number', 'amount: any'));
        expect (venue).toMatch (/(mut )?amount: Value, /);
    });
    test ('negative: a venue spelling price Num keeps price Value', () => {
        const { venue } = mk ('venueno', CR.replace ('price: number', 'price: Num'));
        expect (venue).toMatch (/(mut )?price: Value, /);
    });
});
