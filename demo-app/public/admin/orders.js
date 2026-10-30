(function () {
  var user = lumen.requireRole('admin');
  if (!user) return;
  lumen.bindSession(user);

  var state = { page: 1, status: '', q: '' };
  var body = document.getElementById('orders-body');
  var errorBox = document.getElementById('orders-error');
  var info = document.getElementById('pager-info');
  var prev = document.getElementById('prev-page');
  var next = document.getElementById('next-page');
  var searchInput = document.getElementById('search');
  var statusFilter = document.getElementById('status-filter');

  function query(extra) {
    var params = new URLSearchParams({ page: String(state.page), page_size: '10' });
    if (state.status) params.set('status', state.status);
    if (state.q) params.set('q', state.q);
    Object.keys(extra || {}).forEach(function (key) { params.set(key, extra[key]); });
    return '/orders?' + params.toString();
  }

  function render(data) {
    body.textContent = '';
    if (data.items.length === 0) {
      var empty = lumen.el('tr', {}, [lumen.el('td', { colspan: '6', class: 'muted', text: 'No orders match your filters.' })]);
      body.appendChild(empty);
    }
    data.items.forEach(function (order) {
      var link = lumen.el('a', { href: 'order.html?id=' + encodeURIComponent(order.id), text: order.reference });
      var view = lumen.el('a', { href: 'order.html?id=' + encodeURIComponent(order.id), text: 'View' });
      view.setAttribute('aria-label', 'View order ' + order.reference);
      var row = lumen.el('tr', { 'data-testid': 'order-row', 'data-order-id': order.id }, [
        lumen.cell(link, 'text-cell'),
        lumen.cell(order.client_name, 'text-cell'),
        lumen.cell(lumen.dateTime(order.created_at)),
        lumen.cell(lumen.statusBadge(order.status)),
        lumen.cell(lumen.money(order.total_cents), 'num'),
        lumen.cell(view)
      ]);
      body.appendChild(row);
    });
    var totalPages = Math.max(data.total_pages, 1);
    info.textContent = 'Page ' + data.page + ' of ' + totalPages + ' (' + data.total + ' orders)';
    prev.disabled = data.page <= 1;
    next.disabled = data.page >= totalPages;
  }

  function load() {
    errorBox.classList.add('hidden');
    lumen.request(query()).then(function (result) {
      if (result.status === 401) {
        lumen.clearSession();
        window.location.replace('index.html');
        return;
      }
      if (!result.ok) {
        lumen.showError(errorBox, 'Could not load orders (' + result.status + ').');
        return;
      }
      render(result.data);
    }, function () {
      lumen.showError(errorBox, 'Could not reach the server.');
    });
  }

  document.getElementById('search-form').addEventListener('submit', function (event) {
    event.preventDefault();
    state.q = searchInput.value.trim();
    state.page = 1;
    load();
  });
  statusFilter.addEventListener('change', function () {
    state.status = statusFilter.value;
    state.page = 1;
    load();
  });
  document.getElementById('refresh').addEventListener('click', load);
  document.getElementById('clear-filters').addEventListener('click', function () {
    state = { page: 1, status: '', q: '' };
    searchInput.value = '';
    statusFilter.value = '';
    load();
  });
  prev.addEventListener('click', function () { state.page -= 1; load(); });
  next.addEventListener('click', function () { state.page += 1; load(); });

  function csvCell(value) {
    var text = value === null || value === undefined ? '' : String(value);
    return /[",\n\r]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
  }

  function collectAll(page, rows) {
    return lumen.request(query({ page: String(page), page_size: '100' })).then(function (result) {
      if (!result.ok) throw new Error('export failed');
      var all = rows.concat(result.data.items);
      if (page < result.data.total_pages) return collectAll(page + 1, all);
      return all;
    });
  }

  document.getElementById('export-csv').addEventListener('click', function () {
    errorBox.classList.add('hidden');
    collectAll(1, []).then(function (rows) {
      var lines = [['id', 'reference', 'client', 'status', 'created_at', 'subtotal', 'discount', 'tax', 'total'].join(',')];
      rows.forEach(function (order) {
        lines.push([
          order.id, order.reference, order.client_name, order.status, order.created_at,
          (order.subtotal_cents / 100).toFixed(2), (order.discount_cents / 100).toFixed(2),
          (order.tax_cents / 100).toFixed(2), (order.total_cents / 100).toFixed(2)
        ].map(csvCell).join(','));
      });
      var blob = new Blob(['﻿' + lines.join('\r\n') + '\r\n'], { type: 'text/csv;charset=utf-8' });
      var url = URL.createObjectURL(blob);
      var anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'orders.csv';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    }, function () {
      lumen.showError(errorBox, 'Could not export orders.');
    });
  });

  load();
})();
