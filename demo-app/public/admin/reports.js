(function () {
  var user = lumen.requireRole('admin');
  if (!user) return;
  lumen.bindSession(user);

  function fillRows(id, rows) {
    var body = document.getElementById(id);
    body.textContent = '';
    rows.forEach(function (cells) {
      body.appendChild(lumen.el('tr', {}, cells));
    });
  }

  lumen.request('/admin/reports/sales').then(function (result) {
    if (result.status === 200) {
      var report = result.data;
      document.getElementById('loading').remove();
      document.getElementById('r-orders').textContent = String(report.orders_count);
      document.getElementById('r-gross').textContent = lumen.money(report.gross_cents);
      document.getElementById('r-generated').textContent = lumen.dateTime(report.generated_at);
      fillRows('r-status', Object.keys(report.by_status).map(function (status) {
        return [lumen.cell(lumen.statusBadge(status)), lumen.cell(String(report.by_status[status]), 'num')];
      }));
      fillRows('r-clients', report.by_client.map(function (row) {
        return [lumen.cell(row.client_name, 'text-cell'), lumen.cell(String(row.orders), 'num'), lumen.cell(lumen.money(row.total_cents), 'num')];
      }));
      fillRows('r-products', report.top_products.map(function (row) {
        return [lumen.cell(row.name), lumen.cell(String(row.quantity), 'num')];
      }));
      document.getElementById('report').classList.remove('hidden');
    }
  });
})();
