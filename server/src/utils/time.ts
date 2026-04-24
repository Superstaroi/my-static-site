import { env } from '../config/env';

const dateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: env.timeZone,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const getTimeZoneDateParts = (date: Date) => {
  const parts = dateFormatter.formatToParts(date);
  const getPart = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find(part => part.type === type)?.value || '';

  return {
    year: getPart('year'),
    month: getPart('month'),
    day: getPart('day'),
  };
};

export const getTodayDateKey = (date = new Date()) => {
  const parts = getTimeZoneDateParts(date);
  return `${parts.year}-${parts.month}-${parts.day}`;
};

export const getNextResetAtIso = (date = new Date()) => {
  const currentDateKey = getTodayDateKey(date);
  let high = date.getTime() + (36 * 60 * 60 * 1000);

  while (getTodayDateKey(new Date(high)) === currentDateKey) {
    high += 12 * 60 * 60 * 1000;
  }

  let low = date.getTime();
  while (high - low > 1000) {
    const mid = Math.floor((high + low) / 2);
    if (getTodayDateKey(new Date(mid)) === currentDateKey) {
      low = mid;
    } else {
      high = mid;
    }
  }

  return new Date(high).toISOString();
};
