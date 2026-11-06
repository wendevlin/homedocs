import type { CompletionContext, CompletionResult } from '@codemirror/autocomplete';
import { EditorState } from '@codemirror/state';
import { EMOJI_QUERY, searchEmoji } from '#lib/emoji.js';

/** Typing `:sm` suggests emoji; picking one inserts the emoji character. */
const emojiCompletion = (context: CompletionContext): CompletionResult | null => {
	const line = context.state.doc.lineAt(context.pos);
	const match = EMOJI_QUERY.exec(line.text.slice(0, context.pos - line.from));
	if (!match) return null;
	const options = searchEmoji(match[2], 20).map(({ emoji, name }) => ({
		label: `:${name}:`,
		displayLabel: `${emoji}  ${name}`,
		apply: emoji
	}));
	if (!options.length) return null;
	return { from: context.pos - match[1].length, options, filter: false };
};

export const emojiAutocomplete = EditorState.languageData.of(() => [{ autocomplete: emojiCompletion }]);
