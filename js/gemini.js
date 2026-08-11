/* =========================================================================
   Gemini API 호출 (gemini.js)
   -------------------------------------------------------------------------
   브라우저에서 곧바로 Gemini 서버에 스트리밍으로 질문을 보내고,
   글자가 오는 대로 한 글자씩 화면에 전달합니다.

   ★ 모델명·주소는 js/config.js 한 곳에만 있습니다. 이 파일은 그 값을 가져다 쓸 뿐입니다.
   ★ Gemini 3.x 계열은 temperature·top_p·top_k 설정이 사용 중단되어 보내지 않습니다.
   ========================================================================= */

var Gemini = (function () {

  /* -----------------------------------------------------------------------
     요청 하나 보내기 (스트리밍)
     옵션 : { apiKey, systemPrompt, question, onChunk(글자), onDone(), onError(한글오류) }
     ----------------------------------------------------------------------- */
  function 질문하기(옵션) {
    var 본문 = {
      systemInstruction: { parts: [{ text: 옵션.systemPrompt }] },
      contents: [
        { role: 'user', parts: [{ text: 옵션.question }] }
      ]
      // ★ temperature / topP / topK 는 넣지 않습니다 (Gemini 3.x 계열 사용 중단값)
    };

    var 컨트롤러 = new AbortController();

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
        if (!response.ok) {
          return response.json().catch(function () { return null; })
            .then(function (오류바디) {
              throw 오류만들기(response.status, 오류바디);
            });
        }
        return 스트림읽기(response, 옵션.onChunk);
      })
      .then(function () {
        옵션.onDone();
      })
      .catch(function (오류) {
        옵션.onError(한글오류문구(오류));
      });

    return 컨트롤러;
  }

  /* -----------------------------------------------------------------------
     SSE(Server-Sent Events) 형식의 스트림 응답을 한 줄씩 읽는다.
     ----------------------------------------------------------------------- */
  function 스트림읽기(response, onChunk) {
    var reader = response.body.getReader();
    var decoder = new TextDecoder('utf-8');
    var 버퍼 = '';

    function 한덩이씩() {
      return reader.read().then(function (결과) {
        if (결과.done) return;

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
