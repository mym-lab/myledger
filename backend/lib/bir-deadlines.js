// ─── BIR Filing Deadline Engine ───────────────────────────────
// Computes the next upcoming deadline for each selected tax type.
// Reference: BIR Revenue Regulations, calendar-year filers.

const fmt = (dt) =>
  dt.toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });

const daysUntil = (dt, now) =>
  Math.ceil((dt.getTime() - now.getTime()) / 86400000);

const urgency = (d) => (d <= 7 ? 'urgent' : d <= 21 ? 'upcoming' : 'normal');

// Return the next date >= today where day=dueDay and month is (currentMonth+1), (currentMonth+2), ...
function nextMonthlyDate(now, dueDay) {
  const d = new Date(now.getFullYear(), now.getMonth() + 1, dueDay);
  return d >= now ? d : new Date(now.getFullYear(), now.getMonth() + 2, dueDay);
}

// Quarter end dates for the given year
function quarterEnds(year) {
  return [
    new Date(year, 2, 31),   // Q1 Mar 31
    new Date(year, 5, 30),   // Q2 Jun 30
    new Date(year, 8, 30),   // Q3 Sep 30
    new Date(year, 11, 31),  // Q4 Dec 31
  ];
}

// Next date >= now that is X days after a quarter end
function nextQuarterlyDate(now, offsetDays) {
  const years = [now.getFullYear(), now.getFullYear() + 1];
  for (const y of years) {
    for (const qEnd of quarterEnds(y)) {
      const dt = new Date(qEnd.getTime() + offsetDays * 86400000);
      if (dt >= now) return dt;
    }
  }
  return null;
}

export function getUpcomingDeadlines(taxTypes = [], ref = new Date()) {
  const now = new Date(ref);
  now.setHours(0, 0, 0, 0);

  const results = [];

  for (const code of taxTypes) {
    let dt = null;
    let name = '';

    switch (code) {
      case '2550M':
        dt   = nextMonthlyDate(now, 20);
        name = 'BIR Form 2550M — Monthly VAT Return';
        break;
      case '1601C':
        dt   = nextMonthlyDate(now, 10);
        name = 'BIR Form 1601-C — WHT on Compensation';
        break;
      case '1550':
        dt   = nextMonthlyDate(now, 5);
        name = 'BIR Form 1550 — Documentary Stamp Tax';
        break;
      case '2551M':
        dt   = nextMonthlyDate(now, 20);
        name = 'BIR Form 2551M — Monthly Percentage Tax';
        break;
      case '2551Q':
        dt   = nextQuarterlyDate(now, 25);
        name = 'BIR Form 2551Q — Quarterly Percentage Tax';
        break;
      case '2550Q':
        dt   = nextQuarterlyDate(now, 25);
        name = 'BIR Form 2550Q — Quarterly VAT Return';
        break;
      case '1601EQ':
        dt   = nextQuarterlyDate(now, 25);
        name = 'BIR Form 1601-EQ — Expanded WHT';
        break;
      case '1702Q':
        dt   = nextQuarterlyDate(now, 60);
        name = 'BIR Form 1702Q — Quarterly IT (Corporation)';
        break;
      case '1701Q':
        dt   = nextQuarterlyDate(now, 60);
        name = 'BIR Form 1701Q — Quarterly IT (Individual)';
        break;
      case '1702': {
        let yr = now.getFullYear();
        let apr = new Date(yr, 3, 15);
        if (apr < now) apr = new Date(yr + 1, 3, 15);
        dt   = apr;
        name = 'BIR Form 1702 — Annual IT (Corporation)';
        break;
      }
      case '1701': {
        let yr = now.getFullYear();
        let apr = new Date(yr, 3, 15);
        if (apr < now) apr = new Date(yr + 1, 3, 15);
        dt   = apr;
        name = 'BIR Form 1701 — Annual IT (Individual)';
        break;
      }
    }

    if (dt) {
      const d = daysUntil(dt, now);
      results.push({ form: code, name, dueDate: fmt(dt), daysUntil: d, urgency: urgency(d) });
    }
  }

  return results.sort((a, b) => a.daysUntil - b.daysUntil);
}
