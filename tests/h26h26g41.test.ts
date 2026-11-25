import fs from 'fs';
import path from 'path';
import { printVenue } from './h22g01.test';

const producer = (ret: string, extra = '') =>
    '    async fetchRawThing (id: string, params: Dict = {}): Promise<Dict> {\n' +
    "        const request: Dict = { 'id': id };\n" + extra + '        return ' + ret + ';\n    }\n';
const consumer = (decl: string, use: string) =>
    '    async fetchThing (id: string, params: Dict = {}) {\n' +
    '        ' + decl + ' thing = await this.fetchRawThing (id, params);\n' + use + '\n    }\n';

describe ('h26g41: awaited never-nil Promise<Dict> result bound to a const local', () => {
    afterAll (() => fs.rmSync (path.join (__dirname, 'files', 'tmp-h22g01-' + (process.env.JEST_WORKER_ID || '0')), { recursive: true, force: true }));
    test ('an extend-returning producer types the local as a map', () => {
        const out = printVenue (producer ('this.extend (request, params)') + consumer ('const', '        return [ thing ];'));
        expect (out).toContain ('var thing map[string]any = MapTyped(PanicOnError((<-this.FetchRawThingAsync(id, params))))');
    });
    test ('a const local seeded by an object literal is proven too', () => {
        const out = printVenue (producer ('envelope', "        const envelope: Dict = { 'op': request };\n") + consumer ('const', '        return [ thing ];'));
        expect (out).toContain ('var thing map[string]any = MapTyped(');
    });
    test ('a producer that can return a safe read (maybe nil) keeps the box', () => {
        const out = printVenue (producer ("this.safeDict (params, 'x')") + consumer ('const', '        return [ thing ];'));
        expect (out).not.toContain ('var thing map[string]any');
    });
    test ('a rebound producer local keeps the box', () => {
        const out = printVenue (producer ('envelope', "        let envelope: Dict = { 'op': request };\n        envelope = this.safeDict (params, 'x');\n") + consumer ('const', '        return [ thing ];'));
        expect (out).not.toContain ('var thing map[string]any');
    });
    test ('a let consumer that is rebound keeps the box', () => {
        const out = printVenue (producer ('this.extend (request, params)') + consumer ('let', "        thing = 'x';\n        return [ thing ];"));
        expect (out).not.toContain ('var thing map[string]any');
    });
});
