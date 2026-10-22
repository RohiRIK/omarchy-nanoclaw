# Marketplace verify request draft

Not filed. Open a new "Verify or update a listed plugin" issue in
`omacom/omarchy-plugin-marketplace` and paste the title and body below.

Form: https://github.com/omacom/omarchy-plugin-marketplace/issues/new?template=verify-plugin.yml

## Title

`[Verify]: NanoClaw 0.2.0 — publish newer upstream commit`

## Body

```md
### Verification action

Verify and publish a newer upstream commit

### Plugin ID

rohirik.nanoclaw

### Repository URL

https://github.com/RohiRIK/omarchy-nanoclaw

### Target commit

78169c1628176749700c4bffcbb9526be2f065c3

### Verification acknowledgment

- [x] I understand that only the exact target commit can become a verified marketplace snapshot and that verification is not a security audit.
```

## Context

Checked 2026-10-22 against `origin`:

- Marketplace issue: https://github.com/omacom/omarchy-plugin-marketplace/issues/8977
- Listed commit: `285c593fb2139398b17e33abca1a2224954b1862` (approved Sep 28)
- Pushed HEAD: `78169c1628176749700c4bffcbb9526be2f065c3` (`docs: document free opencode setup`), 1 commit after the listed snapshot
- CI: `test` passed on the target commit — https://github.com/RohiRIK/omarchy-nanoclaw/actions/runs/38048321608
- Local `main`: `ebe3e4b47a031439a5e0b4429f9e6059c1b6f932`, 8 commits ahead of `origin/main`; those commits are not part of this request

If `main` is pushed again before this request is filed, update **Target commit** to the new pushed HEAD before filing.
