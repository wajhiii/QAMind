// A stand-in for a Sentry MCP server, for QAMind's own end-to-end checks. It is NOT Sentry, and its tool names and arguments are this stand-in's own (the real server's
// were not verifiable when it was written): QAMind's instructions describe what to read (errors in a time window, for projects and environments) without naming tools.
// Events come from the file SENTRY_STANDIN_EVENTS (one JSON line each: at, environment, project, title, culprit), which the demo app appends to and the harness seeds.
// `resolve_issue` exists only to prove the safety hook refuses anything that changes Sentry: it records that it was called, and does nothing else.
import fs from 'node:fs';
import crypto from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const FILE = process.env.SENTRY_STANDIN_EVENTS;
const LOG = process.env.SENTRY_STANDIN_LOG;
if (!FILE) throw new Error('SENTRY_STANDIN_EVENTS is required');
const log = (tool, args) => LOG && fs.appendFileSync(LOG, `${JSON.stringify({ at: new Date().toISOString(), tool, args })}\n`);
const reply = (value) => ({ content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] });
const events = () => (fs.existsSync(FILE) ? fs.readFileSync(FILE, 'utf8').split('\n').filter((l) => l.startsWith('{')).map((l) => JSON.parse(l)) : []);
const shortId = (e) => `ACME-API-${crypto.createHash('sha1').update(`${e.title}|${e.culprit}`).digest('hex').slice(0, 2).toUpperCase()}`;

function issues({ environment, project, startTime, endTime }) {
  const from = startTime ? Date.parse(startTime) : -Infinity;
  const to = endTime ? Date.parse(endTime) : Infinity;
  const groups = new Map();
  for (const e of events()) {
    const t = Date.parse(e.at);
    if (t < from || t > to) continue;
    if (environment && e.environment.toLowerCase() !== environment.toLowerCase()) continue;
    if (project && e.project.toLowerCase() !== project.toLowerCase()) continue;
    const key = `${e.environment}|${e.title}|${e.culprit}`;
    const g = groups.get(key) ?? { shortId: shortId(e), title: e.title, culprit: e.culprit, level: 'error', environment: e.environment, project: e.project, count: 0, userCount: 0, firstSeen: e.at, lastSeen: e.at };
    g.count++;
    if (e.at < g.firstSeen) g.firstSeen = e.at;
    if (e.at > g.lastSeen) g.lastSeen = e.at;
    groups.set(key, g);
  }
  return [...groups.values()].sort((a, b) => b.count - a.count).map((g) => ({ ...g, permalink: `https://acme.sentry.io/issues/${g.shortId}/?environment=${g.environment}` }));
}

const server = new McpServer({ name: 'sentry-standin', version: '0.0.0' });
server.registerTool('search_issues', {
  description: 'Search error issues (a stand-in for tests, not Sentry). Filters: project, environment, startTime and endTime (ISO times; only events inside count).',
  inputSchema: { organization: z.string().optional(), project: z.string().optional(), environment: z.string().optional(), query: z.string().optional(), startTime: z.string().optional(), endTime: z.string().optional(), limit: z.number().optional() },
}, async (a) => {
  log('search_issues', a);
  return reply({ issues: issues(a).slice(0, a.limit ?? 25) });
});
server.registerTool('get_issue_details', { description: 'One issue by short id.', inputSchema: { issueId: z.string() } }, async (a) => {
  log('get_issue_details', a);
  const i = issues({}).find((x) => x.shortId === a.issueId);
  return i ? reply(i) : { isError: true, content: [{ type: 'text', text: `No issue ${a.issueId}` }] };
});
server.registerTool('resolve_issue', { description: 'Mark an issue resolved.', inputSchema: { issueId: z.string() } }, async (a) => {
  log('resolve_issue', a);
  return reply({ resolved: a.issueId });
});
await server.connect(new StdioServerTransport());
