(function () {
  var user = lumen.getUser();
  if (lumen.getToken() && user && user.role === 'admin') {
    window.location.replace('orders.html');
    return;
  }

  var form = document.getElementById('login-form');
  var errorBox = document.getElementById('login-error');

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    errorBox.classList.add('hidden');
    var email = form.elements.email.value.trim();
    var password = form.elements.password.value;
    if (!email || !password) {
      lumen.showError(errorBox, 'Enter your email and password.');
      return;
    }
    lumen.request('/auth/login', { method: 'POST', auth: false, body: { email: email, password: password } }).then(function (result) {
      if (!result.ok) {
        lumen.showError(errorBox, result.status === 401 ? 'Invalid email or password.' : lumen.errorText(result, 'Sign in failed. Try again.'));
        return;
      }
      if (result.data.user.role !== 'admin') {
        lumen.showError(errorBox, 'This account does not have admin access.');
        return;
      }
      lumen.setSession(result.data.token, result.data.user);
      window.location.replace('orders.html');
    }, function () {
      lumen.showError(errorBox, 'Could not reach the server.');
    });
  });
})();
