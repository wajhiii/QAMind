(function () {
  var config = window.APP_CONFIG;
  var TOKEN_KEY = 'lumen.token';
  var USER_KEY = 'lumen.user';

  var STATUS_FLOW = {
    placed: ['processing', 'cancelled'],
    processing: ['shipped', 'cancelled'],
    shipped: ['delivered'],
    delivered: [],
    cancelled: []
  };

  function getToken() {
    return window.localStorage.getItem(TOKEN_KEY);
  }

  function getUser() {
    try {
      return JSON.parse(window.localStorage.getItem(USER_KEY));
    } catch (err) {
      return null;
    }
  }

  function setSession(token, user) {
    window.localStorage.setItem(TOKEN_KEY, token);
    window.localStorage.setItem(USER_KEY, JSON.stringify(user));
  }

  function clearSession() {
    window.localStorage.removeItem(TOKEN_KEY);
    window.localStorage.removeItem(USER_KEY);
  }

  function request(path, options) {
    var opts = options || {};
    var headers = {};
    var token = getToken();
    if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
    if (opts.auth !== false && token) headers.Authorization = 'Bearer ' + token;
    return fetch(config.apiBase + path, {
      method: opts.method || 'GET',
      headers: headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body)
    }).then(function (res) {
      if (res.status === 204) return { ok: true, status: 204, data: null };
      return res.json().then(
        function (data) { return { ok: res.ok, status: res.status, data: data }; },
        function () { return { ok: res.ok, status: res.status, data: null }; }
      );
    });
  }

  function requireRole(role) {
    var user = getUser();
    if (!getToken() || !user || user.role !== role) {
      window.location.replace('index.html');
      return null;
    }
    return user;
  }

  function bindSession(user) {
    var who = document.getElementById('whoami');
    if (who && user) who.textContent = user.client_name ? user.name + ' (' + user.client_name + ')' : user.name;
    var button = document.getElementById('logout');
    if (button) {
      button.addEventListener('click', function () {
        request('/auth/logout', { method: 'POST' }).then(function () {
          clearSession();
          window.location.replace('index.html');
        });
      });
    }
  }

  function money(cents) {
    return (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
  }

  function dateOnly(iso) {
    return String(iso).slice(0, 10);
  }

  function dateTime(iso) {
    return String(iso).slice(0, 16).replace('T', ' ') + ' UTC';
  }

  function errorText(result, fallback) {
    if (result && result.data && result.data.error) {
      var err = result.data.error;
      if (err.details && err.details.length && err.details[0].message) return err.details[0].message;
      return err.message;
    }
    return fallback;
  }

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (key) {
      if (key === 'text') node.textContent = attrs[key];
      else if (key === 'class') node.className = attrs[key];
      else node.setAttribute(key, attrs[key]);
    });
    (children || []).forEach(function (child) {
      if (child) node.appendChild(child);
    });
    return node;
  }

  function statusBadge(status) {
    return el('span', { class: 'status status-' + status, text: status });
  }

  function cell(content, className) {
    var td = el('td', className ? { class: className } : {});
    if (typeof content === 'string') td.textContent = content;
    else if (content) td.appendChild(content);
    return td;
  }

  function showError(container, message) {
    container.textContent = message;
    container.classList.remove('hidden');
  }

  window.lumen = {
    config: config,
    STATUS_FLOW: STATUS_FLOW,
    getToken: getToken,
    getUser: getUser,
    setSession: setSession,
    clearSession: clearSession,
    request: request,
    requireRole: requireRole,
    bindSession: bindSession,
    money: money,
    dateOnly: dateOnly,
    dateTime: dateTime,
    errorText: errorText,
    el: el,
    statusBadge: statusBadge,
    cell: cell,
    showError: showError
  };
})();
