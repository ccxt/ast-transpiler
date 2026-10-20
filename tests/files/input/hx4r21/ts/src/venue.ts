import Exchange from './base/Exchange.js';
export default class venue extends Exchange {
    upper (code: string, raw: any) {
        const currency = this.currency (code);
        const id: string = currency['id'];
        const a = currency['id'].toUpperCase ();
        const b = raw['id'].toUpperCase ();
        return [ id, a, b ];
    }
}
