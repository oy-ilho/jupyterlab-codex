import type { CodexRateLimitsSnapshot } from './handlers/codexMessageTypes';
import { coerceRateLimitsSnapshot as coerceRateLimitsSnapshotShared } from './handlers/codexMessageUtils';

export function truncateMiddle(value: string, max: number): string {
  if (value.length <= max) {
    return value;
  }
  const ellipsis = '...';
  if (max <= ellipsis.length) {
    return value.slice(0, max);
  }
  const head = Math.max(0, Math.floor((max - ellipsis.length) * 0.6));
  const tail = Math.max(0, max - head - ellipsis.length);
  return `${value.slice(0, head)}${ellipsis}${value.slice(value.length - tail)}`;
}

export function coerceRateLimitsSnapshot(raw: any): CodexRateLimitsSnapshot | null {
  return coerceRateLimitsSnapshotShared(raw);
}

export function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function percentLeftFromUsed(usedPercent: number | null): number | null {
  if (typeof usedPercent !== 'number' || !Number.isFinite(usedPercent)) {
    return null;
  }
  return Math.round(clampNumber(100 - usedPercent, 0, 100));
}

export function safeParseDateMs(value: string | null): number | null {
  if (!value) {
    return null;
  }
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

export function formatDurationShort(ms: number): string {
  if (!Number.isFinite(ms)) {
    return '0m';
  }
  const totalMinutes = Math.max(0, Math.floor(ms / 60000));
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) {
    return `${days}d ${hours}h`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

export function formatRunDuration(ms: number): string {
  if (!Number.isFinite(ms)) {
    return '0s';
  }
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

export function formatResetsIn(resetsAtSec: number | null, nowMs: number): string {
  if (typeof resetsAtSec !== 'number' || !Number.isFinite(resetsAtSec)) {
    return 'Unknown';
  }
  const diffMs = resetsAtSec * 1000 - nowMs;
  if (diffMs <= 0) {
    return 'Overdue';
  }
  return formatDurationShort(diffMs);
}

export function formatTokenCount(value: number | null): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return '--';
  }
  return value.toLocaleString();
}

export function getBrowserNotificationPermission(): NotificationPermission | 'unsupported' {
  if (typeof window === 'undefined' || typeof window.Notification === 'undefined') {
    return 'unsupported';
  }
  return window.Notification.permission;
}

