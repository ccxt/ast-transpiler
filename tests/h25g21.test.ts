import fs from 'fs';
import path from 'path';
import { printVenue } from './h22g01.test';

const method = (body: string) =>
    '    m (first: any, k: any) {\n' +
    "        const byId = this.safeDict (this.options, 'byId', {});\n" +
    "        const code = this.safeString (first, 'code');\n" + body + '    }\n';

describe ('h25g21: InOp with a *string key on a declared map[string]any', () => {
    afterAll (() => fs.rmSync (path.join (__dirname, 'files', 'tmp-h22g01-' + (process.env.JEST_WORKER_ID || '0')), { recursive: true, force: true }));
    test ('a negated unguarded *string key binds a nil-checked comma-ok read', () => {
        const out = printVenue (method ('        if (!(code in byId)) {\n            return 1;\n        }\n        return 0;\n'));
        expect (out).toContain ('\tvar has1 bool\n\tif code != nil {\n\t\t_, has1 = byId[*code]\n\t}\n\tif !has1 {\n');
        expect (out).not.toContain ('func() bool {');
    });
    test ('a negated read in a bool initialiser keeps the nil answer', () => {
        const out = printVenue (method ('        const missing = !(code in byId);\n        return missing;\n'));
        expect (out).toContain ('\tvar has1 bool\n\tif code != nil {\n\t\t_, has1 = byId[*code]\n\t}\n\tvar missing bool = !has1\n');
    });
    test ('a boxed key keeps the helper', () => {
        const out = printVenue (method ('        if (k in byId) {\n            return 1;\n        }\n        return 0;\n'));
        expect (out).toContain ('InOp(byId, k)');
    });
    test ('a key that is rebound keeps the helper', () => {
        const out = printVenue (method ("        let c2 = this.safeString (first, 'a');\n        c2 = this.safeString (first, 'b');\n        if (c2 in byId) {\n            return 1;\n        }\n        return 0;\n"));
        expect (out).not.toContain ('var has1 bool');
    });
    test ('a boxed receiver keeps the helper', () => {
        const out = printVenue (method ('        if (code in first) {\n            return 1;\n        }\n        return 0;\n'));
        expect (out).toContain ('InOp(first, code)');
    });
});
