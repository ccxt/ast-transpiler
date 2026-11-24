import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import Transpiler from '../src/transpiler';

const SE = 'signEvmTransaction (tx: Dict, privateKey: string): string';
const BODY = ' {\n        return this.remove0xPrefix (privateKey) + this.safeString (tx, \'to\', \'\');\n    }\n';

const mk = (tag: string, venueHead: string, baseHead: string = SE) => {
    const root = fs.mkdtempSync (path.join (os.tmpdir (), `astfx-sevm-${tag}-`));
    fs.mkdirSync (path.join (root, 'ts/src/base'), { recursive: true });
    fs.mkdirSync (path.join (root, 'ts/src/prediction'), { recursive: true });
    fs.writeFileSync (path.join (root, 'ts/src/base/Exchange.ts'), 'export interface Dict { [key: string]: any }\nexport default class Exchange {\n    id: string = \'x\';\n    remove0xPrefix (hexData: any): string {\n        return hexData;\n    }\n    safeString (o: any, k: any, d: any = undefined): any {\n        return d;\n    }\n    ' + baseHead + ' {\n        return \'\';\n    }\n}\n');
    fs.writeFileSync (path.join (root, 'ts/src/prediction/venue.ts'), 'import Exchange, { Dict } from \'../base/Exchange.js\';\nexport default class venue extends Exchange {\n    override ' + venueHead + BODY + '}\n');
    const t = new Transpiler ({ 'verbose': false, 'rust': { 'virtualDispatch': {}, 'parser': { 'NUM_LINES_END_FILE': 0 } } });
    return t.transpileRustByPath (path.join (root, 'ts/src/prediction/venue.ts')).content;
};

describe ('signEvmTransaction privateKey (string in every declaration) prints &str', () => {
    test ('every declaration spells it string: the override takes privateKey: &str', () => {
        const venue = mk ('ok', SE);
        expect (venue).toMatch (/fn signEvmTransaction\(&(mut )?self, (mut )?tx: (Value|&indexmap::IndexMap<String, Value>), privateKey: &str\)/);
    });
    test ('negative: the base spelling it differently keeps privateKey Value', () => {
        const venue = mk ('no', SE, SE.replace ('privateKey: string', 'privateKey: any'));
        expect (venue).toMatch (/(mut )?privateKey: Value\)/);
    });
    test ('negative: a venue spelling it Str keeps privateKey Value', () => {
        const venue = mk ('venueno', SE.replace ('privateKey: string', 'privateKey: Str'));
        expect (venue).toMatch (/(mut )?privateKey: Value\)/);
    });
});
