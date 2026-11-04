// A stand-in for a Linear MCP server, for QAMind's own end-to-end checks. It is NOT Linear. Its tools (list_issues, get_issue, save_issue, save_comment,
// list_issue_statuses) take the arguments of the real Linear MCP tools that QAMind's instructions name, and keep issues in the JSON file LINEAR_STANDIN_FILE.
// It also logs every call (LINEAR_STANDIN_LOG, one JSON line each) so a check can see exactly what the agent did. It has no delete tool on purpose.
import fs from 'node:fs';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const FILE = process.env.LINEAR_STANDIN_FILE;
const LOG = process.env.LINEAR_STANDIN_LOG;
if (!FILE) throw new Error('LINEAR_STANDIN_FILE is required');

const load = () => (fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, 'utf8')) : { next: 1, issues: [], comments: [] });
const save = (db) => fs.writeFileSync(FILE, JSON.stringify(db, null, 2));
const log = (tool, args) => LOG && fs.appendFileSync(LOG, `${JSON.stringify({ at: new Date().toISOString(), tool, args })}\n`);
const reply = (value) => ({ content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] });
const slug = (t) => t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
const STATUS_TYPE = { Todo: 'unstarted', 'In Progress': 'started', Done: 'completed', Canceled: 'canceled', Duplicate: 'canceled', Backlog: 'backlog' };
const view = (i, db, full = false) => ({
  id: i.id,
  title: i.title,
  url: i.url,
  status: i.status,
  statusType: STATUS_TYPE[i.status] ?? 'unstarted',
  priority: i.priority ?? 0,
  labels: i.labels,
  team: i.team,
  ...(i.project ? { project: i.project } : {}),
  ...(i.updatedBy ? { updatedBy: i.updatedBy } : {}),
  createdAt: i.createdAt,
  updatedAt: i.updatedAt,
  ...(full ? { description: i.description, comments: db.comments.filter((c) => c.issueId === i.id).map((c) => ({ id: c.id, body: c.body, createdAt: c.createdAt })) } : { description: i.description }),
});

const server = new McpServer({ name: 'linear-standin', version: '0.0.0' });

server.registerTool('list_issues', {
  description: 'List issues in the workspace (a stand-in for tests, not Linear). Filters: team, query (title or description), state (a status name or type), label.',
  inputSchema: { team: z.string().optional(), query: z.string().optional(), state: z.string().optional(), label: z.string().optional(), limit: z.number().optional(), fields: z.array(z.string()).optional(), includeArchived: z.boolean().optional(), orderBy: z.string().optional() },
}, async (a) => {
  log('list_issues', a);
  const db = load();
  let list = db.issues;
  if (a.team) list = list.filter((i) => i.team.toLowerCase() === a.team.toLowerCase());
  if (a.query) list = list.filter((i) => `${i.title}\n${i.description}`.toLowerCase().includes(a.query.toLowerCase()));
  if (a.label) list = list.filter((i) => i.labels.some((l) => l.toLowerCase() === a.label.toLowerCase()));
  if (a.state) list = list.filter((i) => i.status.toLowerCase() === a.state.toLowerCase() || (STATUS_TYPE[i.status] ?? '') === a.state.toLowerCase());
  return reply({ issues: list.slice(0, a.limit ?? 50).map((i) => view(i, db)), hasNextPage: false });
});

server.registerTool('get_issue', { description: 'Get one issue by identifier (ENG-12), with its comments.', inputSchema: { id: z.string() } }, async (a) => {
  log('get_issue', a);
  const db = load();
  const i = db.issues.find((x) => x.id.toLowerCase() === a.id.toLowerCase());
  return i ? reply(view(i, db, true)) : { isError: true, content: [{ type: 'text', text: `No issue ${a.id}` }] };
});

server.registerTool('save_issue', {
  description: 'Create an issue (team and title required), or update one when id is given.',
  inputSchema: { id: z.string().optional(), team: z.string().optional(), title: z.string().optional(), description: z.string().optional(), priority: z.number().optional(), labels: z.array(z.string()).optional(), addLabels: z.array(z.string()).optional(), project: z.string().nullable().optional(), state: z.string().optional(), assignee: z.string().nullable().optional(), relatedTo: z.array(z.string()).optional(), links: z.array(z.object({ url: z.string(), title: z.string() })).optional() },
}, async (a) => {
  log('save_issue', a);
  const db = load();
  const now = new Date().toISOString();
  if (a.id) {
    const i = db.issues.find((x) => x.id.toLowerCase() === a.id.toLowerCase());
    if (!i) return { isError: true, content: [{ type: 'text', text: `No issue ${a.id}` }] };
    for (const k of ['title', 'description', 'priority', 'project']) if (a[k] !== undefined) i[k] = a[k];
    if (a.state) i.status = a.state;
    if (a.labels) i.labels = a.labels;
    if (a.addLabels) i.labels = [...new Set([...i.labels, ...a.addLabels])];
    i.updatedAt = now;
    save(db);
    return reply(view(i, db));
  }
  if (!a.team || !a.title) return { isError: true, content: [{ type: 'text', text: 'team and title are required to create an issue' }] };
  const n = db.next++;
  const key = a.team.toUpperCase().slice(0, 5);
  const i = { id: `${key}-${n}`, team: a.team, title: a.title, description: a.description ?? '', priority: a.priority ?? 0, labels: a.labels ?? [], project: a.project ?? undefined, status: 'Todo', createdAt: now, updatedAt: now };
  i.url = `https://linear.app/acme/issue/${i.id}/${slug(i.title)}`;
  db.issues.push(i);
  save(db);
  return reply(view(i, db));
});

server.registerTool('save_comment', {
  description: 'Comment on an issue (issueId and body).',
  inputSchema: { body: z.string(), issueId: z.string().optional(), projectId: z.string().optional(), id: z.string().optional(), parentId: z.string().optional() },
}, async (a) => {
  log('save_comment', a);
  const db = load();
  const i = db.issues.find((x) => x.id.toLowerCase() === String(a.issueId ?? '').toLowerCase());
  if (!i) return { isError: true, content: [{ type: 'text', text: `No issue ${a.issueId}` }] };
  const c = { id: `c${db.comments.length + 1}`, issueId: i.id, body: a.body, createdAt: new Date().toISOString() };
  db.comments.push(c);
  i.updatedAt = c.createdAt;
  save(db);
  return reply({ id: c.id, issueId: i.id });
});

server.registerTool('list_issue_statuses', { description: 'The states of a team.', inputSchema: { team: z.string() } }, async (a) => {
  log('list_issue_statuses', a);
  return reply({ statuses: Object.keys(STATUS_TYPE).map((name) => ({ name, type: STATUS_TYPE[name] })) });
});

await server.connect(new StdioServerTransport());
