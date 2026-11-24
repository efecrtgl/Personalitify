/**
 * Highlights of an analytics period.
 *
 * Like the dashboard insights, each highlight is a plain observation produced by a rule
 * written here in full. The API returns the `kind` and the numbers behind it; clients phrase
 * it. A rule stays silent when the period holds too little data to support it.
 */

const MAX_HIGHLIGHTS = 6;
/** Due habit-days a period needs before its completion rate is compared with another. */
const MIN_DUE_FOR_COMPARISON = 5;
/** Due days (or periods) a habit or weekday needs before it is singled out. */
const MIN_DUE_FOR_RANKING = 3;
/** Completed tasks with a due date needed before punctuality is reported. */
const MIN_TASKS_FOR_PUNCTUALITY = 5;

const percent = (rate) => Math.round(rate * 100);

/**
 * @param {object} input
 * @param {string} input.period            week | month | quarter | year
 * @param {boolean} input.complete         Whether the period is over.
 * @param {{ due: number, rate: number|null, previous: { due: number, rate: number|null } }} input.habits
 * @param {{ weekday: number, due: number, rate: number|null }[]} input.byWeekday
 * @param {{ name: string, due: number, missed: number, rate: number|null }[]} input.perHabit
 * @param {{ completed: number, onTime: number, late: number, previous: { completed: number } }} input.tasks
 * @param {{ date: string, tasksCompleted: number }[]} input.days
 * @param {{ completed: number, milestonesCompleted: number }} input.goals
 * @returns {{ kind: string, tone: 'positive'|'neutral'|'attention', params: object }[]}
 */
export function buildHighlights({
  period,
  complete,
  habits,
  byWeekday,
  perHabit,
  tasks,
  days,
  goals,
}) {
  const highlights = [];

  // Completion rate against the previous period, from five points of difference.
  if (
    habits.rate !== null &&
    habits.previous.rate !== null &&
    habits.due >= MIN_DUE_FOR_COMPARISON &&
    habits.previous.due >= MIN_DUE_FOR_COMPARISON
  ) {
    const points = percent(habits.rate) - percent(habits.previous.rate);
    if (points >= 5) {
      highlights.push({ kind: 'habit_rate_up', tone: 'positive', params: { points } });
    } else if (points <= -5) {
      highlights.push({ kind: 'habit_rate_down', tone: 'attention', params: { points: -points } });
    }
  }

  // The habit kept most reliably, and the one that slipped most.
  const ranked = perHabit.filter(
    (habit) => habit.rate !== null && habit.due >= MIN_DUE_FOR_RANKING,
  );
  if (ranked.length >= 2) {
    const top = ranked.reduce((best, habit) => (habit.rate > best.rate ? habit : best));
    if (top.rate >= 0.8) {
      highlights.push({
        kind: 'top_habit',
        tone: 'positive',
        params: { name: top.name, percent: percent(top.rate) },
      });
    }
  }
  const struggling = ranked
    .filter((habit) => habit.rate < 0.5)
    .sort((a, b) => a.rate - b.rate || b.missed - a.missed)[0];
  if (struggling) {
    highlights.push({
      kind: 'struggling_habit',
      tone: 'attention',
      params: {
        name: struggling.name,
        percent: percent(struggling.rate),
        missed: struggling.missed,
      },
    });
  }

  // Strongest and weakest weekday; a single week has one sample per weekday, which is noise.
  if (period !== 'week') {
    const weekdays = byWeekday.filter((day) => day.rate !== null && day.due >= MIN_DUE_FOR_RANKING);
    if (weekdays.length >= 3) {
      const best = weekdays.reduce((a, b) => (b.rate > a.rate ? b : a));
      const worst = weekdays.reduce((a, b) => (b.rate < a.rate ? b : a));
      if (best.rate - worst.rate >= 0.15) {
        highlights.push({
          kind: 'best_weekday',
          tone: 'positive',
          params: { weekday: best.weekday, percent: percent(best.rate) },
        });
        highlights.push({
          kind: 'weakest_weekday',
          tone: 'neutral',
          params: { weekday: worst.weekday, percent: percent(worst.rate) },
        });
      }
    }
  }

  // Punctuality of the tasks that had a due date.
  const judged = tasks.onTime + tasks.late;
  if (judged >= MIN_TASKS_FOR_PUNCTUALITY) {
    const share = tasks.onTime / judged;
    highlights.push({
      kind: 'tasks_on_time',
      tone: share >= 0.8 ? 'positive' : share < 0.5 ? 'attention' : 'neutral',
      params: { percent: percent(share), onTime: tasks.onTime, total: judged },
    });
  }

  // Counts are compared only when the period is over; a running period is always behind.
  if (complete && tasks.completed !== tasks.previous.completed && tasks.previous.completed > 0) {
    const difference = tasks.completed - tasks.previous.completed;
    highlights.push({
      kind: difference > 0 ? 'tasks_completed_up' : 'tasks_completed_down',
      tone: difference > 0 ? 'positive' : 'neutral',
      params: { count: Math.abs(difference), completed: tasks.completed },
    });
  }

  // The one day on which most tasks were finished, when it stands alone.
  const busiest = [...days].sort((a, b) => b.tasksCompleted - a.tasksCompleted);
  if (
    busiest.length > 1 &&
    busiest[0].tasksCompleted >= 3 &&
    busiest[0].tasksCompleted > busiest[1].tasksCompleted
  ) {
    highlights.push({
      kind: 'most_productive_day',
      tone: 'positive',
      params: { date: busiest[0].date, count: busiest[0].tasksCompleted },
    });
  }

  if (goals.completed > 0) {
    highlights.push({
      kind: 'goals_completed',
      tone: 'positive',
      params: { count: goals.completed },
    });
  }
  if (goals.milestonesCompleted > 0) {
    highlights.push({
      kind: 'milestones_completed',
      tone: 'positive',
      params: { count: goals.milestonesCompleted },
    });
  }

  return highlights.slice(0, MAX_HIGHLIGHTS);
}
