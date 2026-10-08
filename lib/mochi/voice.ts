// Mochi's voice layer. Turns a structured MochiObservation into what the
// companion actually says, filtered through a selected PetPersonality.
// This file never computes facts and never changes a number, date, or
// name — every template only recombines the observation's own
// already-correct `title`/`detail`. Fully deterministic for a given
// (observation, personality, surface, variantIndex) tuple; which variant
// index to use is decided once per "opening" by
// lib/mochi/voice-session.ts, kept separate so this stays a pure
// phrasing table.
//
// Personality answers "HOW does the pet say this?" — it is not the same
// axis as MochiReaction ("HOW is the pet currently behaving visually?").
// A grumpy personality can still show a happy reaction.

import type { MochiObservation, MochiObservationKind } from '@/lib/mochi/types';
import type { MochiReaction, PetPersonality } from '@/lib/types';

export type MochiSurface = 'bubble' | 'modal';

export type MochiLine = {
  /** A short, optional opener, e.g. "Hmm." — '' to omit. */
  lead: string;
  /** The actual sentence(s) Mochi says, built from the observation's own facts. */
  body: string;
  reaction: MochiReaction;
};

// progress -> happy, attention -> focus (Mochi is "on it" with you),
// everything else stays idle. Matches the existing 3-state reaction system;
// no new emotional states are introduced, and personality never changes
// this mapping.
const KIND_REACTION: Record<MochiObservationKind, MochiReaction> = {
  attention: 'focus',
  progress: 'happy',
  opportunity: 'idle',
  pattern: 'idle',
  upcoming: 'idle',
  quiet: 'idle',
};

type Voiced = { lead: string; body: string };
type VariantFn = (observation: MochiObservation, personality: PetPersonality) => Voiced;
type PersonalityMap<T> = Record<PetPersonality, T>;

/** Picks the phrase for the active personality out of a small fixed set —
 * the one place every curated template branches on personality, so each
 * template reads as one compact object rather than five near-duplicate
 * functions. */
function bySpirit<T>(personality: PetPersonality, options: PersonalityMap<T>): T {
  return options[personality];
}

type SurfaceTemplates = {
  /** Short — one line, fits a floating speech bubble. */
  bubble: VariantFn[];
  /** Fuller, more conversational — for the modal briefing. */
  modal: VariantFn[];
};

function overdueCount(title: string): string | null {
  return title.match(/^(\d+)\s/)?.[1] ?? null;
}

// Bespoke, personality-aware phrasing for the observations the character
// direction calls out specifically (the same scenarios in the "test every
// personality against real data" checklist: overdue tasks, overdue money,
// upcoming episodes, expiring supplement/skincare/credential, a streak,
// and the discovery/opportunity rules). Everything else falls back to the
// kind-aware generic composer below, so no observation is ever left
// unvoiced or personality-flat.
const TEMPLATES: Record<string, SurfaceTemplates> = {
  'lifehub-overdue': {
    bubble: [
      (o, p) => {
        const count = overdueCount(o.title);
        const body = count
          ? bySpirit(p, {
            calm: `${count} tasks are still waiting. Pick one?`,
            cutesy: `${count} little tasks are still waiting for you.`,
            funny: `${count} overdue tasks. They've settled in.`,
            serious: `${count} tasks overdue. Start with one.`,
            grumpy: `${count} overdue tasks again? Pick one.`,
          })
          : o.title;
        return { lead: '', body };
      },
    ],
    modal: [
      (o, p) => {
        const count = overdueCount(o.title);
        const body = count
          ? bySpirit(p, {
            calm: `${count} tasks are still waiting. One at a time is enough.`,
            cutesy: `${count} little tasks are still waiting for you. Maybe we make one disappear?`,
            funny: `${count} overdue tasks. That's basically a small civilization at this point.`,
            serious: `${count} tasks are overdue. One should probably be handled first.`,
            grumpy: `${count} overdue tasks? Hmph. Pick one and make it stop bothering you.`,
          })
          : `${o.title}. One at a time.`;
        return { lead: '', body };
      },
      (o, p) => {
        const count = overdueCount(o.title);
        const body = count
          ? bySpirit(p, {
            calm: `That's a fair pile — ${count} tasks overdue. We don't have to clear it all at once.`,
            cutesy: `That's a pretty little pile of tasks. Let's clear just one for now.`,
            funny: `${count} overdue tasks. They've formed a committee and elected a leader.`,
            serious: `${count} tasks overdue. Handling one now would help.`,
            grumpy: `Still ${count} overdue? Fine. One task. Let's get it over with.`,
          })
          : o.title;
        return { lead: '', body };
      },
    ],
  },

  'money-overdue': {
    bubble: [
      (o, p) => ({
        lead: '',
        body: bySpirit(p, {
          calm: `${o.title}. Might be worth a look.`,
          cutesy: `${o.title}. That one's still waiting for you.`,
          funny: `${o.title}. It's not going to pay itself.`,
          serious: `${o.title}. Needs attention.`,
          grumpy: `${o.title}. Hmph.`,
        }),
      }),
    ],
    modal: [
      (o, p) => ({
        lead: '',
        body: bySpirit(p, {
          calm: `${o.title}. That one wants your attention when you have a moment.`,
          cutesy: `${o.title}. That one's still waiting for you — future-you might appreciate this one disappearing.`,
          funny: `${o.title}. Future-you is going to be so surprised when it's still there.`,
          serious: `${o.title}. Worth resolving before it compounds.`,
          grumpy: `${o.title}. You're really making me watch this sit here, huh?`,
        }),
      }),
    ],
  },

  'entertainment-updates': {
    bubble: [
      (o, p) => ({
        lead: '',
        body: bySpirit(p, {
          calm: 'A new episode is waiting for you.',
          cutesy: 'A new episode has been patiently waiting for you.',
          funny: 'Your show got a new episode. It has been very patient about it.',
          serious: 'A new episode is available.',
          grumpy: `${o.title}. Took you long enough to check.`,
        }),
      }),
    ],
    modal: [
      (o, p) => ({
        lead: '',
        body: bySpirit(p, {
          calm: `${o.title}. It's been sitting there patiently.`,
          cutesy: 'Looks like your shows have been busy — a few new episodes are waiting for you.',
          funny: `${o.title}. Airing without you, apparently — the nerve.`,
          serious: `${o.title}. Available whenever you're ready.`,
          grumpy: `${o.title}. Not that I'm keeping score.`,
        }),
      }),
    ],
  },

  'health-supplement-expiring': {
    bubble: [
      (o, p) => ({
        lead: '',
        body: bySpirit(p, {
          calm: `${o.title}.`,
          cutesy: `${o.title}. Small thing to check.`,
          funny: `${o.title}. Living on borrowed time.`,
          serious: `${o.title}.`,
          grumpy: `${o.title}. Just saying.`,
        }),
      }),
    ],
    modal: [
      (o, p) => ({
        lead: '',
        body: bySpirit(p, {
          calm: `${o.title}. ${o.detail} Might be worth a peek.`,
          cutesy: `${o.title}. ${o.detail} Tiny thing to keep an eye on.`,
          funny: `${o.title}. ${o.detail} It's basically on a countdown now.`,
          serious: `${o.title}. ${o.detail} Worth checking.`,
          grumpy: `${o.title}. ${o.detail} Might want to deal with that.`,
        }),
      }),
    ],
  },

  'skincare-nearing-finish': {
    bubble: [
      (o, p) => ({
        lead: '',
        body: bySpirit(p, {
          calm: 'That product looks like it\'s nearly done.',
          cutesy: 'That product looks like it\'s almost finished. Tiny repurchase quest?',
          funny: 'That product is running on fumes.',
          serious: `${o.title}.`,
          grumpy: `${o.title}. About time you noticed.`,
        }),
      }),
    ],
    modal: [
      (o, p) => ({
        lead: '',
        body: bySpirit(p, {
          calm: `${o.title}. Might be worth a decision soon.`,
          cutesy: `${o.title}. Tiny repurchase quest?`,
          funny: `${o.title}. It's basically running on the fumes of hope at this point.`,
          serious: `${o.title}. Consider restocking.`,
          grumpy: `${o.title}. Hmph. Figure out if you're repurchasing it or not.`,
        }),
      }),
    ],
  },

  'personalhub-credential-expiring': {
    bubble: [
      (o, p) => ({
        lead: '',
        body: bySpirit(p, {
          calm: `${o.title}.`,
          cutesy: `${o.title}. Worth a peek.`,
          funny: `${o.title}. The clock's ticking.`,
          serious: `${o.title}.`,
          grumpy: `${o.title}. Don't say I didn't mention it.`,
        }),
      }),
    ],
    modal: [
      (o, p) => ({
        lead: '',
        body: bySpirit(p, {
          calm: `${o.title}. ${o.detail} Might be worth checking.`,
          cutesy: `${o.title}. ${o.detail} Small thing worth checking on.`,
          funny: `${o.title}. ${o.detail} It's not going to renew itself.`,
          serious: `${o.title}. ${o.detail} Worth checking.`,
          grumpy: `${o.title}. ${o.detail} Might want to look into that.`,
        }),
      }),
    ],
  },

  'health-streak': {
    bubble: [
      (o, p) => ({
        lead: '',
        body: bySpirit(p, {
          calm: o.title,
          cutesy: `${o.title}. That's kind of amazing, actually.`,
          funny: `${o.title}. Look at you go.`,
          serious: o.title,
          grumpy: `${o.title}. ...Fine, that's actually pretty good.`,
        }),
      }),
    ],
    modal: [
      (o, p) => ({
        lead: '',
        body: bySpirit(p, {
          calm: `${o.title}. Worth keeping going.`,
          cutesy: `${o.title}. That's becoming a pretty serious little streak.`,
          funny: `${o.title}. At this point it's basically a personality trait.`,
          serious: `${o.title}. Consistent progress.`,
          grumpy: `${o.title}. Don't let it get to your head. ...Okay, it's a little impressive.`,
        }),
      }),
    ],
  },

  'discovery-food-save-meal': {
    bubble: [
      (o, p) => ({
        lead: '',
        body: bySpirit(p, {
          calm: 'Same meal again. There\'s a shortcut for that.',
          cutesy: 'You keep logging the same meal — there\'s a cozy shortcut for that.',
          funny: 'Same meal again? At some point that\'s basically a signature dish.',
          serious: o.detail,
          grumpy: 'Same meal, again. There\'s a faster way, you know.',
        }),
      }),
    ],
    modal: [
      (o, p) => ({
        lead: '',
        body: bySpirit(p, {
          calm: o.detail,
          cutesy: `${o.detail} A little shortcut for future you.`,
          funny: `${o.detail} At this rate it deserves its own entry in the hall of fame.`,
          serious: o.detail,
          grumpy: `${o.detail} Just saving you some clicks.`,
        }),
      }),
    ],
  },

  'discovery-money-spending-plan': {
    bubble: [
      (o, p) => ({
        lead: '',
        body: bySpirit(p, {
          calm: o.title,
          cutesy: `${o.title} Just a little idea.`,
          funny: `${o.title} Just a thought — no pressure.`,
          serious: o.title,
          grumpy: `${o.title} Might be worth it.`,
        }),
      }),
    ],
    modal: [
      (o, p) => ({
        lead: '',
        body: bySpirit(p, {
          calm: `${o.title} ${o.detail}`,
          cutesy: `${o.title} ${o.detail}`,
          funny: `${o.title} ${o.detail} Just a suggestion, not a lecture.`,
          serious: `${o.title} ${o.detail}`,
          grumpy: `${o.title} ${o.detail} Or don't. Your money.`,
        }),
      }),
    ],
  },

  'discovery-lifehub-routines': {
    bubble: [
      (o, p) => ({
        lead: '',
        body: bySpirit(p, {
          calm: 'This looks like it keeps happening.',
          cutesy: 'This looks like it keeps happening — there might be an easier way.',
          funny: 'This keeps happening. Suspiciously routine, even.',
          serious: o.detail,
          grumpy: 'This keeps happening. There\'s a tool for that, you know.',
        }),
      }),
    ],
    modal: [
      (o, p) => ({
        lead: '',
        body: bySpirit(p, {
          calm: `This looks recurring. ${o.detail}`,
          cutesy: `This looks recurring. ${o.detail}`,
          funny: `This looks recurring. ${o.detail} Practically a tradition now.`,
          serious: `This looks recurring. ${o.detail}`,
          grumpy: `This keeps happening. ${o.detail} Just saying.`,
        }),
      }),
    ],
  },

  'discovery-inventory-complete-item': {
    bubble: [
      (o, p) => ({
        lead: '',
        body: bySpirit(p, {
          calm: 'One item is missing a little detail.',
          cutesy: 'One item is missing a little detail. Want to tidy that up?',
          funny: 'One item is still incognito — no photo, no receipt.',
          serious: o.detail,
          grumpy: 'One item is still missing its paperwork.',
        }),
      }),
    ],
    modal: [
      (o, p) => ({
        lead: '',
        body: bySpirit(p, {
          calm: o.detail,
          cutesy: `${o.detail} Want to tidy that little detail?`,
          funny: `${o.detail} It's living a very undocumented life.`,
          serious: o.detail,
          grumpy: `${o.detail} Small thing, but still.`,
        }),
      }),
    ],
  },
};

// --- Generic fallback: every observation without a bespoke template above
// still gets personality-flavored framing, built from the observation's
// own already-correct fact string (title/detail) wrapped in a short
// personality-appropriate opener and closer. This is what keeps
// personality applying to the *whole* briefing rather than just the
// handful of curated scenarios above. ---

const GENERIC_LEAD: Record<PetPersonality, Partial<Record<MochiObservationKind, string>>> = {
  calm: { pattern: 'Hmm.', quiet: 'Hmm.' },
  cutesy: { attention: 'Hmm...', opportunity: 'Ooh,', pattern: 'Hmm...', quiet: 'Hmm...' },
  funny: { attention: 'Well,', opportunity: 'Ooh,', pattern: 'Huh.', quiet: 'Huh.' },
  serious: {},
  grumpy: { attention: 'Hmph.', pattern: 'Hm.', quiet: 'Hm.' },
};

const GENERIC_SUFFIX: Record<PetPersonality, Partial<Record<MochiObservationKind, string>>> = {
  calm: { progress: ' Nice and steady.' },
  cutesy: { attention: ' Might be worth a peek?', progress: ' That\'s kind of sweet, actually.', opportunity: ' Just a little idea.' },
  funny: { attention: ' Someone should probably deal with that.', progress: ' Look at you, being responsible.', opportunity: ' Just saying.' },
  serious: {},
  grumpy: { progress: ' Alright, that counts.' },
};

function genericVoice(observation: MochiObservation, personality: PetPersonality, surface: MochiSurface): Voiced {
  const detail = observation.detail.trim();
  const fact = surface === 'bubble'
    ? observation.title || detail
    : detail && detail !== observation.title
      ? `${observation.title}${/[.!?]$/.test(observation.title) ? ' ' : '. '}${detail}`
      : observation.title;
  const lead = GENERIC_LEAD[personality][observation.kind] || '';
  const suffix = GENERIC_SUFFIX[personality][observation.kind] || '';
  return { lead, body: `${fact}${suffix}` };
}

function templatesFor(observation: MochiObservation, surface: MochiSurface): VariantFn[] {
  const entry = TEMPLATES[observation.id];
  const list = entry?.[surface];
  return list && list.length > 0 ? list : [];
}

/** How many distinct variants exist for this observation on this surface
 * (always at least 1 — the generic fallback counts as one). Personality
 * does not change the variant count, only the wording of each variant. */
export function getVariantCount(observation: MochiObservation, surface: MochiSurface): number {
  const list = templatesFor(observation, surface);
  return list.length > 0 ? list.length : 1;
}

/** Deterministic for a given (observation, personality, surface,
 * variantIndex) — the same inputs always produce the same line. Which
 * index to pass is decided once per "opening" by
 * lib/mochi/voice-session.ts, not on every render. */
export function voiceObservation(
  observation: MochiObservation,
  personality: PetPersonality,
  surface: MochiSurface = 'modal',
  variantIndex = 0,
): MochiLine {
  const list = templatesFor(observation, surface);
  const template = list.length > 0 ? list[((variantIndex % list.length) + list.length) % list.length] : undefined;
  const voiced = template ? template(observation, personality) : genericVoice(observation, personality, surface);
  return { ...voiced, reaction: KIND_REACTION[observation.kind] };
}

// One `withNews` variant per personality uses the companion's own name —
// occasionally, not every time, so it never reads as "Lee, Lee noticed...".
// Which variant is shown (name-including or not) is decided by the same
// deterministic per-opening variant selection as everything else.
type IntroLine = (petName: string) => string;
const BRIEFING_INTROS: Record<PetPersonality, { withNews: IntroLine[]; quiet: IntroLine[] }> = {
  calm: {
    withNews: [
      name => `${name} here — a few things caught my eye.`,
      () => 'Here\'s what caught my attention today.',
      () => 'Nothing too dramatic. Just a few things I noticed.',
    ],
    quiet: [
      () => 'Pretty calm today. Nothing urgent caught my eye.',
      () => 'Quiet day. I\'ll keep watching, just in case.',
    ],
  },
  cutesy: {
    withNews: [
      () => 'Psst... I noticed a few things today.',
      name => `Come here a second, ${name} spotted a couple things worth checking.`,
      () => 'Hmm... a few little things caught my eye.',
    ],
    quiet: [
      () => 'Pretty calm today. Nothing urgent caught my eye.',
      () => 'Quiet day today — that\'s a good thing.',
    ],
  },
  funny: {
    withNews: [
      () => 'Alright, gather round — I found some material.',
      () => 'So. A few things happened while you weren\'t looking.',
      name => `${name}'s official, unsolicited report has arrived.`,
    ],
    quiet: [
      () => 'Suspiciously quiet today. I\'m choosing to trust it.',
      () => 'Nothing to report. Either great day or elaborate cover-up.',
    ],
  },
  serious: {
    withNews: [
      () => 'A few things need attention. Here\'s what matters.',
      name => `${name} noticed a few things worth reviewing today.`,
      () => 'A few notable items today.',
    ],
    quiet: [
      () => 'Nothing urgent today. Everything looks steady.',
      () => 'Quiet day. No action needed.',
    ],
  },
  grumpy: {
    withNews: [
      () => 'Hmph. What\'s this little mess?',
      name => `${name} noticed a few things. Don\'t make it weird.`,
      () => 'Don\'t make that face — just a few things.',
    ],
    quiet: [
      () => 'Quiet today. Don\'t get used to it.',
      () => 'Nothing to complain about. Strange.',
    ],
  },
};

export function getBriefingIntroVariantCount(personality: PetPersonality, hasSomethingToSay: boolean): number {
  const pool = BRIEFING_INTROS[personality];
  return (hasSomethingToSay ? pool.withNews : pool.quiet).length;
}

/** The conversational opener for the modal's daily briefing. `petName` is
 * used by some variants and ignored by others — see BRIEFING_INTROS. */
export function voiceBriefingIntro(
  personality: PetPersonality,
  hasSomethingToSay: boolean,
  variantIndex = 0,
  petName = 'Mochi',
): string {
  const pool = BRIEFING_INTROS[personality];
  const list = hasSomethingToSay ? pool.withNews : pool.quiet;
  return list[((variantIndex % list.length) + list.length) % list.length](petName);
}

// Small connective phrases that turn "category header + card stack" into a
// conversation: one lead-in for whichever observation Mochi opens with, and
// a lighter lead-in for the kind-grouped items that follow. Deliberately
// not randomized — a single well-chosen phrase per (personality, kind) is
// enough variety here; the observations themselves are where
// voiceObservation() varies.
const PRIMARY_LEAD_IN: Record<PetPersonality, Record<MochiObservationKind, string>> = {
  calm: {
    attention: 'There\'s one thing I\'d keep an eye on.',
    upcoming: 'Here\'s something coming up.',
    opportunity: 'I noticed something that might help.',
    progress: 'You\'re doing pretty well here.',
    pattern: 'I noticed a pattern.',
    quiet: 'Nothing much to report — that\'s a good thing.',
  },
  cutesy: {
    attention: 'There\'s one thing worth a peek.',
    upcoming: 'Here\'s something coming up.',
    opportunity: 'I noticed something that might help.',
    progress: 'You\'re doing really well here.',
    pattern: 'I noticed a little pattern.',
    quiet: 'Nothing much to report — that\'s a good thing.',
  },
  funny: {
    attention: 'There\'s one thing you should probably know about.',
    upcoming: 'Here\'s something on the horizon.',
    opportunity: 'I noticed something that might save you some effort.',
    progress: 'Look at you, being productive.',
    pattern: 'I noticed a pattern. A suspicious one.',
    quiet: 'Nothing to report. Suspiciously calm, honestly.',
  },
  serious: {
    attention: 'There\'s one thing worth flagging.',
    upcoming: 'Here\'s something coming up.',
    opportunity: 'One thing that might help.',
    progress: 'Progress here is solid.',
    pattern: 'A pattern worth noting.',
    quiet: 'Nothing urgent right now.',
  },
  grumpy: {
    attention: 'There\'s one thing you should deal with.',
    upcoming: 'Here\'s something coming up. Don\'t ignore it.',
    opportunity: 'I noticed something that might actually help.',
    progress: 'Alright, I\'ll admit — this is going well.',
    pattern: 'I noticed a pattern. Of course I did.',
    quiet: 'Nothing to report. Don\'t get used to it.',
  },
};

const SUPPORTING_LEAD_IN: Record<PetPersonality, Record<MochiObservationKind, string>> = {
  calm: {
    attention: 'Also worth a look —',
    upcoming: 'Coming up —',
    opportunity: 'Also, this might help —',
    progress: 'On a brighter note —',
    pattern: 'I also noticed —',
    quiet: 'Otherwise, quiet —',
  },
  cutesy: {
    attention: 'And also —',
    upcoming: 'Coming up —',
    opportunity: 'On top of that —',
    progress: 'On the happy side —',
    pattern: 'I also noticed —',
    quiet: 'Otherwise, quiet —',
  },
  funny: {
    attention: 'Also, because apparently life enjoys side quests —',
    upcoming: 'One more thing —',
    opportunity: 'Also, unsolicited advice —',
    progress: 'Meanwhile, in good news —',
    pattern: 'Also, a pattern emerged —',
    quiet: 'Beyond that, silence —',
  },
  serious: {
    attention: 'There\'s one other thing.',
    upcoming: 'Also worth noting —',
    opportunity: 'One more option —',
    progress: 'Also worth noting —',
    pattern: 'Also worth noting —',
    quiet: 'Otherwise, nothing notable —',
  },
  grumpy: {
    attention: 'And yes, there\'s one more thing —',
    upcoming: 'Also, this is coming up —',
    opportunity: 'On the less-annoying side —',
    progress: 'Also, that went well —',
    pattern: 'Also, I noticed —',
    quiet: 'Otherwise, nothing to complain about —',
  },
};

export function voicePrimaryLeadIn(personality: PetPersonality, kind: MochiObservationKind): string {
  return PRIMARY_LEAD_IN[personality][kind];
}

export function voiceSupportingLeadIn(personality: PetPersonality, kind: MochiObservationKind): string {
  return SUPPORTING_LEAD_IN[personality][kind];
}

const BRIEFING_CLOSING: Record<PetPersonality, string> = {
  calm: 'That\'s all I spotted for now.',
  cutesy: 'That\'s everything I noticed for now.',
  funny: 'That concludes today\'s unsolicited report.',
  serious: 'That\'s everything worth noting today.',
  grumpy: 'That\'s all. You\'re welcome.',
};

/** The closing beat after Mochi has said everything he's going to. */
export function voiceBriefingClosing(personality: PetPersonality): string {
  return BRIEFING_CLOSING[personality];
}

const QUIET_BUBBLE_LINE: Record<PetPersonality, string> = {
  calm: 'Quiet day. Nothing urgent caught my eye.',
  cutesy: 'Nice and quiet today. Nothing urgent.',
  funny: 'Suspiciously calm today. I\'m choosing to trust it.',
  serious: 'Nothing urgent today.',
  grumpy: 'Quiet today. Don\'t get used to it.',
};

/** What the floating bubble says when there is no notable observation. */
export function voiceQuietBubbleLine(personality: PetPersonality): string {
  return QUIET_BUBBLE_LINE[personality];
}
