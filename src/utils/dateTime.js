// new Date().toISOString() завжди повертає UTC. Для дефолтного значення інпутів
// типу <input type="datetime-local"> це неправильно: браузер трактує рядок як
// локальний час, тож без корекції зсуву поле показує час на N годин раніше
// реального (в Україні — на 2-3 години назад).
export const toLocalDateTimeInputValue = (date = new Date()) => {
  const tzOffsetMs = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - tzOffsetMs).toISOString().slice(0, 16);
};

export const toDateInputValue = (date) => {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

// Межі поточного календарного місяця у форматі, придатному для <input type="date">
export const getCurrentMonthRange = () => {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { dateFrom: toDateInputValue(start), dateTo: toDateInputValue(end) };
};
