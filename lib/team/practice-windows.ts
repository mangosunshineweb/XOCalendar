import { addDays, format, startOfWeek } from "date-fns";

export type DefaultPracticeDay = {
  id: string;
  weekday: number;
  start_time: string;
  end_time: string;
};

export type PracticeWindow = {
  id: string;
  date: string;
  label: string;
  weekday: number;
  isPracticeDay: boolean;
  startTime: string | null;
  endTime: string | null;
};

function normalizeTime(value: string): string {
  // Supabase time fields can come as HH:mm:ss; UI and API payloads expect HH:mm.
  return value.length >= 5 ? value.slice(0, 5) : value;
}

export function buildPracticeWindows(
  defaults: DefaultPracticeDay[],
  baseDate = new Date()
): PracticeWindow[] {
  const weekStart = startOfWeek(baseDate, { weekStartsOn: 1 });
  const defaultsByWeekday = new Map(defaults.map((day) => [day.weekday, day]));

  return Array.from({ length: 7 }, (_, offset) => {
    const actualDate = addDays(weekStart, offset);
    const weekday = offset === 6 ? 0 : offset + 1;
    const configured = defaultsByWeekday.get(weekday);

    return {
      id: configured?.id ?? `day-${format(actualDate, "yyyy-MM-dd")}`,
      date: format(actualDate, "yyyy-MM-dd"),
      label: format(actualDate, "EEE d MMM"),
      weekday,
      isPracticeDay: Boolean(configured),
      startTime: configured ? normalizeTime(configured.start_time) : null,
      endTime: configured ? normalizeTime(configured.end_time) : null,
    };
  });
}
