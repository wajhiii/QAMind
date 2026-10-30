(function () {
  var token = new URLSearchParams(window.location.search).get('token');
  var form = document.getElementById('reset-form');
  var errorBox = document.getElementById('reset-error');
  var okBox = document.getElementById('reset-ok');

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    errorBox.classList.add('hidden');
    okBox.classList.add('hidden');
    var password = form.elements.password.value;
    if (!password) {
      lumen.showError(errorBox, 'Enter a new password.');
      return;
    }
    lumen.request('/auth/reset-password', { method: 'POST', auth: false, body: { token: token, password: password } }).then(function (result) {
      if (result.status === 204) {
        lumen.showError(okBox, 'Your password has been changed. You can now sign in.');
        return;
      }
      lumen.showError(errorBox, lumen.errorText(result, 'Could not change the password.'));
    }, function () {
      lumen.showError(errorBox, 'Could not reach the server.');
    });
  });
})();
