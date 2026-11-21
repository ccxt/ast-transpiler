import Exchange from './base/Exchange.js';
import type { Dict } from './base/Exchange.js';
export default class venue extends Exchange {
    m (first: any, k: string) {
        const byId = this.safeDict (first, 'byId');
        const firstId = this.safeString (first, 'id');
        if (byId === undefined) {
            return firstId;
        }
        return (k in byId);
    }

}
