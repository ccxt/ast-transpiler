import fs from 'fs';
import path from 'path';
import { Transpiler } from '../src/transpiler';

describe ('rust ws string-list parameters stay lent slices through their callees', () => {
    const root = path.join (__dirname, 'files', 'tmp-h21r04', 'ts', 'src');
    const base = 'export class Exchange {\n    split (s: string): string[] { return [ s ]; }\n    inArray (needle: any, haystack: any): boolean { return false; }\n'
        + '    async watchMultiple (url: string, messageHashes: string[], message = undefined, subscribeHashes = undefined, subscription = undefined): Promise<any> { return undefined; }\n}\n';
    const print = (venue: string): string => {
        fs.mkdirSync (path.join (root, 'base'), { recursive: true });
        fs.mkdirSync (path.join (root, 'pro'), { recursive: true });
        fs.writeFileSync (path.join (root, 'base', 'Exchange.ts'), base);
        fs.writeFileSync (path.join (root, 'pro', 'venue.ts'), "import { Exchange } from '../base/Exchange';\nexport default class venue extends Exchange {\n" + venue + '}\n');
        const t = new Transpiler ({ verbose: false, rust: {} });
        return t.transpileRustByPath (path.join (root, 'pro', 'venue.ts')).content;
    };
    afterAll (() => fs.rmSync (path.join (__dirname, 'files', 'tmp-h21r04'), { recursive: true, force: true }));

    const pending = '    async waitPending (url: string, hashes: string[]) {\n        const held = this.split (url);\n        for (let j = 0; j < held.length; j++) {\n            if (this.inArray (held[j], hashes)) {\n                return true;\n            }\n        }\n        return false;\n    }\n';
    const missing = '    missingOf (url: string, channels: string[]): number[] {\n        const result: number[] = [];\n        for (let i = 0; i < channels.length; i++) {\n            if (channels[i] === url) {\n                result.push (i);\n            }\n        }\n        return result;\n    }\n';
    const at = '    async dropAt (url: string, channels: string[], index: number) {\n        const channel = channels[index];\n        return channel;\n    }\n';
    const sub = '    async subscribeAll (url: string, messageHashes: string[], channels: string[]) {\n        await this.waitPending (url, channels);\n        const missing = this.missingOf (url, channels);\n'
        + '        if (missing.length === 0) {\n            return await this.watchMultiple (url, messageHashes, undefined, channels);\n        }\n        const index = missing[0];\n        await this.dropAt (url, channels, index);\n'
        + '        return await this.watchMultiple (url, messageHashes, {}, [ channels[index] ]);\n    }\n';
    const callers = '    async run (s: string) {\n        const hashes = this.split (s);\n        await this.waitPending (s, [ s ]);\n        return await this.subscribeAll (s, hashes, hashes);\n    }\n';

    test ('lists handed on to slice slots, base readers and number-keyed reads print lent slices', () => {
        const out = print (pending + missing + at + sub + callers);
        expect (out).toContain ('hashes: &[crate::Value]');
        expect (out).toContain ('channels: &[crate::Value]');
        expect (out).toContain ('messageHashes: &[crate::Value]');
        expect (out).not.toMatch (/get_value\(&channels/);
        expect (out).not.toContain ('hashes.clone()');
        expect (out).toContain ('self.waitPending(s.as_str().unwrap_or_default(), &[s.clone()])');
    });

    test ('negatives keep the box', () => {
        // the list handed whole to a plain `any` slot
        const keep = print ('    keep (x: any) {\n        return x;\n    }\n' + '    async waitPending (url: string, hashes: string[]) {\n        this.keep (hashes);\n        return hashes.length;\n    }\n'
            + '    async run (s: string) {\n        const held = this.split (s);\n        return await this.waitPending (s, held);\n    }\n');
        expect (keep).not.toContain ('hashes: &[crate::Value]');
        // only array literals at the callers: nothing held to lend
        const literal = print ('    async waitPending (url: string, hashes: string[]) {\n        return hashes.length;\n    }\n    async run (s: string) {\n        return await this.waitPending (s, [ s ]);\n    }\n');
        expect (literal).not.toContain ('&[crate::Value]');
        // a string-typed key cannot index the slice
        const strKey = print ('    pick (names: string[], k: string) {\n        return names[k];\n    }\n    run (s: string) {\n        const held = this.split (s);\n        return this.pick (held, s);\n    }\n');
        expect (strKey).not.toContain ('names: &[crate::Value]');
    });
});
