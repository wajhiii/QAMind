const DISCOUNT_THRESHOLD_CENTS = 100000;
const DISCOUNT_RATE = 0.05;
const TAX_RATE = 0.1;

export function priceOrder(lines, productsById) {
  const items = lines.map((line) => {
    const product = productsById.get(line.product_id);
    return {
      product_id: product.id,
      name: product.name,
      unit_price_cents: product.price_cents,
      quantity: line.quantity,
      line_total_cents: product.price_cents * line.quantity,
    };
  });
  const subtotal = items.reduce((sum, item) => sum + item.line_total_cents, 0);
  const discount = subtotal >= DISCOUNT_THRESHOLD_CENTS ? Math.round(subtotal * DISCOUNT_RATE) : 0;
  const tax = Math.round(subtotal * TAX_RATE);
  return {
    items,
    subtotal_cents: subtotal,
    discount_cents: discount,
    tax_cents: tax,
    total_cents: subtotal - discount + tax,
    currency: 'USD',
  };
}
