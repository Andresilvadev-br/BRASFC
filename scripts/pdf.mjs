// Gera PDF de um relatório Markdown (HTML com a identidade do BRASFC → Edge/Chrome sem interface).
// Uso: node scripts/pdf.mjs RELATORIO-DEV-0.4.md
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const src = process.argv[2];
const md = readFileSync(src, 'utf8');
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const inline = (s) =>
	esc(s)
		.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, a, u) => `<img alt="${a}" src="${pathToFileURL(resolve(u)).href}">`)
		.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
		.replace(/`([^`]+)`/g, '<code>$1</code>');
const out = [];
let list = false;
let table = [];
const flushTable = () => {
	if (!table.length) return;
	const rows = table.filter((r) => !/^\|\s*-/.test(r)).map((r) => r.trim().replace(/^\||\|$/g, '').split('|').map((c) => inline(c.trim())));
	out.push('<table>' + rows.map((r, i) => `<tr>${r.map((c) => (i ? `<td>${c}</td>` : `<th>${c}</th>`)).join('')}</tr>`).join('') + '</table>');
	table = [];
};
for (const line of md.split(/\r?\n/)) {
	if (line.startsWith('|')) {
		table.push(line);
		continue;
	}
	flushTable();
	if (/^- /.test(line)) {
		if (!list) out.push('<ul>');
		list = true;
		out.push(`<li>${inline(line.slice(2))}</li>`);
		continue;
	}
	if (list) {
		out.push('</ul>');
		list = false;
	}
	if (line.startsWith('# ')) out.push(`<h1>${inline(line.slice(2))}</h1>`);
	else if (line.startsWith('## ')) out.push(`<h2>${inline(line.slice(3))}</h2>`);
	else if (line.startsWith('### ')) out.push(`<h3>${inline(line.slice(4))}</h3>`);
	else if (line.trim()) out.push(`<p>${inline(line)}</p>`);
}
flushTable();
if (list) out.push('</ul>');
const html = `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><style>
@page{size:A4;margin:16mm 14mm}
body{font:11pt/1.5 'Segoe UI',system-ui,sans-serif;color:#1c252b}
h1{font-size:24pt;margin:0 0 4pt;color:#0a7a56;letter-spacing:.02em}
h2{font-size:15pt;margin:18pt 0 6pt;color:#101418;border-bottom:2px solid #10b981;padding-bottom:3pt;page-break-after:avoid}
h3{font-size:12pt;margin:12pt 0 4pt}
table{border-collapse:collapse;width:100%;margin:8pt 0;font-size:10pt;page-break-inside:avoid}
th{background:#101418;color:#e7edf0;text-align:left;padding:5pt 7pt}
td{border-bottom:1px solid #dfe5e8;padding:4pt 7pt}
img{width:100%;border-radius:6pt;margin:8pt 0;page-break-inside:avoid;box-shadow:0 2pt 8pt rgba(0,0,0,.2)}
code{background:#eef3f1;padding:1pt 4pt;border-radius:3pt;font-size:9.5pt}
strong{color:#101418}
</style><body>${out.join('\n')}</body></html>`;
const htmlPath = resolve(src.replace(/\.md$/, '.html'));
writeFileSync(htmlPath, html);
const exe = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe'].find((p) => existsSync(p));
const pdf = resolve(src.replace(/\.md$/, '.pdf'));
execFileSync(exe, ['--headless=new', '--disable-gpu', '--no-pdf-header-footer', `--print-to-pdf=${pdf}`, pathToFileURL(htmlPath).href], { stdio: 'ignore', timeout: 120000 });
console.log('PDF', pdf, existsSync(pdf));
