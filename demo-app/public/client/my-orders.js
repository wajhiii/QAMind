(function () {
  var user = lumen.requireRole('client');
  if (!user) return;
  lumen.bindSession(user);

  var state = { page: 1, status: '' };
  var body = document.getElementById('orders-body');
  var errorBox = document.getElementById('orders-error');
  var info = document.getElementById('pager-info');
  var prev = document.getElementById('prev-page');
  var next = document.getElementById('next-page');
  var statusFilter = document.getElementById('status-filter');

  function render(data) {
    body.textContent = '';
    if (data.items.length === 0) {
      body.appendChild(lumen.el('tr', {}, [lumen.el('td', { colspan: '5', class: 'muted', text: 'No orders found.' })]));
    }
    data.items.forEach(function (order) {
      var href = 'order.html?id=' + encodeURIComponent(order.id);
      var view = lumen.el('a', { href: href, text: 'View' });
      view.setAttribute('aria-label', 'View order ' + order.reference);
      body.appendChild(lumen.el('tr', { 'data-testid': 'order-row', 'data-order-id': order.id }, [
        lumen.cell(lumen.el('a', { href: href, text: order.reference }), 'text-cell'),
        lumen.cell(lumen.dateOnly(order.created_at)),
        lumen.cell(lumen.statusBadge(order.status)),
        lumen.cell(lumen.money(order.total_cents), 'num'),
        lumen.cell(view)
      ]));
    });
    var totalPages = Math.max(data.total_pages, 1);
    info.textContent = 'Page ' + data.page + ' of ' + totalPages + ' (' + data.total + ' orders)';
    prev.disabled = data.page <= 1;
    next.disabled = data.page >= totalPages;
  }

  function load() {
    errorBox.classList.add('hidden');
    var params = new URLSearchParams({ page: String(state.page), page_size: '10' });
    if (state.status) params.set('status', state.status);
    lumen.request('/orders?' + params.toString()).then(function (result) {
      if (result.status === 401) {
        lumen.clearSession();
        window.location.replace('index.html');
        return;
      }
      if (!result.ok) {
        lumen.showError(errorBox, 'Could not load your orders (' + result.status + ').');
        return;
      }
      render(result.data);
    }, function () {
      lumen.showError(errorBox, 'Could not reach the server.');
    });
  }

  statusFilter.addEventListener('change', function () {
    state.status = statusFilter.value;
    state.page = 1;
    load();
  });
  prev.addEventListener('click', function () { state.page -= 1; load(); });
  next.addEventListener('click', function () { state.page += 1; load(); });
  load();
})();
