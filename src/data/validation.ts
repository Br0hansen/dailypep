import type { AppData } from '../core/types';

const units = ['mg', 'mcg', 'iu', 'units'];
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown, max = 20_000): v is string => typeof v === 'string' && v.length <= max;
const positive = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;
const integer = (v: unknown, min = 0): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= min;
const boundedDays = (v: unknown, min = 1): v is number => integer(v, min) && v <= 36_600;
const identifier = (v: unknown): v is string => str(v, 100) && !!v.trim();
const unit = (v: unknown) => units.includes(v as string);
const choice = (v: unknown, values: string[]) => values.includes(v as string);
const optional = (v: unknown, check: (v: unknown) => boolean) => v === undefined || check(v);
const nullable = (v: unknown, check: (v: unknown) => boolean) => v === null || check(v);
function day(v: unknown): v is string {
  if (!str(v, 10) || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const parsed = new Date(`${v}T12:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === v;
}
const timestamp = (v: unknown) => str(v, 100) && Number.isFinite(Date.parse(v));
function rule(v: unknown): boolean {
  if (!record(v)) return false;
  if (v.kind === 'interval') return boundedDays(v.days);
  if (v.kind === 'cycle') return boundedDays(v.daysOn) && boundedDays(v.daysOff, 0) && v.daysOn + v.daysOff <= 36_600;
  return v.kind === 'weekdays' && Array.isArray(v.days) && v.days.length > 0 && v.days.length <= 7
    && v.days.every(d => integer(d) && d <= 6) && new Set(v.days).size === v.days.length;
}
function phases(v: unknown): boolean {
  return Array.isArray(v) && v.length > 0 && v.length <= 1_000 && v.every((p, index) => record(p)
    && str(p.id, 100) && !!p.id && positive(p.amount) && unit(p.unit)
    && (boundedDays(p.durationDays) || (p.durationDays === null && index === v.length - 1)));
}
function collection(v: unknown, check: (row: Record<string, unknown>) => boolean): boolean {
  if (!Array.isArray(v) || v.length > 100_000) return false;
  const ids = new Set<string>();
  return v.every(row => {
    if (!record(row) || !str(row.id, 100) || !row.id || ids.has(row.id) || !check(row)) return false;
    ids.add(row.id);
    return true;
  });
}

/** Reject malformed or future-version backups before any local data is changed. */
export function validateData(input: unknown): AppData {
  if (!record(input) || input.version !== 1) throw new Error('Unsupported DailyPep backup version.');
  const good = collection(input.peptides, p => str(p.name, 300) && !!p.name.trim() && str(p.color, 100) && str(p.notes)
    && optional(p.components, v => Array.isArray(v) && v.length <= 100 && v.every(c => record(c) && str(c.name, 300) && positive(c.amount) && unit(c.unit))))
    && collection(input.protocols, p => str(p.peptideId, 100) && str(p.name, 300) && day(p.startDay)
      && nullable(p.endDay, day) && (p.endDay === null || String(p.endDay) >= String(p.startDay))
      && optional(p.planId, identifier) && optional(p.planName, v => str(v, 300) && !!v.trim()) && optional(p.vialId, identifier)
      && rule(p.rule) && phases(p.phases) && integer(p.reminderMinuteOfDay) && p.reminderMinuteOfDay < 1440 && typeof p.isActive === 'boolean')
    && collection(input.vials, p => str(p.peptideId, 100) && choice(p.kind, ['powder', 'pen']) && positive(p.amount) && unit(p.unit)
      && positive(p.volumeML) && nullable(p.preparedAt, day) && nullable(p.expiresAt, day))
    && collection(input.logs, p => str(p.protocolId, 100) && day(p.day) && positive(p.amount) && unit(p.unit)
      && choice(p.status, ['taken', 'skipped']) && timestamp(p.timestamp) && str(p.note) && optional(p.vialId, v => str(v, 100)))
    && collection(input.measurements, p => day(p.day) && str(p.name, 300) && !!p.name.trim()
      && nullable(p.value, v => typeof v === 'number' && Number.isFinite(v)) && str(p.unit, 100) && str(p.note)
      && choice(p.category, ['body', 'lab', 'other']) && optional(p.photo, v => str(v, 8_000_000) && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(v)))
    && collection(input.cycles, p => str(p.name, 300) && nullable(p.lastStartedAt, timestamp)
      && collection(p.items, i => str(i.peptideName, 300) && !!i.peptideName.trim() && str(i.color, 100)
        && positive(i.amount) && unit(i.unit) && rule(i.rule) && integer(i.weeks, 1) && i.weeks <= 5_200 && phases(i.phases)
        && optional(i.durationDays, v => nullable(v, boundedDays)) && optional(i.startOffsetDays, v => boundedDays(v, 0))
        && optional(i.components, v => Array.isArray(v) && v.length > 0 && v.length <= 100
          && v.every(c => record(c) && str(c.name, 300) && !!c.name.trim() && positive(c.amount) && choice(c.unit, ['mg', 'mcg', 'iu'])))))
    && record(input.settings) && choice(input.settings.language, ['nb', 'en']) && choice(input.settings.theme, ['electric', 'corall']);
  if (!good) throw new Error('The DailyPep backup contains invalid or incomplete data.');
  const data = input as unknown as AppData;
  const peptideIds = new Set(data.peptides.map(p => p.id));
  const protocolIds = new Set(data.protocols.map(p => p.id));
  const vialIds = new Set(data.vials.map(p => p.id));
  const protocolsById = new Map(data.protocols.map(p => [p.id, p]));
  const vialsById = new Map(data.vials.map(v => [v.id, v]));
  if (data.protocols.some(p => !peptideIds.has(p.peptideId)) || data.vials.some(v => !peptideIds.has(v.peptideId))
    || data.protocols.some(p => p.vialId !== undefined && !vialIds.has(p.vialId))
    || data.logs.some(l => !protocolIds.has(l.protocolId) || (l.vialId !== undefined && !vialIds.has(l.vialId)))) {
    throw new Error('The DailyPep backup contains references to missing records.');
  }
  if (data.protocols.some(p => p.vialId !== undefined && vialsById.get(p.vialId)?.peptideId !== p.peptideId)
    || data.logs.some(l => l.vialId !== undefined && vialsById.get(l.vialId)?.peptideId !== protocolsById.get(l.protocolId)?.peptideId)) {
    throw new Error('A linked container belongs to a different peptide.');
  }
  if (new Set(data.logs.map(l => `${l.protocolId}:${l.day}`)).size !== data.logs.length) {
    throw new Error('The DailyPep backup contains duplicate logs for the same scheduled day.');
  }
  return structuredClone(data);
}

export function emptyData(): AppData {
  return { version: 1, peptides: [], protocols: [], vials: [], logs: [], measurements: [], cycles: [], settings: { language: 'en', theme: 'electric' } };
}

export function importData(json: string): AppData {
  if (json.length > 30_000_000) throw new Error('The backup is too large (maximum 30 MB).');
  let parsed: unknown;
  try { parsed = JSON.parse(json); } catch { throw new Error('The backup is not valid JSON.'); }
  return validateData(parsed);
}

export function exportData(data: AppData): string { return JSON.stringify(validateData(data), null, 2); }
