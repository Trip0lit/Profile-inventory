/* Galvez Martin — portfolio éditable (sans dépendance). */
(function () {
  'use strict';

  const STATUSES = [
    { key: 'done', label: 'Accompli' },
    { key: 'doing', label: 'En cours' },
    { key: 'todo', label: 'À exécuter' }
  ];
  const STATUS_LABEL = Object.fromEntries(STATUSES.map(s => [s.key, s.label]));

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const uid = () => Math.random().toString(36).slice(2, 10);
  const clone = o => JSON.parse(JSON.stringify(o));
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ---------- Stockage local (IndexedDB, les photos dépassent vite localStorage) ---------- */
  const store = (() => {
    const DB = 'galvez-martin-site', OS = 'kv', KEY = 'state';
    let dbp = null;
    function open() {
      if (!dbp) {
        dbp = new Promise((res, rej) => {
          const r = indexedDB.open(DB, 1);
          r.onupgradeneeded = () => r.result.createObjectStore(OS);
          r.onsuccess = () => res(r.result);
          r.onerror = () => rej(r.error);
        });
      }
      return dbp;
    }
    function tx(mode, fn) {
      return open().then(db => new Promise((res, rej) => {
        const t = db.transaction(OS, mode);
        const req = fn(t.objectStore(OS));
        t.oncomplete = () => res(req && req.result);
        t.onerror = () => rej(t.error);
      }));
    }
    return {
      get: () => tx('readonly', s => s.get(KEY)).catch(() => null),
      set: v => tx('readwrite', s => s.put(v, KEY)),
      clear: () => tx('readwrite', s => s.delete(KEY)),
      getItem: key => tx('readonly', s => s.get(key)).catch(() => null),
      setItem: (key, v) => tx('readwrite', s => s.put(v, key)).catch(() => {})
    };
  })();

  // Complète un état sauvegardé avec les champs ajoutés depuis (ex. inventaire, devise)
  function normalize(data) {
    const defaults = window.SITE_DATA.profile;
    data.profile = Object.assign({}, clone(defaults), data.profile);
    if (!Array.isArray(data.profile.inventory)) data.profile.inventory = clone(defaults.inventory);
    delete data.profile.stats;
    // Remplace les anciens textes par défaut encore présents dans une sauvegarde locale
    if (data.profile.motto === 'Calculer comme aux échecs, oser comme au poker, protéger comme un juriste.') {
      data.profile.motto = defaults.motto;
    }
    return data;
  }

  let state = clone(window.SITE_DATA);
  let editing = false;
  const seenBars = new Set();
  const revealed = new Set(); // évite de rejouer l'apparition à chaque re-rendu

  /* ---------- Publication sur GitHub ---------- */
  // Dépôt qui héberge le site (déduit de l'adresse github.io, sinon valeur par défaut)
  const REPO = (() => {
    const host = location.hostname.match(/^([^.]+)\.github\.io$/i);
    const first = location.pathname.split('/').filter(Boolean)[0];
    if (host && first && !first.endsWith('.html')) return { owner: host[1], repo: first, branch: 'main' };
    return { owner: 'Trip0lit', repo: 'Profile-inventory', branch: 'main' };
  })();
  const TOKEN_KEY = 'gm-github-token';
  const PHOTO_DIR = 'assets/photos/';

  // Photos tout juste publiées : affichées depuis l'appareil le temps que GitHub Pages les mette en ligne
  let photoCache = {};
  const srcOf = src => photoCache[src] || src;

  /* ---------- Sauvegarde ---------- */
  let published = JSON.stringify(window.SITE_DATA);
  let lastPublished = null;
  let saveTimer = null;
  function save() {
    const status = $('#saveStatus');
    status.textContent = 'Enregistrement…';
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      store.set(state)
        .then(() => { status.textContent = 'Enregistré sur cet appareil'; updatePublishState(); })
        .catch(() => { status.textContent = 'Échec de l\'enregistrement'; toast('Stockage local plein ou indisponible'); });
    }, 300);
  }

  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => t.classList.remove('show'), 2600);
  }

  /* ---------- Chemins type "profile.traits.0.title" ---------- */
  function getPath(path) {
    return path.split('.').reduce((o, k) => (o == null ? o : o[k]), state);
  }
  function setPath(path, value) {
    const keys = path.split('.');
    const last = keys.pop();
    const target = keys.reduce((o, k) => o[k], state);
    target[last] = value;
  }

  /* ---------- Progression ---------- */
  function counts(tasks) {
    const c = { done: 0, doing: 0, todo: 0, total: tasks.length };
    tasks.forEach(t => { c[t.status] = (c[t.status] || 0) + 1; });
    return c;
  }
  const pct = (n, total) => (total ? Math.round((n / total) * 100) : 0);

  function barHTML(c, key) {
    const done = pct(c.done, c.total), doing = pct(c.doing, c.total);
    const animate = !seenBars.has(key);
    return `<div class="bar" data-bar="${esc(key)}" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${done}" aria-label="Progression">
      <span class="bar-done" style="width:${animate ? 0 : done}%" data-w="${done}"></span><span class="bar-doing" style="width:${animate ? 0 : doing}%" data-w="${doing}"></span>
    </div>`;
  }

  const barObserver = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (!e.isIntersecting) return;
      fillBar(e.target);
      barObserver.unobserve(e.target);
    });
  }, { threshold: 0.4 }) : null;

  function fillBar(bar) {
    seenBars.add(bar.dataset.bar);
    $$('[data-w]', bar).forEach(s => { s.style.width = s.dataset.w + '%'; });
  }
  function watchBars(root) {
    $$('.bar', root).forEach(bar => {
      if (seenBars.has(bar.dataset.bar)) return;
      if (barObserver) barObserver.observe(bar);
      else fillBar(bar);
    });
  }

  /* ---------- Rendu : profil ---------- */
  function renderBindings() {
    $$('[data-edit]').forEach(el => {
      if (el === document.activeElement) return;
      el.textContent = getPath(el.dataset.edit) ?? '';
    });
    if (!$('#mailLink')) return;
    const email = state.profile.email || '';
    $('#mailLink').href = 'mailto:' + email;
    const handle = (state.profile.twitter || '').replace(/^@/, '');
    $('#twitterLink').href = 'https://x.com/' + encodeURIComponent(handle);
    document.title = state.profile.name || 'Portfolio';
  }

  function renderTraits() {
    if (!$('#traits')) return;
    $('#traits').innerHTML = state.profile.traits.map((t, i) => `
      <article class="trait reveal ${revealed.has('trait' + i) ? 'in' : ''}" data-reveal="trait${i}">
        <h3 data-edit="profile.traits.${i}.title">${esc(t.title)}</h3>
        <p data-edit="profile.traits.${i}.text">${esc(t.text)}</p>
      </article>`).join('');
  }

  function renderAbout() {
    if (!$('#portrait')) return;
    const p = state.profile;
    const c = counts(state.activities.flatMap(a => a.tasks));
    $('#portrait').innerHTML = `
      ${p.photo
        ? `<img class="portrait-img" src="${srcOf(p.photo)}" alt="Portrait de ${esc(p.name)}">`
        : `<div class="portrait-placeholder" aria-hidden="true"><span>${esc(initials(p.name))}</span></div>`}
      ${editing ? `<div class="portrait-tools">
        <label class="icon-btn">${p.photo ? 'Changer la photo' : '＋ Ajouter ma photo'}<input type="file" accept="image/*" hidden data-action="set-portrait"></label>
        ${p.photo ? '<button type="button" class="icon-btn danger" data-action="del-portrait">Retirer</button>' : ''}
      </div>` : ''}`;
    $('#aboutLevel').innerHTML = `<span>Progression</span> <strong>${pct(c.done, c.total)}%</strong>`;
    $('#inventory').innerHTML = p.inventory.map((row, i) => `
      <div class="inv-row">
        <dt data-edit="profile.inventory.${i}.label">${esc(row.label)}</dt>
        <dd data-edit="profile.inventory.${i}.value">${esc(row.value)}</dd>
        ${editing ? `<button type="button" class="inv-del" data-action="del-inventory" data-index="${i}" aria-label="Supprimer la ligne">×</button>` : ''}
      </div>`).join('') + `
      <div class="inv-row"><dt>Projets suivis</dt><dd>${state.activities.length}</dd></div>
      <div class="inv-row"><dt>Tâches accomplies</dt><dd>${c.done} / ${c.total}</dd></div>`;
    $('#activitiesMeta').textContent = `${state.activities.length} projets · ${pct(c.done, c.total)} % accompli`;
    setEditableBindings();
  }

  const initials = name => (name || '').split(/\s+/).filter(Boolean).map(w => w[0]).slice(0, 2).join('').toUpperCase();

  function renderGlobal() {
    if (!$('#globalProgress')) return;
    const c = counts(state.activities.flatMap(a => a.tasks));
    $('#globalProgress').innerHTML = `
      <div class="global-head"><span>Progression globale</span><strong>${pct(c.done, c.total)}%</strong></div>
      ${barHTML(c, 'global')}`;
    watchBars($('#globalProgress'));
  }

  /* ---------- Rendu : activités ---------- */
  function taskHTML(act, task) {
    const photos = (task.photos || []).map((src, i) => `
      <div class="thumb">
        <button type="button" class="thumb-open" data-action="open-photo" data-index="${i}" aria-label="Agrandir la photo"><img src="${srcOf(src)}" alt="" loading="lazy"></button>
        ${editing ? `<button type="button" class="thumb-del" data-action="del-photo" data-index="${i}" aria-label="Supprimer la photo">×</button>` : ''}
      </div>`).join('');
    const date = task.date ? `<time class="task-date">${esc(task.date)}</time>` : '';
    const tools = editing ? `
      <div class="task-tools">
        <div class="seg" role="group" aria-label="Statut">
          ${STATUSES.map(s => `<button type="button" class="seg-btn ${task.status === s.key ? 'on' : ''} s-${s.key}" data-action="set-status" data-status="${s.key}" title="${s.label}">${s.label}</button>`).join('')}
        </div>
        <label class="icon-btn" title="Ajouter des photos">＋ Photo<input type="file" accept="image/*" multiple hidden data-action="add-photo"></label>
        <button type="button" class="icon-btn danger" data-action="del-task" title="Supprimer la tâche">Supprimer</button>
      </div>` : '';
    return `
      <li class="task s-${task.status}" data-task="${task.id}" ${editing ? 'draggable="true"' : ''}>
        <p class="task-text" ${editing ? 'contenteditable="plaintext-only" spellcheck="true" data-field="text"' : ''}>${esc(task.text)}</p>
        ${date}
        ${photos ? `<div class="task-photos">${photos}</div>` : ''}
        ${tools}
      </li>`;
  }

  const detailURL = act => `activite.html?id=${encodeURIComponent(act.id)}${editing ? '#edit' : ''}`;

  function coverHTML(act, i) {
    const cover = act.cover || (act.tasks.find(t => t.photos && t.photos.length) || {}).photos?.[0];
    const num = String(i + 1).padStart(2, '0');
    const media = cover
      ? `<img class="card-cover" src="${srcOf(cover)}" alt="" loading="lazy">`
      : `<div class="card-placeholder" style="--hue:${(i * 23) % 60}"><span>${num}</span></div>`;
    return `
      <div class="card-media">
        ${media}
        ${editing ? `<div class="media-tools">
          <label class="icon-btn on-media">${act.cover ? 'Changer la couverture' : '＋ Couverture'}<input type="file" accept="image/*" hidden data-action="set-cover"></label>
          ${act.cover ? '<button type="button" class="icon-btn on-media danger" data-action="del-cover">Retirer</button>' : ''}
        </div>` : ''}
      </div>`;
  }

  function progressHTML(act) {
    const c = counts(act.tasks);
    return `
      <div class="activity-progress">
        <div class="progress-row">${barHTML(c, act.id)}<span class="progress-num">${pct(c.done, c.total)}<small>%</small></span></div>
        <div class="progress-legend">
          <span><i class="dot-done"></i>${c.done} accomplie${c.done > 1 ? 's' : ''}</span>
          <span><i class="dot-doing"></i>${c.doing} en cours</span>
          <span><i class="dot-todo"></i>${c.todo} à exécuter</span>
        </div>
      </div>`;
  }

  function infoHTML(act, tag = 'h3') {
    const ce = editing ? 'contenteditable="plaintext-only" spellcheck="true"' : '';
    return `
      <span class="activity-tag" ${ce} data-field="tag">${esc(act.tag)}</span>
      <${tag} class="activity-title" ${ce} data-field="title">${esc(act.title)}</${tag}>
      <p class="activity-desc" ${ce} data-field="desc">${esc(act.desc)}</p>`;
  }

  // Carte de la page d'accueil : un clic ouvre la page de l'activité
  function activityHTML(act, i) {
    return `
      <article class="card activity reveal ${revealed.has(act.id) ? 'in' : ''}" data-activity="${act.id}" data-reveal="${act.id}">
        <div class="activity-top" tabindex="0" role="link" aria-label="Ouvrir la progression de ${esc(act.title)}">
          ${coverHTML(act, i)}
          <div class="card-body">
            ${infoHTML(act)}
            ${progressHTML(act)}
            <a class="link-arrow activity-open" href="${detailURL(act)}" tabindex="-1">Voir la progression <span>→</span></a>
          </div>
        </div>
        ${editing ? `<div class="activity-admin">
          <button type="button" class="icon-btn" data-action="move-up" ${i === 0 ? 'disabled' : ''}>← Avancer</button>
          <button type="button" class="icon-btn" data-action="move-down" ${i === state.activities.length - 1 ? 'disabled' : ''}>Reculer →</button>
          <button type="button" class="icon-btn danger" data-action="del-activity">Supprimer</button>
        </div>` : ''}
      </article>`;
  }

  // Page dédiée (activite.html) : en-tête + trois colonnes de tâches
  function detailHTML(act, i) {
    const columns = STATUSES.map(s => {
      const tasks = act.tasks.filter(t => t.status === s.key);
      return `
        <div class="col col-${s.key}" data-status="${s.key}">
          <div class="col-head"><span class="tag tag-${s.key}">${s.label}</span><span class="col-count">${tasks.length}</span></div>
          <ul class="task-list">${tasks.map(t => taskHTML(act, t)).join('') || `<li class="empty">${editing ? 'Glissez une tâche ici' : 'Rien pour le moment'}</li>`}</ul>
          ${editing ? `<form class="add-task" data-action="add-task" data-status="${s.key}">
            <input type="text" name="text" placeholder="Nouvelle tâche…" aria-label="Nouvelle tâche ${s.label}" autocomplete="off">
            <button type="submit" class="icon-btn" aria-label="Ajouter">＋</button>
          </form>` : ''}
        </div>`;
    }).join('');
    return `
      <article class="activity-detail" data-activity="${act.id}">
        <div class="card detail-head">
          ${coverHTML(act, i)}
          <div class="card-body">
            <span class="eyebrow">Activité ${String(i + 1).padStart(2, '0')} / ${String(state.activities.length).padStart(2, '0')}</span>
            ${infoHTML(act, 'h1')}
            ${progressHTML(act)}
          </div>
        </div>
        <div class="columns">${columns}</div>
      </article>`;
  }

  const PAGE = document.body.dataset.page || 'home';
  const detailId = new URLSearchParams(location.search).get('id');

  function renderActivities() {
    const root = $('#activities');
    if (PAGE === 'activity') {
      const i = state.activities.findIndex(a => a.id === detailId);
      if (i < 0) {
        root.innerHTML = `<div class="card detail-missing"><h1 class="activity-title">Activité introuvable</h1><p class="activity-desc">Elle a peut-être été supprimée.</p><a class="link-arrow" href="index.html#activites">Retour aux activités <span>→</span></a></div>`;
        document.title = 'Activité introuvable';
        return;
      }
      root.innerHTML = detailHTML(state.activities[i], i);
      document.title = `${state.activities[i].title} — ${state.profile.name}`;
    } else {
      root.innerHTML = state.activities.map(activityHTML).join('');
    }
    watchBars(root);
    observeReveal(root);
  }

  function renderAll() {
    renderTraits();
    renderBindings();
    renderAbout();
    renderGlobal();
    renderActivities();
    setEditableBindings();
    observeReveal(document);
  }

  // Rafraîchit les éléments dépendant des tâches
  function refreshProgress() {
    renderAbout();
    renderGlobal();
    renderActivities();
    setEditableBindings();
  }

  /* ---------- Apparition au défilement ---------- */
  const revealObserver = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
    entries.forEach(e => { if (e.isIntersecting) { reveal(e.target); revealObserver.unobserve(e.target); } });
  }, { threshold: 0.12 }) : null;
  function reveal(el) {
    el.classList.add('in');
    if (el.dataset.reveal) revealed.add(el.dataset.reveal);
  }
  function observeReveal(root) {
    $$('.reveal:not(.in)', root).forEach(el => revealObserver ? revealObserver.observe(el) : reveal(el));
  }

  /* ---------- Mode édition ---------- */
  function setEditableBindings() {
    $$('[data-edit]').forEach(el => {
      if (editing) {
        el.setAttribute('contenteditable', 'plaintext-only');
        el.setAttribute('spellcheck', 'true');
      } else {
        el.removeAttribute('contenteditable');
      }
    });
  }

  function setEditing(on) {
    editing = on;
    document.body.classList.toggle('editing', on);
    if (!on && location.hash === '#edit') history.replaceState(null, '', location.pathname + location.search);
    renderAll();
    updatePublishState();
    if (on) toast(hasUnpublished() ? 'Des modifications ne sont pas encore en ligne : cliquez sur « Publier »' : 'Mode édition : cliquez sur un texte pour le modifier');
  }

  const findActivity = el => {
    const node = el.closest('[data-activity]');
    return node ? state.activities.find(a => a.id === node.dataset.activity) : null;
  };
  const findTask = (act, el) => {
    const node = el.closest('[data-task]');
    return node && act ? act.tasks.find(t => t.id === node.dataset.task) : null;
  };

  function compressImage(file, max = 1400, quality = 0.82) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * scale);
        c.height = Math.round(img.height * scale);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        resolve(c.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image illisible')); };
      img.src = url;
    });
  }

  function today() {
    return new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function setStatus(task, status) {
    if (task.status === status) return;
    task.status = status;
    if (status === 'done') task.date = today();
    else delete task.date;
  }

  /* ---------- Événements : activités ---------- */
  const activitiesRoot = $('#activities');

  // Un clic n'importe où sur la carte (hors champs et boutons d'édition) ouvre la progression
  function isCardOpenClick(target) {
    if (PAGE !== 'home' || !target.closest('.activity-top')) return false;
    return !target.closest('[contenteditable], [data-action], label, input, button, a');
  }
  function openDetail(node) {
    const act = state.activities.find(a => a.id === node.dataset.activity);
    if (act) location.href = detailURL(act);
  }

  activitiesRoot.addEventListener('keydown', e => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.classList.contains('activity-top')) {
      e.preventDefault();
      openDetail(e.target.closest('.activity'));
    }
  });

  activitiesRoot.addEventListener('click', e => {
    if (isCardOpenClick(e.target)) {
      openDetail(e.target.closest('.activity'));
      return;
    }
    const btn = e.target.closest('[data-action]');
    if (!btn || btn.tagName === 'FORM' || btn.tagName === 'INPUT') return;
    const act = findActivity(btn);
    if (!act) return;
    const task = findTask(act, btn);
    const action = btn.dataset.action;

    if (action === 'open-photo') {
      openLightbox(task.photos, +btn.dataset.index, task.text);
      return;
    }
    if (!editing) return;

    if (action === 'set-status') setStatus(task, btn.dataset.status);
    else if (action === 'del-photo') task.photos.splice(+btn.dataset.index, 1);
    else if (action === 'del-cover') delete act.cover;
    else if (action === 'del-task') {
      if (!confirm('Supprimer cette tâche ?')) return;
      act.tasks = act.tasks.filter(t => t !== task);
    } else if (action === 'del-activity') {
      if (!confirm(`Supprimer l'activité « ${act.title} » et toutes ses tâches ?`)) return;
      state.activities = state.activities.filter(a => a !== act);
      if (PAGE === 'activity') { save(); location.href = 'index.html#activites'; return; }
    } else if (action === 'move-up' || action === 'move-down') {
      const i = state.activities.indexOf(act);
      const j = action === 'move-up' ? i - 1 : i + 1;
      if (j < 0 || j >= state.activities.length) return;
      [state.activities[i], state.activities[j]] = [state.activities[j], state.activities[i]];
    } else return;

    save();
    refreshProgress();
  });

  activitiesRoot.addEventListener('submit', e => {
    const form = e.target.closest('form[data-action="add-task"]');
    if (!form) return;
    e.preventDefault();
    const input = form.elements.text;
    const text = input.value.trim();
    if (!text) return;
    const act = findActivity(form);
    const task = { id: uid(), text, status: form.dataset.status, photos: [] };
    if (task.status === 'done') task.date = today();
    act.tasks.push(task);
    save();
    refreshProgress();
    const again = $(`[data-activity="${act.id}"] form[data-status="${task.status}"] input`);
    if (again) again.focus();
  });

  activitiesRoot.addEventListener('change', async e => {
    const input = e.target;
    if (input.dataset.action === 'set-cover' && input.files.length) {
      const act = findActivity(input);
      try {
        act.cover = await compressImage(input.files[0], 1600);
        save();
        refreshProgress();
      } catch (err) { toast('Impossible de lire cette image'); }
      return;
    }
    if (input.dataset.action !== 'add-photo' || !input.files.length) return;
    const act = findActivity(input);
    const task = findTask(act, input);
    toast('Ajout des photos…');
    try {
      const imgs = await Promise.all(Array.from(input.files).map(f => compressImage(f)));
      task.photos = (task.photos || []).concat(imgs);
      save();
      refreshProgress();
      toast(imgs.length > 1 ? `${imgs.length} photos ajoutées` : 'Photo ajoutée');
    } catch (err) {
      toast('Impossible de lire cette image');
    }
  });

  // Textes des activités et tâches
  activitiesRoot.addEventListener('blur', e => {
    const el = e.target;
    if (!editing || !el.dataset || !el.dataset.field) return;
    const act = findActivity(el);
    if (!act) return;
    const value = el.textContent.trim();
    const target = el.closest('[data-task]') ? findTask(act, el) : act;
    if (!value && el.dataset.field === 'text') { el.textContent = target.text; return; }
    if (target[el.dataset.field] !== value) {
      target[el.dataset.field] = value;
      save();
    }
  }, true);

  // Entrée valide le texte au lieu de créer un retour à la ligne
  document.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey && e.target.isContentEditable) {
      e.preventDefault();
      e.target.blur();
    }
  });

  // Glisser-déposer des tâches entre colonnes
  let dragged = null;
  activitiesRoot.addEventListener('dragstart', e => {
    const li = e.target.closest && e.target.closest('.task');
    if (!editing || !li) return;
    dragged = { activity: li.closest('[data-activity]').dataset.activity, task: li.dataset.task };
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', dragged.task);
    li.classList.add('dragging');
  });
  activitiesRoot.addEventListener('dragend', e => {
    const li = e.target.closest && e.target.closest('.task');
    if (li) li.classList.remove('dragging');
    $$('.col.drop', activitiesRoot).forEach(c => c.classList.remove('drop'));
    dragged = null;
  });
  activitiesRoot.addEventListener('dragover', e => {
    const col = e.target.closest('.col');
    if (!dragged || !col || col.closest('[data-activity]').dataset.activity !== dragged.activity) return;
    e.preventDefault();
    $$('.col.drop', activitiesRoot).forEach(c => c !== col && c.classList.remove('drop'));
    col.classList.add('drop');
  });
  activitiesRoot.addEventListener('drop', e => {
    const col = e.target.closest('.col');
    if (!dragged || !col) return;
    e.preventDefault();
    const act = state.activities.find(a => a.id === dragged.activity);
    const task = act && act.tasks.find(t => t.id === dragged.task);
    if (!task) return;
    // Repositionne la tâche avant l'élément survolé, sinon à la fin de la colonne
    const over = e.target.closest('.task');
    act.tasks = act.tasks.filter(t => t !== task);
    setStatus(task, col.dataset.status);
    const ref = over && over.dataset.task !== task.id ? act.tasks.findIndex(t => t.id === over.dataset.task) : -1;
    if (ref >= 0) act.tasks.splice(ref, 0, task);
    else act.tasks.push(task);
    save();
    refreshProgress();
  });

  /* ---------- Événements : textes du profil ---------- */
  document.addEventListener('blur', e => {
    const el = e.target;
    if (!editing || !el.dataset || !el.dataset.edit) return;
    const value = el.textContent.trim();
    if (getPath(el.dataset.edit) === value) return;
    setPath(el.dataset.edit, value);
    save();
    renderBindings();
  }, true);

  // Place le focus sur un champ éditable et sélectionne son texte provisoire
  function selectContents(el) {
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }

  /* ---------- Événements : carte « À propos » ---------- */
  if (PAGE === 'home') {
    $('#portrait').addEventListener('change', async e => {
      const input = e.target;
      if (input.dataset.action !== 'set-portrait' || !input.files.length) return;
      try {
        state.profile.photo = await compressImage(input.files[0], 1000);
        save();
        renderAbout();
      } catch (err) { toast('Impossible de lire cette image'); }
    });
    $('#portrait').addEventListener('click', e => {
      if (!editing || !e.target.closest('[data-action="del-portrait"]')) return;
      state.profile.photo = '';
      save();
      renderAbout();
    });
    $('#inventory').addEventListener('click', e => {
      const btn = e.target.closest('[data-action="del-inventory"]');
      if (!editing || !btn) return;
      state.profile.inventory.splice(+btn.dataset.index, 1);
      save();
      renderAbout();
      setEditableBindings();
    });
    $('#addInventory').addEventListener('click', () => {
      state.profile.inventory.push({ label: 'Intitulé', value: 'Valeur' });
      save();
      renderAbout();
      setEditableBindings();
      const rows = $$('#inventory [data-edit$=".label"]');
      selectContents(rows[rows.length - 1]);
    });

    $('#addActivity').addEventListener('click', () => {
      const act = { id: uid(), title: 'Nouvelle activité', tag: 'Projet', desc: 'Décrivez ce projet en une phrase.', tasks: [] };
      state.activities.push(act);
      save();
      refreshProgress();
      const title = $(`[data-activity="${act.id}"] .activity-title`);
      title.scrollIntoView({ behavior: 'smooth', block: 'center' });
      selectContents(title);
    });
  }

  /* ---------- Barre d'édition ---------- */
  $('#editTrigger').addEventListener('click', e => { e.preventDefault(); setEditing(true); });
  $('#exitEdit').addEventListener('click', () => setEditing(false));
  window.addEventListener('hashchange', () => { if (location.hash === '#edit' && !editing) setEditing(true); });

  // Signale les modifications enregistrées sur cet appareil mais pas encore en ligne
  function hasUnpublished() {
    const current = JSON.stringify(state);
    return current !== published && current !== lastPublished;
  }
  function updatePublishState() {
    const pending = hasUnpublished();
    document.body.classList.toggle('unpublished', pending);
    $('#exportBtn').textContent = pending ? 'Publier' : 'Publié ✓';
  }

  const dataFileContent = data => '/*\n * Données publiées du site (générées par le bouton « Publier »).\n * Les photos sont dans assets/photos/.\n */\nwindow.SITE_DATA = ' + JSON.stringify(data, null, 2) + ';\n';

  function downloadBackup() {
    const blob = new Blob([dataFileContent(state)], { type: 'text/javascript' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'sauvegarde-site.js';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  async function hashOf(text) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf).slice(0, 8), b => b.toString(16).padStart(2, '0')).join('');
  }

  // Remplace chaque photo intégrée (data:…) par un fichier assets/photos/<empreinte>.jpg
  async function extractPhotos(data) {
    const files = new Map();
    async function convert(src) {
      if (typeof src !== 'string' || !src.startsWith('data:image/')) return src;
      const b64 = src.slice(src.indexOf(',') + 1);
      const path = PHOTO_DIR + (await hashOf(b64)) + (src.startsWith('data:image/png') ? '.png' : '.jpg');
      files.set(path, { b64, dataURL: src });
      return path;
    }
    data.profile.photo = await convert(data.profile.photo);
    for (const act of data.activities) {
      if (act.cover) act.cover = await convert(act.cover);
      for (const task of act.tasks) task.photos = await Promise.all((task.photos || []).map(convert));
    }
    return files;
  }

  async function gh(token, method, path, body) {
    const res = await fetch(`https://api.github.com/repos/${REPO.owner}/${REPO.repo}${path}`, {
      method,
      headers: Object.assign(
        { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
        body ? { 'Content-Type': 'application/json' } : {}
      ),
      body: body ? JSON.stringify(body) : undefined
    });
    if (!res.ok) {
      const err = new Error(`GitHub ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return res.json();
  }

  // Un seul commit contenant js/data.js et les nouvelles photos
  async function publishToGitHub(token, step) {
    const data = clone(state);
    const files = await extractPhotos(data);
    step('Connexion à GitHub…');
    const ref = await gh(token, 'GET', `/git/ref/heads/${REPO.branch}`);
    const head = await gh(token, 'GET', `/git/commits/${ref.object.sha}`);
    const tree = await gh(token, 'GET', `/git/trees/${head.tree.sha}?recursive=1`);
    const existing = new Set(tree.tree.map(e => e.path));
    const uploads = [...files].filter(([path]) => !existing.has(path));
    const entries = [];
    for (let i = 0; i < uploads.length; i++) {
      const [path, file] = uploads[i];
      step(`Envoi des photos (${i + 1}/${uploads.length})…`);
      const blob = await gh(token, 'POST', '/git/blobs', { content: file.b64, encoding: 'base64' });
      entries.push({ path, mode: '100644', type: 'blob', sha: blob.sha });
    }
    step('Envoi des textes…');
    entries.push({ path: 'js/data.js', mode: '100644', type: 'blob', content: dataFileContent(data) });
    const newTree = await gh(token, 'POST', '/git/trees', { base_tree: head.tree.sha, tree: entries });
    if (newTree.sha !== head.tree.sha) {
      const commit = await gh(token, 'POST', '/git/commits', {
        message: 'Mise à jour du contenu depuis le site',
        tree: newTree.sha,
        parents: [ref.object.sha]
      });
      await gh(token, 'PATCH', `/git/refs/heads/${REPO.branch}`, { sha: commit.sha });
    }
    return { data, files };
  }

  function publishErrorMessage(err) {
    if (err.status === 401) return 'Clé refusée : elle est incorrecte ou a expiré. Crée-en une nouvelle.';
    if (err.status === 403 || err.status === 404) return `La clé n'a pas le droit d'écrire dans ${REPO.owner}/${REPO.repo}. Vérifie « Contents : Read and write » et l'accès à ce dépôt.`;
    if (err.status === 409 || err.status === 422) return 'Le site a changé entre-temps sur GitHub. Réessaie.';
    if (err.status) return `GitHub a répondu une erreur (${err.status}). Réessaie dans un instant.`;
    return 'Connexion à GitHub impossible. Vérifie ta connexion internet.';
  }

  function getToken() {
    try { return localStorage.getItem(TOKEN_KEY) || ''; } catch (e) { return ''; }
  }
  function setToken(value) {
    try { value ? localStorage.setItem(TOKEN_KEY, value) : localStorage.removeItem(TOKEN_KEY); } catch (e) { /* stockage indisponible */ }
  }

  let sessionToken = '';
  function openPublishDialog() {
    let dlg = $('#publishDialog');
    if (!dlg) {
      dlg = document.createElement('dialog');
      dlg.id = 'publishDialog';
      dlg.className = 'publish-dialog';
      document.body.appendChild(dlg);
      dlg.addEventListener('click', e => { if (e.target === dlg && !dlg.classList.contains('busy')) dlg.close(); });
    }
    const token = getToken() || sessionToken;
    dlg.innerHTML = `
      <form class="publish-inner" method="dialog">
        <span class="eyebrow">Publier les modifications</span>
        <h2>Mettre le site en ligne</h2>
        <p class="publish-note">Tes textes, tâches et photos sont pour l'instant enregistrés <strong>seulement sur cet appareil</strong>.
        « Publier » les envoie directement sur GitHub : le site est à jour pour tout le monde 1 à 2 minutes après.</p>
        ${token ? `<p class="publish-note">Clé GitHub enregistrée sur cet appareil. <button type="button" class="text-btn" data-action="forget-token">Changer de clé</button></p>` : `
        <div class="token-help">
          <p><strong>À faire une seule fois :</strong> créer une clé d'accès GitHub.</p>
          <ol class="publish-steps">
            <li>Ouvre <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">la page de création de clé GitHub ↗</a>.</li>
            <li>Nom : « site ». Dans <em>Repository access</em>, choisis <em>Only select repositories</em> → <strong>${esc(REPO.repo)}</strong>.</li>
            <li>Dans <em>Permissions</em>, ajoute <strong>Contents</strong> en <strong>Read and write</strong>.</li>
            <li>Clique sur <em>Generate token</em>, copie la clé et colle-la ici.</li>
          </ol>
          <input class="token-input" type="password" name="token" placeholder="github_pat_…" autocomplete="off" spellcheck="false">
          <label class="token-remember"><input type="checkbox" name="remember" checked> Mémoriser la clé sur cet appareil</label>
        </div>`}
        <p class="publish-status" role="status" aria-live="polite"></p>
        <div class="publish-actions">
          <button type="button" class="btn btn-solid" data-action="publish-now">Publier maintenant</button>
          <button type="button" class="btn" data-action="close-dialog">Fermer</button>
        </div>
        <p class="publish-backup"><button type="button" class="text-btn" data-action="backup">Télécharger une sauvegarde</button> (pour la garder sur ton ordinateur)</p>
      </form>`;

    const status = $('.publish-status', dlg);
    const setStatus = (msg, kind = '') => { status.textContent = msg; status.className = 'publish-status ' + kind; };

    $('[data-action="close-dialog"]', dlg).addEventListener('click', () => dlg.close());
    $('[data-action="backup"]', dlg).addEventListener('click', downloadBackup);
    const forget = $('[data-action="forget-token"]', dlg);
    if (forget) forget.addEventListener('click', () => { setToken(''); sessionToken = ''; openPublishDialog(); });

    $('[data-action="publish-now"]', dlg).addEventListener('click', async e => {
      const btn = e.currentTarget;
      const input = $('.token-input', dlg);
      const key = input ? input.value.trim() : token;
      if (!key) { setStatus('Colle d\'abord ta clé GitHub.', 'error'); input.focus(); return; }
      dlg.classList.add('busy');
      btn.disabled = true;
      try {
        const { data, files } = await publishToGitHub(key, msg => setStatus(msg));
        if (input) {
          if ($('[name="remember"]', dlg).checked) setToken(key);
          else sessionToken = key;
        }
        // Les photos deviennent des fichiers : on garde une copie locale le temps de leur mise en ligne
        const kept = {};
        for (const [path, file] of files) kept[path] = file.dataURL;
        photoCache = kept;
        store.setItem('photos', photoCache);
        state = data;
        window.SITE_DATA = clone(data);
        published = lastPublished = JSON.stringify(data);
        store.setItem('lastPublished', lastPublished);
        save();
        renderAll();
        updatePublishState();
        setStatus('C\'est publié ! Le site en ligne sera à jour dans 1 à 2 minutes.', 'ok');
        btn.textContent = 'Publié ✓';
      } catch (err) {
        setStatus(publishErrorMessage(err), 'error');
        btn.disabled = false;
      } finally {
        dlg.classList.remove('busy');
      }
    });

    dlg.showModal();
  }

  $('#exportBtn').addEventListener('click', openPublishDialog);

  $('#importInput').addEventListener('change', async e => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const json = text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
      const data = JSON.parse(json);
      if (!data.profile || !Array.isArray(data.activities)) throw new Error('format');
      state = normalize(data);
      save();
      renderAll();
      toast('Sauvegarde importée');
    } catch (err) {
      toast('Fichier non reconnu');
    }
  });

  $('#resetBtn').addEventListener('click', async () => {
    if (!confirm('Effacer toutes les modifications locales et revenir à la version publiée (js/data.js) ?')) return;
    await store.clear().catch(() => {});
    state = clone(window.SITE_DATA);
    renderAll();
    toast('Version publiée restaurée');
  });

  /* ---------- Visionneuse ---------- */
  const lb = $('#lightbox');
  let lbPhotos = [], lbIndex = 0, lbCaption = '';
  function openLightbox(photos, index, caption) {
    lbPhotos = photos; lbIndex = index; lbCaption = caption;
    showPhoto();
    lb.hidden = false;
    document.body.classList.add('no-scroll');
    $('.lightbox-close', lb).focus();
  }
  function showPhoto() {
    $('img', lb).src = srcOf(lbPhotos[lbIndex]);
    $('figcaption', lb).textContent = lbCaption + (lbPhotos.length > 1 ? ` — ${lbIndex + 1}/${lbPhotos.length}` : '');
    $$('.lightbox-nav', lb).forEach(b => { b.hidden = lbPhotos.length < 2; });
  }
  function closeLightbox() { lb.hidden = true; document.body.classList.remove('no-scroll'); }
  function step(d) { lbIndex = (lbIndex + d + lbPhotos.length) % lbPhotos.length; showPhoto(); }
  lb.addEventListener('click', e => {
    if (e.target.closest('.prev')) step(-1);
    else if (e.target.closest('.next')) step(1);
    else if (e.target.closest('.lightbox-close') || e.target === lb) closeLightbox();
  });
  document.addEventListener('keydown', e => {
    if (lb.hidden) return;
    if (e.key === 'Escape') closeLightbox();
    if (e.key === 'ArrowLeft') step(-1);
    if (e.key === 'ArrowRight') step(1);
  });

  /* ---------- Synchronisation ---------- */
  // Les modifications faites sur la page d'une activité apparaissent en revenant sur l'accueil (bouton retour, autre onglet)
  function reloadFromStore() {
    if (document.activeElement && document.activeElement.isContentEditable) return;
    store.get().then(saved => {
      if (saved && saved.profile && Array.isArray(saved.activities)) {
        state = normalize(saved);
        renderAll();
      }
    });
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reloadFromStore(); });
  window.addEventListener('pageshow', e => { if (e.persisted) reloadFromStore(); });

  /* ---------- Démarrage ---------- */
  // Recharge js/data.js sans cache : une publication récente est visible tout de suite (téléphone compris)
  function loadPublished() {
    if (location.protocol === 'file:') return Promise.resolve();
    return fetch('js/data.js', { cache: 'no-store' })
      .then(r => (r.ok ? r.text() : Promise.reject()))
      .then(text => {
        const data = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
        if (data.profile && Array.isArray(data.activities)) {
          window.SITE_DATA = data;
          published = JSON.stringify(data);
        }
      })
      .catch(() => {});
  }

  $('#year').textContent = new Date().getFullYear();
  renderAll();
  Promise.all([loadPublished(), store.get(), store.getItem('photos'), store.getItem('lastPublished')]).then(([, saved, photos, last]) => {
    photoCache = photos || {};
    lastPublished = last || null;
    if (saved && saved.profile && Array.isArray(saved.activities)) {
      state = normalize(saved);
      // La version locale correspond déjà à ce qui est en ligne : on suit la version publiée
      if (JSON.stringify(state) === published) store.clear().catch(() => {});
    } else {
      state = clone(window.SITE_DATA);
    }
    renderAll();
    updatePublishState();
    if (location.hash === '#edit') setEditing(true);
  });
})();
