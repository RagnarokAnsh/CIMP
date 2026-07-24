import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Priority } from '../common/enums';
import { Issue, Platform } from '../entities';

// Minimal Jira Cloud REST API v3 client for one-way push (OD-05).
//
// NOTE (build-time check, per the spec): confirm the current Jira Cloud auth
// model and rate limits before going live — Atlassian changes them. This uses
// Basic auth with an account email + API token, which is the current
// documented approach for server-to-server calls.
const REQUEST_TIMEOUT_MS = 15_000;

// Jira caps the summary field at 255 characters and rejects the whole create
// call if it overflows — the reference prefix counts toward it.
const SUMMARY_MAX = 255;
const SUMMARY_BODY_MAX = 200;

@Injectable()
export class JiraService {
  private readonly logger = new Logger(JiraService.name);

  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    return Boolean(
      this.config.get<string>('jira.baseUrl') &&
        this.config.get<string>('jira.email') &&
        this.config.get<string>('jira.apiToken'),
    );
  }

  // Creates a Jira issue and returns its key (e.g. SUP-123).
  async createIssue(platform: Platform, issue: Issue): Promise<string> {
    const body = {
      fields: {
        project: { key: platform.jiraProjectKey },
        summary: this.summaryFor(issue),
        description: this.toAdf(issue.description),
        issuetype: { name: 'Task' },
        priority: { name: this.mapPriority(issue.priority) },
      },
    };
    const res = await this.request('POST', '/rest/api/3/issue', body);
    const json = (await res.json()) as { key?: string };
    if (!res.ok || !json.key) {
      throw new Error(`Jira create failed (${res.status}): ${JSON.stringify(json)}`);
    }
    return json.key;
  }

  // Pushes one attachment to an existing Jira issue (separate API call).
  async addAttachment(
    jiraKey: string,
    file: { buffer: Buffer; filename: string; contentType: string },
  ): Promise<void> {
    const form = new FormData();
    form.append(
      'file',
      new Blob([new Uint8Array(file.buffer)], { type: file.contentType }),
      file.filename,
    );
    const res = await fetch(
      `${this.baseUrl()}/rest/api/3/issue/${jiraKey}/attachments`,
      {
        method: 'POST',
        headers: { Authorization: this.authHeader(), 'X-Atlassian-Token': 'no-check' },
        body: form,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      },
    );
    if (!res.ok) {
      throw new Error(`Jira attachment failed (${res.status}) for ${jiraKey}`);
    }
  }

  // Posts a comment to an existing Jira issue (used for one-way status echoes —
  // safer than attempting workflow transitions, which need project-specific
  // transition ids).
  async addComment(jiraKey: string, text: string): Promise<void> {
    const res = await this.request('POST', `/rest/api/3/issue/${jiraKey}/comment`, {
      body: this.toAdf(text),
    });
    if (!res.ok) {
      throw new Error(`Jira comment failed (${res.status}) for ${jiraKey}`);
    }
  }

  private async request(method: string, path: string, body: unknown): Promise<Response> {
    return fetch(`${this.baseUrl()}${path}`, {
      method,
      headers: {
        Authorization: this.authHeader(),
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  }

  private baseUrl(): string {
    return (this.config.get<string>('jira.baseUrl') ?? '').replace(/\/$/, '');
  }

  private authHeader(): string {
    const email = this.config.get<string>('jira.email');
    const token = this.config.get<string>('jira.apiToken');
    return `Basic ${Buffer.from(`${email}:${token}`).toString('base64')}`;
  }

  // Jira rejects a summary containing a newline, so any multi-line report failed
  // to sync at all. Flatten to one line first (same idea as IssuesService.preview),
  // then clamp — slicing raw text would just carry the newlines through.
  private summaryFor(issue: Issue): string {
    const oneLine = (issue.description ?? '').replace(/\s+/g, ' ').trim();
    return `[${issue.referenceNo}] ${oneLine.slice(0, SUMMARY_BODY_MAX)}`.slice(0, SUMMARY_MAX);
  }

  private mapPriority(p: Priority): string {
    switch (p) {
      case Priority.CRITICAL: return 'Highest';
      case Priority.HIGH: return 'High';
      case Priority.LOW: return 'Low';
      default: return 'Medium';
    }
  }

  // Jira v3 expects Atlassian Document Format for rich-text fields. A text node
  // whose content is empty/whitespace is invalid ADF and fails the whole call,
  // while an empty paragraph is fine — so drop the node rather than send a blank.
  private toAdf(text: string) {
    const content = (text ?? '').trim() ? [{ type: 'text', text }] : [];
    return {
      type: 'doc',
      version: 1,
      content: [{ type: 'paragraph', content }],
    };
  }
}
