import { BadRequestException } from '@nestjs/common';
import { IssueStatus, Priority } from '../common/enums';
import { buildPrefixTsQuery } from './search-terms';

// A deliberately small, AND-only filter grammar for saved views ("JQL-like"):
//
//   status = NEW AND priority IN (HIGH, CRITICAL) AND assignee = me
//   platform != portal-b AND label = bug AND created >= 2026-07-01
//   text ~ "login error" AND reporter ~ jane
//
// clause := field op value | field IN (v, v, ...)
// fields/ops:
//   status, priority        = != IN     (enum values, case-insensitive)
//   platform                = != IN     (platform KEY)
//   assignee                = != ~ IN   (name; `me` / `unassigned` sentinels)
//   reporter                = != ~      (name or email)
//   label                   = != IN     (label name)
//   created, updated        >= <=       (ISO date / timestamp)
//   text                    ~           (full-text over description+comments)
// v1 is AND-only — no OR, no parentheses grouping. Values with spaces are
// double-quoted. Parse errors surface as 400s with a pointed message.

export type JqlOp = '=' | '!=' | '~' | '>=' | '<=' | 'in';

export interface JqlFilter {
  field: string;
  op: JqlOp;
  values: string[];
}

interface FieldSpec {
  ops: JqlOp[];
  enumValues?: string[];
  isDate?: boolean;
}

const FIELDS: Record<string, FieldSpec> = {
  status: { ops: ['=', '!=', 'in'], enumValues: Object.values(IssueStatus) },
  priority: { ops: ['=', '!=', 'in'], enumValues: Object.values(Priority) },
  platform: { ops: ['=', '!=', 'in'] },
  assignee: { ops: ['=', '!=', '~', 'in'] },
  reporter: { ops: ['=', '!=', '~'] },
  label: { ops: ['=', '!=', 'in'] },
  created: { ops: ['>=', '<='], isDate: true },
  updated: { ops: ['>=', '<='], isDate: true },
  text: { ops: ['~'] },
};

const bad = (message: string): never => {
  throw new BadRequestException(`JQL: ${message}`);
};

interface Token {
  kind: 'word' | 'string' | 'op' | 'lparen' | 'rparen' | 'comma';
  value: string;
}

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  const re = /"([^"]*)"|(!=|>=|<=|=|~)|(\()|(\))|(,)|([^\s(),"]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(input)) !== null) {
    if (m[1] !== undefined) tokens.push({ kind: 'string', value: m[1] });
    else if (m[2]) tokens.push({ kind: 'op', value: m[2] });
    else if (m[3]) tokens.push({ kind: 'lparen', value: '(' });
    else if (m[4]) tokens.push({ kind: 'rparen', value: ')' });
    else if (m[5]) tokens.push({ kind: 'comma', value: ',' });
    else tokens.push({ kind: 'word', value: m[6] });
  }
  return tokens;
}

function normalizeValue(field: string, spec: FieldSpec, raw: string): string {
  if (spec.enumValues) {
    const upper = raw.toUpperCase();
    if (!spec.enumValues.includes(upper)) {
      bad(`"${raw}" is not a valid ${field}. Valid values: ${spec.enumValues.join(', ')}.`);
    }
    return upper;
  }
  if (spec.isDate) {
    if (!/^\d{4}-\d{2}-\d{2}([T ].*)?$/.test(raw) || Number.isNaN(Date.parse(raw))) {
      bad(`${field} expects an ISO date (YYYY-MM-DD), got "${raw}".`);
    }
  }
  return raw;
}

export function parseJql(input: string): JqlFilter[] {
  if (!input?.trim()) bad('empty query.');
  const tokens = tokenize(input);
  const filters: JqlFilter[] = [];
  let i = 0;

  const next = (): Token | undefined => tokens[i++];
  const peek = (): Token | undefined => tokens[i];

  for (;;) {
    const fieldTok = next();
    if (!fieldTok || fieldTok.kind !== 'word') {
      bad(`expected a field name${fieldTok ? ` near "${fieldTok.value}"` : ' at end of query'}.`);
    }
    const field = fieldTok!.value.toLowerCase();
    const spec = FIELDS[field];
    if (!spec) {
      bad(`Unknown field "${fieldTok!.value}". Fields: ${Object.keys(FIELDS).join(', ')}.`);
    }

    const opTok = next();
    let op: JqlOp;
    if (opTok?.kind === 'op') op = opTok.value as JqlOp;
    else if (opTok?.kind === 'word' && opTok.value.toLowerCase() === 'in') op = 'in';
    else {
      bad(`expected an operator after "${field}"${opTok ? `, got "${opTok.value}"` : ''}.`);
      throw new Error('unreachable');
    }
    if (!spec!.ops.includes(op)) {
      bad(`Operator "${op === 'in' ? 'IN' : op}" is not valid for ${field}. Allowed: ${spec!.ops.map((o) => (o === 'in' ? 'IN' : o)).join(' ')}.`);
    }

    const values: string[] = [];
    if (op === 'in') {
      if (next()?.kind !== 'lparen') bad(`IN for ${field} expects a parenthesized list, e.g. ${field} IN (a, b).`);
      for (;;) {
        const v = next();
        if (!v || (v.kind !== 'word' && v.kind !== 'string')) bad(`expected a value in the ${field} IN list.`);
        values.push(normalizeValue(field, spec!, v!.value));
        const sep = next();
        if (sep?.kind === 'rparen') break;
        if (sep?.kind !== 'comma') bad(`expected "," or ")" in the ${field} IN list.`);
      }
      if (values.length === 0) bad(`${field} IN list is empty.`);
    } else {
      const v = next();
      if (!v || (v.kind !== 'word' && v.kind !== 'string')) {
        bad(`expected a value after "${field} ${op}". Quote values containing spaces.`);
      }
      values.push(normalizeValue(field, spec!, v!.value));
    }

    filters.push({ field, op, values });

    const sep = peek();
    if (!sep) break;
    if (sep.kind === 'word' && sep.value.toLowerCase() === 'and') {
      i += 1;
      if (!peek()) bad('dangling AND at end of query.');
      continue;
    }
    if (sep.kind === 'word' && sep.value.toLowerCase() === 'or') {
      bad('OR is not supported (filters are AND-only for now).');
    }
    bad(`unexpected "${sep.value}" — clauses are joined with AND.`);
  }

  return filters;
}

// Minimal structural type so the pure-function unit tests can stub the qb.
interface WhereBuilder {
  andWhere(sql: string, params?: Record<string, unknown>): unknown;
}

// Translate parsed filters onto the (already platform-SCOPED) issues list
// query builder. Assumes the aliases of buildListQuery: issue, platform,
// reporter, assignee. `staffId` resolves the `me` sentinel.
export function applyJqlFilters(qb: WhereBuilder, filters: JqlFilter[], staffId: string): void {
  let n = 0;
  const p = (): string => `jql${n++}`;

  for (const f of filters) {
    const lower = f.values.map((v) => v.toLowerCase());
    switch (f.field) {
      case 'status':
      case 'priority': {
        const col = `issue.${f.field}`;
        const name = p();
        if (f.op === 'in') qb.andWhere(`${col} IN (:...${name})`, { [name]: f.values });
        else if (f.op === '=') qb.andWhere(`${col} = :${name}`, { [name]: f.values[0] });
        else qb.andWhere(`${col} != :${name}`, { [name]: f.values[0] });
        break;
      }
      case 'platform': {
        const name = p();
        if (f.op === 'in') qb.andWhere(`platform.key IN (:...${name})`, { [name]: lower });
        else if (f.op === '=') qb.andWhere(`platform.key = :${name}`, { [name]: lower[0] });
        else qb.andWhere(`platform.key != :${name}`, { [name]: lower[0] });
        break;
      }
      case 'assignee': {
        const v = lower[0];
        if (f.op === '~') {
          const name = p();
          qb.andWhere(`assignee.name ILIKE :${name}`, { [name]: `%${f.values[0]}%` });
        } else if (f.op === 'in') {
          const name = p();
          qb.andWhere(`LOWER(assignee.name) IN (:...${name})`, { [name]: lower });
        } else if (v === 'me') {
          const name = p();
          if (f.op === '=') qb.andWhere(`assignee.id = :${name}`, { [name]: staffId });
          else qb.andWhere(`(assignee.id IS NULL OR assignee.id != :${name})`, { [name]: staffId });
        } else if (v === 'unassigned') {
          qb.andWhere(f.op === '=' ? 'assignee.id IS NULL' : 'assignee.id IS NOT NULL');
        } else {
          const name = p();
          if (f.op === '=') qb.andWhere(`LOWER(assignee.name) = :${name}`, { [name]: v });
          else qb.andWhere(`(assignee.id IS NULL OR LOWER(assignee.name) != :${name})`, { [name]: v });
        }
        break;
      }
      case 'reporter': {
        const name = p();
        if (f.op === '~') {
          qb.andWhere(`(reporter.name ILIKE :${name} OR reporter.email ILIKE :${name})`, {
            [name]: `%${f.values[0]}%`,
          });
        } else if (f.op === '=') {
          qb.andWhere(`(LOWER(reporter.name) = :${name} OR LOWER(reporter.email) = :${name})`, {
            [name]: lower[0],
          });
        } else {
          qb.andWhere(`(LOWER(reporter.name) != :${name} AND LOWER(reporter.email) != :${name})`, {
            [name]: lower[0],
          });
        }
        break;
      }
      case 'label': {
        const name = p();
        const exists = `EXISTS (
          SELECT 1 FROM issue_labels il JOIN labels l ON l.id = il.label_id
          WHERE il.issue_id = issue.id AND LOWER(l.name) IN (:...${name})
        )`;
        qb.andWhere(f.op === '!=' ? `NOT ${exists}` : exists, { [name]: lower });
        break;
      }
      case 'created':
      case 'updated': {
        const name = p();
        const col = f.field === 'created' ? 'issue.created_at' : 'issue.updated_at';
        qb.andWhere(`${col} ${f.op} :${name}`, { [name]: f.values[0] });
        break;
      }
      case 'text': {
        const tsq = buildPrefixTsQuery(f.values[0]);
        const like = p();
        const likeParam = { [like]: `%${f.values[0].replace(/[\\%_]/g, '\\$&')}%` };
        if (tsq) {
          const tq = p();
          qb.andWhere(
            `(issue.reference_no ILIKE :${like}
              OR issue.search_vector @@ to_tsquery('english', :${tq})
              OR (issue.search_vector IS NULL AND issue.description ILIKE :${like}))`,
            { ...likeParam, [tq]: tsq },
          );
        } else {
          qb.andWhere(`(issue.reference_no ILIKE :${like} OR issue.description ILIKE :${like})`, likeParam);
        }
        break;
      }
      /* istanbul ignore next -- parseJql guarantees known fields */
      default:
        bad(`Unknown field "${f.field}".`);
    }
  }
}
