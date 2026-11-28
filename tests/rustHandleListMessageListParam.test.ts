import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import Transpiler from '../src/transpiler';

const HL = 'handleListMessage (client: Client, message: List)';

const mk = (tag: string, venueHead: string, body: string, baseHead: string = HL) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), `astfx-hlm-${tag}-`));
    fs.mkdirSync(path.join(root, 'ts/src/base'), { recursive: true });
    fs.mkdirSync(path.join(root, 'ts/src/pro'), { recursive: true });
    fs.writeFileSync(path.join(root, 'ts/src/base/Exchange.ts'), 'export type List = Array<any>;\nexport class Client { lastPong: number = 0; }\nexport default class Exchange {\n    id: string = \'x\';\n    handleTrades (client: Client, message: any) {}\n    ' + baseHead + ' {}\n}\n');
    fs.writeFileSync(path.join(root, 'ts/src/pro/venue.ts'), 'import Exchange, { Client, List } from \'../base/Exchange.js\';\nexport default class venue extends Exchange {\n    override ' + venueHead + ' {\n' + body + '    }\n}\n');
    const t = new Transpiler({ 'verbose': false, 'rust': { 'virtualDispatch': {}, 'parser': { 'NUM_LINES_END_FILE': 0 } } });
    try {
        return t.transpileRustByPath(path.join(root, 'ts/src/pro/venue.ts')).content;
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
};

const loop = '        for (let i = 0; i < message.length; i++) {\n            this.handleTrades (client, message[i]);\n        }\n';
const handOn = '        this.handleTrades (client, message);\n';

describe('the handleListMessage message parameter (List in every declaration) prints crate::value::List', () => {
    test('every declaration spells it List: the override takes message: crate::value::List and reads the slice', () => {
        const venue = mk('ok', HL, loop);
        expect(venue).toMatch(/fn handleListMessage\(&(mut )?self, (mut )?client: Value, (mut )?message: crate::value::List\)/);
        expect(venue).toMatch(/let message: &\[Value\] = &message;/);
    });
    test('a whole hand-on boxes the shared list by reference', () => {
        const venue = mk('handon', HL, handOn);
        expect(venue).toMatch(/message: crate::value::List\)/);
        expect(venue).toMatch(/Value::from\(&message\)/);
    });
    test('negative: the base spelling it differently keeps message Value', () => {
        const venue = mk('no', HL, loop, HL.replace('message: List', 'message: any'));
        expect(venue).toMatch(/(mut )?message: Value\)/);
        expect(venue).not.toMatch(/crate::value::List\)/);
    });
    test('negative: a venue spelling it differently keeps message Value', () => {
        const venue = mk('venueno', HL.replace('message: List', 'message: any'), loop);
        expect(venue).toMatch(/(mut )?message: Value\)/);
    });
    test('negative: a venue that rebinds message keeps message Value', () => {
        const venue = mk('write', HL, '        message = [];\n' + handOn);
        expect(venue).toMatch(/(mut )?message: Value\)/);
    });
});
