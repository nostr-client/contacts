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
  a one-entry list; a genuinely new user creates their first list with
  `follow(pubkey, pool, { allowCreate: true })`
- the user's contact list is cached page-wide (one fetch, every button
  shares it) — but a failed fetch is never cached, so the next click retries
- fires `nostr:contacts-changed` on `window` — feeds can refresh a
  "following" view instantly

## License

AGPL-3.0-or-later
