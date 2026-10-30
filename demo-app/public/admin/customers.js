(function () {
  var user = lumen.requireRole('admin');
  if (!user) return;
  lumen.bindSession(user);

  var body = document.getElementById('customers-body');
  var errorBox = document.getElementById('customers-error');

  lumen.request('/admin/customers').then(function (result) {
    if (!result.ok) {
      lumen.showError(errorBox, 'Could not load customers (' + result.status + ').');
      return;
    }
    result.data.items.forEach(function (customer) {
      body.appendChild(lumen.el('tr', { 'data-testid': 'customer-row' }, [
        lumen.cell(customer.company, 'text-cell'),
        lumen.cell(customer.contact_name),
        lumen.cell(customer.email),
        lumen.cell(customer.phone),
        lumen.cell(customer.cnic),
        lumen.cell(customer.address),
        lumen.cell('•••• ' + customer.card_last4),
        lumen.cell(customer.notes)
      ]));
    });
  }, function () {
    lumen.showError(errorBox, 'Could not reach the server.');
  });
})();
