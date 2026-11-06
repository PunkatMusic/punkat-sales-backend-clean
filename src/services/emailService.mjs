import nodemailer from "nodemailer";
import { config } from "../config.mjs";

function formatBookingDate(value) {
  if (!value) {
    return "";
  }

  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  const text = String(value);
  return text.length >= 10 ? text.slice(0, 10) : text;
}

const signature = [
  "Best regards,",
  "Tansel GUNAY - Punkat Music Sàrls",
  "TVA: LU31084691",
  "",
  "+352 691 666 633",
  "",
  "35 Rue J.F. Kennedy, Bâtiment-B No:7a",
  "L-7327 Steinsel LUXEMBOURG",
].join("\n");

const bookingEmailCopy = {
  en: {
    confirmed: "Your Punkat Music studio booking is confirmed.",
    confirmedSubject: "Booking confirmed",
    requestReceived: "We received your booking request and the selected time is reserved while Punkat Music reviews it.",
    requestSubject: "Booking request received",
    requestNext: "You will receive a separate email confirming or declining this request.",
    paymentDue: "Payment due at the studio",
    declined: "Unfortunately, we could not confirm your requested booking for",
    declinedSubject: "Booking request not confirmed",
    released: "The time slot has been released. Please contact us if you would like to find another time.",
  },
  fr: {
    confirmed: "Votre réservation au studio Punkat Music est confirmée.",
    confirmedSubject: "Réservation confirmée",
    requestReceived: "Nous avons reçu votre demande de réservation. Le créneau est réservé pendant que Punkat Music l'examine.",
    requestSubject: "Demande de réservation reçue",
    requestNext: "Vous recevrez un email séparé confirmant ou refusant cette demande.",
    paymentDue: "Paiement à effectuer au studio",
    declined: "Nous n'avons malheureusement pas pu confirmer votre demande de réservation pour le",
    declinedSubject: "Demande de réservation non confirmée",
    released: "Le créneau a été libéré. Contactez-nous si vous souhaitez trouver un autre horaire.",
  },
  tr: {
    confirmed: "Punkat Music stüdyo rezervasyonunuz onaylandı.",
    confirmedSubject: "Rezervasyon onaylandı",
    requestReceived: "Rezervasyon talebinizi aldık. Punkat Music inceleme yaparken seçtiğiniz saat rezerve edildi.",
    requestSubject: "Rezervasyon talebi alındı",
    requestNext: "Talebinizin onaylandığını veya reddedildiğini bildiren ayrı bir email alacaksınız.",
    paymentDue: "Stüdyoda ödenecek tutar",
    declined: "Maalesef şu tarih ve saat için rezervasyon talebinizi onaylayamadık:",
    declinedSubject: "Rezervasyon talebi onaylanmadı",
    released: "Slot tekrar müsait hale getirildi. Başka bir saat bulmak için bizimle iletişime geçebilirsiniz.",
  },
};

function getBookingEmailCopy(language) {
  return bookingEmailCopy[language] || bookingEmailCopy.en;
}

function createTransporter() {
  return nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.port === 465,
    requireTLS: config.smtp.port === 587,
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
    auth: {
      user: config.smtp.user,
      pass: config.smtp.pass,
    },
  });
}

async function sendMailWithTimeout(message) {
  const transporter = createTransporter();

  await Promise.race([
    transporter.sendMail(message),
    new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error("SMTP delivery timed out."));
      }, 15000);
    }),
  ]);
}

export async function sendPurchaseLinkEmail({ buyerEmail, productName, checkoutUrl }) {
  if (!config.smtp.host || !config.smtp.user || !config.smtp.pass) {
    return {
      delivered: false,
      reason: "SMTP is not configured yet.",
    };
  }

  const subject = `${productName} purchase link`;
  const text = [
    "Hello,",
    "",
    `Your private purchase link for ${productName} is ready.`,
    "",
    `Open checkout: ${checkoutUrl}`,
    "",
    "After payment, the download link and serial will be sent to this same email address.",
    "",
    "If you did not request this email, you can ignore it.",
    "",
    signature,
  ].join("\n");

  await sendMailWithTimeout({
    from: config.smtp.from,
    to: buyerEmail,
    subject,
    text,
  });

  return {
    delivered: true,
  };
}

export async function sendLicenseEmail({ buyerEmail, productName, serial, downloadUrl }) {
  if (!config.smtp.host || !config.smtp.user || !config.smtp.pass) {
    return {
      delivered: false,
      reason: "SMTP is not configured yet.",
    };
  }

  const subject = `${productName} download and license`;
  const text = [
    "Hello,",
    "",
    `Thank you for purchasing ${productName}.`,
    "",
    `Download link: ${downloadUrl}`,
    `Serial number: ${serial}`,
    "",
    "Keep this email for your records.",
    "You will need this serial during installation or first launch.",
    "",
    signature,
  ].join("\n");

  await sendMailWithTimeout({
    from: config.smtp.from,
    to: buyerEmail,
    subject,
    text,
  });

  return {
    delivered: true,
  };
}

export async function sendBookingConfirmationEmail({
  buyerEmail,
  customerName,
  serviceName,
  bookingDate,
  startLabel,
  endLabel,
  durationHours,
  participants,
  amount,
  currency,
  customerPhone,
  customerLanguage,
  notes,
}) {
  if (!config.smtp.host || !config.smtp.user || !config.smtp.pass) {
    return {
      delivered: false,
      reason: "SMTP is not configured yet.",
    };
  }

  const formattedBookingDate = formatBookingDate(bookingDate);
  const copy = getBookingEmailCopy(customerLanguage);
  const subject = `${copy.confirmedSubject}: ${serviceName}`;
  const text = [
    `Hello ${customerName},`,
    "",
    copy.confirmed,
    "",
    `Service: ${serviceName}`,
    `Date: ${formattedBookingDate}`,
    `Time: ${startLabel} - ${endLabel}`,
    `Duration: ${durationHours} hour(s)`,
    `Participants: ${participants}`,
    `${copy.paymentDue}: ${amount.toFixed(2)} ${currency}`,
    customerPhone ? `Phone: ${customerPhone}` : null,
    notes ? `Notes: ${notes}` : null,
    "",
    "If you need to change the booking, please contact us directly by phone or email.",
    "",
    signature,
  ]
    .filter(Boolean)
    .join("\n");

  await sendMailWithTimeout({
    from: config.smtp.from,
    to: buyerEmail,
    subject,
    text,
  });

  return {
    delivered: true,
  };
}

export async function sendBookingAdminNotificationEmail({
  customerName,
  buyerEmail,
  serviceName,
  bookingDate,
  startLabel,
  endLabel,
  durationHours,
  participants,
  amount,
  currency,
  customerPhone,
  notes,
  paymentProvider,
}) {
  if (!config.smtp.host || !config.smtp.user || !config.smtp.pass) {
    return {
      delivered: false,
      reason: "SMTP is not configured yet.",
    };
  }

  const formattedBookingDate = formatBookingDate(bookingDate);
  const subject = `New booking confirmed: ${serviceName} | ${formattedBookingDate} ${startLabel}`;
  const text = [
    "Hello,",
    "",
    "A Punkat Music booking has been confirmed.",
    "",
    `Service: ${serviceName}`,
    `Date: ${formattedBookingDate}`,
    `Time: ${startLabel} - ${endLabel}`,
    `Duration: ${durationHours} hour(s)`,
    `Participants: ${participants}`,
    `Customer: ${customerName}`,
    `Email: ${buyerEmail}`,
    customerPhone ? `Phone: ${customerPhone}` : null,
    `Payment due at the studio: ${amount.toFixed(2)} ${currency}`,
    paymentProvider ? `Payment: ${paymentProvider}` : null,
    notes ? `Notes: ${notes}` : null,
    "",
    signature,
  ]
    .filter(Boolean)
    .join("\n");

  await sendMailWithTimeout({
    from: config.smtp.from,
    to: config.bookingAdminEmail,
    subject,
    text,
  });

  return {
    delivered: true,
  };
}

export async function sendBookingRequestEmails({
  customerName,
  buyerEmail,
  serviceName,
  bookingDate,
  startLabel,
  endLabel,
  durationHours,
  participants,
  amount,
  currency,
  customerPhone,
  customerLanguage,
  notes,
  bookingReference,
}) {
  if (!config.smtp.host || !config.smtp.user || !config.smtp.pass) {
    return { delivered: false, reason: "SMTP is not configured yet." };
  }

  const formattedBookingDate = formatBookingDate(bookingDate);
  const copy = getBookingEmailCopy(customerLanguage);

  const details = [
    `Service: ${serviceName}`,
    `Date: ${formattedBookingDate}`,
    `Time: ${startLabel} - ${endLabel}`,
    `Duration: ${durationHours} hour(s)`,
    `Participants: ${participants}`,
    `Customer: ${customerName}`,
    `Email: ${buyerEmail}`,
    customerPhone ? `Phone: ${customerPhone}` : null,
    `${copy.paymentDue}: ${amount.toFixed(2)} ${currency}`,
    `Booking reference: ${bookingReference}`,
    notes ? `Notes: ${notes}` : null,
  ].filter(Boolean);

  await Promise.all([
    sendMailWithTimeout({
      from: config.smtp.from,
      to: buyerEmail,
      subject: `${copy.requestSubject}: ${serviceName} | ${formattedBookingDate} ${startLabel}`,
      text: [
        `Hello ${customerName},`,
        "",
        copy.requestReceived,
        copy.requestNext,
        "",
        ...details.slice(0, 5),
        "",
        signature,
      ].join("\n"),
    }),
    sendMailWithTimeout({
      from: config.smtp.from,
      to: config.bookingAdminEmail,
      subject: `Booking request: ${bookingReference} | ${serviceName} | ${formattedBookingDate} ${startLabel}`,
      text: [
        "Hello,",
        "",
        "A booking request is awaiting your confirmation. The selected slot is blocked until you confirm or cancel it in Availability Admin.",
        "",
        ...details,
        "",
        signature,
      ].join("\n"),
    }),
  ]);

  return { delivered: true };
}

export async function sendBookingRequestCancellationEmail({ buyerEmail, customerName, customerLanguage, serviceName, bookingDate, startLabel, endLabel }) {
  if (!config.smtp.host || !config.smtp.user || !config.smtp.pass) {
    return { delivered: false, reason: "SMTP is not configured yet." };
  }

  const copy = getBookingEmailCopy(customerLanguage);

  await sendMailWithTimeout({
    from: config.smtp.from,
    to: buyerEmail,
    subject: `${copy.declinedSubject}: ${serviceName}`,
    text: [
      `Hello ${customerName},`,
      "",
      `${copy.declined} ${formatBookingDate(bookingDate)} ${startLabel} - ${endLabel}.`,
      copy.released,
      "",
      signature,
    ].join("\n"),
  });

  return { delivered: true };
}

export async function sendOtherServiceRequestEmails({
  customerName,
  customerEmail,
  customerPhone,
  bookingDate,
  startHour,
  endHour,
  durationHours,
  notes,
}) {
  if (!config.smtp.host || !config.smtp.user || !config.smtp.pass) {
    return { delivered: false, reason: "SMTP is not configured yet." };
  }

  const formattedBookingDate = formatBookingDate(bookingDate);
  const startLabel = `${String(startHour).padStart(2, "0")}:00`;
  const endLabel = `${String(endHour).padStart(2, "0")}:00`;
  const requestDetails = notes || "No service details were provided.";

  await sendMailWithTimeout({
    from: config.smtp.from,
    to: config.bookingAdminEmail,
    subject: `New other-services request | ${formattedBookingDate} ${startLabel}`,
    text: [
      "Hello,",
      "",
      "A customer has sent an Other Services availability request.",
      "This is not a confirmed booking and does not reserve the time slot.",
      "",
      `Requested date: ${formattedBookingDate}`,
      `Requested time: ${startLabel} - ${endLabel}`,
      `Requested duration: ${durationHours} hour(s)`,
      `Customer: ${customerName}`,
      `Email: ${customerEmail}`,
      customerPhone ? `Phone: ${customerPhone}` : null,
      `Requested service: ${requestDetails}`,
      "",
      signature,
    ].filter(Boolean).join("\n"),
  });

  await sendMailWithTimeout({
    from: config.smtp.from,
    to: customerEmail,
    subject: "Punkat Music service request received",
    text: [
      `Hello ${customerName},`,
      "",
      "We received your service request.",
      `Requested date: ${formattedBookingDate}`,
      `Requested time: ${startLabel} - ${endLabel}`,
      `Requested duration: ${durationHours} hour(s)`,
      "",
      "This is a request only. The time is not reserved until Punkat Music confirms it with you.",
      "",
      signature,
    ].join("\n"),
  });

  return { delivered: true };
}
