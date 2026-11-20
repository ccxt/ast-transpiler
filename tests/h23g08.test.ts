import fs from 'fs';
import path from 'path';
import { printVenue } from './h22g01.test';

const method = (decl: string, body: string) =>
    '    m (first: any, k: string) {\n' +
    '        const byId = ' + decl + ';\n' +
    "        const firstId = this.safeString (first, 'id');\n" + body + '    }\n';

describe ('h23g08: InOp on a safeDict local the printer declares map[string]any', () => {
    afterAll (() => fs.rmSync (path.join (__dirname, 'files', 'tmp-h22g01'), { recursive: true, force: true }));
    test ('a guarded *string key reads the typed local with the comma-ok', () => {
        const out = printVenue (method ("this.safeDict (this.options, 'byId', {})",
            '        if ((firstId !== undefined) && (firstId in byId)) {\n            delete byId[firstId];\n        }\n'));
        expect (out).toContain ('var byId map[string]any = this.SafeDictMap(this.Options, "byId", map[string]any{})');
        expect (out).toContain ('\tif firstId != nil {\n\t\tif _, ok := byId[*firstId]; ok {\n\t\t\tdelete(byId, *firstId)\n');
        expect (out).not.toContain ('InOp(byId');
    });
    test ('a boxed key keeps the helper on the typed local', () => {
        const out = printVenue (method ("this.safeDict (this.options, 'byId', {})", '        const isNew = !(k in byId);\n        return isNew;\n'));
        expect (out).toContain ('var isNew bool = !(InOp(byId, k))');
    });
    test ('a local that is rebound to a non-dict keeps the helper', () => {
        const out = printVenue ('    m (first: any, k: string) {\n' +
            "        let byId = this.safeDict (this.options, 'byId', {});\n" +
            "        byId = this.safeValue (first, 'x');\n" +
            '        return (k in byId);\n    }\n');
        expect (out).toContain ('InOp(byId, k)');
    });
    test ('a safeDict local with a nil default that is compared with nil keeps the helper', () => {
        const out = printVenue (method ("this.safeDict (first, 'byId')",
            '        if (byId === undefined) {\n            return firstId;\n        }\n        return (k in byId);\n'));
        expect (out).toContain ('\treturn (InOp(byId, k))');
    });
});
