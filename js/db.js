/* =========================================================================
   저장소 (db.js)
   -------------------------------------------------------------------------
   브라우저 안에만 데이터를 저장합니다. 서버로는 아무것도 보내지 않습니다.

   저장 묶음 3개
     (1) 규정자료  docs   : 자료ID / 자료명 / 출처구분 / 원문텍스트 / 글자수 / 등록일시
     (2) 조각      chunks : 조각ID / 자료ID / 소제목 / 본문
     (3) 설정및기록 meta  : 모델명 / 대화기록 / 미답변질문
         └ API키만 예외로 localStorage 에 저장합니다.

   ※ 표의 한글 항목명과 실제 코드 이름의 대응
       자료ID→id, 자료명→name, 출처구분→source, 원문텍스트→text,
       글자수→charCount, 등록일시→createdAt
       조각ID→id, 자료ID→docId, 소제목→title, 본문→body
   ========================================================================= */

var DB = (function () {

  var STORE_DOCS   = 'docs';
  var STORE_CHUNKS = 'chunks';
  var STORE_META   = 'meta';

  var _db = null;          // IndexedDB 연결
  var _useFallback = false; // IndexedDB 를 쓸 수 없을 때 true (localStorage 로 대체)
  var _openPromise = null;

  /* =====================================================================
     0. 연결 열기
     ===================================================================== */

  function open() {
    if (_openPromise) return _openPromise;

    _openPromise = new Promise(function (resolve) {
      var request;
      try {
        request = indexedDB.open(CONFIG.DB_NAME, CONFIG.DB_VERSION);
      } catch (e) {
        // 파일을 직접 열었을 때(file://) 등 IndexedDB 가 막힌 경우
        _useFallback = true;
        resolve(false);
        return;
      }

      request.onupgradeneeded = function (event) {
        var db = event.target.result;

        if (!db.objectStoreNames.contains(STORE_DOCS)) {
          db.createObjectStore(STORE_DOCS, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORE_CHUNKS)) {
          var chunkStore = db.createObjectStore(STORE_CHUNKS, { keyPath: 'id' });
          chunkStore.createIndex('docId', 'docId', { unique: false });
        }
        if (!db.objectStoreNames.contains(STORE_META)) {
          db.createObjectStore(STORE_META, { keyPath: 'key' });
        }
      };

      request.onsuccess = function (event) {
        _db = event.target.result;
        _useFallback = false;
        resolve(true);
      };

      request.onerror = function () {
        _useFallback = true;
        resolve(false);
      };

      request.onblocked = function () {
        _useFallback = true;
        resolve(false);
      };
    });

    return _openPromise;
  }

  /* IndexedDB 를 쓰고 있는지 여부 (화면에서 안내 문구를 띄울 때 사용) */
  function isFallback() {
    return _useFallback;
  }

  /* =====================================================================
     1. 낮은 층: 저장소 한 칸을 다루는 공통 기능
        IndexedDB 와 localStorage 대체 저장소가 같은 모양으로 동작한다.
     ===================================================================== */

  function fallbackKey(storeName) {
    return CONFIG.DB_NAME + ':' + storeName;
  }

  function fallbackRead(storeName) {
    try {
      var raw = localStorage.getItem(fallbackKey(storeName));
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function fallbackWrite(storeName, rows) {
    localStorage.setItem(fallbackKey(storeName), JSON.stringify(rows));
  }

  function keyPathOf(storeName) {
    return storeName === STORE_META ? 'key' : 'id';
  }

  /* 여러 건 저장(있으면 덮어쓰기) */
  function putMany(storeName, records) {
    return open().then(function () {
      if (_useFallback) {
        var kp = keyPathOf(storeName);
        var rows = fallbackRead(storeName);
        records.forEach(function (rec) {
          var idx = rows.findIndex(function (r) { return r[kp] === rec[kp]; });
          if (idx >= 0) rows[idx] = rec; else rows.push(rec);
        });
        fallbackWrite(storeName, rows);
        return true;
      }

      return new Promise(function (resolve, reject) {
        var tx = _db.transaction([storeName], 'readwrite');
        var store = tx.objectStore(storeName);
        records.forEach(function (rec) { store.put(rec); });
        tx.oncomplete = function () { resolve(true); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }

  function put(storeName, record) {
    return putMany(storeName, [record]);
  }

  /* 전체 읽기 */
  function getAll(storeName) {
    return open().then(function () {
      if (_useFallback) return fallbackRead(storeName);

      return new Promise(function (resolve, reject) {
        var tx = _db.transaction([storeName], 'readonly');
        var req = tx.objectStore(storeName).getAll();
        req.onsuccess = function () { resolve(req.result || []); };
        req.onerror = function () { reject(req.error); };
      });
    });
  }

  /* 한 건 읽기 */
  function get(storeName, key) {
    return open().then(function () {
      if (_useFallback) {
        var kp = keyPathOf(storeName);
        var rows = fallbackRead(storeName);
        return rows.find(function (r) { return r[kp] === key; }) || null;
      }

      return new Promise(function (resolve, reject) {
        var tx = _db.transaction([storeName], 'readonly');
        var req = tx.objectStore(storeName).get(key);
        req.onsuccess = function () { resolve(req.result || null); };
        req.onerror = function () { reject(req.error); };
      });
    });
  }

  /* 한 건 지우기 */
  function remove(storeName, key) {
    return open().then(function () {
      if (_useFallback) {
        var kp = keyPathOf(storeName);
        var rows = fallbackRead(storeName).filter(function (r) { return r[kp] !== key; });
        fallbackWrite(storeName, rows);
        return true;
      }

      return new Promise(function (resolve, reject) {
        var tx = _db.transaction([storeName], 'readwrite');
        tx.objectStore(storeName).delete(key);
        tx.oncomplete = function () { resolve(true); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }

  /* 조건에 맞는 것 모두 지우기 */
  function removeWhere(storeName, predicate) {
    return getAll(storeName).then(function (rows) {
      var kp = keyPathOf(storeName);
      var targets = rows.filter(predicate);
      if (targets.length === 0) return true;

      if (_useFallback) {
        var keep = rows.filter(function (r) { return !predicate(r); });
        fallbackWrite(storeName, keep);
        return true;
      }

      return new Promise(function (resolve, reject) {
        var tx = _db.transaction([storeName], 'readwrite');
        var store = tx.objectStore(storeName);
        targets.forEach(function (r) { store.delete(r[kp]); });
        tx.oncomplete = function () { resolve(true); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }

  /* 저장소 한 칸 통째로 비우기 */
  function clearStore(storeName) {
    return open().then(function () {
      if (_useFallback) {
        fallbackWrite(storeName, []);
        return true;
      }

      return new Promise(function (resolve, reject) {
        var tx = _db.transaction([storeName], 'readwrite');
        tx.objectStore(storeName).clear();
        tx.oncomplete = function () { resolve(true); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }

  /* =====================================================================
     2. (1) 규정자료 + (2) 조각
     ===================================================================== */

  /* 자료ID 만들기 : doc_001, doc_002 ... */
  function makeDocId(existingDocs) {
    var maxNumber = 0;
    existingDocs.forEach(function (d) {
      var m = /^doc_(\d+)$/.exec(d.id);
      if (m) maxNumber = Math.max(maxNumber, parseInt(m[1], 10));
    });
    var next = maxNumber + 1;
    return 'doc_' + String(next).padStart(3, '0');
  }

  /* 등록일시 문자열 : 2026-08-11 14:30 */
  function nowString() {
    var d = new Date();
    var p = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) +
           ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  /* 규정자료 한 건 등록 (조각도 함께 만들어 저장)
     name   : 자료명   예) 취업규칙.pdf
     text   : 원문텍스트
     source : 출처구분 '파일첨부' 또는 '마법사생성' */
  function addDocument(name, text, source) {
    return getAllDocuments().then(function (docs) {
      var docId = makeDocId(docs);

      var doc = {
        id:        docId,          // 자료ID
        name:      name,           // 자료명
        source:    source,         // 출처구분
        text:      text,           // 원문텍스트
        charCount: text.length,    // 글자수
        createdAt: nowString()     // 등록일시
      };

      var chunks = Chunker.split(docId, name, text);

      return put(STORE_DOCS, doc)
        .then(function () { return chunks.length ? putMany(STORE_CHUNKS, chunks) : true; })
        .then(function () { return { doc: doc, chunkCount: chunks.length }; });
    });
  }

  function getAllDocuments() {
    return getAll(STORE_DOCS);
  }

  function getDocument(docId) {
    return get(STORE_DOCS, docId);
  }

  /* 규정자료 한 건 삭제 (딸린 조각도 함께 삭제) */
  function deleteDocument(docId) {
    return removeWhere(STORE_CHUNKS, function (c) { return c.docId === docId; })
      .then(function () { return remove(STORE_DOCS, docId); });
  }

  function deleteAllDocuments() {
    return clearStore(STORE_CHUNKS).then(function () { return clearStore(STORE_DOCS); });
  }

  function getAllChunks() {
    return getAll(STORE_CHUNKS);
  }

  /* 등록된 전체 글자 수 (전체 전송 / 부분 검색 판단에 사용) */
  function getTotalCharCount() {
    return getAllDocuments().then(function (docs) {
      return docs.reduce(function (sum, d) { return sum + (d.charCount || 0); }, 0);
    });
  }

  /* =====================================================================
     3. (3) 설정 및 기록 — 모델명 / 대화기록 / 미답변질문
     ===================================================================== */

  function getMeta(key, defaultValue) {
    return get(STORE_META, key).then(function (row) {
      return row ? row.value : defaultValue;
    });
  }

  function setMeta(key, value) {
    return put(STORE_META, { key: key, value: value });
  }

  /* ---- 모델명 ---- */
  function getModelName() {
    return getMeta('modelName', CONFIG.MODEL_NAME);
  }
  function setModelName(name) {
    return setMeta('modelName', name);
  }

  /* ---- 대화기록 : [{ role:'사용자'|'AI', text:'...', sources:[...], at:'...' }] ---- */
  function getChatHistory() {
    return getMeta('chatHistory', []);
  }
  function saveChatHistory(list) {
    return setMeta('chatHistory', list);
  }
  function clearChatHistory() {
    return setMeta('chatHistory', []);
  }

  /* ---- 미답변질문 : [{ question:'...', at:'2026-08-11 14:30' }] ---- */
  function getUnanswered() {
    return getMeta('unanswered', []);
  }
  function addUnanswered(question) {
    return getUnanswered().then(function (list) {
      list.push({ question: question, at: nowString() });
      return setMeta('unanswered', list);
    });
  }
  function deleteUnanswered(index) {
    return getUnanswered().then(function (list) {
      list.splice(index, 1);
      return setMeta('unanswered', list);
    });
  }
  function clearUnanswered() {
    return setMeta('unanswered', []);
  }

  /* =====================================================================
     4. API 키 — localStorage 에만 저장. 절대 화면·로그에 그대로 찍지 않는다.
     ===================================================================== */

  function getApiKey() {
    try {
      return localStorage.getItem(CONFIG.APIKEY_STORAGE_KEY) || '';
    } catch (e) {
      return '';
    }
  }

  function saveApiKey(key) {
    localStorage.setItem(CONFIG.APIKEY_STORAGE_KEY, key.trim());
  }

  function deleteApiKey() {
    localStorage.removeItem(CONFIG.APIKEY_STORAGE_KEY);
  }

  function hasApiKey() {
    return getApiKey().length > 0;
  }

  /* =====================================================================
     5. 규정집 내보내기 / 불러오기
        ★ 이 파일에는 API 키와 대화 내용을 절대 담지 않는다.
     ===================================================================== */

  function exportRules() {
    return getAllDocuments().then(function (docs) {
      return {
        형식: '사내규정집',
        버전: 1,
        만든날짜: nowString(),
        규정자료: docs.map(function (d) {
          return {
            자료명:     d.name,
            출처구분:   d.source,
            원문텍스트: d.text,
            글자수:     d.charCount,
            등록일시:   d.createdAt
          };
        })
      };
    });
  }

  /* 불러오기 : 기존 자료에 덧붙인다. 반환값은 등록된 건수 */
  function importRules(data) {
    if (!data || !Array.isArray(data.규정자료)) {
      return Promise.reject(new Error('규정집 파일 형식이 올바르지 않습니다.'));
    }

    var items = data.규정자료;
    var count = 0;

    return items.reduce(function (chain, item) {
      return chain.then(function () {
        if (!item.자료명 || !item.원문텍스트) return;
        return addDocument(item.자료명, item.원문텍스트, item.출처구분 || '파일첨부')
          .then(function () { count += 1; });
      });
    }, Promise.resolve()).then(function () { return count; });
  }

  /* =====================================================================
     바깥으로 열어 주는 기능 목록
     ===================================================================== */
  return {
    open: open,
    isFallback: isFallback,
    nowString: nowString,

    addDocument: addDocument,
    getAllDocuments: getAllDocuments,
    getDocument: getDocument,
    deleteDocument: deleteDocument,
    deleteAllDocuments: deleteAllDocuments,
    getAllChunks: getAllChunks,
    getTotalCharCount: getTotalCharCount,

    getModelName: getModelName,
    setModelName: setModelName,

    getChatHistory: getChatHistory,
    saveChatHistory: saveChatHistory,
    clearChatHistory: clearChatHistory,

    getUnanswered: getUnanswered,
    addUnanswered: addUnanswered,
    deleteUnanswered: deleteUnanswered,
    clearUnanswered: clearUnanswered,

    getApiKey: getApiKey,
    saveApiKey: saveApiKey,
    deleteApiKey: deleteApiKey,
    hasApiKey: hasApiKey,

    exportRules: exportRules,
    importRules: importRules
  };
})();
