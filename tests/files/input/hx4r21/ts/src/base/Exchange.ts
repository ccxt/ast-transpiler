export interface Dict { [key: string]: any }
export interface Currency { id: string; code: string }
export default class Exchange {
    options: Dict = {};
    safeValue (d: any, k: any, dflt: any = undefined): any {
        return d === undefined ? dflt : d[k];
    }
    sortBy (array: any[], key: any): any[] {
        return array;
    }
    arrayConcat (a: any[], b: any[]): any[] {
        return a.concat (b);
    }
    currency (code: string): Currency {
        return { 'id': code, 'code': code };
    }
    collect (rows: any[], response: any) {
        let out = [];
        for (let i = 0; i < rows.length; i++) {
            out.push (rows[i]);
        }
        out = this.sortBy (out, 'code');
        out.push (1);
        const joined = this.arrayConcat (rows, out);
        joined.push (2);
        let loose = response;
        loose.push (3);
        return [ out, joined, loose ];
    }
    keysOf (response: any) {
        const built: Dict = {};
        built['a'] = 1;
        const keys = Object.keys (built);
        const values = Object.values (built);
        const other = Object.keys (response);
        return [ keys, values, other ];
    }
}
