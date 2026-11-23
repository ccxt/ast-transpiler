import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import Transpiler from '../src/transpiler';

const HT = 'handleTextMessage (client: Client, message: string)';

const mk = (tag: string, venueHead: string, baseHead: string = HT) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), `astfx-htm-${tag}-`));
    fs.mkdirSync(path.join(root, 'ts/src/base'), { recursive: true });
    fs.mkdirSync(path.join(root, 'ts/src/pro'), { recursive: true });
    fs.writeFileSync(path.join(root, 'ts/src/base/Exchange.ts'), 'export interface Dict { [key: string]: any }\nexport class Client { lastPong: number = 0; }\nexport default class Exchange {\n    id: string = \'x\';\n    milliseconds (): number {\n        return 0;\n    }\n    ' + baseHead + ' {}\n}\n');
    fs.writeFileSync(path.join(root, 'ts/src/pro/venue.ts'), 'import Exchange, { Client } from \'../base/Exchange.js\';\nexport default class venue extends Exchange {\n    override ' + venueHead + ' {\n        if (message === \'pong\') {\n            client.lastPong = this.milliseconds ();\n        }\n    }\n}\n');
    const t = new Transpiler({ 'verbose': false, 'rust': { 'virtualDispatch': {}, 'parser': { 'NUM_LINES_END_FILE': 0 } } });
    return t.transpileRustByPath(path.join(root, 'ts/src/pro/venue.ts')).content;
};

describe('the handleTextMessage message parameter (string in every declaration) prints &str', () => {
    test('every declaration spells it string: the override takes message: &str', () => {
        const venue = mk('ok', HT);
        expect(venue).toMatch(/fn handleTextMessage\(&(mut )?self, (mut )?client: Value, message: &str\)/);
    });
    test('negative: the base spelling it differently keeps message Value', () => {
        const venue = mk('no', HT, HT.replace('message: string', 'message: any'));
        expect(venue).toMatch(/fn handleTextMessage\(&(mut )?self, (mut )?client: Value, (mut )?message: Value\)/);
    });
    test('negative: a venue spelling it differently keeps message Value', () => {
        const venue = mk('venueno', HT.replace('message: string', 'message: any'));
        expect(venue).toMatch(/(mut )?message: Value\)/);
    });
});
