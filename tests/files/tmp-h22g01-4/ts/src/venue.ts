import Exchange from './base/Exchange.js';
import type { Dict } from './base/Exchange.js';
export default class venue extends Exchange {
    m (first: any, k: any) {
        const byId = this.safeDict (this.options, 'byId', {});
        const code = this.safeString (first, 'code');
        if (code in first) {
            return 1;
        }
        return 0;
    }

}
