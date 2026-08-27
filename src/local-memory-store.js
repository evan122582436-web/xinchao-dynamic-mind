import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, appendFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const KIND_SET = new Set(['relationship', 'task', 'dream', 'tech', 'conflict', 'reflection', 'event']);

function compact(value, maxLength = 800) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function clamp(value, min = 0, max = 1) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, number));
}

function normalizeKind(value = '') {
  const kind = compact(value, 40).toLowerCase();
  return KIND_SET.has(kind) ? kind : 'event';
}

function normalizeTags(value = []) {
  const list = Array.isArray(value) ? value : String(value ?? '').split(',');
  return [...new Set(list
    .map((item) => compact(item, 40).toLowerCase())
    .filter(Boolean))]
    .slice(0, 12);
}

function eventKind(interactionType = '', summary = '') {
  const type = compact(interactionType, 40).toLowerCase();
  if (type === 'conflict' || type === 'loss' || type === 'reconciliation') return 'conflict';
  if (/\b(mcp|api|github|docker|server|shell|token|dashboard)\b/i.test(summary) || /心潮|服务器|前端|后端|记忆库|云朵|腾讯云/.test(summary)) {
    return 'tech';
  }
  if (type === 'task_progress') return 'task';
  if (type === 'reflection') return 'reflection';
  if (type === 'intimacy' || type === 'affection' || type === 'companionship') return 'relationship';
  return 'event';
}

function eventTitle(interactionType = '', summary = '') {
  const text = compact(summary, 48);
  if (text) return text;
  const type = compact(interactionType, 40);
  return type ? `心潮互动：${type}` : '心潮事件';
}

function memoryId(sourceEventId = '', createdAt = '') {
  const source = compact(sourceEventId, 160);
  if (source) {
    return createHash('sha256').update(source).digest('hex').slice(0, 24);
  }
  return `${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;
}

function parseLines(text = '') {
  const records = [];
  for (const line of String(text).split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const record = JSON.parse(trimmed);
      if (record && typeof record === 'object') records.push(record);
    } catch {
      // Ignore malformed trailing or hand-edited lines; the log remains recoverable.
    }
  }
  return records;
}

function foldRecords(records = []) {
  const byId = new Map();
  const tombstones = new Map();
  for (const record of records) {
    if (record.type === 'delete' && record.id) {
      tombstones.set(record.id, {
        deletedAt: compact(record.deletedAt, 40),
        deleteReason: compact(record.reason, 300),
      });
      continue;
    }
    if (record.type !== 'memory' || !record.id) continue;
    byId.set(record.id, record);
  }
  for (const [id, tombstone] of tombstones.entries()) {
    const item = byId.get(id);
    if (item) byId.set(id, { ...item, ...tombstone });
  }
  return [...byId.values()]
    .filter((item) => !item.deletedAt)
    .sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)));
}

export class LocalMemoryStore {
  constructor(path, options = {}) {
    this.path = path;
    this.maxSummaryChars = Number(options.maxSummaryChars ?? 800);
  }

  async append(record) {
    await mkdir(dirname(this.path), { recursive: true });
    await appendFile(this.path, `${JSON.stringify(record)}\n`, 'utf8');
  }

  async records() {
    try {
      return parseLines(await readFile(this.path, 'utf8'));
    } catch (error) {
      if (error.code === 'ENOENT') return [];
      throw error;
    }
  }

  async entries({ includeDeleted = false } = {}) {
    const records = await this.records();
    if (!includeDeleted) return foldRecords(records);
    return records.filter((record) => record.type === 'memory');
  }

  async write(input = {}, now = new Date()) {
    const sourceEventId = compact(input.sourceEventId ?? input.source_event_id, 160);
    const entries = await this.entries();
    const duplicate = sourceEventId
      ? entries.find((item) => item.sourceEventId === sourceEventId)
      : null;
    if (duplicate) return { item: duplicate, duplicate: true };

    const summary = compact(input.summary, this.maxSummaryChars);
    if (!summary) throw new Error('summary is required');
    const createdAt = now.toISOString();
    const item = {
      type: 'memory',
      id: compact(input.id, 80) || memoryId(sourceEventId, createdAt),
      createdAt,
      kind: normalizeKind(input.kind),
      title: compact(input.title, 80) || eventTitle('', summary),
      summary,
      tags: normalizeTags(input.tags),
      salience: Number(clamp(input.salience ?? 0.55).toFixed(3)),
      source: compact(input.source, 60) || 'local',
      sourceEventId: sourceEventId || null,
      sessionId: compact(input.sessionId ?? input.session_id, 120) || null,
    };
    await this.append(item);
    return { item, duplicate: false };
  }

  async writeConversationEvent(event = {}, result = {}, meta = {}, now = new Date()) {
    const interactionType = compact(event.interactionType ?? event.interaction_type, 40).toLowerCase();
    const summary = compact(event.contextSummary ?? event.context_summary, this.maxSummaryChars);
    const tone = compact(event.sessionState?.tone ?? event.tone, 40);
    const affected = (result.interaction?.affectedDrives ?? [])
      .map((item) => typeof item === 'string' ? item : (item?.label ?? item?.key))
      .filter(Boolean)
      .slice(0, 4);
    const fallback = [
      interactionType ? `心潮互动：${interactionType}` : '',
      tone ? `窗口语气：${tone}` : '',
      affected.length ? `影响维度：${affected.join('、')}` : '',
    ].filter(Boolean).join('；');
    const text = summary || fallback;
    if (!text) return { item: null, duplicate: false, skipped: true };
    return this.write({
      kind: eventKind(interactionType, text),
      title: eventTitle(interactionType, text),
      summary: text,
      tags: ['xinchao', 'event', interactionType].filter(Boolean),
      salience: interactionType === 'task_progress' || summary ? 0.72 : 0.48,
      source: meta.source ?? 'event',
      sourceEventId: event.eventId ?? event.event_id,
      sessionId: event.sessionId ?? event.session_id,
    }, now);
  }

  async recent({ limit = 10, kind = '' } = {}) {
    const max = Math.max(1, Math.min(50, Number(limit) || 10));
    const normalizedKind = compact(kind, 40).toLowerCase();
    return (await this.entries())
      .filter((item) => !normalizedKind || item.kind === normalizedKind)
      .slice(0, max);
  }

  async search({ query = '', limit = 10, kind = '' } = {}) {
    const q = compact(query, 200).toLowerCase();
    if (!q) return this.recent({ limit, kind });
    const terms = q.split(/\s+/).filter(Boolean);
    const normalizedKind = compact(kind, 40).toLowerCase();
    const max = Math.max(1, Math.min(50, Number(limit) || 10));
    return (await this.entries())
      .filter((item) => !normalizedKind || item.kind === normalizedKind)
      .map((item) => {
        const haystack = [
          item.kind,
          item.title,
          item.summary,
          ...(item.tags ?? []),
        ].join(' ').toLowerCase();
        const score = terms.reduce((total, term) => total + (haystack.includes(term) ? 1 : 0), 0);
        return { item, score };
      })
      .filter(({ score }) => score > 0)
      .sort((left, right) => right.score - left.score || String(right.item.createdAt).localeCompare(String(left.item.createdAt)))
      .slice(0, max)
      .map(({ item, score }) => ({ ...item, score }));
  }

  async forget(id, reason = '', now = new Date()) {
    const memoryIdValue = compact(id, 120);
    if (!memoryIdValue) throw new Error('id is required');
    const entries = await this.entries();
    const item = entries.find((entry) => entry.id === memoryIdValue);
    if (!item) return { forgotten: false, id: memoryIdValue };
    await this.append({
      type: 'delete',
      id: memoryIdValue,
      deletedAt: now.toISOString(),
      reason: compact(reason, 300) || 'manual forget',
    });
    return { forgotten: true, id: memoryIdValue };
  }
}
