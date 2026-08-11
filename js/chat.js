/* =========================================================================
   화면 2 : 질문하기 (채팅) (chat.js)
   -------------------------------------------------------------------------
   ★ 가장 중요한 규칙 : 첨부된 규정 자료 안에서 근거를 찾지 못하면
     추측하지 않고 정해진 문장만 출력한다. (CONFIG.NOT_FOUND_MESSAGE)
   ========================================================================= */

var Chat = (function () {

  var 요소 = UI.요소;

  var 기록 = [];              // 화면에 보이는 대화 (DB의 대화기록과 같은 내용)
  var 진행중 = false;          // 지금 답변을 기다리는 중인지
  var 지금컨트롤러 = null;      // 진행 중인 요청을 취소할 때 씀

  /* =====================================================================
     0. 시작
     ===================================================================== */
  function 초기화() {
    자주묻는질문그리기();
    연결하기();

    DB.getChatHistory().then(function (저장된것) {
      기록 = 저장된것 || [];
      그리기();
    });
  }

  function 화면진입시() {
    자료없음안내갱신();
  }

  function 연결하기() {
    요소('채팅입력폼').addEventListener('submit', function (e) {
      e.preventDefault();
      보내기(요소('질문입력').value);
    });

    // 엔터로 전송, 시프트+엔터는 줄바꿈
    요소('질문입력').addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        보내기(요소('질문입력').value);
      }
    });
    요소('질문입력').addEventListener('input', 입력칸높이맞추기);

    요소('대화지우기버튼').addEventListener('click', 대화지우기);

    요소('자료등록이동버튼').addEventListener('click', function () {
      UI.화면보이기('자료');
    });

    // 자주 묻는 질문 버튼 6개 (이벤트 위임)
    요소('자주묻는질문').addEventListener('click', function (e) {
      var 버튼 = e.target.closest('.자주묻는질문-버튼');
      if (버튼) 보내기(버튼.dataset.질문);
    });

    // 대화상자 안의 복사 버튼들 (목록을 새로 그릴 때마다 생기므로 위임)
    요소('대화상자').addEventListener('click', function (e) {
      var 복사버튼 = e.target.closest('.복사버튼');
      if (복사버튼) 복사하기(복사버튼);
    });
  }

  /* =====================================================================
     1. 자주 묻는 질문 6개
     ===================================================================== */
  function 자주묻는질문그리기() {
    요소('자주묻는질문').innerHTML = CONFIG.FAQ_QUESTIONS.map(function (질문) {
      return '<button type="button" class="자주묻는질문-버튼" data-질문="' +
        UI.안전한글자(질문) + '">' + UI.안전한글자(질문) + '</button>';
    }).join('');
  }

  function 자주묻는질문표시(보일까) {
    요소('자주묻는질문').classList.toggle('숨김', !보일까);
  }

  /* =====================================================================
     2. 규정 자료가 없을 때 안내
     ===================================================================== */
  function 자료없음안내갱신() {
    DB.getAllDocuments().then(function (자료들) {
      요소('자료없음안내').classList.toggle('숨김', 자료들.length > 0);
    });
  }

  /* =====================================================================
     3. 입력칸
     ===================================================================== */
  function 입력칸높이맞추기() {
    var 입력 = 요소('질문입력');
    입력.style.height = 'auto';
    입력.style.height = Math.min(입력.scrollHeight, 130) + 'px';
  }

  function 입력초기화() {
    var 입력 = 요소('질문입력');
    입력.value = '';
    입력.style.height = 'auto';
  }

  /* =====================================================================
     4. 대화 지우기
     ===================================================================== */
  function 대화지우기() {
    if (기록.length === 0) return;
    var 확인 = window.confirm('나눈 대화를 모두 지울까요?\n등록된 규정 자료는 지워지지 않습니다.');
    if (!확인) return;

    DB.clearChatHistory().then(function () {
      기록 = [];
      그리기();
      UI.쪽지('대화를 지웠습니다.');
    });
  }

  /* =====================================================================
     5. 질문 보내기 (핵심 흐름)
     ===================================================================== */
  function 보내기(글자) {
    var 질문 = String(글자 || '').trim();
    if (!질문 || 진행중) return;

    입력초기화();
    진행중 = true;
    전송버튼상태(true);

    기록.push({ role: '사용자', text: 질문, at: DB.nowString() });
    DB.saveChatHistory(기록);
    그리기();

    컨텍스트만들기(질문).then(function (컨텍스트글) {

      // 근거가 될 만한 조각이 하나도 없다(=자료가 없거나, 검색에 하나도 안 걸림) → API를 부르지 않고 바로 안내
      if (컨텍스트글 === null) {
        못찾음으로마무리(질문);
        return;
      }

      var 시스템프롬프트 = 시스템프롬프트만들기(컨텍스트글);
      스트리밍시작(질문, 시스템프롬프트);
    });
  }

  function 전송버튼상태(막을까) {
    요소('전송버튼').disabled = 막을까;
    요소('질문입력').disabled = 막을까;
  }

  /* -----------------------------------------------------------------------
     조각을 모아 AI에게 보낼 [사내 규정 자료] 글을 만든다.
     반환 : Promise<string|null>   null 이면 "근거 될 조각이 아예 없음"
     ----------------------------------------------------------------------- */
  function 컨텍스트만들기(질문) {
    return DB.getAllDocuments().then(function (자료들) {
      var 자료명맵 = {};
      자료들.forEach(function (d) { 자료명맵[d.id] = d.name; });
      var 총글자수 = 자료들.reduce(function (합, d) { return 합 + (d.charCount || 0); }, 0);

      return DB.getAllChunks().then(function (전체조각) {
        if (전체조각.length === 0) return null;

        var 사용할조각들;
        if (총글자수 <= CONFIG.FULL_CONTEXT_LIMIT) {
          // 전체를 다 보낼 수 있을 만큼 적으면, 가장 정확하도록 전부 보낸다.
          사용할조각들 = 전체조각;
        } else {
          // 많으면 질문과 겹치는 부분만 골라서 보낸다.
          사용할조각들 = Chunker.search(질문, 전체조각).map(function (항목) { return 항목.chunk; });
        }

        if (사용할조각들.length === 0) return null;

        var 글 = 사용할조각들.map(function (조각) {
          var 자료명 = 자료명맵[조각.docId] || '(자료명 확인 불가)';
          return '▶ 출처: ' + 자료명 + ' — ' + 조각.title + '\n' + 조각.body;
        }).join('\n\n---\n\n');

        return 글;
      });
    });
  }

  /* -----------------------------------------------------------------------
     AI에게 보낼 지시문. "지어내지 않기" 규칙을 맨 앞에 강하게 적는다.
     ----------------------------------------------------------------------- */
  function 시스템프롬프트만들기(컨텍스트글) {
    return [
      '당신은 회사 내부 규정을 안내하는 사내 챗봇입니다.',
      '',
      '★★★ 무엇보다 먼저 지켜야 하는 가장 중요한 규칙 ★★★',
      '아래 [사내 규정 자료]에 실제로 적힌 내용에서 근거를 찾을 수 있는 것만 답하세요.',
      '자료에 없는 내용은 절대로 추측하거나, 일반 상식이나 다른 회사의 사례로 답하지 마세요.',
      '근거를 자료에서 전혀 찾지 못했다면, 다른 어떤 말도 덧붙이지 말고 아래 문장을 한 글자도',
      '바꾸지 않고 그대로 출력하세요.',
      '"' + CONFIG.NOT_FOUND_MESSAGE + '"',
      '',
      '자료의 일부에서만 근거를 찾았다면, 있는 부분과 없는 부분을 나누어 설명하세요.',
      '예시: "규정에 명시된 부분은 ○○이고, △△에 대해서는 규정에 언급이 없습니다."',
      '',
      '답변 형식 규칙 (반드시 지킬 것):',
      '1. 근거를 하나라도 찾았다면, 답변을 다 쓴 다음 마지막 줄에 이 형식으로 출처를 적으세요.',
      '   출처: 파일명 — 소제목',
      '   여러 근거를 썼다면 쉼표로 구분해서 모두 적으세요.',
      '   예: 출처: 취업규칙.pdf — 제23조(연차유급휴가), 복리후생규정.pdf — 제46조(경조금)',
      '2. 근거를 전혀 찾지 못한 경우에는 출처 줄을 적지 말고, 위에 지정된 안내 문장만 출력하세요.',
      '3. 답변은 한국어 존댓말로, 필요한 내용만 간결하게 적으세요.',
      '4. [사내 규정 자료]에 없는 주민등록번호·계좌번호·급여·인사평가 등 개인정보는 다루지 마세요.',
      '',
      '[사내 규정 자료]',
      컨텍스트글
    ].join('\n');
  }

  /* -----------------------------------------------------------------------
     스트리밍 답변 받기
     ----------------------------------------------------------------------- */
  function 스트리밍시작(질문, 시스템프롬프트) {
    var 말풍선 = 임시말풍선만들기();
    var 누적글자 = '';

    지금컨트롤러 = Gemini.질문하기({
      apiKey: DB.getApiKey(),
      systemPrompt: 시스템프롬프트,
      question: 질문,

      onChunk: function (글자조각) {
        누적글자 += 글자조각;
        말풍선.본문글자설정(누적글자);
        화면끝으로스크롤();
      },

      onDone: function (중단이유) {
        지금컨트롤러 = null;
        말풍선.요소.remove();

        // 드물게 안전 필터 등으로 AI가 글자를 하나도 보내지 않을 때가 있다.
        // 이때 빈 말풍선을 그대로 남기지 않고, 안내 후 다시 시도할 수 있게 한다.
        if (누적글자.trim().length === 0) {
          진행중 = false;
          전송버튼상태(false);
          UI.쪽지(빈응답안내문구(중단이유), '오류');
          그리기();
          return;
        }

        var 정리됨 = 마무리처리(누적글자);
        var 항목 = { role: 'AI', text: 정리됨.본문, at: DB.nowString() };
        if (정리됨.출처) 항목.source = 정리됨.출처;
        기록.push(항목);
        DB.saveChatHistory(기록);

        if (정리됨.못찾음) DB.addUnanswered(질문);

        진행중 = false;
        전송버튼상태(false);
        그리기();
      },

      onError: function (한글오류) {
        지금컨트롤러 = null;
        말풍선.요소.remove();
        진행중 = false;
        전송버튼상태(false);
        UI.쪽지(한글오류, '오류');
        그리기();
      }
    });
  }

  /* AI가 글자를 하나도 안 보냈을 때 보여줄 한국어 안내 문구. */
  function 빈응답안내문구(중단이유) {
    if (중단이유 === 'SAFETY' || 중단이유 === 'BLOCKED') {
      return 'AI 안전 정책에 걸려 답변이 만들어지지 않았습니다. 질문을 조금 다르게 표현해 다시 시도해 주세요.';
    }
    if (중단이유 === 'RECITATION') {
      return '자료 내용을 그대로 옮기는 답변이라 판단되어 응답이 제한되었습니다. 다시 시도해 주세요.';
    }
    return 'AI가 답변을 만들지 못했습니다. 잠시 후 다시 시도해 주세요.';
  }

  /* 근거 조각 자체가 하나도 없을 때 : API를 부르지 않고 바로 안내 문장으로 답한다. */
  function 못찾음으로마무리(질문) {
    기록.push({ role: 'AI', text: CONFIG.NOT_FOUND_MESSAGE, at: DB.nowString() });
    DB.saveChatHistory(기록);
    DB.addUnanswered(질문);

    진행중 = false;
    전송버튼상태(false);
    그리기();
  }

  /* AI가 보낸 전체 글에서 "출처:" 줄을 떼어내고, "못 찾았습니다" 답변인지 확인한다. */
  function 마무리처리(전체글) {
    var 다듬은글 = String(전체글 || '').trim();

    if (완전히못찾음인가(다듬은글)) {
      return { 본문: CONFIG.NOT_FOUND_MESSAGE, 출처: null, 못찾음: true };
    }

    var 출처매치 = /\n?출처\s*[:：]\s*([\s\S]+)$/.exec(다듬은글);
    if (출처매치) {
      return {
        본문: 다듬은글.slice(0, 출처매치.index).trim(),
        출처: 출처매치[1].trim(),
        못찾음: false
      };
    }

    return { 본문: 다듬은글, 출처: null, 못찾음: false };
  }

  /* 모델이 문구를 아주 살짝 바꿔 냈을 경우까지 감안한 "완전히 못 찾음" 판정.
     (부분 답변과 헷갈리지 않도록, 전체 길이가 짧고 핵심 표현이 다 있을 때만 인정) */
  function 완전히못찾음인가(글) {
    var 공백뺀것 = 글.replace(/\s+/g, '');
    var 기준 = CONFIG.NOT_FOUND_MESSAGE.replace(/\s+/g, '');
    if (공백뺀것 === 기준) return true;

    var 핵심1 = '찾지못했습니다';
    var 핵심2 = 'HR담당자';
    return 공백뺀것.length <= 기준.length + 20 &&
           공백뺀것.indexOf(핵심1) !== -1 &&
           공백뺀것.indexOf(핵심2) !== -1;
  }

  /* =====================================================================
     6. 화면 그리기
     ===================================================================== */
  function 임시말풍선만들기() {
    var 상자 = document.createElement('div');
    상자.className = '말풍선 AI 진행중';
    상자.innerHTML = '<div class="말풍선-본문"><span class="타이핑점"></span></div>';
    요소('대화상자').appendChild(상자);
    화면끝으로스크롤();

    var 본문요소 = 상자.querySelector('.말풍선-본문');
    var 채워지기시작 = false;

    return {
      요소: 상자,
      본문글자설정: function (값) {
        // 첫 글자가 오면 점 애니메이션(타이핑점)을 지우고 글자로 채운다
        if (!채워지기시작) { 본문요소.innerHTML = ''; 채워지기시작 = true; }
        본문요소.textContent = 값;
      }
    };
  }

  function 그리기() {
    자주묻는질문표시(기록.length === 0);

    요소('대화상자').innerHTML = 기록.map(말풍선HTML).join('');
    화면끝으로스크롤();
  }

  function 말풍선HTML(항목, 인덱스) {
    var 사용자인가 = (항목.role === '사용자');

    if (사용자인가) {
      return (
        '<div class="말풍선 사용자">' +
          '<div class="말풍선-본문">' + UI.안전한글자(항목.text) + '</div>' +
        '</div>'
      );
    }

    var 출처칸 = 항목.source
      ? '<div class="말풍선-출처">📎 출처: ' + UI.안전한글자(항목.source) + '</div>'
      : '';

    return (
      '<div class="말풍선 AI">' +
        '<div class="말풍선-본문">' + UI.안전한글자(항목.text) + '</div>' +
        출처칸 +
        '<button type="button" class="복사버튼" data-인덱스="' + 인덱스 + '">복사</button>' +
      '</div>'
    );
  }

  function 화면끝으로스크롤() {
    window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'auto' });
  }

  /* =====================================================================
     7. 답변 복사
     ===================================================================== */
  function 복사하기(버튼) {
    var 인덱스 = parseInt(버튼.dataset.인덱스, 10);
    var 항목 = 기록[인덱스];
    if (!항목) return;

    var 글 = 항목.text + (항목.source ? '\n\n출처: ' + 항목.source : '');

    복사실행(글).then(function () {
      UI.쪽지('답변을 복사했습니다.');
    }).catch(function () {
      UI.쪽지('복사하지 못했습니다. 글을 길게 눌러 직접 선택해 주세요.', '오류');
    });
  }

  function 복사실행(글) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(글);
    }
    // 예전 브라우저 / file:// 환경을 위한 대체 방법
    return new Promise(function (resolve, reject) {
      try {
        var 임시 = document.createElement('textarea');
        임시.value = 글;
        임시.style.position = 'fixed';
        임시.style.opacity = '0';
        document.body.appendChild(임시);
        임시.select();
        var 성공 = document.execCommand('copy');
        document.body.removeChild(임시);
        성공 ? resolve() : reject();
      } catch (e) {
        reject(e);
      }
    });
  }

  return {
    초기화: 초기화,
    화면진입시: 화면진입시
  };
})();
