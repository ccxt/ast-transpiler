import { Transpiler } from '../src/transpiler';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// a no-default `safeDict` row of a pro `indexBy (..)` local reads the fresh runtime map natively
const base = 'export interface Dict { [key: string]: any }\nexport type Str = string | undefined;\n' +
    'export default class Exchange {\n    // METHODS BELOW THIS LINE ARE TRANSPILED FROM TYPESCRIPT\n' +
    '    safeDict (o: any, k: any, d: Dict = undefined): Dict | undefined { return o; }\n' +
    '    safeString (o: any, k: any, d: Str = undefined): Str { return o; }\n' +
    '    indexBy (x: any, k: any): Dict { return {}; }\n}\n';
const client = 'export default class Client {\n    subscriptions: any;\n}\n';
const venue = "import Exchange from '../base/Exchange.js';\nimport Client from '../base/ws/Client.js';\nimport type { Dict } from '../base/Exchange.js';\n" +
    'export default class venue extends Exchange {\n' +
    "    handleA (client: Client, message: any) {\n        const id = this.safeString (message, 'id');\n        const subscriptionsById = this.indexBy (client.subscriptions, 'id');\n        const subscription = this.safeDict (subscriptionsById, id);\n        if (subscription === undefined) {\n            return undefined;\n        }\n        return this.safeString (subscription, 'x');\n    }\n" +
    "    handleB (client: Client, message: any) {\n        const id = this.safeString (message, 'id');\n        const subs = client.subscriptions;\n        const subscription = this.safeDict (subs, id);\n        return this.safeString (subscription, 'x');\n    }\n" +
    "    handleC (client: Client, message: any) {\n        const id = this.safeString (message, 'id');\n        let byId = this.indexBy (client.subscriptions, 'id');\n        byId = client.subscriptions;\n        const subscription = this.safeDict (byId, id);\n        return this.safeString (subscription, 'x');\n    }\n}\n";

describe ('rust pro indexBy local: keyed safeDict reads the map natively', () => {
    let output = '';
    beforeAll (() => {
        const root = fs.mkdtempSync (path.join (os.tmpdir (), 'h49r56-'));
        fs.mkdirSync (path.join (root, 'ts', 'src', 'base', 'ws'), { recursive: true });
        fs.mkdirSync (path.join (root, 'ts', 'src', 'pro'), { recursive: true });
        fs.writeFileSync (path.join (root, 'ts', 'src', 'base', 'Exchange.ts'), base);
        fs.writeFileSync (path.join (root, 'ts', 'src', 'base', 'ws', 'Client.ts'), client);
        fs.writeFileSync (path.join (root, 'ts', 'src', 'pro', 'venue.ts'), venue);
        const t = new Transpiler ({ 'verbose': false, 'rust': { 'parser': { 'NUM_LINES_END_FILE': 0 } } } as any);
        output = t.transpileRustByPath (path.join (root, 'ts', 'src', 'pro', 'venue.ts')).content;
        fs.rmSync (root, { recursive: true, force: true });
    });
    test ('the indexBy local row is a native map get (missing / non-map -> None)', () => {
        expect (output).toMatch (/fn handleA[\s\S]*?let mut subscription: Option<crate::value::Dict> = \(if let Some\(Value::Dict\(__m\)\) = subscriptionsById\.get\(id\.as_deref\(\)\.unwrap_or\("null"\)\) \{ Some\(std::sync::Arc::clone\(__m\)\) \} else \{ None \}\);/);
    });
    test ('negatives: a subscriptions alias and a reassigned let keep the boxed read', () => {
        const b = output.slice (output.indexOf ('fn handleB'), output.indexOf ('fn handleC'));
        const c = output.slice (output.indexOf ('fn handleC'));
        expect (b).not.toContain ('if let Some(Value::Dict(__m))');
        expect (c).not.toContain ('if let Some(Value::Dict(__m))');
    });
});
