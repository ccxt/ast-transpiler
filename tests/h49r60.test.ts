import { Transpiler } from '../src/transpiler';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// a `this.client (url)` local whose subscriptions read after a whole-key write is a synced safe read is the handle
const files: Record<string, string> = {
    'ts/src/base/ws/Client.ts': 'export default class Client {\n    url: string;\n    subscriptions: any;\n    futures: any;\n    resolve (result: any, messageHash: string): any { return result; }\n    send (message: any): any { return message; }\n}\n',
    'ts/src/base/ws/WsClient.ts': "import Client from './Client.js';\nexport default class WsClient extends Client {\n}\n",
    'ts/src/base/Exchange.ts': "import WsClient from './ws/WsClient.js';\nexport default class Exchange {\n    client (url: string): WsClient { return new WsClient (); }\n    safeValue (obj: any, key: any): any { return obj[key]; }\n    async loadMarkets (): Promise<any> { return {}; }\n}\n",
    'ts/src/pro/venue.ts': "import Exchange from '../base/Exchange.js';\nexport default class venue extends Exchange {\n" +
        // positive: write the key, then read it back with no await in between
        "    subscribeOne (url: string, key: string) {\n        const client = this.client (url);\n        if (!(key in client.subscriptions)) {\n            client.subscriptions[key] = {};\n        }\n        const stored = this.safeValue (client.subscriptions, key);\n        client.send ({ 'op': 'sub' });\n        return stored;\n    }\n" +
        // negative: an await between the write and the read keeps the boxed client
        "    async subscribeTwo (url: string, key: string) {\n        const client = this.client (url);\n        client.subscriptions[key] = {};\n        await this.loadMarkets ();\n        const stored = this.safeValue (client.subscriptions, key);\n        return stored;\n    }\n}\n",
};

describe ('rust ws client local with a synced subscriptions read', () => {
    let out = '';
    beforeAll (() => {
        const root = fs.mkdtempSync (path.join (os.tmpdir (), 'h49r60-'));
        for (const [ rel, text ] of Object.entries (files)) {
            fs.mkdirSync (path.dirname (path.join (root, rel)), { recursive: true });
            fs.writeFileSync (path.join (root, rel), text);
        }
        const t = new Transpiler ({ 'verbose': false, 'rust': { 'parser': { 'NUM_LINES_END_FILE': 0 } } } as any);
        out = t.transpileRustByPath (path.join (root, 'ts', 'src', 'pro', 'venue.ts')).content;
        fs.rmSync (root, { recursive: true, force: true });
    });

    test ('the client is declared as the handle', () => {
        const one = out.slice (out.indexOf ('fn subscribeOne'), out.indexOf ('fn subscribeTwo'));
        expect (one).toContain ('let mut client: crate::pro::ws_client::ClientHandle = crate::pro::ws_client::ClientHandle::from_value(&self.client(');
        expect (one).not.toMatch (/let (?:mut )?client: Value/);
    });

    test ('negative: an await before the read keeps the Value local', () => {
        const two = out.slice (out.indexOf ('fn subscribeTwo'));
        expect (two).not.toContain ('client: crate::pro::ws_client::ClientHandle = ');
    });
});
