(function () {
  var user = lumen.requireRole('client');
  if (!user) return;
  lumen.bindSession(user);

  var form = document.getElementById('order-form');
  var lines = document.getElementById('lines');
  var errorBox = document.getElementById('order-error');
  var confirmation = document.getElementById('confirmation');
  var products = [];

  function addLine() {
    var select = lumen.el('select', { name: 'product', 'data-testid': 'line-product' }, [
      lumen.el('option', { value: '', text: 'Choose a product' })
    ]);
    products.forEach(function (product) {
      select.appendChild(lumen.el('option', { value: product.id, text: product.name + ' (' + lumen.money(product.price_cents) + ')' }));
    });
    var quantity = lumen.el('input', { name: 'quantity', type: 'number', value: '1', 'aria-label': 'Quantity', 'data-testid': 'line-quantity' });
    var remove = lumen.el('button', { type: 'button', class: 'secondary', text: 'Remove', 'data-testid': 'remove-line' });
    var row = lumen.el('div', { class: 'line-row' }, [
      lumen.el('div', { class: 'line-product' }, [select]),
      lumen.el('div', { class: 'line-qty' }, [quantity]),
      remove
    ]);
    remove.addEventListener('click', function () {
      if (lines.children.length > 1) row.remove();
    });
    lines.appendChild(row);
  }

  function collectItems() {
    var items = [];
    var problem = null;
    Array.prototype.forEach.call(lines.children, function (row) {
      var productId = row.querySelector('select').value;
      var rawQuantity = row.querySelector('input').value.trim();
      if (!productId || rawQuantity === '') {
        problem = 'Choose a product and enter a quantity for every item.';
        return;
      }
      items.push({ product_id: productId, quantity: Number(rawQuantity) });
    });
    return { items: items, problem: problem };
  }

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    errorBox.classList.add('hidden');
    var reference = form.elements.reference.value.trim();
    if (!reference) {
      lumen.showError(errorBox, 'Enter your PO reference.');
      return;
    }
    var collected = collectItems();
    if (collected.problem) {
      lumen.showError(errorBox, collected.problem);
      return;
    }
    var payload = { reference: reference, items: collected.items };
    var note = form.elements.note.value.trim();
    if (note) payload.note = note;

    lumen.request('/orders', { method: 'POST', body: payload }).then(function (result) {
      if (!result.ok) {
        lumen.showError(errorBox, lumen.errorText(result, 'Could not place the order (' + result.status + ').'));
        return;
      }
      var order = result.data;
      confirmation.textContent = '';
      confirmation.appendChild(document.createTextNode('Order ' + order.reference + ' placed. Total: ' + lumen.money(order.total_cents) + '. '));
      confirmation.appendChild(lumen.el('a', { href: 'order.html?id=' + encodeURIComponent(order.id), text: 'View order' }));
      confirmation.classList.remove('hidden');
      form.reset();
      lines.textContent = '';
      addLine();
    }, function () {
      lumen.showError(errorBox, 'Could not reach the server.');
    });
  });

  document.getElementById('add-line').addEventListener('click', addLine);

  lumen.request('/products').then(function (result) {
    if (!result.ok) {
      lumen.showError(errorBox, 'Could not load the product list.');
      return;
    }
    products = result.data.items;
    addLine();
  });
})();
