/* WayToNoor — client behaviour. No external calls except the local
   statistics file and — only when the owner has activated it in the
   build (ANALYTICS_MEASUREMENT_ID) — the GA4 tag, which the analytics
   block below feeds with category-only events. All progress lives in
   this browser only (localStorage); there are no accounts and no
   server in this phase. */
(function () {
  'use strict';
  var STORE_KEY = 'wtn.progress.v1';
  var dataEl = document.getElementById('page-data');
  var PD = {};
  try { PD = dataEl ? JSON.parse(dataEl.textContent) : {}; } catch (e) { PD = {}; }
  var S = (PD.strings || {});

  /* ---------- internal analytics (GA4) ----------
     wtnTrack is the single door for every event. It is INERT unless the
     gtag.js snippet is present on the page — and the build emits that
     snippet only when the owner has set a Measurement ID, so with
     analytics off this costs one typeof check per call and sends
     nothing anywhere. Event parameters are fixed categories and
     numbers from the site's own structure (doorway slug, unit number,
     score BAND, surah number, reciter id): never personal data, never
     quiz answers, never anything the visitor typed. The statistics
     are internal to the project and never published on the site. */
  window.wtnTrack = function (name, params) {
    try {
      if (typeof window.gtag !== 'function') return;
      var p = {};
      if (params) {
        for (var k in params) {
          if (params[k] !== undefined && params[k] !== null) p[k] = params[k];
        }
      }
      window.gtag('event', name, p);
    } catch (e) {}
  };
  function track(name, params) { window.wtnTrack(name, params); }

  /* Page identity, derived from the path the same way the reading and
     matching blocks below derive theirs. */
  var PATH = window.location.pathname;
  var mDoor = PATH.match(/\/doorways\/([a-z-]+)\.html$/);
  var mUnit = PATH.match(/\/units\/unit-(\d+)\.html$/);
  var UNIT_NO = mUnit ? parseInt(mUnit[1], 10) : null;

  if (mDoor && mDoor[1] !== 'index') {
    track('doorway_enter', { doorway: mDoor[1] });
    /* The stars doorway is a section inside the SBNR page. */
    if (mDoor[1] === 'sbnr' && window.location.hash === '#stars') {
      track('doorway_enter', { doorway: 'stars' });
    }
  }
  if (/(^|\/)community\.html$/.test(PATH)) track('community_view', {});

  /* Unit start / completion: start = the visitor's first real action
     on the unit (first micro-check or quiz answer, practice confirm);
     complete = the unit quiz fully answered AND the performed-practice
     box confirmed — the unit's own two completion halves. */
  var unitStarted = false;
  function unitStart() {
    if (!UNIT_NO || unitStarted) return;
    try {
      if (sessionStorage.getItem('wtn.ustart.' + UNIT_NO)) { unitStarted = true; return; }
      sessionStorage.setItem('wtn.ustart.' + UNIT_NO, '1');
    } catch (e) {}
    unitStarted = true;
    track('unit_start', { unit: UNIT_NO });
  }
  window.wtnUnitStart = unitStart;
  function scoreBand(pct) {
    return pct >= 90 ? '90-100' : pct >= 75 ? '75-89' : pct >= 50 ? '50-74'
      : pct >= 25 ? '25-49' : '0-24';
  }
  function unitQuizDone(quiz) {
    var a = (store().unitQuiz[quiz.id] || {}).answers || {};
    return Object.keys(a).length >= (quiz.questions || []).length;
  }
  function unitPracticeDone() {
    try {
      var all = JSON.parse(localStorage.getItem('wtn.unitpractice.v1')) || {};
      var suffix = new RegExp('#u' + UNIT_NO + '$');
      for (var k in all) { if (suffix.test(k) && all[k].done) return true; }
    } catch (e) {}
    return false;
  }
  var unitDoneFired = false;
  function unitMaybeComplete() {
    if (!UNIT_NO || unitDoneFired) return;
    var q = (PD.quizzes || []).filter(function (x) { return x.kind === 'unit'; })[0];
    if (q && unitQuizDone(q) && unitPracticeDone()) {
      unitDoneFired = true;
      track('unit_complete', { unit: UNIT_NO });
    }
  }
  window.wtnUnitPracticeChanged = unitMaybeComplete;

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
  /* Analytics: a rung counts as "lit" for the ladder_rung_lit event
     only when it lights DURING this visit — the set of rungs already
     lit when the page loaded is the baseline and fires nothing. */
  var litKnown = null;
  function trackLadder(st) {
    var lit = {};
    (PD.levels || []).forEach(function (info) {
      if (levelComplete(st, info.n)) lit[info.n] = true;
    });
    if (litKnown === null) { litKnown = lit; return; }
    var newly = Object.keys(lit).filter(function (n) { return !litKnown[n]; });
    newly.forEach(function (n) { track('ladder_rung_lit', { level: parseInt(n, 10) }); });
    litKnown = lit;
    if (newly.length && (PD.levels || []).length === 5 &&
        Object.keys(lit).length === 5) {
      track('journey_complete', {});
    }
  }
  function paintLadders() {
    var st = store();
    trackLadder(st);
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
    var quizDoneTracked = false;
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
          unitStart();
          if (!quizDoneTracked && unitQuizDone(quiz)) {
            quizDoneTracked = true;
            var ans = st2.unitQuiz[quiz.id].answers;
            var corr = 0;
            quiz.questions.forEach(function (qq, qj) {
              if (ans[qj] === qq.correct) corr++;
            });
            track('quiz_complete', {
              quiz_kind: 'unit', unit: UNIT_NO,
              score_band: scoreBand(Math.round(corr / quiz.questions.length * 100))
            });
            unitMaybeComplete();
          }
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
      track('quiz_complete', {
        quiz_kind: 'lesson', level: quiz.level, lesson: quiz.lesson,
        score_band: scoreBand(pct)
      });
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
      /* Analytics carries the topic's fixed CODE only (data-code on the
         option) — never the label, the email or the question text. */
      var topicSel = askForm.querySelector('[name="topic"]');
      var topicOpt = topicSel ? topicSel.options[topicSel.selectedIndex] : null;
      var topicCode = (topicOpt && topicOpt.getAttribute('data-code')) || 'general';
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
        track('ask_submit', { topic: topicCode });
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

  /* ---------- Thiqa handover clicks (analytics) ---------- */
  document.querySelectorAll('a[href^="https://thiqaacademy.com"]').forEach(function (a) {
    a.addEventListener('click', function () {
      var placement = 'other';
      if (a.closest('[data-ladder-top]')) placement = 'ladder_top';
      else if (a.closest('[data-arrival]')) placement = 'graduation';
      else if (PATH.indexOf('mushaf') !== -1) placement = 'mushaf_index';
      else if (PATH.indexOf('level-5') !== -1) placement = 'graduation';
      else if (/^\/(en\/)?index\.html$/.test(PATH) || PATH === '/' || PATH === '/en/') placement = 'parents';
      track('handover_click', { placement: placement });
    });
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
    /* Analytics session flag: set by stopAll, cleared by playIdx — so
       play-after-STOP counts as a new listening start (one more
       mushaf_play) while pause/resume stays the same session. */
    var stopped = false;
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
      var wasPlaying = state.playing;
      state.idx = idx;
      state.repeatLeft = times || repeatTimes();
      state.fellBack = false;
      state.playing = true;
      /* Analytics: one mushaf_play per listening START (a fresh press
         of play / an ayah tap from silence) — the auto-advance between
         ayahs keeps state.playing true and fires nothing. Categories
         only: surah number, reciter id, repeat setting. */
      if (!wasPlaying && window.wtnTrack) {
        window.wtnTrack('mushaf_play', {
          surah: parseInt(root.getAttribute("data-surah"), 10) || null,
          reciter: reciter.id,
          repeat: state.repeatLeft
        });
      }
      stopped = false;
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
      stopped = true;
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
      if (state.idx >= 0 && audio.src) {
        var p = audio.play(); if (p && p.catch) p.catch(handleError);
        state.playing = true; setHighlight();
        /* Play pressed after a STOP (not a pause): a new listening
           start — one mushaf_play, same categories as in playIdx. */
        if (stopped && window.wtnTrack) {
          window.wtnTrack('mushaf_play', {
            surah: parseInt(root.getAttribute("data-surah"), 10) || null,
            reciter: reciter.id,
            repeat: repeatTimes()
          });
        }
        stopped = false;
        return;
      }
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
        if (window.wtnUnitStart) window.wtnUnitStart();
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
  /* Also serves the doorway reveal cards (Law-2 Step 3, GAP 1), which
     carry their own generic show/hide chrome on the button
     (data-kp-show / data-kp-hide) instead of the terms' wording. */
  document.querySelectorAll('[data-kp-toggle]').forEach(function (btn) {
    var card = btn.closest('.kp-card');
    var body = card ? card.querySelector('.kp-body') : null;
    var state = btn.querySelector('.kp-state');
    if (!body) return;
    var showTxt = btn.getAttribute('data-kp-show') || S.kpShow || '';
    var hideTxt = btn.getAttribute('data-kp-hide') || S.kpHide || '';
    btn.addEventListener('click', function () {
      var open = body.hidden;
      body.hidden = !open;
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (state) state.textContent = open ? hideTxt : showTxt;
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

/* WayToNoor — matching drill (تدريب مطابقة): a shuffle-and-match
   exercise built EXCLUSIVELY from the page's own key-term card pairs,
   carried verbatim in #page-data as PD.terms (term / pronunciation /
   meaning — the exact inner HTML of the tap-to-reveal cards above it).
   No new terms, no new meanings, nothing authored here. Results live
   ONLY under their own store key 'wtn.match.v1': this block never
   reads or writes 'wtn.progress.v1' or 'wtn.reading.v1' and never
   dispatches 'wtn:progress', so quiz scores, micro-checks, reading
   progress and the ladder maths cannot be affected by it. */
(function () {
  'use strict';
  var KEY = 'wtn.match.v1';
  var box = document.querySelector('[data-matchdrill]');
  if (!box) return;
  var dataEl = document.getElementById('page-data');
  var PD = {};
  try { PD = dataEl ? JSON.parse(dataEl.textContent) : {}; } catch (e) { PD = {}; }
  var S = PD.strings || {};
  var terms = PD.terms || [];
  if (terms.length < 2) return;
  var path = window.location.pathname;

  function loadAll() {
    try { return JSON.parse(localStorage.getItem(KEY)) || {}; }
    catch (e) { return {}; }
  }
  function record(done) {
    var all = loadAll();
    all[path] = { done: !!done, total: terms.length };
    try { localStorage.setItem(KEY, JSON.stringify(all)); } catch (e) {}
  }
  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  var title = document.createElement('h3');
  title.textContent = S.matchTitle || '';
  var hint = document.createElement('p');
  hint.className = 'md-hint';
  hint.textContent = S.matchHint || '';
  var progress = document.createElement('p');
  progress.className = 'md-progress';
  var cols = document.createElement('div');
  cols.className = 'md-cols';
  var fb = document.createElement('div');
  fb.className = 'feedback';
  var again = document.createElement('button');
  again.type = 'button';
  again.className = 'btn btn-sand md-again';
  again.textContent = S.matchAgain || '';
  again.hidden = true;
  box.appendChild(title);
  box.appendChild(hint);
  box.appendChild(progress);
  box.appendChild(cols);
  box.appendChild(fb);
  box.appendChild(again);

  var selected = null;   // pair index of the currently selected term
  var matched = {};      // pair index -> true
  var matchedCount = 0;

  function paintProgress() {
    progress.textContent = (S.matchProgress || '')
      .replace('{done}', matchedCount).replace('{total}', terms.length);
  }

  function build() {
    selected = null;
    matched = {};
    matchedCount = 0;
    fb.textContent = '';
    fb.classList.remove('show');
    again.hidden = true;
    cols.innerHTML = '';
    var termCol = document.createElement('div');
    termCol.className = 'md-col';
    var meanCol = document.createElement('div');
    meanCol.className = 'md-col';
    terms.forEach(function (pair, i) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'md-item md-term';
      b.setAttribute('data-pair', i);
      b.setAttribute('aria-pressed', 'false');
      b.innerHTML = '<span class="kp-term">' + pair.t + '</span> ' +
                    '<span class="kp-pron">' + pair.p + '</span>';
      b.addEventListener('click', function () { pickTerm(i, b); });
      termCol.appendChild(b);
    });
    shuffle(terms.map(function (_p, i) { return i; })).forEach(function (i) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'md-item md-mean';
      b.setAttribute('data-pair', i);
      b.innerHTML = terms[i].m;
      b.addEventListener('click', function () { pickMeaning(i, b); });
      meanCol.appendChild(b);
    });
    cols.appendChild(termCol);
    cols.appendChild(meanCol);
    paintProgress();
  }

  function clearWrong() {
    cols.querySelectorAll('.md-item.wrong').forEach(function (el) {
      el.classList.remove('wrong');
    });
  }

  function pickTerm(i, btn) {
    if (matched[i]) return;
    clearWrong();
    selected = i;
    cols.querySelectorAll('.md-term').forEach(function (el) {
      var on = parseInt(el.getAttribute('data-pair'), 10) === i;
      el.classList.toggle('sel', on);
      el.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    if (btn) btn.classList.add('sel');
  }

  function pickMeaning(i, btn) {
    if (matched[i] || selected === null) return;
    clearWrong();
    if (i === selected) {
      matched[i] = true;
      matchedCount += 1;
      cols.querySelectorAll('[data-pair="' + i + '"]').forEach(function (el) {
        el.classList.add('matched');
        el.classList.remove('sel');
        el.disabled = true;
        el.setAttribute('aria-pressed', 'false');
      });
      selected = null;
      fb.textContent = '✓';
      fb.classList.add('show');
      paintProgress();
      if (matchedCount === terms.length) {
        fb.textContent = S.matchDone || '✓';
        record(true);
        again.hidden = false;
      }
    } else {
      btn.classList.add('wrong');
      fb.textContent = '✗';
      fb.classList.add('show');
    }
  }

  again.addEventListener('click', build);
  build();
})();

/* WayToNoor — unit practice box (Law-2 Step 3, GAP 4): the performed
   practice task on unit pages. The task text is the unit's own §9
   «one next step», verbatim, seated in the journey practice pattern
   (confirm checkbox + «how was it?» review field). State lives ONLY
   under its own store key 'wtn.unitpractice.v1': this block never
   reads or writes 'wtn.progress.v1', 'wtn.reading.v1' or
   'wtn.match.v1', never dispatches 'wtn:progress', and gates or
   unlocks nothing — quiz scores, micro-checks, reading progress,
   matching drills and the ladder maths cannot be affected by it. */
(function () {
  'use strict';
  var KEY = 'wtn.unitpractice.v1';
  var boxes = document.querySelectorAll('[data-unit-practice-box]');
  if (!boxes.length) return;
  var path = window.location.pathname;
  function loadAll() {
    try { return JSON.parse(localStorage.getItem(KEY)) || {}; }
    catch (e) { return {}; }
  }
  function saveAll(all) {
    try { localStorage.setItem(KEY, JSON.stringify(all)); } catch (e) {}
  }
  boxes.forEach(function (box) {
    var id = path + '#u' + box.getAttribute('data-unit');
    var cb = box.querySelector('input[type=checkbox][data-unit-practice]');
    var note = box.querySelector('input[type=text][data-unit-practice-note]');
    var tag = box.querySelector('[data-done-tag]');
    var entry = loadAll()[id] || {};
    if (cb) cb.checked = !!entry.done;
    if (note) note.value = entry.note || '';
    if (tag) tag.style.display = entry.done ? '' : 'none';
    if (cb) cb.addEventListener('change', function () {
      var all = loadAll();
      var e = all[id] || {};
      e.done = cb.checked;
      all[id] = e; saveAll(all);
      if (tag) tag.style.display = cb.checked ? '' : 'none';
      if (window.wtnUnitStart) window.wtnUnitStart();
      if (window.wtnUnitPracticeChanged) window.wtnUnitPracticeChanged();
    });
    if (note) note.addEventListener('change', function () {
      var all = loadAll();
      var e = all[id] || {};
      e.note = note.value;
      all[id] = e; saveAll(all);
    });
  });
})();
