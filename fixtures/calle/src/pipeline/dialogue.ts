import type { CallTurn, SampleCall, Speaker, TurnWord } from './types.js';
import { hashCode, mulberry32 } from './random.js';

/**
 * Turn text into a word stream with deterministic timing.
 * Words are distributed at a target speaking rate with a seeded jitter so the
 * live transcript advances at a believable pace.
 */
function words(text: string, startMs: number, seed: number): TurnWord[] {
  const tokens = text.split(/\s+/).filter(Boolean);
  const rnd = mulberry32(hashCode(text) ^ (seed * 7919));
  const perWordMs = 60_000 / 165;
  const list: TurnWord[] = [];
  let t = startMs;
  for (let i = 0; i < tokens.length; i++) {
    const jitter = (rnd() * 9 - 4) | 0;
    const duration = Math.max(45, Math.round(perWordMs + jitter));
    list.push({ text: tokens[i]!, atMs: Math.round(t), durationMs: duration });
    t += duration;
  }
  return list;
}

function turn(speaker: Speaker, text: string, startMs: number, seed: number): CallTurn {
  return { speaker, startMs, words: words(text, startMs, seed) };
}

function lastEnd(turns: CallTurn[]): number {
  const last = turns[turns.length - 1];
  if (!last) return 0;
  const lastWord = last.words[last.words.length - 1];
  return lastWord ? lastWord.atMs + lastWord.durationMs : last.startMs;
}

function build(...turns: CallTurn[]): SampleCall {
  return { id: '', title: '', context: '', durationMs: lastEnd(turns), turns };
}

const ORDER_SUPPORT = build(
  turn('Agent', 'Thanks for calling Brightline support, this is Maya. How can I help today?', 0, 1),
  turn('Customer', 'Hi, I ordered a laptop stand last week and the tracking link keeps showing an error.', 3600, 2),
  turn('Agent', 'I am sorry about that. Can I get the order number from your confirmation email?', 8200, 3),
  turn('Customer', 'It is order B L 8 4 2 1 9.', 13200, 4),
  turn('Agent', 'Thanks. I can see it shipped two days ago from the Milwaukee warehouse.', 17200, 5),
  turn('Customer', 'Oh okay, so it is on the way then? The link really looked broken.', 22800, 6),
  turn('Agent', 'Right, the portal is showing a temporary routing issue. The parcel is moving and should arrive Friday.', 28400, 7),
  turn('Customer', 'That is a relief. Could you send the link again to my email?', 35600, 8),
  turn('Agent', 'Done. You will get a fresh tracking link within the hour.', 40800, 9),
  turn('Customer', 'Perfect, thanks so much for checking.', 45600, 10),
  turn('Agent', 'You are welcome. Is there anything else I can help with?', 49200, 11),
  turn('Customer', 'No, that is all. Have a great day.', 54800, 12),
);
ORDER_SUPPORT.id = 'call-001';
ORDER_SUPPORT.title = 'Order tracking';
ORDER_SUPPORT.context = 'Customer cannot reach an active tracking link for a shipped order. Agent locates the parcel and re-sends a fresh link.';

const RETENTION = build(
  turn('Agent', 'Thanks for calling, you have reached the retention desk. I am Jordan.', 0, 20),
  turn('Customer', 'I want to cancel my plan, I am just not using it enough.', 3800, 21),
  turn('Agent', 'I understand. Before we do, can I check what is not working for you?', 9200, 22),
  turn('Customer', 'I signed up for the priority support plan but I mostly solve things on my own.', 14600, 23),
  turn('Agent', 'That makes sense. We do have a lighter plan at half the price that keeps your saved searches.', 20400, 24),
  turn('Customer', 'Half price? How is that different?', 27600, 25),
  turn('Agent', 'Same product, community-only support instead of one-to-one. Everything else stays.', 31200, 26),
  turn('Customer', 'That could work. Would I keep my history?', 38000, 27),
  turn('Agent', 'Yes, your history and settings carry over automatically.', 42800, 28),
  turn('Customer', 'Alright, let us do that. Keep the saves, drop the price.', 48000, 29),
  turn('Agent', 'Perfect, I have switched you. You will see the change on the next billing cycle.', 53600, 30),
  turn('Customer', 'Great, thanks Jordan.', 60000, 31),
  turn('Agent', 'Thank you for staying with us.', 62800, 32),
);
RETENTION.id = 'call-002';
RETENTION.title = 'Plan cancellation';
RETENTION.context = 'Customer wants to cancel. Agent offers a lower-tier plan that preserves history and settings, converting the cancellation to a downgrade.';

const BILLING = build(
  turn('Agent', 'Thanks for calling, this is Priya. What is going on with your account?', 0, 40),
  turn('Customer', 'I was charged twice this month and I want it fixed.', 4000, 41),
  turn('Agent', 'I am sorry about that. Let me pull up your latest invoice.', 9400, 42),
  turn('Customer', 'I got an email for a charge on the first and another on the third.', 15000, 43),
  turn('Agent', 'I see two charges here. The second one is a duplicate from a failed retry.', 20800, 44),
  turn('Customer', 'So you can refund it?', 28000, 45),
  turn('Agent', 'Absolutely, I will reverse the duplicate right now. It clears in three to five days.', 31200, 46),
  turn('Customer', 'Okay. And can you make sure it does not happen again?', 38400, 47),
  turn('Agent', 'I will remove the duplicate payment method and re-save your card once.', 43600, 48),
  turn('Customer', 'Thanks. That is exactly what I needed.', 50000, 49),
  turn('Agent', 'Done — the refund is processing and your card is updated. Anything else?', 54000, 50),
  turn('Customer', 'No, that is everything.', 60400, 51),
);
BILLING.id = 'call-003';
BILLING.title = 'Billing dispute';
BILLING.context = 'Customer reports a duplicate charge. Agent identifies a failed-retry duplicate, initiates a refund, and cleans up the stored payment method.';

export const SAMPLE_CALLS: SampleCall[] = [ORDER_SUPPORT, RETENTION, BILLING];

export function findCall(id: string): SampleCall | undefined {
  return SAMPLE_CALLS.find((c) => c.id === id);
}
