import Exchange from '../base/Exchange';
import type { Dict } from '../base/Exchange';
export default class venue extends Exchange {
    handleSub (client: any, message: Dict) {
        const subs = this.safeDict (this.options, 'subs', {});
        subs['a'] = 1;
        const fromParam = this.safeDict (client, 'subscriptions', {});
        fromParam['b'] = 2;
        const fromMessage = this.safeDict (message, 'data', {});
        fromMessage['c'] = 3;
        return [ subs['a'], fromParam, fromMessage ];
    }
    buildRequest (message: any) {
        const base = this.safeDict (this.options, 'req', {});
        const request = this.extend (base, { 'op': 'sub' });
        request['id'] = 1;
        const loose = this.extend (message, {});
        loose['id'] = 2;
        return [ request, loose ];
    }
}
