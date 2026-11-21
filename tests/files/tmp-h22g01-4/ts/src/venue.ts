import Exchange from './base/Exchange.js';
import type { Dict } from './base/Exchange.js';
export default class venue extends Exchange {
    async fetchRawThing (id: string, params: Dict = {}): Promise<Dict> {
        const request: Dict = { 'id': id };
        return this.extend (request, params);
    }
    async fetchThing (id: string, params: Dict = {}) {
        let thing = await this.fetchRawThing (id, params);
        thing = 'x';
        return [ thing ];
    }

}
