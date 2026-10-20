export interface Dict { [key: string]: any }
export default class Exchange {
    options: Dict = {};
    safeDict (d: any, k: any, dflt: Dict = undefined): Dict {
        return d === undefined ? dflt : d[k];
    }
    extend (...args: any[]): Dict {
        return Object.assign ({}, ...args);
    }
    copyItem (obj: any, keyName: string, key: string) {
        const item = obj[key];
        const itemWithKey = this.extend ({}, item);
        itemWithKey[keyName] = key;
        return itemWithKey;
    }
    structure (market: Dict = undefined) {
        const clean = { 'spot': undefined };
        const result = this.extend (clean, market);
        result['swap'] = false;
        return result;
    }
    accountOf (account: string) {
        const accountsByType = this.safeDict (this.options, 'accountsByType', {});
        return accountsByType[account];
    }
    anyParam (response: any) {
        const r = this.extend ({}, response);
        r['x'] = 1;
        return r;
    }
}
