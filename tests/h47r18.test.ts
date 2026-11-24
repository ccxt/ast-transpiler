import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import Transpiler from '../src/transpiler';

const CS = 'async createSubAccount (name: string, params: Dict = {})';
const BODY = ' {\n        const action: Dict = {\n            \'type\': \'createSubAccount\',\n            \'name\': name,\n        };\n        return action;\n    }\n';

const mk = (tag: string, venueHead: string, baseHead: string = CS) => {
    const root = fs.mkdtempSync (path.join (os.tmpdir (), `astfx-csa-${tag}-`));
    fs.mkdirSync (path.join (root, 'ts/src/base'), { recursive: true });
    fs.writeFileSync (path.join (root, 'ts/src/base/Exchange.ts'), 'export interface Dict { [key: string]: any }\nexport default class Exchange {\n    id: string = \'x\';\n    ' + baseHead + ' {\n        return {};\n    }\n}\n');
    fs.writeFileSync (path.join (root, 'ts/src/venue.ts'), 'import Exchange, { Dict } from \'./base/Exchange.js\';\nexport default class venue extends Exchange {\n    override ' + venueHead + BODY + '}\n');
    const t = new Transpiler ({ 'verbose': false, 'rust': { 'virtualDispatch': {}, 'parser': { 'NUM_LINES_END_FILE': 0 } } });
    return t.transpileRustByPath (path.join (root, 'ts/src/venue.ts')).content;
};

describe ('createSubAccount name (string in every declaration) prints &str', () => {
    test ('every declaration spells it string: the override takes name: &str', () => {
        const venue = mk ('ok', CS);
        expect (venue).toMatch (/fn create_?[sS]ub_?[aA]ccount\(&(mut )?self, name: &str, /);
        expect (venue).not.toMatch (/(mut )?name: Value, /);
    });
    test ('negative: the base spelling name differently keeps name Value', () => {
        const venue = mk ('no', CS, CS.replace ('name: string', 'name: any'));
        expect (venue).toMatch (/(mut )?name: Value, /);
    });
    test ('negative: a venue spelling name Str keeps name Value', () => {
        const venue = mk ('venueno', CS.replace ('name: string', 'name: Str'));
        expect (venue).toMatch (/(mut )?name: Value, /);
    });
});
