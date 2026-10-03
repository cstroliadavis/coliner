const TIME_REGEX = /^(\d{1,2}):(\d{2})\s*(am|pm)?$/i;

interface RawTimeParts {
  hours: number;
  meridiem?: string;
  minutes: number;
}

/**
 * Converts 12-hour AM clock hours to 24-hour hours.
 */
function adjustAm(hours: number): number {
  if (hours === 12) return 0;

  return hours;
}

/**
 * Adjusts 12-hour clock value based on meridiem indicator.
 */
function adjustMeridiem(hours: number, meridiem: string): number {
  if (meridiem === 'pm') return adjustPm(hours);

  return adjustAm(hours);
}

/**
 * Converts 12-hour PM clock hours to 24-hour hours.
 */
function adjustPm(hours: number): number {
  if (hours === 12) return 12;

  return hours + 12;
}

/**
 * Extracts numeric components and optional meridiem indicator from regex match.
 */
function extractTimeParts(match: RegExpMatchArray): RawTimeParts {
  const meridiemRaw = match[3];
  const meridiem = meridiemRaw ? meridiemRaw.toLowerCase() : undefined;

  return {
    hours: Number(match[1]),
    meridiem,
    minutes: Number(match[2]),
  };
}

/**
 * Constructs a TypeError for invalid time input formats.
 */
function formatTimeError(paramName: string, value: unknown): TypeError {
  return new TypeError(
    `Parameter '${paramName}' expects a valid time (e.g. '12:30' or '5:30pm'), received: '${value}'`,
  );
}

/**
 * Formats validated hours and minutes into normalized HH:MM string.
 */
function formatTimeString(hours: number, minutes: number): string {
  const hh = String(hours).padStart(2, '0');
  const mm = String(minutes).padStart(2, '0');

  return `${hh}:${mm}`;
}

/**
 * Checks whether resolved hours and minutes are valid.
 */
function isTimeValid(hours: number, minutes: number): boolean {
  if (hours === -1) return false;

  return isValidMinutes(minutes);
}

/**
 * Validates minute component.
 */
function isValidMinutes(minutes: number): boolean {
  if (minutes < 0) return false;

  return minutes <= 59;
}

/**
 * Validates and converts 12-hour clock components.
 */
function normalize12Hour(hours: number, meridiem: string): number {
  if (hours < 1) return -1;
  if (hours > 12) return -1;

  return adjustMeridiem(hours, meridiem);
}

/**
 * Validates 24-hour clock components.
 */
function normalize24Hour(hours: number): number {
  if (hours < 0) return -1;
  if (hours > 23) return -1;

  return hours;
}

/**
 * Resolves hours into 24-hour representation or returns -1 if invalid.
 */
function resolveHours(hours: number, meridiem?: string): number {
  if (meridiem) return normalize12Hour(hours, meridiem);

  return normalize24Hour(hours);
}

/**
 * Validates and normalizes time parameters to 24-hour HH:MM format.
 *
 * @param value Raw parameter value from CLI input
 * @param paramName Name of parameter for error reporting
 * @returns Normalized 24-hour time string (HH:MM)
 * @throws {TypeError} If format or time values are invalid
 */
export function coerceTime(value: unknown, paramName: string): string {
  const match = String(value).trim().match(TIME_REGEX);

  if (!match) {
    throw formatTimeError(paramName, value);
  }

  const parts = extractTimeParts(match);
  const normHours = resolveHours(parts.hours, parts.meridiem);

  if (!isTimeValid(normHours, parts.minutes)) {
    throw formatTimeError(paramName, value);
  }

  return formatTimeString(normHours, parts.minutes);
}
