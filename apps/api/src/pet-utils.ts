/**
 * Pet-specific utility functions for personalized notifications and messages.
 */

/**
 * Extract pet name from reservation meta for personalized notifications.
 */
export function getPetNameFromMeta(meta: any): string | null {
  // Check surveyAnswers first
  if (meta?.surveyAnswers?.pet_name) return String(meta.surveyAnswers.pet_name);
  // Check petProfile
  if (meta?.petProfile?.name) return String(meta.petProfile.name);
  return null;
}

/**
 * Build a pet-personalized reminder message.
 */
export function buildPetReminderMessage(params: {
  storeName: string;
  date: string;
  time: string;
  menuName: string;
  staffName: string;
  petName: string | null;
  address?: string;
}): string {
  const { storeName, date, time, menuName, staffName, petName, address } = params;
  const petGreeting = petName ? `\u{1F43E} ${petName}ちゃんの` : '';
  const lines: (string | null)[] = [
    `【${storeName}】${petGreeting}トリミング予約のお知らせ`,
    '',
    `\u{1F4C5} ${date} ${time}`,
    `\u{1F415} ${menuName}`,
    `\u2702\uFE0F 担当: ${staffName}`,
    address ? `\u{1F4CD} ${address}` : null,
    '',
    `${petName ? `${petName}ちゃん` : 'ペット'}に会えるのを楽しみにしています！`,
    '',
    '\u26A0\uFE0F 爪が伸びている場合は爪切りも追加できます。',
    'ご希望の方は前日までにご連絡ください。',
  ];
  return lines.filter((line): line is string => line !== null).join('\n');
}

/**
 * Build a repeat promotion message with pet name.
 */
export function buildPetRepeatMessage(params: {
  storeName: string;
  petName: string | null;
  lastVisitDays: number;
  bookingUrl: string;
}): string {
  const { storeName, petName, lastVisitDays, bookingUrl } = params;
  const name = petName ? `${petName}ちゃん` : 'ペット';
  return [
    `\u{1F43E} ${name}の前回のトリミングから${lastVisitDays}日が経ちました。`,
    '',
    'そろそろお手入れの時期ではないでしょうか？',
    '毛玉や爪の伸びが気になる前のケアがおすすめです。',
    '',
    `【${storeName}】`,
    `ご予約はこちら\u{1F447}`,
    bookingUrl,
  ].join('\n');
}
