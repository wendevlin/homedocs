import { shareUrl, type SharingSettings } from '@homedocs/shared';
import { encode, renderSVG } from 'uqr';

/** The share listener marks the page it serves; there the app only shows shared pages. */
export const isShareHost = () =>
	typeof document !== 'undefined' && document.querySelector('meta[name="homedocs-share"]') !== null;

export type ShareTarget = 'local' | 'remote';

/**
 * Base URL of the share listener. Locally the Supervisor tells the host IP and port; without it
 * (development) the browser's host name is the best guess.
 */
export const shareBase = (settings: SharingSettings, target: ShareTarget): string | null => {
	if (target === 'remote') return settings.remoteUrl;
	if (settings.localUrl) return settings.localUrl;
	return settings.localUrlProblem ? null : `http://${location.hostname}:${settings.port}`;
};

export const shareLink = (settings: SharingSettings, target: ShareTarget, token: string) => {
	const base = shareBase(settings, target);
	return base ? shareUrl(base, token) : null;
};

/** QR code as SVG markup. Always black on white, phones read that best. */
export const qrSvg = (text: string) => renderSVG(text, { ecc: 'M', border: 2 });

const escapeHtml = (value: string) =>
	value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** Opens a print view with the QR code, the page title and the URL, e.g. for a sticker. */
export const printQr = (title: string, url: string) => {
	const win = window.open('', '_blank');
	if (!win) return;
	win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>body{font-family:system-ui,sans-serif;display:flex;flex-direction:column;align-items:center;gap:8px;padding:24px;margin:0}
.qr svg{width:60mm;height:60mm}h1{font-size:16pt;margin:0;text-align:center}p{font-size:8pt;color:#555;margin:0;word-break:break-all;text-align:center;max-width:80mm}</style>
</head><body><div class="qr">${qrSvg(url)}</div><h1>${escapeHtml(title)}</h1><p>${escapeHtml(url)}</p>
<script>window.onload=()=>{window.print()}</script></body></html>`);
	win.document.close();
};

/** QR code as PNG on a canvas, so it can be shown as an image, copied and pasted anywhere. */
const qrCanvas = (text: string, scale = 12) => {
	const { data, size } = encode(text, { ecc: 'M', border: 2 });
	const canvas = document.createElement('canvas');
	canvas.width = canvas.height = size * scale;
	const context = canvas.getContext('2d')!;
	context.fillStyle = '#fff';
	context.fillRect(0, 0, canvas.width, canvas.height);
	context.fillStyle = '#000';
	data.forEach((row, y) =>
		row.forEach((dark, x) => dark && context.fillRect(x * scale, y * scale, scale, scale))
	);
	return canvas;
};

/** `data:` URL of the QR code as PNG, for an `<img>` that can be right-clicked and copied. */
export const qrPng = (text: string) => qrCanvas(text).toDataURL('image/png');

const qrBlob = (text: string) =>
	new Promise<Blob>((resolve, reject) =>
		qrCanvas(text).toBlob((blob) => (blob ? resolve(blob) : reject(new Error('No image'))), 'image/png')
	);

/**
 * Copies the QR code image. Browsers only allow that on HTTPS (or localhost); Home Assistant is
 * often opened over plain HTTP, then this returns false and the image has to be copied by hand.
 */
export const copyQrImage = async (text: string) => {
	if (!window.isSecureContext || typeof ClipboardItem === 'undefined') return false;
	try {
		await navigator.clipboard.write([new ClipboardItem({ 'image/png': qrBlob(text) })]);
		return true;
	} catch {
		return false;
	}
};

/** Copies text, also over plain HTTP where the clipboard API is missing. */
export const copyText = async (text: string) => {
	if (window.isSecureContext && navigator.clipboard) {
		try {
			await navigator.clipboard.writeText(text);
			return true;
		} catch {
			// fall back below
		}
	}
	const textarea = document.createElement('textarea');
	textarea.value = text;
	textarea.style.position = 'fixed';
	textarea.style.opacity = '0';
	document.body.append(textarea);
	textarea.select();
	const ok = document.execCommand('copy');
	textarea.remove();
	return ok;
};

export const downloadQr = (fileName: string, url: string) => {
	const link = document.createElement('a');
	link.href = qrPng(url);
	link.download = fileName;
	link.click();
};
