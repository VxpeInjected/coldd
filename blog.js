/* Shared data + helpers for blog, tutorials, and releases pages. */
(function () {
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function slugify(s) {
    return String(s).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }

  function fmtDate(iso) {
    var d = new Date(iso + 'T00:00:00');
    if (isNaN(d.getTime())) return iso;
    var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return months[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear();
  }

  function qp(name) {
    var m = new RegExp('[?&]' + name + '=([^&]*)').exec(location.search);
    return m ? decodeURIComponent(m[1].replace(/\+/g, ' ')) : '';
  }

  /* Accepts youtube.com/watch?v=, youtu.be/, youtube.com/embed/, or a bare
     video id; returns an embeddable URL or null if it doesn't look like one. */
  function ytEmbed(url) {
    if (!url) return null;
    var m = String(url).trim().match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|^)([a-zA-Z0-9_-]{11})(?:[?&#]|$)/);
    return m ? 'https://www.youtube.com/embed/' + m[1] : null;
  }

  /* Minimal markdown-lite: blank-line paragraphs, ## / ### headings (get slug ids
     for anchor/TOC use), "- " bullet lists, **bold**, `code`. Nothing else. */
  function mdLite(src) {
    if (!src) return '';
    var lines = String(src).replace(/\r\n/g, '\n').split('\n');
    var out = [], para = [], list = [];

    function inline(s) {
      s = esc(s);
      s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
      s = s.replace(/`(.+?)`/g, '<code>$1</code>');
      return s;
    }
    function flushPara() { if (para.length) { out.push('<p>' + inline(para.join(' ')) + '</p>'); para = []; } }
    function flushList() { if (list.length) { out.push('<ul>' + list.map(function (i) { return '<li>' + inline(i) + '</li>'; }).join('') + '</ul>'); list = []; } }

    lines.forEach(function (raw) {
      var line = raw.trim();
      if (!line) { flushPara(); flushList(); return; }
      var h = line.match(/^(#{2,3})\s+(.*)$/);
      if (h) {
        flushPara(); flushList();
        var level = h[1].length, text = h[2];
        out.push('<h' + level + ' id="' + slugify(text) + '">' + inline(text) + '</h' + level + '>');
        return;
      }
      var li = line.match(/^-\s+(.*)$/);
      if (li) { flushPara(); list.push(li[1]); return; }
      flushList();
      para.push(line);
    });
    flushPara(); flushList();
    return out.join('\n');
  }

  window.__blog = { esc: esc, slugify: slugify, fmtDate: fmtDate, qp: qp, mdLite: mdLite, ytEmbed: ytEmbed };

  window.__TUTORIALS = [
    {
      id: 'tut-1', slug: 'datastore-that-wont-corrupt-your-saves', title: 'DataStore that won’t corrupt your saves',
      summary: 'UpdateAsync, retry backoff, BindToClose, and schema versioning — the four habits that stop save corruption before it ships.',
      cover: 'scripts.jpg', track: 'Scripting', difficulty: 'Intermediate', platform: 'Roblox', order: 1, estMins: 12, visible: true, video: '',
      body: [
        'Most DataStore bugs never show up in Studio. They show up three weeks after launch, when two servers write to the same key at once and one write silently overwrites the other.',
        '## Why UpdateAsync beats SetAsync',
        '`SetAsync` always overwrites. `UpdateAsync` hands you the last saved value and lets you merge before writing, so a lagging server can’t stomp a newer save coming from a different server.',
        '## Retry logic that doesn’t spam the API',
        'Wrap every DataStore call in a retry loop with backoff, capped at three attempts with a half-second gap. That catches transient failures without hammering the API when the service is genuinely down.',
        '## Save on BindToClose, not just on leave',
        '`PlayerRemoving` fires when a player leaves, but a server shutdown skips right past it. `game:BindToClose()` is the only hook guaranteed to run before the server closes — that’s where your final save belongs.',
        '## Version your data structure',
        'Add a `schemaVersion` field to every save. When you change what a save looks like six months from now, you’ll be glad you can tell old saves from new ones instead of guessing.'
      ].join('\n\n')
    },
    {
      id: 'tut-2', slug: 'writing-a-modular-combat-system', title: 'Writing a modular combat system',
      summary: 'Separate hit detection, damage calculation, and feedback into swappable modules so one weapon change doesn’t risk the whole system.',
      cover: 'banner.jpg', track: 'Scripting', difficulty: 'Intermediate', platform: 'Roblox', order: 2, estMins: 15, visible: true, video: '',
      body: [
        'The fastest way to make a combat system unmaintainable is to put hit detection, damage math, and hit-feedback in the same function. Change one weapon and you risk breaking all of them.',
        '## Split into three modules',
        'Keep `HitDetector`, `DamageCalculator`, and `FeedbackController` as separate ModuleScripts that only talk through plain tables — no shared state, no cross-referencing each other’s internals.',
        '## Hit detection should return data, not apply damage',
        'A detector’s only job is answering "what got hit, and where." Let the damage calculator decide what that means. This is what lets you swap raycasts for a hitbox system later without touching damage logic.',
        '## Server-authoritative, client-predicted',
        'Run the real hit check on the server. Let the client play the hit animation immediately for feel, then reconcile if the server disagrees. Players notice a laggy hitmarker far more than a rare misprediction.'
      ].join('\n\n')
    },
    {
      id: 'tut-3', slug: 'debugging-server-client-replication', title: 'Debugging server-client replication',
      summary: 'A checklist for the three replication bugs that eat the most debugging time: stale reads, ordering races, and silent RemoteEvent drops.',
      cover: 'scripts.jpg', track: 'Scripting', difficulty: 'Advanced', platform: 'Roblox', order: 3, estMins: 14, visible: true, video: '',
      body: [
        'Replication bugs are miserable because they’re non-deterministic — they pass in Studio and fail on a real server with real latency. Here’s the order to check things in.',
        '## Check for stale local reads first',
        'If a client reads a value immediately after firing a RemoteEvent that changes it, it’s reading the pre-replication value. Always wait for the server’s confirmation event before trusting client-side state.',
        '## Ordering is not guaranteed across RemoteEvents',
        'Two RemoteEvents fired back to back on the server are not guaranteed to arrive in that order on the client. If sequence matters, bundle the data into one event instead of two.',
        '## Silent drops usually mean an unyielded connection',
        'A RemoteEvent handler that errors partway through stops executing but doesn’t crash anything visibly. Wrap handler bodies in `pcall` during development so a silent failure shows up in the output instead of just... not happening.'
      ].join('\n\n')
    },
    {
      id: 'tut-4', slug: 'building-a-slot-based-inventory-from-scratch', title: 'Building a slot-based inventory from scratch',
      summary: 'Grid state, drag-and-drop without dropped items, and stack merging — the three pieces that make an inventory feel solid instead of fragile.',
      cover: 'scripts.jpg', track: 'Scripting', difficulty: 'Intermediate', platform: 'Roblox', order: 4, estMins: 18, visible: true, video: '',
      body: [
        'A slot-based inventory is really just a fixed-size array with UI on top. Most of the difficulty is in the drag-and-drop, not the data.',
        '## Model the grid as data first',
        'Before touching UI, decide the grid is a flat array of `{itemId, count}` or `nil`. Every operation — add, remove, move, stack — should be a pure function over that array you can test without a single Frame on screen.',
        '## Drag-and-drop needs a "last valid slot" fallback',
        'If a drag ends outside any slot, snap back to the origin slot rather than dropping the item into the world or deleting it. This single rule fixes most of the "items vanished" reports you’ll get in playtesting.',
        '## Merge stacks on drop, not on pickup',
        'Check for a mergeable stack only at the moment an item lands in a slot. Merging eagerly on pickup causes items to combine in ways players didn’t intend when they’re just rearranging.'
      ].join('\n\n')
    },
    {
      id: 'tut-5', slug: 'optimizing-part-count-before-you-ship', title: 'Optimizing part count before you ship',
      summary: 'Where part count actually comes from, and the three passes that cut it fastest: unions, meshes, and hidden-surface removal.',
      cover: 'builds.jpg', track: 'Building', difficulty: 'Beginner', platform: 'Roblox', order: 1, estMins: 9, visible: true, video: '',
      body: [
        'Part count problems almost always come from the same source: detail work done with dozens of small Parts instead of one mesh or union.',
        '## Union repetitive detail, don’t leave it loose',
        'Trim, railings, and paneling that repeat across a build are the first thing to union. A hundred loose Parts forming a railing is a hundred physics bodies; one union is one.',
        '## Convert static decoration to MeshParts',
        'Anything that never moves and doesn’t need to be a Part specifically (barrels, crates, foliage) should be a mesh. Meshes render cheaper and don’t carry the same per-instance overhead.',
        '## Delete what the camera will never see',
        'Interiors of buildings players can’t enter, the undersides of terrain, backs of billboards — if there’s no path for a player to see it, it shouldn’t exist. Walk your own map like a player before you optimize anything else.'
      ].join('\n\n')
    },
    {
      id: 'tut-6', slug: 'lighting-a-map-without-killing-fps', title: 'Lighting a map without killing FPS',
      summary: 'Future lighting technology is not free — here’s how to get the mood without tanking low-end devices.',
      cover: 'products.jpg', track: 'Building', difficulty: 'Intermediate', platform: 'Roblox', order: 2, estMins: 11, visible: true, video: '',
      body: [
        'Future lighting looks great and costs the most of any lighting technology in Roblox. Most maps don’t need it everywhere — they need it where the player is looking.',
        '## Bake what doesn’t move',
        'Static architectural lighting can often be faked with texture and color instead of real-time light sources. Reserve actual PointLights and SpotLights for things that matter: a flickering sign, a flashlight, an explosion.',
        '## Cap your light count per room',
        'A dense interior with fifteen small point lights is worse for performance than three well-placed ones with a slightly larger range. Fewer, better-aimed lights read as more intentional anyway.',
        '## Test on the device you’re worried about',
        'Studio’s viewport is not representative of a five-year-old phone. If your target audience plays on mobile, test lighting changes on actual mobile hardware, not just a graphics-quality slider.'
      ].join('\n\n')
    },
    {
      id: 'tut-7', slug: 'blocking-out-a-level-before-you-detail-it', title: 'Blocking out a level before you detail it',
      summary: 'Why skipping greybox and going straight to detail is the single biggest cause of reworked maps.',
      cover: 'builds.jpg', track: 'Building', difficulty: 'Beginner', platform: 'Both', order: 3, estMins: 8, visible: true, video: '',
      body: [
        'The maps that get reworked the most are the ones where detailing started before the layout was tested. Blocking out first fixes that.',
        '## Use plain blocks, no materials, no detail',
        'Build the entire layout in grey Parts sized to scale. The goal is to answer "does this space work" before you spend a single hour on decoration that you might delete.',
        '## Playtest the greybox, not just the finished map',
        'Walk the blockout as if it were done. Sightlines, choke points, and traversal time are all decided at this stage — detailing later won’t fix a layout that doesn’t play well.',
        '## Lock the layout before detailing starts',
        'Once the blockout passes playtesting, treat the footprint as fixed. Detail work that has to be torn out because the layout changed underneath it is the most common source of wasted build time.'
      ].join('\n\n')
    },
    {
      id: 'tut-8', slug: 'configuring-a-skyblock-economy-plugin', title: 'Configuring a Skyblock economy plugin',
      summary: 'Starting balances, sell-price curves, and the inflation traps that quietly ruin a Skyblock server’s economy within a month.',
      cover: 'minecraft.jpg', track: 'Server Setup', difficulty: 'Intermediate', platform: 'Minecraft', order: 1, estMins: 16, visible: true, video: '',
      body: [
        'A Skyblock economy that feels fine on day one and breaks by week three is almost always an inflation problem, not a bug.',
        '## Keep starting balances low',
        'A generous starting balance feels welcoming but devalues everything a new player earns in their first hour. Start players near zero and let early quests be the income, not a handout.',
        '## Sell prices should decay with volume',
        'If cobblestone sells for a flat price forever, a single player with a cobble generator can flood the market and crash your economy’s meaning. A decaying sell curve keeps grinding worthwhile without breaking the ceiling.',
        '## Add currency sinks before you add currency sources',
        'Every new way to earn money needs a matching way to spend it — upgrades, cosmetics, cooldown skips. An economy with sources and no sinks only goes one direction: worthless money by month two.'
      ].join('\n\n')
    },
    {
      id: 'tut-9', slug: 'cross-version-compatibility-1-20-to-1-21', title: 'Cross-version compatibility, 1.20 to 1.21',
      summary: 'What actually breaks between Minecraft versions, and how to keep one server running for both without maintaining two builds.',
      cover: 'minecraft.jpg', track: 'Server Setup', difficulty: 'Advanced', platform: 'Minecraft', order: 2, estMins: 13, visible: true, video: '',
      body: [
        'Most cross-version breakage isn’t the game version — it’s plugins and data packs assuming a block ID or NBT structure that changed underneath them.',
        '## Pin your plugin versions, not just the server jar',
        'A plugin that "still loads" on a new version isn’t proof it still works correctly. Check each plugin’s changelog for the target version specifically before trusting it in production.',
        '## Use a version-bridging proxy for mixed clients',
        'If you need 1.20 and 1.21 clients on the same server, a protocol-translation proxy in front of the server is far more maintainable than trying to support both natively.',
        '## Snapshot before every version bump',
        'A full world and plugin-config backup before upgrading costs a few minutes. Discovering an incompatibility after the upgrade with no rollback costs a weekend.'
      ].join('\n\n')
    },
    {
      id: 'tut-10', slug: 'backing-up-a-server-without-downtime', title: 'Backing up a server without downtime',
      summary: 'A backup routine that doesn’t freeze the world, doesn’t corrupt saves, and doesn’t require anyone to remember to run it.',
      cover: 'frostline.jpg', track: 'Server Setup', difficulty: 'Beginner', platform: 'Minecraft', order: 3, estMins: 7, visible: true, video: '',
      body: [
        'A backup you have to remember to run is a backup that won’t exist the one time you actually need it.',
        '## Flush before you copy',
        'Force a world save (`save-all flush`) immediately before copying world files. Copying a world mid-write is the single most common cause of a "restored" backup that’s actually corrupted.',
        '## Schedule it, don’t rely on memory',
        'A cron job or scheduled task beats a sticky note every time. Nightly is the right cadence for most small servers — frequent enough to matter, infrequent enough not to eat disk space.',
        '## Keep at least three generations',
        'One backup protects you from data loss. Three protects you from a backup you didn’t notice was already corrupted — you can still fall back one generation further.'
      ].join('\n\n')
    }
  ];

  window.__POSTS = [
    {
      id: 'post-1', slug: 'shipping-all-brawl-what-almost-didnt-make-it', title: 'Shipping ALL BRAWL: what almost didn’t make it',
      dek: 'The fighting game template took four rewrites of the hit-registration system before launch. Here’s what changed each time.',
      cover: 'premade.jpg', category: 'Devlog', tags: ['Roblox', 'Devlog'], author: 'Dax T.', date: '2026-07-10', readMins: 6, featured: true, visible: true,
      body: [
        'ALL BRAWL went through four different hit-registration systems before the one that shipped. Three of them worked fine in Studio and fell apart the moment real latency got involved.',
        '## Attempt one: pure client-side hit detection',
        'Fast to build, felt great locally, and was trivially exploitable the moment we playtested with a friend on a bad connection. Scrapped in a day.',
        '## Attempt two: fully server-authoritative, no prediction',
        'Fixed the exploit, introduced a hit-registration delay players described as "sluggish" in almost every playtest note. Correct, but not fun.',
        '## What actually shipped',
        'Client-predicted hit feedback with server-authoritative damage, reconciled only when the two disagree — the same pattern we now write up as our combat systems tutorial. It took three failed versions to arrive at something this unremarkable-sounding, which is usually how it goes.',
        'ALL BRAWL launched on April 3rd and has held up through 214 reviews without a single hit-registration complaint, which is the only metric that actually matters here.'
      ].join('\n\n')
    },
    {
      id: 'post-2', slug: 'frostline-survival-kit-six-months-of-biome-iteration', title: 'Frostline Survival Kit: six months of biome iteration',
      dek: 'The biome system shipped is the fifth version. The first four all had the same problem: biomes that looked distinct on a map and identical while walking through them.',
      cover: 'frostline.jpg', category: 'Devlog', tags: ['Roblox', 'Devlog'], author: 'Priya N.', date: '2026-06-02', readMins: 5, featured: false, visible: true,
      body: [
        'Frostline Survival Kit’s biomes looked great from a bird’s-eye map view for months before we noticed the actual problem: at ground level, walking from the tundra into the forest felt like nothing had changed.',
        '## The map view was lying to us',
        'Color-coded terrain reads as distinct from above. At eye level, without a strong silhouette change — tree density, fog color, ground texture — players couldn’t tell one biome from the next.',
        '## What fixed it wasn’t more detail, it was silhouette',
        'We stopped adding biome-specific props and started changing tree spacing, fog distance, and skybox tint first. That alone did more for biome identity than every prop pass combined.',
        'Frostline shipped March 1st with five distinct biomes, and the most common piece of playtest feedback since has been that players can tell which biome they’re in with their eyes closed — or close enough to it.'
      ].join('\n\n')
    },
    {
      id: 'post-3', slug: 'why-we-rebuilt-the-combat-hud-kit-from-scratch', title: 'Why we rebuilt the Combat HUD Kit from scratch',
      dek: 'A hitmarker desync bug that only appeared under real network conditions forced a rewrite instead of a patch.',
      cover: 'banner.jpg', category: 'Devlog', tags: ['Roblox', 'Devlog'], author: 'Dax T.', date: '2026-05-20', readMins: 4, featured: false, visible: true,
      body: [
        'The Combat HUD Kit’s hitmarker desync bug (the one fixed in v2.5.4) turned out to be structural, not a typo we could patch around — the HUD was reading local hit events instead of the server’s confirmed hit events.',
        '## The symptom vs. the cause',
        'Players reported hitmarkers appearing on misses and staying silent on real hits. The actual cause was the HUD listening to the same client-side raycast used for hit *feedback*, instead of the server’s damage confirmation.',
        '## A patch would have hidden it, not fixed it',
        'We could have added a timing fudge to make the desync less noticeable. We rebuilt the event wiring instead, so the HUD only reacts to server-confirmed hits — the same principle from our replication debugging tutorial, learned the hard way first.',
        'It’s a smaller change than it sounds, and it’s the reason the fix shipped as a patch version instead of a new major release — the HUD looks identical, the plumbing underneath doesn’t lie anymore.'
      ].join('\n\n')
    },
    {
      id: 'post-4', slug: 'were-now-a-team-of-six', title: 'We’re now a team of six',
      dek: 'Two new hires, one new discipline (dedicated build lead), and what that changes about how fast we ship.',
      cover: 'team-bg.jpg', category: 'Studio News', tags: ['Studio'], author: 'Sable K.', date: '2026-03-10', readMins: 3, featured: false, visible: true,
      body: [
        'coldd started as three people trading off every role. As of this month, we’re six — and for the first time, building and scripting are fully separate disciplines here instead of the same two people doing both badly at 2am.',
        '## What changed operationally',
        'Every product now gets a dedicated build pass and a dedicated scripting pass instead of one person context-switching between them. Early results: fewer half-finished interiors, fewer scripts written around a layout that changed after the fact.',
        '## What didn’t change',
        'Every product still ships with the same support commitment it always has — more hands doesn’t mean less ownership. If anything, having a dedicated build lead means bug reports about geometry get fixed by someone who actually specializes in it.'
      ].join('\n\n')
    },
    {
      id: 'post-5', slug: 'how-we-handle-refunds-and-why-we-changed-it', title: 'How we handle refunds (and why we changed it)',
      dek: 'Our old refund process took up to a week. The new one, live as of last month, resolves most requests same-day.',
      cover: 'cta-bg.jpg', category: 'Studio News', tags: ['Studio'], author: 'Sable K.', date: '2026-04-25', readMins: 4, featured: false, visible: true,
      body: [
        'Until recently, refund requests went through a shared inbox, got manually cross-checked against purchase records, and could take up to a week to resolve. That was never intentional — it’s just what happens when a process grows informally.',
        '## What we built instead',
        'Refund requests now route straight into the admin dashboard’s Refunds panel, tied directly to the order record, with an audit trail on every decision. Support staff can approve or deny from the same screen they see the order on, instead of switching between three tools.',
        '## The result so far',
        'Most refund requests now resolve same-day. The ones that don’t are almost always waiting on a reply from the customer, not on us — which is the outcome we were actually trying to get to.'
      ].join('\n\n')
    },
    {
      id: 'post-6', slug: 'the-part-count-mistake-everyone-makes-early', title: 'The part count mistake everyone makes early',
      dek: 'It’s not that new builders use too many Parts. It’s that they union too late to matter.',
      cover: 'builds.jpg', category: 'Craft', tags: ['Roblox', 'Building'], author: 'Priya N.', date: '2026-06-15', readMins: 4, featured: false, visible: true,
      body: [
        'The most common part-count mistake isn’t using too many Parts — every build starts that way. It’s treating unioning as a final cleanup step instead of something you do as you go.',
        '## Cleanup-pass unioning comes too late',
        'By the time a build is "done" and someone goes back to union repetitive detail, the habits that created the mess have already shaped a hundred other decisions — file size, load time, physics cost, all baked in.',
        '## Union as you build repeating detail, not after',
        'The moment you copy-paste a railing section for the third time, that’s the moment to union it, not the moment before shipping. We cover the full pass — unions, meshes, hidden-surface removal — in the part-count tutorial if you want the checklist version.'
      ].join('\n\n')
    },
    {
      id: 'post-7', slug: 'datastores-are-not-a-database-treat-them-like-one-anyway', title: 'DataStores are not a database. Treat them like one anyway.',
      dek: 'Roblox DataStores don’t give you transactions, indexes, or query support — but the discipline of treating them like a real database is what prevents corrupted saves.',
      cover: 'scripts.jpg', category: 'Craft', tags: ['Roblox', 'Scripting'], author: 'Dax T.', date: '2026-07-01', readMins: 5, featured: false, visible: true,
      body: [
        'DataStores look like a key-value store because that’s what the API surface is. Treating them like a casual cache instead of a database is where most save-corruption bugs start.',
        '## No transactions means you design for partial failure',
        'A multi-key update can fail halfway. If your save logic assumes all-or-nothing, it will eventually leave a player’s data in a state your game never expected.',
        '## Schema discipline matters more without a schema enforcer',
        'A real database rejects a malformed row. A DataStore will happily save whatever table you hand it, which means the discipline of versioning and validating your own data shape has to come from you, not the platform.',
        'The full walkthrough — UpdateAsync, retry backoff, BindToClose, schema versioning — is in the DataStore tutorial if you want the implementation, not just the philosophy.'
      ].join('\n\n')
    },
    {
      id: 'post-8', slug: 'what-we-learned-running-40-skyblock-servers', title: 'What we learned running 40 Skyblock servers',
      dek: 'Every Skyblock Network Hub sale comes with support, which means we’ve watched roughly forty economies succeed or quietly break over the past year.',
      cover: 'minecraft.jpg', category: 'Craft', tags: ['Minecraft', 'Server Setup'], author: 'Priya N.', date: '2026-07-17', readMins: 5, featured: true, visible: true,
      body: [
        'Supporting the Skyblock Network Hub means we end up in the Discord of roughly forty different servers running it. The economies that survive and the ones that quietly die by month two split on a small number of decisions.',
        '## The servers that failed almost always started generous',
        'A high starting balance feels like good hospitality. In every case we watched go wrong, it also meant the early game had nothing left to sell for, because players already had money for it.',
        '## The servers that lasted had sinks before they had sources',
        'Every surviving economy we tracked added at least one meaningful currency sink — cosmetic, convenience, or cooldown-based — before adding a new way to earn money, not after.',
        'We wrote up the specific configuration choices in the Skyblock economy tutorial. This post is the pattern; that one is the checklist.'
      ].join('\n\n')
    }
  ];

  window.__RELEASES = [
    { id: 'rel-1', version: 'v2.6.0', date: '2026-07-18', kind: 'Feature', title: 'Robux pricing shown site-wide', summary: 'Every price on the site now shows a live Robux equivalent next to the USD price, not just at checkout.', details: '', affects: [], visible: true },
    { id: 'rel-2', version: 'v2.5.4', date: '2026-07-02', kind: 'Fix', title: 'Combat HUD Kit — hitmarker desync fixed', summary: 'Hitmarkers were reading local hit events instead of server-confirmed hits, causing false positives and missed markers under real latency.', details: '', affects: ['combat-hud-kit'], visible: true },
    { id: 'rel-3', version: '', date: '2026-06-24', kind: 'Announcement', title: 'Resell licences now cover Frostline Survival Kit', summary: 'Frostline Survival Kit joins the resell-eligible catalog — grab a licence and sell it under your own store.', details: '', affects: ['frostline-survival-kit'], visible: true },
    { id: 'rel-4', version: 'v2.5.0', date: '2026-06-10', kind: 'Feature', title: 'Currency switcher: pay in Robux or USD at checkout', summary: 'Checkout now supports paying directly in Robux at a fixed conversion rate, alongside standard USD checkout.', details: '', affects: [], visible: true },
    { id: 'rel-5', version: 'v2.4.3', date: '2026-05-28', kind: 'Fix', title: 'Skyblock Network Hub — portal teleport offset fixed on 1.21', summary: 'Portals were spawning players slightly inside terrain on 1.21 servers due to a changed block-height default.', details: '', affects: ['skyblock-network-hub'], visible: true },
    { id: 'rel-6', version: '', date: '2026-05-14', kind: 'Announcement', title: 'Spring Sale: 30% off every Roblox template', summary: 'Every Roblox template is 30% off through the end of the sale window — no code needed, discount applies at checkout.', details: '', affects: [], visible: true },
    { id: 'rel-7', version: 'v2.4.0', date: '2026-05-01', kind: 'Feature', title: 'New admin dashboard: analytics, refunds, staff roles', summary: 'A full internal dashboard rebuild — live analytics, a proper refunds workflow, role-gated staff access, and an audit log.', details: '', affects: [], visible: true },
    { id: 'rel-8', version: 'v2.3.2', date: '2026-04-19', kind: 'Fix', title: 'Inventory UI Pack — drag and drop no longer drops items off-screen', summary: 'Dragging a slot past the inventory bounds could delete the item instead of returning it. Drops now always snap back to the last valid slot.', details: '', affects: ['inventory-ui-pack'], visible: true },
    { id: 'rel-9', version: 'v2.3.0', date: '2026-04-03', kind: 'Feature', title: 'ALL BRAWL Full Game launches', summary: 'Our first complete fighting game template, fully scripted with client-predicted, server-authoritative combat.', details: '', affects: ['all-brawl-full-game'], visible: true },
    { id: 'rel-10', version: 'v2.2.1', date: '2026-03-22', kind: 'Fix', title: 'VFX Starter Pack — explosion particles no longer persist after round end', summary: 'Particle emitters weren’t being cleaned up on round reset, causing effects to stack up over a long play session.', details: '', affects: ['vfx-starter-pack'], visible: true },
    { id: 'rel-11', version: '', date: '2026-03-10', kind: 'Announcement', title: 'coldd is now a team of six', summary: 'Two new hires and a dedicated build discipline — read the full studio update on the blog.', details: '', affects: [], visible: true },
    { id: 'rel-12', version: 'v2.2.0', date: '2026-03-01', kind: 'Feature', title: 'Frostline Survival Kit launches', summary: 'A full survival game template with five distinct biomes, crafting, and long-term progression.', details: '', affects: ['frostline-survival-kit'], visible: true },
    { id: 'rel-13', version: 'v2.1.0', date: '2026-02-12', kind: 'Feature', title: 'Wishlist and referral rewards added to product pages', summary: 'Save products to a wishlist, and earn a percentage back when a referral link leads to a sale.', details: '', affects: [], visible: true }
  ];

  /* ----------------------------------------------------------------
     Content source: admin edits live in localStorage; fall back to
     the seed arrays above when a store hasn't been written yet.
     ---------------------------------------------------------------- */
  function lsGet(key, fallback) {
    try { var v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); } catch (_) { return fallback; }
  }
  function posts() { return (lsGet('coldd_admin_posts_v1', window.__POSTS) || []).filter(function (p) { return p.visible !== false; }); }
  function tutorials() { return (lsGet('coldd_admin_tutorials_v1', window.__TUTORIALS) || []).filter(function (t) { return t.visible !== false; }); }
  function releases() { return (lsGet('coldd_admin_releases_v1', window.__RELEASES) || []).filter(function (r) { return r.visible !== false; }); }
  function byDateDesc(a, b) { return new Date(b.date) - new Date(a.date); }

  window.__blog.posts = posts;
  window.__blog.tutorials = tutorials;
  window.__blog.releases = releases;

  /* ---------- Blog listing (blog.html) ---------- */
  (function () {
    var grid = document.getElementById('blogGrid');
    if (!grid) return;
    var emptyEl = document.getElementById('blogEmpty');
    var filters = document.getElementById('blogFilters');
    var all = posts().slice().sort(byDateDesc);
    var activeCat = 'all';

    function card(p) {
      return '<a class="blog-card" href="post.html?slug=' + encodeURIComponent(p.slug) + '">' +
        '<span class="blog-card-cover" style="background-image:url(\'' + esc(p.cover) + '\')">' +
          (p.featured ? '<span class="blog-card-feat">Featured</span>' : '') +
        '</span>' +
        '<span class="blog-card-body">' +
          '<span class="blog-card-cat">' + esc(p.category) + '</span>' +
          '<span class="blog-card-title">' + esc(p.title) + '</span>' +
          '<span class="blog-card-dek">' + esc(p.dek) + '</span>' +
          '<span class="blog-card-meta">' + esc(p.author) + ' · ' + fmtDate(p.date) + ' · ' + p.readMins + ' min read</span>' +
        '</span>' +
      '</a>';
    }
    function render() {
      var rows = activeCat === 'all' ? all : all.filter(function (p) { return p.category === activeCat; });
      grid.innerHTML = rows.map(card).join('');
      if (emptyEl) emptyEl.hidden = rows.length > 0;
    }
    if (filters) filters.addEventListener('click', function (e) {
      var btn = e.target.closest('.chip'); if (!btn) return;
      activeCat = btn.getAttribute('data-cat');
      filters.querySelectorAll('.chip').forEach(function (c) { c.classList.toggle('active', c === btn); });
      render();
    });
    render();
  })();

  /* ---------- Blog / Tutorials view switch (blog.html) ---------- */
  (function () {
    var sw = document.getElementById('btSwitch');
    if (!sw) return;
    var blogView = document.getElementById('blogView');
    var tutView = document.getElementById('tutHub');

    function setView(v) {
      if (v !== 'tutorials') v = 'blog';
      if (blogView) blogView.hidden = v === 'tutorials';
      if (tutView) tutView.hidden = v !== 'tutorials';
      sw.querySelectorAll('.bt-opt').forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-view') === v); });
      var url = location.pathname + (v === 'tutorials' ? '?view=tutorials' : '');
      history.replaceState(null, '', url);
    }
    sw.addEventListener('click', function (e) {
      var btn = e.target.closest('.bt-opt'); if (!btn) return;
      setView(btn.getAttribute('data-view'));
    });
    setView(qp('view'));
  })();

  /* ---------- Post detail (post.html) ---------- */
  (function () {
    var root = document.getElementById('postView');
    if (!root) return;
    var all = posts();
    var slug = qp('slug');
    var p = all.filter(function (x) { return x.slug === slug; })[0] || all.slice().sort(byDateDesc)[0];
    if (!p) { root.innerHTML = '<div class="wrap"><p class="pd-empty">This post could not be found.</p></div>'; return; }

    document.title = 'coldd Blog — ' + p.title;
    var related = all.filter(function (x) { return x.slug !== p.slug && x.category === p.category; }).slice(0, 3);
    if (related.length < 3) {
      all.slice().sort(byDateDesc).forEach(function (x) {
        if (related.length < 3 && x.slug !== p.slug && related.indexOf(x) < 0) related.push(x);
      });
    }
    root.innerHTML =
      '<div class="post-wrap">' +
        '<nav class="pd-crumb"><a href="blog.html">Blog</a> <span>/</span> <span class="pd-crumb-cur">' + esc(p.category) + '</span></nav>' +
        '<header class="post-head">' +
          '<span class="post-cat">' + esc(p.category) + '</span>' +
          '<h1 class="post-title">' + esc(p.title) + '</h1>' +
          '<p class="post-dek">' + esc(p.dek) + '</p>' +
          '<div class="post-byline"><span class="post-ava">' + esc(p.author.charAt(0)) + '</span><span>' + esc(p.author) + '</span><span class="post-dot">·</span><span>' + fmtDate(p.date) + '</span><span class="post-dot">·</span><span>' + p.readMins + ' min read</span></div>' +
        '</header>' +
        '<div class="post-cover" style="background-image:url(\'' + esc(p.cover) + '\')"></div>' +
        '<div class="post-layout">' +
          '<article class="post-body">' + mdLite(p.body) + '</article>' +
          '<aside class="post-rail">' +
            '<div class="post-rail-card">' +
              '<h3>More from the blog</h3>' +
              related.map(function (r) {
                return '<a class="post-rel" href="post.html?slug=' + encodeURIComponent(r.slug) + '"><span class="post-rel-cat">' + esc(r.category) + '</span><span class="post-rel-title">' + esc(r.title) + '</span></a>';
              }).join('') +
            '</div>' +
            '<div class="post-rail-card post-rail-cta"><h3>Build it yourself</h3><p>Step-by-step guides in the tutorials hub.</p><a class="btn btn-primary" href="blog.html?view=tutorials">Browse tutorials</a></div>' +
          '</aside>' +
        '</div>' +
      '</div>';
  })();

  /* ---------- Tutorials hub (blog.html, tutorials view) ---------- */
  (function () {
    var root = document.getElementById('tutHub');
    if (!root) return;
    var all = tutorials().slice().sort(function (a, b) {
      if (a.track !== b.track) return a.track.localeCompare(b.track);
      return (a.order || 0) - (b.order || 0);
    });
    var TRACK_ORDER = ['Scripting', 'Building', 'Server Setup'];
    var tracks = TRACK_ORDER.filter(function (t) { return all.some(function (x) { return x.track === t; }); });
    all.forEach(function (x) { if (tracks.indexOf(x.track) < 0) tracks.push(x.track); });

    var sideEl = document.getElementById('tutSide');
    var listEl = document.getElementById('tutList');
    var activeTrack = 'all';

    function diffClass(d) { return 'tut-diff ' + (d === 'Beginner' ? 'lv1' : d === 'Intermediate' ? 'lv2' : 'lv3'); }
    function renderSide() {
      var items = ['<button class="fc-cat' + (activeTrack === 'all' ? ' active' : '') + '" data-track="all" type="button"><span>All tracks</span><span class="tut-count">' + all.length + '</span></button>'];
      tracks.forEach(function (t) {
        var n = all.filter(function (x) { return x.track === t; }).length;
        items.push('<button class="fc-cat' + (activeTrack === t ? ' active' : '') + '" data-track="' + esc(t) + '" type="button"><span>' + esc(t) + '</span><span class="tut-count">' + n + '</span></button>');
      });
      sideEl.innerHTML = items.join('');
    }
    function card(t) {
      return '<a class="tut-card" href="tutorial.html?slug=' + encodeURIComponent(t.slug) + '">' +
        '<span class="tut-card-cover" style="background-image:url(\'' + esc(t.cover) + '\')"></span>' +
        '<span class="tut-card-body">' +
          '<span class="tut-card-top"><span class="' + diffClass(t.difficulty) + '">' + esc(t.difficulty) + '</span><span class="tut-card-plat">' + esc(t.platform) + '</span></span>' +
          '<span class="tut-card-title">' + esc(t.title) + '</span>' +
          '<span class="tut-card-sum">' + esc(t.summary) + '</span>' +
          '<span class="tut-card-meta">' + t.estMins + ' min · ' + esc(t.track) + '</span>' +
        '</span>' +
      '</a>';
    }
    function renderList() {
      var shownTracks = activeTrack === 'all' ? tracks : [activeTrack];
      listEl.innerHTML = shownTracks.map(function (t) {
        var rows = all.filter(function (x) { return x.track === t; });
        if (!rows.length) return '';
        return '<section class="tut-track"><h2 class="tut-track-h">' + esc(t) + '</h2><div class="tut-grid">' + rows.map(card).join('') + '</div></section>';
      }).join('');
    }
    if (sideEl) sideEl.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-track]'); if (!btn) return;
      activeTrack = btn.getAttribute('data-track');
      renderSide(); renderList();
    });
    renderSide(); renderList();
  })();

  /* ---------- Tutorial detail (tutorial.html) ---------- */
  (function () {
    var root = document.getElementById('tutView');
    if (!root) return;
    var all = tutorials();
    var slug = qp('slug');
    var t = all.filter(function (x) { return x.slug === slug; })[0];
    if (!t) { root.innerHTML = '<div class="wrap"><p class="pd-empty">This tutorial could not be found.</p></div>'; return; }

    document.title = 'coldd Tutorials — ' + t.title;
    var bodyHtml = mdLite(t.body);
    // Build TOC from h2 headings in the rendered body.
    var toc = [];
    bodyHtml.replace(/<h2 id="([^"]+)">(.*?)<\/h2>/g, function (m, id, text) {
      toc.push({ id: id, text: text.replace(/<[^>]+>/g, '') });
      return m;
    });
    var diffLv = t.difficulty === 'Beginner' ? 'lv1' : t.difficulty === 'Intermediate' ? 'lv2' : 'lv3';
    var videoSrc = ytEmbed(t.video);

    root.innerHTML =
      '<div class="tut-detail">' +
        '<nav class="pd-crumb"><a href="blog.html?view=tutorials">Tutorials</a> <span>/</span> <span>' + esc(t.track) + '</span> <span>/</span> <span class="pd-crumb-cur">' + esc(t.title) + '</span></nav>' +
        '<header class="tut-detail-head">' +
          '<div class="tut-detail-badges"><span class="tut-diff ' + diffLv + '">' + esc(t.difficulty) + '</span><span class="tut-detail-plat">' + esc(t.platform) + '</span><span class="tut-detail-mins">' + t.estMins + ' min</span></div>' +
          '<h1 class="tut-detail-title">' + esc(t.title) + '</h1>' +
          '<p class="tut-detail-sum">' + esc(t.summary) + '</p>' +
        '</header>' +
        (videoSrc ? '<div class="tut-video"><div class="pd-embed"><iframe src="' + videoSrc + '" title="' + esc(t.title) + '" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div></div>' : '') +
        '<div class="tut-detail-layout">' +
          '<article class="tut-detail-body">' + bodyHtml + '</article>' +
          '<aside class="tut-toc">' +
            (toc.length ? '<div class="tut-toc-card"><h3>On this page</h3><nav>' + toc.map(function (h) { return '<a href="#' + h.id + '">' + esc(h.text) + '</a>'; }).join('') + '</nav></div>' : '') +
            '<div class="tut-toc-card tut-toc-cta"><h3>Need the asset?</h3><p>Skip the build — browse ready-made systems in the store.</p><a class="btn btn-primary" href="assets.html">Browse assets</a></div>' +
          '</aside>' +
        '</div>' +
      '</div>';
  })();

  /* ---------- Releases (releases.html) ---------- */
  (function () {
    var root = document.getElementById('relTimeline');
    if (!root) return;
    var all = releases().slice().sort(byDateDesc);
    var catalog = window.__CATALOG || [];
    function prodTitle(id) { var p = catalog.filter(function (x) { return x.id === id; })[0]; return p ? p.title : id; }
    function kindClass(k) { return 'rel-kind ' + (k === 'Feature' ? 'k-feature' : k === 'Fix' ? 'k-fix' : 'k-ann'); }

    root.innerHTML = all.map(function (r) {
      var affects = (r.affects || []).map(function (id) {
        return '<a class="rel-affect" href="product.html?id=' + encodeURIComponent(id) + '">' + esc(prodTitle(id)) + '</a>';
      }).join('');
      return '<article class="rel-item">' +
        '<div class="rel-item-side">' +
          '<span class="' + kindClass(r.kind) + '">' + esc(r.kind) + '</span>' +
          (r.version ? '<span class="rel-ver">' + esc(r.version) + '</span>' : '') +
          '<time class="rel-date">' + fmtDate(r.date) + '</time>' +
        '</div>' +
        '<div class="rel-item-main">' +
          '<h2 class="rel-title">' + esc(r.title) + '</h2>' +
          '<p class="rel-sum">' + esc(r.summary) + '</p>' +
          (affects ? '<div class="rel-affects">' + affects + '</div>' : '') +
        '</div>' +
      '</article>';
    }).join('') || '<p class="pd-empty">No updates published yet.</p>';
  })();
})();
