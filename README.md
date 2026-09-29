# Whiteboard Deck

Create original offline whiteboard presentations with real SVG handwriting,
presenter-controlled beats, speaker notes, transcripts and citations.
**HTML is the default and authoritative presentation.** Optional PowerPoint
export creates a native progressive-slide adaptation alongside the HTML.

This repository distributes the complete **1.1.2** skill and a generic
starter. It contains no reference presentations or generated topic decks.
Licensed under the [MIT License](LICENSE).

## Install

Prerequisites: Node.js 22.12+, Git, and GitHub Copilot CLI.

```powershell
gh repo clone jonnybottles/whiteboard-deck
Set-Location whiteboard-deck
node scripts\verify-distribution.mjs
node scripts\install-skill.mjs
```

The installer copies only the verified `whiteboard-deck` payload to
`%USERPROFILE%\.copilot\skills\whiteboard-deck`. It does not install npm
dependencies, initialize another Git repository, or upload anything.
Restart your CLI session after installation.

To test or install to another location:

```powershell
node scripts\install-skill.mjs --destination C:\path\to\skills\whiteboard-deck
```

A managed, unmodified previous installation can be replaced. An unrelated,
incomplete or locally edited installation is rejected rather than overwritten.
Keep the repository checkout separate from your installed skill; the payload's
strict manifest must not contain a `.git` directory or extra files.

## Use

Ask the skill to create a researched, audience-appropriate deck:

```text
Use whiteboard-deck to explain Git branching to new developers.
Produce HTML only and include sources.
```

If format is unresolved, the skill offers **HTML only (recommended, default)**
or **HTML and PowerPoint**. Declining that choice selects HTML only.
An explicit PowerPoint request always includes the HTML, never PPTX alone.

Or scaffold directly from the checkout:

```powershell
node whiteboard-deck\scripts\scaffold.mjs --destination C:\path\to\my-deck --title "My topic" --slug my-topic
```

The destination must be new or empty. The starter is not researched content;
replace its sample narrative before presenting.

From the generated project:

```powershell
npm ci
npm run build
npm test
npm run test:browser -- --project=edge
```

This produces `presentations\<slug>.html`. For PowerPoint as well:

```powershell
npm run build:pptx
npm run test:pptx
```

Combined output is `presentations\<slug>.html` and `presentations\<slug>.pptx`.
Optional export requires Python 3 and installed Edge or Chrome. It does not
require Office, cloud resources, conversion services or a runtime server.
Presentation content is rendered locally without network access.

PowerPoint preserves the original artwork as embedded 3000 x 1800 board images,
one cumulative slide per completed presenter beat, plus editable native notes
and source information. White 16:9 slides center the original 5:3 composition.
Canvas labels are not individually editable, and there is **no native stroke
animation**. The HTML retains the original playback, accessible transcript and
controls. Neither finished artifact requires sign-in or a network to present.

See `whiteboard-deck\ONBOARDING.md` and the included references for inspection,
safe reference handling and fidelity limitations.

## Update

In the repository checkout:

```powershell
git pull --ff-only
node scripts\verify-distribution.mjs
node scripts\install-skill.mjs
```

Preserve intentional local changes before resolving a dirty checkout or modified
installation. Do not force-pull or merge an incomplete package over an existing
skill. Generated projects are independent copies; updating the skill does not
overwrite them.

## Dependencies and network policy

The starter lockfile pins versions and integrity hashes but deliberately omits
registry-specific tarball locations. npm uses the recipient's configured
package registry; this repository supplies no registry override or credentials.
Use only registries permitted by your organization's policy. Do not bypass an
IT block, disable integrity checks, or silently substitute dependency versions.

This distribution is tested through the maintainer's approved package feed.
Installation through other feeds, including the public registry, is **not
verified**. If a pinned version cannot be resolved, report the error and check
with your administrator. Initial dependency installation needs approved network
access; presenting the finished artifacts does not.

## Distribution checks

Root commands require no npm dependency installation:

```powershell
npm run verify
npm test
npm run test:integration
```

Integration testing creates a temporary isolated installation/project, installs
its declared dependencies through the configured feed, and exercises HTML,
browser and native PPTX checks. Temporary output is removed afterward; it does
not modify your real personal skill installation.

Before a reviewed source update is committed or pushed:

```powershell
node scripts\verify-distribution.mjs --staged
node scripts\verify-distribution.mjs --commit HEAD
```

The verifier checks the exact file allowlist, payload hashes, portable lockfile
and common sensitive-content patterns in the selected snapshot. It prints only
finding locations/categories, not matched values. Automated checks do not
guarantee that all sensitive information has been detected; review the actual
diff and Git metadata too.

## Maintenance boundaries

Keep reference documents, generated HTML/PPTX decks, archives, screenshots,
credentials, machine configuration and test output outside this repository.
The two included HTML files are source templates, not finished decks.
Public documentation links, library funding metadata and standard XML namespaces
are not external presentation asset dependencies.

This is a reviewed distribution of the original skill, not a second manually
maintained presentation narrative. Update payload source deliberately, preserve
upstream attribution, review every change, and regenerate its manifest only
after that review. The verifier intentionally provides no automatic "fix all
hashes" escape hatch.
