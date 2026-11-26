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

  /* ---------- ask-a-human: anonymous entry that graduates to a name ---------- */
  var chatForm = document.querySelector('[data-chat-form]');
  if (chatForm) {
    var log = document.querySelector('[data-chat-log]');
    var input = chatForm.querySelector('input');
    var graduated = false;
    chatForm.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var text = (input.value || '').trim();
      if (!text) return;
      var mine = document.createElement('div'); mine.className = 'msg visitor'; mine.textContent = text;
      log.appendChild(mine); input.value = '';
      if (!graduated) {
        graduated = true;
        var sys = document.createElement('div'); sys.className = 'msg system';
        var tag = document.createElement('span'); tag.className = 'sys-tag'; tag.textContent = S.autoNoteTag;
        var body = document.createElement('span'); body.textContent = S.autoNoteBody;
        sys.appendChild(tag); sys.appendChild(body); log.appendChild(sys);
        var grad = document.querySelector('[data-graduate]');
        if (grad) grad.classList.add('show');
      }
      log.scrollTop = log.scrollHeight;
    });
    var gradForm = document.querySelector('[data-graduate-form]');
    if (gradForm) gradForm.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var done = document.querySelector('[data-graduate-done]');
      if (done) done.style.display = '';
      gradForm.querySelectorAll('input,select,textarea,button').forEach(function (el) { el.disabled = true; });
    });
  }

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
})();
