/**
 * Personal insights for the dashboard.
 *
 * Every insight is a plain observation computed by a rule that is written here in full. The
 * API returns the `kind` and the numbers behind it; clients phrase it and can explain it,
 * because nothing about it is hidden. There is no composite "productivity score".
 */

/** How many insights the dashboard shows at once. */
const MAX_INSIGHTS = 4;
/** A week needs at least this many due habit-days before its rate is compared. */
const MIN_DUE_FOR_RATE = 3;

const rate = (days) => {
  const due = days.reduce((sum, day) => sum + day.due, 0);
  const completed = days.reduce((sum, day) => sum + day.completed, 0);
  return { due, completed, rate: due === 0 ? null : completed / due };
};

/**
 * @param {object} input
 * @param {{ date: string, due: number, completed: number }[]} input.thisWeek  The last 7 days.
 * @param {{ date: string, due: number, completed: number }[]} input.lastWeek  The 7 days before.
 * @param {object[]} input.habitItems   Today's habit items (state, due, streak, habit).
 * @param {number}   input.overdueTasks Open tasks past their due date.
 * @param {object[]} input.goals        Active goals with their computed figures.
 * @param {object[]} input.upcoming     Calendar items of the next 7 days.
 * @param {string}   input.today
 * @returns {{ kind: string, tone: 'positive'|'neutral'|'attention', params: object }[]}
 */
export function buildInsights({
  thisWeek,
  lastWeek,
  habitItems,
  overdueTasks,
  goals,
  upcoming,
  today,
}) {
  const insights = [];

  // 1. Everything due today is done.
  const dueToday = habitItems.filter(
    (item) => item.due && !['skipped', 'postponed'].includes(item.state),
  );
  if (dueToday.length > 0 && dueToday.every((item) => item.state === 'completed')) {
    insights.push({
      kind: 'all_habits_done',
      tone: 'positive',
      params: { count: dueToday.length },
    });
  }

  // 2. Tasks past their due date.
  if (overdueTasks > 0) {
    insights.push({ kind: 'overdue_tasks', tone: 'attention', params: { count: overdueTasks } });
  }

  // 3. A goal whose target date is within a week.
  const closing = goals
    .filter(
      (goal) =>
        goal.computed.daysLeft !== null &&
        goal.computed.daysLeft >= 0 &&
        goal.computed.daysLeft <= 7,
    )
    .sort((a, b) => a.computed.daysLeft - b.computed.daysLeft)[0];
  if (closing) {
    insights.push({
      kind: 'goal_deadline',
      tone: 'attention',
      params: {
        goalId: closing.id,
        title: closing.title,
        days: closing.computed.daysLeft,
        percent: Math.round(closing.computed.percent),
      },
    });
  }

  // 4. Habit completion this week compared with the week before, in percentage points.
  const current = rate(thisWeek);
  const previous = rate(lastWeek);
  if (current.due >= MIN_DUE_FOR_RATE && previous.due >= MIN_DUE_FOR_RATE) {
    const change = Math.round((current.rate - previous.rate) * 100);
    if (Math.abs(change) >= 5) {
      insights.push({
        kind: change > 0 ? 'habit_rate_up' : 'habit_rate_down',
        tone: change > 0 ? 'positive' : 'neutral',
        params: {
          current: Math.round(current.rate * 100),
          previous: Math.round(previous.rate * 100),
          change: Math.abs(change),
        },
      });
    }
  }

  // 5. A habit close to the streak the user is aiming for.
  const nearGoal = habitItems
    .filter(
      (item) =>
        item.habit.streakGoal &&
        item.streak.current < item.habit.streakGoal &&
        item.habit.streakGoal - item.streak.current <= 3,
    )
    .sort(
      (a, b) => a.habit.streakGoal - a.streak.current - (b.habit.streakGoal - b.streak.current),
    )[0];
  if (nearGoal) {
    insights.push({
      kind: 'streak_goal_near',
      tone: 'positive',
      params: {
        habitId: nearGoal.habitId,
        name: nearGoal.habit.name,
        remaining: nearGoal.habit.streakGoal - nearGoal.streak.current,
        goal: nearGoal.habit.streakGoal,
      },
    });
  }

  // 6. The longest running streak, once it is a week long.
  const longest = [...habitItems].sort((a, b) => b.streak.current - a.streak.current)[0];
  if (longest && longest.streak.unit === 'days' && longest.streak.current >= 7) {
    insights.push({
      kind: 'long_streak',
      tone: 'positive',
      params: { habitId: longest.habitId, name: longest.habit.name, count: longest.streak.current },
    });
  }

  // 7. A day in the coming week with three or more timed entries.
  const perDay = new Map();
  for (const item of upcoming) {
    if (item.allDay || item.date <= today) continue;
    perDay.set(item.date, (perDay.get(item.date) ?? 0) + 1);
  }
  const busiest = [...perDay].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
  if (busiest && busiest[1] >= 3) {
    insights.push({
      kind: 'busy_day',
      tone: 'neutral',
      params: { date: busiest[0], count: busiest[1] },
    });
  }

  return insights.slice(0, MAX_INSIGHTS);
}

export { rate as summarizeDays };
