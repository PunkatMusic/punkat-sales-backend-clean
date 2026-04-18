export const STUDIO_TIMEZONE = "Europe/Luxembourg";
export const BOOKING_HOLD_MINUTES = 20;

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
