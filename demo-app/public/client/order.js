(function () {
  var user = lumen.requireRole('client');
  if (!user) return;
  lumen.bindSession(user);

  var id = new URLSearchParams(window.location.search).get('id');
  var errorBox = document.getElementById('order-error');
  var view = document.getElementById('order-view');

  function placedOn(iso) {
    var placed = new Date(iso.slice(0, 19).replace('T', ' '));
    return 'Placed on ' + placed.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  function fill(order) {
    document.title = 'Order ' + order.reference + ' - Lumen Supplies';
    document.getElementById('order-title').textContent = 'Order ' + order.reference;
    document.getElementById('o-client').textContent = order.client_name;
    document.getElementById('o-placed').textContent = placedOn(order.created_at);
    document.getElementById('o-status').appendChild(lumen.statusBadge(order.status));
    document.getElementById('o-note').textContent = order.note || 'None';
    var items = document.getElementById('o-items');
    order.items.forEach(function (item) {
      items.appendChild(lumen.el('tr', {}, [
        lumen.cell(item.name),
        lumen.cell(lumen.money(item.unit_price_cents), 'num'),
        lumen.cell(String(item.quantity), 'num'),
        lumen.cell(lumen.money(item.line_total_cents), 'num')
      ]));
    });
    document.getElementById('t-subtotal').textContent = lumen.money(order.subtotal_cents);
    document.getElementById('t-discount').textContent = '-' + lumen.money(order.discount_cents);
    document.getElementById('t-tax').textContent = lumen.money(order.tax_cents);
    document.getElementById('t-total').textContent = lumen.money(order.total_cents);
    view.classList.remove('hidden');
  }

  if (!id) {
    lumen.showError(errorBox, 'No order selected.');
    return;
  }

  lumen.request('/orders/' + encodeURIComponent(id)).then(function (result) {
    if (result.status === 404) {
      lumen.showError(errorBox, 'Order not found.');
      return;
    }
    if (!result.ok) {
      lumen.showError(errorBox, 'Could not load this order (' + result.status + ').');
      return;
    }
    fill(result.data);
  }, function () {
    lumen.showError(errorBox, 'Could not reach the server.');
  });
})();
