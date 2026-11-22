import { print } from './h20g04.test';

const SHAPE = (decl: string, extra = '') => '    createOrder (type: string, params = {}) {\n'
    + '        ' + decl + '\n'
    + '        let postOnly = undefined;\n'
    + '        [ postOnly, query ] = this.handlePostOnly (type === \'market\', false, params);\n'
    + extra
    + '        query = this.omit (query, \'cost\');\n'
    + '        return this.safeString (query, \'x\');\n'
    + '    }';

describe ('h21g07 nil-declared local rebound by a Dict tuple slot', () => {
    test ('the local is a map and the slot read is unboxed', () => {
        const out = print (SHAPE ('let query = undefined;'));
        expect (out).toContain ('var query map[string]any = nil\n');
        expect (out).toContain ('query = MapTyped(GetValue(postOnlyqueryVariable, 1))\n');
    });
    test ('a local seeded with the map param is a map (handlePostOnly slot 1 is that map)', () => {
        const out = print (SHAPE ('let query = params;'));
        expect (out).toContain ('var query map[string]any = params\n');
        expect (out).toContain ('query = MapTyped(GetValue(postOnlyqueryVariable, 1))\n');
    });
    test ('a non-map write keeps the box', () => {
        const out = print (SHAPE ('let query: any = undefined;', '        query = \'x\';\n'));
        expect (out).not.toContain ('var query map[string]any');
    });
    test ('an element-written local keeps the box and its helper store', () => {
        const out = print (SHAPE ('let query = undefined;', '        query[\'k\'] = this.safeString (params, \'k\');\n'));
        expect (out).not.toContain ('MapTyped(GetValue(postOnlyqueryVariable');
    });
    test ('an unassigned read that escapes into any keeps the box', () => {
        const out = print ('    f (type: string, params = {}) {\n'
            + '        let query = undefined;\n'
            + '        if (type === \'x\') {\n'
            + '            return query;\n'
            + '        }\n'
            + '        let postOnly = undefined;\n'
            + '        [ postOnly, query ] = this.handlePostOnly (type === \'market\', false, params);\n'
            + '        return query;\n'
            + '    }');
        expect (out).not.toContain ('MapTyped(GetValue(postOnlyqueryVariable');
    });
});
