# Security

## Reporting something

Email **vhlu@sims-service.com**, or open a
[private advisory](https://github.com/vglu/verso/security/advisories/new).
Please do not open a public issue for a vulnerability.

Tell us what you did, what happened, and what you expected. A document that
demonstrates it is worth more than a description; attach it if you can.

You will get an answer within a week. If the report is valid, you will be
credited in the release that fixes it, unless you would rather not be.

## What Verso does with a document

Verso opens files that other people send you, so the interesting question is
what a hostile document can make it do. The answers are deliberate:

- **Raw HTML is displayed as text, never executed** — in the editor and in
  exported files alike.
- **`javascript:` and `vbscript:` links are dropped** when a document is
  exported.
- **Nothing is fetched from the network.** Formulas and diagrams are rendered
  locally; an exported page embeds its pictures rather than linking to them.
- **Pictures are read through the asset protocol**, scoped to the document's
  own folder.
- **Document ids never become paths.** They end up in draft file names, so they
  are validated as plain tokens before they are joined to a directory.
- **Files are not written outside what you asked for.** Saving writes to the
  file you opened, atomically; export writes to the file you chose.

## What is out of scope

- The unsigned installer. Verso is not code-signed, and Windows SmartScreen
  will say so — that is a cost, not a vulnerability. Building from source
  avoids it.
- Anything requiring an attacker to already run code as you.
- Vulnerabilities in Tauri, WebView2, CodeMirror, KaTeX or Mermaid themselves —
  report those upstream, though we would still like to hear about it so the
  dependency can be pinned or updated.

## Supported versions

Verso is at 0.1 and there is one supported version: the latest release.
