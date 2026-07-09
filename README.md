# contacts

`<nostr-follow-button>` + `<nostr-contacts>` — kind-3 contact list management.
**No build step.** One file: [`contacts.js`](contacts.js).

Part of [nostr-client](https://github.com/nostr-client) — a modular, composable
nostr client where each repo does one thing.

**Live demo:** https://nostr-client.github.io/contacts/

## Use

```html
<script type="module" src="https://nostr-client.github.io/contacts/contacts.js"></script>

<nostr-follow-button pubkey="<hex>"></nostr-follow-button>
<nostr-contacts></nostr-contacts>
```

Or programmatically:

```js
import { follow, unfollow, isFollowing } from 'https://nostr-client.github.io/contacts/contacts.js'
```

- publishing a new list **preserves what it doesn't understand**: non-`p`
  tags, relay hints and petnames on `p` tags, and the `content` field —
  this component won't wipe your follows' metadata like careless clients do
- if the existing list can't be fetched (relay timeout, list on other
  relays), it **refuses to publish** rather than replace your follows with
  a one-entry list — the error has `code: 'NO_CONTACT_LIST'`; a genuinely
  new user creates their first list with
  `follow(pubkey, pool, { allowCreate: true })` (the follow button asks
  for confirmation before doing this)
- mutations are **serialized**: rapid clicks on several follow buttons
  queue up instead of racing, so no update is lost
- publish failures show on the button (brief error state + tooltip) and
  log to the console
- the user's contact list is cached page-wide (one fetch, every button
  shares it) — but a failed fetch is never cached, so the next click retries
- composes with [cache](https://github.com/nostr-client/cache) for instant
  loads: reads render from IndexedDB immediately and refresh in the
  background, while **mutations always re-confirm the latest list from the
  network** first — a publish never builds on a stale cached copy (if that
  confirmation fails, the error has `code: 'STALE_CONTACT_LIST'`)
- fires `nostr:contacts-changed` on `window` — feeds can refresh a
  "following" view instantly (also after a background refresh finds a newer
  list)

## License

AGPL-3.0-or-later
