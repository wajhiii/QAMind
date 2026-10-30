import { readFileSync } from 'node:fs';
import { priceOrder } from './pricing.mjs';

export function createStore(seedFile) {
  const store = {
    clients: new Map(),
    users: [],
    products: [],
    productsById: new Map(),
    customers: [],
    orders: [],
    sessions: new Map(),
    resetTokens: new Map(),
    orderCache: new Map(),
    nextOrderNumber: 1001,
  };

  store.reset = () => {
    const seed = JSON.parse(readFileSync(seedFile, 'utf8'));
    store.clients = new Map(seed.clients.map((client) => [client.id, client]));
    store.users = seed.users.map((user) => ({ ...user }));
    store.products = seed.products.map((product) => ({ ...product }));
    store.productsById = new Map(store.products.map((product) => [product.id, product]));
    store.customers = seed.customers.map((customer) => ({ ...customer }));
    store.sessions = new Map();
    store.resetTokens = new Map();
    store.orderCache = new Map();
    store.orders = seed.orders.map((order) => {
      const client = store.clients.get(order.client_id);
      return {
        id: order.id,
        reference: order.reference,
        note: order.note,
        client_id: client.id,
        client_name: client.name,
        status: order.status,
        created_at: order.created_at,
        ...priceOrder(order.items, store.productsById),
      };
    });
    const highest = Math.max(...store.orders.map((order) => Number(order.id.slice(2))));
    store.nextOrderNumber = highest + 1;
  };

  store.addOrder = ({ clientId, reference, note, items }) => {
    const client = store.clients.get(clientId);
    const order = {
      id: `o-${store.nextOrderNumber}`,
      reference,
      note,
      client_id: client.id,
      client_name: client.name,
      status: 'placed',
      created_at: new Date().toISOString(),
      ...priceOrder(items, store.productsById),
    };
    store.nextOrderNumber += 1;
    store.orders.push(order);
    store.orderCache.delete(clientId);
    return order;
  };

  store.reset();
  return store;
}
