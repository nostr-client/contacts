/**
 * contacts.js — <nostr-follow-button> + <nostr-contacts>: kind-3 contact
 * list management. No build step.
 *
 * Part of https://github.com/nostr-client — one repo, one thing.
 * License: AGPL-3.0-or-later
 *
 * Usage:
 *   <script type="module" src="https://nostr-client.github.io/contacts/contacts.js"></script>
 *   <nostr-follow-button pubkey="<hex>"></nostr-follow-button>
 *   <nostr-contacts></nostr-contacts>   <!-- the logged-in user's follow list -->
 *
 * Publishing a new contact list PRESERVES everything it doesn't understand:
 * non-p tags, relay/petname fields on p-tags, and the content field.
 * If the existing list can't be fetched (relay timeout, wrong relays), it
 * REFUSES to publish rather than overwrite the user's follows with a fresh
 * list — pass { allowCreate: true } to follow() to publish a first list.
 * Fires 'nostr:contacts-changed' on window after a successful publish.
 */

import { defaultPool } from 'https://nostr-client.github.io/pool/pool.js'
import { profiles } from 'https://nostr-client.github.io/note/note.js'
import { npubShort } from 'https://nostr-client.github.io/nip19/nip19.js'

const HEX64 = /^[0-9a-f]{64}$/

/** Page-wide cached contact list for the logged-in user. */
async function myContacts(pool, refresh = false) {
  if (!window.nostrPubkey) return null
  const key = window.nostrPubkey
  const cache = (globalThis.__nostrClientContacts ??= {})
  if (refresh || cache.pubkey !== key) {
    cache.pubkey = key
    // Never cache a miss: null may just mean the relays timed out, and a
    // cached null would make every later publish start from an empty list.
    const promise = pool.get({ kinds: [3], authors: [key] }).then((ev) => {
      if (ev === null && cache.promise === promise) cache.pubkey = undefined
      return ev
    })
    cache.promise = promise
  }
  return cache.promise
}

function followedKeys(contactEvent) {
  return [...new Set((contactEvent?.tags ?? [])
    .filter((t) => t[0] === 'p' && HEX64.test(t[1] ?? ''))
    .map((t) => t[1]))]
}

async function publishContacts(pool, prevEvent, mutate, { allowCreate = false } = {}) {
  const signer = window.nostrSigner
  if (!signer) throw new Error('no signer — log in first')
  if (!prevEvent && !allowCreate) {
    // A missing previous list usually means the fetch timed out or the list
    // lives on other relays; publishing anyway would replace the user's whole
    // follow list with this one change.
    throw new Error('existing contact list not found (relay timeout?) — refusing to overwrite it; pass { allowCreate: true } to publish a first list')
  }
  const tags = [...(prevEvent?.tags ?? [])]
  const content = prevEvent?.content ?? ''
  const newTags = mutate(tags)
  const event = await signer.signEvent({
    kind: 3, created_at: Math.floor(Date.now() / 1000), tags: newTags, content,
  })
  const results = await pool.publish(event)
  if (!results.some((r) => r.ok)) throw new Error('no relay accepted the update')
  const cache = (globalThis.__nostrClientContacts ??= {})
  cache.pubkey = window.nostrPubkey
  cache.promise = Promise.resolve(event)
  window.dispatchEvent(new CustomEvent('nostr:contacts-changed', { detail: { event } }))
  return event
}

export async function follow(pubkey, pool = defaultPool(), { allowCreate = false } = {}) {
  const prev = await myContacts(pool)
  if (followedKeys(prev).includes(pubkey)) return prev
  return publishContacts(pool, prev, (tags) => [...tags, ['p', pubkey]], { allowCreate })
}

export async function unfollow(pubkey, pool = defaultPool()) {
  const prev = await myContacts(pool)
  if (!followedKeys(prev).includes(pubkey)) return prev
  return publishContacts(pool, prev, (tags) =>
    tags.filter((t) => !(t[0] === 'p' && t[1] === pubkey)))
}

export async function isFollowing(pubkey, pool = defaultPool()) {
  return followedKeys(await myContacts(pool)).includes(pubkey)
}

// ---------------------------------------------------------------- elements

const BTN_STYLE = /* css */ `
  :host { display: inline-block;
    font-family: var(--nc-font, ui-sans-serif, system-ui, sans-serif); font-size: .85rem; }
  button { font: inherit; cursor: pointer; border-radius: 999px; padding: .4em 1.1em;
    font-weight: 600; border: 1px solid var(--nc-line, #e9e6e0);
    background: var(--nc-accent, #7c3aed); color: var(--nc-accent-ink, #fff); border-color: transparent; }
  button.following { background: var(--nc-surface, #fff); color: var(--nc-ink, #201d26); border-color: var(--nc-line, #e9e6e0); }
  button.following:hover { color: var(--nc-danger, #c93a3a); border-color: var(--nc-danger, #c93a3a); }
  button.following:hover .label::after { content: 'Unfollow'; }
  button.following:hover .label span { display: none; }
  button:disabled { opacity: .45; cursor: default; }
`

class NostrFollowButton extends HTMLElement {
  static observedAttributes = ['pubkey']

  constructor() {
    super()
    this.attachShadow({ mode: 'open' }).innerHTML =
      `<style>${BTN_STYLE}</style><button id="b"><span class="label"><span>…</span></span></button>`
    this.btn = this.shadowRoot.getElementById('b')
    this._onAuth = () => this._refresh()
  }

  connectedCallback() {
    this.btn.onclick = () => this._toggle()
    window.addEventListener('nostr:login', this._onAuth)
    window.addEventListener('nostr:logout', this._onAuth)
    window.addEventListener('nostr:contacts-changed', this._onAuth)
    this._refresh()
  }

  disconnectedCallback() {
    window.removeEventListener('nostr:login', this._onAuth)
    window.removeEventListener('nostr:logout', this._onAuth)
    window.removeEventListener('nostr:contacts-changed', this._onAuth)
  }

  attributeChangedCallback() { if (this.isConnected) this._refresh() }

  get _pubkey() { return (this.getAttribute('pubkey') || '').toLowerCase() }

  _paint(following, enabled) {
    this.btn.disabled = !enabled
    this.btn.classList.toggle('following', following)
    this.btn.querySelector('.label span').textContent = following ? 'Following' : 'Follow'
  }

  async _refresh() {
    if (!HEX64.test(this._pubkey)) { this._paint(false, false); return }
    if (!window.nostrPubkey) { this._paint(false, false); return }
    if (window.nostrPubkey === this._pubkey) { this._paint(false, false); return }
    this._paint(await isFollowing(this._pubkey), true)
  }

  async _toggle() {
    this.btn.disabled = true
    try {
      if (await isFollowing(this._pubkey)) await unfollow(this._pubkey)
      else await follow(this._pubkey)
    } catch (err) { console.error('nostr-follow-button:', err) }
    this._refresh()
  }
}

const LIST_STYLE = /* css */ `
  :host { display: block;
    font-family: var(--nc-font, ui-sans-serif, system-ui, sans-serif);
    font-size: .95rem; color: var(--nc-ink, #201d26); }
  .status { font-size: .8rem; color: var(--nc-faint, #a8a4b0); margin: .4rem 0; }
  ul { list-style: none; margin: 0; padding: 0; display: grid; gap: .5rem; }
  li { display: flex; align-items: center; gap: .7rem; padding: .55rem .8rem;
    background: var(--nc-surface, #fff); border: 1px solid var(--nc-line, #e9e6e0);
    border-radius: var(--nc-radius-sm, 9px); }
  li img, li .name { cursor: pointer; }
  li .name:hover { text-decoration: underline; }
  .pfp { width: 34px; height: 34px; border-radius: 50%; flex: none; overflow: hidden;
    display: grid; place-items: center; color: #fff; font-weight: 700; font-size: .9rem; }
  .pfp img { width: 100%; height: 100%; object-fit: cover; }
  .name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis;
    white-space: nowrap; font-weight: 600; }
`

class NostrContacts extends HTMLElement {
  constructor() {
    super()
    this.attachShadow({ mode: 'open' }).innerHTML =
      `<style>${LIST_STYLE}</style><div class="status" id="s"></div><ul id="list"></ul>`
    this.$ = (id) => this.shadowRoot.getElementById(id)
    this._onChange = () => this._render()
  }

  connectedCallback() {
    window.addEventListener('nostr:login', this._onChange)
    window.addEventListener('nostr:logout', this._onChange)
    window.addEventListener('nostr:contacts-changed', this._onChange)
    this._render()
  }

  disconnectedCallback() {
    window.removeEventListener('nostr:login', this._onChange)
    window.removeEventListener('nostr:logout', this._onChange)
    window.removeEventListener('nostr:contacts-changed', this._onChange)
  }

  async _render() {
    // overlapping renders (login + contacts-changed firing together) must not
    // both append — last call wins
    const seq = (this._seq = (this._seq ?? 0) + 1)
    const list = this.$('list')
    if (!window.nostrPubkey) { list.innerHTML = ''; this.$('s').textContent = 'log in to see your contacts'; return }
    this.$('s').textContent = 'loading…'
    const contacts = await myContacts(defaultPool())
    if (seq !== this._seq) return
    list.innerHTML = ''
    const keys = followedKeys(contacts)
    this.$('s').textContent = keys.length ? keys.length + ' following' : 'not following anyone yet'
    for (const pk of keys) {
      const li = document.createElement('li')
      const img = document.createElement('span')
      img.className = 'pfp'
      const hue = parseInt(pk.slice(0, 4), 16) % 360
      img.style.background = `linear-gradient(135deg, hsl(${hue} 62% 60%), hsl(${(hue + 55) % 360} 62% 44%))`
      const name = document.createElement('span')
      name.className = 'name'
      name.textContent = npubShort(pk)
      const btn = document.createElement('nostr-follow-button')
      btn.setAttribute('pubkey', pk)
      const openProfile = () => {
        const custom = new CustomEvent('nostr:profile-click', {
          detail: { pubkey: pk }, bubbles: true, composed: true, cancelable: true,
        })
        if (this.dispatchEvent(custom)) {
          window.open('https://nostr-client.github.io/profile/#' + pk, '_blank', 'noopener')
        }
      }
      img.onclick = openProfile
      name.onclick = openProfile
      li.append(img, name, btn)
      list.append(li)
      profiles().get(pk, (profile) => {
        if (!profile) return
        const display = profile.display_name || profile.name
        if (display) {
          name.textContent = display
          if (!img.querySelector('img')) img.textContent = [...display][0].toUpperCase()
        }
        if (profile.picture?.startsWith('https://')) {
          const real = document.createElement('img')
          real.alt = ''
          real.onload = () => { img.textContent = ''; img.append(real) }
          real.src = profile.picture
        }
      })
    }
  }
}

if (!customElements.get('nostr-follow-button')) customElements.define('nostr-follow-button', NostrFollowButton)
if (!customElements.get('nostr-contacts')) customElements.define('nostr-contacts', NostrContacts)
