/* =========================================================================
   Gemini API 호출 (gemini.js)
   -------------------------------------------------------------------------
   브라우저에서 곧바로 Gemini 서버에 스트리밍으로 질문을 보내고,
   글자가 오는 대로 한 글자씩 화면에 전달합니다.

   ★ 모델명·주소는 js/config.js 한 곳에만 있습니다. 이 파일은 그 값을 가져다 쓸 뿐입니다.
   ★ Gemini 3.x 계열은 temperature·top_p·top_k 설정이 사용 중단되어 보내지 않습니다.
   ========================================================================= */

var Gemini = (function () {

  // 이만큼 아무 반응(연결·글자 어느 쪽도)이 없으면, 서버가 응답을 안 주는 것으로 보고
  // 스스로 요청을 중단한다. (안 그러면 화면이 "묵묵부답" 상태로 영원히 멈출 수 있다)
  var 무응답한도_밀리초 = 30000;

  /* -----------------------------------------------------------------------
     요청 하나 보내기 (스트리밍)
     옵션 : { apiKey, systemPrompt, question, onChunk(글자), onDone(중단이유), onError(한글오류) }
     ※ 중단이유 : 정상 종료면 null. 구글의 안전 정책 등으로 글자 없이 끝났다면
       'SAFETY' | 'RECITATION' | 'BLOCKED' | '기타' 중 하나가 전달된다.
     ----------------------------------------------------------------------- */
  function 질문하기(옵션) {
    var 본문 = {
      systemInstruction: { parts: [{ text: 옵션.systemPrompt }] },
      contents: [
        { role: 'user', parts: [{ text: 옵션.question }] }
      ],
      // ★ temperature / topP / topK 는 넣지 않습니다 (Gemini 3.x 계열 사용 중단값)
      generationConfig: {
        // Gemini 3.x 계열은 답하기 전에 속으로 "생각"하는 데도 출력 토큰을 함께 씁니다.
        // 한도를 안 정해두면 그 생각하는 과정만으로 예산이 다 차서, 화면에 보일 글자가
        // 하나도 안 나오고 끝나버리는 경우가 있어 넉넉하게 잡아 둡니다.
        // (thinkingConfig 같은 세부 옵션은 모델마다 허용값이 달라 오류 위험이 있어 넣지 않습니다)
        maxOutputTokens: 8192
      }
    };

    var 컨트롤러 = new AbortController();

    // ---- 무응답 감시(워치독) : 연결도 글자도 한동안 전혀 없으면 스스로 중단한다 ----
    var 타임아웃으로중단됨 = false;
    var 마지막활동시각 = Date.now();
    var 감시타이머 = setInterval(function () {
      if (Date.now() - 마지막활동시각 > 무응답한도_밀리초) {
        타임아웃으로중단됨 = true;
        clearInterval(감시타이머);
        컨트롤러.abort();
      }
    }, 1000);
    function 활동있음() { 마지막활동시각 = Date.now(); }

    fetch(CONFIG.getStreamUrl(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // ★ 키는 헤더로만 전달한다. 주소창(쿼리스트링)에는 절대 넣지 않는다.
        [CONFIG.API_KEY_HEADER]: 옵션.apiKey
      },
      body: JSON.stringify(본문),
      signal: 컨트롤러.signal
    })
      .then(function (response) {
        활동있음();
        if (!response.ok) {
          return response.json().catch(function () { return null; })
            .then(function (오류바디) {
              throw 오류만들기(response.status, 오류바디);
            });
        }
        return 스트림읽기(response, 옵션.onChunk, 활동있음);
      })
      .then(function (중단이유) {
        clearInterval(감시타이머);
        옵션.onDone(중단이유);
      })
      .catch(function (오류) {
        clearInterval(감시타이머);
        옵션.onError(타임아웃으로중단됨 ? 무응답오류문구() : 한글오류문구(오류));
      });

    return 컨트롤러;
  }

  function 무응답오류문구() {
    return '서버로부터 응답이 없어 요청을 중단했습니다. 인터넷 연결 상태를 확인하고 다시 시도해 주세요.';
  }

  /* -----------------------------------------------------------------------
     SSE(Server-Sent Events) 형식의 스트림 응답을 한 줄씩 읽는다.
     반환값(Promise) : 정상 종료면 null, 안전 정책 등으로 막혔다면 그 사유 문자열.
     ----------------------------------------------------------------------- */
  function 스트림읽기(response, onChunk, 활동있음) {
    var reader = response.body.getReader();
    var decoder = new TextDecoder('utf-8');
    var 버퍼 = '';
    var 중단이유 = null;

    function 한덩이씩() {
      return reader.read().then(function (결과) {
        if (결과.done) return 중단이유;

        활동있음();
        버퍼 += decoder.decode(결과.value, { stream: true });

        // SSE 이벤트는 빈 줄(\n\n)로 구분된다. 마지막 미완성 조각은 버퍼에 남겨 둔다.
        var 조각들 = 버퍼.split('\n\n');
        버퍼 = 조각들.pop();

        조각들.forEach(function (조각) {
          var 줄 = 조각.trim();
          if (줄.indexOf('data:') !== 0) return;

          var json글자 = 줄.slice(5).trim();
          if (!json글자) return;

          try {
            var 파싱됨 = JSON.parse(json글자);
            글자꺼내기(파싱됨).forEach(onChunk);
            var 이번이유 = 중단이유찾기(파싱됨);
            if (이번이유) 중단이유 = 이번이유;
          } catch (e) {
            // 중간에 잘린 JSON 조각은 조용히 건너뛴다 (다음 덩이에서 이어짐)
          }
        });

        return 한덩이씩();
      });
    }

    return 한덩이씩();
  }

  function 글자꺼내기(응답조각) {
    var 결과 = [];
    var 후보들 = 응답조각 && 응답조각.candidates;
    if (!후보들 || !후보들[0] || !후보들[0].content || !후보들[0].content.parts) return 결과;

    후보들[0].content.parts.forEach(function (part) {
      if (typeof part.text === 'string') 결과.push(part.text);
    });
    return 결과;
  }

  /* 글자가 하나도 안 왔을 때, 왜 막혔는지 짐작할 단서를 찾는다.
     ※ MAX_TOKENS 는 답이 어느 정도 나온 뒤 잘린 경우에는 문제가 아니지만,
       (누적 글자가 하나도 없는 상태에서) 이 사유로 끝났다면 "생각하는 데 토큰을
       다 써버려 답을 하나도 못 냄"인 경우이므로 정상 종료로 보지 않는다. */
  function 중단이유찾기(응답조각) {
    if (응답조각 && 응답조각.promptFeedback && 응답조각.promptFeedback.blockReason) return 'BLOCKED';

    var 후보 = 응답조각 && 응답조각.candidates && 응답조각.candidates[0];
    if (!후보 || !후보.finishReason) return null;
    if (후보.finishReason === 'STOP') return null;
    if (후보.finishReason === 'SAFETY' || 후보.finishReason === 'RECITATION') return 후보.finishReason;
    if (후보.finishReason === 'MAX_TOKENS') return 'MAX_TOKENS';
    return '기타';
  }

  /* -----------------------------------------------------------------------
     오류를 한국어 안내 문구로 바꾸기
     ----------------------------------------------------------------------- */
  function 오류만들기(상태코드, 바디) {
    var 오류 = new Error(바디 && 바디.error && 바디.error.message ? 바디.error.message : ('HTTP ' + 상태코드));
    오류.status = 상태코드;
    return 오류;
  }

  function 한글오류문구(오류) {
    // 인터넷이 끊긴 경우 : fetch 자체가 실패하며 status 가 없다.
    if (!오류 || 오류.status == null) {
      if (오류 && 오류.name === 'AbortError') return '요청을 취소했습니다.';
      return '인터넷 연결을 확인해 주세요. 연결이 끊어져 답변을 가져오지 못했습니다.';
    }

    if (오류.status === 400 || 오류.status === 403) {
      return 'API 키가 올바르지 않습니다. [키 설정]에서 키를 다시 확인해 주세요.';
    }
    if (오류.status === 429) {
      return '무료 사용량 한도를 넘었습니다. 잠시 후 다시 시도하거나 내일 다시 시도해 주세요.';
    }
    if (오류.status >= 500) {
      return '구글 Gemini 서버에 일시적인 문제가 있습니다. 잠시 후 다시 시도해 주세요.';
    }
    return '답변을 가져오는 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.';
  }

  return {
    질문하기: 질문하기
  };
})();
