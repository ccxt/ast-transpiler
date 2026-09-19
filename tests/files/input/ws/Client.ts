// B-28 fixture: a ws `Client`-shaped class under a `ws/Client.ts` path, the
// shape the rust printer's Client-handle proof keys on (the port holds the
// handle as `Value::Dict{url, subscriptions, futures}`). Path-shaped so the
// ByPath test drives the real predicate.
class Client {
    url: string = '';
    subscriptions: any = {};
    futures: any = {};
}

class Consumer {
    handle (client: Client) {
        const u = client.url;
        const s = client.subscriptions;
        return [ u, s ];
    }
}