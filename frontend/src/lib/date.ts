import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";

dayjs.extend(relativeTime);

export function relativeDate(date: string): string {
  const localDate = dayjs(date);
  if (localDate.diff(dayjs(), "month") > 0) {
    return localDate.format("MMMM D, YYYY");
  }
  return localDate.fromNow();
}