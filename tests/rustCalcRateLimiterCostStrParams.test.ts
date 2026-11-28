import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import Transpiler from '../src/transpiler';

const CR = 'calculateRateLimiterCost (api: string[], method: string, path: string, params: Dict, config: Dict = {})';
const BODY = ' {\n        if (method === \'GET\' && path === \'x\') {\n            return 2;\n        }\n        return this.safeValue (config, \'cost\', 1);\n    }\n';

const mk = (tag: string, venueHead: string, baseHead: string = CR) => {
    const root = fs.mkdtempSync (path.join (os.tmpdir (), `astfx-crlc-${tag}-`));
    fs.mkdirSync (path.join (root, 'ts/src/base'), { recursive: true });
    fs.writeFileSync (path.join (root, 'ts/src/base/Exchange.ts'), 'export interface Dict { [key: string]: any }\nexport default class Exchange {\n    id: string = \'x\';\n    safeValue (o: any, k: any, d: any = undefined): any {\n        return d;\n    }\n    ' + baseHead + ' {\n        return this.safeValue (config, \'cost\', 1);\n    }\n}\n');
    fs.writeFileSync (path.join (root, 'ts/src/venue.ts'), 'import Exchange, { Dict } from \'./base/Exchange.js\';\nexport default class venue extends Exchange {\n    override ' + venueHead + BODY + '}\n');
    const t = new Transpiler ({ 'verbose': false, 'rust': { 'virtualDispatch': {}, 'parser': { 'NUM_LINES_END_FILE': 0 } } });
    return t.transpileRustByPath (path.join (root, 'ts/src/venue.ts')).content;
};

describe ('calculateRateLimiterCost method and path (string in every declaration) print &str', () => {
    test ('every declaration spells them string: the override takes method: &str, path: &str', () => {
        const venue = mk ('ok', CR);
        expect (venue).toMatch (/fn calculateRateLimiterCost\(&(mut )?self, (mut )?api: Value, method: &str, path: &str, /);
    });
    test ('negative: the base spelling method differently keeps method and path Value', () => {
        const venue = mk ('no', CR, CR.replace ('method: string', 'method: any'));
        expect (venue).toMatch (/(mut )?method: Value, /);
    });
    test ('negative: a venue spelling path differently keeps path Value', () => {
        const venue = mk ('venueno', CR.replace ('path: string', 'path: any'));
        expect (venue).toMatch (/(mut )?path: Value, /);
    });
});
