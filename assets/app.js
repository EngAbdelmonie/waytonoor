/* WayToNoor — client behaviour. No tracking, no external calls except the
   local statistics file. All progress lives in this browser only
   (localStorage); there are no accounts and no server in this phase. */
(function () {
  'use strict';
  var STORE_KEY = 'wtn.progress.v1';
  var dataEl = document.getElementById('page-data');
  var PD = {};
  try { PD = dataEl ? JSON.parse(dataEl.textContent) : {}; } catch (e) { PD = {}; }
  var S = (PD.strings || {});

  function load() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; }
    catch (e) { return {}; }
  }
  function save(st) {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(st)); } catch (e) {}
    document.dispatchEvent(new CustomEvent('wtn:progress'));
  }
  function store() { var st = load(); st.lessons = st.lessons || {}; st.unitQuiz = st.unitQuiz || {}; st.checklist = st.checklist || {}; return st; }

  /* ---------- mobile nav ---------- */
  var toggle = document.querySelector('.nav-toggle');
  var links = document.querySelector('.nav-links');
  if (toggle && links) {
    toggle.addEventListener('click', function () {
      var open = links.classList.toggle('open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  }

  /* ---------- journey maths ---------- */
  function lessonState(st, level, lesson) {
    return st.lessons[level + '-' + lesson] || { best: null, attempts: 0, review: false, practice: false, note: '' };
  }
  function levelInfo(n) {
    return (PD.levels || []).filter(function (l) { return l.n === n; })[0] || null;
  }
  function levelComplete(st, n) {
    var info = levelInfo(n); if (!info) return false;
    var sum = 0;
    for (var i = 1; i <= info.lessons; i++) {
      var ls = lessonState(st, n, i);
      if (!ls.practice) return false;
      if (ls.best === null || ls.best === undefined) return false;
      sum += ls.best;
    }
    return (sum / info.lessons) >= 80;
  }
  function levelUnlocked(st, n) {
    if (n <= 1) return true;
    return levelComplete(st, n - 1);
  }
  function levelProgress(st, n) {
    var info = levelInfo(n); if (!info) return { done: 0, total: 0, avg: null };
    var done = 0, sum = 0, scored = 0;
    for (var i = 1; i <= info.lessons; i++) {
      var ls = lessonState(st, n, i);
      if (ls.practice && ls.best !== null && ls.best !== undefined) done++;
      if (ls.best !== null && ls.best !== undefined) { sum += ls.best; scored++; }
    }
    return { done: done, total: info.lessons, avg: scored ? Math.round(sum / info.lessons) : null };
  }

  /* ---------- ladder rendering ---------- */
  function paintLadders() {
    var st = store();
    document.querySelectorAll('[data-rung]').forEach(function (el) {
      var n = parseInt(el.getAttribute('data-rung'), 10);
      var complete = levelComplete(st, n);
      var unlocked = levelUnlocked(st, n);
      el.classList.toggle('lit', complete);
      el.classList.toggle('open', !complete && unlocked);
      el.classList.toggle('locked', !unlocked);
      var stateEl = el.querySelector('[data-rung-state]');
      if (stateEl) stateEl.textContent = complete ? S.stateLit : (unlocked ? S.stateOpen : S.stateLocked);
      var progEl = el.querySelector('[data-rung-progress]');
      if (progEl) {
        var p = levelProgress(st, n);
        progEl.textContent = p.total ? (S.lessonsDone
          .replace('{done}', p.done).replace('{total}', p.total)
          + (p.avg !== null ? ' · ' + S.avgLabel.replace('{avg}', p.avg) : '')) : '';
      }
    });
    document.querySelectorAll('[data-mini-step]').forEach(function (el) {
      var n = parseInt(el.getAttribute('data-mini-step'), 10);
      el.classList.toggle('lit', levelComplete(st, n));
      el.classList.toggle('open', !levelComplete(st, n) && levelUnlocked(st, n));
    });
    document.querySelectorAll('[data-resume]').forEach(function (a) {
      var target = null;
      (PD.levels || []).forEach(function (info) {
        if (target || !levelUnlocked(st, info.n) || levelComplete(st, info.n)) return;
        for (var i = 1; i <= info.lessons; i++) {
          var ls = lessonState(st, info.n, i);
          if (!ls.practice || ls.best === null || ls.best === undefined) {
            target = info.url + '#lesson-' + i; break;
          }
        }
        if (!target) target = info.url;
      });
      a.setAttribute('href', target || a.getAttribute('href'));
    });
  }

  /* ---------- unit quizzes: instant feedback, no grades ---------- */
  function renderUnitQuiz(box, quiz) {
    var st = store();
    var saved = (st.unitQuiz[quiz.id] || {}).answers || {};
    box.innerHTML = '';
    var title = document.createElement('h3'); title.textContent = quiz.title || ''; box.appendChild(title);
    quiz.questions.forEach(function (q, qi) {
      var block = document.createElement('div'); block.className = 'q-block';
      var qt = document.createElement('div'); qt.className = 'q-text'; qt.textContent = (qi + 1) + '. ' + q.q; block.appendChild(qt);
      var fb = document.createElement('div'); fb.className = 'feedback';
      q.options.forEach(function (opt, oi) {
        var lab = document.createElement('label'); lab.className = 'opt';
        var inp = document.createElement('input'); inp.type = 'radio'; inp.name = quiz.id + '-q' + qi; inp.value = oi;
        var span = document.createElement('span'); span.textContent = opt;
        lab.appendChild(inp); lab.appendChild(span); block.appendChild(lab);
        if (saved[qi] !== undefined && saved[qi] !== null) {
          inp.disabled = true;
          if (oi === q.correct) lab.classList.add('correct');
          if (oi === saved[qi] && oi !== q.correct) lab.classList.add('wrong');
          if (oi === saved[qi]) inp.checked = true;
        }
        inp.addEventListener('change', function () {
          var st2 = store();
          st2.unitQuiz[quiz.id] = st2.unitQuiz[quiz.id] || { answers: {} };
          st2.unitQuiz[quiz.id].answers[qi] = oi;
          save(st2);
          block.querySelectorAll('label.opt').forEach(function (l, li) {
            l.querySelector('input').disabled = true;
            if (li === q.correct) l.classList.add('correct');
            if (li === oi && oi !== q.correct) l.classList.add('wrong');
          });
          fb.textContent = (oi === q.correct ? '✓ ' : '✗ ') + (q.feedback || '');
          fb.classList.add('show');
        });
      });
      if (saved[qi] !== undefined && saved[qi] !== null) {
        fb.textContent = (saved[qi] === q.correct ? '✓ ' : '✗ ') + (q.feedback || '');
        fb.classList.add('show');
      }
      block.appendChild(fb);
      box.appendChild(block);
    });
  }

  /* ---------- lesson quizzes: attempts, best counts, guided review gate ---------- */
  function renderLessonQuiz(box, quiz) {
    var st = store();
    var key = quiz.level + '-' + quiz.lesson;
    var ls = lessonState(st, quiz.level, quiz.lesson);
    box.innerHTML = '';
    var title = document.createElement('h3'); title.textContent = quiz.title || ''; box.appendChild(title);

    var form = document.createElement('div');
    quiz.questions.forEach(function (q, qi) {
      var block = document.createElement('div'); block.className = 'q-block';
      var qt = document.createElement('div'); qt.className = 'q-text'; qt.textContent = (qi + 1) + '. ' + q.q; block.appendChild(qt);
      q.options.forEach(function (opt, oi) {
        var lab = document.createElement('label'); lab.className = 'opt';
        var inp = document.createElement('input'); inp.type = 'radio'; inp.name = quiz.id + '-q' + qi; inp.value = oi;
        var span = document.createElement('span'); span.textContent = opt;
        lab.appendChild(inp); lab.appendChild(span); block.appendChild(lab);
      });
      var fb = document.createElement('div'); fb.className = 'feedback'; block.appendChild(fb);
      form.appendChild(block);
    });
    box.appendChild(form);

    var scoreLine = document.createElement('div'); scoreLine.className = 'score-line'; box.appendChild(scoreLine);
    var reviewPanel = document.createElement('div'); reviewPanel.className = 'review-panel'; box.appendChild(reviewPanel);
    var btnRow = document.createElement('div');
    var checkBtn = document.createElement('button'); checkBtn.type = 'button'; checkBtn.className = 'btn btn-primary btn-small'; checkBtn.textContent = S.checkAnswers;
    var retryBtn = document.createElement('button'); retryBtn.type = 'button'; retryBtn.className = 'btn btn-sand btn-small'; retryBtn.textContent = S.newAttempt; retryBtn.style.display = 'none';
    btnRow.appendChild(checkBtn); btnRow.appendChild(retryBtn); box.appendChild(btnRow);

    function paintScore() {
      var cur = lessonState(store(), quiz.level, quiz.lesson);
      if (cur.best !== null && cur.best !== undefined) {
        scoreLine.textContent = S.bestScore.replace('{best}', cur.best).replace('{attempts}', cur.attempts);
      } else { scoreLine.textContent = ''; }
    }
    paintScore();

    function gateRetry(missed) {
      /* After a non-perfect attempt, the next attempt opens only after the
         guided-review task is confirmed — the texts' own rule. */
      if (!missed.length) { retryBtn.style.display = ''; retryBtn.disabled = false; return; }
      reviewPanel.innerHTML = '';
      var h = document.createElement('strong'); h.textContent = S.reviewTitle; reviewPanel.appendChild(h);
      var p = document.createElement('p'); p.textContent = S.reviewBody; reviewPanel.appendChild(p);
      var ul = document.createElement('ul');
      missed.forEach(function (m) {
        var li = document.createElement('li');
        li.textContent = S.reviewItem.replace('{n}', m.n) + (m.note ? ' — ' + m.note : '');
        ul.appendChild(li);
      });
      reviewPanel.appendChild(ul);
      var lab = document.createElement('label');
      var cb = document.createElement('input'); cb.type = 'checkbox';
      lab.appendChild(cb); lab.appendChild(document.createTextNode(' ' + S.reviewConfirm));
      reviewPanel.appendChild(lab);
      reviewPanel.classList.add('show');
      retryBtn.style.display = ''; retryBtn.disabled = true;
      cb.addEventListener('change', function () {
        retryBtn.disabled = !cb.checked;
        if (cb.checked) {
          var st2 = store();
          var e = lessonState(st2, quiz.level, quiz.lesson); e.review = true;
          st2.lessons[key] = e; save(st2);
        }
      });
    }

    checkBtn.addEventListener('click', function () {
      var correctCount = 0; var missed = [];
      quiz.questions.forEach(function (q, qi) {
        var sel = box.querySelector('input[name="' + quiz.id + '-q' + qi + '"]:checked');
        var block = form.children[qi];
        var fb = block.querySelector('.feedback');
        var chosen = sel ? parseInt(sel.value, 10) : -1;
        block.querySelectorAll('label.opt').forEach(function (l, li) {
          l.querySelector('input').disabled = true;
          if (li === q.correct) l.classList.add('correct');
          if (li === chosen && chosen !== q.correct) l.classList.add('wrong');
        });
        if (chosen === q.correct) { correctCount++; }
        else { missed.push({ n: qi + 1, note: q.feedback || '' }); }
        fb.textContent = (chosen === q.correct ? '✓ ' : '✗ ') + (q.feedback || '');
        fb.classList.add('show');
      });
      var pct = Math.round((correctCount / quiz.questions.length) * 100);
      var st2 = store();
      var e = lessonState(st2, quiz.level, quiz.lesson);
      e.attempts = (e.attempts || 0) + 1;
      e.best = (e.best === null || e.best === undefined) ? pct : Math.max(e.best, pct);
      st2.lessons[key] = e; save(st2);
      paintScore();
      checkBtn.style.display = 'none';
      gateRetry(missed);
      paintLadders(); paintCompletion();
    });

    retryBtn.addEventListener('click', function () {
      renderLessonQuiz(box, quiz);
      box.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }

  /* ---------- practice confirmation ---------- */
  function wirePractice(box) {
    var level = parseInt(box.getAttribute('data-level'), 10);
    var lesson = parseInt(box.getAttribute('data-lesson'), 10);
    var key = level + '-' + lesson;
    var cb = box.querySelector('input[type=checkbox][data-practice]');
    var note = box.querySelector('input[type=text][data-practice-note]');
    var tag = box.querySelector('[data-done-tag]');
    var st = store(); var e = lessonState(st, level, lesson);
    if (cb) cb.checked = !!e.practice;
    if (note) note.value = e.note || '';
    if (tag) tag.style.display = e.practice ? '' : 'none';
    if (cb) cb.addEventListener('change', function () {
      var st2 = store(); var en = lessonState(st2, level, lesson);
      en.practice = cb.checked; st2.lessons[key] = en; save(st2);
      if (tag) tag.style.display = cb.checked ? '' : 'none';
      paintLadders(); paintCompletion();
    });
    if (note) note.addEventListener('change', function () {
      var st2 = store(); var en = lessonState(st2, level, lesson);
      en.note = note.value; st2.lessons[key] = en; save(st2);
    });
  }

  /* ---------- completion panel + checklist + arrival ---------- */
  function paintCompletion() {
    document.querySelectorAll('[data-completion]').forEach(function (panel) {
      var n = parseInt(panel.getAttribute('data-completion'), 10);
      var st = store();
      var info = levelInfo(n); if (!info) return;
      var tbody = panel.querySelector('[data-status-body]');
      if (tbody) {
        tbody.innerHTML = '';
        for (var i = 1; i <= info.lessons; i++) {
          var ls = lessonState(st, n, i);
          var tr = document.createElement('tr');
          var td1 = document.createElement('td'); td1.textContent = S.lessonWord + ' ' + i;
          var td2 = document.createElement('td');
          td2.innerHTML = (ls.best === null || ls.best === undefined)
            ? '<span class="no">' + S.notYet + '</span>'
            : '<span class="ok">' + ls.best + '%</span>';
          var td3 = document.createElement('td');
          td3.innerHTML = ls.practice ? '<span class="ok">✓</span>' : '<span class="no">' + S.notYet + '</span>';
          tr.appendChild(td1); tr.appendChild(td2); tr.appendChild(td3);
          tbody.appendChild(tr);
        }
      }
      var avgEl = panel.querySelector('[data-avg]');
      if (avgEl) {
        var p = levelProgress(st, n);
        avgEl.textContent = (p.avg === null ? S.noScoresYet : S.avgLabel.replace('{avg}', p.avg)) +
          ' · ' + S.lessonsDone.replace('{done}', p.done).replace('{total}', p.total);
      }
      var arrival = panel.querySelector('[data-arrival]');
      if (arrival) arrival.classList.toggle('show', levelComplete(st, n));
      /* checklist */
      var saved = (st.checklist || {})[n] || [];
      panel.querySelectorAll('input[data-check-item]').forEach(function (cb, idx) {
        cb.checked = !!saved[idx];
      });
    });
  }
  document.querySelectorAll('input[data-check-item]').forEach(function (cb) {
    cb.addEventListener('change', function () {
      var panel = cb.closest('[data-completion]');
      var n = panel.getAttribute('data-completion');
      var st = store(); st.checklist[n] = st.checklist[n] || [];
      var idx = parseInt(cb.getAttribute('data-check-item'), 10);
      st.checklist[n][idx] = cb.checked; save(st);
    });
  });

  /* ---------- level page locking ---------- */
  document.querySelectorAll('[data-level-page]').forEach(function (main) {
    var n = parseInt(main.getAttribute('data-level-page'), 10);
    var st = store();
    if (!levelUnlocked(st, n)) {
      var fs = main.querySelector('fieldset[data-lessons]');
      if (fs) fs.disabled = true;
      var banner = main.querySelector('[data-lock-banner]');
      if (banner) banner.style.display = '';
    }
  });

  /* ---------- counters: real data only ---------- */
  document.querySelectorAll('[data-counters]').forEach(function (wrap) {
    var url = wrap.getAttribute('data-counters');
    fetch(url).then(function (r) { return r.json(); }).then(function (stats) {
      var shown = 0;
      wrap.querySelectorAll('[data-counter-key]').forEach(function (card) {
        var key = card.getAttribute('data-counter-key');
        var v = stats ? stats[key] : null;
        if (typeof v === 'number') {
          card.querySelector('.value').textContent = v.toLocaleString(PD.lang === 'ar' ? 'ar-EG' : 'en-US');
          shown++;
        } else { card.style.display = 'none'; }
      });
      var note = wrap.querySelector('[data-counters-note]');
      if (note) note.style.display = shown ? 'none' : '';
      var grid = wrap.querySelector('.counters');
      if (grid) grid.style.display = shown ? '' : 'none';
    }).catch(function () { /* file unreadable: keep the transparency note visible */ });
  });

  /* ---------- ask-a-human: question form (form-to-email endpoint) ---------- */
  var askForm = document.querySelector('[data-ask-form]');
  if (askForm) {
    var askStatus = askForm.querySelector('[data-ask-status]');
    var askBtn = askForm.querySelector('button[type="submit"]');
    function showAskStatus(msg, isError) {
      if (!askStatus) return;
      askStatus.textContent = msg;
      askStatus.style.display = '';
      askStatus.classList.toggle('error', !!isError);
    }
    askForm.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var endpoint = askForm.getAttribute('data-endpoint') || '';
      var emailEl = askForm.querySelector('[name="email"]');
      var qEl = askForm.querySelector('[name="question"]');
      var email = (emailEl.value || '').trim();
      var question = (qEl.value || '').trim();
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !question) {
        showAskStatus(S.askInvalid, true);
        return;
      }
      if (endpoint.indexOf('OWNER_INBOX_PENDING') !== -1) {
        /* Interim state: reception is not connected yet — never fake a send. */
        showAskStatus(S.askPending, true);
        return;
      }
      var payload = {
        name: (askForm.querySelector('[name="name"]').value || '').trim(),
        email: email,
        topic: askForm.querySelector('[name="topic"]').value,
        question: question,
        _subject: 'WayToNoor — new question / سؤال جديد'
      };
      askBtn.disabled = true;
      showAskStatus(S.askSending, false);
      fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(payload)
      }).then(function (r) {
        if (!r.ok) throw new Error('send failed');
        askForm.reset();
        showAskStatus(S.askSent, false);
      }).catch(function () {
        showAskStatus(S.askError, true);
      }).then(function () { askBtn.disabled = false; });
    });
  }
  var gradForm = document.querySelector('[data-graduate-form]');
  if (gradForm) gradForm.addEventListener('submit', function (ev) {
    ev.preventDefault();
    var done = document.querySelector('[data-graduate-done]');
    if (done) done.style.display = '';
    gradForm.querySelectorAll('input,select,textarea,button').forEach(function (el) { el.disabled = true; });
  });

  /* ---------- wire everything ---------- */
  (PD.quizzes || []).forEach(function (quiz) {
    var box = document.querySelector('[data-quiz="' + quiz.id + '"]');
    if (!box) return;
    if (quiz.kind === 'unit') renderUnitQuiz(box, quiz); else renderLessonQuiz(box, quiz);
  });
  document.querySelectorAll('[data-practice-box]').forEach(wirePractice);
  paintLadders();
  paintCompletion();
  document.addEventListener('wtn:progress', function () { paintLadders(); });

  /* ---------- round-2 structural: TOC, back-to-top, table wrapper ---------- */
  var IS_AR = (PD.lang === 'ar') || document.documentElement.lang === 'ar';
  /* Labels reuse words already in the site's own copy: «المحتوى» appears in the
     Arabic pages; the back-to-top control is a symbol with the page's own
     "top" wording avoided — aria-label uses the brand-free functional pair. */
  var TOC_LABEL = IS_AR ? 'المحتوى' : 'Contents';
  var TOP_LABEL = IS_AR ? 'العودة إلى الأعلى' : 'Back to top';

  /* Wide tables: wrap each in a horizontally scrolling box. Runs before the
     completion paint below re-renders status tables (their <table> element
     itself is static markup, so wrapping survives row repaints). */
  document.querySelectorAll('table').forEach(function (tbl) {
    if (tbl.parentElement && tbl.parentElement.classList.contains('table-scroll')) return;
    var wrap = document.createElement('div');
    wrap.className = 'table-scroll';
    tbl.parentElement.insertBefore(wrap, tbl);
    wrap.appendChild(tbl);
  });
  paintCompletion();

  /* In-page contents for long article pages (>= 4 section headings). */
  var article = document.querySelector('article.article') || document.querySelector('.article');
  if (article) {
    var headings = [];
    article.querySelectorAll('h2, h3').forEach(function (h) {
      if (h.closest('[data-quiz], .quiz, .toc')) return;
      headings.push(h);
    });
    if (headings.length >= 4) {
      var usedIds = {};
      document.querySelectorAll('[id]').forEach(function (el) { usedIds[el.id] = true; });
      function slugFor(text, i) {
        var s = (text || '').trim().replace(/\s+/g, '-').replace(/[^\p{L}\p{N}-]+/gu, '').replace(/^-+|-+$/g, '');
        if (!s) s = 'section';
        s = 'toc-' + s;
        if (usedIds[s]) s = s + '-' + (i + 1);
        usedIds[s] = true;
        return s;
      }
      var nav = document.createElement('nav');
      nav.className = 'toc';
      nav.setAttribute('aria-label', TOC_LABEL);
      var toggleBtn = document.createElement('button');
      toggleBtn.type = 'button';
      toggleBtn.className = 'toc-toggle';
      toggleBtn.setAttribute('aria-expanded', 'false');
      var titleSpan = document.createElement('span');
      titleSpan.className = 'toc-title';
      titleSpan.textContent = TOC_LABEL;
      var chev = document.createElement('span');
      chev.setAttribute('aria-hidden', 'true');
      chev.textContent = '▾';
      toggleBtn.appendChild(titleSpan);
      toggleBtn.appendChild(chev);
      var body = document.createElement('div');
      body.className = 'toc-body';
      var deskTitle = document.createElement('div');
      deskTitle.className = 'toc-title';
      deskTitle.textContent = TOC_LABEL;
      body.appendChild(deskTitle);
      var list = document.createElement('ul');
      list.className = 'toc-list';
      var currentSub = null;
      headings.forEach(function (h, i) {
        if (!h.id) h.id = slugFor(h.textContent, i);
        var li = document.createElement('li');
        var a = document.createElement('a');
        a.href = '#' + h.id;
        a.textContent = h.textContent;
        li.appendChild(a);
        if (h.tagName === 'H3') {
          if (!currentSub) {
            currentSub = document.createElement('ul');
            currentSub.className = 'toc-list toc-sub';
            list.appendChild(currentSub);
          }
          currentSub.appendChild(li);
        } else {
          currentSub = null;
          list.appendChild(li);
        }
      });
      body.appendChild(list);
      nav.appendChild(toggleBtn);
      nav.appendChild(body);
      toggleBtn.addEventListener('click', function () {
        var open = nav.classList.toggle('open');
        toggleBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
        chev.textContent = open ? '▴' : '▾';
      });
      /* Insert after the page header area: the h1, plus a lead blockquote
         when one directly follows it (the EN units' intro block). */
      var anchor = article.querySelector('h1') || article.firstElementChild;
      var insertAfter = anchor;
      if (anchor) {
        var sib = anchor.nextElementSibling;
        if (sib && sib.tagName === 'BLOCKQUOTE') insertAfter = sib;
        if (insertAfter && insertAfter.parentNode) insertAfter.parentNode.insertBefore(nav, insertAfter.nextSibling);
      }
    }
  }

  /* Back-to-top: appears after ~600px of scroll, inline-end side. */
  var topBtn = document.createElement('button');
  topBtn.type = 'button';
  topBtn.className = 'back-to-top';
  topBtn.setAttribute('aria-label', TOP_LABEL);
  topBtn.setAttribute('title', TOP_LABEL);
  topBtn.textContent = '↑';
  document.body.appendChild(topBtn);
  var ticking = false;
  function paintTopBtn() {
    topBtn.classList.toggle('show', window.scrollY > 600);
    ticking = false;
  }
  window.addEventListener('scroll', function () {
    if (!ticking) { ticking = true; window.requestAnimationFrame(paintTopBtn); }
  }, { passive: true });
  paintTopBtn();
  topBtn.addEventListener('click', function () {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
})();

/* WayToNoor — Thiqa handover, ladder-top reveal (integration round).
   The journey index carries the graduation handover card inside
   [data-ladder-top], hidden until every rung is lit. This block is
   self-contained: it reads the same stored progress ('wtn.progress.v1')
   and the same page-data lesson counts, and applies the site's own
   completion maths (every lesson practised, best scores averaging
   at least 80) — the same rule paintLadders uses for the rungs. */
(function () {
  'use strict';
  var box = document.querySelector('[data-ladder-top]');
  if (!box) return;
  var dataEl = document.getElementById('page-data');
  var PD = {};
  try { PD = dataEl ? JSON.parse(dataEl.textContent) : {}; } catch (e) { PD = {}; }
  function levelComplete(st, info) {
    if (!info) return false;
    var sum = 0;
    for (var i = 1; i <= info.lessons; i++) {
      var ls = (st.lessons || {})[info.n + '-' + i] || {};
      if (!ls.practice) return false;
      if (ls.best === null || ls.best === undefined) return false;
      sum += ls.best;
    }
    return (sum / info.lessons) >= 80;
  }
  function check() {
    var st = {};
    try { st = JSON.parse(localStorage.getItem('wtn.progress.v1')) || {}; } catch (e) { st = {}; }
    var levels = PD.levels || [];
    var all = levels.length === 5 && levels.every(function (info) { return levelComplete(st, info); });
    box.style.display = all ? '' : 'none';
  }
  document.addEventListener('wtn:progress', check);
  window.addEventListener('storage', check);
  check();
})();
/* WayToNoor — Mushaf reader player (staging).
   Mirrors the Thiqa platform's mushaf behaviour (lib/quran.js +
   MushafReader.js): per-ayah audio streamed from the Islamic Network
   CDN, keyed by the ayah's GLOBAL number (1..6236); four real recorded
   murattal recitations, Alafasy the default; a failed file on another
   reciter falls back once to Alafasy for that ayah; the reciter choice
   persists in localStorage. Audio is streamed by the visitor's browser
   at play time — never downloaded, hosted or proxied by the site.
   Recitation is a real human recording only; nothing is synthesised
   and no music ever plays under it.

   The reader page renders its ayahs at build time (each .ayah carries
   data-n and data-g); this script only drives playback + highlighting.
   Deliberate difference from Thiqa: repeat defaults to x1 (WayToNoor
   is a reading/listening site for new Muslims, not a memorisation
   tool); the x3/x5/x10 control is present, as on Thiqa. */
(function () {
  "use strict";

  var RECITERS = [
    { id: "alafasy",    edition: "ar.alafasy",           bitrate: 128, name_ar: "مشاري راشد العفاسي",  name_en: "Mishary Rashid Alafasy" },
    { id: "minshawi",   edition: "ar.minshawi",          bitrate: 128, name_ar: "محمد صديق المنشاوي",  name_en: "Mohamed Siddiq El-Minshawi" },
    { id: "husary",     edition: "ar.husary",            bitrate: 128, name_ar: "محمود خليل الحصري",   name_en: "Mahmoud Khalil Al-Husary" },
    { id: "abdulbasit", edition: "ar.abdulbasitmurattal", bitrate: 64, name_ar: "عبد الباسط عبد الصمد", name_en: "Abdul Basit Abdul Samad" }
  ];
  var STORAGE_KEY = "wtn_reciter";
  var FALLBACK = RECITERS[0];

  function urlFor(reciter, g) {
    return "https://cdn.islamic.network/quran/audio/" + reciter.bitrate + "/" + reciter.edition + "/" + g + ".mp3";
  }

  /* ---------------- reader pages ---------------- */
  var root = document.querySelector(".mushaf-reader");
  if (root) {
    var lang = root.getAttribute("data-lang") || "ar";
    var ayahs = Array.prototype.slice.call(root.querySelectorAll(".ayah"));
    var audio = root.querySelector(".mp-audio");
    var btnToggle = root.querySelector('[data-action="toggle"]');
    var btnStop = root.querySelector('[data-action="stop"]');
    var btnPrev = root.querySelector('[data-action="prev"]');
    var btnNext = root.querySelector('[data-action="next"]');
    var selRepeat = root.querySelector(".mp-repeat");
    var selReciter = root.querySelector(".mp-reciter");
    var nowLine = root.querySelector(".mp-now");
    var creditName = root.querySelector(".mp-reciter-name");
    var errLine = root.querySelector(".mp-error");
    var enToggle = root.querySelector(".mp-en-toggle input");

    var state = { idx: -1, playing: false, repeatLeft: 0, fellBack: false };
    var reciter = FALLBACK;
    try {
      var saved = window.localStorage.getItem(STORAGE_KEY);
      for (var i = 0; i < RECITERS.length; i++) if (RECITERS[i].id === saved) reciter = RECITERS[i];
    } catch (e) { /* storage unavailable — default stays */ }
    if (selReciter) {
      selReciter.value = reciter.id;
      updateCredit();
      selReciter.addEventListener("change", function () {
        stopAll();
        for (var j = 0; j < RECITERS.length; j++) if (RECITERS[j].id === selReciter.value) reciter = RECITERS[j];
        try { window.localStorage.setItem(STORAGE_KEY, reciter.id); } catch (e) {}
        updateCredit();
      });
    }
    function updateCredit() {
      if (creditName) creditName.textContent = lang === "ar" ? reciter.name_ar : reciter.name_en;
    }
    function repeatTimes() { return selRepeat ? parseInt(selRepeat.value, 10) || 1 : 1; }

    function setHighlight() {
      ayahs.forEach(function (el, i) { el.classList.toggle("playing", i === state.idx && state.playing); });
      if (state.idx >= 0 && ayahs[state.idx]) {
        var el = ayahs[state.idx];
        if (nowLine) {
          nowLine.textContent = (lang === "ar" ? "الآية " : "Ayah ") + el.getAttribute("data-n");
        }
        var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        el.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
      } else if (nowLine) {
        nowLine.textContent = "";
      }
    }

    function playIdx(idx, times) {
      if (idx < 0 || idx >= ayahs.length) { stopAll(); return; }
      state.idx = idx;
      state.repeatLeft = times || repeatTimes();
      state.fellBack = false;
      state.playing = true;
      if (errLine) errLine.textContent = "";
      audio.src = urlFor(reciter, ayahs[idx].getAttribute("data-g"));
      var p = audio.play();
      if (p && p.catch) p.catch(handleError);
      setHighlight();
      syncToggleLabel();
    }

    function handleError() {
      if (!state.fellBack && reciter.id !== FALLBACK.id && state.idx >= 0) {
        state.fellBack = true;
        audio.src = urlFor(FALLBACK, ayahs[state.idx].getAttribute("data-g"));
        var p = audio.play();
        if (p && p.catch) p.catch(showError);
        return;
      }
      showError();
    }
    function showError() {
      state.playing = false;
      if (errLine) {
        errLine.textContent = lang === "ar"
          ? "تعذّر تشغيل التلاوة — تحقّق من اتصالك ثم حاول مرة أخرى."
          : "The recitation could not be played — check your connection and try again.";
      }
      setHighlight(); syncToggleLabel();
    }

    function stopAll() {
      audio.pause();
      state.playing = false;
      state.repeatLeft = 0;
      setHighlight(); syncToggleLabel();
    }
    function syncToggleLabel() {
      if (!btnToggle) return;
      var playing = state.playing && !audio.paused;
      btnToggle.textContent = playing
        ? (lang === "ar" ? "⏸ إيقاف مؤقت" : "⏸ Pause")
        : (lang === "ar" ? "▶ تشغيل السورة" : "▶ Play the surah");
    }

    if (audio) {
      audio.addEventListener("ended", function () {
        if (state.repeatLeft > 1) {
          state.repeatLeft -= 1;
          audio.currentTime = 0;
          var p = audio.play(); if (p && p.catch) p.catch(handleError);
          return;
        }
        if (state.idx + 1 < ayahs.length) playIdx(state.idx + 1, repeatTimes());
        else stopAll();
      });
      audio.addEventListener("error", function () { if (state.playing) handleError(); });
      audio.addEventListener("pause", syncToggleLabel);
      audio.addEventListener("play", syncToggleLabel);
    }
    if (btnToggle) btnToggle.addEventListener("click", function () {
      if (state.playing && !audio.paused) { audio.pause(); return; }
      if (state.idx >= 0 && audio.src) { var p = audio.play(); if (p && p.catch) p.catch(handleError); state.playing = true; setHighlight(); return; }
      playIdx(0, repeatTimes());
    });
    if (btnStop) btnStop.addEventListener("click", stopAll);
    if (btnPrev) btnPrev.addEventListener("click", function () { playIdx(Math.max(0, (state.idx < 0 ? 0 : state.idx - 1)), repeatTimes()); });
    if (btnNext) btnNext.addEventListener("click", function () { playIdx(Math.min(ayahs.length - 1, state.idx + 1), repeatTimes()); });
    ayahs.forEach(function (el, i) {
      el.addEventListener("click", function (ev) {
        if (ev.target.closest && ev.target.closest("a,button,select,input,label")) return;
        playIdx(i, repeatTimes());
      });
      var b = el.querySelector(".ayah-play");
      if (b) b.addEventListener("click", function () { playIdx(i, repeatTimes()); });
    });
    if (enToggle) enToggle.addEventListener("change", function () {
      root.classList.toggle("hide-en", !enToggle.checked);
    });
  }

  /* ---------------- index page: live search ---------------- */
  var search = document.querySelector(".mushaf-search input");
  if (search) {
    var rows = Array.prototype.slice.call(document.querySelectorAll(".surah-row"));
    var empty = document.querySelector(".surah-empty");
    search.addEventListener("input", function () {
      var q = search.value.trim().toLowerCase();
      var shown = 0;
      rows.forEach(function (row) {
        var hay = (row.getAttribute("data-search") || "").toLowerCase();
        var hit = !q || hay.indexOf(q) !== -1;
        row.style.display = hit ? "" : "none";
        if (hit) shown++;
      });
      if (empty) empty.style.display = shown ? "none" : "block";
    });
  }
})();

/* WayToNoor — hybrid round (2026-11-27): reveal-on-scroll, the sticky
   progress header (chips from the page's own headings + a reading
   track), unit status pills, and the journey progress track.
   Self-contained: reads the same #page-data blob and the same
   'wtn.progress.v1' store as the other blocks, and applies the site's
   own completion maths for the track. */
(function () {
  'use strict';
  var dataEl = document.getElementById('page-data');
  var PD = {};
  try { PD = dataEl ? JSON.parse(dataEl.textContent) : {}; } catch (e) { PD = {}; }
  var S = PD.strings || {};
  var reduced = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- reveal-on-scroll ---------- */
  var rvEls = document.querySelectorAll('.rv');
  if (rvEls.length) {
    if (reduced || !('IntersectionObserver' in window)) {
      rvEls.forEach(function (el) { el.classList.add('in'); });
    } else {
      var io = new IntersectionObserver(function (es) {
        es.forEach(function (e) {
          if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
        });
      }, { threshold: 0.08 });
      rvEls.forEach(function (el) { io.observe(el); });
    }
  }

  /* ---------- unit status pills ---------- */
  var statusBox = document.querySelector('[data-hy-status]');
  if (statusBox && PD.quizzes && PD.quizzes.length === 1 &&
      PD.quizzes[0].kind === 'unit') {
    var nq = (PD.quizzes[0].questions || []).length;
    function pill(text, solid) {
      var s = document.createElement('span');
      s.className = 'hy-pill' + (solid ? ' solid' : '');
      s.textContent = text;
      return s;
    }
    if (S.hyState) statusBox.appendChild(pill(S.hyState, true));
    if (S.hyQuiz && nq) statusBox.appendChild(pill(S.hyQuiz.replace('{n}', nq)));
    if (S.hyNoGrades) statusBox.appendChild(pill(S.hyNoGrades));
  }

  /* ---------- sticky progress header (unit / level pages) ---------- */
  var bar = document.querySelector('[data-hy-progress]');
  var article = document.querySelector('article.article');
  if (bar && article) {
    var chipsBox = bar.querySelector('.hy-chips');
    var fill = bar.querySelector('.hy-track i');
    var heads = Array.prototype.slice.call(article.querySelectorAll('h2'));
    heads.forEach(function (h, i) {
      if (!h.id) h.id = 'hy-sec-' + (i + 1);
      var a = document.createElement('a');
      a.className = 'hy-chip';
      a.href = '#' + h.id;
      a.textContent = h.textContent;
      chipsBox.appendChild(a);
    });
    var chips = Array.prototype.slice.call(chipsBox.querySelectorAll('.hy-chip'));
    function onScroll() {
      var doc = document.documentElement;
      var max = doc.scrollHeight - window.innerHeight;
      var y = window.scrollY || doc.scrollTop;
      if (fill) fill.style.width =
        (max > 0 ? Math.min(100, Math.round(y / max * 100)) : 0) + '%';
      var current = -1;
      heads.forEach(function (h, i) {
        if (h.getBoundingClientRect().top < 200) current = i;
      });
      chips.forEach(function (c, i) { c.classList.toggle('now', i === current); });
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  /* ---------- journey index progress track ---------- */
  var jtrack = document.querySelector('[data-hy-jtrack]');
  if (jtrack) {
    var jfill = jtrack.querySelector('.track i');
    function levelComplete(st, info) {
      if (!info) return false;
      var sum = 0;
      for (var i = 1; i <= info.lessons; i++) {
        var ls = (st.lessons || {})[info.n + '-' + i] || {};
        if (!ls.practice) return false;
        if (ls.best === null || ls.best === undefined) return false;
        sum += ls.best;
      }
      return (sum / info.lessons) >= 80;
    }
    function paint() {
      var st = {};
      try { st = JSON.parse(localStorage.getItem('wtn.progress.v1')) || {}; }
      catch (e) { st = {}; }
      var levels = PD.levels || [];
      var lit = levels.filter(function (info) {
        return levelComplete(st, info);
      }).length;
      if (jfill && levels.length) {
        jfill.style.width = (lit / levels.length * 100) + '%';
      }
    }
    document.addEventListener('wtn:progress', paint);
    window.addEventListener('storage', paint);
    paint();
  }
})();

/* WayToNoor — interactivity round (WS-B): mid-lesson micro-checks and
   key-term tap-to-reveal cards. Self-contained like the blocks above:
   reads the same #page-data blob and the same 'wtn.progress.v1' store.
   Micro-checks reuse a subset of the page's OWN quiz questions (from
   #page-data) with their own authored feedback; answers persist under
   store.micro and NEVER touch unit-quiz answers, lesson best scores,
   attempts or the ladder maths. */
(function () {
  'use strict';
  var STORE_KEY = 'wtn.progress.v1';
  var dataEl = document.getElementById('page-data');
  var PD = {};
  try { PD = dataEl ? JSON.parse(dataEl.textContent) : {}; } catch (e) { PD = {}; }
  var S = PD.strings || {};
  function load() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; }
    catch (e) { return {}; }
  }
  function save(st) {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(st)); } catch (e) {}
    document.dispatchEvent(new CustomEvent('wtn:progress'));
  }

  /* ---------- mid-lesson / mid-text micro-checks ---------- */
  document.querySelectorAll('[data-micro]').forEach(function (box) {
    var qid = box.getAttribute('data-micro');
    var qidx = parseInt(box.getAttribute('data-qidx'), 10);
    var quiz = (PD.quizzes || []).filter(function (q) { return q.id === qid; })[0];
    if (!quiz || !quiz.questions || !quiz.questions[qidx]) return;
    var q = quiz.questions[qidx];
    var key = qid + ':' + qidx;
    var saved = ((load().micro || {})[key]);
    box.innerHTML = '';
    var title = document.createElement('h3');
    title.textContent = S.microTitle || '';
    box.appendChild(title);
    var block = document.createElement('div'); block.className = 'q-block';
    var qt = document.createElement('div'); qt.className = 'q-text';
    qt.textContent = q.q;
    block.appendChild(qt);
    var fb = document.createElement('div'); fb.className = 'feedback';
    q.options.forEach(function (opt, oi) {
      var lab = document.createElement('label'); lab.className = 'opt';
      var inp = document.createElement('input');
      inp.type = 'radio'; inp.name = 'micro-' + key; inp.value = oi;
      var span = document.createElement('span'); span.textContent = opt;
      lab.appendChild(inp); lab.appendChild(span); block.appendChild(lab);
      if (saved !== undefined && saved !== null) {
        inp.disabled = true;
        if (oi === q.correct) lab.classList.add('correct');
        if (oi === saved && oi !== q.correct) lab.classList.add('wrong');
        if (oi === saved) inp.checked = true;
      }
      inp.addEventListener('change', function () {
        var st = load(); st.micro = st.micro || {};
        st.micro[key] = oi; save(st);
        block.querySelectorAll('label.opt').forEach(function (l, li) {
          l.querySelector('input').disabled = true;
          if (li === q.correct) l.classList.add('correct');
          if (li === oi && oi !== q.correct) l.classList.add('wrong');
        });
        fb.textContent = (oi === q.correct ? '✓ ' : '✗ ') + (q.feedback || '');
        fb.classList.add('show');
      });
    });
    if (saved !== undefined && saved !== null) {
      fb.textContent = (saved === q.correct ? '✓ ' : '✗ ') + (q.feedback || '');
      fb.classList.add('show');
    }
    block.appendChild(fb);
    box.appendChild(block);
  });

  /* ---------- key-term tap-to-reveal cards ---------- */
  document.querySelectorAll('[data-kp-toggle]').forEach(function (btn) {
    var card = btn.closest('.kp-card');
    var body = card ? card.querySelector('.kp-body') : null;
    var state = btn.querySelector('.kp-state');
    if (!body) return;
    btn.addEventListener('click', function () {
      var open = body.hidden;
      body.hidden = !open;
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (state) state.textContent = open ? (S.kpHide || '') : (S.kpShow || '');
    });
  });
})();

/* WayToNoor — WS-B (iv): per-page reading progress, stored locally.
   Section-based: a section (an article <h2>, mirrored by the sticky
   header's chips) counts as read once its heading has passed the
   viewport's middle. Read sections and the percentage live in
   'wtn.reading.v1' keyed by page path; on a revisit the chips of
   already-read sections carry the .read state and the track shows a
   ghost marker at the furthest percentage reached in earlier visits.
   Nothing leaves the browser; no scores or ladder state are touched. */
(function () {
  'use strict';
  var KEY = 'wtn.reading.v1';
  var bar = document.querySelector('[data-hy-progress]');
  var article = document.querySelector('article.article');
  if (!bar || !article) return;
  var heads = Array.prototype.slice.call(article.querySelectorAll('h2'));
  var chips = Array.prototype.slice.call(bar.querySelectorAll('.hy-chip'));
  if (!heads.length || !chips.length) return;
  var ghost = bar.querySelector('.hy-ghost');
  var path = window.location.pathname;
  function loadAll() {
    try { return JSON.parse(localStorage.getItem(KEY)) || {}; }
    catch (e) { return {}; }
  }
  var entry = loadAll()[path] || { pct: 0, secs: [] };
  var read = {};
  (entry.secs || []).forEach(function (id) { read[id] = true; });
  function paintChips() {
    heads.forEach(function (h, i) {
      if (chips[i]) chips[i].classList.toggle('read', !!read[h.id]);
    });
  }
  if (entry.pct > 0 && ghost) {
    ghost.hidden = false;
    ghost.style.insetInlineStart = Math.min(100, entry.pct) + '%';
  }
  paintChips();
  var ticking = false;
  function update() {
    ticking = false;
    var mid = window.innerHeight * 0.55;
    var changed = false;
    heads.forEach(function (h) {
      if (!read[h.id] && h.getBoundingClientRect().top < mid) {
        read[h.id] = true; changed = true;
      }
    });
    var pct = Math.round(Object.keys(read).length / heads.length * 100);
    if (pct > (entry.pct || 0)) { entry.pct = pct; changed = true; }
    if (changed) {
      entry.secs = Object.keys(read);
      var all = loadAll(); all[path] = entry;
      try { localStorage.setItem(KEY, JSON.stringify(all)); } catch (e) {}
      paintChips();
    }
  }
  window.addEventListener('scroll', function () {
    if (!ticking) { ticking = true; window.requestAnimationFrame(update); }
  }, { passive: true });
  update();
})();
