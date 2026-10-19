interface Dictionary<T> { [key: string]: T }
type Dict = Dictionary<any>;
type Str = string | undefined;

export default class venue {
    balance: Dict = {};
    tickers: Dictionary<any> = {};

    omit (x, k) { return x; }

    sign (path: string, params: Dict = {}) {
        const query = this.omit (params, 'a');
        let url = path;
        if (Object.keys (query).length) {
            url = url + '?';
        }
        const values = Object.values (this.tickers);
        const flag = true;
        return [ url, values, Object.keys (flag) ];
    }

    clean (symbol: Str, code: string) {
        if (code in this.balance) {
            delete this.balance[code];
        }
        const request = { 'a': 1, 'b': 2 };
        delete request['a'];
        const response: any = this.omit ({}, 'x');
        delete response['x'];
        if (code in response) {
            return 1;
        }
        return request;
    }
}
