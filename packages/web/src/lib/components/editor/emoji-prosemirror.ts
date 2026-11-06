import { Plugin } from '@milkdown/kit/prose/state';
import type { EditorView } from '@milkdown/kit/prose/view';
import { $prose } from '@milkdown/kit/utils';
import { EMOJI_QUERY, emojiByName, searchEmoji, type EmojiMatch } from '#lib/emoji.js';

type Query = { from: number; to: number; text: string };

/** The `:query` right before the cursor, outside of code. */
const findQuery = (view: EditorView): Query | null => {
	const { selection } = view.state;
	if (!selection.empty) return null;
	const $pos = selection.$from;
	if ($pos.parent.type.spec.code || $pos.marks().some((mark) => mark.type.spec.code)) return null;
	const before = $pos.parent.textBetween(0, $pos.parentOffset, undefined, '￼');
	const match = EMOJI_QUERY.exec(before);
	if (!match) return null;
	return { from: selection.from - match[1].length, to: selection.from, text: match[2] };
};

/** Suggestion list shown under the cursor while typing `:sm…`. Plain DOM, styled like shadcn popovers. */
class EmojiMenu {
	private menu = document.createElement('div');
	private query: Query | null = null;
	private items: EmojiMatch[] = [];
	private active = 0;
	/** Position of a query closed with Escape, so it stays closed until the user types elsewhere */
	private dismissedAt: number | null = null;

	constructor(private view: EditorView) {
		this.menu.className =
			'fixed z-50 hidden min-w-48 rounded-md border bg-popover p-1 text-sm text-popover-foreground shadow-md';
		this.menu.setAttribute('role', 'listbox');
		// keep the editor focused when clicking a suggestion
		this.menu.addEventListener('mousedown', (event) => event.preventDefault());
		document.body.append(this.menu);
		// capture phase: runs before the editor's own Enter/arrow key handling
		view.dom.addEventListener('keydown', this.onKeyDown, true);
		view.dom.addEventListener('blur', this.hide);
	}

	update() {
		const query = findQuery(this.view);
		if (!query || query.from === this.dismissedAt) {
			if (!query) this.dismissedAt = null;
			this.hide();
			return;
		}
		this.query = query;
		this.items = searchEmoji(query.text);
		if (!this.items.length) return this.hide();
		this.active = 0;
		this.render();
	}

	private render() {
		this.menu.replaceChildren(
			...this.items.map((item, index) => {
				const option = document.createElement('div');
				option.setAttribute('role', 'option');
				option.className = `flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 ${
					index === this.active ? 'bg-accent text-accent-foreground' : ''
				}`;
				const emoji = document.createElement('span');
				emoji.className = 'text-base leading-none';
				emoji.textContent = item.emoji;
				const name = document.createElement('span');
				name.textContent = `:${item.name}:`;
				option.append(emoji, name);
				option.addEventListener('click', () => this.pick(item));
				option.addEventListener('mousemove', () => {
					if (this.active === index) return;
					this.active = index;
					this.render();
				});
				return option;
			})
		);
		const coords = this.view.coordsAtPos(this.query!.from);
		this.menu.classList.remove('hidden');
		const below = coords.bottom + 4;
		const height = this.menu.offsetHeight;
		this.menu.style.top = `${below + height > window.innerHeight ? coords.top - height - 4 : below}px`;
		this.menu.style.left = `${Math.min(coords.left, window.innerWidth - this.menu.offsetWidth - 8)}px`;
	}

	private hide = () => {
		this.query = null;
		this.menu.classList.add('hidden');
	};

	private pick(item: EmojiMatch) {
		if (!this.query) return;
		const { from, to } = this.query;
		this.view.dispatch(this.view.state.tr.insertText(item.emoji, from, to).scrollIntoView());
		this.hide();
	}

	private onKeyDown = (event: KeyboardEvent) => {
		if (!this.query || event.isComposing) return;
		const handled = () => {
			event.preventDefault();
			event.stopPropagation();
		};
		if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
			const step = event.key === 'ArrowDown' ? 1 : -1;
			this.active = (this.active + step + this.items.length) % this.items.length;
			this.render();
			handled();
		} else if (event.key === 'Enter' || event.key === 'Tab') {
			this.pick(this.items[this.active]);
			handled();
		} else if (event.key === 'Escape') {
			this.dismissedAt = this.query.from;
			this.hide();
			handled();
		}
	};

	destroy() {
		this.view.dom.removeEventListener('keydown', this.onKeyDown, true);
		this.view.dom.removeEventListener('blur', this.hide);
		this.menu.remove();
	}
}

/**
 * Emoji for the visual editor: `:sm` opens a suggestion list, and a complete shortcode like
 * `:smile:` turns into 😄 when the closing colon is typed. Emoji are stored as characters.
 */
export const emojiPlugin = $prose(
	() =>
		new Plugin({
			view: (view) => new EmojiMenu(view),
			props: {
				handleTextInput(view, from, to, text) {
					if (text !== ':' || from !== to) return false;
					const query = findQuery(view);
					const emoji = query && emojiByName(query.text);
					if (!query || !emoji) return false;
					view.dispatch(view.state.tr.insertText(emoji, query.from, to));
					return true;
				}
			}
		})
);
