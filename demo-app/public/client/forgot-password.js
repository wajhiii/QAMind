(function () {
  var form = document.getElementById('forgot-form');
  var errorBox = document.getElementById('forgot-error');
  var okBox = document.getElementById('forgot-ok');

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    errorBox.classList.add('hidden');
    okBox.classList.add('hidden');
    var email = form.elements.email.value.trim();
    if (!email) {
      lumen.showError(errorBox, 'Enter your email address.');
      return;
    }
    lumen.request('/auth/forgot-password', { method: 'POST', auth: false, body: { email: email } }).then(function (result) {
      if (result.status === 202) {
        lumen.showError(okBox, 'If that address is registered, a reset link is on its way.');
        return;
      }
      lumen.showError(errorBox, lumen.errorText(result, 'Could not send the reset link.'));
    }, function () {
      lumen.showError(errorBox, 'Could not reach the server.');
    });
  });
})();
