/* =========================================================================
   조각 나누기 · 조각 찾기 (chunker.js)
   -------------------------------------------------------------------------
   임베딩(벡터 검색)을 쓰지 않습니다. 아래 두 가지만 합니다.

   1) split()  : 문서를 조항 단위로 자른다.
                 "제○조", "##", 빈 줄(줄바꿈 2번)을 기준으로 나누고,
                 한 조각이 1200자를 넘으면 추가로 자른다.
                 각 조각 앞에는 소제목을 붙인다.

   2) search() : 질문을 2~3글자 단위로 잘라 소제목·본문과 부분 일치하는
                 조각에 점수를 매기고, 점수 높은 상위 12개를 돌려준다.
   ========================================================================= */

var Chunker = (function () {

  /* 소제목으로 볼 수 있는 줄인지 판단한다.
     예) "제23조(연차유급휴가)", "## 연차", "제 5 조 휴가" */
  var RE_ARTICLE  = /^\s*제\s*\d+\s*조(\s*의\s*\d+)?\s*[(（.\s]?/;   // 제○조
  var RE_MARKDOWN = /^\s{0,3}#{1,6}\s+\S/;                          // ## 소제목

  function isHeadingLine(line) {
    return RE_ARTICLE.test(line) || RE_MARKDOWN.test(line);
  }

  /* 소제목 줄에서 보기 좋은 제목만 뽑아낸다. */
  function cleanHeading(line) {
    var title = line.replace(/^\s{0,3}#{1,6}\s+/, '').trim();   // ## 기호 제거
    title = title.replace(/[*_`]/g, '').trim();                 // 강조 기호 제거
    if (title.length > 60) title = title.slice(0, 60) + '…';
    return title;
  }

  /* 소제목이 없는 덩어리의 제목을 첫 줄에서 만들어 낸다. */
  function guessHeading(body, docName) {
    var firstLine = (body.split('\n').find(function (l) { return l.trim().length > 0; }) || '').trim();
    if (!firstLine) return docName;
    if (firstLine.length > 40) firstLine = firstLine.slice(0, 40) + '…';
    return firstLine;
  }

  /* 1200자를 넘는 덩어리를 문장 끝을 살펴 가며 더 자른다. */
  function cutLongText(text, limit) {
    var pieces = [];
    var rest = text;

    while (rest.length > limit) {
      var window = rest.slice(0, limit);

      // 자를 자리 후보 : 빈 줄 → 줄바꿈 → 문장 끝(마침표 뒤) 순서로 찾는다.
      var cutAt = window.lastIndexOf('\n\n');
      if (cutAt < limit * 0.5) cutAt = window.lastIndexOf('\n');
      if (cutAt < limit * 0.5) {
        var period = Math.max(window.lastIndexOf('. '), window.lastIndexOf('다.'));
        if (period >= limit * 0.5) cutAt = period + 2;
      }
      if (cutAt < limit * 0.5) cutAt = limit;   // 마땅한 자리가 없으면 그냥 자른다.

      pieces.push(rest.slice(0, cutAt).trim());
      rest = rest.slice(cutAt);
    }

    if (rest.trim().length > 0) pieces.push(rest.trim());
    return pieces;
  }

  /* -----------------------------------------------------------------------
     문서 → 조각 목록
     반환 : [{ id:'doc_001_c07', docId:'doc_001', title:'제23조(연차)', body:'...' }]
     ----------------------------------------------------------------------- */
  function split(docId, docName, text) {
    var normalized = String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    if (normalized.trim().length === 0) return [];

    var lines = normalized.split('\n');

    /* (가) 소제목 줄을 기준으로 문서를 큰 마디로 나눈다. */
    var sections = [];
    var current = { title: null, lines: [] };

    lines.forEach(function (line) {
      if (isHeadingLine(line)) {
        if (current.title !== null || current.lines.join('').trim().length > 0) {
          sections.push(current);
        }
        current = { title: cleanHeading(line), lines: [line.trim()] };
      } else {
        current.lines.push(line);
      }
    });
    if (current.title !== null || current.lines.join('').trim().length > 0) {
      sections.push(current);
    }

    /* (나) 마디가 길면 빈 줄 기준으로 더 나누고, 그래도 길면 1200자로 자른다. */
    var results = [];
    var counter = 0;

    sections.forEach(function (section) {
      var body = section.lines.join('\n').trim();
      if (body.length === 0) return;

      var pieces;
      if (body.length <= CONFIG.MAX_CHUNK_LENGTH) {
        pieces = [body];
      } else {
        // 빈 줄로 먼저 나눈 뒤, 1200자를 넘지 않게 다시 뭉친다.
        var blocks = body.split(/\n\s*\n/).map(function (b) { return b.trim(); })
                         .filter(function (b) { return b.length > 0; });
        pieces = [];
        var buffer = '';
        blocks.forEach(function (block) {
          if (block.length > CONFIG.MAX_CHUNK_LENGTH) {
            if (buffer) { pieces.push(buffer); buffer = ''; }
            cutLongText(block, CONFIG.MAX_CHUNK_LENGTH).forEach(function (p) { pieces.push(p); });
          } else if ((buffer + '\n\n' + block).length > CONFIG.MAX_CHUNK_LENGTH) {
            if (buffer) pieces.push(buffer);
            buffer = block;
          } else {
            buffer = buffer ? (buffer + '\n\n' + block) : block;
          }
        });
        if (buffer) pieces.push(buffer);
      }

      var baseTitle = section.title || guessHeading(body, docName);

      pieces.forEach(function (piece, index) {
        counter += 1;
        results.push({
          id:    docId + '_c' + String(counter).padStart(2, '0'),   // 조각ID
          docId: docId,                                             // 자료ID
          // 잘려서 여러 개가 된 경우에는 (2/3) 처럼 표시해 준다.
          title: pieces.length > 1
                   ? baseTitle + ' (' + (index + 1) + '/' + pieces.length + ')'
                   : baseTitle,                                     // 소제목
          body:  piece                                              // 본문
        });
      });
    });

    return results;
  }

  /* -----------------------------------------------------------------------
     질문에서 2~3글자 조각(엔그램)을 뽑아낸다.
     ----------------------------------------------------------------------- */
  function makeGrams(question) {
    // 조사·기호·공백을 없애고 글자만 남긴다.
    var cleaned = String(question || '')
      .replace(/[^가-힣a-zA-Z0-9]/g, '')   // 한글·영문·숫자만 남김
      .toLowerCase();

    var grams = [];
    for (var size = 2; size <= 3; size++) {
      for (var i = 0; i + size <= cleaned.length; i++) {
        grams.push(cleaned.slice(i, i + size));
      }
    }
    // 같은 조각이 여러 번 나와도 한 번만 센다.
    return grams.filter(function (g, i) { return grams.indexOf(g) === i; });
  }

  /* 어떤 글 안에 조각이 몇 번 나오는지 센다(최대 3번까지만 인정). */
  function countIn(haystack, gram) {
    var count = 0;
    var from = 0;
    while (count < 3) {
      var found = haystack.indexOf(gram, from);
      if (found === -1) break;
      count += 1;
      from = found + 1;
    }
    return count;
  }

  /* -----------------------------------------------------------------------
     질문과 관련 있는 조각 상위 12개를 고른다.
     반환 : [{ chunk:{...}, score: 27 }, ...]  (점수가 0인 것은 빼고 준다)
     ----------------------------------------------------------------------- */
  function search(question, chunks, limit) {
    var topCount = limit || CONFIG.TOP_CHUNK_COUNT;
    var grams = makeGrams(question);
    if (grams.length === 0) return [];

    var scored = chunks.map(function (chunk) {
      var title = String(chunk.title || '').toLowerCase();
      var body  = String(chunk.body  || '').toLowerCase();
      var score = 0;

      grams.forEach(function (gram) {
        var weight = gram.length === 3 ? 2 : 1;          // 3글자가 맞으면 더 높은 점수
        score += countIn(title, gram) * weight * 3;      // 소제목에서 맞으면 3배
        score += countIn(body,  gram) * weight;
      });

      return { chunk: chunk, score: score };
    });

    return scored
      .filter(function (item) { return item.score > 0; })
      .sort(function (a, b) { return b.score - a.score; })
      .slice(0, topCount);
  }

  return {
    split: split,
    search: search,
    makeGrams: makeGrams
  };
})();
