(function () {
  var user = lumen.requireRole('admin');
  if (!user) return;
  lumen.bindSession(user);

  var id = new URLSearchParams(window.location.search).get('id');
  var errorBox = document.getElementById('order-error');
  var view = document.getElementById('order-view');
  var select = document.getElementById('next-status');
  var form = document.getElementById('status-form');
  var statusError = document.getElementById('status-error');
  var statusOk = document.getElementById('status-ok');
  var statusNote = document.getElementById('status-note');

  function fill(order) {
    document.title = 'Order ' + order.reference + ' - Lumen Supplies Admin';
    document.getElementById('order-title').textContent = 'Order ' + order.reference;
    document.getElementById('o-client').textContent = order.client_name;
    document.getElementById('o-placed').textContent = lumen.dateTime(order.created_at);
    var statusCell = document.getElementById('o-status');
    statusCell.textContent = '';
    statusCell.appendChild(lumen.statusBadge(order.status));
    document.getElementById('o-note').textContent = order.note || 'None';
    var items = document.getElementById('o-items');
    items.textContent = '';
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

    var options = lumen.STATUS_FLOW[order.status] || [];
    select.textContent = '';
    options.forEach(function (status) {
      select.appendChild(lumen.el('option', { value: status, text: status.charAt(0).toUpperCase() + status.slice(1) }));
    });
    form.classList.toggle('hidden', options.length === 0);
    statusNote.classList.toggle('hidden', options.length !== 0);
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

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    statusError.classList.add('hidden');
    statusOk.classList.add('hidden');
    lumen.request('/admin/orders/' + encodeURIComponent(id) + '/status', { method: 'PATCH', body: { status: select.value } }).then(function (result) {
      if (!result.ok) {
        lumen.showError(statusError, lumen.errorText(result, 'Could not update the status.'));
        return;
      }
      fill(result.data);
      lumen.showError(statusOk, 'Status updated to ' + result.data.status + '.');
    });
  });
})();
