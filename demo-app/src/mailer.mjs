import net from 'node:net';

function buildMessage({ from, to, subject, text }) {
  const headers = [
    `From: Lumen Supplies <${from}>`,
    `To: ${to}`,
    `Subject: ${subject}`,
    `Date: ${new Date().toUTCString()}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: 8bit',
  ];
  const body = text
    .replace(/\r?\n/g, '\r\n')
    .split('\r\n')
    .map((line) => (line.startsWith('.') ? `.${line}` : line))
    .join('\r\n');
  return `${headers.join('\r\n')}\r\n\r\n${body}`;
}

export function sendMail({ host, port, from, to, subject, text, timeoutMs = 3000 }) {
  return new Promise((resolve, reject) => {
    const message = buildMessage({ from, to, subject, text });
    const steps = [
      { expect: 220, send: null },
      { expect: 250, send: 'EHLO lumen.test\r\n' },
      { expect: 250, send: `MAIL FROM:<${from}>\r\n` },
      { expect: 250, send: `RCPT TO:<${to}>\r\n` },
      { expect: 354, send: 'DATA\r\n' },
      { expect: 250, send: `${message}\r\n.\r\n` },
      { expect: 221, send: 'QUIT\r\n' },
    ];
    let index = 0;
    let pending = '';
    let settled = false;

    const socket = net.createConnection({ host, port });
    socket.setEncoding('utf8');
    socket.setTimeout(timeoutMs, () => socket.destroy(new Error('SMTP connection timed out')));

    const finish = (err) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      if (err) reject(err);
      else resolve();
    };

    socket.on('error', finish);
    socket.on('close', () => finish(new Error('SMTP connection closed early')));
    socket.on('data', (chunk) => {
      pending += chunk;
      let lineEnd = pending.indexOf('\r\n');
      while (lineEnd !== -1) {
        const line = pending.slice(0, lineEnd);
        pending = pending.slice(lineEnd + 2);
        lineEnd = pending.indexOf('\r\n');
        if (!/^\d{3} /.test(line)) continue;
        const code = Number(line.slice(0, 3));
        if (code !== steps[index].expect) {
          finish(new Error(`SMTP unexpected reply: ${line}`));
          return;
        }
        index += 1;
        if (index >= steps.length) {
          finish();
          return;
        }
        socket.write(steps[index].send);
      }
    });
  });
}
