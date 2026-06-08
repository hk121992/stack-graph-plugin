
const TIP = /<Tip>([\s\S]*?)<\/Tip>/g;
const WARN = /<Warning>([\s\S]*?)<\/Warning>/g;
const NOTE = /<(?:Note|Info)>([\s\S]*?)<\/(?:Note|Info)>/g;
const UNVERIFIED = /<Unverified>([\s\S]*?)<\/Unverified>/g;

function callout(kind: string, body: string): string {
  return `\n\n<div class="callout callout-${kind}" role="note">\n\n${body.trim()}\n\n</div>\n\n`;
}

export function applyBuiltinCallouts(body: string): string {
  return body
    .replace(TIP, (_m, b: string) => callout("tip", b))
    .replace(WARN, (_m, b: string) => callout("warning", b))
    .replace(NOTE, (_m, b: string) => callout("note", b))
    .replace(UNVERIFIED, (_m, b: string) => callout("unverified", `**⚠ Unverified** — ${b.trim()}`));
}
