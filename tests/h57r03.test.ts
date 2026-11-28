import fs from 'fs';
import os from 'os';
import path from 'path';
import Transpiler from '../src/transpiler.js';

// A literal-key read of a proven dict local inside the value of its own plain reassignment is the map's own lookup.
describe('a dict local read inside its own reassignment reads the map natively', () => {
    const build = (name: string, init: string, body: string, file = 'ts/src/venue.ts') => {
        const files: Record<string, string> = {
            'ts/src/base/types.ts': "export type Dict = { [key: string]: any };\nexport type Str = string | undefined;\n",
            'ts/src/base/Exchange.ts': "import type { Dict, Str } from './types.js';\nexport default class Exchange {\n    options: Dict = {};\n    safeDict (o: any, k: any, d: Dict = undefined): Dict { return o; }\n    safeString (o: any, k: any, d: string = undefined): string { return o; }\n    retrieveDydxCredentials (privateKey: Str): object { return { 'privateKey': privateKey, 'publicKey': privateKey }; }\n    loose (x: any): any { return x; }\n    binaryToBase16 (b: any): string { return b; }\n}\n",
        };
        files[file] = "import Exchange from '" + (file.includes ('/test/') ? '../' : './') + "base/Exchange.js';\nimport type { Dict } from '" + (file.includes ('/test/') ? '../' : './') + "base/types.js';\nexport default class venue extends Exchange {\n    retrieveCredentials (): Dict {\n        let credentials = " + init + ";\n" + body + "        this.options['dydxCredentials'] = credentials;\n        return this.safeDict (this.options, 'dydxCredentials', {});\n    }\n}\n";
        const root = fs.mkdtempSync (path.join (os.tmpdir (), 'astfx-rs-h57r03-' + name + '-'));
        for (const [ rel, text ] of Object.entries (files)) {
            fs.mkdirSync (path.dirname (path.join (root, rel)), { recursive: true });
            fs.writeFileSync (path.join (root, rel), text);
        }
        const out = new Transpiler ({ 'verbose': false }).transpileRustByPath (path.join (root, file)).content;
        fs.rmSync (root, { recursive: true, force: true });
        return out;
    };
    const rewrite = "        credentials = {\n            'privateKey': this.binaryToBase16 (credentials['privateKey']),\n            'publicKey': this.binaryToBase16 (credentials['publicKey']),\n        };\n";
    const native = 'credentials.as_map().and_then(|__m| __m.get("privateKey")).cloned().unwrap_or(Value::Null)';
    test('a base dict producer local reads both keys natively', () => {
        const out = build ('a', "this.retrieveDydxCredentials ('k')", rewrite);
        expect (out).toContain ('let mut credentials: Value = ');
        expect (out).toContain ('self.binaryToBase16(' + native + ', &[])');
        expect (out).toContain ('credentials.as_map().and_then(|__m| __m.get("publicKey")).cloned().unwrap_or(Value::Null)');
        expect (out).not.toContain ('get_value_k(&credentials');
    });
    test('a safeDict seed reassigned by the producer reads natively too', () => {
        const out = build ('b', "this.safeDict (this.options, 'dydxCredentials')", "        credentials = this.retrieveDydxCredentials ('k');\n" + rewrite);
        expect (out).toContain (native);
        expect (out).not.toContain ('get_value_k(&credentials');
    });
    test('a local with an unproven source keeps the helper read', () => {
        const out = build ('c', "this.loose ('k')", rewrite);
        expect (out).toContain ('crate::value::get_value_k(&credentials, "privateKey")');
        expect (out).not.toContain ('credentials.as_map()');
    });
    test('a store-routed key keeps the helper read', () => {
        const out = build ('d', "this.retrieveDydxCredentials ('k')", "        credentials = {\n            'symbol': this.binaryToBase16 (credentials['symbol']),\n        };\n");
        expect (out).toContain ('crate::value::get_value_k(&credentials, "symbol")');
    });
    test('a keyed write of the same local keeps the helper read', () => {
        const out = build ('e', "this.retrieveDydxCredentials ('k')", "        credentials['privateKey'] = this.binaryToBase16 (credentials['privateKey']);\n");
        expect (out).not.toContain (native);
    });
    test('a test-tier source keeps the helper read', () => {
        const out = build ('f', "this.retrieveDydxCredentials ('k')", rewrite, 'ts/src/test/venue.ts');
        expect (out).not.toContain (native);
    });
});

// An entry read out of a typed dict local that only stores object literals is such a literal or absent: its literal-key read is the map's own lookup.
describe('an entry of a literal-only dict local reads its key natively', () => {
    const build = (name: string, store: string, read: string, extra = '') => {
        const files: Record<string, string> = {
            'ts/src/base/types.ts': "export type Dict = { [key: string]: any };\n",
            'ts/src/base/Exchange.ts': "import type { Dict } from './types.js';\nexport default class Exchange {\n    events: Dict = {};\n    loose (x: any): any { return x; }\n    safeString (o: any, k: any, d: string = undefined): string { return o; }\n}\n",
            'ts/src/venue.ts': "import Exchange from './base/Exchange.js';\nimport type { Dict } from './base/types.js';\nexport default class venue extends Exchange {\n    collect (rows: any[]) {\n        const eventsDict: Dict = {};\n        for (let i = 0; i < rows.length; i++) {\n            const m = rows[i];\n            const eventKey = this.safeString (m, 'title', '');\n            if (!(eventKey in eventsDict)) {\n                eventsDict[eventKey] = " + store + ";\n            }\n" + extra + "            const eventEntry = eventsDict[eventKey];\n            const entryMarkets: any[] = eventEntry[" + read + "];\n            entryMarkets.push (m);\n            eventEntry['markets'] = entryMarkets;\n        }\n        this.events = eventsDict;\n    }\n}\n",
        };
        const root = fs.mkdtempSync (path.join (os.tmpdir (), 'astfx-rs-h57r03b-' + name + '-'));
        for (const [ rel, text ] of Object.entries (files)) {
            fs.mkdirSync (path.dirname (path.join (root, rel)), { recursive: true });
            fs.writeFileSync (path.join (root, rel), text);
        }
        const out = new Transpiler ({ 'verbose': false }).transpileRustByPath (path.join (root, 'ts/src/venue.ts')).content;
        fs.rmSync (root, { recursive: true, force: true });
        return out;
    };
    const literal = "{ 'id': eventKey, 'markets': [] }";
    const native = 'eventEntry.as_map().and_then(|__m| __m.get("markets")).cloned().unwrap_or(Value::Null)';
    test('the literal-only bucket entry reads natively', () => {
        const out = build ('a', literal, "'markets'");
        expect (out).toContain (native);
        expect (out).not.toContain ('get_value_k(&eventEntry');
    });
    test('a bucket that also stores an unproven value keeps the helper read', () => {
        const out = build ('b', "this.loose (m)", "'markets'");
        expect (out).not.toContain (native);
    });
    test('a second, non-literal store keeps the helper read', () => {
        const out = build ('c', literal, "'markets'", "            eventsDict['other'] = m;\n");
        expect (out).not.toContain (native);
    });
    test('a store-routed key keeps the helper read', () => {
        const out = build ('d', "{ 'id': eventKey, 'symbol': [] }", "'symbol'");
        expect (out).not.toContain ('eventEntry.as_map().and_then(|__m| __m.get("symbol"))');
    });
    test('a literal carrying a marker key keeps the helper read', () => {
        const out = build ('e', "{ '__live_id': eventKey, 'markets': [] }", "'markets'");
        expect (out).not.toContain (native);
    });
});
