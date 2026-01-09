export default async function handler(req, res) {
  const { username, langs_count = 5, theme = "dracula" } = req.query;

  if (!username) {
    res.status(400).send("Username required");
    return;
  }

  const headers = {
    Accept: "application/vnd.github+json",
    ...(process.env.GITHUB_TOKEN && {
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
    }),
  };

  // 1. Fetch repos
  const reposRes = await fetch(
    `https://api.github.com/users/${username}/repos?per_page=100&type=owner`,
    { headers }
  );

  if (!reposRes.ok) {
    res.status(500).send("GitHub API error");
    return;
  }

  const repos = await reposRes.json();
  const languageTotals = {};

  // 2. Fetch languages per repo
  for (const repo of repos) {
    if (repo.fork || repo.archived) continue;

    const langRes = await fetch(repo.languages_url, { headers });
    if (!langRes.ok) continue;

    const langs = await langRes.json();
    for (const [lang, bytes] of Object.entries(langs)) {
      languageTotals[lang] = (languageTotals[lang] || 0) + bytes;
    }
  }

  // 3. Sort & trim
  const sorted = Object.entries(languageTotals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, langs_count);

  const totalBytes = sorted.reduce((sum, [, v]) => sum + v, 0);

  // 4. SVG theme
  const colors = {
    dracula: { bg: "#282a36", text: "#f8f8f2", bar: "#bd93f9" },
    light: { bg: "#ffffff", text: "#000000", bar: "#4c71f2" },
  };

  const t = colors[theme] || colors.dracula;

  // 5. Build SVG
  let y = 40;
  const bars = sorted
    .map(([lang, bytes]) => {
      const percent = ((bytes / totalBytes) * 100).toFixed(1);
      const barWidth = percent * 2;

      const block = `
        <text x="20" y="${y}" fill="${t.text}" font-size="12">${lang}</text>
        <text x="300" y="${y}" fill="${t.text}" font-size="12" text-anchor="end">${percent}%</text>
        <rect x="20" y="${y + 6}" width="${barWidth}" height="8" fill="${t.bar}" rx="4" />
      `;
      y += 26;
      return block;
    })
    .join("");

  const svg = `
<svg width="320" height="${y}" viewBox="0 0 320 ${y}"
  xmlns="http://www.w3.org/2000/svg">
  <style>
    text { font-family: system-ui, -apple-system, BlinkMacSystemFont; }
  </style>
  <rect width="100%" height="100%" fill="${t.bg}" rx="12"/>
  <text x="20" y="24" fill="${t.text}" font-size="14" font-weight="600">
    Top Languages
  </text>
  ${bars}
</svg>
`;

  res.setHeader("Content-Type", "image/svg+xml");
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.status(200).send(svg);
}
