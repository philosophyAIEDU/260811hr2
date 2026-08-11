/* =========================================================================
   설정 파일 (config.js)
   -------------------------------------------------------------------------
   ★ 모델을 바꿔야 할 때는 아래 MODEL_NAME 한 줄만 고치면 됩니다.
     코드 다른 곳에는 모델명을 절대 적지 마세요.
   ========================================================================= */

var CONFIG = {

  /* ---------- ★★★ 모델 설정 (여기 한 줄만 수정) ★★★ ---------- */
  MODEL_NAME: 'gemini-3.5-flash-lite',

  /* ---------- Gemini API 접속 정보 ---------- */
  API_BASE: 'https://generativelanguage.googleapis.com/v1beta/models',
  API_KEY_HEADER: 'x-goog-api-key',   // 키는 헤더로 전달 (주소창에 노출 금지)
  API_KEY_ISSUE_URL: 'https://aistudio.google.com/apikey',

  /* ---------- 저장소 이름 ---------- */
  DB_NAME: 'sanae-gyujeong-faq',      // IndexedDB 데이터베이스 이름
  DB_VERSION: 1,
  APIKEY_STORAGE_KEY: 'sanae_gyujeong_api_key',   // localStorage 열쇠 이름

  /* ---------- 조각 나누기 / 검색 기준 ---------- */
  MAX_CHUNK_LENGTH: 1200,      // 조각 하나의 최대 글자 수
  FULL_CONTEXT_LIMIT: 300000,  // 이 글자 수 이하이면 전체 조각을 그대로 전송
  TOP_CHUNK_COUNT: 12,         // 글자 수가 넘칠 때 보낼 상위 조각 개수

  /* ---------- 고정 문구 ---------- */
  // 규정에서 근거를 못 찾았을 때 반드시 이 문장만 출력한다.
  NOT_FOUND_MESSAGE:
    '첨부된 사내 규정에서 관련 내용을 찾지 못했습니다.\nHR 담당자에게 직접 문의해 주세요.',

  // 규정 자료 화면 상단에 항상 표시할 경고
  UPLOAD_WARNING:
    '⚠ 질문할 때 규정 내용 일부가 구글 Gemini 서버로 전송됩니다. ' +
    '급여명세서, 인사평가표, 개인 신상정보가 담긴 파일은 올리지 마세요.',

  // 앱 하단에 항상 고정 표시할 안내
  FOOTER_NOTICE:
    '이 답변은 첨부된 사내 규정을 기반으로 한 참고용입니다. 최종 확인은 HR 담당자에게 받으세요.',

  /* ---------- 자주 묻는 질문 6개 ---------- */
  FAQ_QUESTIONS: [
    '연차 며칠 남았는지 어떻게 확인해요?',
    '육아휴직 신청 절차는?',
    '출산휴가는 며칠인가요?',
    '조의금 지원 기준은?',
    '재택근무 신청 방법은?',
    '교육비 지원받을 수 있나요?'
  ],

  /* ---------- 규정 만들기 마법사 주제 6개 ---------- */
  WIZARD_TOPICS: [
    '연차/휴가',
    '육아휴직·출산',
    '경조사·경조금',
    '복리후생·수당',
    '근무시간·재택',
    '교육·자기계발'
  ],

  /* ---------- 첨부 가능한 파일 형식 ---------- */
  ALLOWED_EXTENSIONS: ['pdf', 'docx', 'txt', 'md'],

  /* ---------- 외부 라이브러리 CDN 주소 ---------- */
  CDN: {
    PDFJS: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
    PDFJS_WORKER: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
    MAMMOTH: 'https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js'
  }
};

/* 스트리밍 호출 주소를 만들어 준다.
   예) https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:streamGenerateContent?alt=sse */
CONFIG.getStreamUrl = function () {
  return CONFIG.API_BASE + '/' + CONFIG.MODEL_NAME + ':streamGenerateContent?alt=sse';
};
