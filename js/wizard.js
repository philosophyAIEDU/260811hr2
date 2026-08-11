/* =========================================================================
   화면 4 : 규정 만들기 마법사 (wizard.js)
   -------------------------------------------------------------------------
   문서가 없는 회사를 위해, 주제별로 몇 가지 질문에 답하면
   AI가 그 답변만 근거로 규정 문장을 정리해 준다.
   (질문에 없는 내용을 지어내지 않도록 지시문에 명시한다)
   ========================================================================= */

var Wizard = (function () {

  var 요소 = UI.요소;

  var 선택된주제들 = [];     // 사용자가 고른 주제 이름 배열 (CONFIG.WIZARD_TOPICS 순서)
  var 전체질문목록 = [];     // 선택된 주제의 질문을 순서대로 이어붙인 배열
  var 답변모음 = {};         // { 질문id: '예'|'아니오'|직접 입력한 글 }
  var 현재인덱스 = 0;
  var 지금컨트롤러 = null;

  /* =====================================================================
     0. 시작
     ===================================================================== */
  function 초기화() {
    주제목록그리기();
    연결하기();
    리셋();
  }

  /* "문서가 없어요" 버튼으로 들어올 때마다 처음(주제 선택)부터 시작한다. */
  function 리셋() {
    if (지금컨트롤러) { 지금컨트롤러.abort(); 지금컨트롤러 = null; }
    선택된주제들 = [];
    전체질문목록 = [];
    답변모음 = {};
    현재인덱스 = 0;

    주제선택초기화();
    단계보이기('주제선택');
  }

  function 연결하기() {
    요소('마법사-주제목록').addEventListener('click', function (e) {
      var 카드 = e.target.closest('.마법사-주제카드');
      if (카드) 주제토글(카드.dataset.주제);
    });

    요소('마법사-시작버튼').addEventListener('click', 질문시작);
    요소('마법사-취소버튼1').addEventListener('click', 자료화면으로);
    요소('마법사-취소버튼2').addEventListener('click', 자료화면으로);
    요소('마법사-취소버튼3').addEventListener('click', 자료화면으로);

    요소('마법사-이전버튼').addEventListener('click', function () { 이동(-1); });
    요소('마법사-다음버튼').addEventListener('click', function () { 이동(1); });
    요소('마법사-건너뛰기버튼').addEventListener('click', function () { 이동(1, true); });

    요소('마법사-저장버튼').addEventListener('click', 저장하기);
    요소('마법사-다시만들기버튼').addEventListener('click', 정리요청);
  }

  function 자료화면으로() {
    var 진행중있음 = (현재인덱스 > 0) || Object.keys(답변모음).length > 0;
    if (진행중있음) {
      var 확인 = window.confirm('지금까지 답한 내용이 저장되지 않습니다. 규정 자료 화면으로 돌아갈까요?');
      if (!확인) return;
    }
    리셋();
    UI.화면보이기('자료');
  }

  function 단계보이기(이름) {
    ['주제선택', '진행', '결과'].forEach(function (키) {
      요소('마법사-' + 키).classList.toggle('숨김', 키 !== 이름);
    });
    window.scrollTo(0, 0);
  }

  /* =====================================================================
     1. 주제 선택
     ===================================================================== */
  function 주제목록그리기() {
    요소('마법사-주제목록').innerHTML = CONFIG.WIZARD_TOPICS.map(function (주제) {
      var 문항수 = (WIZARD_QUESTIONS[주제] || []).length;
      return (
        '<button type="button" class="마법사-주제카드" data-주제="' + UI.안전한글자(주제) + '">' +
          '<span class="마법사-주제카드-체크" aria-hidden="true"></span>' +
          '<span class="마법사-주제카드-글">' +
            '<span class="마법사-주제카드-이름">' + UI.안전한글자(주제) + '</span>' +
            '<span class="마법사-주제카드-설명">질문 ' + 문항수 + '개</span>' +
          '</span>' +
        '</button>'
      );
    }).join('');
  }

  function 주제선택초기화() {
    var 카드들 = document.querySelectorAll('.마법사-주제카드');
    Array.prototype.forEach.call(카드들, function (카드) { 카드.classList.remove('선택됨'); });
    요소('마법사-시작버튼').disabled = true;
  }

  function 주제토글(주제) {
    var 인덱스 = 선택된주제들.indexOf(주제);
    if (인덱스 === -1) 선택된주제들.push(주제); else 선택된주제들.splice(인덱스, 1);

    var 카드 = document.querySelector('.마법사-주제카드[data-주제="' + CSS.escape(주제) + '"]');
    if (카드) 카드.classList.toggle('선택됨', 인덱스 === -1);

    요소('마법사-시작버튼').disabled = (선택된주제들.length === 0);
  }

  /* =====================================================================
     2. 질문 진행
     ===================================================================== */
  function 질문시작() {
    if (선택된주제들.length === 0) return;

    // 화면에 보이는 주제 카드 순서(=CONFIG.WIZARD_TOPICS 순서)대로 질문을 이어붙인다.
    전체질문목록 = [];
    CONFIG.WIZARD_TOPICS.forEach(function (주제) {
      if (선택된주제들.indexOf(주제) === -1) return;
      (WIZARD_QUESTIONS[주제] || []).forEach(function (문항) {
        전체질문목록.push(Object.assign({ topic: 주제 }, 문항));
      });
    });

    답변모음 = {};
    현재인덱스 = 0;
    단계보이기('진행');
    질문그리기();
  }

  function 질문그리기() {
    var 총수 = 전체질문목록.length;
    var 문항 = 전체질문목록[현재인덱스];

    var 진행률 = Math.round(((현재인덱스) / 총수) * 100);
    요소('마법사-진행바').style.width = 진행률 + '%';
    요소('마법사-진행표시').textContent = '질문 ' + (현재인덱스 + 1) + ' / ' + 총수;
    요소('마법사-주제라벨').textContent = 문항.topic;
    요소('마법사-질문글').textContent = 문항.q;

    var 저장된답 = 답변모음[문항.id];
    요소('마법사-답변영역').innerHTML = 답변영역HTML(문항, 저장된답);
    답변영역연결(문항);

    요소('마법사-이전버튼').disabled = (현재인덱스 === 0);
    요소('마법사-다음버튼').textContent = (현재인덱스 === 총수 - 1) ? 'AI로 정리하기 →' : '다음 →';

    // 글로 바로 답하는 문항은 입력칸에 자동으로 초점을 준다.
    if (문항.type === 'text') {
      var 입력 = 요소('마법사-직접입력');
      if (입력) setTimeout(function () { 입력.focus(); }, 30);
    }
  }

  function 답변영역HTML(문항, 저장된답) {
    if (문항.type === 'text') {
      return (
        '<textarea class="입력칸" id="마법사-직접입력" rows="2" placeholder="' +
          UI.안전한글자(문항.placeholder || '') + '">' + UI.안전한글자(저장된답 || '') + '</textarea>'
      );
    }

    // yesno : 예 / 아니오 / 직접입력
    var 예선택됨 = (저장된답 === '예');
    var 아니오선택됨 = (저장된답 === '아니오');
    var 직접선택됨 = !!(저장된답 && !예선택됨 && !아니오선택됨);

    return (
      '<div class="마법사-예아니오">' +
        '<button type="button" class="마법사-예아니오버튼' + (예선택됨 ? ' 선택됨' : '') + '" data-값="예">예</button>' +
        '<button type="button" class="마법사-예아니오버튼' + (아니오선택됨 ? ' 선택됨' : '') + '" data-값="아니오">아니오</button>' +
      '</div>' +
      '<textarea class="입력칸 마법사-직접입력줄" id="마법사-직접입력" rows="2" ' +
        'placeholder="위 답과 다르다면 여기에 직접 적어주세요 (선택 사항)">' +
        UI.안전한글자(직접선택됨 ? 저장된답 : '') + '</textarea>'
    );
  }

  function 답변영역연결(문항) {
    if (문항.type === 'yesno') {
      var 버튼들 = document.querySelectorAll('.마법사-예아니오버튼');
      Array.prototype.forEach.call(버튼들, function (버튼) {
        버튼.addEventListener('click', function () {
          Array.prototype.forEach.call(버튼들, function (b) { b.classList.remove('선택됨'); });
          버튼.classList.add('선택됨');
          요소('마법사-직접입력').value = '';   // 예/아니오를 고르면 직접입력은 비운다
        });
      });
    }
  }

  /* 화면에서 지금 입력된 답을 읽어서 답변모음에 저장한다. */
  function 현재답저장() {
    var 문항 = 전체질문목록[현재인덱스];
    var 직접입력값 = (요소('마법사-직접입력') && 요소('마법사-직접입력').value.trim()) || '';

    if (직접입력값) {
      답변모음[문항.id] = 직접입력값;
      return;
    }

    if (문항.type === 'yesno') {
      var 선택버튼 = document.querySelector('.마법사-예아니오버튼.선택됨');
      답변모음[문항.id] = 선택버튼 ? 선택버튼.dataset.값 : null;
    } else {
      답변모음[문항.id] = null;
    }
  }

  /* 방향 : -1(이전) / 1(다음). 건너뛰기면 지금 답을 지우고 넘어간다. */
  function 이동(방향, 건너뛸까) {
    if (건너뛸까) {
      delete 답변모음[전체질문목록[현재인덱스].id];
    } else {
      현재답저장();
    }

    var 다음인덱스 = 현재인덱스 + 방향;

    if (다음인덱스 < 0) return;

    if (다음인덱스 >= 전체질문목록.length) {
      정리요청();
      return;
    }

    현재인덱스 = 다음인덱스;
    질문그리기();
  }

  /* =====================================================================
     3. AI로 정리하기
     ===================================================================== */
  function 정리요청() {
    var 답변글 = 답변정리글만들기();

    if (!답변글) {
      UI.쪽지('답변한 질문이 없어 정리할 내용이 없습니다. 몇 가지만 답해 주세요.', '오류');
      단계보이기('진행');
      return;
    }

    단계보이기('결과');
    요소('마법사-결과제목').textContent = 'AI가 답변을 정리하고 있습니다…';
    요소('마법사-결과글').value = '';
    요소('마법사-결과글').disabled = true;
    요소('마법사-저장버튼').disabled = true;
    요소('마법사-다시만들기버튼').disabled = true;

    var 시스템프롬프트 = [
      '당신은 사내 규정을 조항 형식으로 정리해 주는 도우미입니다.',
      '아래는 담당자가 설문에 답변한 내용입니다. 이 답변에 있는 내용만 근거로 삼아 정리하세요.',
      '답변하지 않았거나 건너뛴 질문은 규정에 넣지 말고 조용히 생략하세요.',
      '답변에 없는 숫자나 조건을 지어내거나 추측해서 채우지 마세요.',
      '주제마다 "## 주제명" 형식의 소제목으로 구분하고, 그 아래에 실제 사내 규정집처럼',
      '자연스러운 조항 문장으로 정리하세요. (예: "회사는 ~에게 ~을 부여한다." 같은 문체)',
      '한국어 존댓말로, 군더더기 설명이나 인사말 없이 규정 내용만 출력하세요.'
    ].join('\n');

    var 누적글자 = '';
    지금컨트롤러 = Gemini.질문하기({
      apiKey: DB.getApiKey(),
      systemPrompt: 시스템프롬프트,
      question: 답변글,

      onChunk: function (글자조각) {
        누적글자 += 글자조각;
        요소('마법사-결과글').value = 누적글자;
      },

      onDone: function () {
        지금컨트롤러 = null;
        마무리(누적글자.trim());
      },

      onError: function (한글오류) {
        지금컨트롤러 = null;
        요소('마법사-결과제목').textContent = '정리하지 못했습니다';
        UI.쪽지(한글오류, '오류');
        요소('마법사-다시만들기버튼').disabled = false;
      }
    });
  }

  function 마무리(결과글) {
    요소('마법사-결과제목').textContent = '정리된 내용을 확인하고 필요하면 고쳐 주세요';
    요소('마법사-결과글').value = 결과글;
    요소('마법사-결과글').disabled = false;
    요소('마법사-저장버튼').disabled = false;
    요소('마법사-다시만들기버튼').disabled = false;

    if (!요소('마법사-자료명입력').value.trim()) {
      var 오늘 = DB.nowString().slice(0, 10);
      var 주제글 = 선택된주제들.join('·');
      요소('마법사-자료명입력').value = '마법사로 만든 규정 - ' + 주제글 + ' (' + 오늘 + ').md';
    }
  }

  /* 질문·답을 AI에게 보낼 하나의 글로 정리한다. (미답변/건너뛴 항목은 뺀다) */
  function 답변정리글만들기() {
    var 주제별 = {};
    전체질문목록.forEach(function (문항) {
      var 답 = 답변모음[문항.id];
      if (!답) return;
      if (!주제별[문항.topic]) 주제별[문항.topic] = [];
      주제별[문항.topic].push('- ' + 문항.q + ' → ' + 답);
    });

    var 주제글목록 = Object.keys(주제별).map(function (주제) {
      return '[' + 주제 + ']\n' + 주제별[주제].join('\n');
    });

    return 주제글목록.join('\n\n');
  }

  /* =====================================================================
     4. 저장
     ===================================================================== */
  function 저장하기() {
    var 자료명 = 요소('마법사-자료명입력').value.trim() || '마법사로 만든 규정.md';
    var 내용 = 요소('마법사-결과글').value.trim();

    if (!내용) {
      UI.쪽지('저장할 내용이 없습니다.', '오류');
      return;
    }

    DB.addDocument(자료명, 내용, '마법사생성').then(function () {
      UI.쪽지('"' + 자료명 + '" 규정을 등록했습니다.');
      리셋();
      UI.화면보이기('자료');
      Docs.자료목록그리기();
    });
  }

  return {
    초기화: 초기화,
    리셋: 리셋
  };
})();
