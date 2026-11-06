import type { ClientMessage, LockInfo, ServerMessage } from '@homedocs/shared';

type Listener = (message: ServerMessage) => void;
type LockResult = { granted: true } | { granted: false; holder: LockInfo };

/**
 * Websocket connection to the server: lock state, edit locks and change notifications.
 * Reconnects automatically and re-acquires the locks this tab held.
 */
class Live {
	connected = $state(false);
	locks = $state<Record<string, LockInfo>>({});

	#ws: WebSocket | null = null;
	#listeners = new Set<Listener>();
	#held = new Set<string>();
	#pending = new Map<string, (result: LockResult) => void>();
	#retry = 0;
	#ping: ReturnType<typeof setInterval> | undefined;

	connect() {
		if (this.#ws) return;
		const url = new URL('ws', location.href);
		url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
		url.hash = '';
		const ws = new WebSocket(url);
		this.#ws = ws;

		ws.onopen = () => {
			this.connected = true;
			this.#retry = 0;
			for (const path of this.#held) this.#send({ type: 'lock.acquire', path });
			this.#ping = setInterval(() => this.#send({ type: 'ping' }), 30_000);
		};
		ws.onmessage = (event) => this.#handle(JSON.parse(event.data) as ServerMessage);
		ws.onclose = () => {
			this.connected = false;
			this.#ws = null;
			clearInterval(this.#ping);
			const delay = Math.min(30_000, 1000 * 2 ** this.#retry++);
			setTimeout(() => this.connect(), delay);
		};
	}

	subscribe(listener: Listener) {
		this.#listeners.add(listener);
		return () => this.#listeners.delete(listener);
	}

	/** Asks for the edit lock of a document. */
	acquire(path: string): Promise<LockResult> {
		if (!this.connected) {
			return Promise.reject(new Error('Not connected to the server, please try again'));
		}
		return new Promise((resolve) => {
			this.#pending.get(path)?.({ granted: false, holder: { userId: '', name: '', since: 0 } });
			this.#pending.set(path, resolve);
			this.#send({ type: 'lock.acquire', path });
		});
	}

	release(path: string) {
		this.#held.delete(path);
		this.#send({ type: 'lock.release', path });
	}

	#send(message: ClientMessage) {
		if (this.#ws?.readyState === WebSocket.OPEN) this.#ws.send(JSON.stringify(message));
	}

	#handle(message: ServerMessage) {
		if (message.type === 'locks') {
			this.locks = message.locks;
		} else if (message.type === 'lock.granted') {
			this.#held.add(message.path);
			this.#pending.get(message.path)?.({ granted: true });
			this.#pending.delete(message.path);
		} else if (message.type === 'lock.denied') {
			this.#pending.get(message.path)?.({ granted: false, holder: message.holder });
			this.#pending.delete(message.path);
		} else if (message.type === 'lock.lost') {
			this.#held.delete(message.path);
		}
		for (const listener of this.#listeners) listener(message);
	}
}

export const live = new Live();
