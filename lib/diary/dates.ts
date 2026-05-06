const formatter = new Intl.DateTimeFormat("ru-RU", {
  day: "2-digit",
  month: "2-digit",
});

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function formatHistoryDate(isoDate: string) {
  const date = new Date(isoDate);
  const today = startOfDay(new Date());
  const target = startOfDay(date);
  const diffDays = Math.round(
    (today.getTime() - target.getTime()) / (1000 * 60 * 60 * 24),
  );

  if (diffDays === 0) {
    return "Сегодня";
  }

  if (diffDays === 1) {
    return "Вчера";
  }

  return formatter.format(date);
}

export function formatEntryTime(isoDate: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(isoDate));
}

