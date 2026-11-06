import { gemoji, nameToEmoji } from 'gemoji';

export type EmojiMatch = { emoji: string; name: string };

/** `:sm` at the cursor, but not `http:` or `12:30` (the colon must start a word). */
export const EMOJI_QUERY = /(?:^|[\s([{])(:([\w+-]{1,40}))$/;

export const emojiByName = (name: string): string | undefined => nameToEmoji[name];

/** Emoji for a shortcode query: names starting with it first, then names and tags containing it. */
export const searchEmoji = (query: string, limit = 8): EmojiMatch[] => {
	const q = query.toLowerCase();
	const ranked: { match: EmojiMatch; rank: number }[] = [];
	for (const entry of gemoji) {
		let best: { match: EmojiMatch; rank: number } | null = null;
		for (const name of entry.names) {
			const rank = name === q ? 0 : name.startsWith(q) ? 1 : name.includes(q) ? 2 : -1;
			if (rank !== -1 && (!best || rank < best.rank)) best = { match: { emoji: entry.emoji, name }, rank };
		}
		if (!best && entry.tags.some((tag) => tag.startsWith(q))) {
			best = { match: { emoji: entry.emoji, name: entry.names[0] }, rank: 3 };
		}
		if (best) ranked.push(best);
	}
	// shorter names first (`house` before `houses`), stable sort keeps gemoji's order otherwise
	return ranked
		.sort((a, b) => a.rank - b.rank || a.match.name.length - b.match.name.length)
		.slice(0, limit)
		.map((item) => item.match);
};
