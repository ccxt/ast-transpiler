import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import Transpiler from '../src/transpiler';

const CR = 'calculateFee (symbol: string, type: string, side: string, amount: number, price: number, takerOrMaker = \'taker\', params: Dict = {})';
const BODY = ' {\n        if (symbol === \'BTC/USD\' && side === \'buy\') {\n            return 2;\n        }\n        return this.safeValue (params, \'cost\', 1);\n    }\n';

const mk = (tag: string, venueHead: string, baseHead: string = CR) => {
    const root = fs.mkdtempSync (path.join (os.tmpdir (), `astfx-cfee-${tag}-`));
    fs.mkdirSync (path.join (root, 'ts/src/base'), { recursive: true });
    fs.writeFileSync (path.join (root, 'ts/src/base/Exchange.ts'), 'export interface Dict { [key: string]: any }\nexport default class Exchange {\n    id: string = \'x\';\n    safeValue (o: any, k: any, d: any = undefined): any {\n        return d;\n    }\n    ' + baseHead + ' {\n        return this.safeValue (config, \'cost\', 1);\n    }\n}\n');
    fs.writeFileSync (path.join (root, 'ts/src/venue.ts'), 'import Exchange, { Dict } from \'./base/Exchange.js\';\nexport default class venue extends Exchange {\n    override ' + venueHead + BODY + '}\n');
    const t = new Transpiler ({ 'verbose': false, 'rust': { 'virtualDispatch': {}, 'parser': { 'NUM_LINES_END_FILE': 0 } } });
    return t.transpileRustByPath (path.join (root, 'ts/src/venue.ts')).content;
};

describe ('calculateFee symbol and side (string in every declaration) print &str', () => {
    test ('every declaration spells them string: the override takes symbol: &str, side: &str', () => {
        const venue = mk ('ok', CR);
        expect (venue).toMatch (/fn calculateFee\(&(mut )?self, symbol: &str, (mut )?type_var: Value, side: &str, /);
    });
    test ('negative: the base spelling symbol differently keeps symbol Value', () => {
        const venue = mk ('no', CR, CR.replace ('symbol: string', 'symbol: any'));
        expect (venue).toMatch (/(mut )?symbol: Value, /);
    });
    test ('negative: a venue spelling side Str keeps side Value', () => {
        const venue = mk ('venueno', CR.replace ('side: string', 'side: Str'));
        expect (venue).toMatch (/(mut )?side: Value, /);
    });
});
