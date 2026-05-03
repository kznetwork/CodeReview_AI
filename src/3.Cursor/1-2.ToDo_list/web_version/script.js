/**
 * My Tasks — 클라이언트 단일 스크립트
 *
 * 역할 요약:
 * - localStorage 기반 영속화(디바운스 저장으로 입력·토글 폭주 완화)
 * - 정렬(생성일·카테고리·완료·수동) + 수동일 때만 HTML5 DnD
 * - JSON 보내기/가져오기(가져오기 전 백업 확인)
 * - 중복 경고, 삭제 Undo, 격언·완료율 응원 문구
 * - 접근성(ARIA, 라이브 영역, 다이얼로그 포커스 복귀)
 * - 키워드 기반 자동 카테고리(선택 시 제목 매칭 → 없으면 드롭다운)
 *
 * 엣지 케이스: localStorage 용량/비활성, 잘못된 가져오기 JSON, 빈 파일,
 * 대량 항목(100+)에서도 DocumentFragment·디바운스로 부담 완화
 */
(function () {
  "use strict";

  /* -------------------------------------------------------------------------- */
  /* 상수: 저장소 키·앱 버전·카테고리 정의                                        */
  /* -------------------------------------------------------------------------- */

  /** 메인 할 일 배열 저장 키 (v2 스키마 + sortIndex 선택 필드) */
  var STORAGE_KEY = "myTasks:v2";
  /** 필터(카테고리 탭) 기억 */
  var FILTER_STORAGE_KEY = "myTasks:filter:v1";
  /** 테마 */
  var THEME_STORAGE_KEY = "myTasks:theme:v1";
  /** 정렬 모드 기억 */
  var SORT_STORAGE_KEY = "myTasks:sortMode:v1";
  /** 키워드 자동 분류 켜기/끄기 */
  var AUTO_CATEGORY_STORAGE_KEY = "myTasks:autoCategory:v1";
  /** 가져오기 패키지에 넣을 스키마 버전(호환 판별용) */
  var EXPORT_VERSION = 3;

  var CATEGORIES = {
    work: { label: "업무", key: "work" },
    personal: { label: "개인", key: "personal" },
    study: { label: "공부", key: "study" },
  };

  var VALID_CATEGORY = { work: true, personal: true, study: true };

  /** 카테고리 정렬 시 고정 순서 */
  var CATEGORY_SORT_ORDER = ["work", "personal", "study"];

  /** Alt+숫자 필터 순서 */
  var FILTER_ORDER = ["all", "work", "personal", "study"];

  /**
   * 카테고리별 키워드(부분 문자열 일치, 긴 키워드 우선·동길이는 업무→개인→공부 순)
   * @type {Record<string, string[]>}
   */
  var CATEGORY_KEYWORDS = {
    work: [
      "deadline",
      "meeting",
      "project",
      "report",
      "slack",
      "teams",
      "zoom",
      "jira",
      "invoice",
      "회의",
      "미팅",
      "보고서",
      "리포트",
      "이메일",
      "메일",
      "업무",
      "제출",
      "마감",
      "프로젝트",
      "클라이언트",
      "고객",
      "출장",
      "회사",
      "영업",
      "계약",
      "청구",
      "ppt",
      "엑셀",
      "excel",
      "슬랙",
      "팀즈",
      "협업",
      "보고",
    ],
    personal: [
      "쇼핑",
      "장보기",
      "병원",
      "은행",
      "약속",
      "여행",
      "영화",
      "산책",
      "운동",
      "헬스",
      "집",
      "가족",
      "친구",
      "취미",
      "개인",
      "청소",
      "요리",
      "반려",
      "강아지",
      "고양이",
      "이발",
      "미용",
    ],
    study: [
      "homework",
      "ielts",
      "study",
      "toeic",
      "시험공부",
      "자격증",
      "토익",
      "공부",
      "시험",
      "과제",
      "강의",
      "수업",
      "독서",
      "영어",
      "수학",
      "국어",
      "과학",
      "논문",
      "복습",
      "예습",
      "책",
      "스터디",
      "학원",
      "강의노트",
    ],
  };

  /** @type {{ kw: string, category: string }[]} */
  var KEYWORD_ENTRIES = (function buildKeywordEntries() {
    var priority = { work: 0, personal: 1, study: 2 };
    var order = ["work", "personal", "study"];
    var entries = [];
    for (var oi = 0; oi < order.length; oi++) {
      var cat = order[oi];
      var arr = CATEGORY_KEYWORDS[cat] || [];
      for (var i = 0; i < arr.length; i++) {
        var kw = String(arr[i]).trim().toLowerCase();
        if (!kw) continue;
        entries.push({
          kw: kw,
          category: cat,
          len: kw.length,
          pri: priority[cat],
        });
      }
    }
    entries.sort(function (a, b) {
      if (b.len !== a.len) return b.len - a.len;
      return a.pri - b.pri;
    });
    return entries.map(function (e) {
      return { kw: e.kw, category: e.category };
    });
  })();

  /** 가져오기 파일 최대 길이(문자) — 메모리·성능 보호 */
  var IMPORT_MAX_CHARS = 5 * 1024 * 1024;

  /** 검색 입력 디바운스(ms) */
  var DEBOUNCE_SEARCH_MS = 220;
  /** 자동 분류 힌트 문구 디바운스(ms) */
  var DEBOUNCE_CATEGORY_HINT_MS = 200;
  /** 저장 디바운스(ms) */
  var DEBOUNCE_SAVE_MS = 280;
  /** Undo 유지 시간(ms) */
  var UNDO_MS = 8000;

  /** 오늘의 격언 풀(페이지 로드 시 무작위 1개 표시) */
  var QUOTES = [
    "작은 진전도 진전이다.",
    "오늘 할 수 있는 일을 내일로 미루지 마라. — 벤저민 프랭클린",
    "시작이 반이다.",
    "완벽을 추구하되, 시작을 두려워하지 마라.",
    "한 번에 한 걸음씩.",
    "집중은 재능이 아니라 선택이다.",
    "계획 없는 목표는 소원에 불과하다.",
    "기록은 기억을 이긴다.",
    "행동은 모든 성공의 기본 열쇠이다.",
    "꾸준함이 재능을 이긴다.",
    "오늘의 할 일을 오늘 끝내자.",
    "쉬운 길이 아니라, 의미 있는 길을 선택하라.",
    "작심삼일도 삼일은 한다.",
    "당신의 미래는 오늘의 선택에 달려 있다.",
    "천 리 길도 한 걸음부터.",
  ];

  /* -------------------------------------------------------------------------- */
  /* DOM 참조                                                                   */
  /* -------------------------------------------------------------------------- */

  var form = document.getElementById("task-form");
  var input = document.getElementById("task-input");
  var categorySelect = document.getElementById("task-category");
  var autoCategoryCheckbox = document.getElementById("auto-category");
  var autoCategoryHint = document.getElementById("task-category-hint");
  var listEl = document.getElementById("task-list");
  var filtersEl = document.getElementById("task-filters");
  var dashboardSummary = document.getElementById("dashboard-summary");
  var dashboardBarFill = document.getElementById("dashboard-bar-fill");
  var dashboardProgress = document.getElementById("dashboard-progress");
  var dashboardCategories = document.getElementById("dashboard-categories");
  var dashboardToday = document.getElementById("dashboard-today");
  var dailyQuoteEl = document.getElementById("daily-quote");
  var completionCheerEl = document.getElementById("completion-cheer");
  var themeToggle = document.getElementById("theme-toggle");
  var searchInput = document.getElementById("task-search");
  var remainingBadge = document.getElementById("remaining-badge");
  var btnClearCompleted = document.getElementById("btn-clear-completed");
  var dialogClear = document.getElementById("dialog-clear-completed");
  var dialogClearBody = document.getElementById("dialog-clear-body");
  var toastRegion = document.getElementById("toast-region");
  var toastRegionAssertive = document.getElementById("toast-region-assertive");
  var btnExportJson = document.getElementById("btn-export-json");
  var inputImportJson = document.getElementById("input-import-json");
  var sortToolbar = document.getElementById("sort-toolbar");
  var dialogImportBackup = document.getElementById("dialog-import-backup");
  var dialogImportBackupBody = document.getElementById("dialog-import-backup-body");
  var dialogDuplicate = document.getElementById("dialog-duplicate");
  var dialogDuplicateBody = document.getElementById("dialog-duplicate-body");
  var undoBar = document.getElementById("undo-bar");
  var undoBarText = document.getElementById("undo-bar-text");
  var undoBarBtn = document.getElementById("undo-bar-btn");

  /* -------------------------------------------------------------------------- */
  /* 런타임 상태                                                                 */
  /* -------------------------------------------------------------------------- */

  /** @type {"all"|"work"|"personal"|"study"} */
  var activeFilter = "all";

  /**
   * 할 일 객체: id, text, completed, createdAt, category 필수
   * sortIndex는 수동 정렬·일관 순서용(없으면 로드 시 보정)
   * @type {{ id: string, text: string, completed: boolean, createdAt: string, category: "work"|"personal"|"study", sortIndex?: number }[]}
   */
  var tasks = [];

  /** 검색어(디바운스 반영 후 실제 필터에 사용) */
  var searchQuery = "";
  /** 입력창의 즉시 값(디바운스 대기 중 표시용으로는 사용하지 않음) */
  var searchInputPending = "";

  /** @type {"created"|"category"|"completed"|"manual"} */
  var sortMode = "completed";

  /** @type {string|null} */
  var editingTaskId = null;
  /** @type {string|null} */
  var lastAddedTaskId = null;
  /** @type {string|null} */
  var completeSlideTaskId = null;
  /** @type {Record<string, boolean>} */
  var pendingRemoveIds = {};
  /** @type {number|null} */
  var toastTimer = null;
  /** @type {number|null} */
  var toastAssertiveTimer = null;
  /** @type {number|null} */
  var lastRemainingCount = null;

  /** 디바운스 타이머 */
  var saveTimer = null;
  var searchDebounceTimer = null;
  /** render 중첩 방지(드래그 등) */
  var renderScheduled = false;

  /** 가져오기 대기(파싱 성공 후 사용자 확인 대기) */
  var pendingImportTasks = null;

  /** 중복 추가 대기(다이얼로그 결과) */
  var duplicatePending = null;

  /** DnD 중 드래그 중인 id */
  var dragId = null;
  /** DnD 시각 하이라이트 대상 */
  var dragOverId = null;

  /**
   * Undo 한 건만 유지(가장 최근 삭제)
   * @type {{ task: object, insertIndex: number, timerId: number }|null}
   */
  var undoState = null;

  /** 다이얼로그 닫힌 뒤 포커스 복귀 요소 */
  var focusReturnEl = null;

  /* -------------------------------------------------------------------------- */
  /* 유틸: 디바운스 / 안전 JSON /보내기 파일명                               */
  /* -------------------------------------------------------------------------- */

  /**
   * 선행·후행 공백 제거 후 소문자로 비교용 정규화(중복 검사)
   * @param {string} s
   */
  function normalizeForDuplicate(s) {
    return String(s || "")
      .trim()
      .replace(/\s+/g, " ")
      .toLowerCase();
  }

  /**
   * 간단 디바운스(타이머 재설정)
   * @param {function(): void} fn
   * @param {number} wait
   * @returns {function(): void}
   */
  function debounce(fn, wait) {
    var t = null;
    return function () {
      if (t) window.clearTimeout(t);
      t = window.setTimeout(function () {
        t = null;
        fn();
      }, wait);
    };
  }

  function randomQuote() {
    var i = Math.floor(Math.random() * QUOTES.length);
    return QUOTES[i] || QUOTES[0];
  }

  function cheerForPercent(pct) {
    if (pct <= 0) return "천천히 시작해도 괜찮아요. 한 가지부터 해볼까요?";
    if (pct < 26) return "좋은 시작이에요. 조금씩 쌓이면 큰 변화가 됩니다.";
    if (pct < 51) return "절반 가까이 왔어요. 리듬을 유지해봐요!";
    if (pct < 76) return "거의 다 왔어요. 마무리까지 힘내볼까요?";
    if (pct < 100) return "마지막 한 걸음이에요. 끝이 보입니다!";
    return "완료율 100%! 정말 대단해요.";
  }

  /* -------------------------------------------------------------------------- */
  /* 필터 / 테마 / 정렬 로드·저장                                               */
  /* -------------------------------------------------------------------------- */

  function loadFilter() {
    try {
      var raw = localStorage.getItem(FILTER_STORAGE_KEY);
      if (!raw) return "all";
      var parsed = JSON.parse(raw);
      if (parsed === "all" || VALID_CATEGORY[parsed]) return parsed;
    } catch (e) {}
    return "all";
  }

  function saveFilter() {
    try {
      localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(activeFilter));
    } catch (e) {
      showToast("필터 설정을 저장하지 못했습니다.", "error", true);
    }
  }

  function loadTheme() {
    try {
      var t = localStorage.getItem(THEME_STORAGE_KEY);
      if (t === "dark" || t === "light") return t;
    } catch (e) {}
    return "light";
  }

  function saveTheme(theme) {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch (e) {}
  }

  /**
   * @returns {"created"|"category"|"completed"|"manual"}
   */
  function loadSortMode() {
    try {
      var raw = localStorage.getItem(SORT_STORAGE_KEY);
      if (!raw) return "completed";
      var v = JSON.parse(raw);
      if (v === "created" || v === "category" || v === "completed" || v === "manual") return v;
    } catch (e) {}
    return "completed";
  }

  function saveSortMode() {
    try {
      localStorage.setItem(SORT_STORAGE_KEY, JSON.stringify(sortMode));
    } catch (e) {
      showToast("정렬 설정을 저장하지 못했습니다.", "error", true);
    }
  }

  function loadAutoCategoryEnabled() {
    try {
      var raw = localStorage.getItem(AUTO_CATEGORY_STORAGE_KEY);
      if (raw === null || raw === "") return true;
      return JSON.parse(raw) === true;
    } catch (e) {}
    return true;
  }

  function saveAutoCategoryEnabled(on) {
    try {
      localStorage.setItem(AUTO_CATEGORY_STORAGE_KEY, JSON.stringify(!!on));
    } catch (e) {}
  }

  /**
   * 제목 부분 문자열로 매칭되는 카테고리 (없으면 null)
   * @param {string} text
   * @returns {"work"|"personal"|"study"|null}
   */
  function detectCategoryFromKeywords(text) {
    var hay = String(text || "").toLowerCase();
    if (!hay) return null;
    for (var i = 0; i < KEYWORD_ENTRIES.length; i++) {
      if (hay.indexOf(KEYWORD_ENTRIES[i].kw) !== -1) {
        return KEYWORD_ENTRIES[i].category;
      }
    }
    return null;
  }

  /**
   * 새 항목 추가 시 적용할 카테고리 (자동 분류가 꺼져 있으면 드롭다운 값만 사용)
   * @param {string} rawText
   */
  function resolveCategoryForNewTask(rawText) {
    var sel =
      categorySelect && typeof categorySelect.value === "string" && VALID_CATEGORY[categorySelect.value]
        ? categorySelect.value
        : "work";
    if (!autoCategoryCheckbox || !autoCategoryCheckbox.checked) return sel;
    var trimmed = String(rawText || "").trim();
    if (!trimmed) return sel;
    var guess = detectCategoryFromKeywords(trimmed);
    return guess || sel;
  }

  function syncAutoCategoryHint() {
    if (!autoCategoryHint) return;
    if (!autoCategoryCheckbox || !autoCategoryCheckbox.checked) {
      autoCategoryHint.textContent = "";
      autoCategoryHint.setAttribute("hidden", "hidden");
      return;
    }
    var trimmed = input ? String(input.value || "").trim() : "";
    if (!trimmed) {
      autoCategoryHint.textContent = "할 일을 입력하면 키워드 추천이 표시됩니다.";
      autoCategoryHint.removeAttribute("hidden");
      return;
    }
    var guess = detectCategoryFromKeywords(trimmed);
    autoCategoryHint.removeAttribute("hidden");
    if (guess && CATEGORIES[guess]) {
      autoCategoryHint.textContent = "추천: " + CATEGORIES[guess].label;
    } else {
      var sel =
        categorySelect && VALID_CATEGORY[categorySelect.value] ? categorySelect.value : "work";
      autoCategoryHint.textContent =
        "키워드 없음 · " + CATEGORIES[sel].label + " 카테고리로 추가됩니다.";
    }
  }

  function applyTheme(theme) {
    if (theme === "dark") {
      document.documentElement.setAttribute("data-theme", "dark");
    } else {
      document.documentElement.removeAttribute("data-theme");
    }
    if (themeToggle) themeToggle.checked = theme === "dark";
  }

  function toggleTheme() {
    var next =
      document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
    applyTheme(next);
    saveTheme(next);
    showToast(next === "dark" ? "다크 모드로 전환했습니다." : "라이트 모드로 전환했습니다.", "info");
  }

  function syncFilterButtons() {
    if (!filtersEl) return;
    var buttons = filtersEl.querySelectorAll(".task-filter__btn");
    for (var i = 0; i < buttons.length; i++) {
      var btn = buttons[i];
      var f = btn.getAttribute("data-filter");
      var on = f === activeFilter;
      btn.classList.toggle("task-filter__btn--active", on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
    }
  }

  function syncSortButtons() {
    if (!sortToolbar) return;
    var buttons = sortToolbar.querySelectorAll(".sort-toolbar__btn");
    for (var i = 0; i < buttons.length; i++) {
      var b = buttons[i];
      var sm = b.getAttribute("data-sort");
      var on = sm === sortMode;
      b.classList.toggle("sort-toolbar__btn--active", on);
      b.setAttribute("aria-checked", on ? "true" : "false");
    }
  }

  /* -------------------------------------------------------------------------- */
  /* 할 일 로드·마이그레이션·sortIndex 보정                                     */
  /* -------------------------------------------------------------------------- */

  function tryMigrateV1() {
    try {
      var raw = localStorage.getItem("myTasks:v1");
      if (!raw) return [];
      var parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      var migrated = parsed
        .filter(function (t) {
          return (
            t &&
            typeof t.id === "string" &&
            typeof t.text === "string" &&
            typeof t.completed === "boolean" &&
            typeof t.createdAt === "string"
          );
        })
        .map(function (t, idx) {
          return {
            id: t.id,
            text: t.text,
            completed: t.completed,
            createdAt: t.createdAt,
            category: "work",
            sortIndex: idx,
          };
        });
      if (migrated.length) {
        tasks = migrated;
        ensureSortIndices();
        flushSaveTasks();
      }
      return migrated;
    } catch (e) {
      return [];
    }
  }

  /**
   * 저장소에서 단일 할 일 객체 정규화
   * @param {*} t
   * @param {number} fallbackIndex
   */
  function normalizeTaskRow(t, fallbackIndex) {
    if (
      !t ||
      typeof t.id !== "string" ||
      typeof t.text !== "string" ||
      typeof t.completed !== "boolean" ||
      typeof t.createdAt !== "string"
    ) {
      return null;
    }
    var cat =
      typeof t.category === "string" && VALID_CATEGORY[t.category] ? t.category : "work";
    var si =
      typeof t.sortIndex === "number" && !isNaN(t.sortIndex) ? t.sortIndex : fallbackIndex;
    return {
      id: t.id,
      text: t.text,
      completed: t.completed,
      createdAt: t.createdAt,
      category: cat,
      sortIndex: si,
    };
  }

  function loadTasks() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return tryMigrateV1();
      var parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      var out = [];
      for (var i = 0; i < parsed.length; i++) {
        var row = normalizeTaskRow(parsed[i], i);
        if (row) out.push(row);
      }
      return out;
    } catch (e) {
      showToast("저장된 데이터를 읽는 데 실패했습니다. 빈 목록으로 시작합니다.", "error", true);
      return [];
    }
  }

  /**
   * 모든 항목에 sortIndex 부여(누락·NaN 방지)
   */
  function ensureSortIndices() {
    var sorted = tasks
      .slice()
      .sort(function (a, b) {
        var ai = typeof a.sortIndex === "number" ? a.sortIndex : 1e12;
        var bi = typeof b.sortIndex === "number" ? b.sortIndex : 1e12;
        if (ai !== bi) return ai - bi;
        return new Date(a.createdAt) - new Date(b.createdAt);
      });
    for (var i = 0; i < sorted.length; i++) {
      sorted[i].sortIndex = i;
    }
  }

  /* -------------------------------------------------------------------------- */
  /* 저장: 즉시/디바운스 + beforeunload 플러시                                   */
  /* -------------------------------------------------------------------------- */

  function saveTasksImmediate() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
    } catch (e) {
      if (e && (e.name === "QuotaExceededError" || e.code === 22)) {
        showToast("저장 공간이 부족합니다. 항목을 줄이거나보낸 뒤 정리해 주세요.", "error", true);
      } else {
        showToast("저장에 실패했습니다. 개인정보 보호 모드 등 환경을 확인해 주세요.", "error", true);
      }
    }
  }

  function flushSaveTasks() {
    if (saveTimer) {
      window.clearTimeout(saveTimer);
      saveTimer = null;
    }
    saveTasksImmediate();
  }

  function saveTasks() {
    if (saveTimer) window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(function () {
      saveTimer = null;
      saveTasksImmediate();
    }, DEBOUNCE_SAVE_MS);
  }

  window.addEventListener("beforeunload", function () {
    flushSaveTasks();
  });

  function generateId() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return String(Date.now()) + "-" + String(Math.random()).slice(2, 10);
  }

  function formatRelativeTime(isoString) {
    var created = new Date(isoString).getTime();
    var now = Date.now();
    var diffMs = now - created;
    if (diffMs < 0) diffMs = 0;
    var sec = Math.floor(diffMs / 1000);
    if (sec < 60) return "방금 전";
    var min = Math.floor(sec / 60);
    if (min < 60) return min + "분 전";
    var hr = Math.floor(min / 60);
    if (hr < 24) return hr + "시간 전";
    var day = Math.floor(hr / 24);
    if (day < 7) return day + "일 전";
    var week = Math.floor(day / 7);
    if (week < 5) return week + "주 전";
    var month = Math.floor(day / 30);
    if (month < 12) return month + "개월 전";
    var year = Math.floor(day / 365);
    return year + "년 전";
  }

  /**
   * 화면에 표시할 정렬(모드별 1차·2차 기준 상이)
   * @param {{ id: string, text: string, completed: boolean, createdAt: string, category: string, sortIndex?: number }[]} arr
   */
  function sortTasksForDisplay(arr) {
    var slice = arr.slice();
    if (sortMode === "created") {
      slice.sort(function (a, b) {
        var cmp = new Date(a.createdAt) - new Date(b.createdAt);
        if (cmp !== 0) return cmp;
        if (a.completed !== b.completed) return a.completed ? 1 : -1;
        return String(a.id).localeCompare(String(b.id));
      });
      return slice;
    }
    if (sortMode === "category") {
      slice.sort(function (a, b) {
        var ia = CATEGORY_SORT_ORDER.indexOf(a.category);
        var ib = CATEGORY_SORT_ORDER.indexOf(b.category);
        if (ia !== ib) return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
        var cmp = new Date(a.createdAt) - new Date(b.createdAt);
        if (cmp !== 0) return cmp;
        return String(a.id).localeCompare(String(b.id));
      });
      return slice;
    }
    if (sortMode === "completed") {
      slice.sort(function (a, b) {
        if (a.completed !== b.completed) return a.completed ? 1 : -1;
        var cmp = new Date(a.createdAt) - new Date(b.createdAt);
        if (cmp !== 0) return cmp;
        return String(a.id).localeCompare(String(b.id));
      });
      return slice;
    }
    /* manual */
    slice.sort(function (a, b) {
      var ai = typeof a.sortIndex === "number" && !isNaN(a.sortIndex) ? a.sortIndex : 1e12;
      var bi = typeof b.sortIndex === "number" && !isNaN(b.sortIndex) ? b.sortIndex : 1e12;
      if (ai !== bi) return ai - bi;
      var cmp = new Date(a.createdAt) - new Date(b.createdAt);
      if (cmp !== 0) return cmp;
      return String(a.id).localeCompare(String(b.id));
    });
    return slice;
  }

  function getFilteredTasks() {
    if (activeFilter === "all") return tasks.slice();
    return tasks.filter(function (t) {
      return t.category === activeFilter;
    });
  }

  function normalizeSearch(q) {
    return String(q || "")
      .trim()
      .toLowerCase();
  }

  function taskMatchesSearch(task, q) {
    if (!q) return true;
    return String(task.text).toLowerCase().indexOf(q) !== -1;
  }

  function getTasksForList() {
    var q = normalizeSearch(searchQuery);
    return getFilteredTasks().filter(function (t) {
      return taskMatchesSearch(t, q);
    });
  }

  function countRemainingInFilter() {
    return getFilteredTasks().filter(function (t) {
      return !t.completed;
    }).length;
  }

  function countCompletedAll() {
    return tasks.filter(function (t) {
      return t.completed;
    }).length;
  }

  function updateRemainingBadge() {
    if (!remainingBadge) return;
    var n = countRemainingInFilter();
    var label =
      activeFilter === "all"
        ? "전체"
        : CATEGORIES[activeFilter]
        ? CATEGORIES[activeFilter].label
        : "";
    remainingBadge.textContent = "남은 할 일 " + n + "개" + (label ? " · " + label : "");
    if (lastRemainingCount !== n) {
      lastRemainingCount = n;
      remainingBadge.classList.remove("remaining-badge--pulse");
      void remainingBadge.offsetWidth;
      remainingBadge.classList.add("remaining-badge--pulse");
    }
  }

  function updateClearCompletedButton() {
    if (!btnClearCompleted) return;
    var n = countCompletedAll();
    btnClearCompleted.disabled = n === 0;
    btnClearCompleted.setAttribute("aria-disabled", n === 0 ? "true" : "false");
  }

  /**
   * @param {string} message
   * @param {"success"|"info"|"error"|"warning"} [kind]
   * @param {boolean} [assertive] 스크린리더 즉시 알림
   */
  function showToast(message, kind, assertive) {
    var region = assertive && toastRegionAssertive ? toastRegionAssertive : toastRegion;
    if (!region || !message) return;
    if (assertive) {
      if (toastAssertiveTimer) {
        window.clearTimeout(toastAssertiveTimer);
        toastAssertiveTimer = null;
      }
    } else {
      if (toastTimer) {
        window.clearTimeout(toastTimer);
        toastTimer = null;
      }
    }
    region.innerHTML = "";
    var el = document.createElement("div");
    var cls = "toast";
    if (kind === "success") cls += " toast--success";
    else if (kind === "info") cls += " toast--info";
    else if (kind === "error") cls += " toast--error";
    else if (kind === "warning") cls += " toast--warning";
    el.className = cls;
    el.setAttribute("role", assertive ? "alert" : "status");
    el.textContent = message;
    region.appendChild(el);
    var t = window.setTimeout(function () {
      if (region.firstChild === el) region.removeChild(el);
      if (assertive) toastAssertiveTimer = null;
      else toastTimer = null;
    }, assertive ? 5000 : 3200);
    if (assertive) toastAssertiveTimer = t;
    else toastTimer = t;
  }

  function startOfTodayLocal() {
    var d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }

  function endOfTodayLocal() {
    var d = new Date();
    d.setHours(23, 59, 59, 999);
    return d.getTime();
  }

  function countTasksAddedToday(statTasks) {
    var start = startOfTodayLocal();
    var end = endOfTodayLocal();
    return statTasks.filter(function (t) {
      var ts = new Date(t.createdAt).getTime();
      return ts >= start && ts <= end;
    }).length;
  }

  function getTasksForStats() {
    return tasks.filter(function (t) {
      return !pendingRemoveIds[t.id];
    });
  }

  /**
   * 완료율 응원 문구만 갱신(대시보드와 연동). 격언은 하루·세션 단위로 별도 초기화.
   * @param {number} pct
   */
  function updateCheerOnly(pct) {
    if (completionCheerEl) {
      completionCheerEl.textContent = cheerForPercent(pct);
    }
  }

  /**
   * "오늘의 격언": 날짜 키로 한 번만 고정(같은 날 재방문 시 동일 문구, 새 날이면 새 랜덤)
   */
  function initDailyQuote() {
    if (!dailyQuoteEl) return;
    var dayKey = "";
    try {
      var d = new Date();
      dayKey = d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate();
    } catch (e) {
      dayKey = "fallback";
    }
    var storageKey = "myTasks:quoteDay:v1";
    try {
      var raw = sessionStorage.getItem(storageKey);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed && parsed.day === dayKey && parsed.text) {
          dailyQuoteEl.textContent = parsed.text;
          return;
        }
      }
    } catch (e) {}
    var pick = randomQuote();
    try {
      sessionStorage.setItem(storageKey, JSON.stringify({ day: dayKey, text: pick }));
    } catch (e) {}
    dailyQuoteEl.textContent = pick;
  }

  function updateDashboard() {
    var statTasks = getTasksForStats();
    var total = statTasks.length;
    var completed = statTasks.filter(function (t) {
      return t.completed;
    }).length;
    var pct = total ? Math.round((completed / total) * 100) : 0;

    dashboardSummary.textContent =
      total === 0 ? "할 일이 없습니다." : completed + "/" + total + " 완료 (" + pct + "%)";

    dashboardBarFill.style.width = pct + "%";
    dashboardProgress.setAttribute("aria-valuenow", String(pct));
    dashboardProgress.setAttribute("aria-valuetext", completed + "/" + total + " 완료 (" + pct + "%)");

    updateCheerOnly(pct);

    dashboardCategories.innerHTML = "";
    var catKeys = ["work", "personal", "study"];
    catKeys.forEach(function (key) {
      var def = CATEGORIES[key];
      var inCat = statTasks.filter(function (t) {
        return t.category === key;
      });
      var done = inCat.filter(function (t) {
        return t.completed;
      }).length;
      var cTotal = inCat.length;
      var cPct = cTotal ? Math.round((done / cTotal) * 100) : 0;

      var row = document.createElement("div");
      row.className = "dashboard__cat-row";

      var lbl = document.createElement("span");
      lbl.className = "dashboard__cat-label";
      lbl.textContent = def.label;

      var stat = document.createElement("span");
      stat.className = "dashboard__cat-stat";
      stat.textContent = done + "/" + cTotal;

      var track = document.createElement("div");
      track.className = "dashboard__cat-bar-track";
      var fill = document.createElement("div");
      fill.className = "dashboard__cat-bar-fill dashboard__cat-bar-fill--" + key;
      fill.style.width = cPct + "%";

      track.appendChild(fill);
      row.appendChild(lbl);
      row.appendChild(stat);
      row.appendChild(track);
      dashboardCategories.appendChild(row);
    });

    var todayN = countTasksAddedToday(statTasks);
    dashboardToday.textContent = "오늘 추가된 할 일: " + todayN + "개";
  }

  function clearUndoTimer() {
    if (undoState && undoState.timerId) {
      window.clearTimeout(undoState.timerId);
      undoState.timerId = null;
    }
  }

  function hideUndoBar() {
    clearUndoTimer();
    undoState = null;
    if (undoBar) {
      undoBar.hidden = true;
      undoBar.setAttribute("aria-hidden", "true");
    }
  }

  /**
   * 삭제 직전 호출: 복구 스냅샷 예약
   */
  function registerUndo(task, insertIndex) {
    clearUndoTimer();
    undoState = {
      task: {
        id: task.id,
        text: task.text,
        completed: task.completed,
        createdAt: task.createdAt,
        category: task.category,
        sortIndex: typeof task.sortIndex === "number" ? task.sortIndex : insertIndex,
      },
      insertIndex: Math.max(0, Math.min(insertIndex, tasks.length)),
      timerId: null,
    };
    if (undoBar && undoBarText) {
      undoBar.hidden = false;
      undoBar.removeAttribute("aria-hidden");
      undoBarText.textContent = "항목을 삭제했습니다. 실행 취소할 수 있습니다.";
    }
    undoState.timerId = window.setTimeout(function () {
      hideUndoBar();
    }, UNDO_MS);
  }

  function performUndo() {
    if (!undoState || !undoState.task) {
      hideUndoBar();
      return;
    }
    var t = undoState.task;
    var idx = undoState.insertIndex;
    if (tasks.some(function (x) { return x.id === t.id; })) {
      hideUndoBar();
      showToast("이미 목록에 있는 항목은 되돌릴 수 없습니다.", "info");
      return;
    }
    var next = tasks.slice();
    var at = Math.min(idx, next.length);
    next.splice(at, 0, t);
    tasks = next;
    ensureSortIndices();
    flushSaveTasks();
    hideUndoBar();
    render();
    showToast("삭제를 실행 취소했습니다.", "success");
    announceToScreenReader("삭제가 취소되어 항목이 복구되었습니다.");
  }

  function announceToScreenReader(msg) {
    showToast(msg, "info", true);
  }

  function cancelEdit() {
    editingTaskId = null;
    render();
  }

  function commitEdit() {
    if (!editingTaskId) return;
    var id = editingTaskId;
    var li = listEl.querySelector('[data-id="' + id + '"]');
    if (!li) {
      editingTaskId = null;
      render();
      return;
    }
    var inp = li.querySelector(".task-item__edit-input");
    var sel = li.querySelector(".task-item__edit-select");
    if (!inp || !sel) {
      editingTaskId = null;
      render();
      return;
    }
    var text = inp.value.trim();
    if (!text) {
      cancelEdit();
      return;
    }
    var cat =
      typeof sel.value === "string" && VALID_CATEGORY[sel.value] ? sel.value : "work";
    var dup = findDuplicateTask(text, id);
    if (dup) {
      duplicatePending = {
        mode: "edit",
        id: id,
        text: text,
        category: cat,
      };
      if (dialogDuplicateBody) {
        dialogDuplicateBody.textContent =
          "「" + dup.text + "」와(과) 동일한 할 일이 있습니다. 그래도 수정할까요?";
      }
      focusReturnEl = inp;
      if (typeof dialogDuplicate.showModal === "function") {
        dialogDuplicate.showModal();
      } else {
        if (window.confirm(dialogDuplicateBody.textContent)) {
          duplicatePending = null;
          editingTaskId = null;
          updateTask(id, { text: text, category: cat });
          showToast("할 일을 수정했습니다.", "success");
        } else {
          duplicatePending = null;
        }
      }
      return;
    }
    editingTaskId = null;
    updateTask(id, { text: text, category: cat });
    showToast("할 일을 수정했습니다.", "success");
  }

  function startEdit(id) {
    var t = null;
    for (var i = 0; i < tasks.length; i++) {
      if (tasks[i].id === id) {
        t = tasks[i];
        break;
      }
    }
    if (!t || t.completed) return;
    editingTaskId = id;
    render();
  }

  function updateTask(id, updates) {
    tasks = tasks.map(function (t) {
      if (t.id !== id) return t;
      var nextText = updates.text !== undefined ? String(updates.text).trim() : t.text;
      var nextCat =
        updates.category !== undefined &&
        typeof updates.category === "string" &&
        VALID_CATEGORY[updates.category]
          ? updates.category
          : t.category;
      return {
        id: t.id,
        text: nextText,
        completed: updates.completed !== undefined ? updates.completed : t.completed,
        createdAt: t.createdAt,
        category: nextCat,
        sortIndex: typeof t.sortIndex === "number" ? t.sortIndex : undefined,
      };
    });
    ensureSortIndices();
    saveTasks();
    render();
  }

  /**
   * 동일 문구(공백·대소문자 무시) 탐색
   * @param {string} text
   * @param {string|null} excludeId 편집 중 자기 자신 제외
   */
  function findDuplicateTask(text, excludeId) {
    var n = normalizeForDuplicate(text);
    if (!n) return null;
    for (var i = 0; i < tasks.length; i++) {
      if (excludeId && tasks[i].id === excludeId) continue;
      if (normalizeForDuplicate(tasks[i].text) === n) return tasks[i];
    }
    return null;
  }

  /**
   * DnD 허용: 수동 정렬 + 전체 필터 + 검색 비어 있음 + 편집 아님
   */
  function isDragSortEnabled() {
    return (
      sortMode === "manual" &&
      activeFilter === "all" &&
      !normalizeSearch(searchQuery) &&
      !editingTaskId
    );
  }

  function buildTaskElement(task) {
    var cat = CATEGORIES[task.category] || CATEGORIES.work;
    var isEditing = editingTaskId === task.id;
    var dragEnabled = isDragSortEnabled() && !task.completed;

    var li = document.createElement("li");
    li.className = "task-item" + (task.completed ? " task-item--completed" : "");
    li.dataset.id = task.id;
    li.setAttribute("role", "listitem");
    if (task.id === lastAddedTaskId) li.classList.add("task-item--enter");
    if (task.id === completeSlideTaskId) li.classList.add("task-item--complete-slide");
    if (dragId === task.id) li.classList.add("task-item--dragging");
    if (dragOverId === task.id && dragId && dragId !== task.id) {
      li.classList.add("task-item--drag-over");
    }

    var a11yLabel =
      (task.completed ? "완료됨, " : "미완료, ") +
      cat.label +
      ", " +
      task.text +
      ", 생성 " +
      formatRelativeTime(task.createdAt);
    li.setAttribute("aria-label", a11yLabel);

    var checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "task-item__checkbox";
    checkbox.checked = task.completed;
    checkbox.setAttribute("aria-label", task.text + " 완료 표시");
    checkbox.disabled = isEditing;
    checkbox.addEventListener("change", function () {
      toggleComplete(task.id, checkbox.checked);
    });

    var dragHandle = null;
    if (sortMode === "manual") {
      dragHandle = document.createElement("span");
      dragHandle.className = "task-item__drag";
      dragHandle.textContent = "⋮⋮";
      dragHandle.setAttribute("role", "button");
      dragHandle.setAttribute("tabindex", dragEnabled ? "0" : "-1");
      dragHandle.dataset.taskId = task.id;
      dragHandle.setAttribute(
        "aria-label",
        dragEnabled
          ? "순서 변경: 끌어 놓기 또는 Alt+화살표"
          : "순서 변경은 전체 필터·검색 없음에서만 가능"
      );
      if (dragEnabled) {
        dragHandle.setAttribute("draggable", "true");
      } else {
        dragHandle.setAttribute("draggable", "false");
      }
      dragHandle.addEventListener("keydown", function (e) {
        if (!dragEnabled) return;
        if (e.key === "ArrowUp" && e.altKey) {
          e.preventDefault();
          moveTaskByKeyboard(task.id, -1);
        } else if (e.key === "ArrowDown" && e.altKey) {
          e.preventDefault();
          moveTaskByKeyboard(task.id, 1);
        }
      });
    }

    var body = document.createElement("div");
    body.className = "task-item__body";

    var row = document.createElement("div");
    row.className = "task-item__row" + (isEditing ? " task-item__row--edit" : "");

    if (isEditing) {
      var editSelect = document.createElement("select");
      editSelect.className = "task-item__edit-select";
      editSelect.setAttribute("aria-label", "카테고리");
      ["work", "personal", "study"].forEach(function (k) {
        var opt = document.createElement("option");
        opt.value = k;
        opt.textContent = CATEGORIES[k].label;
        if (k === task.category) opt.selected = true;
        editSelect.appendChild(opt);
      });

      var editInput = document.createElement("input");
      editInput.type = "text";
      editInput.className = "task-item__edit-input";
      editInput.value = task.text;
      editInput.maxLength = 500;
      editInput.setAttribute("aria-label", "할 일 수정");
      editInput.addEventListener("keydown", function (e) {
        if (e.key === "Enter") {
          e.preventDefault();
          commitEdit();
        } else if (e.key === "Escape") {
          e.preventDefault();
          cancelEdit();
        }
      });
      editSelect.addEventListener("keydown", function (e) {
        if (e.key === "Escape") {
          e.preventDefault();
          cancelEdit();
        } else if (e.key === "Enter") {
          e.preventDefault();
          commitEdit();
        }
      });

      row.appendChild(editSelect);
      row.appendChild(editInput);
    } else {
      var tag = document.createElement("span");
      tag.className = "task-item__tag task-item__tag--" + task.category;
      tag.textContent = cat.label;
      tag.setAttribute("aria-hidden", "true");

      var span = document.createElement("span");
      span.className = "task-item__text" + (task.completed ? " task-item__text--done" : "");
      span.textContent = task.text;
      span.title = "더블클릭하여 수정";
      if (!task.completed) {
        span.addEventListener("dblclick", function (e) {
          e.preventDefault();
          startEdit(task.id);
        });
      }

      row.appendChild(tag);
      row.appendChild(span);
    }

    var meta = document.createElement("div");
    meta.className = "task-item__meta";
    var timeEl = document.createElement("time");
    timeEl.className = "task-item__time";
    timeEl.dateTime = task.createdAt;
    timeEl.textContent = formatRelativeTime(task.createdAt);
    meta.appendChild(timeEl);

    body.appendChild(row);
    body.appendChild(meta);

    var delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "task-item__delete";
    delBtn.setAttribute("aria-label", task.text + " 삭제");
    delBtn.textContent = "×";
    delBtn.addEventListener("click", function () {
      if (editingTaskId === task.id) editingTaskId = null;
      removeTask(task.id);
    });

    if (dragHandle) li.appendChild(dragHandle);
    li.appendChild(checkbox);
    li.appendChild(body);
    li.appendChild(delBtn);

    if (dragEnabled && dragHandle) {
      dragHandle.addEventListener("dragstart", onHandleDragStart);
      dragHandle.addEventListener("dragend", onHandleDragEnd);
    }
    if (sortMode === "manual") {
      li.addEventListener("dragover", onTaskDragOver);
      li.addEventListener("drop", onTaskDrop);
    }

    if (isEditing) {
      window.requestAnimationFrame(function () {
        var toFocus = li.querySelector(".task-item__edit-input");
        if (toFocus) {
          toFocus.focus();
          toFocus.select();
        }
      });
    }

    return li;
  }

  function onHandleDragStart(e) {
    if (!isDragSortEnabled()) {
      e.preventDefault();
      return;
    }
    var handle = e.currentTarget;
    var id = handle.getAttribute("data-task-id");
    if (!id) return;
    dragId = id;
    try {
      e.dataTransfer.setData("text/plain", id);
      e.dataTransfer.effectAllowed = "move";
    } catch (err) {}
    var li = handle.closest ? handle.closest(".task-item") : null;
    if (li) li.classList.add("task-item--dragging");
  }

  /**
   * 드래그 중 삽입 위치 하이라이트만 갱신(전체 render 금지: 드래그 세션이 끊김)
   */
  function clearDragOverHighlight() {
    if (!listEl) return;
    var olds = listEl.querySelectorAll(".task-item--drag-over");
    for (var i = 0; i < olds.length; i++) {
      olds[i].classList.remove("task-item--drag-over");
    }
  }

  function onHandleDragEnd(e) {
    var handle = e.currentTarget;
    var li = handle.closest ? handle.closest(".task-item") : null;
    if (li) li.classList.remove("task-item--dragging");
    clearDragOverHighlight();
    dragId = null;
    dragOverId = null;
    render();
  }

  function onTaskDragOver(e) {
    if (!dragId) return;
    e.preventDefault();
    try {
      e.dataTransfer.dropEffect = "move";
    } catch (err) {}
    var li = e.currentTarget;
    var id = li.getAttribute("data-id");
    if (!id || id === dragId) return;
    if (dragOverId === id) return;
    clearDragOverHighlight();
    dragOverId = id;
    li.classList.add("task-item--drag-over");
  }

  function onTaskDrop(e) {
    if (!dragId) return;
    e.preventDefault();
    var li = e.currentTarget;
    var targetId = li.getAttribute("data-id");
    clearDragOverHighlight();
    if (!targetId || targetId === dragId) {
      dragId = null;
      dragOverId = null;
      render();
      return;
    }
    reorderTasksByIds(dragId, targetId);
    dragId = null;
    dragOverId = null;
    showToast("순서를 변경했습니다.", "info");
    render();
  }

  /**
   * 전체 목록 기준 id 순서 재배치(sortIndex 재부여)
   */
  function reorderTasksByIds(fromId, toId) {
    var ordered = sortTasksForDisplay(tasks);
    var ids = ordered.map(function (t) { return t.id; });
    var fromIdx = ids.indexOf(fromId);
    var toIdx = ids.indexOf(toId);
    if (fromIdx < 0 || toIdx < 0) return;
    ids.splice(fromIdx, 1);
    ids.splice(toIdx, 0, fromId);
    var map = {};
    for (var i = 0; i < ids.length; i++) map[ids[i]] = i;
    tasks = tasks.map(function (t) {
      return {
        id: t.id,
        text: t.text,
        completed: t.completed,
        createdAt: t.createdAt,
        category: t.category,
        sortIndex: map[t.id] !== undefined ? map[t.id] : t.sortIndex,
      };
    });
    ensureSortIndices();
    flushSaveTasks();
  }

  /**
   * 키보드(Alt+화살표)로 한 칸 이동 — 스크린리더 사용자 대안
   */
  function moveTaskByKeyboard(taskId, delta) {
    if (!isDragSortEnabled()) return;
    var ordered = sortTasksForDisplay(tasks);
    var ids = ordered.map(function (t) { return t.id; });
    var idx = ids.indexOf(taskId);
    var ni = idx + delta;
    if (idx < 0 || ni < 0 || ni >= ids.length) return;
    var swap = ids[ni];
    reorderTasksByIds(taskId, swap);
    render();
    announceToScreenReader("할 일 순서를 변경했습니다.");
  }

  function render() {
    updateDashboard();
    updateRemainingBadge();
    updateClearCompletedButton();

    var filtered = getFilteredTasks();
    if (
      editingTaskId &&
      !filtered.some(function (t) {
        return t.id === editingTaskId;
      })
    ) {
      editingTaskId = null;
      filtered = getFilteredTasks();
    }

    listEl.innerHTML = "";

    var forList = getTasksForList();
    var sorted = sortTasksForDisplay(forList);

    if (tasks.length === 0) {
      var empty = document.createElement("li");
      empty.className = "task-list--empty";
      empty.setAttribute("role", "presentation");
      empty.textContent = "할 일이 없습니다. 추가해보세요!";
      listEl.appendChild(empty);
      return;
    }

    if (filtered.length === 0) {
      var noCat = document.createElement("li");
      noCat.className = "task-list--empty";
      noCat.setAttribute("role", "presentation");
      noCat.textContent = "이 카테고리에 표시할 할 일이 없습니다.";
      listEl.appendChild(noCat);
      return;
    }

    if (sorted.length === 0) {
      var noSearch = document.createElement("li");
      noSearch.className = "task-list--empty";
      noSearch.setAttribute("role", "presentation");
      noSearch.textContent = "검색 결과가 없습니다.";
      listEl.appendChild(noSearch);
      return;
    }

    var frag = document.createDocumentFragment();
    for (var i = 0; i < sorted.length; i++) {
      frag.appendChild(buildTaskElement(sorted[i]));
    }
    listEl.appendChild(frag);

    var hintEl = document.getElementById("manual-sort-hint");
    if (hintEl) {
      if (sortMode === "manual" && (activeFilter !== "all" || normalizeSearch(searchQuery))) {
        hintEl.hidden = false;
        hintEl.textContent =
          "수동 순서 변경은 「전체」필터이고 검색어가 비어 있을 때만 사용할 수 있습니다.";
      } else {
        hintEl.hidden = true;
        hintEl.textContent = "";
      }
    }

    if (lastAddedTaskId) {
      var lid = lastAddedTaskId;
      window.setTimeout(function () {
        if (lastAddedTaskId === lid) lastAddedTaskId = null;
      }, 450);
    }
    if (completeSlideTaskId) {
      var sid = completeSlideTaskId;
      window.setTimeout(function () {
        if (completeSlideTaskId === sid) completeSlideTaskId = null;
      }, 500);
    }
  }

  function scheduleRender() {
    if (renderScheduled) return;
    renderScheduled = true;
    window.requestAnimationFrame(function () {
      renderScheduled = false;
      render();
    });
  }

  /**
   * 정렬 모드 전환 시 manual이면 현재 화면 순서로 sortIndex 초기화
   */
  function setSortMode(mode) {
    if (mode !== "created" && mode !== "category" && mode !== "completed" && mode !== "manual") {
      return;
    }
    editingTaskId = null;
    sortMode = mode;
    if (mode === "manual") {
      ensureSortIndices();
    }
    saveSortMode();
    syncSortButtons();
    render();
  }

  function addTaskCore(text, category) {
    var trimmed = text.trim();
    if (!trimmed) return;
    var cat =
      typeof category === "string" && VALID_CATEGORY[category] ? category : "work";
    var maxSi = -1;
    for (var i = 0; i < tasks.length; i++) {
      var s = tasks[i].sortIndex;
      if (typeof s === "number" && !isNaN(s) && s > maxSi) maxSi = s;
    }
    var newId = generateId();
    tasks.push({
      id: newId,
      text: trimmed,
      completed: false,
      createdAt: new Date().toISOString(),
      category: cat,
      sortIndex: maxSi + 1,
    });
    ensureSortIndices();
    lastAddedTaskId = newId;
    saveTasks();
    render();
    if (input) {
      input.value = "";
      input.focus();
    }
    showToast("할 일을 추가했습니다.", "success");
  }

  function addTask(text, category, forceSkipDuplicate) {
    var trimmed = text.trim();
    if (!trimmed) return;
    var cat =
      typeof category === "string" && VALID_CATEGORY[category] ? category : "work";
    if (!forceSkipDuplicate && findDuplicateTask(trimmed, null)) {
      duplicatePending = { mode: "add", text: trimmed, category: cat };
      if (dialogDuplicateBody) {
        dialogDuplicateBody.textContent =
          "같은 내용의 할 일이 이미 있습니다. 그래도 추가할까요?";
      }
      focusReturnEl = input;
      if (typeof dialogDuplicate.showModal === "function") {
        dialogDuplicate.showModal();
      } else {
        if (window.confirm(dialogDuplicateBody.textContent)) {
          duplicatePending = null;
          addTaskCore(trimmed, cat);
        } else {
          duplicatePending = null;
        }
      }
      return;
    }
    addTaskCore(trimmed, cat);
  }

  function removeTask(id) {
    var idx = -1;
    var snapshot = null;
    for (var i = 0; i < tasks.length; i++) {
      if (tasks[i].id === id) {
        idx = i;
        snapshot = tasks[i];
        break;
      }
    }
    if (!snapshot || idx < 0) return;

    var li = listEl.querySelector('[data-id="' + id + '"]');
    if (li && !li.classList.contains("task-item--removing")) {
      pendingRemoveIds[id] = true;
      updateDashboard();
      li.classList.add("task-item--removing");
      var finished = false;
      function finishRemove() {
        if (finished) return;
        finished = true;
        delete pendingRemoveIds[id];
        tasks = tasks.filter(function (t) {
          return t.id !== id;
        });
        ensureSortIndices();
        flushSaveTasks();
        registerUndo(snapshot, idx);
        render();
        showToast("삭제했습니다.", "info");
      }
      li.addEventListener(
        "transitionend",
        function onEnd(e) {
          if (e.target !== li) return;
          if (e.propertyName !== "opacity" && e.propertyName !== "transform") return;
          li.removeEventListener("transitionend", onEnd);
          finishRemove();
        },
        false
      );
      window.setTimeout(function () {
        if (
          tasks.some(function (t) {
            return t.id === id;
          })
        ) {
          finishRemove();
        }
      }, 450);
      return;
    }

    tasks = tasks.filter(function (t) {
      return t.id !== id;
    });
    ensureSortIndices();
    flushSaveTasks();
    registerUndo(snapshot, idx);
    render();
    showToast("삭제했습니다.", "info");
  }

  function toggleComplete(id, completed) {
    if (completed) completeSlideTaskId = id;
    tasks = tasks.map(function (t) {
      if (t.id !== id) return t;
      return {
        id: t.id,
        text: t.text,
        completed: completed,
        createdAt: t.createdAt,
        category: t.category,
        sortIndex: t.sortIndex,
      };
    });
    saveTasks();
    render();
  }

  function setFilter(filter) {
    if (filter !== "all" && !VALID_CATEGORY[filter]) return;
    editingTaskId = null;
    activeFilter = filter;
    saveFilter();
    syncFilterButtons();
    render();
  }

  function removeAllCompleted() {
    var before = tasks.length;
    tasks = tasks.filter(function (t) {
      return !t.completed;
    });
    var removed = before - tasks.length;
    editingTaskId = null;
    hideUndoBar();
    ensureSortIndices();
    flushSaveTasks();
    render();
    if (removed > 0) {
      showToast("완료된 항목 " + removed + "개를 삭제했습니다.", "success");
    }
  }

  function openClearCompletedDialog() {
    var n = countCompletedAll();
    if (n === 0 || !dialogClear || !dialogClearBody) return;
    dialogClearBody.textContent =
      "완료된 할 일 " + n + "개를 영구 삭제합니다. 이 작업은 되돌릴 수 없습니다.";
    focusReturnEl = btnClearCompleted;
    if (typeof dialogClear.showModal === "function") {
      dialogClear.showModal();
    } else {
      if (window.confirm(dialogClearBody.textContent)) removeAllCompleted();
    }
  }

  /* -------------------------------------------------------------------------- */
  /* JSON 보내기 / 가져오기                                                      */
  /* -------------------------------------------------------------------------- */

  function buildExportPayload() {
    return {
      version: EXPORT_VERSION,
      app: "MyTasks",
      exportedAt: new Date().toISOString(),
      sortMode: sortMode,
      tasks: tasks.map(function (t) {
        return {
          id: t.id,
          text: t.text,
          completed: t.completed,
          createdAt: t.createdAt,
          category: t.category,
          sortIndex: typeof t.sortIndex === "number" ? t.sortIndex : 0,
        };
      }),
    };
  }

  function triggerJsonDownload(obj, filename) {
    try {
      var json = JSON.stringify(obj, null, 2);
      var blob = new Blob([json], { type: "application/json;charset=utf-8" });
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url;
      a.download = filename || "mytasks-export.json";
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.setTimeout(function () {
        URL.revokeObjectURL(url);
      }, 2500);
    } catch (e) {
      showToast("파일을 만들 수 없습니다. 브라우저 설정을 확인해 주세요.", "error", true);
    }
  }

  function exportJson() {
    var payload = buildExportPayload();
    var fname = "mytasks-export-" + new Date().toISOString().replace(/[:.]/g, "-") + ".json";
    triggerJsonDownload(payload, fname);
    showToast("JSON 파일로 저장했습니다.", "success");
  }

  /**
   * 가져오기용 배열 추출(래퍼 객체 또는 순수 배열 허용)
   * @returns {{ tasks: object[], sortMode?: string }|null}
   */
  function parseImportPayload(text) {
    var trimmed = String(text || "").trim();
    if (!trimmed) {
      showToast("파일이 비어 있습니다.", "warning", true);
      return null;
    }
    if (trimmed.length > IMPORT_MAX_CHARS) {
      showToast("파일이 너무 큽니다. 더 작은 파일을 선택해 주세요.", "error", true);
      return null;
    }
    var data;
    try {
      data = JSON.parse(trimmed);
    } catch (e) {
      showToast("JSON 형식이 올바르지 않습니다.", "error", true);
      return null;
    }
    var arr = null;
    var importedSort = null;
    if (Array.isArray(data)) {
      arr = data;
    } else if (data && Array.isArray(data.tasks)) {
      arr = data.tasks;
      if (
        data.sortMode === "created" ||
        data.sortMode === "category" ||
        data.sortMode === "completed" ||
        data.sortMode === "manual"
      ) {
        importedSort = data.sortMode;
      }
    } else {
      showToast("지원하지 않는 데이터 형식입니다.", "error", true);
      return null;
    }
    var out = [];
    var seenIds = {};
    for (var i = 0; i < arr.length; i++) {
      var row = arr[i];
      var norm = normalizeTaskRow(row, i);
      if (!norm) continue;
      if (isNaN(new Date(norm.createdAt).getTime())) {
        continue;
      }
      if (seenIds[norm.id]) {
        norm.id = generateId();
      }
      seenIds[norm.id] = true;
      out.push(norm);
    }
    if (!out.length) {
      showToast("가져올 유효한 할 일이 없습니다.", "warning", true);
      return null;
    }
    return { tasks: out, sortMode: importedSort };
  }

  function applyImportedTasks(payload) {
    if (!payload || !payload.tasks) return;
    hideUndoBar();
    tasks = payload.tasks;
    if (payload.sortMode) {
      sortMode = payload.sortMode;
      saveSortMode();
      syncSortButtons();
    }
    ensureSortIndices();
    editingTaskId = null;
    duplicatePending = null;
    dragId = null;
    dragOverId = null;
    flushSaveTasks();
    render();
    showToast("데이터를 가져왔습니다. (" + tasks.length + "개)", "success");
    announceToScreenReader("가져오기가 완료되었습니다. 항목 " + tasks.length + "개.");
  }

  function openImportBackupDialog(payload) {
    pendingImportTasks = payload;
    if (dialogImportBackupBody) {
      dialogImportBackupBody.textContent =
        "가져오면 현재 목록이 교체됩니다. 진행 전에 지금 목록을 JSON 파일로 백업할까요?";
    }
    focusReturnEl = inputImportJson;
    if (typeof dialogImportBackup.showModal === "function") {
      dialogImportBackup.showModal();
    } else {
      var ok = window.confirm(dialogImportBackupBody.textContent + " [확인: 백업 후 진행]");
      if (!ok) {
        pendingImportTasks = null;
        return;
      }
      triggerJsonDownload(buildExportPayload(), "mytasks-backup-pre-import.json");
      applyImportedTasks(pendingImportTasks);
      pendingImportTasks = null;
    }
  }

  /* -------------------------------------------------------------------------- */
  /* 이벤트 바인딩                                                              */
  /* -------------------------------------------------------------------------- */

  document.addEventListener(
    "keydown",
    function (e) {
      if (!e.altKey || e.defaultPrevented) return;
      var k = e.key;
      if (k === "n" || k === "N") {
        e.preventDefault();
        if (input) input.focus();
        return;
      }
      if (k === "d" || k === "D") {
        e.preventDefault();
        toggleTheme();
        return;
      }
      if (k === "1" || k === "2" || k === "3" || k === "4") {
        e.preventDefault();
        var idx = parseInt(k, 10) - 1;
        if (FILTER_ORDER[idx]) setFilter(FILTER_ORDER[idx]);
        return;
      }
    },
    true
  );

  if (filtersEl) {
    filtersEl.addEventListener("click", function (e) {
      var target = e.target;
      if (target.tagName !== "BUTTON") return;
      var f = target.getAttribute("data-filter");
      if (!f) return;
      if (f !== "all" && !VALID_CATEGORY[f]) return;
      setFilter(f);
    });
  }

  var applyCategoryHintDebounced = debounce(function () {
    syncAutoCategoryHint();
  }, DEBOUNCE_CATEGORY_HINT_MS);

  if (form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var cat = resolveCategoryForNewTask(input.value);
      addTask(input.value, cat, false);
    });
  }

  if (input) {
    input.addEventListener("input", function () {
      applyCategoryHintDebounced();
    });
  }

  if (categorySelect) {
    categorySelect.addEventListener("change", function () {
      applyCategoryHintDebounced();
    });
  }

  if (autoCategoryCheckbox) {
    autoCategoryCheckbox.addEventListener("change", function () {
      saveAutoCategoryEnabled(autoCategoryCheckbox.checked);
      syncAutoCategoryHint();
    });
  }

  var applySearchDebounced = debounce(function () {
    searchQuery = searchInputPending;
    editingTaskId = null;
    scheduleRender();
  }, DEBOUNCE_SEARCH_MS);

  if (searchInput) {
    searchInput.addEventListener("input", function () {
      searchInputPending = searchInput.value;
      applySearchDebounced();
    });
  }

  if (themeToggle) {
    themeToggle.addEventListener("change", function () {
      var dark = themeToggle.checked;
      applyTheme(dark ? "dark" : "light");
      saveTheme(dark ? "dark" : "light");
      showToast(dark ? "다크 모드로 전환했습니다." : "라이트 모드로 전환했습니다.", "info");
    });
  }

  if (dialogClear) {
    dialogClear.addEventListener("close", function () {
      if (dialogClear.returnValue === "ok") removeAllCompleted();
      if (focusReturnEl && typeof focusReturnEl.focus === "function") {
        focusReturnEl.focus();
      }
      focusReturnEl = null;
    });
  }

  if (btnClearCompleted) {
    btnClearCompleted.addEventListener("click", function () {
      openClearCompletedDialog();
    });
  }

  if (sortToolbar) {
    sortToolbar.addEventListener("click", function (e) {
      var t = e.target;
      if (t.tagName !== "BUTTON") return;
      var sm = t.getAttribute("data-sort");
      if (!sm) return;
      setSortMode(sm);
    });
  }

  if (btnExportJson) {
    btnExportJson.addEventListener("click", function () {
      exportJson();
    });
  }

  if (inputImportJson) {
    inputImportJson.addEventListener("change", function () {
      var file = inputImportJson.files && inputImportJson.files[0];
      inputImportJson.value = "";
      if (!file) return;
      var reader = new FileReader();
      reader.onerror = function () {
        showToast("파일을 읽지 못했습니다.", "error", true);
      };
      reader.onload = function () {
        var text = reader.result;
        if (typeof text !== "string") {
          showToast("텍스트 JSON 파일만 지원합니다.", "error", true);
          return;
        }
        var payload = parseImportPayload(text);
        if (!payload) return;
        openImportBackupDialog(payload);
      };
      reader.readAsText(file, "utf-8");
    });
  }

  if (dialogImportBackup) {
    dialogImportBackup.addEventListener("close", function () {
      var rv = dialogImportBackup.returnValue;
      if (rv === "cancel" || rv === "") {
        pendingImportTasks = null;
      } else if (rv === "no-backup") {
        if (pendingImportTasks) applyImportedTasks(pendingImportTasks);
        pendingImportTasks = null;
      } else if (rv === "backup") {
        triggerJsonDownload(
          buildExportPayload(),
          "mytasks-backup-pre-import-" + new Date().toISOString().replace(/[:.]/g, "-") + ".json"
        );
        if (pendingImportTasks) applyImportedTasks(pendingImportTasks);
        pendingImportTasks = null;
        showToast("현재 데이터를 백업 파일로 저장한 뒤 가져왔습니다.", "success");
      }
      if (focusReturnEl && typeof focusReturnEl.focus === "function") {
        focusReturnEl.focus();
      }
      focusReturnEl = null;
    });
  }

  if (dialogDuplicate) {
    dialogDuplicate.addEventListener("close", function () {
      var rv = dialogDuplicate.returnValue;
      var pend = duplicatePending;
      duplicatePending = null;
      if (rv === "ok" && pend) {
        if (pend.mode === "add") {
          addTaskCore(pend.text, pend.category);
        } else if (pend.mode === "edit") {
          editingTaskId = null;
          updateTask(pend.id, { text: pend.text, category: pend.category });
          showToast("할 일을 수정했습니다.", "success");
        }
      } else if (pend && pend.mode === "edit") {
        render();
      }
      if (focusReturnEl && typeof focusReturnEl.focus === "function") {
        focusReturnEl.focus();
      }
      focusReturnEl = null;
    });
  }

  if (undoBarBtn) {
    undoBarBtn.addEventListener("click", function () {
      performUndo();
    });
  }

  /* -------------------------------------------------------------------------- */
  /* 초기화                                                                      */
  /* -------------------------------------------------------------------------- */

  activeFilter = loadFilter();
  syncFilterButtons();
  sortMode = loadSortMode();
  syncSortButtons();
  tasks = loadTasks();
  ensureSortIndices();
  if (searchInput) {
    searchInputPending = searchInput.value;
    searchQuery = searchInput.value || "";
  }
  applyTheme(loadTheme());
  hideUndoBar();
  initDailyQuote();
  if (autoCategoryCheckbox) {
    autoCategoryCheckbox.checked = loadAutoCategoryEnabled();
  }
  syncAutoCategoryHint();
  render();
})();
