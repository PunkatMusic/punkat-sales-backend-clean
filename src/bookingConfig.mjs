export const STUDIO_TIMEZONE = "Europe/Luxembourg";
export const BOOKING_HOLD_MINUTES = 20;

// Add single closed dates here when the studio is unavailable for the full day.
// Example: "2026-08-15"
export const bookingClosedDates = [
  "2026-07-04",
  "2026-07-07",
  "2026-07-11",
  "2026-07-12",
  "2026-07-13",
];

// Add closed date ranges here when multiple full days should be unavailable.
// Both start and end are inclusive.
// Example: { start: "2026-08-01", end: "2026-08-14", label: "Summer break" }
export const bookingClosedDateRanges = [
  { start: "2026-07-15", end: "2026-07-31", label: "Studio closed" },
];

// Use these overrides for partial-day availability changes on specific dates.
// `availableStartHour` and `availableEndHour` are inclusive/exclusive studio hours in 24h format.
// Example: { date: "2026-08-03", availableStartHour: 20 } means only 20:00 and later can be booked.
export const bookingDateOverrides = [
  { date: "2026-07-05", availableEndHour: 18 },
  { date: "2026-07-08", availableEndHour: 18 },
  { date: "2026-07-10", availableStartHour: 20 },
  { date: "2026-07-14", availableEndHour: 18 },
];

export const bookingServices = [
  {
    slug: "lesson-workshop",
    name: "Private Lesson / Workshop",
    rate: 40,
    currency: "EUR",
    minimumHours: 1,
    maximumHours: 14,
    pricingModel: "hourly",
    bookable: true,
    hours: {
      weekday: { start: 10, end: 24 },
      weekend: { start: 10, end: 24 },
    },
    description:
      "Logic Pro music production, recording prep, microphone placement, recording, editing, mix and mastering.",
  },
  {
    slug: "recording",
    name: "Recording Session",
    rate: 20,
    currency: "EUR",
    minimumHours: 1,
    maximumHours: 6,
    pricingModel: "hourly",
    bookable: true,
    hours: {
      weekday: { start: 18, end: 24 },
      weekend: { start: 20, end: 24 },
    },
    description: "Recording service in the studio.",
  },
  {
    slug: "rehearsal",
    name: "Rehearsal Session",
    rate: 5,
    currency: "EUR",
    minimumHours: 1,
    maximumHours: 14,
    pricingModel: "per_person_hour",
    participants: {
      min: 1,
      max: 5,
    },
    bookable: true,
    hours: {
      weekday: { start: 18, end: 24 },
      weekend: { start: 10, end: 24 },
    },
    description: "Rehearsal room booking for up to 5 people.",
  },
  {
    slug: "mix-mastering",
    name: "Edit / Mix / Mastering",
    rate: 20,
    currency: "EUR",
    minimumHours: 1,
    pricingModel: "hourly",
    bookable: false,
    contactOnly: true,
    description: "This service is arranged directly by phone or email and is not bookable online.",
  },
];

export function getBookingServiceBySlug(slug) {
  return bookingServices.find((service) => service.slug === slug) || null;
}

export function getBookingDateOverride(dateString) {
  return bookingDateOverrides.find((override) => override?.date === dateString) || null;
}

export function isStudioClosedOnDate(dateString) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateString || ""))) {
    return false;
  }

  const override = getBookingDateOverride(dateString);

  if (override?.closed) {
    return true;
  }

  if (bookingClosedDates.includes(dateString)) {
    return true;
  }

  return bookingClosedDateRanges.some((range) => {
    if (!range?.start || !range?.end) {
      return false;
    }

    return dateString >= range.start && dateString <= range.end;
  });
}

export function getBookingClosures() {
  return {
    closedDates: bookingClosedDates,
    closedDateRanges: bookingClosedDateRanges,
    dateOverrides: bookingDateOverrides,
  };
}
