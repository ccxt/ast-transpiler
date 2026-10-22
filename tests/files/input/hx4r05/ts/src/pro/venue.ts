interface Dictionary<T> { [key: string]: T }
type Dict = Dictionary<any>;
class Client { subscriptions: Dictionary<any> = {}; futures: Dictionary<any> = {}; }

export default class venuews {
    orderbooks: Dictionary<any> = {};

    handle (client: Client, symbol: string, messageHash: string, subscription: Dict) {
        if (symbol in this.orderbooks) {
            delete this.orderbooks[symbol];
        }
        if (messageHash in client.subscriptions) {
            delete client.subscriptions[messageHash];
        }
        const subs = client.subscriptions;
        delete subs[messageHash];
        delete subscription[symbol];
        const plain = { 'k': 1 };
        delete plain['k'];
        return Object.keys (this.orderbooks);
    }
}
